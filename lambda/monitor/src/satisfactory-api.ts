import axios, { AxiosInstance } from 'axios';
import https from 'https';
import { 
  SatisfactoryApiResponse, 
  AuthTokenResponse, 
  QueryServerStateResponse 
} from './types';
import { config } from '../../shared/config';

export class SatisfactoryApiClient {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor(serverIp: string) {
    this.baseUrl = `https://${serverIp}:${config.server.port}/api/v1`;
    
    // Create axios instance with custom HTTPS agent to accept self-signed certificates
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: config.server.apiTimeout,
      httpsAgent: new https.Agent({
        rejectUnauthorized: false // Accept self-signed certificates
      })
    });
  }

  /**
   * Login with admin password
   */
  async passwordLogin(adminPassword: string): Promise<string> {
    const response = await this.client.post<SatisfactoryApiResponse<AuthTokenResponse>>('', {
      function: 'PasswordLogin',
      data: {
        MinimumPrivilegeLevel: 'Administrator',
        Password: adminPassword
      }
    });
    
    return response.data.data.AuthenticationToken;
  }

  /**
   * Verify if authentication token is still valid
   */
  async verifyAuthenticationToken(token: string): Promise<boolean> {
    try {
      await this.client.post('', {
        function: 'VerifyAuthenticationToken',
        data: {}
      }, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      return true;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Query server state to get player count and game information
   */
  async queryServerState(token: string): Promise<QueryServerStateResponse> {
    const response = await this.client.post<SatisfactoryApiResponse<QueryServerStateResponse>>('', {
      function: 'QueryServerState',
      data: {}
    }, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    
    return response.data.data;
  }

  /**
   * Gracefully shutdown the server
   */
  async shutdown(token: string): Promise<void> {
    await this.client.post('', {
      function: 'Shutdown',
      data: {}
    }, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
  }
}