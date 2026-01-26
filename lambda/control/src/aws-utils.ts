import { 
  ECSClient, 
  UpdateServiceCommand, 
  DescribeTasksCommand, 
  ListTasksCommand,
  Task 
} from '@aws-sdk/client-ecs';
import { 
  EC2Client,
  DescribeNetworkInterfacesCommand
} from '@aws-sdk/client-ec2';
import { 
  SecretsManagerClient, 
  GetSecretValueCommand, 
  PutSecretValueCommand 
} from '@aws-sdk/client-secrets-manager';
import { 
  EventBridgeClient, 
  PutRuleCommand, 
  PutTargetsCommand, 
  DeleteRuleCommand, 
  RemoveTargetsCommand 
} from '@aws-sdk/client-eventbridge';
import { config } from '../../shared/config';
import { 
  SecretNotFoundError, 
  ServerStartFailedError,
  ApiTokenError 
} from '../../shared/errors';
import { SatisfactoryApiClient } from './satisfactory-api';

const ecsClient = new ECSClient({});
const ec2Client = new EC2Client({});
const secretsClient = new SecretsManagerClient({});
const eventBridgeClient = new EventBridgeClient({});

/**
 * Wait for an operation to succeed with exponential backoff
 */
export async function waitWithExponentialBackoff<T>(
  operation: () => Promise<T>,
  maxAttempts: number = 10,
  baseDelayMs: number = 1000
): Promise<T> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxAttempts - 1) throw error;
      
      const delay = baseDelayMs * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Max attempts reached');
}

/**
 * Update ECS service desired count
 */
export async function updateServiceDesiredCount(
  clusterName: string, 
  serviceName: string, 
  desiredCount: number
): Promise<void> {
  await ecsClient.send(new UpdateServiceCommand({
    cluster: clusterName,
    service: serviceName,
    desiredCount
  }));
}

/**
 * Get running tasks for a service
 */
export async function getServiceTasks(
  clusterName: string, 
  serviceName: string
): Promise<Task[]> {
  const listResponse = await ecsClient.send(new ListTasksCommand({
    cluster: clusterName,
    serviceName
  }));

  if (!listResponse.taskArns || listResponse.taskArns.length === 0) {
    return [];
  }

  const describeResponse = await ecsClient.send(new DescribeTasksCommand({
    cluster: clusterName,
    tasks: listResponse.taskArns
  }));

  return describeResponse.tasks || [];
}

/**
 * Get public IP address from ECS task
 */
export async function getTaskPublicIp(task: Task): Promise<string | undefined> {
  const eniAttachment = task.attachments?.find(
    attachment => attachment.type === 'ElasticNetworkInterface'
  );
  
  if (!eniAttachment) return undefined;
  
  const eniIdDetail = eniAttachment.details?.find(
    detail => detail.name === 'networkInterfaceId'
  );
  
  if (!eniIdDetail?.value) return undefined;
  
  try {
    // Query EC2 to get the actual public IP
    const response = await ec2Client.send(new DescribeNetworkInterfacesCommand({
      NetworkInterfaceIds: [eniIdDetail.value]
    }));
    
    const networkInterface = response.NetworkInterfaces?.[0];
    return networkInterface?.Association?.PublicIp;
  } catch (error) {
    console.error('Failed to get public IP from ENI:', error);
    return undefined;
  }
}

/**
 * Wait for task to reach RUNNING state
 */
export async function waitForTaskRunning(
  clusterName: string, 
  taskArn: string, 
  maxWaitTimeMs: number = 300000 // 5 minutes
): Promise<Task> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitTimeMs) {
    const response = await ecsClient.send(new DescribeTasksCommand({
      cluster: clusterName,
      tasks: [taskArn]
    }));
    
    const task = response.tasks?.[0];
    if (!task) {
      throw new Error('Task not found');
    }
    
    if (task.lastStatus === 'RUNNING') {
      return task;
    }
    
    if (task.lastStatus === 'STOPPED') {
      throw new Error(`Task stopped unexpectedly: ${task.stoppedReason}`);
    }
    
    // Wait 5 seconds before checking again
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  
  throw new Error('Timeout waiting for task to reach RUNNING state');
}

/**
 * Get secret value from Secrets Manager
 */
export async function getSecret(secretName: string): Promise<string> {
  try {
    const response = await secretsClient.send(new GetSecretValueCommand({
      SecretId: secretName
    }));
    
    if (!response.SecretString) {
      throw new SecretNotFoundError(secretName);
    }
    
    return response.SecretString;
  } catch (error) {
    if (error instanceof SecretNotFoundError) {
      throw error;
    }
    console.error(`Failed to retrieve secret ${secretName}:`, error);
    throw new SecretNotFoundError(secretName);
  }
}

