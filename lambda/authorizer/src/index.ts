import { APIGatewayRequestAuthorizerEvent, APIGatewayAuthorizerResult, Context } from 'aws-lambda';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import jwt from 'jsonwebtoken';
import { JWTPayload } from '../../shared/types';
import { config } from '../../shared/config';
import { AuthenticationError, SecretNotFoundError } from '../../shared/errors';

const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION });

/**
 * Lambda authorizer function that validates JWT tokens for API Gateway requests
 * 
 * @param event - API Gateway authorizer event containing headers and request context
 * @param context - Lambda context
 * @returns Authorization decision with optional context
 */
export const handler = async (
  event: APIGatewayRequestAuthorizerEvent,
  context: Context
): Promise<APIGatewayAuthorizerResult> => {
  console.log('Authorizer invoked:', JSON.stringify(event, null, 2));

  try {
    // Extract JWT token from Authorization header
    const authHeader = event.headers?.authorization || event.headers?.Authorization;
    
    if (!authHeader) {
      console.log('No authorization header found');
      return generatePolicy('user', 'Deny', event.methodArn);
    }

    // Check if header starts with "Bearer "
    if (!authHeader.startsWith('Bearer ')) {
      console.log('Authorization header does not start with Bearer');
      return generatePolicy('user', 'Deny', event.methodArn);
    }

    // Extract token
    const token = authHeader.substring(7); // Remove "Bearer " prefix
    
    if (!token) {
      console.log('No token found in authorization header');
      return generatePolicy('user', 'Deny', event.methodArn);
    }

    // Get JWT secret from Secrets Manager
    const jwtSecret = await getJWTSecret();
    
    // Verify JWT token
    const decoded = jwt.verify(token, jwtSecret) as JWTPayload;
    
    // Check token expiration (additional check, jwt.verify already checks this)
    const currentTime = Math.floor(Date.now() / 1000);
    if (decoded.exp < currentTime) {
      console.log('Token has expired');
      return generatePolicy('user', 'Deny', event.methodArn);
    }

    // Check if token is within 1-hour limit from issuance
    const tokenAge = currentTime - decoded.iat;
    if (tokenAge > config.jwt.maxAge) {
      console.log('Token is older than 1 hour');
      return generatePolicy('user', 'Deny', event.methodArn);
    }

    // Validate subject
    if (decoded.sub !== 'admin') {
      console.log('Invalid token subject');
      return generatePolicy('user', 'Deny', event.methodArn);
    }

    console.log('Token validation successful');
    return generatePolicy(decoded.sub, 'Allow', event.methodArn, {
      userId: decoded.sub
    });

  } catch (error) {
    console.error('Authorization error:', error);
    
    // Handle specific JWT errors
    if (error instanceof jwt.JsonWebTokenError) {
      console.log('JWT validation failed:', error.message);
    } else if (error instanceof jwt.TokenExpiredError) {
      console.log('JWT token expired:', error.message);
    } else if (error instanceof jwt.NotBeforeError) {
      console.log('JWT token not active yet:', error.message);
    }
    
    return generatePolicy('user', 'Deny', event.methodArn);
  }
};

/**
 * Retrieve JWT secret from AWS Secrets Manager
 */
async function getJWTSecret(): Promise<string> {
  try {
    const command = new GetSecretValueCommand({ SecretId: config.secrets.jwtSecret });
    const response = await secretsClient.send(command);
    
    if (!response.SecretString) {
      throw new SecretNotFoundError(config.secrets.jwtSecret);
    }
    
    return response.SecretString;
  } catch (error) {
    if (error instanceof SecretNotFoundError) {
      throw error;
    }
    console.error('Failed to retrieve JWT secret:', error);
    throw new SecretNotFoundError(config.secrets.jwtSecret);
  }
}

/**
 * Generate IAM policy for API Gateway
 */
function generatePolicy(
  principalId: string,
  effect: 'Allow' | 'Deny',
  resource: string,
  context?: Record<string, any>
): APIGatewayAuthorizerResult {
  const policy: APIGatewayAuthorizerResult = {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: effect,
          Resource: resource,
        },
      ],
    },
  };

  if (context) {
    policy.context = context;
  }

  return policy;
}