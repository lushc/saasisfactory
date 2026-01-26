import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Task } from '@aws-sdk/client-ecs';
import jwt from 'jsonwebtoken';
import { 
  LoginRequest, 
  LoginResponse, 
  StartResponse, 
  StopResponse, 
  StatusResponse,
  ClientPasswordResponse,
  SetClientPasswordRequest,
  SetClientPasswordResponse
} from './types';
import { ErrorResponse } from '../../shared/types';
import { config } from '../../shared/config';
import { 
  SatisfactoryServerError,
  ServerNotRunningError,
  AuthenticationError,
  ValidationError,
  ServerStartFailedError,
  ServerStopFailedError
} from '../../shared/errors';
import { 
  getSecret, 
  putSecret, 
  updateServiceDesiredCount, 
  getServiceTasks, 
  getTaskPublicIp, 
  waitForTaskRunning, 
  generateSecurePassword, 
  createMonitorRule, 
  deleteMonitorRule,
  getRunningTask,
  ensureValidApiToken,
  waitForServerReady,
  claimOrLoginToServer
} from './aws-utils';
import { SatisfactoryApiClient } from './satisfactory-api';

const CLUSTER_NAME = config.aws.clusterName;
const SERVICE_NAME = config.aws.serviceName;
const MONITOR_LAMBDA_ARN = config.aws.monitorLambdaArn;

/**
 * Validate JWT token from Authorization header
 */
async function validateJwtToken(event: APIGatewayProxyEvent): Promise<void> {
  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  
  if (!authHeader) {
    throw new AuthenticationError('Authorization header is required');
  }
  
  if (!authHeader.startsWith('Bearer ')) {
    throw new AuthenticationError('Invalid authorization header format');
  }
  
  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  
  if (!token || token.trim() === '') {
    throw new AuthenticationError('JWT token is required');
  }
  
  try {
    // Get JWT secret key
    const jwtSecret = await getSecret(config.secrets.jwtSecret);
    
    // Verify JWT token
    jwt.verify(token, jwtSecret);
  } catch (error) {
    console.error('JWT validation error:', error);
    throw new AuthenticationError('Invalid or expired JWT token');
  }
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    const path = event.path;
    const method = event.httpMethod;
    
    // Route requests to appropriate handlers
    if (method === 'POST' && path === '/auth/login') {
      return await handleLogin(event);
    } else if (method === 'POST' && path === '/server/start') {
      await validateJwtToken(event);
      return await handleServerStart(event);
    } else if (method === 'POST' && path === '/server/stop') {
      await validateJwtToken(event);
      return await handleServerStop(event);
    } else if (method === 'GET' && path === '/server/status') {
      await validateJwtToken(event);
      return await handleServerStatus(event);
    } else if (method === 'GET' && path === '/server/client-password') {
      await validateJwtToken(event);
      return await handleGetClientPassword(event);
    } else if (method === 'POST' && path === '/server/client-password') {
      await validateJwtToken(event);
      return await handleSetClientPassword(event);
    } else {
      return createErrorResponse(404, 'NOT_FOUND', 'Endpoint not found');
    }
  } catch (error) {
    console.error('Unhandled error:', error);
    
    if (error instanceof SatisfactoryServerError) {
      return createErrorResponse(error.statusCode, error.code, error.message);
    }
    
    return createErrorResponse(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
};

/**
 * Handle POST /auth/login
 */
async function handleLogin(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    if (!event.body) {
      throw new ValidationError('Request body is required');
    }

    let request: LoginRequest;
    try {
      request = JSON.parse(event.body);
    } catch (error) {
      throw new ValidationError('Invalid JSON in request body');
    }
    
    if (!request.password) {
      throw new ValidationError('Password is required');
    }

    // Get admin password from Secrets Manager
    const storedPassword = await getSecret(config.secrets.adminPassword);
    
    // Validate password
    if (request.password !== storedPassword) {
      throw new AuthenticationError('Invalid password');
    }

    // Get JWT secret key
    const jwtSecret = await getSecret(config.secrets.jwtSecret);
    
    // Generate JWT token with 1-hour expiration
    const now = Math.floor(Date.now() / 1000);
    const token = jwt.sign(
      {
        sub: 'admin',
        iat: now,
        exp: now + config.jwt.expirationTime
      },
      jwtSecret
    );

    const response: LoginResponse = {
      token,
      expiresIn: config.jwt.expirationTime
    };

    return createSuccessResponse(response);
  } catch (error) {
    console.error('Login error:', error);
    
    if (error instanceof SatisfactoryServerError) {
      return createErrorResponse(error.statusCode, error.code, error.message);
    }
    
    return createErrorResponse(500, 'AUTHENTICATION_FAILED', 'Authentication failed');
  }
}

