// Monitor Lambda specific types

export interface ShutdownTimerState {
  id: 'singleton'; // Partition key
  timerStarted: number | null; // Unix timestamp in milliseconds
  shutdownTimeoutMinutes: number;
  lastPlayerCount: number;
  lastChecked: number; // Unix timestamp
}

export interface MonitorEvent {
  source: string;
  'detail-type': string;
  detail: any;
}

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

export interface QueryServerStateResponse {
  serverGameState: ServerGameState;
}

export interface SatisfactoryApiResponse<T = any> {
  data: T;
}

export interface AuthTokenResponse {
  AuthenticationToken: string;
}