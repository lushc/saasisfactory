#!/bin/bash

# Satisfactory On-Demand Server Deployment Script
# This script automates the complete deployment process documented in README.md

set -e  # Exit on any error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default configuration values
STACK_NAME="satisfactory-server"
SHUTDOWN_TIMEOUT_MINUTES=10
SERVER_MEMORY=8192
SERVER_CPU=1024
MONTHLY_BUDGET_THRESHOLD=20
BUDGET_ALERT_EMAIL=""

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

# Function to check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        print_error "AWS CLI is not installed. Please install AWS CLI v2."
        exit 1
    fi
    
    # Check AWS CLI version
    AWS_VERSION=$(aws --version 2>&1 | cut -d/ -f2 | cut -d' ' -f1)
    print_status "AWS CLI version: $AWS_VERSION"
    
    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        print_error "AWS credentials not configured. Please run 'aws configure'."
        exit 1
    fi
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install Node.js 24+."
        exit 1
    fi
    
    # Check Node.js version
    NODE_VERSION=$(node --version | cut -d'v' -f2)
    NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1)
    if [ "$NODE_MAJOR" -lt 24 ]; then
        print_error "Node.js version $NODE_VERSION is too old. Please install Node.js 24+."
        exit 1
    fi
    print_status "Node.js version: $NODE_VERSION"
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed."
        exit 1
    fi
    
    print_success "All prerequisites met!"
}

# Function to display usage
usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -e, --email EMAIL              Budget alert email address (required)"
    echo "  -s, --stack-name NAME          CloudFormation stack name (default: satisfactory-server)"
    echo "  -t, --timeout MINUTES         Shutdown timeout in minutes (default: 10)"
    echo "  -m, --memory MB                Server memory in MB (default: 8192)"
    echo "  -c, --cpu UNITS                Server CPU units (default: 1024)"
    echo "  -b, --budget AMOUNT            Monthly budget threshold in USD (default: 20)"
    echo "  -h, --help                     Show this help message"
    echo ""
    echo "Example:"
    echo "  $0 --email your-email@example.com --timeout 15 --memory 16384"
}

# Parse command line arguments
parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -e|--email)
                BUDGET_ALERT_EMAIL="$2"
                shift 2
                ;;
            -s|--stack-name)
                STACK_NAME="$2"
                shift 2
                ;;
            -t|--timeout)
                SHUTDOWN_TIMEOUT_MINUTES="$2"
                shift 2
                ;;
            -m|--memory)
                SERVER_MEMORY="$2"
                shift 2
                ;;
            -c|--cpu)
                SERVER_CPU="$2"
                shift 2
                ;;
            -b|--budget)
                MONTHLY_BUDGET_THRESHOLD="$2"
                shift 2
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
    
    # Validate required parameters
    if [ -z "$BUDGET_ALERT_EMAIL" ]; then
        print_error "Budget alert email is required. Use --email option."
        usage
        exit 1
    fi
    
    # Validate email format (basic check)
    if [[ ! "$BUDGET_ALERT_EMAIL" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]]; then
        print_error "Invalid email format: $BUDGET_ALERT_EMAIL"
        exit 1
    fi
}

# Function to install Lambda dependencies
install_lambda_dependencies() {
    print_status "Installing Lambda function dependencies..."
    
    local lambda_dirs=("lambda/authorizer" "lambda/control" "lambda/monitor")
    
    for dir in "${lambda_dirs[@]}"; do
        if [ -d "$dir" ]; then
            print_status "Installing dependencies for $dir..."
            (cd "$dir" && npm install)
        else
            print_error "Lambda directory not found: $dir"
            exit 1
        fi
    done
    
    print_success "Lambda dependencies installed!"
}

# Function to build Lambda functions
build_lambda_functions() {
    print_status "Building Lambda functions..."
    
    local lambda_dirs=("lambda/authorizer" "lambda/control" "lambda/monitor")
    
    for dir in "${lambda_dirs[@]}"; do
        print_status "Building $dir..."
        (cd "$dir" && npm run build)
    done
    
    print_success "Lambda functions built!"
}

# Function to install admin panel dependencies
install_admin_panel_dependencies() {
    print_status "Installing Admin Panel dependencies..."
    
    if [ -d "admin-panel" ]; then
        (cd admin-panel && npm install)
        print_success "Admin Panel dependencies installed!"
    else
        print_error "Admin Panel directory not found: admin-panel"
        exit 1
    fi
}

# Function to check if CloudFormation stack exists
stack_exists() {
    aws cloudformation describe-stacks --stack-name "$STACK_NAME" &> /dev/null
}

