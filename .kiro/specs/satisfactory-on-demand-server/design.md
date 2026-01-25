# Design Document

## Overview

This document outlines the technical design for an on-demand Satisfactory game server solution deployed on AWS. The system consists of three main components:

1. **Infrastructure Layer**: AWS resources defined using CloudFormation templates
2. **Backend API Layer**: Lambda functions that manage server lifecycle and provide status information
3. **Frontend Layer**: React-based admin panel for server management

The solution is designed to minimize costs by automatically shutting down the Satisfactory Server when no players are connected, while maintaining persistent game saves through Amazon EFS. The architecture leverages serverless technologies (Lambda, API Gateway) and container orchestration (ECS Fargate) to provide a scalable, cost-effective solution.

## Architecture

### High-Level Architecture

```
┌─────────────────┐
│  Admin Panel    │
│  (React + S3)   │
└────────┬────────┘
         │ HTTPS
         ▼
┌─────────────────┐
│  API Gateway    │
│  + Lambda Auth  │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌────────┐ ┌──────────────┐
│Lambda  │ │  ECS Fargate │
│Control │ │  Satisfactory│
│        │ │  Server      │
└────────┘ └──────┬───────┘
    │             │
    │             ▼
    │      ┌──────────────┐
    │      │     EFS      │
    │      │  (Game Saves)│
    │      └──────────────┘
    │
    ▼
┌─────────────────┐
│ Secrets Manager │
│  (API Tokens)   │
└─────────────────┘
```

### Component Interaction Flow

1. **Authentication Flow**:
   - User enters password in Admin Panel login page
   - Admin Panel calls POST /auth/login with password
   - Control Lambda validates password against Secrets Manager
   - Control Lambda generates JWT token with 1-hour expiration
   - Admin Panel stores JWT token in sessionStorage
   - All subsequent API calls include JWT token in Authorization header

2. **Server Start Flow**:
   - User clicks "Start" in Admin Panel
   - API Gateway receives request with JWT token
   - Lambda authorizer validates JWT signature and expiration
   - Control Lambda updates ECS Service desired count to 1
   - ECS Fargate launches Satisfactory Server container
   - Container mounts EFS volume for persistent storage
   - Control Lambda waits for server API to become accessible
   - If server is unclaimed (first startup):
     - Control Lambda generates 64-character secure admin password
     - Calls PasswordlessLogin to get InitialAdmin token
     - Calls ClaimServer with admin password and server name
     - Stores admin password and Admin token in Secrets Manager
   - If server is already claimed (subsequent startups):
     - Control Lambda retrieves admin password from Secrets Manager
     - Calls PasswordLogin to get Admin token
     - Stores Admin token in Secrets Manager
   - Control Lambda creates EventBridge rule to trigger Monitor Lambda every 2 minutes
   - Control Lambda returns public IP address to Admin Panel

3. **Server Monitoring Flow**:
   - EventBridge rule triggers Monitor Lambda every 2 minutes (only while server is running)
   - Monitor Lambda retrieves Admin token from Secrets Manager
   - Monitor Lambda verifies token with VerifyAuthenticationToken
   - If token invalid, Monitor Lambda regenerates token via PasswordLogin and updates Secrets Manager
   - Monitor Lambda calls QueryServerState with valid Admin token
   - Monitor Lambda extracts player count from response
   - If player count is 0, starts/continues shutdown timer
   - If timer expires (10 minutes), initiates graceful shutdown
   - If players reconnect, cancels shutdown timer

4. **Server Stop Flow**:
   - User clicks "Stop" in Admin Panel (or auto-shutdown triggers)
   - Control Lambda retrieves Admin token from Secrets Manager
   - Control Lambda verifies token with VerifyAuthenticationToken
   - If token invalid, Control Lambda regenerates token via PasswordLogin and updates Secrets Manager
   - Control Lambda calls Shutdown API with valid Admin token to save game
   - Control Lambda updates ECS Service desired count to 0
   - Control Lambda deletes EventBridge rule for Monitor Lambda
   - ECS gracefully stops container
   - EFS retains all game saves

5. **Token Expiration Flow**:
   - After 1 hour, JWT token expires
   - Any API call with expired token returns 401 Unauthorized
   - Admin Panel detects 401 response
   - Admin Panel clears JWT token from sessionStorage
   - Admin Panel redirects user to login page

## Components and Interfaces

### 1. CloudFormation Infrastructure

**Purpose**: Define and provision all AWS resources

**Resources**:
- VPC with public subnets (for ECS Fargate with public IP)
- ECS Cluster and Task Definition
- EFS File System with mount targets
- API Gateway HTTP API
- Lambda functions (Control, Monitor, Authorizer)
- S3 bucket for Admin Panel hosting
- CloudFront distribution (optional, for HTTPS)
- Secrets Manager secrets (created with placeholder values, populated by post-deploy script):
  - `satisfactory-admin-password`: Admin Panel password
  - `satisfactory-jwt-secret`: JWT signing key
  - `satisfactory-server-admin-password`: Satisfactory Server admin password (generated by Control Lambda on first start)
  - `satisfactory-api-token`: Satisfactory Server API token (generated by Control Lambda on first start)
  - `satisfactory-client-password`: Optional client protection password
- DynamoDB table for shutdown timer state
- IAM roles and security groups
- CloudWatch Log Groups
- EventBridge rule (created/deleted dynamically by Control Lambda)
- AWS Budgets alert with SNS topic for cost notifications

**Parameters**:
- `ShutdownTimeoutMinutes`: Time to wait before auto-shutdown (default: 10)
- `ServerMemory`: Memory allocation for Satisfactory Server (default: 8192)
- `ServerCPU`: CPU allocation for Satisfactory Server (default: 1024)
- `BudgetAlertEmail`: Email address for cost alert notifications
- `MonthlyBudgetThreshold`: Monthly budget threshold in USD (default: 20, based on 4 hours/day usage)