/**
 * Handle POST /server/start
 */
async function handleServerStart(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    console.log('Starting server...');
    
    // Update ECS service desired count to 1
    await updateServiceDesiredCount(CLUSTER_NAME, SERVICE_NAME, 1);
    
    // Wait for task to start and get running task
    const runningTask = await waitForRunningTask();
    
    // Get task public IP
    const publicIp = await getTaskPublicIp(runningTask);
    if (!publicIp) {
      throw new ServerStartFailedError('Could not determine server IP address');
    }
    
    console.log(`Server running at IP: ${publicIp}`);
    
    // Wait for Satisfactory Server API to become accessible
    const apiClient = new SatisfactoryApiClient(publicIp);
    await waitForServerReady(apiClient);
    
    // Claim server or login with existing credentials
    const { adminToken } = await claimOrLoginToServer(apiClient);
    
    // Store API token in Secrets Manager
    await putSecret(config.secrets.apiToken, adminToken);
    
    // Create EventBridge rule for Monitor Lambda
    try {
      await createMonitorRule(config.monitor.ruleName, MONITOR_LAMBDA_ARN);
      console.log('Monitor rule created');
    } catch (error) {
      console.warn('Failed to create monitor rule:', error);
      // Don't fail the entire operation for this
    }
    
    const response: StartResponse = {
      status: 'running',
      taskArn: runningTask.taskArn,
      publicIp
    };
    
    return createSuccessResponse(response);
  } catch (error) {
    console.error('Server start error:', error);
    
    if (error instanceof SatisfactoryServerError) {
      return createErrorResponse(error.statusCode, error.code, error.message);
    }
    
    return createErrorResponse(500, 'SERVER_START_FAILED', 'Failed to start server');
  }
}

/**
 * Wait for a task to reach RUNNING state
 */
async function waitForRunningTask(): Promise<Task> {
  // Get running tasks to find the new task
  let tasks = await getServiceTasks(CLUSTER_NAME, SERVICE_NAME);
  let runningTask = tasks.find(task => task.lastStatus === 'RUNNING');
  
  if (!runningTask) {
    // Wait for task to reach RUNNING state
    console.log('Waiting for task to start...');
    const pendingTask = tasks.find(task => task.lastStatus === 'PENDING' || task.lastStatus === 'PROVISIONING');
    
    if (pendingTask && pendingTask.taskArn) {
      runningTask = await waitForTaskRunning(CLUSTER_NAME, pendingTask.taskArn);
    } else {
      // Wait a bit and check again
      await new Promise(resolve => setTimeout(resolve, 10000));
      tasks = await getServiceTasks(CLUSTER_NAME, SERVICE_NAME);
      runningTask = tasks.find(task => task.lastStatus === 'RUNNING');
      
      if (!runningTask) {
        throw new ServerStartFailedError('Task failed to start');
      }
    }
  }
  
  return runningTask;
}

/**
 * Handle POST /server/stop
 */
