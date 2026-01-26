// Test utilities for Lambda functions
import jwt from 'jsonwebtoken';
import { APIGatewayRequestAuthorizerEvent, APIGatewayProxyEvent, Context } from 'aws-lambda';

// Test constants
export const TEST_JWT_SECRET = 'test-jwt-secret-key-for-property-testing';
export const MOCK_ACCOUNT_ID = '123456789012';
export const MOCK_API_ID = 'abcdef123';

/**
 * Create a valid JWT token for testing
 */
export function createValidJwtToken(secondsFromNow: number = 3600): string {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign({
    sub: 'admin',
    iat: now,
    exp: now + secondsFromNow
  }, TEST_JWT_SECRET);
}

/**
 * Create an expired JWT token for testing
 */
export function createExpiredJwtToken(secondsAgo: number = 3601): string {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign({
    sub: 'admin',
    iat: now - secondsAgo,
    exp: now - 1800 // Expired 30 minutes ago
  }, TEST_JWT_SECRET);
}

/**
 * Create JWT token with specific timing for property tests
 */
export function createJwtToken(issuedSecondsAgo: number, expiresInSeconds: number): string {
  const currentTime = Math.floor(Date.now() / 1000);
  const issuedAt = currentTime - issuedSecondsAgo;
  const expiresAt = currentTime + expiresInSeconds;
  
  const payload = {
    sub: 'admin' as const,
    iat: issuedAt,
    exp: expiresAt
  };
  
  return jwt.sign(payload, TEST_JWT_SECRET);
}

/**
 * Create mock authorizer event for testing
 */
export function createMockAuthorizerEvent(
  token: string, 
  methodArn: string
): APIGatewayRequestAuthorizerEvent {
  return {
    type: 'REQUEST',
    methodArn: `arn:aws:execute-api:us-east-1:${MOCK_ACCOUNT_ID}:${MOCK_API_ID}/${methodArn}`,
    resource: '/test',
    path: '/test',
    httpMethod: 'GET',
    headers: {
      authorization: `Bearer ${token}`
    },
    multiValueHeaders: {},
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    pathParameters: null,
    stageVariables: null,
    requestContext: {
      resourceId: 'test',
      resourcePath: '/test',
      httpMethod: 'GET',
      extendedRequestId: 'test',
      requestTime: new Date().toISOString(),
      path: '/test',
      accountId: MOCK_ACCOUNT_ID,
      protocol: 'HTTP/1.1',
      stage: 'test',
      domainPrefix: 'test',
      requestTimeEpoch: Date.now(),
      requestId: 'test',
      authorizer: undefined,
      identity: {
        cognitoIdentityPoolId: null,
        accountId: null,
        cognitoIdentityId: null,
        caller: null,
        sourceIp: '127.0.0.1',
        principalOrgId: null,
        accessKey: null,
        cognitoAuthenticationType: null,
        cognitoAuthenticationProvider: null,
        userArn: null,
        userAgent: 'test',
        user: null,
        apiKey: null,
        apiKeyId: null,
        clientCert: null
      },
      domainName: 'test.execute-api.us-east-1.amazonaws.com',
      apiId: 'test'
    }
  };
}

/**
 * Create mock API Gateway proxy event for testing
 */
export function createMockProxyEvent(
  method: string,
  path: string,
  body?: string,
  headers?: Record<string, string>
): APIGatewayProxyEvent {
  return {
    resource: path,
    path,
    httpMethod: method,
    headers: headers || {},
    multiValueHeaders: {},
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    pathParameters: null,
    stageVariables: null,
    requestContext: {
      resourceId: 'test',
      resourcePath: path,
      httpMethod: method,
      extendedRequestId: 'test',
      requestTime: new Date().toISOString(),
      path,
      accountId: MOCK_ACCOUNT_ID,
      protocol: 'HTTP/1.1',
      stage: 'test',
      domainPrefix: 'test',
      requestTimeEpoch: Date.now(),
      requestId: 'test',
      authorizer: undefined,
      identity: {
        cognitoIdentityPoolId: null,
        accountId: null,
        cognitoIdentityId: null,
        caller: null,
        sourceIp: '127.0.0.1',
        principalOrgId: null,
        accessKey: null,
        cognitoAuthenticationType: null,
        cognitoAuthenticationProvider: null,
        userArn: null,
        userAgent: 'test',
        user: null,
        apiKey: null,
        apiKeyId: null,
        clientCert: null
      },
      domainName: 'test.execute-api.us-east-1.amazonaws.com',
      apiId: 'test'
    },
    body,
    isBase64Encoded: false
  };
}

/**
 * Create mock Lambda context for testing
 */
export function createMockContext(): Context {
  return {
    callbackWaitsForEmptyEventLoop: false,
    functionName: 'test-function',
    functionVersion: '1',
    invokedFunctionArn: `arn:aws:lambda:us-east-1:${MOCK_ACCOUNT_ID}:function:test-function`,
    memoryLimitInMB: '128',
    awsRequestId: 'test-request-id',
    logGroupName: '/aws/lambda/test-function',
    logStreamName: 'test-stream',
    getRemainingTimeInMillis: () => 30000,
    done: () => {},
    fail: () => {},
    succeed: () => {}
  };
}