**Secret Management**:
- Admin password and JWT secret key are generated by post-deployment script if not already set
- Secrets stored in AWS Secrets Manager with specific names for easy retrieval
- CloudFormation creates secret placeholders, post-deploy script populates values
- This approach allows password regeneration without redeploying infrastructure

### 2. ECS Fargate Task Definition

**Container**: `wolveix/satisfactory-server:latest`

**Configuration**:
- CPU: 1 vCPU (1024 units)
- Memory: 8GB (8192 MB)
- Network Mode: awsvpc
- Requires Compatibilities: FARGATE
- Port Mappings:
  - 7777 UDP (game traffic)
  - 7777 TCP (HTTPS API)

**Environment Variables**:
- `MAXPLAYERS`: Maximum player count (default: 4)
- `PGID`: Process group ID (default: 1000)
- `PUID`: Process user ID (default: 1000)
- `STEAMBETA`: false (use stable release)

**Volume Mounts**:
- EFS volume mounted at `/config` (contains game saves and configuration)

**Logging**:
- CloudWatch Logs with log group `/ecs/satisfactory-server`

### 3. Backend API (Lambda Functions)

The backend API consists of three Lambda functions that handle authentication, server lifecycle management, and monitoring. All API endpoints are exposed through API Gateway with the following routes:

**API Routes**:
- `POST /auth/login` → Control Lambda (no authentication required)
- `POST /server/start` → Control Lambda (requires JWT authentication)
- `POST /server/stop` → Control Lambda (requires JWT authentication)
- `GET /server/status` → Control Lambda (requires JWT authentication)
- `GET /server/client-password` → Control Lambda (requires JWT authentication)
- `POST /server/client-password` → Control Lambda (requires JWT authentication)

All routes except `/auth/login` are protected by the Lambda authorizer which validates JWT tokens.

#### 3.1 Authorizer Lambda

**Runtime**: Node.js 20.x

**Purpose**: Validate JWT tokens for API requests

**Input**:
```typescript
interface AuthorizerEvent {
  headers: {
    authorization?: string; // "Bearer <jwt-token>"
  };
  requestContext: {
    http: {
      method: string;
      path: string;
    };
  };
}
```

**Output**:
```typescript
interface AuthorizerResponse {
  isAuthorized: boolean;
  context?: {
    userId: string;
  };
}
```

**Logic**:
1. Extract JWT token from Authorization header
2. Verify JWT signature using secret key from Secrets Manager
3. Check token expiration (must be within 1 hour of issuance)
4. Return authorization decision

**JWT Payload**:
```typescript
interface JWTPayload {
  sub: 'admin'; // Subject (user identifier)
  iat: number; // Issued at (Unix timestamp)
  exp: number; // Expiration (Unix timestamp, iat + 3600)
}
```

**Dependencies**:
- jsonwebtoken library for JWT signing and verification
- AWS SDK v3 (@aws-sdk/client-secrets-manager)

#### 3.2 Control Lambda

**Runtime**: Node.js 20.x

**Purpose**: Start, stop, and query Satisfactory Server status; handle authentication

**API Endpoints**:

**POST /auth/login**
- Validates admin password against Secrets Manager
- Generates JWT token with 1-hour expiration
- Returns JWT token to client
- **No authentication required** (this is the login endpoint)

Request:
```typescript
interface LoginRequest {
  password: string;
}
```

Response:
```typescript
interface LoginResponse {
  token: string; // JWT token
  expiresIn: number; // 3600 seconds
}
```

**POST /server/start**
- Starts the Satisfactory Server by setting ECS desired count to 1
- Waits for task to reach RUNNING state and server API to be accessible
- Claims server if unclaimed (first startup):
  - Generates 64-character secure admin password
  - Stores password in Secrets Manager
  - Calls PasswordlessLogin to get InitialAdmin token
  - Calls ClaimServer with admin password
  - Stores returned Admin token in Secrets Manager
- If server already claimed (subsequent startups):
  - Retrieves admin password from Secrets Manager
  - Calls PasswordLogin to get Admin token
  - Stores token in Secrets Manager
- Creates EventBridge rule to trigger Monitor Lambda every 2 minutes
- Returns task public IP address
- **Requires authentication**

Request: None
Response:
```typescript
interface StartResponse {
  status: 'starting' | 'running';
  taskArn?: string;
  publicIp?: string;
}
```

**POST /server/stop**
- Retrieves Admin token from Secrets Manager
- Verifies token with VerifyAuthenticationToken
- If token invalid, regenerates token via PasswordLogin
- Calls Shutdown API with valid Admin token to save game
- Sets ECS desired count to 0
- Deletes EventBridge rule for Monitor Lambda
- Returns success status
- **Requires authentication**

Request: None
Response:
```typescript
interface StopResponse {
  status: 'stopping';
}
```

**GET /server/status**
- Queries ECS for task status
- If running:
  - Retrieves Admin token from Secrets Manager
  - Verifies token with VerifyAuthenticationToken
  - If token invalid, regenerates token via PasswordLogin
  - Calls QueryServerState with valid Admin token
  - Returns comprehensive status including player count
- **Requires authentication**

Response:
```typescript
interface StatusResponse {
  serverState: 'offline' | 'starting' | 'running' | 'stopping';
  publicIp?: string;
  port: number;
  playerCount?: number;
  serverName?: string;
  gamePhase?: string;
  lastUpdated: string;
}
```

**GET /server/client-password**
- Retrieves Admin token from Secrets Manager (for Satisfactory Server)
- Verifies token with VerifyAuthenticationToken
- If token invalid, regenerates token via PasswordLogin
- Retrieves client protection password from Secrets Manager
- Returns password (only if authenticated with Admin Panel JWT)
- **Requires authentication**

