// Control Lambda specific types

export interface LoginRequest {
  password: string;
}

export interface LoginResponse {
  token: string; // JWT token
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

// ECS Task types
export interface ECSTask {
  taskArn: string;
  lastStatus: 'PENDING' | 'RUNNING' | 'STOPPED';
  desiredStatus: 'RUNNING' | 'STOPPED';
  containers: Array<{
    name: string;
    lastStatus: string;
    networkInterfaces: Array<{
      privateIpv4Address: string;
    }>;
  }>;
  attachments: Array<{
    type: 'ElasticNetworkInterface';
    details: Array<{
      name: string;
      value: string;
    }>;
  }>;
}

// Satisfactory Server API types
export interface ServerGameState {
  activeSessionName: string;
  numConnectedPlayers: number;
  playerLimit: number;
  techTier: number;
  activeSchematic: string;
  gamePhase: string;
  isGameRunning: boolean;
  totalGameDuration: number;
  isGamePaused: boolean;
  averageTickRate: number;
  autoLoadSessionName: string;
}

export interface SatisfactoryApiResponse<T = any> {
  data: T;
}

export interface AuthTokenResponse {
  AuthenticationToken: string;
}

export interface QueryServerStateResponse {
  serverGameState: ServerGameState;
}