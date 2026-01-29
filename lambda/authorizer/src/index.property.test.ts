import * as fc from 'fast-check';
import jwt from 'jsonwebtoken';
import { handler } from './index';
import { APIGatewayRequestAuthorizerEvent, Context } from 'aws-lambda';
import { 
  TEST_JWT_SECRET,
  MOCK_ACCOUNT_ID,
  MOCK_API_ID
} from '../../shared/test-helpers';

// Mock AWS clients
jest.mock('../../shared/aws-clients');
jest.mock('../../shared/parameter-cache');

const mockSend = jest.fn();
const mockGetSSMClient = jest.fn(() => ({ send: mockSend }));
const mockCacheGet = jest.fn();
const mockCacheSet = jest.fn();

// Mock the aws-clients module
const awsClients = require('../../shared/aws-clients');
awsClients.getSSMClient = mockGetSSMClient;

// Mock the parameter cache
const parameterCache = require('../../shared/parameter-cache');
parameterCache.parameterCache = {
  get: mockCacheGet,
  set: mockCacheSet
};

beforeEach(() => {
  jest.clearAllMocks();
  mockCacheGet.mockResolvedValue(null); // Default: no cache hit
  
  // Mock Parameter Store response
  mockSend.mockResolvedValue({
    Parameter: {
      Value: TEST_JWT_SECRET
    }
  });
});

// Helper function to create mock event
function createMockAuthorizerEvent(token: string, methodArn: string): APIGatewayRequestAuthorizerEvent {
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

// Helper function to create mock context
function createMockContext(): Context {
  return {
    callbackWaitsForEmptyEventLoop: false,
    functionName: 'test-authorizer',
    functionVersion: '1',
    invokedFunctionArn: `arn:aws:lambda:us-east-1:${MOCK_ACCOUNT_ID}:function:test-authorizer`,
    memoryLimitInMB: '128',
    awsRequestId: 'test-request-id',
    logGroupName: '/aws/lambda/test-authorizer',
    logStreamName: 'test-stream',
    getRemainingTimeInMillis: () => 30000,
    done: () => {},
    fail: () => {},
    succeed: () => {}
  };
}

// Helper function to create JWT token with specific timing
function createJwtToken(issuedSecondsAgo: number, expiresInSeconds: number): string {
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
 * Property 7: JWT Token Expiration
 * **Validates: Requirements 8.4**
 * 
 * For any JWT token that is older than 1 hour from its issuance time,
 * the authorizer Lambda should reject the token and return false for authorization.
 */
describe('Property 7: JWT Token Expiration', () => {
  test('Property: Expired tokens should always be rejected', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate tokens with various expiration times in the past
        fc.integer({ min: 3601, max: 86400 }), // 1 hour + 1 second to 24 hours ago
        fc.string({ minLength: 1, maxLength: 50 }), // Random method ARN
        async (secondsAgo: number, methodArn: string) => {
          // Create a token that expired in the past (was valid for 1 hour from issuance)
          const expiredToken = createJwtToken(secondsAgo, -1800); // Expires 30 minutes ago
          
          // Create mock event with expired token
          const event = createMockAuthorizerEvent(expiredToken, methodArn);
          const context = createMockContext();
          
          // Call the authorizer
          const result = await handler(event, context);
          
          // Property: All expired tokens should be denied
          expect(result.policyDocument.Statement[0].Effect).toBe('Deny');
        }
      ),
      { numRuns: 50 } // Run 50 test cases with different expiration times
    );
  });

  test('Property: Valid tokens within 1-hour limit should be allowed', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate tokens with various valid ages (0 to 3599 seconds old)
        fc.integer({ min: 0, max: 3599 }), // 0 seconds to 59 minutes 59 seconds
        fc.string({ minLength: 1, maxLength: 50 }), // Random method ARN
        async (secondsAgo: number, methodArn: string) => {
          // Create a token that is still valid (expires 30 minutes from now)
          const validToken = createJwtToken(secondsAgo, 1800);
          
          // Create mock event with valid token
          const event = createMockAuthorizerEvent(validToken, methodArn);
          const context = createMockContext();
          
          // Call the authorizer
          const result = await handler(event, context);
          
          // Property: All valid tokens should be allowed
          expect(result.policyDocument.Statement[0].Effect).toBe('Allow');
        }
      ),
      { numRuns: 50 } // Run 50 test cases with different valid ages
    );
  });
});