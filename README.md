# Satisfactory On-Demand Server

An on-demand Satisfactory game server solution deployed on AWS infrastructure that automatically scales down when not in use, providing cost-effective hosting for small gaming groups.

## Overview

This solution enables cost-effective hosting of a Satisfactory dedicated server that automatically shuts down after configurable timeout when no players are connected. The system consists of:

- **Infrastructure Layer**: AWS resources defined using CloudFormation templates
- **Backend API Layer**: Three Lambda functions that manage authentication, server lifecycle, and monitoring
- **Frontend Layer**: React-based admin panel for server management

## Prerequisites

Before deploying this solution, ensure you have the following installed and configured:

### Required Software

1. **AWS CLI v2** - For deploying CloudFormation and managing AWS resources
   ```bash
   # Install AWS CLI (macOS)
   brew install awscli
   
   # Install AWS CLI (Linux)
   curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
   unzip awscliv2.zip
   sudo ./aws/install
   
   # Configure AWS CLI
   aws configure
   ```

2. **Node.js 24+** - For building Lambda functions and Admin Panel
   ```bash
   # Install Node.js (macOS)
   brew install node@24
   
   # Install Node.js (Linux - using NodeSource)
   curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
   sudo apt-get install -y nodejs
   
   # Verify installation
   node --version  # Should be v24.x.x
   npm --version
   ```

3. **Docker** (Optional) - For local container testing
   ```bash
   # Install Docker (macOS)
   brew install --cask docker
   
   # Install Docker (Linux)
   curl -fsSL https://get.docker.com -o get-docker.sh
   sudo sh get-docker.sh
   ```

### AWS Account Requirements

1. **AWS Account** with appropriate permissions for:
   - CloudFormation (create/update/delete stacks)
   - ECS (create clusters, services, task definitions)
   - Lambda (create/update functions)
   - API Gateway (create HTTP APIs)
   - Secrets Manager (create/read/update secrets)
   - DynamoDB (create tables)
   - EFS (create file systems)
   - S3 (create buckets, upload objects)
   - CloudFront (create distributions)
   - EventBridge (create/delete rules)
   - IAM (create roles and policies)
   - CloudWatch (create log groups)
   - AWS Budgets (create budgets and alerts)
   - SNS (create topics and subscriptions)

2. **Email Address** for cost alert notifications

3. **AWS CLI Configured** with credentials that have the above permissions

## Quick Start (Automated Deployment)

For the fastest deployment experience, use our automated scripts:

### Option 1: Automated Deployment (Recommended)

```bash
# 1. Validate your environment
./scripts/validate-environment.sh

# 2. Deploy the complete infrastructure
./scripts/deploy.sh --email your-email@example.com

# 3. When finished, clean up to stop all charges
./scripts/cleanup.sh
```

**Deployment Scripts:**

- **`scripts/validate-environment.sh`** - Checks prerequisites and AWS permissions
- **`scripts/deploy.sh`** - Complete automated deployment with error handling
- **`scripts/cleanup.sh`** - Safe infrastructure removal and cost cleanup

**Deploy Script Options:**
```bash
./scripts/deploy.sh [OPTIONS]

Options:
  -e, --email EMAIL              Budget alert email address (required)
  -s, --stack-name NAME          CloudFormation stack name (default: satisfactory-server)
  -t, --timeout MINUTES         Shutdown timeout in minutes (default: 10)
  -m, --memory MB                Server memory in MB (default: 8192)
  -c, --cpu UNITS                Server CPU units (default: 1024)
  -b, --budget AMOUNT            Monthly budget threshold in USD (default: 20)
  -h, --help                     Show help message

Examples:
  ./scripts/deploy.sh --email user@example.com
  ./scripts/deploy.sh --email user@example.com --timeout 15 --memory 16384
```

**Cleanup Script Options:**
```bash
./scripts/cleanup.sh [OPTIONS]

Options:
  -s, --stack-name NAME          CloudFormation stack name (default: satisfactory-server)
  --delete-secrets               Also delete secrets (PERMANENT - cannot be undone)
  -h, --help                     Show help message

Examples:
  ./scripts/cleanup.sh                    # Preserves secrets for redeployment
  ./scripts/cleanup.sh --delete-secrets   # Complete permanent cleanup
```

**What the automated deployment does:**
1. ✅ Validates environment and prerequisites
2. ✅ Installs all Lambda and Admin Panel dependencies
3. ✅ Builds TypeScript Lambda functions
4. ✅ Deploys CloudFormation infrastructure
5. ✅ Configures secrets and environment variables
6. ✅ Builds and deploys Admin Panel to S3/CloudFront
7. ✅ Provides complete deployment summary with URLs

