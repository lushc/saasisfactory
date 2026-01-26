// Configuration management for Lambda functions
export const config = {
  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    clusterName: process.env.CLUSTER_NAME || 'satisfactory-cluster',
    serviceName: process.env.SERVICE_NAME || 'satisfactory-service',
    monitorLambdaArn: process.env.MONITOR_LAMBDA_ARN || ''
  },
  server: {
    port: 7777,
    apiTimeout: 30000,
    maxStartupWaitTime: 300000,
    maxApiReadinessAttempts: 30,
    apiReadinessCheckInterval: 10000
  },
  secrets: {
    adminPassword: 'satisfactory-admin-password',
    jwtSecret: 'satisfactory-jwt-secret',
    serverAdminPassword: 'satisfactory-server-admin-password',
    apiToken: 'satisfactory-api-token',
    clientPassword: 'satisfactory-client-password'
  },
  jwt: {
    expirationTime: 3600, // 1 hour
    maxAge: 3600 // 1 hour
  },
  monitor: {
    ruleName: 'satisfactory-monitor-rule',
    scheduleExpression: 'rate(2 minutes)'
  }
} as const;