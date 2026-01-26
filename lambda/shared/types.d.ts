export interface JWTPayload {
    sub: 'admin';
    iat: number;
    exp: number;
}
export interface AuthorizerEvent {
    headers: {
        authorization?: string;
    };
    requestContext: {
        http: {
            method: string;
            path: string;
        };
    };
}
export interface AuthorizerResponse {
    isAuthorized: boolean;
    context?: {
        userId: string;
    };
}
export interface ErrorResponse {
    error: string;
    message: string;
    details?: any;
}
//# sourceMappingURL=types.d.ts.map