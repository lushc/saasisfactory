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
