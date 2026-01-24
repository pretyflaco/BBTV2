/**
 * ProfileSection - Display user profile information
 */

import { useCombinedAuth } from '../../lib/hooks/useCombinedAuth';
import { useTheme } from '../../lib/hooks/useTheme';

export default function ProfileSection() {
  const { user, authMode } = useCombinedAuth();
  const { darkMode } = useTheme();

  return (
    <div className="space-y-4">
      {/* Profile Card */}
      <div className={`rounded-lg p-4 ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
            authMode === 'nostr' 
              ? 'bg-purple-500/20' 
              : 'bg-blink-accent/20'
          }`}>
            <svg className={`w-6 h-6 ${authMode === 'nostr' ? 'text-purple-400' : 'text-blink-accent'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <div>
            <h4 className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {user?.username || 'Anonymous'}
            </h4>
            <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              {authMode === 'nostr' ? 'Nostr Identity' : 'Legacy Account'}
            </p>
          </div>
        </div>

        {/* Details */}
        <div className="space-y-3">
          <div className={`flex justify-between items-center py-2 border-b ${
            darkMode ? 'border-gray-700' : 'border-gray-200'
          }`}>
            <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Auth Method
            </span>
            <span className={`text-sm font-medium flex items-center gap-2 ${
              darkMode ? 'text-white' : 'text-gray-900'
            }`}>
              <span className={`w-2 h-2 rounded-full ${
                authMode === 'nostr' ? 'bg-purple-500' : 'bg-blink-accent'
              }`}></span>
              {authMode === 'nostr' ? 'Nostr' : 'API Key'}
            </span>
          </div>

          {user?.username && (
            <div className={`flex justify-between items-center py-2`}>
              <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Blink Username
              </span>
              <span className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                @{user.username}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
