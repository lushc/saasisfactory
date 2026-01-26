import { Handler } from 'aws-lambda';
import { MonitorEvent } from './types';
import { 
  getRunningTask, 
  getTaskPublicIp, 
  getSecret, 
  putSecret,
  triggerServerShutdown 
} from './aws-utils';
import { 
  getShutdownTimerState, 
  startShutdownTimer, 
  cancelShutdownTimer, 
  updateShutdownTimerState,
  isTimerExpired,
  getRemainingMinutes 
} from './dynamodb-utils';
import { SatisfactoryApiClient } from './satisfactory-api';

const SECRET_NAMES = {
  serverAdminPassword: process.env.SERVER_ADMIN_PASSWORD_SECRET || 'satisfactory-server-admin-password',
  apiToken: process.env.API_TOKEN_SECRET || 'satisfactory-api-token'
};

/**
 * Ensure API token is valid and refresh if necessary
 */
async function ensureValidApiToken(apiClient: SatisfactoryApiClient): Promise<string> {
  let apiToken = await getSecret(SECRET_NAMES.apiToken);
  
  const isTokenValid = await apiClient.verifyAuthenticationToken(apiToken);
  
  if (!isTokenValid) {
    console.log('API token invalid, regenerating...');
    try {
      const adminPassword = await getSecret(SECRET_NAMES.serverAdminPassword);
      apiToken = await apiClient.passwordLogin(adminPassword);
      await putSecret(SECRET_NAMES.apiToken, apiToken);
      console.log('API token refreshed successfully');
    } catch (error) {
      console.error('Failed to refresh API token:', error);
      throw new Error('Failed to refresh API token');
    }
  }
  
  return apiToken;
}

/**
 * Get current player count from Satisfactory Server
 */
async function getCurrentPlayerCount(apiClient: SatisfactoryApiClient): Promise<number> {
  try {
    const validToken = await ensureValidApiToken(apiClient);
    const serverState = await apiClient.queryServerState(validToken);
    return serverState.serverGameState.numConnectedPlayers;
  } catch (error) {
    console.error('Failed to get player count:', error);
    throw error;
  }
}

/**
 * Handle shutdown timer logic based on player count
 */
async function handleShutdownTimer(playerCount: number): Promise<void> {
  const currentState = await getShutdownTimerState();
  const timeoutMinutes = parseInt(process.env.SHUTDOWN_TIMEOUT_MINUTES || '10');
  
  console.log(`Current player count: ${playerCount}, Previous: ${currentState.lastPlayerCount}`);
  
  if (playerCount === 0) {
    if (!currentState.timerStarted) {
      // Start shutdown timer
      console.log(`No players connected, starting shutdown timer (${timeoutMinutes} minutes)`);
      await startShutdownTimer(playerCount, timeoutMinutes);
    } else {
      // Check if timer has expired
      if (isTimerExpired(currentState)) {
        console.log('Shutdown timer expired, triggering server shutdown');
        await triggerServerShutdown();
        return;
      } else {
        // Update state with current player count
        const remainingMinutes = getRemainingMinutes(currentState);
        console.log(`Shutdown timer active, ${remainingMinutes} minutes remaining`);
        await updateShutdownTimerState({
          ...currentState,
          lastPlayerCount: playerCount
        });
      }
    }
  } else {
    if (currentState.timerStarted) {
      // Cancel shutdown timer - players have connected
      console.log(`Players connected (${playerCount}), cancelling shutdown timer`);
      await cancelShutdownTimer(playerCount);
    } else {
      // Just update the player count
      await updateShutdownTimerState({
        ...currentState,
        lastPlayerCount: playerCount
      });
    }
  }
}

/**
 * Main Lambda handler
 */
export const handler: Handler<MonitorEvent, void> = async (event, context) => {
  console.log('Monitor Lambda triggered:', JSON.stringify(event, null, 2));
  
  try {
    // Check if ECS task is running
    const runningTask = await getRunningTask();
    
    if (!runningTask) {
      console.log('No running task found, exiting monitor');
      // Clean up timer state since server is not running
      await updateShutdownTimerState({
        id: 'singleton',
        timerStarted: null,
        shutdownTimeoutMinutes: parseInt(process.env.SHUTDOWN_TIMEOUT_MINUTES || '10'),
        lastPlayerCount: 0,
        lastChecked: Date.now()
      });
      return;
    }
    
    console.log(`Found running task: ${runningTask.taskArn}`);
    
    // Get task public IP
    const publicIp = await getTaskPublicIp(runningTask);
    if (!publicIp) {
      console.error('Could not determine public IP for running task');
      return;
    }
    
    console.log(`Server running at ${publicIp}:7777`);
    
    // Create API client and get player count
    const apiClient = new SatisfactoryApiClient(publicIp);
    const playerCount = await getCurrentPlayerCount(apiClient);
    
    // Handle shutdown timer logic
    await handleShutdownTimer(playerCount);
    
    console.log('Monitor Lambda completed successfully');
    
  } catch (error) {
    console.error('Monitor Lambda failed:', error);
    
    // Don't throw the error - we want the monitor to continue running
    // Log the error and let EventBridge retry on the next schedule
  }
};