// Configuration management for Lambda functions
import { TIMEOUTS } from './constants';

export const config = {
  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    clusterName: process.env.CLUSTER_NAME || 'satisfactory-cluster',
    serviceName: process.env.SERVICE_NAME || 'satisfactory-service',
    monitorLambdaArn: process.env.MONITOR_LAMBDA_ARN || ''
  },
  server: {
    port: 7777,
    apiTimeout: TIMEOUTS.API_REQUEST,
    maxStartupWaitTime: TIMEOUTS.SERVER_STARTUP,
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
    expirationTime: TIMEOUTS.JWT_EXPIRATION,
    maxAge: TIMEOUTS.JWT_EXPIRATION
  },
  monitor: {
    ruleName: 'satisfactory-monitor-rule',
    scheduleExpression: 'rate(2 minutes)'
  }
} as const;