# Implementation Plan

**IMPORTANT DEPLOYMENT NOTES:**
- **No AWS resources are deployed until Task 15** - all prior tasks create local files only
- **Deployment only happens through the deployment script** - CloudFormation templates and code are prepared but not deployed
- Tasks 1-14 focus on creating infrastructure templates, Lambda code, and Admin Panel locally
- Task 15 is the first and only deployment step using the deployment script

- [x] 1. Set up project structure and CloudFormation templates
- [x] 1.1 Create directory structure for CloudFormation templates, Lambda functions, and Admin Panel
  - Create `cloudformation/`, `lambda/`, `admin-panel/`, and `scripts/` directories
  - Set up basic project README with overview
  - _Requirements: 1.1, 1.4_

- [x] 1.2 Create main CloudFormation template with parameters
  - Define stack parameters (ShutdownTimeoutMinutes, ServerMemory, ServerCPU, BudgetAlertEmail, MonthlyBudgetThreshold)
  - Set up template metadata and description
  - **Note: Template created locally only - no deployment yet**
  - _Requirements: 1.1, 1.3_

- [x] 2. Implement networking and storage infrastructure
- [x] 2.1 Define VPC and networking resources in CloudFormation
  - Create VPC with public subnets
  - Configure Internet Gateway and route tables
  - Set up security groups for ECS tasks (port 7777 UDP/TCP)
  - **Note: CloudFormation template definitions only - no AWS resources created yet**
  - _Requirements: 1.2, 3.1, 3.2, 3.3_

- [x] 2.2 Define EFS file system and mount targets
  - Create EFS file system with encryption
  - Configure mount targets in each subnet
  - Set up access points for ECS tasks
  - **Note: CloudFormation template definitions only - no AWS resources created yet**
  - _Requirements: 2.3, 2.5_

- [x] 3. Implement ECS infrastructure
- [x] 3.1 Create ECS cluster and task definition
  - Define ECS cluster resource
  - Create task definition for Satisfactory Server container
  - Configure CPU (1024), memory (8192), and network mode (awsvpc)
  - Set up port mappings (7777 UDP/TCP)
  - Configure EFS volume mount at `/config`
  - Add environment variables (MAXPLAYERS, PGID, PUID, STEAMBETA)
  - _Requirements: 2.1, 2.2, 2.3, 3.2, 3.3_

- [x] 3.2 Create ECS service with desired count 0
  - Define ECS service resource
  - Set initial desired count to 0 (server starts offline)
  - Configure network configuration with public IP assignment
  - Link to security group and subnets
  - _Requirements: 1.2_

- [x] 3.3 Set up IAM roles for ECS tasks
  - Create ECS task execution role (pull images, write logs)
  - Create ECS task role (access EFS, write logs)
  - Define least-privilege policies
  - _Requirements: 1.5_

- [x] 4. Implement Secrets Manager resources
- [x] 4.1 Create Secrets Manager secrets in CloudFormation
  - Create `satisfactory-admin-password` secret with placeholder
  - Create `satisfactory-jwt-secret` secret with placeholder
  - Create `satisfactory-server-admin-password` secret with placeholder
  - Create `satisfactory-api-token` secret with placeholder
  - Create `satisfactory-client-password` secret with placeholder
  - _Requirements: 13.1, 13.2_

- [x] 5. Implement DynamoDB table for shutdown timer
- [x] 5.1 Create DynamoDB table in CloudFormation
  - Define table with partition key `id`
  - Configure on-demand billing mode
  - Set up attributes for timer state
  - _Requirements: 4.1, 4.2, 4.4_

- [x] 6. Implement Lambda authorizer function
- [x] 6.1 Create Lambda authorizer function code
  - Set up Node.js 24.x project with TypeScript
  - Implement JWT token extraction from Authorization header
  - Add JWT signature verification using jsonwebtoken library
  - Implement token expiration check (1-hour limit)
  - Return authorization decision
  - _Requirements: 8.2, 8.4, 11.6_

- [x] 6.2 Write property test for JWT token expiration
  - **Property 7: JWT Token Expiration**
  - **Validates: Requirements 8.4**

- [x] 6.3 Create CloudFormation resource for authorizer Lambda
  - Define Lambda function resource
  - Set up IAM role with Secrets Manager read permissions
  - Configure environment variables
  - Add CloudWatch Logs permissions
  - _Requirements: 1.2_

