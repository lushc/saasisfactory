import { Handler } from 'aws-lambda';
import { MonitorEvent, ShutdownTimerState } from './types';
import { 
  getRunningTask, 
  getTaskPublicIp, 
  getParameterValue, 
  putParameterValue,
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
import { config } from '../../shared/config';
import { ApiTokenError, ServerNotRunningError } from '../../shared/errors';

const PARAMETER_NAMES = {
  serverAdminPassword: config.parameters.serverAdminPassword,
  apiToken: config.parameters.apiToken
};

/**
 * Ensure API token is valid and refresh if necessary
 */
async function ensureValidApiToken(apiClient: SatisfactoryApiClient): Promise<string> {
  let apiToken = await getParameterValue(PARAMETER_NAMES.apiToken);
  
  const isTokenValid = await apiClient.verifyAuthenticationToken(apiToken);
  
  if (!isTokenValid) {
    console.log('API token invalid, regenerating...');
    try {
      const adminPassword = await getParameterValue(PARAMETER_NAMES.serverAdminPassword);
      apiToken = await apiClient.passwordLogin(adminPassword);
      await putParameterValue(PARAMETER_NAMES.apiToken, apiToken);
      console.log('API token refreshed successfully');
    } catch (error) {
      console.error('Failed to refresh API token:', error);
      throw new ApiTokenError('Failed to refresh API token');
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
    await handleZeroPlayerCount(currentState, timeoutMinutes);
  } else {
    await handleActivePlayerCount(currentState, playerCount);
  }
}

/**
 * Handle logic when no players are connected
 */
async function handleZeroPlayerCount(
  currentState: ShutdownTimerState, 
  timeoutMinutes: number
): Promise<void> {
  if (!currentState.timerStarted) {
    // Start shutdown timer
    console.log(`No players connected, starting shutdown timer (${timeoutMinutes} minutes)`);
    await startShutdownTimer(0, timeoutMinutes);
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
        lastPlayerCount: 0
      });
    }
  }
}

/**
 * Handle logic when players are connected
 */
async function handleActivePlayerCount(
  currentState: ShutdownTimerState, 
  playerCount: number
): Promise<void> {
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

/**
 * Monitor service for handling server monitoring logic
 */
class MonitorService {
  private readonly timeoutMinutes: number;

  constructor() {
    this.timeoutMinutes = parseInt(process.env.SHUTDOWN_TIMEOUT_MINUTES || '10');
  }

  /**
   * Execute monitoring cycle
   */
  async executeMonitoringCycle(): Promise<void> {
    const runningTask = await getRunningTask();
    
    if (!runningTask) {
      console.log('No running task found, cleaning up timer state');
      await this.cleanupTimerState();
      return;
    }
    
    console.log(`Found running task: ${runningTask.taskArn}`);
    
    const publicIp = await getTaskPublicIp(runningTask);
    if (!publicIp) {
      throw new Error('Could not determine public IP for running task');
    }
    
    console.log(`Server running at ${publicIp}:7777`);
    
    const apiClient = new SatisfactoryApiClient(publicIp);
    const playerCount = await getCurrentPlayerCount(apiClient);
    
    await handleShutdownTimer(playerCount);
  }

  /**
   * Clean up timer state when server is not running
   */
  private async cleanupTimerState(): Promise<void> {
    await updateShutdownTimerState({
      id: 'singleton',
      timerStarted: null,
      shutdownTimeoutMinutes: this.timeoutMinutes,
      lastPlayerCount: 0,
      lastChecked: Date.now()
    });
  }
}

/**
 * Main Lambda handler
 */
export const handler: Handler<MonitorEvent, void> = async (event) => {
  console.log('Monitor Lambda triggered:', JSON.stringify(event, null, 2));
  
  try {
    const monitorService = new MonitorService();
    await monitorService.executeMonitoringCycle();
    console.log('Monitor Lambda completed successfully');
  } catch (error) {
    console.error('Monitor Lambda failed:', error);
    // Don't throw - let EventBridge retry on next schedule
  }
};