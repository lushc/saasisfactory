// Shared types for Lambda functions

export interface JWTPayload {
  sub: 'admin'; // Subject (user identifier)
  iat: number; // Issued at (Unix timestamp)
  exp: number; // Expiration (Unix timestamp, iat + 3600)
}

export interface AuthorizerEvent {
  headers: {
    authorization?: string; // "Bearer <jwt-token>"
  };
  requestContext: {
    http: {
      method: string;
      path: string;
    };
  };
}

export interface AuthorizerResponse {
  isAuthorized: boolean;
  context?: {
    userId: string;
  };
}

export interface ErrorResponse {
  error: string;
  message: string;
  details?: unknown;
  timestamp: string;
}

export interface ServerTask {
  taskArn?: string;
  lastStatus?: string;
  publicIp?: string;
}

export interface ServerStartResult {
  task: ServerTask;
  adminToken: string;
  publicIp: string;
}

export interface ApiErrorResponse {
  error: string;
  message: string;
  details?: unknown;
  timestamp: string;
}