- [x] 6.4 Configure API Gateway authorizer
  - Create Lambda authorizer in API Gateway
  - Set authorization header as identity source
  - Configure caching (optional)
  - _Requirements: 11.6_

- [x] 7. Implement Control Lambda function
- [x] 7.1 Create Control Lambda project structure
  - Set up Node.js 24.x project with TypeScript
  - Install dependencies (AWS SDK v3, axios, jsonwebtoken)
  - Create shared utilities for Satisfactory Server API calls
  - _Requirements: 11.1, 11.2, 11.3_

- [x] 7.2 Implement POST /auth/login endpoint
  - Validate password against Secrets Manager
  - Generate JWT token with 1-hour expiration
  - Return token and expiration time
  - Handle authentication errors
  - _Requirements: 8.2, 8.4_

- [x] 7.3 Write property test for password validation and JWT generation
  - **Property 6: Password Validation and JWT Generation**
  - **Validates: Requirements 8.2**

- [x] 7.4 Implement POST /server/start endpoint
  - Update ECS service desired count to 1
  - Wait for task to reach RUNNING state
  - Get task public IP address
  - Check if server is claimed (first startup vs subsequent)
  - If unclaimed: generate 64-char password, call PasswordlessLogin, call ClaimServer
  - If claimed: retrieve password, call PasswordLogin
  - Store Satisfactory Server admin password and API token in Secrets Manager
  - Create EventBridge rule for Monitor Lambda (every 2 minutes)
  - Return server status and public IP
  - _Requirements: 6.2, 3.4_

- [x] 7.5 Implement POST /server/stop endpoint
  - Retrieve Satisfactory Server API token from Secrets Manager
  - Verify token with VerifyAuthenticationToken
  - If invalid, regenerate via PasswordLogin
  - Call Shutdown API to save game
  - Update ECS service desired count to 0
  - Delete EventBridge rule for Monitor Lambda
  - Return success status
  - _Requirements: 7.2, 7.3_

- [x] 7.6 Implement GET /server/status endpoint
  - Query ECS for task status
  - If running, retrieve API token and verify
  - Call QueryServerState to get player count and game state
  - Return comprehensive status (state, IP, port, player count)
  - _Requirements: 5.1, 5.2, 5.3, 11.3_

- [x] 7.7 Implement GET /server/client-password endpoint
  - Retrieve Satisfactory Server API token
  - Verify token with VerifyAuthenticationToken
  - Retrieve client password from Secrets Manager
  - Return password
  - _Requirements: 8A.1, 11.4_

- [x] 7.8 Implement POST /server/client-password endpoint
  - Retrieve Satisfactory Server API token
  - Verify token with VerifyAuthenticationToken
  - Call SetClientPassword API
  - Update password in Secrets Manager
  - Return success status
  - _Requirements: 8A.3, 8A.4, 11.5_

- [x] 7.9 Write property test for API authentication enforcement
  - **Property 8: API Authentication Enforcement**
  - **Validates: Requirements 11.6**

- [x] 7.10 Write property test for API error response format
  - **Property 9: API Error Response Format**
  - **Validates: Requirements 11.7**

- [x] 7.11 Write property test for secret isolation
  - **Property 10: Secret Isolation**
  - **Validates: Requirements 13.3, 13.5**

- [x] 7.12 Create CloudFormation resource for Control Lambda
  - Define Lambda function resource
  - Set up IAM role with ECS, Secrets Manager, EventBridge permissions
  - Configure environment variables (cluster name, service name, etc.)
  - Add CloudWatch Logs permissions
  - **REFACTORING COMPLETED**: Implemented comprehensive code quality improvements including:
    - **Modular Architecture**: Extracted shared utilities (config, errors, test-helpers) to `lambda/shared/`
    - **Error Handling**: Implemented custom error types with proper HTTP status codes and structured error responses
    - **Code Organization**: Broke down long methods into focused, single-responsibility functions
    - **Type Safety**: Enhanced TypeScript types and interfaces for better compile-time checking
    - **Security**: Fixed IP address extraction logic to properly query EC2 for public IPs
    - **Performance**: Implemented exponential backoff for retry logic and optimized API calls
    - **Testing**: Created comprehensive test helpers and improved property-based tests
    - **Configuration**: Centralized configuration management with environment variable abstraction
    - **DRY Principle**: Eliminated duplicate code patterns across handlers (token validation, server checks)
  - _Requirements: 1.2_

