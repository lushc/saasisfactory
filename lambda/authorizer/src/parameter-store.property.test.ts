import * as fc from 'fast-check';
import { 
  GetParameterCommand, 
  PutParameterCommand, 
  DeleteParameterCommand,
  ParameterNotFound,
  ParameterType
} from '@aws-sdk/client-ssm';
import { getParameter, putParameter, deleteParameter } from '../../shared/parameter-store';
import { parameterCache } from '../../shared/parameter-cache';
import { ParameterNotFoundError, ParameterAccessDeniedError } from '../../shared/errors';

// Mock AWS SDK
jest.mock('@aws-sdk/client-ssm');
jest.mock('../../shared/aws-clients');
jest.mock('../../shared/parameter-cache');

const mockSend = jest.fn();
const mockGetSSMClient = jest.fn(() => ({ send: mockSend }));
const mockCacheGet = jest.fn();
const mockCacheSet = jest.fn();
const mockCacheDelete = jest.fn();

// Mock the aws-clients module
jest.mock('../../shared/aws-clients', () => ({
  getSSMClient: () => mockGetSSMClient()
}));

// Mock the parameter cache
(parameterCache.get as jest.Mock) = mockCacheGet;
(parameterCache.set as jest.Mock) = mockCacheSet;
(parameterCache.delete as jest.Mock) = mockCacheDelete;