/**
 * Update secret value in Secrets Manager
 */
export async function putSecret(secretName: string, secretValue: string): Promise<void> {
  await secretsClient.send(new PutSecretValueCommand({
    SecretId: secretName,
    SecretString: secretValue
  }));
}

/**
 * Generate secure random password
 */
export function generateSecurePassword(length: number): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * charset.length);
    password += charset[randomIndex];
  }
  
  return password;
}

/**
 * Create EventBridge rule for Monitor Lambda
 */
export async function createMonitorRule(
  ruleName: string, 
  lambdaArn: string, 
  scheduleExpression: string = 'rate(2 minutes)'
): Promise<void> {
  // Create the rule
  await eventBridgeClient.send(new PutRuleCommand({
    Name: ruleName,
    ScheduleExpression: scheduleExpression,
    State: 'ENABLED',
    Description: 'Trigger Monitor Lambda for Satisfactory Server'
  }));
  
  // Add Lambda as target
  await eventBridgeClient.send(new PutTargetsCommand({
    Rule: ruleName,
    Targets: [{
      Id: '1',
      Arn: lambdaArn
    }]
  }));
}

/**
 * Delete EventBridge rule for Monitor Lambda
 */
export async function deleteMonitorRule(ruleName: string): Promise<void> {
  try {
    // Remove targets first
    await eventBridgeClient.send(new RemoveTargetsCommand({
      Rule: ruleName,
      Ids: ['1']
    }));
    
    // Delete the rule
    await eventBridgeClient.send(new DeleteRuleCommand({
      Name: ruleName
    }));
  } catch (error) {
    // Rule might not exist, which is fine
    console.log(`Rule ${ruleName} not found or already deleted`);
  }
}

/**
 * Get running task for the Satisfactory service
 */
export async function getRunningTask(): Promise<Task | undefined> {
  const tasks = await getServiceTasks(config.aws.clusterName, config.aws.serviceName);
  return tasks.find(task => task.lastStatus === 'RUNNING');
}

/**
 * Ensure API token is valid and refresh if necessary
 */
export async function ensureValidApiToken(apiClient: SatisfactoryApiClient): Promise<string> {
  let apiToken = await getSecret(config.secrets.apiToken);
  
  const isTokenValid = await apiClient.verifyAuthenticationToken(apiToken);
  
  if (!isTokenValid) {
    console.log('API token invalid, regenerating...');
    try {
      const adminPassword = await getSecret(config.secrets.serverAdminPassword);
      apiToken = await apiClient.passwordLogin(adminPassword);
      await putSecret(config.secrets.apiToken, apiToken);
    } catch (error) {
      console.error('Failed to refresh API token:', error);
      throw new ApiTokenError('Failed to refresh API token');
    }
  }
  
  return apiToken;
}

/**
 * Wait for server API to become ready
 */
export async function waitForServerReady(
  apiClient: SatisfactoryApiClient, 
  maxAttempts: number = config.server.maxApiReadinessAttempts
): Promise<void> {
  for (let attempts = 0; attempts < maxAttempts; attempts++) {
    try {
      console.log(`Checking server API readiness (attempt ${attempts + 1}/${maxAttempts})...`);
      await apiClient.passwordlessLogin();
      console.log('Server API is ready');
      return;
    } catch (error) {
      if (attempts < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, config.server.apiReadinessCheckInterval));
      }
    }
  }
  throw new ServerStartFailedError('Server API did not become accessible within timeout');
}

/**
 * Claim server or login with existing credentials
 */
export async function claimOrLoginToServer(
  apiClient: SatisfactoryApiClient
): Promise<{ adminPassword: string, adminToken: string }> {
  try {
    const adminPassword = await getSecret(config.secrets.serverAdminPassword);
    console.log('Server already claimed, logging in with existing password');
    const adminToken = await apiClient.passwordLogin(adminPassword);
    return { adminPassword, adminToken };
  } catch (error) {
    console.log('Server not claimed yet, claiming server...');
    const adminPassword = generateSecurePassword(64);
    const initialAdminToken = await apiClient.passwordlessLogin();
    const adminToken = await apiClient.claimServer(initialAdminToken, adminPassword);
    await putSecret(config.secrets.serverAdminPassword, adminPassword);
    console.log('Server claimed successfully');
    return { adminPassword, adminToken };
  }
}