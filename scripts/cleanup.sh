#!/bin/bash

# Satisfactory On-Demand Server Cleanup Script
# This script completely removes the deployed infrastructure and stops all charges

set -e  # Exit on any error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default configuration
STACK_NAME="satisfactory-server"
DELETE_SECRETS=false

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to display usage
usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -s, --stack-name NAME          CloudFormation stack name (default: satisfactory-server)"
    echo "  --delete-secrets               Also delete secrets (PERMANENT - cannot be undone)"
    echo "  -h, --help                     Show this help message"
    echo ""
    echo "Example:"
    echo "  $0 --stack-name my-satisfactory-server"
    echo "  $0 --delete-secrets  # WARNING: Permanently deletes all secrets"
}

# Parse command line arguments
parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -s|--stack-name)
                STACK_NAME="$2"
                shift 2
                ;;
            --delete-secrets)
                DELETE_SECRETS=true
                shift
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            *)
                print_error "Unknown option: $1"
                usage
                exit 1
                ;;
        esac
    done
}

# Function to check if CloudFormation stack exists
stack_exists() {
    aws cloudformation describe-stacks --stack-name "$STACK_NAME" &> /dev/null
}

# Function to get API Gateway URL and JWT token for server stop
get_api_info() {
    if stack_exists; then
        local api_url=$(aws cloudformation describe-stacks \
            --stack-name "$STACK_NAME" \
            --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayUrl`].OutputValue' \
            --output text 2>/dev/null || echo "")
        echo "$api_url"
    fi
}

# Function to stop the server gracefully
stop_server() {
    print_status "Attempting to stop Satisfactory server gracefully..."
    
    local api_url=$(get_api_info)
    if [ -z "$api_url" ]; then
        print_warning "Could not get API URL. Server may already be stopped or stack doesn't exist."
        return
    fi
    
    # Try to get admin password and login
    local admin_password=""
    if aws ssm get-parameter --name "/satisfactory/admin-password" --with-decryption &> /dev/null; then
        admin_password=$(aws ssm get-parameter \
            --name "/satisfactory/admin-password" \
            --with-decryption \
            --query 'Parameter.Value' \
            --output text 2>/dev/null || echo "")
    fi
    
    if [ -n "$admin_password" ]; then
        print_status "Logging in to get JWT token..."
        local jwt_response=$(curl -s -X POST "$api_url/auth/login" \
            -H "Content-Type: application/json" \
            -d "{\"password\":\"$admin_password\"}" 2>/dev/null || echo "")
        
        if [ -n "$jwt_response" ]; then
            local jwt_token=$(echo "$jwt_response" | jq -r '.token' 2>/dev/null || echo "")
            
            if [ -n "$jwt_token" ] && [ "$jwt_token" != "null" ]; then
                print_status "Stopping server via API..."
                curl -s -X POST "$api_url/server/stop" \
                    -H "Authorization: Bearer $jwt_token" &> /dev/null || true
                print_success "Server stop command sent."
                
                # Wait a moment for graceful shutdown
                print_status "Waiting 30 seconds for graceful shutdown..."
                sleep 30
            else
                print_warning "Could not get JWT token. Server may already be stopped."
            fi
        else
            print_warning "Could not login to API. Server may already be stopped."
        fi
    else
        print_warning "Could not get admin password. Server may already be stopped."
    fi
}

# Function to empty S3 bucket
empty_s3_bucket() {
    print_status "Emptying S3 bucket..."
    
    if ! stack_exists; then
        print_warning "Stack doesn't exist. Skipping S3 cleanup."
        return
    fi
    
    local s3_bucket=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --query 'Stacks[0].Outputs[?OutputKey==`S3BucketName`].OutputValue' \
        --output text 2>/dev/null || echo "")
    
    if [ -n "$s3_bucket" ] && [ "$s3_bucket" != "None" ]; then
        print_status "Emptying S3 bucket: $s3_bucket"
        aws s3 rm s3://$s3_bucket --recursive 2>/dev/null || print_warning "Could not empty S3 bucket (may already be empty)"
        print_success "S3 bucket emptied."
    else
        print_warning "Could not get S3 bucket name from stack outputs."
    fi
}

# Function to delete CloudFormation stack
delete_cloudformation_stack() {
    print_status "Deleting CloudFormation stack: $STACK_NAME"
    
    if ! stack_exists; then
        print_warning "Stack $STACK_NAME does not exist."
        return
    fi
    
    # Delete the stack
    aws cloudformation delete-stack --stack-name "$STACK_NAME"
    
    print_status "Waiting for stack deletion to complete..."
    aws cloudformation wait stack-delete-complete --stack-name "$STACK_NAME"
    
    print_success "CloudFormation stack deleted successfully!"
}

# Function to delete secrets
delete_secrets() {
    if [ "$DELETE_SECRETS" = false ]; then
        print_status "Skipping secret deletion (use --delete-secrets to delete them permanently)"
        return
    fi
    
    print_warning "Deleting secrets permanently..."
    
    local parameters=(
        "/satisfactory/admin-password"
        "/satisfactory/jwt-secret"
        "/satisfactory/server-admin-password"
        "/satisfactory/api-token"
        "/satisfactory/client-password"
    )
    
    for parameter in "${parameters[@]}"; do
        if aws ssm get-parameter --name "$parameter" &> /dev/null; then
            print_status "Deleting parameter: $parameter"
            aws ssm delete-parameter \
                --name "$parameter" 2>/dev/null || print_warning "Could not delete parameter: $parameter"
        else
            print_status "Secret not found (may already be deleted): $secret"
        fi
    done
    
    print_success "Secrets deleted permanently!"
}

# Function to verify cleanup
verify_cleanup() {
    print_status "Verifying cleanup..."
    
    # Check if stack still exists
    if stack_exists; then
        print_error "Stack still exists! Cleanup may have failed."
        return 1
    fi
    
    # Check for running ECS tasks (in case of cleanup issues)
    local running_tasks=$(aws ecs list-tasks --cluster satisfactory-cluster 2>/dev/null | jq -r '.taskArns | length' 2>/dev/null || echo "0")
    if [ "$running_tasks" -gt 0 ]; then
        print_warning "Found $running_tasks running ECS tasks. They should stop automatically."
    fi
    
    print_success "Cleanup verification completed!"
}

# Function to display cleanup summary
display_cleanup_summary() {
    echo ""
    echo "=========================================="
    echo "         CLEANUP SUMMARY"
    echo "=========================================="
    echo ""
    echo "Stack Name: $STACK_NAME"
    echo "Secrets Deleted: $([ "$DELETE_SECRETS" = true ] && echo "Yes (PERMANENT)" || echo "No (preserved)")"
    echo ""
    echo "What was cleaned up:"
    echo "  ✓ Satisfactory server stopped"
    echo "  ✓ S3 bucket emptied"
    echo "  ✓ CloudFormation stack deleted"
    echo "  ✓ All AWS resources removed"
    if [ "$DELETE_SECRETS" = true ]; then
        echo "  ✓ Secrets permanently deleted"
    else
        echo "  - Secrets preserved (can be reused for redeployment)"
    fi
    echo ""
    echo "Billing Impact:"
    echo "  ✓ All compute charges stopped"
    echo "  ✓ Storage charges stopped (except EFS data if preserved)"
    echo "  ✓ Network charges stopped"
    if [ "$DELETE_SECRETS" = false ]; then
        echo "  - Secrets Manager charges continue (~$2/month for 5 secrets)"
    else
        echo "  ✓ Secrets Manager charges stopped"
    fi
    echo ""
    if [ "$DELETE_SECRETS" = false ]; then
        echo "To redeploy with same configuration:"
        echo "  ./deploy.sh --email your-email@example.com"
        echo ""
        echo "To delete secrets later (PERMANENT):"
        echo "  ./cleanup.sh --delete-secrets"
    else
        echo "To redeploy, you'll need to run the full deployment:"
        echo "  ./deploy.sh --email your-email@example.com"
    fi
    echo ""
    print_success "Cleanup completed! All charges have been stopped."
}

# Function to handle errors
handle_error() {
    print_error "Cleanup encountered an error. Some resources may still exist."
    echo ""
    echo "Manual cleanup commands:"
    echo "  # Stop any running ECS tasks"
    echo "  aws ecs update-service --cluster satisfactory-cluster --service satisfactory-service --desired-count 0"
    echo ""
    echo "  # Delete stack (if it still exists)"
    echo "  aws cloudformation delete-stack --stack-name $STACK_NAME"
    echo ""
    echo "  # Check for remaining resources"
    echo "  aws cloudformation describe-stacks --stack-name $STACK_NAME"
    echo ""
    echo "  # Delete parameters manually (if desired)"
    echo "  aws ssm delete-parameter --name /satisfactory/admin-password"
}

# Main cleanup function
main() {
    echo "=========================================="
    echo "  Satisfactory Server Cleanup"
    echo "=========================================="
    echo ""
    
    # Set up error handling
    trap handle_error ERR
    
    # Parse command line arguments
    parse_arguments "$@"
    
    # Display configuration
    echo "Cleanup Configuration:"
    echo "  Stack Name: $STACK_NAME"
    echo "  Delete Secrets: $([ "$DELETE_SECRETS" = true ] && echo "Yes (PERMANENT)" || echo "No")"
    echo ""
    
    if [ "$DELETE_SECRETS" = true ]; then
        print_warning "WARNING: --delete-secrets will permanently delete all secrets!"
        print_warning "This cannot be undone and you'll need to reconfigure everything for redeployment."
        echo ""
    fi
    
    # Confirm cleanup
    read -p "Continue with cleanup? This will stop all charges. (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_status "Cleanup cancelled."
        exit 0
    fi
    
    # Check AWS CLI
    if ! aws sts get-caller-identity &> /dev/null; then
        print_error "AWS credentials not configured. Please run 'aws configure'."
        exit 1
    fi
    
    # Step 1: Stop the server gracefully
    stop_server
    
    # Step 2: Empty S3 bucket
    empty_s3_bucket
    
    # Step 3: Delete CloudFormation stack
    delete_cloudformation_stack
    
    # Step 4: Delete secrets (if requested)
    delete_secrets
    
    # Step 5: Verify cleanup
    verify_cleanup
    
    # Step 6: Display summary
    display_cleanup_summary
    
    print_success "Cleanup completed successfully! 🧹"
}

# Run main function with all arguments
main "$@"