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
- **Build Tool**: Vite 7
- **Styling**: Tailwind CSS 4
- **HTTP Client**: Axios
- **Hosting**: S3 static website + CloudFront

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
npm install
npm run dev          # Local development server
npm run build        # Production build
```

### Deployment
```bash
# Deploy CloudFormation stack
aws cloudformation create-stack \
  --stack-name satisfactory-server \
  --template-body file://cloudformation/main.yaml \
  --parameters file://parameters.json \
  --capabilities CAPABILITY_IAM

# Run post-deployment script (generates secrets)
./scripts/post-deploy.sh

# Upload Admin Panel to S3
aws s3 sync admin-panel/dist s3://<bucket-name>/
```

### Testing
```bash
# Unit tests (Jest)
npm test

# Property-based tests
npm run test:properties
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
