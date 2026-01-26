# Technology Stack

## Infrastructure as Code

- **CloudFormation**: All AWS resources defined in declarative templates
- **AWS Services**: ECS Fargate, EFS, Lambda, API Gateway, Secrets Manager, DynamoDB, S3, CloudFront, EventBridge, CloudWatch

## Backend

- **Runtime**: Node.js 24.x with TypeScript
- **Lambda Functions**: Three functions (Authorizer, Control, Monitor)
- **Key Libraries**:
  - AWS SDK v3 (@aws-sdk/client-*)
  - @aws-sdk/lib-dynamodb (DynamoDB document client for Monitor Lambda)
  - axios (HTTP client for Satisfactory Server API)
  - jsonwebtoken (JWT generation and verification)
  - fast-check (Property-based testing framework)

## Frontend

- **Framework**: React 19 with TypeScript
- **Build Tool**: Vite 7 with hot module replacement
- **Styling**: Tailwind CSS 3 (PostCSS integration)
- **HTTP Client**: Axios with interceptors for authentication
- **Testing**: Vitest + @testing-library/react + fast-check for property-based testing
- **State Management**: React hooks (useState, useEffect, useCallback)
- **Authentication**: JWT tokens stored in sessionStorage with automatic expiration handling
- **Responsive Design**: Mobile-first approach with Tailwind breakpoints
- **Hosting**: S3 static website + CloudFront

### Frontend Architecture Patterns

- **Component Composition**: Modular components with single responsibilities
- **Custom Hooks**: Reusable logic for API calls and state management
- **Error Boundaries**: Graceful error handling with user-friendly messages
- **Loading States**: Consistent loading indicators across all async operations
- **Form Validation**: Client-side validation with server-side error handling
- **Auto-refresh**: Polling-based real-time updates every 10 seconds
- **Conditional Rendering**: Dynamic UI based on server state and authentication status

## Container

- **Image**: wolveix/satisfactory-server:latest
- **Orchestration**: ECS Fargate
- **Storage**: Amazon EFS mounted at /config

## Common Commands

### Lambda Development
```bash
cd lambda/<function-name>  # authorizer, control, or monitor
npm install
npm run build
npm test
npm run test:properties    # Run property-based tests
```

### Monitor Lambda Specific Commands
```bash
cd lambda/monitor
npm run build              # Compile TypeScript
npm test                   # Run unit tests
npm run test:properties    # Run property-based tests for shutdown timer logic
```

### Admin Panel Development
```bash
cd admin-panel
npm install                # Install dependencies
npm run dev               # Local development server (http://localhost:5173)
npm run build             # Production build
npm run preview           # Preview production build
npm test                  # Run unit tests
npm run test:watch        # Run tests in watch mode
npm run test:properties   # Run property-based tests
npm run lint              # Run ESLint
```

### Admin Panel Testing
```bash
# Unit and integration tests
npm test

# Property-based tests for component behavior
npm run test:properties

# Test specific component
npm test -- ServerStatus

# Run tests with coverage
npm test -- --coverage
```

### Deployment
```bash
# Step 1: Build all Lambda functions
cd lambda/authorizer && npm install && npm run build && cd ../..
cd lambda/control && npm install && npm run build && cd ../..
cd lambda/monitor && npm install && npm run build && cd ../..

# Step 2: Deploy CloudFormation stack
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

# Step 3: Wait for stack creation and run post-deployment script
aws cloudformation wait stack-create-complete --stack-name satisfactory-server
chmod +x scripts/post-deploy.sh
./scripts/post-deploy.sh

# Step 4: Build and deploy Admin Panel
cd admin-panel && npm install && npm run build
S3_BUCKET=$(aws cloudformation describe-stacks --stack-name satisfactory-server --query 'Stacks[0].Outputs[?OutputKey==`S3BucketName`].OutputValue' --output text)
aws s3 sync dist/ s3://$S3_BUCKET/

# Step 5: Get Admin Panel URL
aws cloudformation describe-stacks --stack-name satisfactory-server --query 'Stacks[0].Outputs[?OutputKey==`AdminPanelUrl`].OutputValue' --output text
```

