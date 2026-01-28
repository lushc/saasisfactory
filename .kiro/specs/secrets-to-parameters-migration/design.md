# Design Document: Secrets to Parameters Migration

## Overview

This design outlines the refactoring of the satisfactory-on-demand-server solution from AWS Secrets Manager to AWS Systems Manager Parameter Store to achieve cost savings while maintaining security and functionality. The refactor will eliminate $2.00/month in Secrets Manager costs by replacing 5 secrets with standard SecureString parameters that fall within Parameter Store's free tier.

The refactor involves updating three Lambda functions (authorizer, control, monitor), the CloudFormation template, post-deployment script, and shared utilities to use Parameter Store APIs instead of Secrets Manager APIs. All sensitive data will be stored as SecureString parameters encrypted with the default AWS managed KMS key (alias/aws/ssm) to avoid additional costs.

## Architecture

### Current Architecture (Secrets Manager)
```
Lambda Functions → AWS SDK SecretsManager Client → Secrets Manager → KMS Encryption
                                                  ↓
                                            5 Secrets @ $0.40/month each = $2.00/month
```

### Target Architecture (Parameter Store)
```
Lambda Functions → AWS SDK SSM Client → Parameter Store → KMS Encryption (aws/ssm)
                                       ↓
                                 5 SecureString Parameters @ $0.00/month = Free Tier
```

### Key Architectural Changes

1. **SDK Migration**: Replace `@aws-sdk/client-secrets-manager` with `@aws-sdk/client-ssm`
2. **API Operations**: Replace `GetSecretValue`/`PutSecretValue` with `GetParameter`/`PutParameter`
3. **Parameter Naming**: Use hierarchical naming with `/satisfactory/` prefix
4. **Encryption**: Use default AWS managed KMS key (alias/aws/ssm) for SecureString parameters
5. **IAM Permissions**: Update policies to grant SSM parameter access instead of Secrets Manager

## Components and Interfaces

### Parameter Store Configuration

**Parameter Naming Convention:**
- `/satisfactory/admin-password` (replaces `satisfactory-admin-password`)
- `/satisfactory/jwt-secret` (replaces `satisfactory-jwt-secret`)
- `/satisfactory/server-admin-password` (replaces `satisfactory-server-admin-password`)
- `/satisfactory/api-token` (replaces `satisfactory-api-token`)
- `/satisfactory/client-password` (replaces `satisfactory-client-password`)

**Parameter Configuration:**
- **Type**: SecureString
- **Tier**: Standard (stays within free tier, 4KB limit sufficient)
- **KMS Key**: Default AWS managed key (alias/aws/ssm)
- **Description**: Descriptive text for each parameter's purpose

### Lambda Function Updates

#### Shared Utilities (`lambda/shared/`)

**New Parameter Store Client (`parameter-store.ts`):**
```typescript
interface ParameterStoreClient {
  getParameter(name: string): Promise<string>;
  putParameter(name: string, value: string): Promise<void>;
  deleteParameter(name: string): Promise<void>;
}
```

**Updated Secret Cache (`secret-cache.ts`):**
- Rename to `parameter-cache.ts`
- Cache Parameter Store values instead of secrets
- Use same TTL and invalidation logic
- Update cache keys to use parameter names

#### API Changes

**Current Secrets Manager API:**
```typescript
// Get secret
const result = await secretsManager.getSecretValue({ SecretId: 'secret-name' });
const value = result.SecretString;

// Put secret
await secretsManager.putSecretValue({ 
  SecretId: 'secret-name', 
  SecretString: 'value' 
});
```

**New Parameter Store API:**
```typescript
// Get parameter
const result = await ssm.getParameter({ 
  Name: '/satisfactory/parameter-name',
  WithDecryption: true 
});
const value = result.Parameter.Value;

// Put parameter
await ssm.putParameter({
  Name: '/satisfactory/parameter-name',
  Value: 'value',
  Type: 'SecureString',
  Overwrite: true
});
```

