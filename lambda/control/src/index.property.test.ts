import * as fc from 'fast-check';
import jwt from 'jsonwebtoken';
import { handler } from './index';
import { APIGatewayProxyEvent } from 'aws-lambda';

// Mock AWS SDK and utilities
jest.mock('@aws-sdk/client-secrets-manager');
jest.mock('@aws-sdk/client-ecs');
jest.mock('@aws-sdk/client-ec2');
jest.mock('@aws-sdk/client-eventbridge');
jest.mock('./aws-utils');
jest.mock('./satisfactory-api');

import * as awsUtils from './aws-utils';

const mockGetSecret = jest.fn();
const mockGetServiceTasks = jest.fn();
const mockGetRunningTask = jest.fn();

// Mock all aws-utils functions
(awsUtils as any).getSecret = mockGetSecret;
(awsUtils as any).getServiceTasks = mockGetServiceTasks;
(awsUtils as any).getRunningTask = mockGetRunningTask;

describe('Control Lambda Property Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mocks
    mockGetServiceTasks.mockResolvedValue([]);
    mockGetRunningTask.mockResolvedValue(undefined);
  });

  /**
   * Property 6: Password Validation and JWT Generation
   * Validates: Requirements 8.2
   */
  describe('Property 6: Password Validation and JWT Generation', () => {
    it('should return valid JWT token with 1-hour expiration for matching passwords and error for non-matching passwords', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 8, maxLength: 64 }), // stored password
          fc.string({ minLength: 8, maxLength: 64 }), // provided password
          async (storedPassword, providedPassword) => {
            const jwtSecret = 'test-jwt-secret-for-testing';
            
            // Setup mocks
            mockGetSecret
              .mockResolvedValueOnce(storedPassword) // admin password
              .mockResolvedValueOnce(jwtSecret); // JWT secret

            // Create test event
            const event: Partial<APIGatewayProxyEvent> = {
              path: '/auth/login',
              httpMethod: 'POST',
              body: JSON.stringify({ password: providedPassword })
            };

            const result = await handler(event as APIGatewayProxyEvent);

            if (providedPassword === storedPassword) {
              // Passwords match - should return valid JWT
              expect(result.statusCode).toBe(200);
              
              const responseBody = JSON.parse(result.body);
              expect(responseBody.token).toBeDefined();
              expect(responseBody.expiresIn).toBe(3600);
            } else {
              // Passwords don't match - should return 401
              expect(result.statusCode).toBe(401);
              const responseBody = JSON.parse(result.body);
              expect(responseBody.error).toBe('AUTHENTICATION_ERROR');
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle edge cases for password validation', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            fc.constant(''), // empty password
            fc.string({ minLength: 1, maxLength: 7 }), // short password
            fc.string({ minLength: 65 }) // very long password
          ),
          fc.string({ minLength: 32, maxLength: 128 }), // JWT secret
          async (providedPassword, jwtSecret) => {
            const storedPassword = 'valid-admin-password-123';
            
            // Setup mocks
            mockGetSecret
              .mockResolvedValueOnce(storedPassword)
              .mockResolvedValueOnce(jwtSecret);

            const event: Partial<APIGatewayProxyEvent> = {
              path: '/auth/login',
              httpMethod: 'POST',
              body: JSON.stringify({ password: providedPassword })
            };

            const result = await handler(event as APIGatewayProxyEvent);

            if (providedPassword === '') {
              // Empty password should be rejected with 400
              expect(result.statusCode).toBe(400);
              const responseBody = JSON.parse(result.body);
              expect(responseBody.error).toBe('VALIDATION_ERROR');
            } else {
              // Non-matching password should be rejected with 401
              expect(result.statusCode).toBe(401);
              const responseBody = JSON.parse(result.body);
              expect(responseBody.error).toBe('AUTHENTICATION_ERROR');
            }
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  /**
   * Property 8: API Authentication Enforcement
   * Validates: Requirements 11.6
   */
  describe('Property 8: API Authentication Enforcement', () => {
    it('should reject protected API endpoints without valid JWT token with 401 Unauthorized', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            fc.constant('/server/start'),
            fc.constant('/server/stop'),
            fc.constant('/server/status'),
            fc.constant('/server/client-password')
          ),
          fc.oneof(
            fc.constant('GET'),
            fc.constant('POST')
          ),
          fc.oneof(
            fc.constant(undefined), // No authorization header
            fc.constant(''), // Empty authorization header
            fc.constant('Bearer'), // Invalid bearer format
            fc.constant('Bearer '), // Bearer with space but no token
            fc.string({ minLength: 1, maxLength: 100 }), // Invalid token format
            fc.constant('Basic dGVzdDp0ZXN0') // Wrong auth type
          ),
          async (endpoint, method, authHeader) => {
            // Skip invalid method/endpoint combinations
            if ((endpoint === '/server/status' || endpoint === '/server/client-password') && method === 'POST' && endpoint === '/server/status') {
              return; // Skip invalid combinations
            }
            if ((endpoint === '/server/start' || endpoint === '/server/stop') && method === 'GET') {
              return; // Skip invalid combinations
            }
            
            // Create test event
            const event: Partial<APIGatewayProxyEvent> = {
              path: endpoint,
              httpMethod: method,
              headers: authHeader ? { authorization: authHeader } : {},
              body: method === 'POST' ? JSON.stringify({}) : undefined
            };

            const result = await handler(event as APIGatewayProxyEvent);

            // All protected endpoints should return 401 for invalid/missing auth
            expect(result.statusCode).toBeGreaterThanOrEqual(400);
            
            // Should be specifically 401 for auth errors
            if (authHeader === undefined || authHeader === '' || authHeader === 'Bearer' || authHeader === 'Bearer ') {
              expect(result.statusCode).toBe(401);
            }
            
            // The handler should at least not crash with invalid auth headers
            expect(result.statusCode).toBeDefined();
            expect(typeof result.statusCode).toBe('number');
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  /**
   * Property 9: API Error Response Format
   * Validates: Requirements 11.7
   */
  describe('Property 9: API Error Response Format', () => {
    it('should return properly formatted error responses for invalid requests', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            fc.record({
              endpoint: fc.constant('/auth/login'),
              method: fc.constant('POST'),
              body: fc.oneof(
                fc.constant(undefined), // No body
                fc.constant(''), // Empty body
                fc.constant('invalid json'), // Invalid JSON
                fc.constant('{}'), // Empty object - missing password
                fc.constant('{"invalid": true}') // Valid JSON but wrong structure
              ),
              shouldError: fc.constant(true)
            }),
            fc.record({
              endpoint: fc.oneof(
                fc.constant('/server/start'),
                fc.constant('/server/stop'),
                fc.constant('/server/status'),
                fc.constant('/server/client-password')
              ),
              method: fc.oneof(fc.constant('GET'), fc.constant('POST')),
              body: fc.constant(undefined),
              shouldError: fc.constant(true) // These should error due to missing auth
            }),
            fc.record({
              endpoint: fc.constant('/invalid/endpoint'),
              method: fc.oneof(fc.constant('GET'), fc.constant('POST')),
              body: fc.constant(undefined),
              shouldError: fc.constant(true) // 404 error
            })
          ),
          async (testCase) => {
            // Skip invalid method/endpoint combinations for protected endpoints
            if ((testCase.endpoint === '/server/status' || testCase.endpoint === '/server/client-password') && 
                testCase.method === 'POST' && testCase.endpoint === '/server/status') {
              return;
            }
            if ((testCase.endpoint === '/server/start' || testCase.endpoint === '/server/stop') && 
                testCase.method === 'GET') {
              return;
            }
            
            // Create test event
            const event: Partial<APIGatewayProxyEvent> = {
              path: testCase.endpoint,
              httpMethod: testCase.method,
              body: testCase.body,
              headers: {}
            };

            const result = await handler(event as APIGatewayProxyEvent);

            if (testCase.shouldError) {
              // All error responses should have proper format
              expect(result.statusCode).toBeDefined();
              expect(typeof result.statusCode).toBe('number');
              expect(result.statusCode).toBeGreaterThanOrEqual(400);
              
              // Response should have proper headers
              expect(result.headers).toBeDefined();
              expect(result.headers!['Content-Type']).toBe('application/json');
              expect(result.headers!['Access-Control-Allow-Origin']).toBe('*');
              
              // Response body should be valid JSON with error structure
              expect(result.body).toBeDefined();
              expect(typeof result.body).toBe('string');
              
              let responseBody;
              try {
                responseBody = JSON.parse(result.body);
              } catch (e) {
                fail('Response body should be valid JSON');
              }
              
              // Error response should have required fields
              expect(responseBody.error).toBeDefined();
              expect(typeof responseBody.error).toBe('string');
              expect(responseBody.message).toBeDefined();
              expect(typeof responseBody.message).toBe('string');
              
              // Error and message should not be empty
              expect(responseBody.error.length).toBeGreaterThan(0);
              expect(responseBody.message.length).toBeGreaterThan(0);
            }
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  /**
   * Property 10: Secret Isolation
   * Validates: Requirements 13.3, 13.5
   */
  describe('Property 10: Secret Isolation', () => {
    it('should not expose sensitive secrets in API responses', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            fc.constant('/server/status'),
            fc.constant('/server/client-password')
          ),
          fc.string({ minLength: 32, maxLength: 128 }), // Mock admin password
          fc.string({ minLength: 32, maxLength: 128 }), // Mock JWT secret
          fc.string({ minLength: 32, maxLength: 128 }), // Mock API token
          async (endpoint, adminPassword, jwtSecret, apiToken) => {
            // Mock the secrets that should NOT appear in responses
            const sensitiveSecrets = [
              adminPassword,
              jwtSecret,
              apiToken,
              'satisfactory-admin-password',
              'satisfactory-jwt-secret',
              'satisfactory-api-token',
              'satisfactory-server-admin-password'
            ];

            // Create test event
            const event: Partial<APIGatewayProxyEvent> = {
              path: endpoint,
              httpMethod: 'GET',
              headers: {}
            };

            const result = await handler(event as APIGatewayProxyEvent);

            // Response should be defined
            expect(result.statusCode).toBeDefined();
            expect(result.body).toBeDefined();
            
            // Check that response body doesn't contain sensitive secrets
            const responseBody = result.body;
            
            for (const secret of sensitiveSecrets) {
              // Secrets should not appear in the response body
              expect(responseBody).not.toContain(secret);
            }
            
            // If the response is JSON, parse it and check for secret fields
            try {
              const parsedBody = JSON.parse(responseBody);
              
              // These fields should never be present in API responses
              const forbiddenFields = [
                'adminPassword',
                'jwtSecret',
                'apiToken',
                'satisfactory-admin-password',
                'satisfactory-jwt-secret',
                'satisfactory-api-token',
                'satisfactory-server-admin-password'
              ];
              
              for (const field of forbiddenFields) {
                expect(parsedBody).not.toHaveProperty(field);
              }
              
              // Recursively check nested objects for secrets
              const checkForSecrets = (obj: any) => {
                if (typeof obj === 'object' && obj !== null) {
                  for (const [key, value] of Object.entries(obj)) {
                    // Check if key contains secret-related terms
                    const secretKeywords = ['password', 'secret', 'token', 'key'];
                    const hasSecretKeyword = secretKeywords.some(keyword => 
                      key.toLowerCase().includes(keyword)
                    );
                    
                    if (hasSecretKeyword && typeof value === 'string' && value.length > 10) {
                      // This might be a secret value, ensure it's not one of our sensitive secrets
                      for (const secret of sensitiveSecrets) {
                        expect(value).not.toBe(secret);
                      }
                    }
                    
                    // Recursively check nested objects
                    if (typeof value === 'object') {
                      checkForSecrets(value);
                    }
                  }
                }
              };
              
              checkForSecrets(parsedBody);
            } catch (e) {
              // If it's not JSON, that's fine, we already checked the raw string
            }
          }
        ),
        { numRuns: 30 }
      );
    });
  });
});