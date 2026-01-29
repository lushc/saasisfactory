// Shared AWS client instances for connection pooling
import { SSMClient } from '@aws-sdk/client-ssm';
import { ECSClient } from '@aws-sdk/client-ecs';
import { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { EC2Client } from '@aws-sdk/client-ec2';
import { config } from './config';

// Singleton AWS clients for connection pooling
let ssmClient: SSMClient;
let ecsClient: ECSClient;
let eventBridgeClient: EventBridgeClient;
let dynamoDbClient: DynamoDBClient;
let dynamoDbDocClient: DynamoDBDocumentClient;
let ec2Client: EC2Client;

export function getSSMClient(): SSMClient {
  if (!ssmClient) {
    ssmClient = new SSMClient({ region: config.aws.region });
  }
  return ssmClient;
}

export function getECSClient(): ECSClient {
  if (!ecsClient) {
    ecsClient = new ECSClient({ region: config.aws.region });
  }
  return ecsClient;
}

export function getEventBridgeClient(): EventBridgeClient {
  if (!eventBridgeClient) {
    eventBridgeClient = new EventBridgeClient({ region: config.aws.region });
  }
  return eventBridgeClient;
}

export function getDynamoDBClient(): DynamoDBClient {
  if (!dynamoDbClient) {
    dynamoDbClient = new DynamoDBClient({ region: config.aws.region });
  }
  return dynamoDbClient;
}

export function getDynamoDBDocumentClient(): DynamoDBDocumentClient {
  if (!dynamoDbDocClient) {
    const client = getDynamoDBClient();
    dynamoDbDocClient = DynamoDBDocumentClient.from(client);
  }
  return dynamoDbDocClient;
}

export function getEC2Client(): EC2Client {
  if (!ec2Client) {
    ec2Client = new EC2Client({ region: config.aws.region });
  }
  return ec2Client;
}