- [x] 8. Implement Monitor Lambda function
- [x] 8.1 Create Monitor Lambda function code
  - Set up Node.js 24.x project with TypeScript
  - Check if ECS task is running
  - Retrieve and verify Satisfactory Server API token
  - Call QueryServerState to get player count
  - Retrieve shutdown timer state from DynamoDB
  - Implement shutdown timer logic (start, check expiration, cancel)
  - Update timer state in DynamoDB
  - Trigger shutdown if timer expires
  - _Requirements: 4.1, 4.2, 4.4, 12.1, 12.2, 12.3_

- [x] 8.2 Write property test for shutdown timer activation
  - **Property 2: Shutdown Timer Activation**
  - **Validates: Requirements 4.1**

- [x] 8.3 Write property test for shutdown timer expiration
  - **Property 3: Shutdown Timer Expiration**
  - **Validates: Requirements 4.2**

- [x] 8.4 Write property test for shutdown timer cancellation
  - **Property 4: Shutdown Timer Cancellation**
  - **Validates: Requirements 4.4**

- [x] 8.5 Create CloudFormation resource for Monitor Lambda
  - Define Lambda function resource
  - Set up IAM role with ECS, DynamoDB, Secrets Manager permissions
  - Configure environment variables
  - Add CloudWatch Logs permissions
  - Note: EventBridge rule created dynamically by Control Lambda
  - _Requirements: 1.2, 12.1_

- [x] 8.6 **CHECKPOINT: Update steering documents**
  - Review and update `.kiro/steering/structure.md` with actual Lambda implementation patterns
  - Update `.kiro/steering/tech.md` with any new dependencies or patterns discovered
  - Verify steering docs reflect current state of backend implementation

- [x] 9. Implement API Gateway
- [x] 9.1 Create API Gateway HTTP API in CloudFormation
  - Define HTTP API resource
  - Configure CORS settings
  - Set up default stage with auto-deploy
  - _Requirements: 11.1, 11.2, 11.3, 13.6_

- [x] 9.2 Create API Gateway routes and integrations
  - POST /auth/login → Control Lambda (no auth)
  - POST /server/start → Control Lambda (with auth)
  - POST /server/stop → Control Lambda (with auth)
  - GET /server/status → Control Lambda (with auth)
  - GET /server/client-password → Control Lambda (with auth)
  - POST /server/client-password → Control Lambda (with auth)
  - Link routes to Lambda authorizer (except /auth/login)
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

- [x] 10. Implement Admin Panel
- [x] 10.1 Create React + Vite + Tailwind project
  - Initialize Vite 7 project with React 19 and TypeScript
  - Install and configure Tailwind CSS 4
  - Set up project structure (components, services, types)
  - Configure environment variables for API URL
  - _Requirements: 9.1, 9.2, 9.3_

- [x] 10.2 Create API service module
  - Implement ApiService class with axios
  - Add methods for all API endpoints
  - Implement JWT token storage in sessionStorage
  - Add automatic 401 handling (clear token, redirect to login)
  - _Requirements: 8.4, 11.1, 11.2, 11.3_

- [x] 10.3 Implement Login page component
  - Create password input form
  - Add submit button and error display
  - Call /auth/login endpoint
  - Store JWT token in sessionStorage
  - Redirect to dashboard on success
  - _Requirements: 8.1, 8.2, 8.3_

- [x] 10.4 Implement Dashboard page component
  - Create layout with server status display
  - Add start/stop buttons with loading states
  - Display public IP, port, and player count
  - Implement auto-refresh every 10 seconds
  - Show last updated timestamp
  - Handle automatic logout on JWT expiration
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.3, 6.4, 7.1, 7.4, 7.5_

- [x] 10.5 Write property test for server state display
  - **Property 5: Server State Display**
  - **Validates: Requirements 5.1**

- [x] 10.6 Implement Client Password Manager component
  - Add reveal password button
  - Create set password form
  - Call GET /server/client-password endpoint
  - Call POST /server/client-password endpoint
  - Hide password by default
  - _Requirements: 8A.1, 8A.2, 8A.3, 8A.5_

