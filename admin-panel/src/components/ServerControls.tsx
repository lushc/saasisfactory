import type { StatusResponse } from '../types/server';
import LoadingSpinner from './LoadingSpinner';
import { useServerControls } from '../hooks/useServerControls';

interface ServerControlsProps {
  status: StatusResponse | null;
  onStatusChange: () => void;
}

export default function ServerControls({ status, onStatusChange }: ServerControlsProps) {
  const { isStarting, isStopping, error, startServer, stopServer, clearError } = useServerControls();

  const handleStart = async () => {
    clearError();
    const success = await startServer();
    if (success) {
      onStatusChange(); // Trigger status refresh
    }
  };

  const handleStop = async () => {
    clearError();
    const success = await stopServer();
    if (success) {
      onStatusChange(); // Trigger status refresh
    }
  };

  const canStart = status?.serverState === 'offline' && !isStarting && !isStopping;
  const canStop = status?.serverState === 'running' && !isStarting && !isStopping;
  const isTransitioning = status?.serverState === 'starting' || status?.serverState === 'stopping';

  return (
    <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
      <h2 className="text-lg sm:text-xl font-semibold text-gray-800 mb-4">Server Controls</h2>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 sm:p-4">
          <div className="text-sm text-red-700">{error}</div>
        </div>
      )}

      <div className="space-y-3">
        {canStart && (
          <button
            onClick={handleStart}
            disabled={isStarting}
            className="w-full flex justify-center items-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isStarting ? (
              <>
                <LoadingSpinner size="sm" className="mr-2" />
                Starting Server...
              </>
            ) : (
              'Start Server'
            )}
          </button>
        )}

        {canStop && (
          <button
            onClick={handleStop}
            disabled={isStopping}
            className="w-full flex justify-center items-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isStopping ? (
              <>
                <LoadingSpinner size="sm" className="mr-2" />
                Stopping Server...
              </>
            ) : (
              'Stop Server'
            )}
          </button>
        )}

        {isTransitioning && (
          <div className="w-full flex justify-center items-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-gray-50">
            <LoadingSpinner size="sm" className="mr-2" />
            {status?.serverState === 'starting' ? 'Server is starting...' : 'Server is stopping...'}
          </div>
        )}
      </div>

      <div className="mt-4 text-xs text-gray-500 space-y-1">
        <p>• Starting the server may take 2-3 minutes</p>
        <p>• Stopping saves the game before shutdown</p>
      </div>
    </div>
  );
}