async function handleServerStop(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    console.log('Stopping server...');
    
    // Get current running task
    const runningTask = await getRunningTask();
    
    if (!runningTask) {
      throw new ServerNotRunningError();
    }
    
    // Attempt graceful shutdown via API
    await attemptGracefulShutdown(runningTask);
    
    // Update ECS service desired count to 0
    console.log('Updating ECS service desired count to 0...');
    await updateServiceDesiredCount(CLUSTER_NAME, SERVICE_NAME, 0);
    
    // Delete EventBridge rule for Monitor Lambda
    try {
      await deleteMonitorRule(config.monitor.ruleName);
      console.log('Monitor rule deleted');
    } catch (error) {
      console.warn('Failed to delete monitor rule:', error);
      // Don't fail the entire operation for this
    }
    
    const response: StopResponse = {
      status: 'stopping'
    };
    
    return createSuccessResponse(response);
  } catch (error) {
    console.error('Server stop error:', error);
    
    if (error instanceof SatisfactoryServerError) {
      return createErrorResponse(error.statusCode, error.code, error.message);
    }
    
    return createErrorResponse(500, 'SERVER_STOP_FAILED', 'Failed to stop server');
  }
}

/**
 * Attempt graceful shutdown via Satisfactory Server API
 */
async function attemptGracefulShutdown(runningTask: Task): Promise<void> {
  const publicIp = await getTaskPublicIp(runningTask);
  if (!publicIp) {
    console.warn('Could not determine server IP, proceeding with ECS stop only');
    return;
  }

  try {
    const apiClient = new SatisfactoryApiClient(publicIp);
    const apiToken = await ensureValidApiToken(apiClient);
    
    // Call Shutdown API to save game
    console.log('Calling Satisfactory Server shutdown API...');
    await apiClient.shutdown(apiToken);
    console.log('Shutdown API called successfully');
    
    // Wait a moment for the shutdown to process
    await new Promise(resolve => setTimeout(resolve, 5000));
  } catch (error) {
    console.warn('Failed to call Satisfactory Server shutdown API:', error);
    // Continue with ECS stop even if API call fails
  }
}

/**
 * Handle GET /server/status
 */
async function handleServerStatus(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    console.log('Getting server status...');
    
    // Query ECS for task status
    const tasks = await getServiceTasks(CLUSTER_NAME, SERVICE_NAME);
    const runningTask = tasks.find(task => task.lastStatus === 'RUNNING');
    const pendingTask = tasks.find(task => task.lastStatus === 'PENDING' || task.lastStatus === 'PROVISIONING');
    
    let serverState: 'offline' | 'starting' | 'running' | 'stopping';
    let publicIp: string | undefined;
    let playerCount: number | undefined;
    let serverName: string | undefined;
    let gamePhase: string | undefined;
    
    if (runningTask) {
      serverState = 'running';
      publicIp = await getTaskPublicIp(runningTask);
      
      // If running, get detailed server information
      if (publicIp) {
        try {
          const gameState = await getServerGameState(publicIp);
          playerCount = gameState.playerCount;
          serverName = gameState.serverName;
          gamePhase = gameState.gamePhase;
          
          console.log(`Server status: ${playerCount} players, phase: ${gamePhase}`);
        } catch (error) {
          console.warn('Failed to get detailed server status:', error);
          // Still return basic status even if API call fails
        }
      }
    } else if (pendingTask) {
      serverState = 'starting';
    } else {
      // Check if we're in the process of stopping
      const stoppingTask = tasks.find(task => task.lastStatus === 'STOPPING');
      serverState = stoppingTask ? 'stopping' : 'offline';
    }
    
    const response: StatusResponse = {
      serverState,
      publicIp,
      port: config.server.port,
      playerCount,
      serverName,
      gamePhase,
      lastUpdated: new Date().toISOString()
    };
    
    return createSuccessResponse(response);
  } catch (error) {
    console.error('Server status error:', error);
    
    if (error instanceof SatisfactoryServerError) {
      return createErrorResponse(error.statusCode, error.code, error.message);
    }
    
    return createErrorResponse(500, 'SERVER_STATUS_FAILED', 'Failed to get server status');
  }
}

/**
 * Get server game state information
 */
