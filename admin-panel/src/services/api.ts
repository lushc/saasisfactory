import axios, { type AxiosInstance, type AxiosError } from 'axios';
import type {
  LoginRequest,
  LoginResponse,
  StartResponse,
  StopResponse,
  StatusResponse,
  ClientPasswordResponse,
  SetClientPasswordRequest,
  SetClientPasswordResponse,
  ErrorResponse,
} from '../types/server';

class ApiService {
  private api: AxiosInstance;
  private baseUrl: string;

  constructor() {
    this.baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    
    this.api = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000, // 30 seconds timeout
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add request interceptor to include JWT token
    this.api.interceptors.request.use((config) => {
      const token = this.getToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Add response interceptor to handle 401 errors
    this.api.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          this.handleAuthError();
        }
        return Promise.reject(error);
      }
    );
  }

  private getToken(): string | null {
    return sessionStorage.getItem('jwt_token');
  }

  private setToken(token: string): void {
    sessionStorage.setItem('jwt_token', token);
  }

  private clearToken(): void {
    sessionStorage.removeItem('jwt_token');
  }

  private handleAuthError(): void {
    this.clearToken();
    // Redirect to login page
    window.location.href = '/';
  }

  private handleApiError(error: AxiosError): never {
    if (error.response?.data) {
      const errorData = error.response.data as ErrorResponse;
      throw new Error(errorData.message || errorData.error || 'An error occurred');
    }
    throw new Error(error.message || 'Network error occurred');
  }

  async login(password: string): Promise<LoginResponse> {
    try {
      const response = await this.api.post<LoginResponse>('/auth/login', {
        password,
      } as LoginRequest);
      
      // Store the JWT token
      this.setToken(response.data.token);
      
      return response.data;
    } catch (error) {
      this.handleApiError(error as AxiosError);
    }
  }

  async getServerStatus(): Promise<StatusResponse> {
    try {
      const response = await this.api.get<StatusResponse>('/server/status');
      return response.data;
    } catch (error) {
      this.handleApiError(error as AxiosError);
    }
  }

  async startServer(): Promise<StartResponse> {
    try {
      const response = await this.api.post<StartResponse>('/server/start');
      return response.data;
    } catch (error) {
      this.handleApiError(error as AxiosError);
    }
  }

  async stopServer(): Promise<StopResponse> {
    try {
      const response = await this.api.post<StopResponse>('/server/stop');
      return response.data;
    } catch (error) {
      this.handleApiError(error as AxiosError);
    }
  }

  async getClientPassword(): Promise<ClientPasswordResponse> {
    try {
      const response = await this.api.get<ClientPasswordResponse>('/server/client-password');
      return response.data;
    } catch (error) {
      this.handleApiError(error as AxiosError);
    }
  }

  async setClientPassword(password: string): Promise<SetClientPasswordResponse> {
    try {
      const response = await this.api.post<SetClientPasswordResponse>(
        '/server/client-password',
        { password } as SetClientPasswordRequest
      );
      return response.data;
    } catch (error) {
      this.handleApiError(error as AxiosError);
    }
  }

  async removeClientPassword(): Promise<SetClientPasswordResponse> {
    return this.setClientPassword(''); // Empty string removes password protection
  }

  isAuthenticated(): boolean {
    const token = this.getToken();
    if (!token) return false;

    try {
      // Basic JWT token validation (check if it's not expired)
      const payload = JSON.parse(atob(token.split('.')[1]));
      const currentTime = Math.floor(Date.now() / 1000);
      return payload.exp > currentTime;
    } catch {
      // If token is malformed, consider it invalid
      this.clearToken();
      return false;
    }
  }

  logout(): void {
    this.clearToken();
    window.location.href = '/';
  }
}

// Export a singleton instance
export const apiService = new ApiService();
export default apiService;