# Function to deploy CloudFormation stack
deploy_cloudformation_stack() {
    print_status "Deploying CloudFormation stack: $STACK_NAME"
    
    # Check if CloudFormation template exists
    if [ ! -f "cloudformation/main.yaml" ]; then
        print_error "CloudFormation template not found: cloudformation/main.yaml"
        exit 1
    fi
    
    # Prepare parameters
    local parameters=(
        "ParameterKey=ShutdownTimeoutMinutes,ParameterValue=$SHUTDOWN_TIMEOUT_MINUTES"
        "ParameterKey=ServerMemory,ParameterValue=$SERVER_MEMORY"
        "ParameterKey=ServerCPU,ParameterValue=$SERVER_CPU"
        "ParameterKey=BudgetAlertEmail,ParameterValue=$BUDGET_ALERT_EMAIL"
        "ParameterKey=MonthlyBudgetThreshold,ParameterValue=$MONTHLY_BUDGET_THRESHOLD"
    )
    
    # Join parameters with space
    local param_string=""
    for param in "${parameters[@]}"; do
        param_string="$param_string $param"
    done
    
    if stack_exists; then
        print_warning "Stack $STACK_NAME already exists. Updating..."
        aws cloudformation update-stack \
            --stack-name "$STACK_NAME" \
            --template-body file://cloudformation/main.yaml \
            --parameters $param_string \
            --capabilities CAPABILITY_IAM
        
        print_status "Waiting for stack update to complete..."
        aws cloudformation wait stack-update-complete --stack-name "$STACK_NAME"
    else
        print_status "Creating new stack..."
        aws cloudformation create-stack \
            --stack-name "$STACK_NAME" \
            --template-body file://cloudformation/main.yaml \
            --parameters $param_string \
            --capabilities CAPABILITY_IAM
        
        print_status "Waiting for stack creation to complete (this may take 10-15 minutes)..."
        aws cloudformation wait stack-create-complete --stack-name "$STACK_NAME"
    fi
    
    # Check stack status
    local stack_status=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --query 'Stacks[0].StackStatus' --output text)
    if [[ "$stack_status" == *"COMPLETE"* ]]; then
        print_success "CloudFormation stack deployed successfully!"
    else
        print_error "CloudFormation stack deployment failed with status: $stack_status"
        exit 1
    fi
}

# Function to run post-deployment configuration
run_post_deployment_config() {
    print_status "Running post-deployment configuration..."
    
    if [ -f "scripts/post-deploy.sh" ]; then
        chmod +x scripts/post-deploy.sh
        ./scripts/post-deploy.sh
        print_success "Post-deployment configuration completed!"
    else
        print_error "Post-deployment script not found: scripts/post-deploy.sh"
        exit 1
    fi
}

# Function to build and deploy admin panel
build_and_deploy_admin_panel() {
    print_status "Building and deploying Admin Panel..."
    
    # Build the admin panel
    print_status "Building Admin Panel..."
    (cd admin-panel && npm run build)
    
    # Get S3 bucket name from CloudFormation
    print_status "Getting S3 bucket name from CloudFormation..."
    local s3_bucket=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --query 'Stacks[0].Outputs[?OutputKey==`S3BucketName`].OutputValue' \
        --output text)
    
    if [ -z "$s3_bucket" ]; then
        print_error "Failed to get S3 bucket name from CloudFormation stack"
        exit 1
    fi
    
    print_status "Uploading Admin Panel to S3 bucket: $s3_bucket"
    aws s3 sync admin-panel/dist/ s3://$s3_bucket/
    
    print_success "Admin Panel deployed successfully!"
}