**Estimated deployment time:** 10-15 minutes

---

## Manual Deployment Instructions

If you prefer manual control over each step, follow these detailed instructions:

### Step 1: Clone and Prepare the Project

```bash
# Clone the repository (if not already done)
git clone <repository-url>
cd satisfactory-on-demand-server

# Install dependencies for all Lambda functions
cd lambda/authorizer && npm install && cd ../..
cd lambda/control && npm install && cd ../..
cd lambda/monitor && npm install && cd ../..

# Install dependencies for Admin Panel
cd admin-panel && npm install && cd ..
```

### Step 2: Build Lambda Functions

```bash
# Build all Lambda functions

### Step 1: Clone and Prepare the Project

```bash
# Clone the repository (if not already done)
git clone <repository-url>
cd satisfactory-on-demand-server

# Install dependencies for all Lambda functions
cd lambda/authorizer && npm install && cd ../..
cd lambda/control && npm install && cd ../..
cd lambda/monitor && npm install && cd ../..

# Install dependencies for Admin Panel
cd admin-panel && npm install && cd ..
```

### Step 2: Build Lambda Functions

```bash
# Build all Lambda functions
cd lambda/authorizer && npm run build && cd ../..
cd lambda/control && npm run build && cd ../..
cd lambda/monitor && npm run build && cd ../..
```

### Step 3: Deploy CloudFormation Stack

```bash
# Deploy the main CloudFormation stack
aws cloudformation create-stack \
  --stack-name satisfactory-server \
  --template-body file://cloudformation/main.yaml \
  --parameters \
    ParameterKey=ShutdownTimeoutMinutes,ParameterValue=10 \
    ParameterKey=ServerMemory,ParameterValue=8192 \
    ParameterKey=ServerCPU,ParameterValue=1024 \
    ParameterKey=BudgetAlertEmail,ParameterValue=your-email@example.com \
    ParameterKey=MonthlyBudgetThreshold,ParameterValue=20 \
  --capabilities CAPABILITY_IAM

# Wait for stack creation to complete (this may take 10-15 minutes)
aws cloudformation wait stack-create-complete --stack-name satisfactory-server

# Check stack status
aws cloudformation describe-stacks --stack-name satisfactory-server --query 'Stacks[0].StackStatus'
```

**Note**: Replace `your-email@example.com` with your actual email address for cost alerts.

### Step 4: Run Post-Deployment Configuration

```bash
# Make the post-deploy script executable
chmod +x scripts/post-deploy.sh

# Run the post-deployment configuration
./scripts/post-deploy.sh
```

This script will:
- Generate secure admin password and JWT secret (if not already set)
- Retrieve the API Gateway URL from CloudFormation
- Create the `.env.local` file for the Admin Panel
- Display the admin password and next steps

### Step 5: Build and Deploy Admin Panel

```bash
# Build the Admin Panel
cd admin-panel
npm run build

# Get the S3 bucket name from CloudFormation
S3_BUCKET=$(aws cloudformation describe-stacks \
  --stack-name satisfactory-server \
  --query 'Stacks[0].Outputs[?OutputKey==`S3BucketName`].OutputValue' \
  --output text)

# Upload the built Admin Panel to S3
aws s3 sync dist/ s3://$S3_BUCKET/

