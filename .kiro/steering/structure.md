# Project Structure

```
.
├── cloudformation/          # Infrastructure as Code templates
│   └── main.yaml           # Main CloudFormation template
├── lambda/                 # Backend Lambda functions
│   ├── authorizer/         # JWT token validation
│   ├── control/            # Server lifecycle management
│   ├── monitor/            # Auto-shutdown monitoring
│   └── shared/             # Shared utilities (API client, types)
├── admin-panel/            # React frontend application
│   ├── src/
│   │   ├── components/     # React components
│   │   │   ├── LoginForm.tsx           # Password authentication
│   │   │   ├── Dashboard.tsx           # Main container with routing
│   │   │   ├── ServerStatus.tsx        # Server state display
│   │   │   ├── ServerControls.tsx      # Start/stop functionality
│   │   │   ├── ClientPasswordManager.tsx # Password management
│   │   │   └── LoadingSpinner.tsx      # Reusable loading component
│   │   ├── services/       # API service layer
│   │   │   └── api.ts      # Centralized API client with auth handling
│   │   ├── types/          # TypeScript type definitions
│   │   │   └── server.ts   # API response interfaces
│   │   ├── test/           # Test configuration
│   │   │   └── setup.ts    # Vitest setup with testing-library
│   │   ├── App.tsx         # Main app component with auth routing
│   │   └── main.tsx        # Entry point
│   ├── public/             # Static assets
│   ├── dist/               # Build output (generated)
│   ├── .env.example        # Environment variable template
│   ├── .env.local          # Local development configuration
│   ├── tailwind.config.js  # Tailwind CSS configuration
│   ├── postcss.config.js   # PostCSS configuration
│   ├── vitest.config.ts    # Vitest test configuration
│   └── package.json        # Dependencies and scripts
├── scripts/                # Deployment and utility scripts
│   └── post-deploy.sh      # Post-deployment configuration
└── README.md               # Deployment documentation
```

## Key Conventions

### Lambda Functions

- Each Lambda function has its own directory under `lambda/`
- Shared code (API clients, types, utilities) lives in `lambda/shared/`
- All Lambda code is TypeScript, compiled to JavaScript for deployment
- Environment variables are used for configuration (cluster name, service name, etc.)

#### Monitor Lambda Implementation Patterns

- **DynamoDB Integration**: Uses `@aws-sdk/lib-dynamodb` for simplified document operations
- **Timer State Management**: Implements shutdown timer logic with DynamoDB persistence
- **API Token Management**: Automatically refreshes Satisfactory Server API tokens when expired
- **Error Handling**: Graceful error handling to ensure monitoring continues even on failures
- **EventBridge Integration**: Triggered by EventBridge rules created/deleted by Control Lambda
- **Exponential Backoff**: Implements retry logic for AWS service calls

### Admin Panel

- **Component Architecture**: Modular React components organized by functionality
  - `LoginForm.tsx`: Password authentication with JWT token management
  - `Dashboard.tsx`: Main container with auto-refresh and routing logic
  - `ServerStatus.tsx`: Real-time server state display with responsive design
  - `ServerControls.tsx`: Start/stop buttons with loading states and error handling
  - `ClientPasswordManager.tsx`: Secure password management with reveal/hide functionality
  - `LoadingSpinner.tsx`: Reusable loading indicator component
- **API Integration**: Centralized in `src/services/api.ts` with automatic 401 handling
- **Type Safety**: Complete TypeScript interfaces for all API responses in `src/types/server.ts`
- **State Management**: React hooks for local state, sessionStorage for JWT tokens
- **Responsive Design**: Mobile-first approach using Tailwind CSS breakpoints (sm:, lg:, xl:)
- **Environment Configuration**: VITE_API_URL configured at build time via .env files
- **Testing**: Property-based tests using fast-check for component behavior validation

### CloudFormation

- Single main template defines all resources
- Parameters allow customization (timeout, memory, CPU, budget)
- Outputs include API Gateway URL, S3 bucket name, CloudFront URL
- Secrets created with placeholder values, populated by post-deploy script

### Security

- Secrets stored in AWS Secrets Manager (never in code or environment variables)
- JWT tokens for Admin Panel authentication (1-hour expiration)
- Satisfactory Server API tokens managed automatically (stored in Secrets Manager)
- All API endpoints except /auth/login require authentication

### Testing

- Unit tests colocated with source files (*.test.ts)
- Property-based tests in separate test files (*.property.test.ts)
- Integration tests in `tests/integration/`
- End-to-end tests documented in manual testing checklist

## Resource Naming

- CloudFormation stack: `satisfactory-server`
- ECS cluster: `satisfactory-cluster`
- ECS service: `satisfactory-service`
- Secrets: `satisfactory-*` prefix
- DynamoDB table: `satisfactory-shutdown-timer`
- S3 bucket: `satisfactory-admin-panel-<account-id>`
