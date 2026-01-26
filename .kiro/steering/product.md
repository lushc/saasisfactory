# Product Overview

This project is an on-demand Satisfactory game server solution deployed on AWS infrastructure. It enables cost-effective hosting of a Satisfactory dedicated server that automatically scales down when not in use.

## Key Features

- **Auto-scaling**: Server automatically shuts down after configurable timeout (default 10 minutes) when no players are connected
- **Web-based management**: React admin panel for starting, stopping, and monitoring the server with real-time status updates
- **Persistent storage**: Game saves are retained across server restarts using Amazon EFS with encryption at rest
- **Cost optimization**: Designed to minimize AWS costs by only running when needed (estimated $14-28/month based on usage)
- **Security**: Password-protected admin panel with JWT authentication (1-hour expiration), secure secret management via AWS Secrets Manager
- **Client password management**: Set, update, and remove Satisfactory server client protection passwords through the admin panel
- **Automatic server claiming**: First-time server setup is handled automatically with secure password generation
- **Comprehensive monitoring**: Built-in cost alerts, CloudWatch logging, and real-time player count tracking
- **Mobile-responsive design**: Admin panel works seamlessly on desktop and mobile devices

## Target Usage

The solution is optimized for small groups (up to 4 players) who play a few hours per day and want to avoid paying for 24/7 server hosting. The server runs on AWS ECS Fargate with configurable resources:

- **Default Configuration**: 1 vCPU, 8GB memory
- **Customizable**: CPU and memory can be adjusted based on group size and performance needs
- **Storage**: 20GB persistent storage on Amazon EFS for game saves
- **Network**: Public IP with port 7777 (UDP/TCP) for game connections

## Cost Benefits

- **60-80% cost savings** compared to traditional 24/7 dedicated servers
- **Pay-per-use model**: Only charged for compute resources when server is running
- **Free tier eligible**: Many AWS services used qualify for free tier benefits (first 12 months)
- **Built-in cost monitoring**: AWS Budgets integration with email alerts at 80% and 100% of monthly threshold
- **Optimization tools**: Built-in recommendations and commands for cost reduction

## Architecture Highlights

- **Serverless backend**: Three Lambda functions handle authentication, server management, and monitoring
- **Infrastructure as Code**: Complete CloudFormation template for repeatable deployments
- **Auto-shutdown logic**: DynamoDB-backed timer system with EventBridge scheduling
- **Secure token management**: Automatic Satisfactory Server API token refresh and validation
- **Graceful shutdown**: Server saves game state before stopping to prevent data loss
- **Error resilience**: Comprehensive error handling and retry logic throughout the system
