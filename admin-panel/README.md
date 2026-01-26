# Satisfactory Server Admin Panel

A React-based web interface for managing your on-demand Satisfactory game server. This admin panel provides real-time server monitoring, start/stop controls, and client password management with a mobile-responsive design.

## Features

- **Server Management**: Start, stop, and monitor your Satisfactory server
- **Real-time Status**: Live server state updates with player count tracking
- **Client Password Management**: Set, update, and remove server passwords
- **Mobile Responsive**: Works seamlessly on desktop and mobile devices
- **Secure Authentication**: JWT-based login with automatic token management
- **Auto-refresh**: Real-time updates every 10 seconds when server is running
- **Error Handling**: Graceful error boundaries and user-friendly error messages

## Technology Stack

- **React 19** with TypeScript for type safety
- **Vite 7** for fast development and optimized builds
- **Tailwind CSS 4** for responsive styling with PostCSS integration
- **Axios** for HTTP client with authentication interceptors
- **Vitest** + Testing Library for unit and integration testing
- **fast-check** for property-based testing

## Local Development

### Prerequisites

- **Node.js 24+** and npm
- **Deployed backend infrastructure** (API Gateway URL required)

### Setup

1. **Install dependencies:**
   ```bash
   cd admin-panel
   npm install
   ```

2. **Configure environment:**
   
   Create a `.env.local` file with your API Gateway URL:
   ```bash
   # Get API URL from your deployed CloudFormation stack
   VITE_API_URL=$(aws cloudformation describe-stacks \
     --stack-name satisfactory-server \
     --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayUrl`].OutputValue' \
     --output text)
   
   # Create .env.local file
   echo "VITE_API_URL=$VITE_API_URL" > .env.local
   ```

   Or manually create `.env.local`:
   ```env
   VITE_API_URL=https://your-api-gateway-url.execute-api.region.amazonaws.com
   ```

3. **Get admin password:**
   ```bash
   # Retrieve the admin password from AWS Secrets Manager
   aws secretsmanager get-secret-value \
     --secret-id satisfactory-admin-password \
     --query 'SecretString' \
     --output text
   ```

### Development Commands

```bash
# Start development server with hot reload
npm run dev

# Build for production
npm run build

# Preview production build locally
npm run preview

# Run unit tests
npm test

# Run tests in watch mode (for development)
npm run test:watch

# Run property-based tests
npm run test:properties

# Run ESLint
npm run lint

# Type checking
npm run type-check
```

### Development Server

The development server runs on `http://localhost:5173` with:

- **Hot Module Replacement (HMR)** for instant updates
- **TypeScript compilation** with error reporting
- **Tailwind CSS** with JIT compilation
- **Proxy configuration** for API calls (if needed)

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `VITE_API_URL` | Backend API Gateway URL | Yes | - |

**Note**: All environment variables must be prefixed with `VITE_` to be accessible in the browser.

### API Integration

The admin panel communicates with the backend Lambda functions through API Gateway:

- **Authentication**: JWT tokens with 1-hour expiration
- **Auto-retry**: Automatic token refresh on 401 responses
- **Error Handling**: Structured error responses with user-friendly messages
- **Request Interceptors**: Automatic token attachment to authenticated requests

### Component Architecture

```
src/
├── components/           # React components
│   ├── LoginForm.tsx           # Password authentication
│   ├── Dashboard.tsx           # Main container with routing
│   ├── ServerStatus.tsx        # Real-time server state display
│   ├── ServerControls.tsx      # Start/stop buttons
│   ├── ClientPasswordManager.tsx # Password management
│   ├── LoadingSpinner.tsx      # Reusable loading indicator
│   └── ErrorBoundary.tsx       # Error boundary wrapper
├── services/            # API service layer
│   └── api.ts                  # Centralized HTTP client
├── hooks/               # Custom React hooks
│   ├── useServerStatus.ts      # Server status management
│   ├── useServerControls.ts    # Server control operations
│   └── useClientPassword.ts    # Password management
├── types/               # TypeScript definitions
│   └── server.ts               # API response interfaces
└── test/                # Test configuration
    └── setup.ts                # Vitest + Testing Library setup
```

### Testing

The project includes comprehensive testing with:

- **Unit Tests**: Component behavior and API integration
- **Property-based Tests**: Using fast-check for edge case validation
- **Integration Tests**: Full user workflows
- **Error Boundary Tests**: Error handling validation

```bash
# Run all tests
npm test

# Run specific test file
npm test -- ServerStatus

# Run tests with coverage
npm test -- --coverage

# Run property-based tests only
npm run test:properties
```

### Building for Production

```bash
# Build optimized production bundle
npm run build

# The build output will be in the dist/ directory
ls -la dist/

# Preview the production build locally
npm run preview
```

The production build includes:
- **Code splitting** for optimal loading
- **Asset optimization** (images, CSS, JS)
- **TypeScript compilation** with type checking
- **Tailwind CSS purging** for minimal bundle size

### Deployment

The admin panel is automatically deployed to S3 + CloudFront when using the automated deployment scripts:

```bash
# Automated deployment (includes admin panel)
./scripts/deploy.sh --email your-email@example.com

# Manual deployment to existing S3 bucket
npm run build
S3_BUCKET=$(aws cloudformation describe-stacks \
  --stack-name satisfactory-server \
  --query 'Stacks[0].Outputs[?OutputKey==`S3BucketName`].OutputValue' \
  --output text)
aws s3 sync dist/ s3://$S3_BUCKET/
```

### Troubleshooting

#### Common Development Issues

**Issue**: `VITE_API_URL is not defined`
```bash
# Solution: Create .env.local with your API Gateway URL
echo "VITE_API_URL=https://your-api-url.execute-api.region.amazonaws.com" > .env.local
```

**Issue**: `Cannot connect to server` or CORS errors
```bash
# Solution: Verify API Gateway URL and ensure backend is deployed
curl -X GET "$VITE_API_URL/server/status"
```

**Issue**: `Login fails with correct password`
```bash
# Solution: Verify admin password from Secrets Manager
aws secretsmanager get-secret-value \
  --secret-id satisfactory-admin-password \
  --query 'SecretString' \
  --output text
```

**Issue**: `Module not found` errors
```bash
# Solution: Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

#### Development Tips

1. **Hot Reload**: Save any file to trigger automatic browser refresh
2. **TypeScript Errors**: Check the terminal and browser console for type errors
3. **Network Tab**: Use browser dev tools to inspect API calls and responses
4. **React DevTools**: Install React DevTools browser extension for component debugging
5. **Tailwind IntelliSense**: Use VS Code Tailwind CSS IntelliSense extension

### Contributing

When making changes to the admin panel:

1. **Follow TypeScript**: Ensure all code is properly typed
2. **Test Changes**: Run `npm test` before committing
3. **Check Linting**: Run `npm run lint` to ensure code quality
4. **Mobile Testing**: Test responsive design on different screen sizes
5. **Error Handling**: Ensure graceful error handling for all user actions

### Performance Considerations

- **Bundle Size**: Keep dependencies minimal and use code splitting
- **API Calls**: Implement proper loading states and error handling
- **Memory Leaks**: Clean up timers and subscriptions in useEffect cleanup
- **Responsive Images**: Use appropriate image sizes for different devices
- **Caching**: Leverage browser caching for static assets

### Security Notes

- **Environment Variables**: Never commit `.env.local` files
- **JWT Tokens**: Stored in sessionStorage, automatically cleared on logout
- **API Calls**: All authenticated requests include Bearer tokens
- **Input Validation**: Client-side validation with server-side verification
- **Error Messages**: Avoid exposing sensitive information in error responses