import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { 
  DynamoDBDocumentClient, 
  GetCommand, 
  PutCommand 
} from '@aws-sdk/lib-dynamodb';
import { ShutdownTimerState } from './types';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAME = process.env.SHUTDOWN_TIMER_TABLE || 'satisfactory-shutdown-timer';
const TIMER_ID = 'singleton';

/**
 * Get shutdown timer state from DynamoDB
 */
export async function getShutdownTimerState(): Promise<ShutdownTimerState> {
  try {
    const response = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { id: TIMER_ID }
    }));

    if (response.Item) {
      return response.Item as ShutdownTimerState;
    }

    // Return default state if no record exists
    return {
      id: TIMER_ID,
      timerStarted: null,
      shutdownTimeoutMinutes: parseInt(process.env.SHUTDOWN_TIMEOUT_MINUTES || '10'),
      lastPlayerCount: 0,
      lastChecked: Date.now()
    };
  } catch (error) {
    console.error('Failed to get shutdown timer state:', error);
    throw error;
  }
}

/**
 * Update shutdown timer state in DynamoDB
 */
export async function updateShutdownTimerState(state: ShutdownTimerState): Promise<void> {
  try {
    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        ...state,
        lastChecked: Date.now()
      }
    }));
  } catch (error) {
    console.error('Failed to update shutdown timer state:', error);
    throw error;
  }
}

/**
 * Start shutdown timer
 */
export async function startShutdownTimer(
  playerCount: number, 
  timeoutMinutes: number
): Promise<ShutdownTimerState> {
  const state: ShutdownTimerState = {
    id: TIMER_ID,
    timerStarted: Date.now(),
    shutdownTimeoutMinutes: timeoutMinutes,
    lastPlayerCount: playerCount,
    lastChecked: Date.now()
  };

  await updateShutdownTimerState(state);
  console.log(`Shutdown timer started: ${timeoutMinutes} minutes`);
  return state;
}

/**
 * Cancel shutdown timer
 */
export async function cancelShutdownTimer(playerCount: number): Promise<ShutdownTimerState> {
  const state: ShutdownTimerState = {
    id: TIMER_ID,
    timerStarted: null,
    shutdownTimeoutMinutes: parseInt(process.env.SHUTDOWN_TIMEOUT_MINUTES || '10'),
    lastPlayerCount: playerCount,
    lastChecked: Date.now()
  };

  await updateShutdownTimerState(state);
  console.log('Shutdown timer cancelled');
  return state;
}

/**
 * Check if shutdown timer has expired
 */
export function isTimerExpired(state: ShutdownTimerState): boolean {
  if (!state.timerStarted) {
    return false;
  }

  const elapsedMs = Date.now() - state.timerStarted;
  const timeoutMs = state.shutdownTimeoutMinutes * 60 * 1000;
  
  return elapsedMs >= timeoutMs;
}

/**
 * Get remaining time in minutes
 */
export function getRemainingMinutes(state: ShutdownTimerState): number {
  if (!state.timerStarted) {
    return 0;
  }

  const elapsedMs = Date.now() - state.timerStarted;
  const timeoutMs = state.shutdownTimeoutMinutes * 60 * 1000;
  const remainingMs = Math.max(0, timeoutMs - elapsedMs);
  
  return Math.ceil(remainingMs / (60 * 1000));
}