#!/bin/bash

# Satisfactory On-Demand Server Environment Validation Script
# This script checks if your environment is ready for deployment

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[⚠]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

# Track validation results
VALIDATION_PASSED=true

# Function to validate a requirement
validate_requirement() {
    local name="$1"
    local command="$2"
    local expected="$3"
    local help="$4"
    
    print_status "Checking $name..."
    
    if eval "$command" &> /dev/null; then
        local result=$(eval "$command" 2>/dev/null || echo "")
        if [ -n "$expected" ]; then
            print_success "$name: $result"
        else
            print_success "$name: Available"
        fi
    else
        print_error "$name: Not found or not working"
        if [ -n "$help" ]; then
            echo "  Help: $help"
        fi
        VALIDATION_PASSED=false
    fi
}

# Function to check AWS permissions
check_aws_permissions() {
    print_status "Checking AWS permissions..."
    
    local required_permissions=(
        "cloudformation:CreateStack"
        "cloudformation:UpdateStack"
        "cloudformation:DeleteStack"
        "cloudformation:DescribeStacks"
        "ecs:CreateCluster"
        "ecs:CreateService"
        "lambda:CreateFunction"
        "apigateway:*"
        "        "ssm:GetParameter"
        "ssm:PutParameter""
        "dynamodb:CreateTable"
        "efs:CreateFileSystem"
        "s3:CreateBucket"
        "cloudfront:CreateDistribution"
        "iam:CreateRole"
        "iam:AttachRolePolicy"
    )
    
    # Test basic AWS access
    if aws sts get-caller-identity &> /dev/null; then
        local account_id=$(aws sts get-caller-identity --query 'Account' --output text)
        local user_arn=$(aws sts get-caller-identity --query 'Arn' --output text)
        print_success "AWS Access: Connected as $user_arn"
        print_success "AWS Account: $account_id"
    else
        print_error "AWS Access: Cannot connect to AWS"
        print_error "Run 'aws configure' to set up your credentials"
        VALIDATION_PASSED=false
        return
    fi
    
    # Test CloudFormation access (most critical)
    if aws cloudformation list-stacks --max-items 1 &> /dev/null; then
        print_success "CloudFormation: Access confirmed"
    else
        print_error "CloudFormation: No access - this is required for deployment"
        VALIDATION_PASSED=false
    fi
    
    # Test ECS access
    if aws ecs list-clusters --max-items 1 &> /dev/null; then
        print_success "ECS: Access confirmed"
    else
        print_warning "ECS: Limited access - may cause deployment issues"
    fi
    
    # Test Lambda access
    if aws lambda list-functions --max-items 1 &> /dev/null; then
        print_success "Lambda: Access confirmed"
    else
        print_warning "Lambda: Limited access - may cause deployment issues"
    fi
    
    # Test Parameter Store access
    if aws ssm get-parameters --names "/test" &> /dev/null 2>&1 || [[ $? -eq 1 ]]; then
        print_success "Parameter Store: Access confirmed"
    else
        print_warning "Secrets Manager: Limited access - may cause deployment issues"
    fi
}

# Function to check project structure
check_project_structure() {
    print_status "Checking project structure..."
    
    local required_files=(
        "cloudformation/main.yaml"
        "lambda/authorizer/package.json"
        "lambda/control/package.json"
        "lambda/monitor/package.json"
        "admin-panel/package.json"
        "scripts/post-deploy.sh"
    )
    
    for file in "${required_files[@]}"; do
        if [ -f "$file" ]; then
            print_success "Found: $file"
        else
            print_error "Missing: $file"
            VALIDATION_PASSED=false
        fi
    done
}

# Function to check Node.js dependencies
check_node_dependencies() {
    print_status "Checking Node.js project dependencies..."
    
    local node_projects=(
        "lambda/authorizer"
        "lambda/control"
        "lambda/monitor"
        "admin-panel"
    )
    
    for project in "${node_projects[@]}"; do
        if [ -d "$project" ]; then
            if [ -f "$project/package.json" ]; then
                print_success "$project: package.json found"
                
                # Check if node_modules exists
                if [ -d "$project/node_modules" ]; then
                    print_success "$project: Dependencies installed"
                else
                    print_warning "$project: Dependencies not installed (run 'npm install' in $project)"
                fi
            else
                print_error "$project: package.json missing"
                VALIDATION_PASSED=false
            fi
        else
            print_error "$project: Directory missing"
            VALIDATION_PASSED=false
        fi
    done
}

