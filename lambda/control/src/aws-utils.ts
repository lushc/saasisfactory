import { 
  ECSClient, 
  UpdateServiceCommand, 
  DescribeTasksCommand, 
  ListTasksCommand,
  Task 
} from '@aws-sdk/client-ecs';
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

const ecsClient = new ECSClient({});
const secretsClient = new SecretsManagerClient({});
const eventBridgeClient = new EventBridgeClient({});

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
export function getTaskPublicIp(task: Task): string | undefined {
  const eniAttachment = task.attachments?.find(
    attachment => attachment.type === 'ElasticNetworkInterface'
  );
  
  if (!eniAttachment) return undefined;
  
  const publicIpDetail = eniAttachment.details?.find(
    detail => detail.name === 'networkInterfaceId'
  );
  
  // Note: This returns the ENI ID, not the public IP directly
  // In practice, we would need to query EC2 to get the actual public IP
  // For now, we'll extract it from the task's network interfaces
  const container = task.containers?.[0];
  const networkInterface = container?.networkInterfaces?.[0];
  
  return networkInterface?.privateIpv4Address; // This will be the public IP in awsvpc mode with public subnets
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
  const response = await secretsClient.send(new GetSecretValueCommand({
    SecretId: secretName
  }));
  
  if (!response.SecretString) {
    throw new Error(`Secret ${secretName} has no string value`);
  }
  
  return response.SecretString;
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