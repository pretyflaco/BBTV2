/**
 * SettingsPage - Profile settings
 */

import { useTheme } from '../../lib/hooks/useTheme';
import ProfileSection from './ProfileSection';
import KeyManagementSection from './KeyManagementSection';

export default function SettingsPage({ onClose }) {
  const { darkMode } = useTheme();

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center">
      <div 
        className={`w-full sm:max-w-lg max-h-[95vh] sm:max-h-[85vh] sm:mx-4 sm:rounded-xl shadow-2xl overflow-hidden flex flex-col ${
          darkMode ? 'bg-black' : 'bg-white'
        }`}
        style={{ fontFamily: "'Source Sans Pro', sans-serif" }}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-4 py-3 border-b ${
          darkMode ? 'border-gray-700' : 'border-gray-200'
        }`}>
          <h2 className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            Profile
          </h2>
          <button
            onClick={onClose}
            className={`p-2 -mr-2 rounded-md ${
              darkMode 
                ? 'text-gray-400 hover:text-gray-300 hover:bg-gray-800' 
                : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <ProfileSection />
          <KeyManagementSection />
        </div>
      </div>
    </div>
  );
}
