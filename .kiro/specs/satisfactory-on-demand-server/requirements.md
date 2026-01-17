# Requirements Document

## Introduction

This document specifies the requirements for an on-demand Satisfactory game server solution deployed on AWS infrastructure. The system enables cost-effective hosting of a Satisfactory dedicated server that automatically scales down when not in use, while providing a web-based admin panel for server management. The solution leverages Infrastructure as Code (IaC) for deployment and uses AWS free tier resources where possible to minimize operational costs.

## Glossary

- **Satisfactory Server**: The dedicated game server running the wolveix/satisfactory-server Docker container
- **Admin Panel**: A React-based web application for managing the Satisfactory Server
- **ECS**: Amazon Elastic Container Service, the AWS service used to run containerized applications
- **Fargate**: AWS serverless compute engine for containers
- **EFS**: Amazon Elastic File System, used for persistent storage of game saves
- **CloudFormation**: AWS Infrastructure as Code service for defining and provisioning AWS resources
- **API Gateway**: AWS service for creating and managing HTTP APIs
- **Lambda**: AWS serverless compute service for running backend functions
- **CloudWatch**: AWS monitoring and logging service
- **Server State**: The current operational status of the Satisfactory Server (offline, idle, loading, or playing)
- **Player Count**: The number of players currently connected to the Satisfactory Server
- **Auto-Shutdown**: The process of gracefully stopping the Satisfactory Server after a period of inactivity
- **Persistent Storage**: Storage that retains game save files across server restarts
- **IaC**: Infrastructure as Code, the practice of managing infrastructure through code

## Requirements

### Requirement 1

**User Story:** As a server administrator, I want the infrastructure to be defined and deployed using IaC, so that the deployment is repeatable, version-controlled, and maintainable.

#### Acceptance Criteria

1. THE System SHALL provide CloudFormation templates that define all AWS resources required for the solution
2. WHEN the CloudFormation stack is deployed, THE System SHALL create all necessary networking, compute, storage, and security resources
3. THE CloudFormation templates SHALL use parameters to allow customization of key configuration values
4. THE System SHALL include documentation for deploying the infrastructure using the CloudFormation templates
5. THE CloudFormation templates SHALL follow AWS best practices for security and resource organization

### Requirement 2

**User Story:** As a server administrator, I want the Satisfactory Server to run with adequate resources, so that players have a stable gaming experience.

#### Acceptance Criteria

1. THE Satisfactory Server SHALL be allocated a minimum of 1 vCPU
2. THE Satisfactory Server SHALL be allocated a minimum of 8GB of memory
3. THE Satisfactory Server SHALL have access to 20GB of persistent storage for game saves
4. WHEN the Satisfactory Server is running, THE System SHALL maintain stable performance for connected players
5. THE persistent storage SHALL retain game save files when the Satisfactory Server stops and restarts

### Requirement 3

**User Story:** As a player, I want to connect to the Satisfactory Server using a public IP address, so that I can join the game from anywhere.

#### Acceptance Criteria

1. WHEN the Satisfactory Server is running, THE System SHALL expose the server on a publicly accessible IP address
2. THE System SHALL expose port 7777 for game client connections
3. THE System SHALL expose port 7777 for the Satisfactory Server API (UDP and HTTPS)
4. WHEN the Satisfactory Server starts, THE System SHALL provide the public IP address to the Admin Panel
5. THE System SHALL maintain network connectivity for the duration of active player sessions

### Requirement 4

**User Story:** As a cost-conscious administrator, I want the server to automatically shut down when not in use, so that I minimize AWS costs.

#### Acceptance Criteria

1. WHEN the Player Count reaches zero, THE System SHALL start a shutdown timer
2. WHEN the shutdown timer expires AND the Player Count remains zero, THE System SHALL initiate a graceful shutdown of the Satisfactory Server
3. THE shutdown timer SHALL be configurable with a default value of 10 minutes
4. WHEN players connect before the shutdown timer expires, THE System SHALL cancel the shutdown timer
5. THE System SHALL use the Satisfactory Server API to monitor the Player Count

### Requirement 5

**User Story:** As a server administrator, I want to monitor the server status through an admin panel, so that I know when the server is available for players.

#### Acceptance Criteria

1. THE Admin Panel SHALL display the current Server State (offline, starting, running, or stopping)
2. WHEN the Satisfactory Server is running, THE Admin Panel SHALL display the public IP address and port
3. WHEN the Satisfactory Server is running, THE Admin Panel SHALL display the current Player Count
4. THE Admin Panel SHALL poll the backend API every 10 seconds to update the server status
5. THE Admin Panel SHALL display the last update timestamp

### Requirement 6

**User Story:** As a server administrator, I want to start the server through the admin panel, so that I can make it available for players on demand.

#### Acceptance Criteria

1. WHEN the Satisfactory Server is offline, THE Admin Panel SHALL display a start button
2. WHEN the administrator clicks the start button, THE System SHALL initiate the Satisfactory Server startup process
3. WHEN the startup process begins, THE Admin Panel SHALL disable the start button and show a loading indicator
4. WHEN the Satisfactory Server reaches the running state, THE Admin Panel SHALL hide the start button
5. THE System SHALL provide feedback if the startup process fails

