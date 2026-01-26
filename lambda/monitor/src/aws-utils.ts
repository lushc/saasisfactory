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
  DeleteRuleCommand, 
  RemoveTargetsCommand 
} from '@aws-sdk/client-eventbridge';

const ecsClient = new ECSClient({});
const ec2Client = new EC2Client({});
const secretsClient = new SecretsManagerClient({});
const eventBridgeClient = new EventBridgeClient({});

const CLUSTER_NAME = process.env.CLUSTER_NAME || 'satisfactory-cluster';
const SERVICE_NAME = process.env.SERVICE_NAME || 'satisfactory-service';
const MONITOR_RULE_NAME = process.env.MONITOR_RULE_NAME || 'satisfactory-monitor-rule';

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
 * Get running task for the Satisfactory service
 */
export async function getRunningTask(): Promise<Task | undefined> {
  const tasks = await getServiceTasks(CLUSTER_NAME, SERVICE_NAME);
  return tasks.find(task => task.lastStatus === 'RUNNING');
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
      throw new Error(`Secret ${secretName} not found or empty`);
    }
    
    return response.SecretString;
  } catch (error) {
    console.error(`Failed to retrieve secret ${secretName}:`, error);
    throw error;
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
    
    console.log(`Monitor rule ${ruleName} deleted successfully`);
  } catch (error) {
    // Rule might not exist, which is fine
    console.log(`Rule ${ruleName} not found or already deleted`);
  }
}

/**
 * Trigger server shutdown by setting desired count to 0 and cleaning up
 */
export async function triggerServerShutdown(): Promise<void> {
  console.log('Triggering server shutdown...');
  
  // Set ECS service desired count to 0
  await updateServiceDesiredCount(CLUSTER_NAME, SERVICE_NAME, 0);
  
  // Delete the monitor rule since server is stopping
  await deleteMonitorRule(MONITOR_RULE_NAME);
  
  console.log('Server shutdown initiated');
}