async function getServerGameState(publicIp: string): Promise<{
  playerCount: number;
  serverName: string;
  gamePhase: string;
}> {
  const apiClient = new SatisfactoryApiClient(publicIp);
  const apiToken = await ensureValidApiToken(apiClient);
  
  // Call QueryServerState to get player count and game state
  const serverStateData = await apiClient.queryServerState(apiToken);
  
  return {
    playerCount: serverStateData.serverGameState.numConnectedPlayers,
    serverName: serverStateData.serverGameState.activeSessionName || 'Satisfactory On-Demand Server',
    gamePhase: serverStateData.serverGameState.gamePhase
  };
}

/**
 * Handle GET /server/client-password
 */
async function handleGetClientPassword(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    console.log('Getting client password...');
    
    // Verify server is running
    const runningTask = await getRunningTask();
    if (!runningTask) {
      throw new ServerNotRunningError();
    }
    
    const publicIp = await getTaskPublicIp(runningTask);
    if (!publicIp) {
      throw new ServerStartFailedError('Could not determine server IP address');
    }
    
    // Ensure API token is valid
    const apiClient = new SatisfactoryApiClient(publicIp);
    await ensureValidApiToken(apiClient);
    
    // Retrieve client password from Secrets Manager
    let clientPassword: string | null = null;
    try {
      clientPassword = await getSecret(config.secrets.clientPassword);
      // If the password is empty string, treat it as null (no password protection)
      if (clientPassword === '') {
        clientPassword = null;
      }
    } catch (error) {
      // Secret doesn't exist or is empty, which means no password is set
      console.log('No client password set');
      clientPassword = null;
    }
    
    const response: ClientPasswordResponse = {
      password: clientPassword
    };
    
    return createSuccessResponse(response);
  } catch (error) {
    console.error('Get client password error:', error);
    
    if (error instanceof SatisfactoryServerError) {
      return createErrorResponse(error.statusCode, error.code, error.message);
    }
    
    return createErrorResponse(500, 'GET_CLIENT_PASSWORD_FAILED', 'Failed to retrieve client password');
  }
}

/**
 * Handle POST /server/client-password
 */
async function handleSetClientPassword(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    console.log('Setting client password...');
    
    if (!event.body) {
      throw new ValidationError('Request body is required');
    }
    
    let request: SetClientPasswordRequest;
    try {
      request = JSON.parse(event.body);
    } catch (error) {
      throw new ValidationError('Invalid JSON in request body');
    }
    
    if (typeof request.password !== 'string') {
      throw new ValidationError('Password must be a string');
    }
    
    // Verify server is running
    const runningTask = await getRunningTask();
    if (!runningTask) {
      throw new ServerNotRunningError();
    }
    
    const publicIp = await getTaskPublicIp(runningTask);
    if (!publicIp) {
      throw new ServerStartFailedError('Could not determine server IP address');
    }
    
    // Update password via API and Secrets Manager
    const apiClient = new SatisfactoryApiClient(publicIp);
    const apiToken = await ensureValidApiToken(apiClient);
    
    // Call SetClientPassword API
    await apiClient.setClientPassword(apiToken, request.password);
    console.log('Client password updated on server');
    
    // Update password in Secrets Manager
    await putSecret(config.secrets.clientPassword, request.password);
    console.log('Client password updated in Secrets Manager');
    
    const response: SetClientPasswordResponse = {
      success: true,
      message: request.password === '' ? 'Password protection removed' : 'Password updated successfully'
    };
    
    return createSuccessResponse(response);
  } catch (error) {
    console.error('Set client password error:', error);
    
    if (error instanceof SatisfactoryServerError) {
      return createErrorResponse(error.statusCode, error.code, error.message);
    }
    
    return createErrorResponse(500, 'SET_CLIENT_PASSWORD_FAILED', 'Failed to update client password');
  }
}

/**
 * Create standardized success response
 */
function createSuccessResponse<T>(data: T): APIGatewayProxyResult {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
    },
    body: JSON.stringify(data)
  };
}

/**
 * Create standardized error response
 */
function createErrorResponse(
  statusCode: number, 
  error: string, 
  message: string, 
  details?: unknown
): APIGatewayProxyResult {
  const errorResponse: ErrorResponse = {
    error,
    message,
    details,
    timestamp: new Date().toISOString()
  };

  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
    },
    body: JSON.stringify(errorResponse)
  };
}