### Requirement 7

**User Story:** As a server administrator, I want to stop the server gracefully through the admin panel, so that I can shut it down without corrupting game saves.

#### Acceptance Criteria

1. WHEN the Satisfactory Server is running, THE Admin Panel SHALL display a stop button
2. WHEN the administrator clicks the stop button, THE System SHALL initiate a graceful shutdown of the Satisfactory Server
3. THE graceful shutdown SHALL save the current game state before stopping the server
4. WHEN the shutdown process begins, THE Admin Panel SHALL disable the stop button and show a loading indicator
5. WHEN the Satisfactory Server reaches the offline state, THE Admin Panel SHALL hide the stop button

### Requirement 8

**User Story:** As a server administrator, I want the admin panel to be password protected, so that only authorized users can control the server.

#### Acceptance Criteria

1. WHEN a user accesses the Admin Panel, THE System SHALL require authentication before displaying server controls
2. THE System SHALL validate the provided password against a securely stored admin password
3. WHEN authentication fails, THE System SHALL display an error message and prevent access to server controls
4. WHEN authentication succeeds, THE System SHALL issue a JWT token with 1-hour expiration for the session
5. THE admin password SHALL be auto-generated during post-deployment if not already set

### Requirement 8A

**User Story:** As a server administrator, I want to manage the Satisfactory Server client protection password through the admin panel, so that I can control who can join the game server.

#### Acceptance Criteria

1. THE Admin Panel SHALL display the current client protection password when the administrator clicks a reveal button
2. THE Admin Panel SHALL provide a form to set or update the client protection password
3. WHEN the administrator submits a new client protection password, THE System SHALL update the password on the Satisfactory Server
4. THE System SHALL store the client protection password securely in AWS Secrets Manager or Parameter Store
5. THE Admin Panel SHALL hide the client protection password by default and only reveal it when explicitly requested

### Requirement 9

**User Story:** As a server administrator, I want the admin panel to be built with modern web technologies, so that it is responsive and easy to maintain.

#### Acceptance Criteria

1. THE Admin Panel SHALL be built using React as the UI framework
2. THE Admin Panel SHALL use Vite as the build tool
3. THE Admin Panel SHALL use Tailwind CSS for styling
4. THE Admin Panel SHALL be responsive and work on desktop and mobile devices
5. THE Admin Panel SHALL be hosted as a static website on AWS

### Requirement 10

**User Story:** As a cost-conscious administrator, I want the solution to use AWS free tier resources where possible, so that I minimize monthly costs.

#### Acceptance Criteria

1. THE System SHALL use AWS services that offer free tier benefits where applicable
2. THE System SHALL document which resources incur costs and provide cost estimates
3. WHERE free tier limits are exceeded, THE System SHALL use the most cost-effective AWS service options
4. THE System SHALL be designed to minimize costs for a usage pattern of a few hours per day
5. THE System SHALL avoid unnecessary resource allocation when the server is not in use

### Requirement 11

**User Story:** As a developer, I want a backend API to manage server operations, so that the admin panel can control the Satisfactory Server.

#### Acceptance Criteria

1. THE System SHALL provide an API endpoint to start the Satisfactory Server
2. THE System SHALL provide an API endpoint to stop the Satisfactory Server
3. THE System SHALL provide an API endpoint to retrieve the current server status
4. THE System SHALL provide an API endpoint to retrieve the client protection password
5. THE System SHALL provide an API endpoint to set or update the client protection password
6. THE API SHALL authenticate requests using JWT tokens obtained via password login
7. THE API SHALL return appropriate error responses for invalid requests

### Requirement 12

**User Story:** As a system operator, I want the solution to monitor the Satisfactory Server and automatically manage its lifecycle, so that it operates reliably without manual intervention.

#### Acceptance Criteria

1. THE System SHALL continuously monitor the Satisfactory Server while it is running
2. WHEN the Satisfactory Server is running, THE System SHALL query the server API to determine the Player Count
3. THE System SHALL implement the auto-shutdown logic based on Player Count and timer expiration
4. THE System SHALL log all server lifecycle events for troubleshooting
5. WHEN errors occur during monitoring, THE System SHALL log the errors and continue monitoring

### Requirement 13

**User Story:** As a security-conscious administrator, I want all API communications to be secured and secrets to be protected, so that unauthorized users cannot access or control the server.

#### Acceptance Criteria

1. THE System SHALL store the Satisfactory Server API token securely in AWS Secrets Manager
2. THE System SHALL store the admin panel password securely in AWS Secrets Manager
3. THE Backend API SHALL retrieve secrets from secure storage and SHALL NOT expose them to the Admin Panel
4. THE Backend API SHALL communicate with the Satisfactory Server API using the stored API token
5. THE Admin Panel SHALL only receive non-sensitive data from the Backend API (server status, IP address, player count)
6. THE System SHALL use HTTPS for all communication between the Admin Panel and Backend API
7. THE Satisfactory Server API token SHALL be generated on first server startup and stored securely