# Get the CloudFront URL (if using CloudFront)
CLOUDFRONT_URL=$(aws cloudformation describe-stacks \
  --stack-name satisfactory-server \
  --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontUrl`].OutputValue' \
  --output text)

echo "Admin Panel deployed to: $CLOUDFRONT_URL"
```

### Step 6: Access the Admin Panel

1. **Get the Admin Panel URL** from CloudFormation outputs:
   ```bash
   aws cloudformation describe-stacks \
     --stack-name satisfactory-server \
     --query 'Stacks[0].Outputs[?OutputKey==`AdminPanelUrl`].OutputValue' \
     --output text
   ```

2. **Login** using the admin password displayed by the post-deploy script

3. **Start the server** using the "Start Server" button in the Admin Panel

4. **Connect to the game** using the public IP address and port 7777 displayed in the Admin Panel

## Post-Deployment Configuration

### Setting Up Client Password Protection (Optional)

1. Start the Satisfactory server through the Admin Panel
2. Navigate to the "Client Password" section
3. Set a password to require players to enter it when joining
4. Or leave it empty for no password protection

### Monitoring and Alerts

The solution includes built-in cost monitoring:
- **AWS Budgets**: Alerts when monthly costs exceed 80% and 100% of threshold
- **SNS Notifications**: Email alerts sent to the configured email address
- **CloudWatch Logs**: All Lambda functions log to CloudWatch for troubleshooting

### Customizing Configuration

You can update the CloudFormation stack with different parameters:

```bash
aws cloudformation update-stack \
  --stack-name satisfactory-server \
  --template-body file://cloudformation/main.yaml \
  --parameters \
    ParameterKey=ShutdownTimeoutMinutes,ParameterValue=15 \
    ParameterKey=ServerMemory,ParameterValue=16384 \
    ParameterKey=ServerCPU,ParameterValue=2048 \
    ParameterKey=BudgetAlertEmail,ParameterValue=your-email@example.com \
    ParameterKey=MonthlyBudgetThreshold,ParameterValue=30 \
  --capabilities CAPABILITY_IAM
```

## Troubleshooting

### Common Deployment Issues

#### CloudFormation Stack Creation Fails

**Issue**: Stack creation fails with permission errors
```
User: arn:aws:iam::123456789012:user/username is not authorized to perform: iam:CreateRole
```

**Solution**: Ensure your AWS user/role has the required permissions listed in the prerequisites section.

**Issue**: Stack creation fails due to resource limits
```
Cannot exceed quota for PoliciesPerRole: 10
```

**Solution**: Check your AWS account limits and request increases if needed, or clean up unused IAM resources.

#### Lambda Function Deployment Issues

**Issue**: Lambda function code is too large
```
Unzipped size must be smaller than 262144000 bytes
```

**Solution**: Ensure you've run `npm run build` in each Lambda directory to compile TypeScript and minimize bundle size.

**Issue**: Lambda function fails to start
```
Runtime.ImportModuleError: Error: Cannot find module 'aws-sdk'
```

**Solution**: Verify all dependencies are installed with `npm install` in each Lambda directory.

#### Admin Panel Issues

**Issue**: Admin Panel shows "Unable to connect to server"

**Solutions**:
1. Verify the API Gateway URL is correct in `.env.local`
2. Check that the CloudFormation stack deployed successfully
3. Ensure Lambda functions are deployed and running

**Issue**: Login fails with correct password

**Solutions**:
1. Verify the admin password using:
   ```bash
   aws secretsmanager get-secret-value --secret-id satisfactory-admin-password --query 'SecretString' --output text
   ```
2. Check CloudWatch logs for the Authorizer Lambda function
3. Ensure JWT secret was generated correctly

#### Server Start Issues

**Issue**: Server fails to start or gets stuck in "starting" state

**Solutions**:
1. Check ECS task logs in CloudWatch:
   ```bash
   aws logs describe-log-groups --log-group-name-prefix "/ecs/satisfactory"
   ```
2. Verify ECS service has sufficient capacity in your region
3. Check that the Docker image `wolveix/satisfactory-server:latest` is accessible

**Issue**: Server starts but shows "Server not accessible"

**Solutions**:
1. Verify security group allows inbound traffic on port 7777
2. Check that ECS task has a public IP assigned
3. Ensure the Satisfactory server container is healthy

#### Cost and Billing Issues

**Issue**: Unexpected AWS charges

**Solutions**:
1. Check AWS Budgets alerts in your email
2. Review AWS Cost Explorer for detailed cost breakdown
3. Ensure server is stopping automatically when not in use
4. Verify ECS tasks are not stuck in running state

### Debugging Commands

#### Check CloudFormation Stack Status
```bash
aws cloudformation describe-stacks --stack-name satisfactory-server
aws cloudformation describe-stack-events --stack-name satisfactory-server
```

#### Check Lambda Function Logs
```bash
# List log groups
aws logs describe-log-groups --log-group-name-prefix "/aws/lambda/satisfactory"

# View recent logs
aws logs tail /aws/lambda/satisfactory-control --follow
aws logs tail /aws/lambda/satisfactory-monitor --follow
aws logs tail /aws/lambda/satisfactory-authorizer --follow
```

#### Check ECS Service Status
```bash
# Get cluster and service names
aws ecs list-clusters
aws ecs list-services --cluster satisfactory-cluster

# Check service status
aws ecs describe-services --cluster satisfactory-cluster --services satisfactory-service

# Check task status
aws ecs list-tasks --cluster satisfactory-cluster --service-name satisfactory-service
aws ecs describe-tasks --cluster satisfactory-cluster --tasks <task-arn>
```

#### Check Secrets
```bash
# List all satisfactory-related secrets
aws secretsmanager list-secrets --filters Key=name,Values=satisfactory

# Get specific secret value
aws secretsmanager get-secret-value --secret-id satisfactory-admin-password
```

#### Test API Endpoints
```bash
# Get API Gateway URL
API_URL=$(aws cloudformation describe-stacks --stack-name satisfactory-server --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayUrl`].OutputValue' --output text)

