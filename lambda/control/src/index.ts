import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
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
import { 
  getSecret, 
  putSecret, 
  updateServiceDesiredCount, 
  getServiceTasks, 
  getTaskPublicIp, 
  waitForTaskRunning, 
  generateSecurePassword, 
  createMonitorRule, 
  deleteMonitorRule 
} from './aws-utils';
import { SatisfactoryApiClient } from './satisfactory-api';

const CLUSTER_NAME = process.env.CLUSTER_NAME || 'satisfactory-cluster';
const SERVICE_NAME = process.env.SERVICE_NAME || 'satisfactory-service';
const MONITOR_LAMBDA_ARN = process.env.MONITOR_LAMBDA_ARN || '';

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
      return await handleServerStart(event);
    } else if (method === 'POST' && path === '/server/stop') {
      return await handleServerStop(event);
    } else if (method === 'GET' && path === '/server/status') {
      return await handleServerStatus(event);
    } else if (method === 'GET' && path === '/server/client-password') {
      return await handleGetClientPassword(event);
    } else if (method === 'POST' && path === '/server/client-password') {
      return await handleSetClientPassword(event);
    } else {
      return createErrorResponse(404, 'Not Found', 'Endpoint not found');
    }
  } catch (error) {
    console.error('Unhandled error:', error);
    return createErrorResponse(500, 'Internal Server Error', 'An unexpected error occurred');
  }
};

/**
 * Handle POST /auth/login
 */
async function handleLogin(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    if (!event.body) {
      return createErrorResponse(400, 'Bad Request', 'Request body is required');
    }

    const request: LoginRequest = JSON.parse(event.body);
    
    if (!request.password) {
      return createErrorResponse(400, 'Bad Request', 'Password is required');
    }

    // Get admin password from Secrets Manager
    const storedPassword = await getSecret('satisfactory-admin-password');
    
    // Validate password
    if (request.password !== storedPassword) {
      return createErrorResponse(401, 'Unauthorized', 'Invalid password');
    }

    // Get JWT secret key
    const jwtSecret = await getSecret('satisfactory-jwt-secret');
    
    // Generate JWT token with 1-hour expiration
    const now = Math.floor(Date.now() / 1000);
    const token = jwt.sign(
      {
        sub: 'admin',
        iat: now,
        exp: now + 3600 // 1 hour
      },
      jwtSecret
    );

    const response: LoginResponse = {
      token,
      expiresIn: 3600
    };

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
      },
      body: JSON.stringify(response)
    };
  } catch (error) {
    console.error('Login error:', error);
    return createErrorResponse(500, 'Internal Server Error', 'Authentication failed');
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
          return createErrorResponse(500, 'Server Start Failed', 'Task failed to start');
        }
      }
    }
    
    // Get task public IP
    const publicIp = getTaskPublicIp(runningTask);
    if (!publicIp) {
      return createErrorResponse(500, 'Server Start Failed', 'Could not determine server IP address');
    }
    
    console.log(`Server running at IP: ${publicIp}`);
    
    // Wait for Satisfactory Server API to become accessible
    const apiClient = new SatisfactoryApiClient(publicIp);
    let serverReady = false;
    let attempts = 0;
    const maxAttempts = 30; // 5 minutes with 10-second intervals
    
    while (!serverReady && attempts < maxAttempts) {
      try {
        console.log(`Checking server API readiness (attempt ${attempts + 1}/${maxAttempts})...`);
        await apiClient.passwordlessLogin();
        serverReady = true;
        console.log('Server API is ready');
      } catch (error) {
        attempts++;
        if (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
        }
      }
    }
    
    if (!serverReady) {
      return createErrorResponse(500, 'Server Start Failed', 'Server API did not become accessible within timeout');
    }
    
    // Check if server is claimed by trying to get existing admin password
    let adminPassword: string;
    let adminToken: string;
    
    try {
      adminPassword = await getSecret('satisfactory-server-admin-password');
      console.log('Server already claimed, logging in with existing password');
      
      // Server is already claimed, use password login
      adminToken = await apiClient.passwordLogin(adminPassword);
    } catch (error) {
      console.log('Server not claimed yet, claiming server...');
      
      // Server is unclaimed, claim it
      // Generate secure 64-character admin password
      adminPassword = generateSecurePassword(64);
      
      // Get InitialAdmin token
      const initialAdminToken = await apiClient.passwordlessLogin();
      
      // Claim server with admin password
      adminToken = await apiClient.claimServer(initialAdminToken, adminPassword);
      
      // Store admin password in Secrets Manager
      await putSecret('satisfactory-server-admin-password', adminPassword);
      console.log('Server claimed successfully');
    }
    
    // Store API token in Secrets Manager
    await putSecret('satisfactory-api-token', adminToken);
    
    // Create EventBridge rule for Monitor Lambda
    const ruleName = 'satisfactory-monitor-rule';
    try {
      await createMonitorRule(ruleName, MONITOR_LAMBDA_ARN);
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
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
      },
      body: JSON.stringify(response)
    };
  } catch (error) {
    console.error('Server start error:', error);
    return createErrorResponse(500, 'Server Start Failed', 'Failed to start server');
  }
}

