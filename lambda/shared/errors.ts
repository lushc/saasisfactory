// Custom error types for better error handling
import { HTTP_STATUS, ERROR_CODES } from './constants';

export class SatisfactoryServerError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = HTTP_STATUS.INTERNAL_SERVER_ERROR
  ) {
    super(message);
    this.name = 'SatisfactoryServerError';
  }
}

export class ServerNotRunningError extends SatisfactoryServerError {
  constructor() {
    super('Server is not currently running', ERROR_CODES.SERVER_NOT_RUNNING, HTTP_STATUS.BAD_REQUEST);
  }
}

export class ServerStartFailedError extends SatisfactoryServerError {
  constructor(reason: string) {
    super(`Failed to start server: ${reason}`, ERROR_CODES.SERVER_START_FAILED, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

export class ServerStopFailedError extends SatisfactoryServerError {
  constructor(reason: string) {
    super(`Failed to stop server: ${reason}`, ERROR_CODES.SERVER_STOP_FAILED, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

export class AuthenticationError extends SatisfactoryServerError {
  constructor(message: string = 'Authentication failed') {
    super(message, ERROR_CODES.AUTHENTICATION_ERROR, HTTP_STATUS.UNAUTHORIZED);
  }
}

export class ValidationError extends SatisfactoryServerError {
  constructor(message: string) {
    super(message, ERROR_CODES.VALIDATION_ERROR, HTTP_STATUS.BAD_REQUEST);
  }
}

export class ApiTokenError extends SatisfactoryServerError {
  constructor(message: string = 'API token error') {
    super(message, ERROR_CODES.API_TOKEN_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

export class SecretNotFoundError extends SatisfactoryServerError {
  constructor(secretName: string) {
    super(`Secret not found: ${secretName}`, ERROR_CODES.SECRET_NOT_FOUND, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}