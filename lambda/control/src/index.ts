import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ApiRouter } from './router';

// Create router instance
const router = new ApiRouter();

/**
 * Main Lambda handler - delegates to router
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log('Event:', JSON.stringify(event, null, 2));
  
  return router.route(event);
};