/**
 * Handle POST /server/stop
 */
async function handleServerStop(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    console.log('Stopping server...');
    
    // Get current tasks to find the running server
    const tasks = await getServiceTasks(CLUSTER_NAME, SERVICE_NAME);
    const runningTask = tasks.find(task => task.lastStatus === 'RUNNING');
    
    if (!runningTask) {
      console.log('No running server found');
      return createErrorResponse(400, 'Bad Request', 'Server is not currently running');
    }
    
    // Get task public IP
    const publicIp = getTaskPublicIp(runningTask);
    if (!publicIp) {
      console.warn('Could not determine server IP, proceeding with ECS stop only');
    } else {
      try {
        // Retrieve Satisfactory Server API token from Secrets Manager
        let apiToken = await getSecret('satisfactory-api-token');
        const apiClient = new SatisfactoryApiClient(publicIp);
        
        // Verify token with VerifyAuthenticationToken
        const isTokenValid = await apiClient.verifyAuthenticationToken(apiToken);
        
        if (!isTokenValid) {
          console.log('API token invalid, regenerating...');
          // Token is invalid, regenerate via PasswordLogin
          const adminPassword = await getSecret('satisfactory-server-admin-password');
          apiToken = await apiClient.passwordLogin(adminPassword);
          
          // Update token in Secrets Manager
          await putSecret('satisfactory-api-token', apiToken);
        }
        
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
    
    // Update ECS service desired count to 0
    console.log('Updating ECS service desired count to 0...');
    await updateServiceDesiredCount(CLUSTER_NAME, SERVICE_NAME, 0);
    
    // Delete EventBridge rule for Monitor Lambda
    const ruleName = 'satisfactory-monitor-rule';
    try {
      await deleteMonitorRule(ruleName);
      console.log('Monitor rule deleted');
    } catch (error) {
      console.warn('Failed to delete monitor rule:', error);
      // Don't fail the entire operation for this
    }
    
    const response: StopResponse = {
      status: 'stopping'
    };
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
      },
      body: JSON.stringify(response)
    };
  } catch (error) {
    console.error('Server stop error:', error);
    return createErrorResponse(500, 'Server Stop Failed', 'Failed to stop server');
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
      publicIp = getTaskPublicIp(runningTask);
      
      // If running, retrieve API token and verify, then get game state
      if (publicIp) {
        try {
          let apiToken = await getSecret('satisfactory-api-token');
          const apiClient = new SatisfactoryApiClient(publicIp);
          
          // Verify token with VerifyAuthenticationToken
          const isTokenValid = await apiClient.verifyAuthenticationToken(apiToken);
          
          if (!isTokenValid) {
            console.log('API token invalid, regenerating...');
            // Token is invalid, regenerate via PasswordLogin
            const adminPassword = await getSecret('satisfactory-server-admin-password');
            apiToken = await apiClient.passwordLogin(adminPassword);
            
            // Update token in Secrets Manager
            await putSecret('satisfactory-api-token', apiToken);
          }
          
          // Call QueryServerState to get player count and game state
          const serverStateData = await apiClient.queryServerState(apiToken);
          playerCount = serverStateData.serverGameState.numConnectedPlayers;
          serverName = serverStateData.serverGameState.activeSessionName || 'Satisfactory On-Demand Server';
          gamePhase = serverStateData.serverGameState.gamePhase;
          
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
      if (stoppingTask) {
        serverState = 'stopping';
      } else {
        serverState = 'offline';
      }
    }
    
    const response: StatusResponse = {
      serverState,
      publicIp,
      port: 7777,
      playerCount,
      serverName,
      gamePhase,
      lastUpdated: new Date().toISOString()
    };
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
      },
      body: JSON.stringify(response)
    };
  } catch (error) {
    console.error('Server status error:', error);
    return createErrorResponse(500, 'Server Status Failed', 'Failed to get server status');
  }
}

