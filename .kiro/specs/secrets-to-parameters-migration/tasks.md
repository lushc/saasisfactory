# Implementation Plan: Secrets to Parameters Migration

## Overview

This implementation plan refactors the satisfactory-on-demand-server solution from AWS Secrets Manager to AWS Systems Manager Parameter Store to achieve cost savings. The refactor involves updating three Lambda functions, the CloudFormation template, post-deployment script, and shared utilities to use Parameter Store APIs instead of Secrets Manager APIs.

## Tasks

- [ ] 1. Update shared utilities for Parameter Store
  - [ ] 1.1 Create new Parameter Store client utility
    - Create `lambda/shared/parameter-store.ts` with Parameter Store client configuration
    - Implement getParameter, putParameter, and deleteParameter methods
    - Add proper error handling for Parameter Store specific errors
    - _Requirements: 7.1, 7.2, 7.3, 7.4_
  
  - [ ] 1.2 Write property test for Parameter Store client
    - **Property 2: Code Migration Completeness**
    - **Validates: Requirements 7.1, 9.1**
  
  - [ ] 1.3 Refactor parameter cache utility
    - Rename `lambda/shared/secret-cache.ts` to `parameter-cache.ts`
    - Update cache implementation to work with Parameter Store responses
    - Update cache keys to use parameter names instead of secret names
    - _Requirements: 7.5_
  
  - [ ] 1.4 Write property test for parameter cache
    - **Property 6: Shared Utility Consistency**
    - **Validates: Requirements 7.5**

- [ ] 2. Update Lambda function implementations
  - [ ] 2.1 Update authorizer Lambda function
    - Replace Secrets Manager SDK import with SSM SDK import
    - Update JWT secret retrieval to use Parameter Store
    - Update parameter name to `/satisfactory/jwt-secret`
    - _Requirements: 7.1, 7.2, 6.1_
  
  - [ ] 2.2 Update control Lambda function
    - Replace Secrets Manager SDK imports with SSM SDK imports
    - Update all secret retrievals to use Parameter Store (admin password, server admin password, API token, client password)
    - Update parameter names to use `/satisfactory/` prefix
    - Update API token storage to use PutParameter operations
    - _Requirements: 7.1, 7.2, 7.3, 3.4, 3.5_
  
  - [ ] 2.3 Update monitor Lambda function
    - Replace Secrets Manager SDK imports with SSM SDK imports
    - Update server admin password and API token retrieval to use Parameter Store
    - Update parameter names to use `/satisfactory/` prefix
    - _Requirements: 7.1, 7.2, 6.1_
  
  - [ ] 2.4 Write property test for parameter naming consistency
    - **Property 4: Parameter Naming Consistency**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.5**
  
  - [ ] 2.5 Write property test for API handling
    - **Property 3: Parameter Store API Handling**
    - **Validates: Requirements 3.1, 7.2, 7.3, 7.4**

- [ ] 3. Update CloudFormation template
  - [ ] 3.1 Remove Secrets Manager resources
    - Delete all AWS::SecretsManager::Secret resources from CloudFormation template
    - Remove Secrets Manager IAM permissions from Lambda execution roles
    - _Requirements: 5.1, 9.2, 9.3, 9.4_
  
  - [ ] 3.2 Add Parameter Store resources
    - Add AWS::SSM::Parameter resources for all 5 parameters
    - Configure parameters as SecureString type with Standard tier
    - Use descriptive names with `/satisfactory/` prefix
    - Set placeholder values that will be updated by post-deploy script
    - _Requirements: 5.1, 5.4, 6.1, 6.2_
  
  - [ ] 3.3 Update IAM policies for Parameter Store access
    - Add SSM parameter permissions (GetParameter, PutParameter, DeleteParameter)
    - Add KMS decrypt/encrypt permissions for default aws/ssm key
    - Ensure permissions are scoped to `/satisfactory/*` parameters
    - _Requirements: 5.2_

- [ ] 4. Update post-deployment script
  - [ ] 4.1 Replace Secrets Manager commands with Parameter Store commands
    - Replace `aws secretsmanager put-secret-value` with `aws ssm put-parameter`
    - Update parameter names to use `/satisfactory/` prefix
    - Add `--type SecureString` and `--overwrite` flags
    - _Requirements: 5.3, 6.1_
  
  - [ ] 4.2 Update parameter generation and validation
    - Ensure script generates secure values for all parameters
    - Add validation to check parameter creation success
    - Update script comments and documentation
    - _Requirements: 5.3_

- [ ] 5. Update package dependencies
  - [ ] 5.1 Update Lambda function package.json files
    - Remove `@aws-sdk/client-secrets-manager` dependency from all Lambda functions
    - Add `@aws-sdk/client-ssm` dependency to all Lambda functions
    - Update package-lock.json files
    - _Requirements: 7.1_

- [ ] 6. Checkpoint - Validate refactor completeness
  - [ ] 6.1 Run all tests to ensure functionality
    - Execute unit tests for all Lambda functions
    - Execute property tests for Parameter Store operations
    - Verify CloudFormation template validation passes
    - _Requirements: 4.2_

- [ ] 7. Final validation and cleanup
  - [ ] 7.1 Validate no Secrets Manager references remain
    - Search codebase for any remaining Secrets Manager imports or API calls
    - Ensure all configuration uses Parameter Store
    - _Requirements: 9.1_
  
  - [ ] 7.2 Update documentation and comments
    - Update code comments to reference Parameter Store instead of Secrets Manager
    - Update any inline documentation about configuration storage
    - _Requirements: 6.4_
  
  - [ ] 7.3 Final checkpoint - Ensure all tests pass
    - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster implementation
- Each task references specific requirements for traceability
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- The refactor maintains all existing functionality while reducing costs