- [x] 10.7 Add responsive design and styling
  - Ensure mobile-friendly layout
  - Add loading spinners and error messages
  - Style buttons and forms with Tailwind CSS 4
  - _Requirements: 9.4_

- [x] 10.8 **CHECKPOINT: Update steering documents**
  - Review and update `.kiro/steering/structure.md` with actual Admin Panel component organization
  - Update `.kiro/steering/tech.md` with frontend patterns and any additional libraries
  - Verify steering docs reflect current state of frontend implementation

- [x] 11. Implement S3 and CloudFront for Admin Panel hosting
- [x] 11.1 Create S3 bucket in CloudFormation
  - Define S3 bucket for static website hosting
  - Configure bucket encryption
  - Set up bucket policy for CloudFront access
  - _Requirements: 9.5_

- [x] 11.2 Create CloudFront distribution in CloudFormation
  - Define CloudFront distribution
  - Configure origin as S3 bucket
  - Set up default cache behavior
  - Enable HTTPS only
  - Configure default root object (index.html)
  - _Requirements: 9.5, 13.6_

- [x] 12. Implement cost monitoring
- [x] 12.1 Create AWS Budgets alert in CloudFormation
  - Define budget with monthly threshold ($20)
  - Create SNS topic for notifications
  - Configure alerts at 80% and 100% of budget
  - Add email subscription
  - _Requirements: 10.2_

- [x] 13. Create post-deployment script
- [x] 13.1 Write post-deploy.sh script
  - Check if admin password exists, generate if not (32 chars)
  - Check if JWT secret exists, generate if not (64 chars)
  - Use `put-secret-value` to update existing secrets
  - Retrieve API Gateway URL from CloudFormation outputs
  - Save API URL to .env.local file
  - Output admin password to console
  - **Note: Script created locally - will be used in Task 15 for actual deployment**
  - _Requirements: 8.5, 13.1, 13.2_

- [x] 13.2 Make script executable and test
  - Set execute permissions on script
  - Test idempotency (run multiple times)
  - Verify secrets are created/updated correctly
  - _Requirements: 1.4_

- [ ] 14. Create deployment documentation
- [ ] 14.1 Write deployment README
  - Document prerequisites (AWS CLI, Node.js, Docker)
  - Provide step-by-step deployment instructions using the deployment script
  - Include post-deployment configuration steps
  - Add troubleshooting section
  - **Note: Documentation only - no deployment occurs until Task 15**
  - _Requirements: 1.4_

- [ ] 14.2 Document cost estimates and optimization tips
  - Include monthly cost breakdown
  - Document free tier usage
  - Provide cost optimization recommendations
  - _Requirements: 10.2_

- [ ] 14.3 **CHECKPOINT: Final steering document update**
  - Review all steering documents for accuracy against final implementation
  - Update `.kiro/steering/tech.md` with final deployment commands and any script details
  - Update `.kiro/steering/structure.md` with complete project structure including scripts
  - Ensure all three steering docs are comprehensive and accurate for future reference

- [ ] 15. Final integration and testing
- [ ] 15.1 Deploy full stack to test environment **[FIRST DEPLOYMENT]**
  - **This is the first time any AWS resources are created**
  - Run CloudFormation deployment using deployment script
  - Execute post-deploy script to configure secrets
  - Build and upload Admin Panel to S3
  - Verify all resources created successfully
  - _Requirements: 1.2_

- [ ] 15.2 Test complete server lifecycle
  - Login to Admin Panel
  - Start server and verify claiming process
  - Check server becomes accessible
  - Verify player count monitoring
  - Test manual stop
  - Verify auto-shutdown after timeout
  - Confirm game saves persist across restarts
  - _Requirements: 2.5, 4.2, 6.2, 7.2_

- [ ] 15.3 Write property test for data persistence across restarts
  - **Property 1: Data Persistence Across Restarts**
  - **Validates: Requirements 2.5**

- [ ] 15.4 Test client password management
  - Set client password through Admin Panel
  - Verify password stored in Secrets Manager
  - Retrieve password through Admin Panel
  - Test password update
  - _Requirements: 8A.3, 8A.4_

- [ ] 15.5 Verify security controls
  - Test JWT expiration and automatic logout
  - Verify secrets not exposed in API responses
  - Confirm HTTPS enforcement
  - Test authentication on all protected endpoints
  - _Requirements: 8.4, 13.3, 13.5, 13.6_

- [ ] 16. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
