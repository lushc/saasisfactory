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
│   │   ├── services/       # API service layer
│   │   ├── types/          # TypeScript type definitions
│   │   ├── App.tsx         # Main app component
│   │   └── main.tsx        # Entry point
│   ├── public/             # Static assets
│   └── dist/               # Build output (generated)
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

### Admin Panel

- Components are organized by feature in `src/components/`
- API calls are centralized in `src/services/api.ts`
- TypeScript interfaces for API responses in `src/types/`
- Environment variables (VITE_API_URL) configured at build time

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
