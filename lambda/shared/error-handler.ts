// Centralized error handling for API Gateway responses
import { APIGatewayProxyResult } from 'aws-lambda';
import { ErrorResponse } from './types';
import { HTTP_STATUS } from './constants';

export function createErrorResponse(
  statusCode: number,
  errorCode: string,
  message: string,
  details?: unknown
): APIGatewayProxyResult {
  const errorResponse: ErrorResponse = {
    error: errorCode,
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
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block'
    },
    body: JSON.stringify(errorResponse)
  };
}

export function createSuccessResponse(
  data: unknown,
  statusCode: number = HTTP_STATUS.OK
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block'
    },
    body: JSON.stringify(data)
  };
}

export function sanitizeInput(input: string): string {
  // Remove potentially dangerous characters
  return input.replace(/[<>"'&]/g, '');
}