# Function to display deployment results
display_deployment_results() {
    print_success "Deployment completed successfully!"
    echo ""
    print_status "Getting deployment information..."
    
    # Get CloudFormation outputs
    local outputs=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --query 'Stacks[0].Outputs')
    
    # Extract specific outputs
    local admin_panel_url=$(echo "$outputs" | jq -r '.[] | select(.OutputKey=="AdminPanelUrl") | .OutputValue')
    local api_gateway_url=$(echo "$outputs" | jq -r '.[] | select(.OutputKey=="ApiGatewayUrl") | .OutputValue')
    local s3_bucket_name=$(echo "$outputs" | jq -r '.[] | select(.OutputKey=="S3BucketName") | .OutputValue')
    
    echo ""
    echo "=========================================="
    echo "         DEPLOYMENT SUMMARY"
    echo "=========================================="
    echo ""
    echo "Stack Name: $STACK_NAME"
    echo "Admin Panel URL: $admin_panel_url"
    echo "API Gateway URL: $api_gateway_url"
    echo "S3 Bucket: $s3_bucket_name"
    echo ""
    echo "Configuration:"
    echo "  - Shutdown Timeout: $SHUTDOWN_TIMEOUT_MINUTES minutes"
    echo "  - Server Memory: $SERVER_MEMORY MB"
    echo "  - Server CPU: $SERVER_CPU units"
    echo "  - Budget Threshold: \$$MONTHLY_BUDGET_THRESHOLD/month"
    echo "  - Alert Email: $BUDGET_ALERT_EMAIL"
    echo ""
    echo "Next Steps:"
    echo "1. Access the Admin Panel at: $admin_panel_url"
    echo "2. Login with the admin password (displayed by post-deploy script)"
    echo "3. Start the Satisfactory server using the 'Start Server' button"
    echo "4. Connect to the game using the public IP and port 7777"
    echo ""
    echo "Useful Commands:"
    echo "  - Check stack status: aws cloudformation describe-stacks --stack-name $STACK_NAME"
    echo "  - View Lambda logs: aws logs tail /aws/lambda/satisfactory-control --follow"
    echo "  - Get admin password: aws ssm get-parameter --name /satisfactory/admin-password --with-decryption --query 'Parameter.Value' --output text"
    echo ""
    print_success "Deployment completed! Your Satisfactory server is ready to use."
}

# Function to handle cleanup on error
cleanup_on_error() {
    print_error "Deployment failed. Check the error messages above."
    echo ""
    echo "Troubleshooting tips:"
    echo "1. Check AWS CLI configuration: aws sts get-caller-identity"
    echo "2. Verify IAM permissions for CloudFormation, ECS, Lambda, etc."
    echo "3. Check CloudFormation events: aws cloudformation describe-stack-events --stack-name $STACK_NAME"
    echo "4. Review Lambda function logs in CloudWatch"
    echo ""
    echo "To clean up partial deployment:"
    echo "  aws cloudformation delete-stack --stack-name $STACK_NAME"
}

# Function to run tests (optional)
run_tests() {
    print_status "Running tests (optional)..."
    
    # Test Lambda functions
    local lambda_dirs=("lambda/authorizer" "lambda/control" "lambda/monitor")
    
    for dir in "${lambda_dirs[@]}"; do
        if [ -d "$dir" ]; then
            print_status "Testing $dir..."
            (cd "$dir" && npm test) || print_warning "Tests failed for $dir (continuing...)"
        fi
    done
    
    # Test admin panel
    if [ -d "admin-panel" ]; then
        print_status "Testing Admin Panel..."
        (cd admin-panel && npm test -- --run) || print_warning "Admin Panel tests failed (continuing...)"
    fi
}

# Main deployment function
main() {
    echo "=========================================="
    echo "  Satisfactory On-Demand Server Deploy"
    echo "=========================================="
    echo ""
    
    # Set up error handling
    trap cleanup_on_error ERR
    
    # Parse command line arguments
    parse_arguments "$@"
    
    # Check prerequisites
    check_prerequisites
    
    # Display configuration
    echo "Deployment Configuration:"
    echo "  Stack Name: $STACK_NAME"
    echo "  Email: $BUDGET_ALERT_EMAIL"
    echo "  Timeout: $SHUTDOWN_TIMEOUT_MINUTES minutes"
    echo "  Memory: $SERVER_MEMORY MB"
    echo "  CPU: $SERVER_CPU units"
    echo "  Budget: \$$MONTHLY_BUDGET_THRESHOLD/month"
    echo ""
    
    # Confirm deployment
    read -p "Continue with deployment? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_status "Deployment cancelled."
        exit 0
    fi
    
    # Step 1: Install Lambda dependencies
    install_lambda_dependencies
    
    # Step 2: Build Lambda functions
    build_lambda_functions
    
    # Step 3: Install Admin Panel dependencies
    install_admin_panel_dependencies
    
    # Step 4: Deploy CloudFormation stack
    deploy_cloudformation_stack
    
    # Step 5: Run post-deployment configuration
    run_post_deployment_config
    
    # Step 6: Build and deploy Admin Panel
    build_and_deploy_admin_panel
    
    # Step 7: Display results
    display_deployment_results
    
    # Optional: Run tests
    read -p "Run tests? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        run_tests
    fi
    
    print_success "All done! 🎉"
}

# Run main function with all arguments
main "$@"