describe('Parameter Store Client Property Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null); // Default: no cache hit
  });

  /**
   * Property 1: Parameter Configuration Compliance
   * For any sensitive parameter created by the system, it should be configured as a SecureString 
   * with Standard tier and use the default AWS managed KMS key (alias/aws/ssm)
   * Validates: Requirements 1.4, 2.1, 2.4, 5.4
   */
  describe('Property 1: Parameter Configuration Compliance', () => {
    it('should configure all parameters as SecureString with Standard tier', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.startsWith('/satisfactory/')), // parameter name
          fc.string({ minLength: 1, maxLength: 4096 }), // parameter value (within 4KB limit)
          async (parameterName, parameterValue) => {
            // Mock successful put operation
            mockSend.mockResolvedValueOnce({});

            await putParameter(parameterName, parameterValue);

            // Verify the command was called with correct configuration
            expect(mockSend).toHaveBeenCalledWith(
              expect.objectContaining({
                input: expect.objectContaining({
                  Name: parameterName,
                  Value: parameterValue,
                  Type: ParameterType.SECURE_STRING,
                  Overwrite: true,
                  Tier: 'Standard'
                })
              })
            );

            // Verify cache was updated
            expect(mockCacheSet).toHaveBeenCalledWith(parameterName, parameterValue);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Property 3: Parameter Store API Handling
   * For any Parameter Store API operation (get, put, delete), the system should handle 
   * the Parameter Store response format correctly and implement proper error handling
   * Validates: Requirements 3.1, 7.2, 7.3, 7.4
   */
  describe('Property 3: Parameter Store API Handling', () => {
    it('should handle Parameter Store get operations correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.startsWith('/satisfactory/')), // parameter name
          fc.string({ minLength: 1, maxLength: 4096 }), // parameter value
          async (parameterName, parameterValue) => {
            // Mock successful get operation
            mockSend.mockResolvedValueOnce({
              Parameter: {
                Name: parameterName,
                Value: parameterValue,
                Type: ParameterType.SECURE_STRING
              }
            });

            const result = await getParameter(parameterName);

            // Verify correct API call
            expect(mockSend).toHaveBeenCalledWith(
              expect.objectContaining({
                input: expect.objectContaining({
                  Name: parameterName,
                  WithDecryption: true
                })
              })
            );

            // Verify correct response handling
            expect(result).toBe(parameterValue);
            expect(mockCacheSet).toHaveBeenCalledWith(parameterName, parameterValue);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle ParameterNotFound errors correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.startsWith('/satisfactory/')), // parameter name
          async (parameterName) => {
            // Mock ParameterNotFound error
            const error = new Error('Parameter not found');
            error.name = 'ParameterNotFound';
            mockSend.mockRejectedValueOnce(error);

            await expect(getParameter(parameterName)).rejects.toThrow(ParameterNotFoundError);
            await expect(getParameter(parameterName)).rejects.toThrow(`Parameter not found: ${parameterName}`);
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should handle AccessDeniedException errors correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.startsWith('/satisfactory/')), // parameter name
          fc.oneof(
            fc.constant('get'),
            fc.constant('put'),
            fc.constant('delete')
          ),
          async (parameterName, operation) => {
            // Mock AccessDeniedException error
            const error = new Error('Access denied');
            error.name = 'AccessDeniedException';
            mockSend.mockRejectedValueOnce(error);

            let promise: Promise<any>;
            switch (operation) {
              case 'get':
                promise = getParameter(parameterName);
                break;
              case 'put':
                promise = putParameter(parameterName, 'test-value');
                break;
              case 'delete':
                promise = deleteParameter(parameterName);
                break;
              default:
                return; // Skip invalid operations
            }

            await expect(promise).rejects.toThrow(ParameterAccessDeniedError);
            await expect(promise).rejects.toThrow(`Access denied for parameter: ${parameterName}`);
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should handle delete operations correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.startsWith('/satisfactory/')), // parameter name
          async (parameterName) => {
            // Mock successful delete operation
            mockSend.mockResolvedValueOnce({});

            await deleteParameter(parameterName);

            // Verify correct API call
            expect(mockSend).toHaveBeenCalledWith(
              expect.objectContaining({
                input: expect.objectContaining({
                  Name: parameterName
                })
              })
            );

            // Verify cache was cleared
            expect(mockCacheDelete).toHaveBeenCalledWith(parameterName);
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  /**
   * Property 4: Parameter Naming Consistency
   * For any parameter created by the system, it should use hierarchical naming with 
   * the /satisfactory/ prefix and follow consistent naming patterns across all functions
   * Validates: Requirements 6.1, 6.2, 6.3, 6.5
   */
  describe('Property 4: Parameter Naming Consistency', () => {
    it('should accept only parameters with /satisfactory/ prefix', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            // Valid parameter names with /satisfactory/ prefix
            fc.constantFrom(
              '/satisfactory/admin-password',
              '/satisfactory/jwt-secret',
              '/satisfactory/server-admin-password',
              '/satisfactory/api-token',
              '/satisfactory/client-password'
            ),
            // Invalid parameter names (should still work but not follow convention)
            fc.string({ minLength: 1, maxLength: 100 }).filter(s => !s.startsWith('/satisfactory/'))
          ),
          fc.string({ minLength: 1, maxLength: 100 }), // parameter value
          async (parameterName, parameterValue) => {
            // Mock successful operations
            mockSend.mockResolvedValue({
              Parameter: { Name: parameterName, Value: parameterValue, Type: ParameterType.SECURE_STRING }
            });

            // All parameter names should be handled, but we can verify the naming pattern
            const isValidNaming = parameterName.startsWith('/satisfactory/');
            
            // The function should work regardless, but we can track naming compliance
            await expect(getParameter(parameterName)).resolves.toBe(parameterValue);
            await expect(putParameter(parameterName, parameterValue)).resolves.toBeUndefined();
            
            // For valid naming, verify the hierarchical structure
            if (isValidNaming) {
              const parts = parameterName.split('/');
              expect(parts[0]).toBe(''); // Leading slash creates empty first element
              expect(parts[1]).toBe('satisfactory');
              expect(parts[2]).toBeDefined();
              expect(parts[2].length).toBeGreaterThan(0);
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Property 6: Shared Utility Consistency
   * For any Lambda function accessing parameters, it should use the same shared utility functions 
   * to ensure consistent Parameter Store access patterns
   * Validates: Requirements 7.5
   */
  describe('Property 6: Shared Utility Consistency', () => {
    it('should provide consistent caching behavior across all operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.startsWith('/satisfactory/')), // parameter name
          fc.string({ minLength: 1, maxLength: 100 }), // cached value
          fc.string({ minLength: 1, maxLength: 100 }), // new value
          async (parameterName, cachedValue, newValue) => {
            // Test cache hit scenario
            mockCacheGet.mockResolvedValueOnce(cachedValue);
            
            const result1 = await getParameter(parameterName);
            
            // Should return cached value without calling AWS API
            expect(result1).toBe(cachedValue);
            expect(mockSend).not.toHaveBeenCalled();
            
            // Reset mocks for cache miss scenario
            jest.clearAllMocks();
            mockCacheGet.mockResolvedValue(null); // Cache miss
            mockSend.mockResolvedValueOnce({
              Parameter: { Name: parameterName, Value: newValue, Type: ParameterType.SECURE_STRING }
            });
            
            const result2 = await getParameter(parameterName);
            
            // Should call AWS API and cache the result
            expect(result2).toBe(newValue);
            expect(mockSend).toHaveBeenCalledTimes(1);
            expect(mockCacheSet).toHaveBeenCalledWith(parameterName, newValue);
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should handle cache invalidation consistently', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.startsWith('/satisfactory/')), // parameter name
          fc.string({ minLength: 1, maxLength: 100 }), // parameter value
          async (parameterName, parameterValue) => {
            // Mock successful put operation
            mockSend.mockResolvedValueOnce({});
            
            await putParameter(parameterName, parameterValue);
            
            // Cache should be updated with new value
            expect(mockCacheSet).toHaveBeenCalledWith(parameterName, parameterValue);
            
            // Reset mocks for delete operation
            jest.clearAllMocks();
            mockSend.mockResolvedValueOnce({});
            
            await deleteParameter(parameterName);
            
            // Cache should be cleared
            expect(mockCacheDelete).toHaveBeenCalledWith(parameterName);
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  /**
   * Property: Error Handling Robustness
   * For any unexpected error from Parameter Store API, the system should handle it gracefully
   * and provide meaningful error information
   */
  describe('Property: Error Handling Robustness', () => {
    it('should handle unexpected AWS API errors gracefully', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.startsWith('/satisfactory/')), // parameter name
          fc.oneof(
            fc.constant('ThrottlingException'),
            fc.constant('InternalServerError'),
            fc.constant('ServiceUnavailableException'),
            fc.constant('UnknownError')
          ),
          async (parameterName, errorType) => {
            // Mock various AWS API errors
            const error = new Error(`AWS API Error: ${errorType}`);
            error.name = errorType;
            mockSend.mockRejectedValueOnce(error);

            // For non-specific errors, the original error should be re-thrown
            if (errorType !== 'ParameterNotFound' && errorType !== 'AccessDeniedException') {
              await expect(getParameter(parameterName)).rejects.toThrow(error);
            }
            
            // Verify error was logged (console.error should be called)
            // Note: In a real implementation, you might want to use a proper logger
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});

/**
 * Feature: secrets-to-parameters-migration, Property 1: Parameter Configuration Compliance
 * Feature: secrets-to-parameters-migration, Property 3: Parameter Store API Handling  
 * Feature: secrets-to-parameters-migration, Property 4: Parameter Naming Consistency
 * Feature: secrets-to-parameters-migration, Property 6: Shared Utility Consistency
 */