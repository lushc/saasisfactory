import type { StatusResponse } from '../types/server';

interface ServerStatusProps {
  status: StatusResponse | null;
  isLoading: boolean;
  lastUpdated: Date | null;
}

export default function ServerStatus({ status, isLoading, lastUpdated }: ServerStatusProps) {
  const getStatusColor = (state: string) => {
    switch (state) {
      case 'running':
        return 'text-green-600 bg-green-100';
      case 'starting':
        return 'text-yellow-600 bg-yellow-100';
      case 'stopping':
        return 'text-orange-600 bg-orange-100';
      case 'offline':
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusText = (state: string) => {
    switch (state) {
      case 'running':
        return 'Running';
      case 'starting':
        return 'Starting';
      case 'stopping':
        return 'Stopping';
      case 'offline':
      default:
        return 'Offline';
    }
  };

  if (isLoading && !status) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-8 bg-gray-200 rounded w-1/2 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg sm:text-xl font-semibold text-gray-800">Server Status</h2>
        {isLoading && (
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600"></div>
        )}
      </div>

      <div className="space-y-3 sm:space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center">
          <span className="text-sm font-medium text-gray-500 sm:w-20 mb-1 sm:mb-0">Status:</span>
          <span
            className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(
              status?.serverState || 'offline'
            )}`}
          >
            {getStatusText(status?.serverState || 'offline')}
          </span>
        </div>

        {status?.publicIp && (
          <div className="flex flex-col sm:flex-row sm:items-center">
            <span className="text-sm font-medium text-gray-500 sm:w-20 mb-1 sm:mb-0">IP:</span>
            <span className="text-sm text-gray-900 font-mono break-all">
              {status.publicIp}:{status.port}
            </span>
          </div>
        )}

        {status?.serverState === 'running' && (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center">
              <span className="text-sm font-medium text-gray-500 sm:w-20 mb-1 sm:mb-0">Players:</span>
              <span className="text-sm text-gray-900">
                {status.playerCount ?? 0}
              </span>
            </div>

            {status.serverName && (
              <div className="flex flex-col sm:flex-row sm:items-center">
                <span className="text-sm font-medium text-gray-500 sm:w-20 mb-1 sm:mb-0">Name:</span>
                <span className="text-sm text-gray-900 break-all">{status.serverName}</span>
              </div>
            )}

            {status.gamePhase && (
              <div className="flex flex-col sm:flex-row sm:items-center">
                <span className="text-sm font-medium text-gray-500 sm:w-20 mb-1 sm:mb-0">Phase:</span>
                <span className="text-sm text-gray-900">{status.gamePhase}</span>
              </div>
            )}
          </>
        )}

        {lastUpdated && (
          <div className="pt-2 border-t border-gray-200">
            <span className="text-xs text-gray-500">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}