Response:
```typescript
interface ClientPasswordResponse {
  password: string | null; // null if no password is set
}
```

**POST /server/client-password**
- Retrieves Admin token from Secrets Manager
- Verifies token with VerifyAuthenticationToken
- If token invalid, regenerates token via PasswordLogin
- Calls SetClientPassword with valid Admin token
- Updates client protection password in Secrets Manager
- Returns success status
- **Requires authentication**

Request:
```typescript
interface SetClientPasswordRequest {
  password: string; // Empty string to remove password protection
}
```

Response:
```typescript
interface SetClientPasswordResponse {
  success: boolean;
  message?: string; // Optional success/error message
}
```

**Dependencies**:
- AWS SDK v3 (@aws-sdk/client-ecs, @aws-sdk/client-secrets-manager, @aws-sdk/client-eventbridge)
- axios (for Satisfactory Server API calls)
- jsonwebtoken (for JWT generation)

#### 3.3 Monitor Lambda

**Runtime**: Node.js 20.x

**Purpose**: Monitor player count and implement auto-shutdown logic

**Trigger**: EventBridge rule (every 2 minutes) - dynamically created/deleted by Control Lambda

**Logic**:
1. Check if ECS task is running
2. If not running, exit (rule should be deleted, but this is a safety check)
3. Retrieve Admin token from Secrets Manager
4. Verify token with VerifyAuthenticationToken
5. If token invalid, regenerate token via PasswordLogin and update Secrets Manager
6. Call QueryServerState with valid Admin token to get player count
7. Retrieve shutdown timer state from DynamoDB
8. If player count is 0:
   - If timer not started, start timer with current timestamp
   - If timer expired (> 10 minutes), trigger shutdown via Control Lambda logic
9. If player count > 0:
   - Cancel timer if active
10. Update timer state in DynamoDB

**Note**: The EventBridge rule that triggers this Lambda is created when the server starts and deleted when the server stops, ensuring the Lambda only runs when needed.

**DynamoDB Table Schema**:
```typescript
interface ShutdownTimerState {
  id: 'singleton'; // Partition key
  timerStarted: number | null; // Unix timestamp
  shutdownTimeoutMinutes: number;
}
```

**Dependencies**:
- AWS SDK v3 (@aws-sdk/client-ecs, @aws-sdk/client-dynamodb)
- axios (for Satisfactory Server API calls)

### 4. Satisfactory Server API Integration

**Base URL**: `https://<public-ip>:7777/api/v1`

**Authentication**: Bearer token obtained after claiming server

**Note**: The server uses a self-signed certificate, so HTTPS clients must accept invalid certificates.

#### Server Claiming Process

When the Satisfactory Server starts for the first time (or when unclaimed), it must be claimed to enable API access:

1. **Check Server Status** - Use `PasswordlessLogin` to get InitialAdmin token
2. **Claim Server** - Use `ClaimServer` with InitialAdmin token to set admin password
3. **Login as Admin** - Use `PasswordLogin` with admin password to get Admin token
4. **Store Token** - Save Admin token in Secrets Manager for future API calls

#### API Methods Used

**PasswordlessLogin** (Initial Setup Only)
```json
POST /api/v1
{
  "function": "PasswordlessLogin",
  "data": {
    "MinimumPrivilegeLevel": "InitialAdmin"
  }
}
```
Response:
```json
{
  "data": {
    "AuthenticationToken": "eyJ...InitialAdmin token"
  }
}
```

**ClaimServer** (Initial Setup Only)
```json
POST /api/v1
Headers: Authorization: Bearer <InitialAdmin token>
{
  "function": "ClaimServer",
  "data": {
    "ServerName": "Satisfactory On-Demand Server",
    "AdminPassword": "<64-character-secure-password>"
  }
}
```
Response:
```json
{
  "data": {
    "AuthenticationToken": "eyJ...Admin token"
  }
}
```

**PasswordLogin** (Subsequent Startups)
```json
POST /api/v1
{
  "function": "PasswordLogin",
  "data": {
    "MinimumPrivilegeLevel": "Administrator",
    "Password": "<64-character-secure-password>"
  }
}
```
Response:
```json
{
  "data": {
    "AuthenticationToken": "eyJ...Admin token"
  }
}
```

**VerifyAuthenticationToken** (Before Each API Call)
```json
POST /api/v1
Headers: Authorization: Bearer <Admin token>
{
  "function": "VerifyAuthenticationToken",
  "data": {}
}
```
Response: 204 No Content (if valid), 401 Unauthorized (if invalid/expired)

**Token Verification Strategy**:
- Before making any Satisfactory Server API call, verify the stored token
- If verification fails (401 response or error):
  - Retrieve admin password from Secrets Manager
  - Call PasswordLogin to get new Admin token
  - Update token in Secrets Manager
  - Retry original API call with new token
- This ensures API calls always use valid tokens even if server restarts or tokens expire

**QueryServerState** (Monitoring)
```json
POST /api/v1
Headers: Authorization: Bearer <Admin token>
{
  "function": "QueryServerState",
  "data": {}
}
```
Response:
```json
{
  "data": {
    "serverGameState": {
      "activeSessionName": "MySession",
      "numConnectedPlayers": 0,
      "playerLimit": 4,
      "techTier": 0,
      "activeSchematic": "",
      "gamePhase": "None",
      "isGameRunning": false,
      "totalGameDuration": 0,
      "isGamePaused": false,
      "averageTickRate": 30.0,
      "autoLoadSessionName": ""
    }
  }
}
```