/**
 * Handle GET /server/client-password
 */
async function handleGetClientPassword(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    console.log('Getting client password...');
    
    // First verify that the server is running and we can access the API
    const tasks = await getServiceTasks(CLUSTER_NAME, SERVICE_NAME);
    const runningTask = tasks.find(task => task.lastStatus === 'RUNNING');
    
    if (!runningTask) {
      return createErrorResponse(400, 'Bad Request', 'Server is not currently running');
    }
    
    const publicIp = getTaskPublicIp(runningTask);
    if (!publicIp) {
      return createErrorResponse(500, 'Server Error', 'Could not determine server IP address');
    }
    
    // Retrieve Satisfactory Server API token from Secrets Manager
    let apiToken = await getSecret('satisfactory-api-token');
    const apiClient = new SatisfactoryApiClient(publicIp);
    
    // Verify token with VerifyAuthenticationToken
    const isTokenValid = await apiClient.verifyAuthenticationToken(apiToken);
    
    if (!isTokenValid) {
      console.log('API token invalid, regenerating...');
      // Token is invalid, regenerate via PasswordLogin
      const adminPassword = await getSecret('satisfactory-server-admin-password');
      apiToken = await apiClient.passwordLogin(adminPassword);
      
      // Update token in Secrets Manager
      await putSecret('satisfactory-api-token', apiToken);
    }
    
    // Retrieve client password from Secrets Manager
    let clientPassword: string | null = null;
    try {
      clientPassword = await getSecret('satisfactory-client-password');
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
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
      },
      body: JSON.stringify(response)
    };
  } catch (error) {
    console.error('Get client password error:', error);
    return createErrorResponse(500, 'Get Client Password Failed', 'Failed to retrieve client password');
  }
}

/**
 * Handle POST /server/client-password
 */
async function handleSetClientPassword(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    console.log('Setting client password...');
    
    if (!event.body) {
      return createErrorResponse(400, 'Bad Request', 'Request body is required');
    }
    
    const request: SetClientPasswordRequest = JSON.parse(event.body);
    
    if (typeof request.password !== 'string') {
      return createErrorResponse(400, 'Bad Request', 'Password must be a string');
    }
    
    // First verify that the server is running and we can access the API
    const tasks = await getServiceTasks(CLUSTER_NAME, SERVICE_NAME);
    const runningTask = tasks.find(task => task.lastStatus === 'RUNNING');
    
    if (!runningTask) {
      return createErrorResponse(400, 'Bad Request', 'Server is not currently running');
    }
    
    const publicIp = getTaskPublicIp(runningTask);
    if (!publicIp) {
      return createErrorResponse(500, 'Server Error', 'Could not determine server IP address');
    }
    
    // Retrieve Satisfactory Server API token from Secrets Manager
    let apiToken = await getSecret('satisfactory-api-token');
    const apiClient = new SatisfactoryApiClient(publicIp);
    
    // Verify token with VerifyAuthenticationToken
    const isTokenValid = await apiClient.verifyAuthenticationToken(apiToken);
    
    if (!isTokenValid) {
      console.log('API token invalid, regenerating...');
      // Token is invalid, regenerate via PasswordLogin
      const adminPassword = await getSecret('satisfactory-server-admin-password');
      apiToken = await apiClient.passwordLogin(adminPassword);
      
      // Update token in Secrets Manager
      await putSecret('satisfactory-api-token', apiToken);
    }
    
    // Call SetClientPassword API
    await apiClient.setClientPassword(apiToken, request.password);
    console.log('Client password updated on server');
    
    // Update password in Secrets Manager
    await putSecret('satisfactory-client-password', request.password);
    console.log('Client password updated in Secrets Manager');
    
    const response: SetClientPasswordResponse = {
      success: true,
      message: request.password === '' ? 'Password protection removed' : 'Password updated successfully'
    };
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
      },
      body: JSON.stringify(response)
    };
  } catch (error) {
    console.error('Set client password error:', error);
    return createErrorResponse(500, 'Set Client Password Failed', 'Failed to update client password');
  }
}

/**
 * Create standardized error response
 */
function createErrorResponse(
  statusCode: number, 
  error: string, 
  message: string, 
  details?: any
): APIGatewayProxyResult {
  const errorResponse: ErrorResponse = {
    error,
    message,
    details
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