# Test login endpoint
curl -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"password":"your-admin-password"}'

# Test status endpoint (requires JWT token)
curl -X GET "$API_URL/server/status" \
  -H "Authorization: Bearer your-jwt-token"
```

### Getting Help

If you encounter issues not covered in this troubleshooting guide:

1. **Check CloudWatch Logs** for detailed error messages
2. **Review AWS Service Health** at https://status.aws.amazon.com/
3. **Verify AWS Account Limits** in the AWS Console
4. **Check the GitHub Issues** for known problems and solutions

## Cleanup and Uninstallation

To completely remove the solution and stop all charges:

### Step 1: Stop the Server
```bash
# Stop the server through the Admin Panel or API
curl -X POST "$API_URL/server/stop" -H "Authorization: Bearer your-jwt-token"
```

### Step 2: Empty S3 Bucket
```bash
# Get bucket name
S3_BUCKET=$(aws cloudformation describe-stacks --stack-name satisfactory-server --query 'Stacks[0].Outputs[?OutputKey==`S3BucketName`].OutputValue' --output text)

# Empty the bucket
aws s3 rm s3://$S3_BUCKET --recursive
```

### Step 3: Delete CloudFormation Stack
```bash
# Delete the stack
aws cloudformation delete-stack --stack-name satisfactory-server

