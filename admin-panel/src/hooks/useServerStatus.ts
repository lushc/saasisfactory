import { useState, useCallback } from 'react';
import type { StatusResponse } from '../types/server';
import apiService from '../services/api';

export function useServerStatus() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchStatus = useCallback(async () => {
    try {
      setError('');
      const response = await apiService.getServerStatus();
      setStatus(response);
    } catch (err) {
      if (err instanceof Error && err.message.includes('401')) {
        // Token expired, will be handled by API service interceptor
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to fetch server status');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearError = useCallback(() => {
    setError('');
  }, []);

  return { 
    status, 
    isLoading, 
    error, 
    fetchStatus, 
    clearError 
  };
}