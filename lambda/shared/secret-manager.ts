// Enhanced secret management with caching
import { GetSecretValueCommand, PutSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { getSecretsClient } from './aws-clients';
import { secretCache } from './secret-cache';
import { SecretNotFoundError } from './errors';

/**
 * Get secret value with caching
 */
export async function getSecret(secretId: string): Promise<string> {
  // Check cache first
  const cached = await secretCache.get(secretId);
  if (cached) {
    return cached;
  }

  try {
    const client = getSecretsClient();
    const command = new GetSecretValueCommand({ SecretId: secretId });
    const response = await client.send(command);
    
    if (!response.SecretString) {
      throw new SecretNotFoundError(secretId);
    }
    
    // Cache the result
    secretCache.set(secretId, response.SecretString);
    
    return response.SecretString;
  } catch (error) {
    if (error instanceof SecretNotFoundError) {
      throw error;
    }
    console.error(`Failed to retrieve secret ${secretId}:`, error);
    throw new SecretNotFoundError(secretId);
  }
}

/**
 * Put secret value and invalidate cache
 */
export async function putSecret(secretId: string, secretValue: string): Promise<void> {
  try {
    const client = getSecretsClient();
    const command = new PutSecretValueCommand({
      SecretId: secretId,
      SecretString: secretValue
    });
    
    await client.send(command);
    
    // Update cache with new value
    secretCache.set(secretId, secretValue);
  } catch (error) {
    console.error(`Failed to put secret ${secretId}:`, error);
    throw error;
  }
}