### Post-Deployment Script Details

The `scripts/post-deploy.sh` script handles:
- **Secret Generation**: Creates secure 32-char admin password and 64-char JWT secret if not already set
- **API Gateway URL Retrieval**: Extracts API URL from CloudFormation outputs
- **Environment Configuration**: Creates `.env.local` file with VITE_API_URL for Admin Panel
- **Idempotency**: Safe to run multiple times, preserves existing secrets
- **Validation**: Checks AWS CLI configuration and CloudFormation stack status

### Cost Monitoring Commands
```bash
# Check current month's costs
aws ce get-cost-and-usage \
  --time-period Start=2024-01-01,End=2024-01-31 \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --group-by Type=DIMENSION,Key=SERVICE

# Monitor ECS-specific costs
aws ce get-cost-and-usage \
  --time-period Start=2024-01-01,End=2024-01-31 \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --filter '{"Dimensions":{"Key":"SERVICE","Values":["Amazon Elastic Container Service"]}}'

# Check budget status
aws budgets describe-budgets --account-id $(aws sts get-caller-identity --query Account --output text)
```

### Cleanup Commands
```bash
# Complete cleanup (stops all charges)
# 1. Stop server
curl -X POST "$API_URL/server/stop" -H "Authorization: Bearer $JWT_TOKEN"

# 2. Empty S3 bucket
S3_BUCKET=$(aws cloudformation describe-stacks --stack-name satisfactory-server --query 'Stacks[0].Outputs[?OutputKey==`S3BucketName`].OutputValue' --output text)
aws s3 rm s3://$S3_BUCKET --recursive

# 3. Delete CloudFormation stack
aws cloudformation delete-stack --stack-name satisfactory-server
aws cloudformation wait stack-delete-complete --stack-name satisfactory-server

# 4. Delete secrets (optional, permanent)
aws secretsmanager delete-secret --secret-id satisfactory-admin-password --force-delete-without-recovery
aws secretsmanager delete-secret --secret-id satisfactory-jwt-secret --force-delete-without-recovery
aws secretsmanager delete-secret --secret-id satisfactory-server-admin-password --force-delete-without-recovery
aws secretsmanager delete-secret --secret-id satisfactory-api-token --force-delete-without-recovery
aws secretsmanager delete-secret --secret-id satisfactory-client-password --force-delete-without-recovery
```

### Testing
```bash
# Backend Lambda tests
cd lambda/<function-name>
npm test                  # Unit tests (Jest)
npm run test:properties   # Property-based tests (fast-check)

# Frontend tests
cd admin-panel
npm test                  # Unit tests (Vitest)
npm run test:properties   # Property-based tests (fast-check)
npm run test:watch        # Watch mode for development
```

## API Integration

The solution integrates with the Satisfactory Server HTTPS API (port 7777) for:
- Server claiming and authentication
- Player count monitoring (Monitor Lambda)
- Graceful shutdown (Monitor Lambda)
- Client password management

All API calls use Bearer token authentication with automatic token refresh on expiration.

### Monitor Lambda API Integration

- **QueryServerState**: Called every 2 minutes to get player count
- **VerifyAuthenticationToken**: Validates API token before each call
- **PasswordLogin**: Regenerates API token when expired
- **Shutdown**: Triggers graceful server shutdown when timer expires
- **Self-signed Certificate Handling**: Uses custom HTTPS agent to accept server certificates

### Admin Panel API Integration

- **Centralized API Service**: Single ApiService class handles all HTTP requests
- **Automatic Authentication**: JWT tokens automatically included in request headers
- **401 Handling**: Automatic token cleanup and redirect to login on authentication failure
- **Error Handling**: Consistent error message extraction and user feedback
- **Request Interceptors**: Automatic token attachment and response error handling
- **Environment Configuration**: API base URL configured via VITE_API_URL environment variable
- **Token Management**: JWT tokens stored in sessionStorage with expiration validation
