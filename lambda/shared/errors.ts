// Custom error types for better error handling

export class SatisfactoryServerError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500
  ) {
    super(message);
    this.name = 'SatisfactoryServerError';
  }
}

export class ServerNotRunningError extends SatisfactoryServerError {
  constructor() {
    super('Server is not currently running', 'SERVER_NOT_RUNNING', 400);
  }
}

export class ServerStartFailedError extends SatisfactoryServerError {
  constructor(reason: string) {
    super(`Failed to start server: ${reason}`, 'SERVER_START_FAILED', 500);
  }
}

export class ServerStopFailedError extends SatisfactoryServerError {
  constructor(reason: string) {
    super(`Failed to stop server: ${reason}`, 'SERVER_STOP_FAILED', 500);
  }
}

export class AuthenticationError extends SatisfactoryServerError {
  constructor(message: string = 'Authentication failed') {
    super(message, 'AUTHENTICATION_ERROR', 401);
  }
}

export class ValidationError extends SatisfactoryServerError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', 400);
  }
}

export class ApiTokenError extends SatisfactoryServerError {
  constructor(message: string = 'API token error') {
    super(message, 'API_TOKEN_ERROR', 500);
  }
}

export class SecretNotFoundError extends SatisfactoryServerError {
  constructor(secretName: string) {
    super(`Secret not found: ${secretName}`, 'SECRET_NOT_FOUND', 500);
  }
}