**Shutdown** (Graceful Stop)
```json
POST /api/v1
Headers: Authorization: Bearer <Admin token>
{
  "function": "Shutdown",
  "data": {}
}
```
Response: 204 No Content

**SetClientPassword** (Optional)
```json
POST /api/v1
Headers: Authorization: Bearer <Admin token>
{
  "function": "SetClientPassword",
  "data": {
    "Password": "<client-password>" // Empty string removes password protection
  }
}
```
Response: 204 No Content

**GetServerOptions** (Configuration)
```json
POST /api/v1
Headers: Authorization: Bearer <Admin token>
{
  "function": "GetServerOptions",
  "data": {}
}
```
Response:
```json
{
  "data": {
    "serverOptions": {
      "FG.ServerName": "Satisfactory On-Demand Server",
      "FG.MaxPlayers": "4",
      ...
    },
    "pendingServerOptions": {}
  }
}
```

### 5. Admin Panel (React + Vite + Tailwind)

**Technology Stack**:
- React 18
- Vite 5 (build tool)
- Tailwind CSS 3
- TypeScript
- Axios (HTTP client)

**Pages/Components**:

#### 5.1 Login Page
- Password input field
- Submit button
- Error message display
- Stores JWT token in sessionStorage (not the password)
- Token expires after 1 hour

#### 5.2 Dashboard Page
- Server status display (offline/starting/running/stopping)
- Public IP and port display (when running)
- Player count display (when running)
- Start button (when offline)
- Stop button (when running)
- Client password management section
  - Reveal password button (shows current password or "No password set")
  - Set password form with input field
  - Remove password button (sets empty password to disable protection)
- Auto-refresh every 10 seconds
- Last updated timestamp
- Automatic logout when JWT expires (401 response)

**Component Structure**:
```
src/
├── components/
│   ├── LoginForm.tsx
│   ├── ServerStatus.tsx
│   ├── ServerControls.tsx
│   ├── ClientPasswordManager.tsx
│   └── LoadingSpinner.tsx
├── services/
│   └── api.ts
├── types/
│   └── server.ts
├── App.tsx
└── main.tsx
```

#### 5.3 Client Password Manager Component

**Purpose**: Manage the Satisfactory Server's client protection password through the Admin Panel

**Features**:
- Display current password status ("Password set" or "No password protection")
- Reveal password button (shows actual password when clicked, hidden by default)
- Set/update password form with input field and submit button
- Remove password button (disables client protection entirely by setting empty password)
- Clear feedback when password operations succeed or fail
- Input validation and error handling
- Secure password display (masked by default, revealed only on explicit user action)

**API Integration**:
- Calls GET /server/client-password to retrieve current password
- Calls POST /server/client-password to set or update password
- Calls POST /server/client-password with empty string to remove password protection
- Handles authentication errors and network failures gracefully

**User Experience**:
- Password is hidden by default for security
- Clear visual indicators for password status (set/not set)
- Confirmation dialogs for destructive actions (removing password)
- Loading states during API operations
- Success/error messages with appropriate styling

**API Service**:
```typescript
class ApiService {
  private baseUrl: string;
  private jwtToken: string | null;

  async login(password: string): Promise<{ token: string; expiresIn: number }>;
  async getServerStatus(): Promise<StatusResponse>;
  async startServer(): Promise<StartResponse>;
  async stopServer(): Promise<StopResponse>;
  async getClientPassword(): Promise<ClientPasswordResponse>;
  async setClientPassword(password: string): Promise<SetClientPasswordResponse>;
  async removeClientPassword(): Promise<SetClientPasswordResponse>;
  
  // Automatically handles 401 responses by clearing token and redirecting to login
  private handleAuthError(): void;
}
```

**Hosting**:
- Static files built with `npm run build`
- Uploaded to S3 bucket
- Served via S3 static website hosting or CloudFront
- API Gateway URL configured as environment variable during build

## Data Models

### ECS Task

```typescript
interface ECSTask {
  taskArn: string;
  lastStatus: 'PENDING' | 'RUNNING' | 'STOPPED';
  desiredStatus: 'RUNNING' | 'STOPPED';
  containers: Array<{
    name: string;
    lastStatus: string;
    networkInterfaces: Array<{
      privateIpv4Address: string;
    }>;
  }>;
  attachments: Array<{
    type: 'ElasticNetworkInterface';
    details: Array<{
      name: string;
      value: string;
    }>;
  }>;
}
```

### Satisfactory Server State

```typescript
interface ServerGameState {
  activeSessionName: string;
  numConnectedPlayers: number;
  playerLimit: number;
  techTier: number;
  activeSchematic: string;
  gamePhase: string;
  isGameRunning: boolean;
  totalGameDuration: number;
  isGamePaused: boolean;
  averageTickRate: number;
  autoLoadSessionName: string;
}
```

### Shutdown Timer State

```typescript
interface ShutdownTimerState {
  id: 'singleton';
  timerStarted: number | null; // Unix timestamp in milliseconds
  shutdownTimeoutMinutes: number;
  lastPlayerCount: number;
  lastChecked: number; // Unix timestamp
}
```

### Secrets

```typescript
interface Secrets {
  adminPassword: string; // Admin Panel password (set by post-deploy script)
  jwtSecretKey: string; // Used for signing and verifying JWTs (set by post-deploy script)
  satisfactoryServerAdminPassword: string; // 64-character password for Satisfactory Server admin (generated by Control Lambda)
  satisfactoryApiToken: string; // Bearer token for Satisfactory Server API calls (generated by Control Lambda)
  clientProtectionPassword: string; // Optional client password for game server (set by admin via Admin Panel, empty string = no protection)
}
```

**Client Password Management**:
- The `clientProtectionPassword` secret stores the current client protection password
- An empty string value indicates no password protection is active
- The password can be set, updated, or removed through the Admin Panel
- Changes are immediately applied to the running Satisfactory Server via the SetClientPassword API
- The password is stored securely and only revealed in the Admin Panel when explicitly requested

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