# Wait for deletion to complete
aws cloudformation wait stack-delete-complete --stack-name satisfactory-server
```

### Step 4: Clean Up Secrets (Optional)
```bash
# Delete secrets if you don't plan to redeploy
aws secretsmanager delete-secret --secret-id satisfactory-admin-password --force-delete-without-recovery
aws secretsmanager delete-secret --secret-id satisfactory-jwt-secret --force-delete-without-recovery
aws secretsmanager delete-secret --secret-id satisfactory-server-admin-password --force-delete-without-recovery
aws secretsmanager delete-secret --secret-id satisfactory-api-token --force-delete-without-recovery
aws secretsmanager delete-secret --secret-id satisfactory-client-password --force-delete-without-recovery
```

**Note**: Deleting secrets with `--force-delete-without-recovery` is permanent and cannot be undone.

## Key Features

- **Auto-scaling**: Server automatically shuts down after configurable timeout when no players are connected
- **Web-based management**: React admin panel for starting, stopping, and monitoring the server
- **Persistent storage**: Game saves are retained across server restarts using Amazon EFS
- **Cost optimization**: Designed to minimize AWS costs by only running when needed (estimated ~$18/month for 4 hours/day usage)
- **Security**: Password-protected admin panel with JWT authentication, secure secret management
- **Client password management**: Set and manage Satisfactory server client protection passwords

## Architecture

The solution leverages:
- **ECS Fargate**: Runs the Satisfactory server container (wolveix/satisfactory-server:latest)
- **Amazon EFS**: Provides persistent storage for game saves mounted at `/config`
- **Lambda Functions**: Handle authentication, server lifecycle, and monitoring
  - **Authorizer Lambda**: Validates JWT tokens for API Gateway requests
  - **Control Lambda**: Manages server start/stop operations, status queries, and client password management
  - **Monitor Lambda**: Tracks player activity and handles auto-shutdown with DynamoDB timer state management
- **API Gateway HTTP API**: Exposes REST endpoints with Lambda authorizer integration
- **Secrets Manager**: Securely stores admin passwords, JWT secrets, and Satisfactory Server API tokens
- **DynamoDB**: Tracks shutdown timer state for auto-shutdown functionality
- **EventBridge**: Triggers monitoring Lambda every 2 minutes (created dynamically when server starts)
- **S3 + CloudFront**: Hosts the admin panel static website

### Server Lifecycle Management

The Control Lambda implements sophisticated server management:
- **Automatic Server Claiming**: On first startup, generates a secure password and claims the server
- **Token Management**: Automatically handles Satisfactory Server API token refresh and validation
- **Graceful Shutdown**: Calls the server's shutdown API to save game state before stopping
- **IP Address Resolution**: Retrieves public IP from ECS tasks and EC2 network interfaces
- **Error Handling**: Comprehensive error handling with structured error responses

## API Endpoints

The backend provides a comprehensive REST API with the following endpoints:

### Authentication
- `POST /auth/login` - Authenticate with admin password and receive JWT token
  - **Request**: `{ "password": "string" }`
  - **Response**: `{ "token": "jwt-string", "expiresIn": 3600 }`
  - **Security**: No authentication required (this is the login endpoint)

### Server Management
- `POST /server/start` - Start the Satisfactory server
  - **Response**: `{ "status": "running", "taskArn": "string", "publicIp": "string" }`
  - **Behavior**: Automatically claims server on first run, creates monitoring schedule
  - **Security**: Requires JWT authentication

- `POST /server/stop` - Gracefully stop the server
  - **Response**: `{ "status": "stopping" }`
  - **Behavior**: Calls server shutdown API to save game, removes monitoring schedule
  - **Security**: Requires JWT authentication

- `GET /server/status` - Get comprehensive server status
  - **Response**: 
    ```json
    {
      "serverState": "offline|starting|running|stopping",
      "publicIp": "string",
      "port": 7777,
      "playerCount": 0,
      "serverName": "string",
      "gamePhase": "string",
      "lastUpdated": "ISO-8601-timestamp"
    }
    ```
  - **Security**: Requires JWT authentication

### Client Password Management
- `GET /server/client-password` - Retrieve current client protection password
  - **Response**: `{ "password": "string|null" }`
  - **Note**: Returns `null` if no password protection is set
  - **Security**: Requires JWT authentication

- `POST /server/client-password` - Set or update client protection password
  - **Request**: `{ "password": "string" }`
  - **Response**: `{ "success": true, "message": "string" }`
  - **Note**: Empty string removes password protection
  - **Security**: Requires JWT authentication

### Authentication & Error Handling
- **JWT Tokens**: 1-hour expiration, automatic refresh required
- **Authorization Header**: `Authorization: Bearer <jwt-token>`
- **Error Responses**: Standardized format with error codes, messages, and timestamps
- **CORS**: Enabled for all endpoints with appropriate headers

## Project Structure

```
.
├── cloudformation/          # Infrastructure as Code templates
│   └── main.yaml           # Complete CloudFormation template
├── lambda/                 # Backend Lambda functions
│   ├── authorizer/         # JWT token validation
│   │   ├── src/
│   │   │   ├── index.ts           # Main authorizer logic
│   │   │   └── index.property.test.ts  # Property-based tests
│   │   ├── package.json    # Dependencies (jsonwebtoken, AWS SDK)
│   │   └── tsconfig.json
│   ├── control/            # Server lifecycle management
│   │   ├── src/
│   │   │   ├── index.ts           # Main API handler with all endpoints
│   │   │   ├── aws-utils.ts       # AWS service integrations
│   │   │   ├── satisfactory-api.ts # Satisfactory Server API client
│   │   │   ├── types.ts           # Request/response type definitions
│   │   │   └── index.property.test.ts  # Property-based tests
│   │   ├── package.json    # Dependencies (AWS SDK v3, axios, jsonwebtoken)
│   │   └── tsconfig.json
│   ├── monitor/            # Auto-shutdown monitoring
│   │   ├── src/
│   │   │   ├── index.ts           # Timer logic and player monitoring
│   │   │   ├── aws-utils.ts       # AWS service integrations
│   │   │   ├── dynamodb-utils.ts  # DynamoDB timer state management
│   │   │   ├── satisfactory-api.ts # Satisfactory Server API client
│   │   │   ├── types.ts           # Type definitions
│   │   │   └── index.property.test.ts  # Property-based tests
│   │   ├── package.json    # Dependencies (AWS SDK v3, axios)
│   │   └── tsconfig.json
│   └── shared/             # Shared utilities
│       ├── config.ts       # Centralized configuration management
│       ├── errors.ts       # Custom error types with HTTP status codes
│       ├── test-helpers.ts # Shared testing utilities
│       └── types.ts        # Common type definitions
├── admin-panel/            # React frontend application
│   ├── src/
│   │   ├── components/     # React components
│   │   │   ├── LoginForm.tsx           # Password authentication
│   │   │   ├── Dashboard.tsx           # Main container with routing
│   │   │   ├── ServerStatus.tsx        # Server state display
│   │   │   ├── ServerControls.tsx      # Start/stop functionality
│   │   │   ├── ClientPasswordManager.tsx # Password management
│   │   │   ├── LoadingSpinner.tsx      # Reusable loading component
│   │   │   └── ErrorBoundary.tsx       # Error boundary component
│   │   ├── services/       # API service layer
│   │   │   └── api.ts      # Centralized API client with auth handling
│   │   ├── hooks/          # Custom React hooks
│   │   │   ├── useServerStatus.ts      # Server status management
│   │   │   ├── useServerControls.ts    # Server control operations
│   │   │   └── useClientPassword.ts    # Client password management
│   │   ├── types/          # TypeScript type definitions
│   │   │   └── server.ts   # API response interfaces
│   │   ├── test/           # Test configuration
│   │   │   └── setup.ts    # Vitest setup with testing-library
│   │   ├── App.tsx         # Main app component with auth routing
│   │   └── main.tsx        # Entry point
│   ├── public/             # Static assets
│   ├── dist/               # Build output (generated)
│   ├── .env.example        # Environment variable template
│   ├── .env.local          # Local development configuration (generated)
│   ├── tailwind.config.js  # Tailwind CSS configuration
│   ├── postcss.config.js   # PostCSS configuration
│   ├── vitest.config.ts    # Vitest test configuration
│   └── package.json        # Dependencies and scripts
├── scripts/                # Deployment and utility scripts
│   └── post-deploy.sh      # Post-deployment configuration script
└── README.md               # This deployment documentation
```

## Development Commands

### Lambda Development
```bash
# Install dependencies for all Lambda functions
cd lambda/authorizer && npm install && cd ../..
cd lambda/control && npm install && cd ../..
cd lambda/monitor && npm install && cd ../..