### CloudFormation Template Updates

**Remove Secrets Manager Resources:**
```yaml
# DELETE these resources
SatisfactoryAdminPassword:
  Type: AWS::SecretsManager::Secret
SatisfactoryJWTSecret:
  Type: AWS::SecretsManager::Secret
# ... other secrets
```

**Add Parameter Store Resources:**
```yaml
SatisfactoryAdminPassword:
  Type: AWS::SSM::Parameter
  Properties:
    Name: /satisfactory/admin-password
    Type: SecureString
    Value: placeholder-will-be-updated-by-script
    Description: Admin panel authentication password

SatisfactoryJWTSecret:
  Type: AWS::SSM::Parameter
  Properties:
    Name: /satisfactory/jwt-secret
    Type: SecureString
    Value: placeholder-will-be-updated-by-script
    Description: JWT signing secret for admin panel authentication
```

**Update IAM Policies:**
```yaml
# Remove Secrets Manager permissions
- secretsmanager:GetSecretValue
- secretsmanager:PutSecretValue
- secretsmanager:UpdateSecret

# Add Parameter Store permissions
- ssm:GetParameter
- ssm:GetParameters
- ssm:PutParameter
- ssm:DeleteParameter
- kms:Decrypt
- kms:Encrypt
```

### Post-Deploy Script Updates

**Current Script Logic:**
```bash
# Generate and store in Secrets Manager
aws secretsmanager put-secret-value \
  --secret-id satisfactory-admin-password \
  --secret-string "$ADMIN_PASSWORD"
```

**New Script Logic:**
```bash
# Generate and store in Parameter Store
aws ssm put-parameter \
  --name "/satisfactory/admin-password" \
  --value "$ADMIN_PASSWORD" \
  --type "SecureString" \
  --overwrite
```

## Data Models

### Parameter Store Data Structure

**Parameter Metadata:**
```typescript
interface ParameterMetadata {
  name: string;           // e.g., "/satisfactory/admin-password"
  type: 'SecureString';   // Always SecureString for sensitive data
  tier: 'Standard';       // Standard tier for free usage
  keyId?: string;         // Optional, defaults to alias/aws/ssm
  description: string;    // Human-readable description
}
```

**Parameter Value Response:**
```typescript
interface ParameterValue {
  name: string;
  value: string;          // Decrypted value when WithDecryption=true
  type: 'SecureString';
  version: number;
  lastModifiedDate: Date;
  arn: string;
}
```

### Migration Mapping

| Current Secret Name | New Parameter Name | Description |
|---|---|---|
| `satisfactory-admin-password` | `/satisfactory/admin-password` | Admin panel authentication password |
| `satisfactory-jwt-secret` | `/satisfactory/jwt-secret` | JWT signing secret for admin panel |
| `satisfactory-server-admin-password` | `/satisfactory/server-admin-password` | Satisfactory server admin password |
| `satisfactory-api-token` | `/satisfactory/api-token` | Satisfactory server API authentication token |
| `satisfactory-client-password` | `/satisfactory/client-password` | Client protection password for server |

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Now I need to analyze the acceptance criteria to create correctness properties. Let me use the prework tool:

### Property 1: Parameter Configuration Compliance
*For any* sensitive parameter created by the system, it should be configured as a SecureString with Standard tier and use the default AWS managed KMS key (alias/aws/ssm)
**Validates: Requirements 1.4, 2.1, 2.4, 5.4**

### Property 2: Code Migration Completeness
*For any* Lambda function in the system, it should import and use only Parameter Store SDK clients and contain no Secrets Manager SDK references
**Validates: Requirements 7.1, 9.1**

### Property 3: Parameter Store API Handling
*For any* Parameter Store API operation (get, put, delete), the system should handle the Parameter Store response format correctly and implement proper error handling
**Validates: Requirements 3.1, 7.2, 7.3, 7.4**

