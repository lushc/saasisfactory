# Satisfactory On-Demand Server

An on-demand Satisfactory game server solution deployed on AWS infrastructure that automatically scales down when not in use, providing cost-effective hosting for small gaming groups.

## Overview

This solution enables cost-effective hosting of a Satisfactory dedicated server that automatically shuts down after 10 minutes of inactivity (no players connected). The system consists of:

- **Infrastructure Layer**: AWS resources defined using CloudFormation templates
- **Backend API Layer**: Lambda functions that manage server lifecycle and provide status information  
- **Frontend Layer**: React-based admin panel for server management

## Key Features

- **Auto-scaling**: Server automatically shuts down after configurable timeout when no players are connected
- **Web-based management**: React admin panel for starting, stopping, and monitoring the server
- **Persistent storage**: Game saves are retained across server restarts using Amazon EFS
- **Cost optimization**: Designed to minimize AWS costs by only running when needed (estimated ~$18/month for 4 hours/day usage)
- **Security**: Password-protected admin panel with JWT authentication, secure secret management
- **Client password management**: Set and manage Satisfactory server client protection passwords

## Architecture

The solution leverages:
- **ECS Fargate**: Runs the Satisfactory server container (wolveix/satisfactory-server)
- **Amazon EFS**: Provides persistent storage for game saves
- **Lambda Functions**: Handle authentication, server lifecycle, and monitoring
- **API Gateway**: Exposes REST API for admin panel
- **Secrets Manager**: Securely stores passwords and API tokens
- **DynamoDB**: Tracks shutdown timer state
- **S3 + CloudFront**: Hosts the admin panel static website

## Project Structure

```
.
├── cloudformation/          # Infrastructure as Code templates
├── lambda/                 # Backend Lambda functions
├── admin-panel/            # React frontend application
├── scripts/                # Deployment and utility scripts
└── README.md               # This file
```

## Target Usage

Optimized for small groups (up to 4 players) who play a few hours per day and want to avoid paying for 24/7 server hosting. The server runs with 1 vCPU and 8GB memory on AWS ECS Fargate.

## Prerequisites

- AWS CLI configured with appropriate permissions
- Node.js 18+ for Lambda development and admin panel
- Docker (for local testing, optional)

## Deployment

Detailed deployment instructions will be provided in the deployment documentation once the implementation is complete.

## Cost Estimates

- **Estimated monthly cost**: ~$18 for 4 hours/day usage
- **Free tier eligible**: Several AWS services used qualify for free tier benefits
- **Cost monitoring**: Built-in AWS Budgets alerts notify when spending exceeds thresholds

## Security

- Admin panel protected with password authentication and JWT tokens
- All secrets stored in AWS Secrets Manager
- HTTPS enforcement for all communications
- Least-privilege IAM roles for all AWS resources