# Run tests
npm test                    # Unit tests
npm run test:properties     # Property-based tests

# Build TypeScript
npm run build
```

### Admin Panel Development
```bash
cd admin-panel
npm install
npm run dev          # Local development server (http://localhost:5173)
npm run build        # Production build
npm run preview      # Preview production build
npm test             # Run unit tests
npm run test:watch   # Run tests in watch mode
npm run test:properties  # Run property-based tests
npm run lint         # Run ESLint
```

## Cost Estimates and Optimization

### Monthly Cost Breakdown

Based on typical usage patterns (4 hours/day, 120 hours/month), here are the estimated monthly costs:

#### Core Infrastructure (Always Running)
- **Lambda Functions**: $0.00 - $2.00
  - Control Lambda: ~500 invocations/month
  - Monitor Lambda: ~3,600 invocations/month (2 min intervals when server running)
  - Authorizer Lambda: ~500 invocations/month
  - Free tier: 1M requests/month, 400,000 GB-seconds/month
- **API Gateway**: $0.00 - $1.00
  - ~1,000 requests/month
  - Free tier: 1M requests/month for first 12 months
- **DynamoDB**: $0.00 - $0.25
  - On-demand pricing for timer state storage
  - Minimal read/write operations
  - Free tier: 25 GB storage, 25 RCU, 25 WCU
- **Secrets Manager**: $2.00 - $2.50
  - 5 secrets × $0.40/month each = $2.00
  - API calls: ~$0.50/month
- **CloudWatch Logs**: $0.00 - $1.00
  - Log storage and ingestion
  - Free tier: 5 GB ingestion, 5 GB storage
- **S3**: $0.00 - $0.50
  - Static website hosting for Admin Panel
  - Free tier: 5 GB storage, 20,000 GET requests
- **CloudFront**: $0.00 - $1.00
  - CDN for Admin Panel
  - Free tier: 1 TB data transfer, 10M requests

**Subtotal (Always Running): $2.00 - $8.25/month**

#### Compute Resources (Only When Server Running)
- **ECS Fargate**: $8.00 - $12.00
  - 1 vCPU × $0.04048/hour × 120 hours = $4.86
  - 8 GB memory × $0.004445/GB/hour × 120 hours = $4.27
  - **Total**: ~$9.13/month for 4 hours/day
- **EFS**: $3.00 - $5.00
  - 20 GB storage × $0.30/GB/month = $6.00
  - Throughput: Provisioned or burst (minimal cost for gaming workload)
  - **Estimated**: $3.00 - $5.00/month
- **Data Transfer**: $1.00 - $3.00
  - Outbound data transfer for game traffic
  - First 1 GB/month free, then $0.09/GB
  - Estimated 10-30 GB/month for gaming

**Subtotal (When Running): $12.00 - $20.00/month**

#### **Total Estimated Monthly Cost: $14.00 - $28.25**
- **Conservative estimate**: $18/month (4 hours/day usage)
- **Light usage** (2 hours/day): $10-15/month
- **Heavy usage** (8 hours/day): $25-35/month

### Free Tier Benefits (First 12 Months)

AWS Free Tier significantly reduces costs for new accounts:

- **Lambda**: 1M requests + 400,000 GB-seconds/month free
- **API Gateway**: 1M requests/month free
- **DynamoDB**: 25 GB storage + 25 RCU + 25 WCU free
- **CloudWatch**: 5 GB logs + 10 custom metrics free
- **S3**: 5 GB storage + 20,000 GET + 2,000 PUT requests free
- **CloudFront**: 1 TB data transfer + 10M requests free
- **EFS**: 5 GB storage free
- **Data Transfer**: 1 GB outbound free

**With Free Tier: $8.00 - $15.00/month** (primarily ECS Fargate costs)

### Cost Optimization Tips

#### 1. Server Usage Optimization
```bash
# Reduce shutdown timeout to minimize idle time
aws cloudformation update-stack \
  --stack-name satisfactory-server \
  --use-previous-template \
  --parameters ParameterKey=ShutdownTimeoutMinutes,ParameterValue=5
