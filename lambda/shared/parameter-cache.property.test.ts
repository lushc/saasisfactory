import * as fc from 'fast-check';
import { parameterCache } from './parameter-cache';

describe('Parameter Cache Property Tests', () => {
  beforeEach(() => {
    parameterCache.clear();
  });

  afterEach(() => {
    parameterCache.clear();
  });

  // Helper function to generate valid parameter names
  const validParameterName = () => 
    fc.string({ minLength: 1, maxLength: 30 })
      .filter(s => /^[a-zA-Z0-9-_]+$/.test(s.trim()) && s.trim().length > 0)
      .map(s => `/satisfactory/${s.trim()}`);

  /**
   * Property 6: Shared Utility Consistency
   * For any Lambda function accessing parameters, it should use the same shared utility functions 
   * to ensure consistent Parameter Store access patterns
   * Validates: Requirements 7.5
   */
  describe('Property 6: Shared Utility Consistency', () => {
    it('should provide consistent cache behavior for any valid parameter name and value', async () => {
      await fc.assert(
        fc.asyncProperty(
          validParameterName(),
          fc.string({ minLength: 0, maxLength: 1000 }), // Parameter values can be empty or large
          async (parameterName, parameterValue) => {
            // Store parameter in cache
            parameterCache.set(parameterName, parameterValue);
            
            // Retrieve parameter from cache
            const retrievedValue = await parameterCache.get(parameterName);
            
            // Should return the exact same value
            expect(retrievedValue).toBe(parameterValue);
            
            // Cache size should reflect the addition
            expect(parameterCache.size()).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle cache operations consistently regardless of parameter name format', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate various parameter name formats
          fc.oneof(
            fc.constant('/satisfactory/admin-password'),
            fc.constant('/satisfactory/jwt-secret'),
            fc.constant('/satisfactory/server-admin-password'),
            fc.constant('/satisfactory/api-token'),
            fc.constant('/satisfactory/client-password'),
            validParameterName()
          ),
          fc.string({ minLength: 1, maxLength: 500 }),
          async (parameterName, parameterValue) => {
            // Initial state - parameter should not exist
            const initialValue = await parameterCache.get(parameterName);
            expect(initialValue).toBeNull();
            
            // Set parameter
            parameterCache.set(parameterName, parameterValue);
            
            // Get parameter - should return the set value
            const cachedValue = await parameterCache.get(parameterName);
            expect(cachedValue).toBe(parameterValue);
            
            // Delete parameter
            parameterCache.delete(parameterName);
            
            // Get parameter after deletion - should return null
            const deletedValue = await parameterCache.get(parameterName);
            expect(deletedValue).toBeNull();
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should maintain cache consistency across multiple sequential operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate a single parameter name and multiple operations on it
          validParameterName(),
          fc.array(
            fc.record({
              value: fc.string({ minLength: 0, maxLength: 200 }),
              operation: fc.constantFrom('set', 'get', 'delete')
            }),
            { minLength: 1, maxLength: 8 }
          ),
          async (parameterName, operations) => {
            let currentValue: string | null = null;
            
            // Execute operations in sequence on the same parameter
            for (const op of operations) {
              switch (op.operation) {
                case 'set':
                  parameterCache.set(parameterName, op.value);
                  currentValue = op.value;
                  break;
                  
                case 'get':
                  const value = await parameterCache.get(parameterName);
                  expect(value).toBe(currentValue);
                  break;
                  
                case 'delete':
                  parameterCache.delete(parameterName);
                  currentValue = null;
                  break;
              }
            }
            
            // Verify final state
            const finalValue = await parameterCache.get(parameterName);
            expect(finalValue).toBe(currentValue);
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should handle TTL expiration consistently for any parameter', async () => {
      // Mock Date.now to control time
      const originalDateNow = Date.now;
      let currentTime = 1000000;
      Date.now = jest.fn(() => currentTime);

      try {
        await fc.assert(
          fc.asyncProperty(
            validParameterName(),
            fc.string({ minLength: 1, maxLength: 100 }),
            async (parameterName, parameterValue) => {
              // Set parameter at current time
              parameterCache.set(parameterName, parameterValue);
              
              // Should be available immediately
              const immediateValue = await parameterCache.get(parameterName);
              expect(immediateValue).toBe(parameterValue);
              
              // Advance time beyond TTL (5 minutes = 300000ms)
              currentTime += 300001;
              
              // Should be expired now
              const expiredValue = await parameterCache.get(parameterName);
              expect(expiredValue).toBeNull();
              
              // Reset time for next iteration
              currentTime = 1000000;
            }
          ),
          { numRuns: 20 }
        );
      } finally {
        // Restore original Date.now
        Date.now = originalDateNow;
      }
    });

    it('should maintain cache size consistency with simple operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              name: validParameterName(),
              value: fc.string({ minLength: 0, maxLength: 100 }),
              action: fc.constantFrom('add', 'remove')
            }),
            { minLength: 1, maxLength: 10 }
          ),
          async (operations) => {
            // Start with clean cache
            parameterCache.clear();
            const expectedParameters = new Set<string>();
            
            for (const op of operations) {
              if (op.action === 'add') {
                parameterCache.set(op.name, op.value);
                expectedParameters.add(op.name);
              } else if (op.action === 'remove') {
                parameterCache.delete(op.name);
                expectedParameters.delete(op.name);
              }
              
              // Cache size should match expected parameters
              expect(parameterCache.size()).toBe(expectedParameters.size);
            }
          }
        ),
        { numRuns: 40 }
      );
    });

    it('should handle edge cases consistently', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            // Empty string value
            fc.constant(''),
            // Very long value
            fc.string({ minLength: 1000, maxLength: 2000 }),
            // Special characters in value (but not in parameter name)
            fc.string().filter(s => s.includes('\n') || s.includes('\t') || s.includes('"')),
            // Regular string
            fc.string({ minLength: 1, maxLength: 100 })
          ),
          async (parameterValue) => {
            const parameterName = '/satisfactory/test-param';
            
            // Set the parameter value
            parameterCache.set(parameterName, parameterValue);
            
            // Retrieve and verify
            const retrievedValue = await parameterCache.get(parameterName);
            expect(retrievedValue).toBe(parameterValue);
            
            // Clean up
            parameterCache.delete(parameterName);
            const deletedValue = await parameterCache.get(parameterName);
            expect(deletedValue).toBeNull();
          }
        ),
        { numRuns: 25 }
      );
    });
  });
});

/**
 * Feature: secrets-to-parameters-migration, Property 6: Shared Utility Consistency
 */