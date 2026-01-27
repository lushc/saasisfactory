import { useState, useEffect, useCallback } from 'react';
import ServerStatus from './ServerStatus';
import ServerControls from './ServerControls';
import ClientPasswordManager from './ClientPasswordManager';
import { useServerStatus } from '../hooks/useServerStatus';

interface DashboardProps {
  onLogout: () => void;
}

export default function Dashboard({ onLogout }: DashboardProps) {
  const { status, isLoading, error, fetchStatus, clearError } = useServerStatus();
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Update last updated timestamp when status changes
  useEffect(() => {
    if (status && !isLoading) {
      setLastUpdated(new Date());
    }
  }, [status, isLoading]);

  // Initial load
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Auto-refresh every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchStatus();
    }, 10000);

    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleStatusChange = useCallback(() => {
    // Trigger immediate status refresh after server control actions
    fetchStatus();
  }, [fetchStatus]);

  const handleRetry = useCallback(() => {
    clearError();
    fetchStatus();
  }, [clearError, fetchStatus]);

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center py-4 sm:py-6 space-y-4 sm:space-y-0">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
                Satisfactory Server Admin
              </h1>
              <p className="text-xs sm:text-sm text-gray-600">
                Manage your on-demand game server
              </p>
            </div>
            <button
              onClick={onLogout}
              className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto py-4 sm:py-6 px-4 sm:px-6 lg:px-8">
        <div className="space-y-6">
          {error && (
            <div className="rounded-md bg-red-50 p-4">
              <div className="flex">
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">
                    Error loading server status
                  </h3>
                  <div className="mt-2 text-sm text-red-700">
                    <p>{error}</p>
                  </div>
                  <div className="mt-4">
                    <button
                      onClick={handleRetry}
                      className="bg-red-50 text-red-800 hover:bg-red-100 px-3 py-2 rounded-md text-sm font-medium"
                    >
                      Retry
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
            {/* Server Status */}
            <div className="xl:col-span-1">
              <ServerStatus
                status={status}
                isLoading={isLoading}
                lastUpdated={lastUpdated}
              />
            </div>

            {/* Server Controls */}
            <div className="xl:col-span-1">
              <ServerControls
                status={status}
                onStatusChange={handleStatusChange}
              />
            </div>

            {/* Client Password Manager - Full Width */}
            <div className="xl:col-span-2">
              <ClientPasswordManager />
            </div>
          </div>

          {/* Connection Info */}
          {status?.serverState === 'running' && status.publicIp && (
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <div className="flex flex-col sm:flex-row">
                <div className="flex-shrink-0 mb-2 sm:mb-0 sm:mr-3">
                  <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-blue-800">
                    Server is ready for connections
                  </h3>
                  <div className="mt-2 text-sm text-blue-700 space-y-1">
                    <p className="break-all">
                      Connect to: <span className="font-mono font-semibold">{status.publicIp}:{status.port}</span>
                    </p>
                    <p>
                      The server will automatically shut down after 10 minutes of inactivity.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}