```

**Impact**: Reducing timeout from 10 to 5 minutes can save 10-20% on compute costs.

#### 2. Resource Right-Sizing

**Memory Optimization**:
```bash
# For smaller groups (1-2 players), reduce memory allocation
aws cloudformation update-stack \
  --stack-name satisfactory-server \
  --use-previous-template \
  --parameters ParameterKey=ServerMemory,ParameterValue=4096
```

**CPU Optimization**:
```bash
# For lighter workloads, reduce CPU allocation
aws cloudformation update-stack \
  --stack-name satisfactory-server \
  --use-previous-template \
  --parameters ParameterKey=ServerCPU,ParameterValue=512
```

**Potential Savings**: 25-50% reduction in ECS Fargate costs

#### 3. Monitoring and Alerting

**Set Up Budget Alerts**:
The solution includes AWS Budgets integration. Monitor your spending:

```bash
# Check current month's costs
aws ce get-cost-and-usage \
  --time-period Start=2024-01-01,End=2024-01-31 \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --group-by Type=DIMENSION,Key=SERVICE
```

**Configure Lower Budget Thresholds**:
```bash
# Update budget to $15/month for tighter cost control
aws cloudformation update-stack \
  --stack-name satisfactory-server \
  --use-previous-template \
  --parameters ParameterKey=MonthlyBudgetThreshold,ParameterValue=15
```

#### 4. Regional Optimization

**Choose Cost-Effective Regions**:
- **US East (N. Virginia)**: Often lowest costs, best free tier benefits
- **US West (Oregon)**: Good balance of cost and latency
- **Europe (Ireland)**: Cost-effective for European players

**Avoid Expensive Regions**:
- Asia Pacific regions (higher ECS Fargate costs)
- South America regions (limited free tier benefits)

#### 5. Storage Optimization

**EFS Performance Mode**:
```yaml
# In CloudFormation template, use Provisioned Throughput only if needed
EFSFileSystem:
  Properties:
    ThroughputMode: bursting  # Instead of provisioned
```

**Log Retention**:
```bash
# Reduce CloudWatch log retention to save storage costs
aws logs put-retention-policy \
  --log-group-name /aws/lambda/satisfactory-control \
  --retention-in-days 7
```

#### 6. Network Cost Optimization

**Minimize Data Transfer**:
- Use CloudFront for Admin Panel (included in free tier)
- Keep server in same region as most players
- Monitor data transfer costs in CloudWatch

#### 7. Development Cost Management

**Separate Development Environment**:
```bash
# Use smaller resources for development/testing
aws cloudformation create-stack \
  --stack-name satisfactory-server-dev \
  --template-body file://cloudformation/main.yaml \
  --parameters \
    ParameterKey=ServerMemory,ParameterValue=2048 \
    ParameterKey=ServerCPU,ParameterValue=512 \
    ParameterKey=ShutdownTimeoutMinutes,ParameterValue=2
```

### Cost Monitoring Commands

#### Daily Cost Tracking
```bash
# Get yesterday's costs
aws ce get-cost-and-usage \
  --time-period Start=$(date -d "yesterday" +%Y-%m-%d),End=$(date +%Y-%m-%d) \
  --granularity DAILY \
  --metrics BlendedCost \
  --group-by Type=DIMENSION,Key=SERVICE
