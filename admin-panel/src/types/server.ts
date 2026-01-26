export interface LoginRequest {
  password: string;
}

export interface LoginResponse {
  token: string;
  expiresIn: number; // 3600 seconds
}

export interface StartResponse {
  status: 'starting' | 'running';
  taskArn?: string;
  publicIp?: string;
}

export interface StopResponse {
  status: 'stopping';
}

export interface StatusResponse {
  serverState: 'offline' | 'starting' | 'running' | 'stopping';
  publicIp?: string;
  port: number;
  playerCount?: number;
  serverName?: string;
  gamePhase?: string;
  lastUpdated: string;
}

export interface ClientPasswordResponse {
  password: string | null; // null if no password is set
}

export interface SetClientPasswordRequest {
  password: string; // Empty string to remove password protection
}

export interface SetClientPasswordResponse {
  success: boolean;
  message?: string; // Optional success/error message
}

export interface ErrorResponse {
  error: string;
  message: string;
  details?: any;
}