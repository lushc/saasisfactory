import { useState, useEffect, useCallback } from 'react';
import apiService from '../services/api';

export function useClientPassword() {
  const [currentPassword, setCurrentPassword] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const loadCurrentPassword = useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await apiService.getClientPassword();
      setCurrentPassword(response.password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load current password');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const setPassword = useCallback(async (password: string) => {
    if (!password.trim()) {
      setError('Password cannot be empty');
      return false;
    }

    setIsUpdating(true);
    setError('');
    setSuccessMessage('');

    try {
      await apiService.setClientPassword(password);
      setCurrentPassword(password);
      setSuccessMessage('Client password updated successfully');
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update password');
      return false;
    } finally {
      setIsUpdating(false);
    }
  }, []);

  const removePassword = useCallback(async () => {
    setIsUpdating(true);
    setError('');
    setSuccessMessage('');

    try {
      await apiService.removeClientPassword();
      setCurrentPassword(null);
      setSuccessMessage('Password protection removed');
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove password protection');
      return false;
    } finally {
      setIsUpdating(false);
    }
  }, []);

  const clearMessages = useCallback(() => {
    setError('');
    setSuccessMessage('');
  }, []);

  // Load password on mount
  useEffect(() => {
    loadCurrentPassword();
  }, [loadCurrentPassword]);

  return {
    currentPassword,
    isLoading,
    isUpdating,
    error,
    successMessage,
    setPassword,
    removePassword,
    loadCurrentPassword,
    clearMessages
  };
}