After analyzing the acceptance criteria, the following properties have been identified as testable through property-based testing:

### Property 1: Data Persistence Across Restarts

*For any* game save file created while the Satisfactory Server is running, stopping and restarting the server should preserve that file in the EFS volume.

**Validates: Requirements 2.5**

### Property 2: Shutdown Timer Activation

*For any* player count transition from greater than zero to zero, the monitor Lambda should create or update a shutdown timer entry in DynamoDB with the current timestamp.

**Validates: Requirements 4.1**

### Property 3: Shutdown Timer Expiration

*For any* shutdown timer that has been active for longer than the configured timeout period with player count remaining at zero, the monitor Lambda should trigger a graceful shutdown of the ECS task.

**Validates: Requirements 4.2**

### Property 4: Shutdown Timer Cancellation

*For any* shutdown timer that is active, when the player count transitions from zero to greater than zero, the monitor Lambda should cancel the timer by removing or nullifying the timer entry in DynamoDB.

**Validates: Requirements 4.4**

### Property 5: Server State Display

*For any* valid server state value (offline, starting, running, stopping), the Admin Panel should render the corresponding state indicator in the UI.

**Validates: Requirements 5.1**

### Property 6: Password Validation and JWT Generation

*For any* password comparison between a provided password and the stored admin password, the login endpoint should return a valid JWT token with 1-hour expiration if they match, and an error if they don't match.

**Validates: Requirements 8.2**

### Property 7: JWT Token Expiration

*For any* JWT token that is older than 1 hour from its issuance time, the authorizer Lambda should reject the token and return false for authorization.

**Validates: Requirements 8.4**

### Property 8: API Authentication Enforcement

*For any* protected API endpoint, requests without a valid JWT token should be rejected with a 401 Unauthorized response.

**Validates: Requirements 11.6**

### Property 9: API Error Response Format

*For any* invalid request to the API (malformed data, missing parameters, etc.), the response should include an error object with a descriptive message and appropriate HTTP status code.

**Validates: Requirements 11.7**

### Property 10: Secret Isolation

*For any* API response from the status endpoint, the response should not contain sensitive secrets (admin password, JWT secret key, Satisfactory Server API token) unless explicitly requested through a dedicated endpoint.

**Validates: Requirements 13.3, 13.5**

## Error Handling

### Lambda Functions

**Error Categories**:
1. **Authentication Errors**: Return 401 Unauthorized
2. **Validation Errors**: Return 400 Bad Request with error message
3. **AWS Service Errors**: Log error, return 500 Internal Server Error
4. **Satisfactory Server API Errors**: Log error, return 502 Bad Gateway

**Error Response Format**:
```typescript
interface ErrorResponse {
  error: string;
  message: string;
  details?: any;
}
```

**Retry Logic**:
- ECS API calls: Exponential backoff, max 3 retries
- Satisfactory Server API calls: Linear backoff (2s, 4s, 6s), max 3 retries
- Secrets Manager calls: Exponential backoff, max 3 retries

### Admin Panel

**Error Handling**:
- Network errors: Display "Unable to connect to server" message
- Authentication errors: Redirect to login page
- Server errors: Display error message from API response
- Timeout errors: Display "Request timed out, please try again"

**User Feedback**:
- Loading spinners during API calls
- Success messages for actions (e.g., "Server starting...")
- Error messages with retry buttons
- Disabled buttons during operations

### ECS Task Failures

**Failure Scenarios**:
1. **Container fails to start**: CloudWatch logs capture error, task stops
2. **Container crashes**: ECS does not automatically restart (desired count remains 1)
3. **Health check failures**: Not implemented (Satisfactory Server has no health endpoint)

**Recovery**:
- Admin can view CloudWatch logs through AWS Console
- Admin can manually stop and restart server through Admin Panel
- Monitor Lambda detects stopped task and clears shutdown timer

## Testing Strategy

### Unit Testing

**Framework**: Jest + TypeScript

**Lambda Functions**:
- Test authorizer logic with valid/invalid passwords
- Test control Lambda endpoints with mocked AWS SDK calls
- Test monitor Lambda shutdown logic with various player count scenarios
- Test error handling and retry logic

**Admin Panel**:
- Test component rendering
- Test API service methods with mocked axios
- Test authentication flow
- Test error handling and user feedback

**Coverage Target**: 80% code coverage

### Integration Testing

**Scenarios**:
1. **Full Server Lifecycle**:
   - Start server through API
   - Verify ECS task reaches RUNNING state
   - Verify server API becomes accessible
   - Stop server through API
   - Verify ECS task stops gracefully

2. **Auto-Shutdown**:
   - Start server
   - Simulate 0 players for 10+ minutes
   - Verify monitor Lambda triggers shutdown
   - Verify server stops gracefully

3. **Client Password Management**:
   - Set client password through API
   - Verify password stored in Secrets Manager
   - Verify password updated on Satisfactory Server
   - Retrieve password through API

**Tools**:
- AWS SAM CLI for local Lambda testing
- Docker for local ECS container testing
- Postman/curl for API testing

### End-to-End Testing

**Scenarios**:
1. Deploy full stack to AWS test environment
2. Access Admin Panel through browser
3. Login with admin password
4. Start server and verify it becomes accessible
5. Connect game client to server
6. Disconnect game client and verify auto-shutdown after 10 minutes
7. Verify game saves persist across restarts

**Manual Testing Checklist**:
- [ ] Admin Panel login works
- [ ] Server starts successfully
- [ ] Public IP displayed correctly
- [ ] Game client can connect
- [ ] Player count updates in Admin Panel
- [ ] Auto-shutdown triggers after timeout
- [ ] Manual stop works
- [ ] Game saves persist
- [ ] Client password can be set and retrieved
- [ ] Error messages display correctly

