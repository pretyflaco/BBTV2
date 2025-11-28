/**
 * SettingsPage - Profile and settings management UI
 * Mobile-optimized with bottom navigation
 */

import { useState } from 'react';
import { useCombinedAuth } from '../../lib/hooks/useCombinedAuth';
import { useDarkMode } from '../../lib/hooks/useDarkMode';
import ProfileSection from './ProfileSection';
import BlinkAccountsSection from './BlinkAccountsSection';
import TippingSection from './TippingSection';
import PreferencesSection from './PreferencesSection';

export default function SettingsPage({ onClose }) {
  const { logout } = useCombinedAuth();
  const { darkMode } = useDarkMode();
  const [activeSection, setActiveSection] = useState('profile');

  const sections = [
    { id: 'profile', label: 'Profile' },
    { id: 'accounts', label: 'Accounts' },
    { id: 'tipping', label: 'Tipping' },
    { id: 'preferences', label: 'Settings' },
  ];

  const handleSignOut = async () => {
    if (confirm('Sign out?')) {
      await logout();
      onClose?.();
    }
  };

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
            Settings
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

        {/* Tab Navigation - Horizontal scrollable on mobile */}
        <div className={`flex border-b overflow-x-auto scrollbar-hide ${
          darkMode ? 'border-gray-700' : 'border-gray-200'
        }`}>
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`flex-shrink-0 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeSection === section.id
                  ? 'border-blink-accent text-blink-accent'
                  : darkMode
                    ? 'border-transparent text-gray-400 hover:text-gray-300'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {section.label}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeSection === 'profile' && <ProfileSection />}
          {activeSection === 'accounts' && <BlinkAccountsSection />}
          {activeSection === 'tipping' && <TippingSection />}
          {activeSection === 'preferences' && <PreferencesSection />}
        </div>

        {/* Footer - Sign Out */}
        <div className={`px-4 py-3 border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <button
            onClick={handleSignOut}
            className="w-full py-2 text-sm font-medium text-red-500 hover:bg-red-500/10 rounded-md transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
