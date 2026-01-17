# Product Overview

This project is an on-demand Satisfactory game server solution deployed on AWS infrastructure. It enables cost-effective hosting of a Satisfactory dedicated server that automatically scales down when not in use.

## Key Features

- **Auto-scaling**: Server automatically shuts down after 10 minutes of inactivity (no players connected)
- **Web-based management**: React admin panel for starting, stopping, and monitoring the server
- **Persistent storage**: Game saves are retained across server restarts using Amazon EFS
- **Cost optimization**: Designed to minimize AWS costs by only running when needed (estimated ~$18/month for 4 hours/day usage)
- **Security**: Password-protected admin panel with JWT authentication, secure secret management

## Target Usage

The solution is optimized for small groups who play a few hours per day and want to avoid paying for 24/7 server hosting. The server runs on AWS ECS Fargate with 1 vCPU and 8GB memory, supporting up to 4 players.