## Cost Estimation

### AWS Free Tier Resources

**Eligible Services**:
- Lambda: 1M requests/month, 400,000 GB-seconds compute
- API Gateway: 1M requests/month (first 12 months)
- CloudWatch Logs: 5GB ingestion, 5GB storage
- Secrets Manager: 30-day free trial, then $0.40/secret/month
- DynamoDB: 25GB storage, 25 read/write capacity units

**Not Free Tier Eligible**:
- ECS Fargate: Charged per vCPU-hour and GB-hour
- EFS: Charged per GB-month stored
- Data Transfer: Charged for outbound data transfer
- S3: Minimal cost for static website hosting

### Monthly Cost Estimate (4 hours/day usage)

**Assumptions**:
- Server runs 4 hours/day = 120 hours/month
- 20GB EFS storage
- 10GB data transfer/month (game traffic)
- us-east-1 region

**Cost Breakdown**:
1. **ECS Fargate**:
   - vCPU: 1 vCPU × 120 hours × $0.04048/hour = $4.86
   - Memory: 8GB × 120 hours × $0.004445/GB/hour = $4.27
   - **Subtotal**: $9.13

2. **EFS**:
   - Storage: 20GB × $0.30/GB/month = $6.00
   - **Subtotal**: $6.00

3. **Lambda** (within free tier): $0.00

4. **API Gateway** (within free tier for first 12 months): $0.00

5. **Secrets Manager**:
   - 3 secrets × $0.40/month = $1.20
   - **Subtotal**: $1.20

6. **DynamoDB** (within free tier): $0.00

7. **Data Transfer**:
   - 10GB × $0.09/GB = $0.90
   - **Subtotal**: $0.90

8. **S3 + CloudFront** (minimal): ~$0.50

**Total Estimated Monthly Cost**: ~$17.73

**Budget Alert Configuration**:
- Monthly budget threshold: $20 USD (provides ~$2.27 buffer)
- Alert at 80% of budget ($16.00)
- Alert at 100% of budget ($20.00)
- Notifications sent via SNS to configured email address

**Cost Optimization Tips**:
- Use EFS Infrequent Access storage class for older saves
- Monitor and adjust shutdown timeout
- Use CloudWatch Logs retention policies
- Consider EC2 Spot instances instead of Fargate for lower costs (requires more setup)

## Deployment Instructions

### Prerequisites

- AWS CLI configured with appropriate credentials
- AWS account with permissions to create resources
- Node.js 20+ installed locally
- Docker installed (for building Lambda functions)

### Deployment Steps

1. **Clone Repository**:
   ```bash
   git clone <repository-url>
   cd satisfactory-on-demand-server
   ```

2. **Build Lambda Functions**:
   ```bash
   cd lambda
   npm install
   npm run build
   cd ..
   ```

3. **Build Admin Panel**:
   ```bash
   cd admin-panel
   npm install
   VITE_API_URL=<api-gateway-url> npm run build
   cd ..
   ```

4. **Deploy CloudFormation Stack**:
   ```bash
   aws cloudformation create-stack \
     --stack-name satisfactory-server \
     --template-body file://cloudformation/main.yaml \
     --parameters \
       ParameterKey=AdminPassword,ParameterValue=<your-password> \
       ParameterKey=ShutdownTimeoutMinutes,ParameterValue=10 \
       ParameterKey=BudgetAlertEmail,ParameterValue=<your-email> \
       ParameterKey=MonthlyBudgetThreshold,ParameterValue=20 \
     --capabilities CAPABILITY_IAM
   ```

5. **Wait for Stack Creation**:
   ```bash
   aws cloudformation wait stack-create-complete \
     --stack-name satisfactory-server
   ```

6. **Get Outputs**:
   ```bash
   aws cloudformation describe-stacks \
     --stack-name satisfactory-server \
     --query 'Stacks[0].Outputs'
   ```

7. **Upload Admin Panel to S3**:
   ```bash
   aws s3 sync admin-panel/dist/ s3://<admin-panel-bucket>/
   ```

8. **Access Admin Panel**:
   - Navigate to the S3 website URL or CloudFront distribution URL from stack outputs
   - Login with admin password
   - Start the server

### Post-Deployment Configuration

1. **Confirm Budget Alert Subscription**:
   - Check email for SNS subscription confirmation
   - Click confirmation link to receive budget alerts

2. **Start Server and Automatic Claiming**:
   - Access Admin Panel through CloudFront URL
   - Login with admin password (from CloudFormation parameter)
   - Click "Start Server"
   - Control Lambda automatically claims server on first startup:
     - Generates 64-character secure admin password
     - Claims server with generated password
     - Stores password and token in Secrets Manager
   - Wait for server to reach "running" state

3. **Configure Server Settings**:
   - Access server through game client using displayed IP and port
   - Configure game settings (difficulty, etc.)
   - Settings persist in EFS

4. **Set Client Protection Password** (optional):
   - Use Admin Panel to set client password
   - Share password with players

## Security Considerations

### Authentication & Authorization

- **JWT-Based Authentication**: Admin Panel uses short-lived JWT tokens (1-hour expiration) instead of storing passwords
- **Password Storage**: Admin password stored securely in AWS Secrets Manager, never in code or configuration files
- **API Gateway Authorization**: Lambda authorizer validates JWT signature and expiration for all protected endpoints
- **Satisfactory Server API Token**: Stored in Secrets Manager, never exposed to frontend
- **No Secrets in Frontend**: Admin Panel only receives non-sensitive operational data
- **Session Management**: JWT tokens stored in sessionStorage (cleared on browser close), automatic logout on expiration