```

#### Service-Specific Costs
```bash
# Check ECS costs specifically
aws ce get-cost-and-usage \
  --time-period Start=2024-01-01,End=2024-01-31 \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --filter file://ecs-filter.json

# ecs-filter.json content:
{
  "Dimensions": {
    "Key": "SERVICE",
    "Values": ["Amazon Elastic Container Service"]
  }
}
```

#### Budget Status Check
```bash
# Check budget alerts
aws budgets describe-budgets --account-id $(aws sts get-caller-identity --query Account --output text)
```

### Cost Scenarios

#### Scenario 1: Casual Gaming Group (2 hours/day)
- **ECS Fargate**: ~$4.50/month
- **EFS**: ~$3.00/month
- **Other services**: ~$3.00/month (with free tier)
- **Total**: ~$10.50/month

#### Scenario 2: Regular Gaming Group (4 hours/day)
- **ECS Fargate**: ~$9.00/month
- **EFS**: ~$4.00/month
- **Other services**: ~$5.00/month
- **Total**: ~$18.00/month

#### Scenario 3: Heavy Gaming Group (8 hours/day)
- **ECS Fargate**: ~$18.00/month
- **EFS**: ~$5.00/month
- **Other services**: ~$7.00/month
- **Total**: ~$30.00/month

### Cost Comparison

**Traditional Dedicated Server**:
- **AWS EC2 t3.large**: ~$60/month (24/7)
- **Managed hosting services**: $20-50/month
- **Home server electricity**: $10-30/month

**This Solution Benefits**:
- **60-80% cost savings** compared to 24/7 dedicated servers
- **Pay only for usage** - no idle time costs
- **Automatic scaling** - no manual management
- **Built-in monitoring** and cost alerts

### Emergency Cost Controls

If costs exceed expectations:

#### 1. Immediate Actions
```bash
# Stop the server immediately
curl -X POST "$API_URL/server/stop" -H "Authorization: Bearer $JWT_TOKEN"

# Reduce shutdown timeout to minimum
aws cloudformation update-stack \
  --stack-name satisfactory-server \
  --use-previous-template \
  --parameters ParameterKey=ShutdownTimeoutMinutes,ParameterValue=1
```

#### 2. Temporary Suspension
```bash
# Scale ECS service to 0 (prevents any server starts)
aws ecs update-service \
  --cluster satisfactory-cluster \
  --service satisfactory-service \
  --desired-count 0
```

#### 3. Complete Shutdown
```bash
# Delete the entire stack (preserves EFS data)
aws cloudformation delete-stack --stack-name satisfactory-server
```

**Note**: EFS data is retained even after stack deletion, so game saves are preserved.

## Target Usage

Optimized for small groups (up to 4 players) who play a few hours per day and want to avoid paying for 24/7 server hosting. The server runs with 1 vCPU and 8GB memory on AWS ECS Fargate.

## Technical Specifications

- **Container**: `wolveix/satisfactory-server:latest`
- **Compute**: ECS Fargate with 1 vCPU, 8GB memory
- **Storage**: Amazon EFS with encryption at rest
- **Network**: Public IP assignment with security group allowing port 7777 (UDP/TCP)
- **API**: HTTPS-only communication on port 7777 for server management
- **Monitoring**: EventBridge-triggered Lambda function every 2 minutes when server is running

## Security

- **Admin Panel Authentication**: Password-protected with JWT tokens (1-hour expiration)
- **Secret Management**: All credentials stored in AWS Secrets Manager, never in code
- **API Security**: Bearer token authentication for all protected endpoints
- **HTTPS Enforcement**: All communications encrypted in transit
- **IAM Roles**: Least-privilege access for all AWS resources
- **Input Validation**: Comprehensive request validation and sanitization
- **Error Handling**: Structured error responses that don't expose sensitive information
- **Token Management**: Automatic Satisfactory Server API token refresh and validation
- **Network Security**: Security groups restrict access to necessary ports only

## Error Handling

The API implements comprehensive error handling with standardized responses:

```json
{
  "error": "ERROR_CODE",
  "message": "Human-readable error description",
  "details": "Additional context (optional)",
  "timestamp": "2024-01-26T10:30:00.000Z"
}
```

Common error codes:
- `AUTHENTICATION_ERROR` (401): Invalid or expired JWT token
- `VALIDATION_ERROR` (400): Invalid request format or missing required fields
- `SERVER_NOT_RUNNING` (400): Operation requires server to be running
- `SERVER_START_FAILED` (500): Failed to start the Satisfactory server
- `API_TOKEN_ERROR` (500): Issues with Satisfactory Server API authentication