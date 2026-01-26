import * as fc from 'fast-check';
import { handler } from './index';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { 
  createJwtToken, 
  createMockAuthorizerEvent, 
  createMockContext,
  TEST_JWT_SECRET 
} from '../../shared/test-helpers';

// Mock AWS SDK
jest.mock('@aws-sdk/client-secrets-manager');
const mockSecretsClient = SecretsManagerClient as jest.MockedClass<typeof SecretsManagerClient>;
const mockSend = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockSecretsClient.prototype.send = mockSend;
  
  // Mock Secrets Manager response
  mockSend.mockResolvedValue({
    SecretString: TEST_JWT_SECRET
  });
});

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