### Network Security

- **ECS Security Group**: Restricts inbound traffic to only port 7777 (UDP/TCP) from 0.0.0.0/0 (required for game clients)
- **Lambda Security**: Lambda functions run in AWS-managed VPC with no inbound access
- **API Gateway**: HTTPS-only endpoints, no HTTP allowed
- **Admin Panel**: Served exclusively over HTTPS via CloudFront
- **VPC Configuration**: ECS tasks run in public subnet with Internet Gateway (required for public IP), but with restrictive security groups
- **No SSH Access**: ECS Fargate tasks have no SSH access by design

### Data Protection

- **EFS Encryption**: All game saves encrypted at rest using AWS-managed KMS keys
- **Secrets Manager Encryption**: All secrets encrypted at rest with automatic key rotation support
- **CloudWatch Logs Encryption**: All logs encrypted at rest
- **S3 Encryption**: Admin Panel bucket uses server-side encryption (AES-256)
- **Data in Transit**: All API communication uses TLS 1.2+
- **Satisfactory Server API**: Uses HTTPS (self-signed certificate) for all communication

### IAM Roles & Least Privilege

**Control Lambda Role**:
- ECS: UpdateService, DescribeServices, DescribeTasks, ListTasks
- Secrets Manager: GetSecretValue, PutSecretValue (specific secrets only)
- EventBridge: PutRule, DeleteRule, PutTargets, RemoveTargets
- CloudWatch Logs: CreateLogGroup, CreateLogStream, PutLogEvents

**Monitor Lambda Role**:
- ECS: DescribeServices, DescribeTasks, ListTasks, UpdateService
- DynamoDB: GetItem, PutItem, UpdateItem (specific table only)
- Secrets Manager: GetSecretValue (Satisfactory Admin token only)
- CloudWatch Logs: CreateLogGroup, CreateLogStream, PutLogEvents

**Authorizer Lambda Role**:
- Secrets Manager: GetSecretValue (JWT secret and admin password only)
- CloudWatch Logs: CreateLogGroup, CreateLogStream, PutLogEvents

**ECS Task Execution Role**:
- ECR: GetAuthorizationToken, BatchCheckLayerAvailability, GetDownloadUrlForLayer, BatchGetImage
- CloudWatch Logs: CreateLogStream, PutLogEvents
- Secrets Manager: GetSecretValue (if secrets passed as environment variables)

**ECS Task Role**:
- EFS: ClientMount, ClientWrite (specific file system only)
- CloudWatch Logs: CreateLogStream, PutLogEvents

### Input Validation & Sanitization

- **Password Requirements**: Minimum 12 characters, complexity requirements enforced
- **API Input Validation**: All Lambda functions validate input parameters and reject malformed requests
- **SQL Injection Prevention**: DynamoDB queries use parameterized operations
- **XSS Prevention**: React automatically escapes user input, Content Security Policy headers configured
- **CSRF Protection**: JWT tokens in Authorization header (not cookies) prevent CSRF attacks

### Rate Limiting & DDoS Protection

- **API Gateway Throttling**: Default throttle limits (10,000 requests/second burst, 5,000 requests/second steady)
- **Lambda Concurrency Limits**: Reserved concurrency to prevent runaway costs
- **CloudFront**: Built-in DDoS protection via AWS Shield Standard
- **Consider AWS WAF**: For production deployments, add WAF rules to block malicious traffic

### Secrets Management

- **Automatic Generation**: 64-character Satisfactory Server admin password generated on first startup using cryptographically secure random generator
- **Automatic Rotation**: JWT secret key should be rotated periodically (manual process)
- **Secrets Access Logging**: CloudTrail logs all Secrets Manager access
- **No Hardcoded Secrets**: All secrets retrieved from Secrets Manager at runtime
- **Environment Variables**: Avoid passing secrets as environment variables where possible

### Monitoring & Auditing

- **CloudTrail**: All API calls logged for audit trail
- **CloudWatch Logs**: All Lambda invocations and ECS task logs retained for 30 days
- **Failed Authentication Logging**: All failed login attempts logged with source IP
- **Budget Alerts**: SNS notifications for cost anomalies (potential security incident indicator)
- **Consider GuardDuty**: For production deployments, enable GuardDuty for threat detection

### Compliance & Best Practices

- **Resource Tagging**: All resources tagged with project identifier for tracking
- **CloudWatch Logs Retention**: Set to 30 days to balance cost and compliance
- **Regular Security Audits**: Recommended quarterly review of IAM policies and security groups
- **Patch Management**: Lambda runtimes and container images should be updated regularly
- **Backup Strategy**: EFS snapshots recommended for disaster recovery

### Known Security Limitations

1. **Satisfactory Server API**: Uses self-signed certificate, requires accepting invalid certificates
2. **Public IP Requirement**: ECS tasks must have public IP for game clients to connect
3. **Single Admin User**: No multi-user support or role-based access control
4. **No MFA**: Multi-factor authentication not implemented (future enhancement)
5. **No IP Whitelisting**: Admin Panel accessible from any IP (consider CloudFront geo-restrictions)

## Deployment Instructions

### Prerequisites

- AWS CLI configured with appropriate credentials
- AWS account with permissions to create resources
- Node.js 20+ installed locally
- Docker installed (for building Lambda functions)
- Bash shell (for post-deployment script)

### Deployment Steps

1. **Clone Repository**:
   ```bash
   git clone <repository-url>
   cd satisfactory-on-demand-server
   ```

2. **Build Lambda Functions**:
   ```bash
   cd lambda
   npm install
   npm run build
   cd ..
   ```