### Property 4: Parameter Naming Consistency
*For any* parameter created by the system, it should use hierarchical naming with the `/satisfactory/` prefix and follow consistent naming patterns across all functions
**Validates: Requirements 6.1, 6.2, 6.3, 6.5**

### Property 5: CRUD Operations Consistency
*For any* configuration value that needs to be updated (API tokens, client passwords), the system should use Parameter Store PutParameter operations consistently
**Validates: Requirements 3.4, 3.5**

### Property 6: Shared Utility Consistency
*For any* Lambda function accessing parameters, it should use the same shared utility functions to ensure consistent Parameter Store access patterns
**Validates: Requirements 7.5**

## Error Handling

### Parameter Store Specific Error Handling

**Parameter Not Found (ParameterNotFound):**
- Occurs when requesting a parameter that doesn't exist
- Should be handled gracefully with appropriate fallback or initialization logic
- Critical for first-time deployments where parameters may not exist yet

**Access Denied (AccessDeniedException):**
- Occurs when IAM permissions are insufficient
- Should provide clear error messages for debugging
- More likely during development/testing phases

**Throttling (ThrottlingException):**
- Parameter Store has rate limits (40 TPS for standard throughput)
- Implement exponential backoff retry logic
- Consider caching frequently accessed parameters

**KMS Key Access Issues:**
- Can occur if default aws/ssm key permissions are modified
- Should provide clear error messages about encryption key access
- Less likely with default managed key

### Error Handling Patterns

```typescript
async function getParameter(name: string): Promise<string> {
  try {
    const result = await ssm.getParameter({
      Name: name,
      WithDecryption: true
    });
    return result.Parameter?.Value || '';
  } catch (error) {
    if (error.name === 'ParameterNotFound') {
      throw new ParameterNotFoundError(`Parameter ${name} not found`);
    }
    if (error.name === 'AccessDeniedException') {
      throw new AccessDeniedError(`Access denied for parameter ${name}`);
    }
    throw error;
  }
}
```

### Backward Compatibility During Transition

Since this is a refactor rather than a migration of deployed systems, backward compatibility is not required. However, the design should ensure:

1. **Clear Error Messages**: When parameters are missing, provide clear indication of what needs to be configured
2. **Initialization Support**: Post-deploy script should handle parameter creation robustly
3. **Validation**: Provide mechanisms to validate that all required parameters exist and are accessible

## Testing Strategy

### Dual Testing Approach

The testing strategy combines unit tests for specific scenarios and property-based tests for universal correctness properties:

**Unit Tests:**
- Test specific parameter configurations (SecureString, Standard tier)
- Test error handling for specific AWS API errors (ParameterNotFound, AccessDenied)
- Test CloudFormation template structure and resource definitions
- Test post-deploy script command generation
- Test IAM policy structure and permissions

**Property-Based Tests:**
- Test parameter naming consistency across all functions and configurations
- Test API response handling across different parameter values and error conditions
- Test that all sensitive data uses proper encryption configuration
- Test that code contains no Secrets Manager references across all files
- Test that shared utilities provide consistent access patterns

**Property Test Configuration:**
- Use fast-check library for TypeScript/Node.js property-based testing
- Configure minimum 100 iterations per property test
- Each property test references its corresponding design document property
- Tag format: **Feature: secrets-to-parameters-migration, Property {number}: {property_text}**

**Integration Testing:**
- Test end-to-end admin panel authentication using Parameter Store
- Test server start/stop operations with Parameter Store configuration
- Test API token refresh and storage in Parameter Store
- Test client password management through Parameter Store

### Test Coverage Requirements

- **Unit Test Coverage**: Focus on error conditions, edge cases, and specific configurations
- **Property Test Coverage**: Verify universal properties hold across all inputs and configurations
- **Integration Test Coverage**: Validate end-to-end workflows function correctly
- **Infrastructure Test Coverage**: Validate CloudFormation templates and IAM policies are correct

The combination of unit and property tests ensures both specific correctness (unit tests) and general correctness across all possible inputs (property tests), providing comprehensive validation of the refactored system.