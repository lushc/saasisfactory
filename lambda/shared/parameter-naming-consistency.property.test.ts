import * as fc from 'fast-check';
import { config } from './config';

/**
 * Property-Based Tests for Parameter Naming Consistency
 * 
 * Property 4: Parameter Naming Consistency
 * For any parameter created by the system, it should use hierarchical naming with 
 * the /satisfactory/ prefix and follow consistent naming patterns across all functions
 * Validates: Requirements 6.1, 6.2, 6.3, 6.5
 */

describe('Parameter Naming Consistency Property Tests', () => {
  
  // Extract all parameter names from config for testing
  const allParameterNames = Object.values(config.parameters);
  
  // Define expected parameter structure
  const expectedParameters = {
    '/satisfactory/admin-password': {
      purpose: 'Admin panel authentication password',
      category: 'authentication',
      sensitivity: 'high'
    },
    '/satisfactory/jwt-secret': {
      purpose: 'JWT signing secret for admin panel',
      category: 'authentication', 
      sensitivity: 'high'
    },
    '/satisfactory/server-admin-password': {
      purpose: 'Satisfactory server admin password',
      category: 'server-management',
      sensitivity: 'high'
    },
    '/satisfactory/api-token': {
      purpose: 'Satisfactory server API authentication token',
      category: 'server-management',
      sensitivity: 'high'
    },
    '/satisfactory/client-password': {
      purpose: 'Client protection password for server',
      category: 'server-management',
      sensitivity: 'medium'
    }
  };

  /**
   * Property 4.1: Hierarchical Naming Structure
   * All parameters must use hierarchical naming with /satisfactory/ prefix
   * Validates: Requirement 6.1
   */
  describe('Property 4.1: Hierarchical Naming Structure', () => {
    it('should enforce /satisfactory/ prefix for all parameters', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...allParameterNames),
          (parameterName) => {
            // Must start with /satisfactory/
            expect(parameterName.startsWith('/satisfactory/')).toBe(true);
            
            // Must have exactly 3 parts when split by /
            const parts = parameterName.split('/');
            expect(parts).toHaveLength(3);
            expect(parts[0]).toBe(''); // Leading slash creates empty first element
            expect(parts[1]).toBe('satisfactory');
            expect(parts[2]).toBeDefined();
            expect(parts[2].length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should validate parameter name format consistency', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...allParameterNames),
          (parameterName) => {
            const parameterSuffix = parameterName.replace('/satisfactory/', '');
            
            // Parameter suffix should be kebab-case (lowercase with hyphens)
            expect(parameterSuffix).toMatch(/^[a-z]+(-[a-z]+)*$/);
            
            // Should not start or end with hyphen
            expect(parameterSuffix.startsWith('-')).toBe(false);
            expect(parameterSuffix.endsWith('-')).toBe(false);
            
            // Should not have consecutive hyphens
            expect(parameterSuffix.includes('--')).toBe(false);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Property 4.2: Logical Grouping and Organization
   * Parameters should be logically grouped and follow consistent patterns
   * Validates: Requirement 6.2
   */
  describe('Property 4.2: Logical Grouping and Organization', () => {
    it('should group authentication-related parameters consistently', () => {
      const authParameters = [
        '/satisfactory/admin-password',
        '/satisfactory/jwt-secret'
      ];
      
      fc.assert(
        fc.property(
          fc.constantFrom(...authParameters),
          (parameterName) => {
            // Authentication parameters should follow consistent naming
            const suffix = parameterName.replace('/satisfactory/', '');
            expect(['admin-password', 'jwt-secret']).toContain(suffix);
            
            // Should be in expected parameters list
            expect(expectedParameters).toHaveProperty(parameterName);
            expect(expectedParameters[parameterName as keyof typeof expectedParameters].category).toBe('authentication');
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should group server management parameters consistently', () => {
      const serverParameters = [
        '/satisfactory/server-admin-password',
        '/satisfactory/api-token',
        '/satisfactory/client-password'
      ];
      
      fc.assert(
        fc.property(
          fc.constantFrom(...serverParameters),
          (parameterName) => {
            // Server management parameters should follow consistent naming
            const suffix = parameterName.replace('/satisfactory/', '');
            expect(['server-admin-password', 'api-token', 'client-password']).toContain(suffix);
            
            // Should be in expected parameters list
            expect(expectedParameters).toHaveProperty(parameterName);
            expect(expectedParameters[parameterName as keyof typeof expectedParameters].category).toBe('server-management');
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  /**
   * Property 4.3: Descriptive Parameter Names
   * Parameter names should clearly indicate their purpose
   * Validates: Requirement 6.3
   */
  describe('Property 4.3: Descriptive Parameter Names', () => {
    it('should use descriptive names that indicate purpose', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...allParameterNames),
          (parameterName) => {
            const suffix = parameterName.replace('/satisfactory/', '');
            
            // Each parameter should contain descriptive keywords
            const descriptiveKeywords = [
              'password', 'secret', 'token', 'admin', 'client', 'jwt', 'api', 'server'
            ];
            
            const containsDescriptiveKeyword = descriptiveKeywords.some(keyword => 
              suffix.includes(keyword)
            );
            
            expect(containsDescriptiveKeyword).toBe(true);
            
            // Should have a defined purpose in our expected parameters
            expect(expectedParameters).toHaveProperty(parameterName);
            expect(expectedParameters[parameterName as keyof typeof expectedParameters].purpose).toBeDefined();
            expect(expectedParameters[parameterName as keyof typeof expectedParameters].purpose.length).toBeGreaterThan(10);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should avoid ambiguous or generic names', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...allParameterNames),
          (parameterName) => {
            const suffix = parameterName.replace('/satisfactory/', '');
            
            // Should not use generic/ambiguous terms
            const ambiguousTerms = ['data', 'value', 'config', 'setting', 'param', 'var'];
            const containsAmbiguousTerm = ambiguousTerms.some(term => 
              suffix.includes(term)
            );
            
            expect(containsAmbiguousTerm).toBe(false);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Property 4.4: Cross-Function Naming Consistency
   * Parameter names should be consistent across all Lambda functions
   * Validates: Requirement 6.5
   */
  describe('Property 4.4: Cross-Function Naming Consistency', () => {
    it('should maintain consistent parameter references across config', () => {
      // Verify all parameters in config.parameters are properly defined
      const configParameterNames = Object.values(config.parameters);
      const expectedParameterNames = Object.keys(expectedParameters);
      
      fc.assert(
        fc.property(
          fc.constantFrom(...configParameterNames),
          (parameterName) => {
            // Every parameter in config should be in our expected list
            expect(expectedParameterNames).toContain(parameterName);
          }
        ),
        { numRuns: 50 }
      );
      
      // Verify we have all expected parameters in config
      expect(configParameterNames.sort()).toEqual(expectedParameterNames.sort());
    });

    it('should use consistent naming patterns for similar concepts', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...allParameterNames),
          (parameterName) => {
            const suffix = parameterName.replace('/satisfactory/', '');
            
            // Password-related parameters should consistently use 'password'
            if (suffix.includes('password')) {
              expect(suffix.endsWith('password')).toBe(true);
            }
            
            // Token-related parameters should consistently use 'token'
            if (suffix.includes('token')) {
              expect(suffix.endsWith('token')).toBe(true);
            }
            
            // Secret-related parameters should consistently use 'secret'
            if (suffix.includes('secret')) {
              expect(suffix.endsWith('secret')).toBe(true);
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should maintain parameter completeness across system', () => {
      // Verify we have all required parameter types for the system to function
      const requiredParameterTypes = [
        'admin-password',    // Admin panel authentication
        'jwt-secret',        // JWT token signing
        'server-admin-password', // Server administration
        'api-token',         // API authentication
        'client-password'    // Client access control
      ];
      
      fc.assert(
        fc.property(
          fc.constantFrom(...requiredParameterTypes),
          (requiredType) => {
            const expectedParameterName = `/satisfactory/${requiredType}`;
            expect(allParameterNames).toContain(expectedParameterName);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Property 4.5: Parameter Name Validation Rules
   * Comprehensive validation of parameter naming rules
   * Validates: Requirements 6.1, 6.2, 6.3, 6.5
   */
  describe('Property 4.5: Parameter Name Validation Rules', () => {
    it('should validate complete parameter naming compliance', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...allParameterNames),
          (parameterName) => {
            // Rule 1: Must use hierarchical naming with /satisfactory/ prefix (6.1)
            expect(parameterName.startsWith('/satisfactory/')).toBe(true);
            
            // Rule 2: Must be logically organized (6.2)
            expect(expectedParameters).toHaveProperty(parameterName);
            const parameterInfo = expectedParameters[parameterName as keyof typeof expectedParameters];
            expect(['authentication', 'server-management']).toContain(parameterInfo.category);
            
            // Rule 3: Must have descriptive name (6.3)
            expect(parameterInfo.purpose).toBeDefined();
            expect(parameterInfo.purpose.length).toBeGreaterThan(10);
            
            // Rule 4: Must follow consistent patterns (6.5)
            const suffix = parameterName.replace('/satisfactory/', '');
            expect(suffix).toMatch(/^[a-z]+(-[a-z]+)*$/);
            
            // Rule 5: Must be complete and necessary
            expect(parameterInfo.sensitivity).toBeDefined();
            expect(['high', 'medium', 'low']).toContain(parameterInfo.sensitivity);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject invalid parameter name patterns', () => {
      const invalidPatterns = [
        '/satisfactory/',           // Empty suffix
        '/satisfactory/Admin-Password', // CamelCase
        '/satisfactory/admin_password', // Snake_case
        '/satisfactory/adminpassword',  // No separation
        '/satisfactory/admin--password', // Double hyphen
        '/satisfactory/-admin-password', // Leading hyphen
        '/satisfactory/admin-password-', // Trailing hyphen
        'satisfactory/admin-password',   // Missing leading slash
        '/Satisfactory/admin-password',  // Wrong case in prefix
        '/satisfactory/123-password',    // Starting with number
        '/satisfactory/admin-password!', // Special characters
      ];
      
      fc.assert(
        fc.property(
          fc.constantFrom(...invalidPatterns),
          (invalidPattern) => {
            // None of these invalid patterns should be in our valid parameter list
            expect(allParameterNames).not.toContain(invalidPattern);
          }
        ),
        { numRuns: invalidPatterns.length }
      );
    });
  });
});

/**
 * Feature: secrets-to-parameters-migration, Property 4: Parameter Naming Consistency
 * **Validates: Requirements 6.1, 6.2, 6.3, 6.5**
 */