3. **Deploy CloudFormation Stack**:
   ```bash
   aws cloudformation create-stack \
     --stack-name satisfactory-server \
     --template-body file://cloudformation/main.yaml \
     --parameters \
       ParameterKey=ShutdownTimeoutMinutes,ParameterValue=10 \
       ParameterKey=BudgetAlertEmail,ParameterValue=<your-email> \
       ParameterKey=MonthlyBudgetThreshold,ParameterValue=20 \
     --capabilities CAPABILITY_IAM
   ```

4. **Wait for Stack Creation**:
   ```bash
   aws cloudformation wait stack-create-complete \
     --stack-name satisfactory-server
   ```

5. **Run Post-Deployment Script**:
   ```bash
   ./scripts/post-deploy.sh satisfactory-server
   ```
   
   This script will:
   - Check if admin password and JWT secret already exist in Secrets Manager
   - If not, generate secure random values:
     - 32-character admin password using `openssl rand -base64 32`
     - 64-character JWT secret key using `openssl rand -base64 64`
   - Store them in Secrets Manager
   - Output the admin password to console
   - Save API Gateway URL to `.env.local` file for admin panel build

6. **Build Admin Panel** (with API Gateway URL from script):
   ```bash
   cd admin-panel
   npm install
   source ../.env.local
   npm run build
   cd ..
   ```

7. **Get Stack Outputs**:
   ```bash
   aws cloudformation describe-stacks \
     --stack-name satisfactory-server \
     --query 'Stacks[0].Outputs'
   ```
   
   **Important Outputs**:
   - `AdminPanelBucket`: S3 bucket name for admin panel
   - `CloudFrontURL`: CloudFront URL for accessing the admin panel
   - `APIGatewayURL`: API Gateway endpoint URL

8. **Upload Admin Panel to S3**:
   ```bash
   aws s3 sync admin-panel/dist/ s3://<admin-panel-bucket-from-outputs>/
   ```

9. **Access Admin Panel**:
   - Navigate to the CloudFront URL from stack outputs
   - Login with admin password from post-deploy script output
   - Start the server

### Post-Deployment Configuration

1. **Retrieve Admin Password** (if needed later):
   ```bash
   aws secretsmanager get-secret-value \
     --secret-id satisfactory-admin-password \
     --query 'SecretString' \
     --output text
   ```

2. **Confirm Budget Alert Subscription**:
   - Check email for SNS subscription confirmation
   - Click confirmation link to receive budget alerts

3. **Start Server and Automatic Claiming**:
   - Access Admin Panel through CloudFront URL
   - Login with admin password
   - Click "Start Server"
   - Control Lambda automatically claims server on first startup:
     - Generates 64-character secure admin password for Satisfactory Server
     - Claims server with generated password
     - Stores password and token in Secrets Manager
   - Wait for server to reach "running" state

4. **Configure Server Settings**:
   - Access server through game client using displayed IP and port
   - Configure game settings (difficulty, etc.)
   - Settings persist in EFS

5. **Set Client Protection Password** (optional):
   - Use Admin Panel to set client password
   - Share password with players

## Future Enhancements

1. **Custom Domain for Admin Panel**: Configure CloudFront distribution with alternate domain name (CNAME) and SSL certificate from ACM
2. **Multi-Server Support**: Manage multiple Satisfactory Server instances
3. **Backup Automation**: Scheduled EFS snapshots
4. **Metrics Dashboard**: CloudWatch dashboard for server performance
5. **Discord Integration**: Notifications for server events
6. **Scheduled Startup**: Automatically start server at specific times
7. **Server Mods Support**: Custom container image with mod support
8. **Player Whitelist**: Manage allowed players through Admin Panel

## Post-Deployment Script

The `scripts/post-deploy.sh` script automates secret generation and configuration:

```bash
#!/bin/bash
set -e

STACK_NAME=$1

if [ -z "$STACK_NAME" ]; then
  echo "Usage: ./post-deploy.sh <stack-name>"
  exit 1
fi

echo "Configuring secrets for stack: $STACK_NAME"

# Check if admin password already exists
if aws secretsmanager describe-secret --secret-id satisfactory-admin-password 2>/dev/null; then
  echo "Admin password already exists, skipping generation"
  ADMIN_PASSWORD=$(aws secretsmanager get-secret-value \
    --secret-id satisfactory-admin-password \
    --query 'SecretString' \
    --output text)
else
  echo "Generating admin password..."
  ADMIN_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=' | cut -c1-32)
  aws secretsmanager put-secret-value \
    --secret-id satisfactory-admin-password \
    --secret-string "$ADMIN_PASSWORD"
  echo "Admin password generated and stored in Secrets Manager"
fi

# Check if JWT secret already exists
if aws secretsmanager describe-secret --secret-id satisfactory-jwt-secret 2>/dev/null; then
  echo "JWT secret already exists, skipping generation"
else
  echo "Generating JWT secret..."
  JWT_SECRET=$(openssl rand -base64 64 | tr -d '/+=' | cut -c1-64)
  aws secretsmanager put-secret-value \
    --secret-id satisfactory-jwt-secret \
    --secret-string "$JWT_SECRET"
  echo "JWT secret generated and stored in Secrets Manager"
fi

# Get API Gateway URL from stack outputs
API_URL=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --query 'Stacks[0].Outputs[?OutputKey==`APIGatewayURL`].OutputValue' \
  --output text)

# Save to .env.local for admin panel build
echo "VITE_API_URL=$API_URL" > .env.local

echo ""
echo "========================================="
echo "Deployment Configuration Complete!"
echo "========================================="
echo ""
echo "Admin Password: $ADMIN_PASSWORD"
echo ""
echo "IMPORTANT: Save this password securely!"
echo "You will need it to log into the admin panel."
echo ""
echo "API Gateway URL has been saved to .env.local"
echo "You can now build the admin panel with: cd admin-panel && npm run build"
echo ""
```
