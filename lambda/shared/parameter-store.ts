// Parameter Store client utility for configuration and secrets management
import { 
  GetParameterCommand, 
  PutParameterCommand, 
  DeleteParameterCommand,
  ParameterNotFound,
  ParameterType
} from '@aws-sdk/client-ssm';
import { getSSMClient } from './aws-clients';
import { parameterCache } from './parameter-cache';
import { ParameterNotFoundError, ParameterAccessDeniedError } from './errors';

/**
 * Get parameter value with caching and decryption
 */
export async function getParameter(name: string): Promise<string> {
  // Check cache first
  const cached = await parameterCache.get(name);
  if (cached) {
    return cached;
  }

  try {
    const client = getSSMClient();
    const command = new GetParameterCommand({ 
      Name: name,
      WithDecryption: true // Always decrypt SecureString parameters
    });
    const response = await client.send(command);
    
    if (!response?.Parameter?.Value) {
      throw new ParameterNotFoundError(name);
    }
    
    // Cache the result
    parameterCache.set(name, response.Parameter.Value);
    
    return response.Parameter.Value;
  } catch (error: any) {
    if (error instanceof ParameterNotFoundError) {
      throw error;
    }
    if (error instanceof ParameterNotFound || error.name === 'ParameterNotFound') {
      throw new ParameterNotFoundError(name);
    }
    if (error.name === 'AccessDeniedException') {
      throw new ParameterAccessDeniedError(name);
    }
    console.error(`Failed to retrieve parameter ${name}:`, error);
    throw error;
  }
}

/**
 * Put parameter value as SecureString and invalidate cache
 */
export async function putParameter(name: string, value: string): Promise<void> {
  try {
    const client = getSSMClient();
    const command = new PutParameterCommand({
      Name: name,
      Value: value,
      Type: ParameterType.SECURE_STRING,
      Overwrite: true, // Allow updating existing parameters
      Tier: 'Standard' // Use Standard tier to stay within free limits
    });
    
    await client.send(command);
    
    // Update cache with new value
    parameterCache.set(name, value);
  } catch (error: any) {
    if (error.name === 'AccessDeniedException') {
      throw new ParameterAccessDeniedError(name);
    }
    console.error(`Failed to put parameter ${name}:`, error);
    throw error;
  }
}

/**
 * Delete parameter and invalidate cache
 */
export async function deleteParameter(name: string): Promise<void> {
  try {
    const client = getSSMClient();
    const command = new DeleteParameterCommand({
      Name: name
    });
    
    await client.send(command);
    
    // Remove from cache
    parameterCache.delete(name);
  } catch (error: any) {
    if (error instanceof ParameterNotFound || error.name === 'ParameterNotFound') {
      throw new ParameterNotFoundError(name);
    }
    if (error.name === 'AccessDeniedException') {
      throw new ParameterAccessDeniedError(name);
    }
    console.error(`Failed to delete parameter ${name}:`, error);
    throw error;
  }
}