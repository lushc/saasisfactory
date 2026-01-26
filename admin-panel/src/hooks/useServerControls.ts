import { useState, useCallback } from 'react';
import apiService from '../services/api';

export function useServerControls() {
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [error, setError] = useState('');

  const startServer = useCallback(async () => {
    setIsStarting(true);
    setError('');

    try {
      await apiService.startServer();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start server');
      return false;
    } finally {
      setIsStarting(false);
    }
  }, []);

  const stopServer = useCallback(async () => {
    setIsStopping(true);
    setError('');

    try {
      await apiService.stopServer();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop server');
      return false;
    } finally {
      setIsStopping(false);
    }
  }, []);

  const clearError = useCallback(() => {
    setError('');
  }, []);

  return {
    isStarting,
    isStopping,
    error,
    startServer,
    stopServer,
    clearError
  };
}