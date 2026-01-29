// Control Lambda specific types

export interface LoginRequest {
  password: string;
}

export interface LoginResponse {
  token: string; // JWT token
  expiresAt: number; // Unix timestamp when token expires
}

export interface StartResponse {
  message: string;
  publicIp?: string;
  port: number;
}

export interface StopResponse {
  message: string;
}

export interface StatusResponse {
  serverState: 'offline' | 'starting' | 'running' | 'stopping';
  publicIp?: string;
  port: number;
  playerCount?: number;
  serverName?: string;
  gamePhase?: string;
}

export interface ClientPasswordResponse {
  password: string | null; // null if no password is set
}

export interface SetClientPasswordRequest {
  password: string; // Empty string to remove password protection
}

export interface SetClientPasswordResponse {
  message: string;
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
  playerCount: number;
  serverName: string;
  gamePhase: string;
  serverGameState: ServerGameState;
}