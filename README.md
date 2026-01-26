# Satisfactory On-Demand Server

An on-demand Satisfactory game server solution deployed on AWS infrastructure that automatically scales down when not in use, providing cost-effective hosting for small gaming groups.

## Overview

This solution enables cost-effective hosting of a Satisfactory dedicated server that automatically shuts down after configurable timeout when no players are connected. The system consists of:

- **Infrastructure Layer**: AWS resources defined using CloudFormation templates
- **Backend API Layer**: Three Lambda functions that manage authentication, server lifecycle, and monitoring
- **Frontend Layer**: React-based admin panel for server management

## Implementation Status

✅ **Backend Infrastructure**: CloudFormation templates and Lambda functions implemented  
✅ **Authentication System**: JWT-based authentication with 1-hour token expiration  
✅ **Server Management API**: Complete REST API for server lifecycle operations  
✅ **Satisfactory Server Integration**: Full API integration for server claiming, monitoring, and control  
✅ **Monitor Lambda**: Auto-shutdown functionality with DynamoDB timer state management  
🚧 **Admin Panel**: React frontend (in progress)  
🚧 **Deployment Scripts**: Automated deployment tooling (in progress)

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
- **S3 + CloudFront**: Hosts the admin panel static website (implementation in progress)

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
│   └── main.yaml           # Complete CloudFormation template (✅ implemented)
├── lambda/                 # Backend Lambda functions
│   ├── authorizer/         # JWT token validation (✅ implemented)
│   │   ├── src/
│   │   │   ├── index.ts           # Main authorizer logic
│   │   │   └── index.property.test.ts  # Property-based tests
│   │   ├── package.json    # Dependencies (jsonwebtoken, AWS SDK)
│   │   └── tsconfig.json
│   ├── control/            # Server lifecycle management (✅ implemented)
│   │   ├── src/
│   │   │   ├── index.ts           # Main API handler with all endpoints
│   │   │   ├── aws-utils.ts       # AWS service integrations
│   │   │   ├── satisfactory-api.ts # Satisfactory Server API client
│   │   │   ├── types.ts           # Request/response type definitions
│   │   │   └── index.property.test.ts  # Property-based tests
│   │   ├── package.json    # Dependencies (AWS SDK v3, axios, jsonwebtoken)
│   │   └── tsconfig.json
│   ├── monitor/            # Auto-shutdown monitoring (✅ implemented)
│   │   ├── src/
│   │   │   ├── index.ts           # Timer logic and player monitoring
│   │   │   ├── aws-utils.ts       # AWS service integrations
│   │   │   ├── dynamodb-utils.ts  # DynamoDB timer state management
│   │   │   ├── satisfactory-api.ts # Satisfactory Server API client
│   │   │   ├── types.ts           # Type definitions
│   │   │   └── index.property.test.ts  # Property-based tests
│   │   ├── package.json    # Dependencies (AWS SDK v3, axios)
│   │   └── tsconfig.json
│   └── shared/             # Shared utilities (✅ implemented)
│       ├── config.ts       # Centralized configuration management
│       ├── errors.ts       # Custom error types with HTTP status codes
│       ├── test-helpers.ts # Shared testing utilities
│       └── types.ts        # Common type definitions
├── admin-panel/            # React frontend application (🚧 in progress)
├── scripts/                # Deployment and utility scripts (🚧 in progress)
└── README.md               # This documentation file
```

### Key Implementation Details

#### Lambda Functions
- **Node.js 24.x runtime** with TypeScript compilation
- **Modular architecture** with shared utilities in `lambda/shared/`
- **Comprehensive error handling** with custom error types and structured responses
- **Property-based testing** for critical functionality validation
- **Environment variable configuration** for AWS resource names and settings

#### Security Implementation
- **JWT tokens** with 1-hour expiration and automatic validation
- **Secrets Manager integration** for secure credential storage
- **Least-privilege IAM roles** for each Lambda function
- **Input validation** and sanitization for all API endpoints
- **Structured error responses** that don't expose sensitive information

#### Satisfactory Server Integration
- **Full API client implementation** for server management
- **Automatic server claiming** with secure password generation
- **Token refresh logic** for expired Satisfactory Server API tokens
- **Graceful shutdown** with game state saving before server termination

## Development Status

### Completed Components ✅
- **CloudFormation Infrastructure**: Complete template with all AWS resources defined
- **Authorizer Lambda**: JWT token validation with property-based tests
- **Control Lambda**: Full server management API with comprehensive error handling
- **Monitor Lambda**: Auto-shutdown functionality with DynamoDB timer state management and property-based tests
- **Shared Utilities**: Configuration management, custom errors, and test helpers
- **Satisfactory Server Integration**: Complete API client with automatic token management
- **API Gateway**: HTTP API with routes, integrations, and Lambda authorizer configuration

### In Progress 🚧
- **Admin Panel**: React frontend with Vite, Tailwind CSS, and TypeScript
- **S3/CloudFront Setup**: Static website hosting for admin panel
- **Deployment Scripts**: Automated CloudFormation deployment and secret management

### Pending 📋
- **Cost Monitoring**: AWS Budgets integration
- **End-to-End Testing**: Complete system integration tests

## Prerequisites

- **AWS CLI** configured with appropriate permissions for CloudFormation, ECS, Lambda, etc.
- **Node.js 24+** for Lambda development and admin panel
- **TypeScript** for development (installed via npm)
- **Docker** (optional, for local container testing)

## Development Commands

### Lambda Development
```bash
# Install dependencies for all Lambda functions
cd lambda/authorizer && npm install
cd lambda/control && npm install
cd lambda/monitor && npm install

# Run tests
npm test                    # Unit tests
npm run test:properties     # Property-based tests

# Build TypeScript
npm run build
```

### Admin Panel Development (when implemented)
```bash
cd admin-panel
npm install
npm run dev          # Local development server
npm run build        # Production build
```

## Deployment

**⚠️ Important**: No AWS resources are deployed until the deployment script is executed. All current work creates local files only.

Detailed deployment instructions will be provided once the deployment scripts are implemented. The deployment process will include:

1. **CloudFormation Stack Deployment**: Deploy all AWS infrastructure resources
2. **Secret Generation**: Automatically generate and store admin passwords and JWT secrets
3. **Lambda Function Deployment**: Package and deploy all Lambda functions
4. **Admin Panel Build**: Build and upload React application to S3
5. **Post-Deployment Configuration**: Configure API Gateway URLs and verify functionality

## Target Usage

Optimized for small groups (up to 4 players) who play a few hours per day and want to avoid paying for 24/7 server hosting. The server runs with 1 vCPU and 8GB memory on AWS ECS Fargate.

## Technical Specifications

- **Container**: `wolveix/satisfactory-server:latest`
- **Compute**: ECS Fargate with 1 vCPU, 8GB memory
- **Storage**: Amazon EFS with encryption at rest
- **Network**: Public IP assignment with security group allowing port 7777 (UDP/TCP)
- **API**: HTTPS-only communication on port 7777 for server management
- **Monitoring**: EventBridge-triggered Lambda function every 2 minutes when server is running

## Cost Estimates

- **Estimated monthly cost**: ~$18 for 4 hours/day usage
- **Free tier eligible**: Several AWS services used qualify for free tier benefits
- **Cost monitoring**: Built-in AWS Budgets alerts notify when spending exceeds thresholds

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