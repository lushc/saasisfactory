// API Router for Control Lambda
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
import { config } from '../../shared/config';
import { 
  AuthenticationError,
  ValidationError,
  SatisfactoryServerError
} from '../../shared/errors';
import { 
  createErrorResponse, 
  createSuccessResponse, 
  sanitizeInput 
} from '../../shared/error-handler';
import { validators } from '../../shared/validation';
import { getSecret, putSecret } from '../../shared/secret-manager';
import { HTTP_STATUS, ERROR_CODES } from '../../shared/constants';
import { 
  updateServiceDesiredCount, 
  getServiceTasks, 
  getTaskPublicIp, 
  waitForTaskRunning, 
  createMonitorRule, 
  deleteMonitorRule,
  getRunningTask,
  ensureValidApiToken,
  waitForServerReady,
  claimOrLoginToServer
} from './aws-utils';
import { SatisfactoryApiClient } from './satisfactory-api';

type RouteHandler = (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;

export class ApiRouter {
  private routes = new Map<string, RouteHandler>();

  constructor() {
    // Public routes (no authentication required)
    this.routes.set('POST:/auth/login', this.handleLogin.bind(this));
    
    // Protected routes (authentication required)
    this.routes.set('POST:/server/start', this.withAuth(this.handleServerStart.bind(this)));
    this.routes.set('POST:/server/stop', this.withAuth(this.handleServerStop.bind(this)));
    this.routes.set('GET:/server/status', this.withAuth(this.handleServerStatus.bind(this)));
    this.routes.set('GET:/server/client-password', this.withAuth(this.handleGetClientPassword.bind(this)));
    this.routes.set('POST:/server/client-password', this.withAuth(this.handleSetClientPassword.bind(this)));
  }

  /**
   * Authentication middleware wrapper
   */
  private withAuth(handler: RouteHandler): RouteHandler {
    return async (event: APIGatewayProxyEvent) => {
      try {
        await this.validateJwtToken(event);
        return handler(event);
      } catch (error) {
        if (error instanceof SatisfactoryServerError) {
          return createErrorResponse(error.statusCode, error.code, error.message);
        }
        return createErrorResponse(
          HTTP_STATUS.INTERNAL_SERVER_ERROR, 
          ERROR_CODES.AUTHENTICATION_ERROR, 
          'Authentication failed'
        );
      }
    };
  }

  /**
   * Route incoming requests to appropriate handlers
   */
  async route(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    try {
      const key = `${event.httpMethod}:${event.path}`;
      const handler = this.routes.get(key);
      
      if (!handler) {
        return createErrorResponse(
          HTTP_STATUS.NOT_FOUND, 
          ERROR_CODES.NOT_FOUND, 
          'Endpoint not found'
        );
      }
      
      return await handler(event);
    } catch (error) {
      console.error('Router error:', error);
      
      if (error instanceof SatisfactoryServerError) {
        return createErrorResponse(error.statusCode, error.code, error.message);
      }
      
      return createErrorResponse(
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        'INTERNAL_ERROR',
        'An unexpected error occurred'
      );
    }
  }

  /**
   * Validate JWT token from Authorization header
   */
  private async validateJwtToken(event: APIGatewayProxyEvent): Promise<void> {
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
      // Get JWT secret key (with caching)
      const jwtSecret = await getSecret(config.secrets.jwtSecret);
      
      // Verify JWT token
      jwt.verify(token, jwtSecret);
    } catch (error) {
      console.error('JWT validation error:', error);
      throw new AuthenticationError('Invalid or expired JWT token');
    }
  }

  /**
   * Handle login requests
   */
  private async handleLogin(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    if (!event.body) {
      throw new ValidationError('Request body is required');
    }

    const request: LoginRequest = JSON.parse(event.body);
    
    // Validate input
    validators.password().validate(request.password);
    
    // Sanitize input
    const sanitizedPassword = sanitizeInput(request.password);
    
    // Get admin password from Secrets Manager
    const adminPassword = await getSecret(config.secrets.adminPassword);
    
    if (sanitizedPassword !== adminPassword) {
      throw new AuthenticationError('Invalid password');
    }

    // Generate JWT token
    const jwtSecret = await getSecret(config.secrets.jwtSecret);
    const currentTime = Math.floor(Date.now() / 1000);
    
    const payload = {
      sub: 'admin' as const,
      iat: currentTime,
      exp: currentTime + config.jwt.expirationTime
    };
    
    const token = jwt.sign(payload, jwtSecret);
    
    const response: LoginResponse = {
      token,
      expiresAt: payload.exp
    };
    
    return createSuccessResponse(response);
  }

  /**
   * Handle server start requests
   */
  private async handleServerStart(): Promise<APIGatewayProxyResult> {
    const CLUSTER_NAME = config.aws.clusterName;
    const SERVICE_NAME = config.aws.serviceName;
    const MONITOR_LAMBDA_ARN = config.aws.monitorLambdaArn;

    // Update ECS service desired count to 1
    await updateServiceDesiredCount(CLUSTER_NAME, SERVICE_NAME, 1);
    
    // Wait for task to be running
    const task = await waitForTaskRunning(CLUSTER_NAME, SERVICE_NAME);
    
    // Get public IP
    const publicIp = await getTaskPublicIp(task.taskArn!);
    
    // Wait for server to be ready
    await waitForServerReady(publicIp);
    
    // Claim or login to server
    const adminToken = await claimOrLoginToServer(publicIp);
    
    // Store API token in Secrets Manager
    await putSecret(config.secrets.apiToken, adminToken);
    
    // Create EventBridge rule for monitoring
    await createMonitorRule(MONITOR_LAMBDA_ARN);
    
    const response: StartResponse = {
      message: 'Server started successfully',
      publicIp,
      port: config.server.port
    };
    
    return createSuccessResponse(response);
  }

  /**
   * Handle server stop requests
   */
  private async handleServerStop(): Promise<APIGatewayProxyResult> {
    const CLUSTER_NAME = config.aws.clusterName;
    const SERVICE_NAME = config.aws.serviceName;

    // Get running task
    const task = await getRunningTask(CLUSTER_NAME, SERVICE_NAME);
    
    if (task && task.publicIp) {
      // Ensure we have a valid API token
      const apiToken = await ensureValidApiToken(task.publicIp);
      
      // Create API client and shutdown server
      const apiClient = new SatisfactoryApiClient(task.publicIp, apiToken);
      await apiClient.shutdown();
    }
    
    // Update ECS service desired count to 0
    await updateServiceDesiredCount(CLUSTER_NAME, SERVICE_NAME, 0);
    
    // Delete EventBridge rule
    await deleteMonitorRule();
    
    const response: StopResponse = {
      message: 'Server stopped successfully'
    };
    
    return createSuccessResponse(response);
  }

  /**
   * Handle server status requests
   */
  private async handleServerStatus(): Promise<APIGatewayProxyResult> {
    const CLUSTER_NAME = config.aws.clusterName;
    const SERVICE_NAME = config.aws.serviceName;

    // Get current tasks
    const tasks = await getServiceTasks(CLUSTER_NAME, SERVICE_NAME);
    
    if (tasks.length === 0) {
      const response: StatusResponse = {
        serverState: 'offline',
        port: config.server.port
      };
      return createSuccessResponse(response);
    }
    
    const task = tasks[0];
    const serverState = task.lastStatus?.toLowerCase() as any;
    
    let response: StatusResponse = {
      serverState: serverState || 'offline',
      port: config.server.port
    };
    
    // If server is running, get additional details
    if (serverState === 'running' && task.publicIp) {
      try {
        const apiToken = await ensureValidApiToken(task.publicIp);
        const apiClient = new SatisfactoryApiClient(task.publicIp, apiToken);
        const serverState = await apiClient.queryServerState();
        
        response = {
          ...response,
          publicIp: task.publicIp,
          playerCount: serverState.playerCount,
          serverName: serverState.serverName,
          gamePhase: serverState.gamePhase
        };
      } catch (error) {
        console.error('Failed to get server details:', error);
        // Return basic status even if API call fails
        response.publicIp = task.publicIp;
      }
    }
    
    return createSuccessResponse(response);
  }

  /**
   * Handle get client password requests
   */
  private async handleGetClientPassword(): Promise<APIGatewayProxyResult> {
    const password = await getSecret(config.secrets.clientPassword);
    
    const response: ClientPasswordResponse = {
      password: password || null
    };
    
    return createSuccessResponse(response);
  }

  /**
   * Handle set client password requests
   */
  private async handleSetClientPassword(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    if (!event.body) {
      throw new ValidationError('Request body is required');
    }

    const request: SetClientPasswordRequest = JSON.parse(event.body);
    
    // Validate input
    validators.clientPassword().validate(request.password);
    
    // Sanitize input
    const sanitizedPassword = sanitizeInput(request.password);
    
    // Get running task to update server password
    const CLUSTER_NAME = config.aws.clusterName;
    const SERVICE_NAME = config.aws.serviceName;
    const task = await getRunningTask(CLUSTER_NAME, SERVICE_NAME);
    
    if (task && task.publicIp) {
      // Ensure we have a valid API token
      const apiToken = await ensureValidApiToken(task.publicIp);
      
      // Update server password
      const apiClient = new SatisfactoryApiClient(task.publicIp, apiToken);
      await apiClient.setClientPassword(sanitizedPassword);
    }
    
    // Store password in Secrets Manager
    await putSecret(config.secrets.clientPassword, sanitizedPassword);
    
    const response: SetClientPasswordResponse = {
      message: 'Client password updated successfully'
    };
    
    return createSuccessResponse(response);
  }
}