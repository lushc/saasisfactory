import { useState } from 'react';
import LoadingSpinner from './LoadingSpinner';
import { useClientPassword } from '../hooks/useClientPassword';

export default function ClientPasswordManager() {
  const {
    currentPassword,
    isLoading,
    isUpdating,
    error,
    successMessage,
    setPassword,
    removePassword,
    clearMessages
  } = useClientPassword();

  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newPassword.trim()) {
      return;
    }

    const success = await setPassword(newPassword);
    if (success) {
      setNewPassword('');
      setIsPasswordVisible(false); // Hide password after update
    }
  };

  const handleRemovePassword = async () => {
    if (!confirm('Are you sure you want to remove password protection? Anyone will be able to join the server.')) {
      return;
    }

    const success = await removePassword();
    if (success) {
      setIsPasswordVisible(false);
    }
  };

  const togglePasswordVisibility = () => {
    setIsPasswordVisible(!isPasswordVisible);
  };

  // Clear messages when user starts typing
  const handleNewPasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewPassword(e.target.value);
    if (error || successMessage) {
      clearMessages();
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-8 bg-gray-200 rounded w-full mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
      <h2 className="text-lg sm:text-xl font-semibold text-gray-800 mb-4">Client Password Manager</h2>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 sm:p-4">
          <div className="text-sm text-red-700">{error}</div>
        </div>
      )}

      {successMessage && (
        <div className="mb-4 rounded-md bg-green-50 p-3 sm:p-4">
          <div className="text-sm text-green-700">{successMessage}</div>
        </div>
      )}

      {/* Current Password Status */}
      <div className="mb-6">
        <h3 className="text-sm font-medium text-gray-700 mb-2">Current Status</h3>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 bg-gray-50 rounded-md space-y-2 sm:space-y-0">
          <div className="flex flex-col sm:flex-row sm:items-center">
            <span className="text-sm text-gray-600 mb-1 sm:mb-0">
              {currentPassword ? 'Password protection is enabled' : 'No password protection'}
            </span>
            {currentPassword && (
              <span className="sm:ml-2 inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 w-fit">
                Protected
              </span>
            )}
          </div>
          
          {currentPassword && (
            <button
              onClick={togglePasswordVisibility}
              className="text-sm text-indigo-600 hover:text-indigo-800 font-medium w-fit"
            >
              {isPasswordVisible ? 'Hide' : 'Reveal'} Password
            </button>
          )}
        </div>

        {/* Password Display */}
        {currentPassword && isPasswordVisible && (
          <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0">
              <span className="text-sm font-mono text-blue-900 break-all">
                {currentPassword}
              </span>
              <button
                onClick={() => navigator.clipboard.writeText(currentPassword)}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium w-fit"
              >
                Copy
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Set New Password Form */}
      <div className="mb-4">
        <h3 className="text-sm font-medium text-gray-700 mb-2">
          {currentPassword ? 'Update Password' : 'Set Password'}
        </h3>
        <form onSubmit={handleSetPassword} className="space-y-3">
          <div>
            <input
              type="password"
              value={newPassword}
              onChange={handleNewPasswordChange}
              placeholder="Enter new client password"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-sm"
              disabled={isUpdating}
            />
          </div>
          <button
            type="submit"
            disabled={isUpdating || !newPassword.trim()}
            className="w-full flex justify-center items-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isUpdating ? (
              <>
                <LoadingSpinner size="sm" className="mr-2" />
                {currentPassword ? 'Updating...' : 'Setting...'}
              </>
            ) : (
              currentPassword ? 'Update Password' : 'Set Password'
            )}
          </button>
        </form>
      </div>

      {/* Remove Password Protection */}
      {currentPassword && (
        <div className="pt-4 border-t border-gray-200">
          <button
            onClick={handleRemovePassword}
            disabled={isUpdating}
            className="w-full flex justify-center items-center py-2 px-4 border border-red-300 rounded-md shadow-sm text-sm font-medium text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isUpdating ? (
              <>
                <LoadingSpinner size="sm" className="mr-2" />
                Removing...
              </>
            ) : (
              'Remove Password Protection'
            )}
          </button>
        </div>
      )}

      <div className="mt-4 text-xs text-gray-500 space-y-1">
        <p>• Client password is required for players to join the server</p>
        <p>• Password is stored securely and only revealed when requested</p>
        <p>• Removing password protection allows anyone to join</p>
      </div>
    </div>
  );
}