# Function to check system resources
check_system_resources() {
    print_status "Checking system resources..."
    
    # Check available disk space
    local available_space=$(df . | tail -1 | awk '{print $4}')
    local available_gb=$((available_space / 1024 / 1024))
    
    if [ "$available_gb" -gt 2 ]; then
        print_success "Disk Space: ${available_gb}GB available"
    else
        print_warning "Disk Space: Only ${available_gb}GB available (recommend 2GB+)"
    fi
    
    # Check memory (if available)
    if command -v free &> /dev/null; then
        local available_mem=$(free -m | awk 'NR==2{printf "%.1f", $7/1024}')
        print_success "Memory: ${available_mem}GB available"
    elif command -v vm_stat &> /dev/null; then
        # macOS
        print_success "Memory: Available (macOS detected)"
    fi
}

# Function to provide recommendations
provide_recommendations() {
    echo ""
    echo "=========================================="
    echo "         RECOMMENDATIONS"
    echo "=========================================="
    echo ""
    
    if [ "$VALIDATION_PASSED" = true ]; then
        print_success "Environment validation passed! You're ready to deploy."
        echo ""
        echo "Next steps:"
        echo "1. Run: ./deploy.sh --email your-email@example.com"
        echo "2. Wait for deployment to complete (10-15 minutes)"
        echo "3. Access your admin panel and start the server"
    else
        print_error "Environment validation failed. Please fix the issues above."
        echo ""
        echo "Common fixes:"
        echo ""
        echo "AWS CLI issues:"
        echo "  - Install: brew install awscli (macOS) or curl + install (Linux)"
        echo "  - Configure: aws configure"
        echo "  - Test: aws sts get-caller-identity"
        echo ""
        echo "Node.js issues:"
        echo "  - Install Node.js 24+: https://nodejs.org/"
        echo "  - Verify: node --version"
        echo ""
        echo "Permission issues:"
        echo "  - Ensure your AWS user has CloudFormation, ECS, Lambda permissions"
        echo "  - Consider using AWS PowerUser or Administrator policies for deployment"
        echo ""
        echo "Project structure issues:"
        echo "  - Ensure you're in the correct project directory"
        echo "  - Clone the repository if files are missing"
        echo ""
        echo "Dependencies:"
        echo "  - Run 'npm install' in each lambda/ subdirectory"
        echo "  - Run 'npm install' in admin-panel/"
    fi
    
    echo ""
    echo "Estimated deployment time: 10-15 minutes"
    echo "Estimated monthly cost: \$14-28 (depending on usage)"
    echo ""
}

# Main validation function
main() {
    echo "=========================================="
    echo "  Environment Validation"
    echo "=========================================="
    echo ""
    
    # Check basic tools
    validate_requirement "AWS CLI" "aws --version" "" "Install from https://aws.amazon.com/cli/"
    validate_requirement "Node.js" "node --version" "" "Install Node.js 24+ from https://nodejs.org/"
    validate_requirement "npm" "npm --version" "" "Comes with Node.js"
    validate_requirement "jq" "jq --version" "" "Install: brew install jq (macOS) or apt install jq (Linux)"
    validate_requirement "curl" "curl --version" "" "Usually pre-installed"
    
    echo ""
    
    # Check Node.js version specifically
    if command -v node &> /dev/null; then
        local node_version=$(node --version | cut -d'v' -f2)
        local node_major=$(echo $node_version | cut -d'.' -f1)
        if [ "$node_major" -ge 24 ]; then
            print_success "Node.js Version: $node_version (compatible)"
        else
            print_error "Node.js Version: $node_version (need 24+)"
            VALIDATION_PASSED=false
        fi
    fi
    
    echo ""
    
    # Check AWS configuration and permissions
    check_aws_permissions
    
    echo ""
    
    # Check project structure
    check_project_structure
    
    echo ""
    
    # Check Node.js dependencies
    check_node_dependencies
    
    echo ""
    
    # Check system resources
    check_system_resources
    
    # Provide recommendations
    provide_recommendations
    
    # Exit with appropriate code
    if [ "$VALIDATION_PASSED" = true ]; then
        exit 0
    else
        exit 1
    fi
}

# Run main function
main "$@"