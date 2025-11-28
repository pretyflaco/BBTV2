/**
 * SettingsPage - Profile and settings management UI
 * 
 * Sections:
 * - Profile Overview (public key, auth method)
 * - Blink Accounts (add, remove, switch)
 * - Tipping Settings
 * - Preferences (currency, theme)
 * - Sign Out
 */

import { useState } from 'react';
import { useCombinedAuth } from '../../lib/hooks/useCombinedAuth';
import { useDarkMode } from '../../lib/hooks/useDarkMode';
import ProfileSection from './ProfileSection';
import BlinkAccountsSection from './BlinkAccountsSection';
import TippingSection from './TippingSection';
import PreferencesSection from './PreferencesSection';

export default function SettingsPage({ onClose }) {
  const { 
    user, 
    authMode, 
    publicKey, 
    logout,
    hasServerSession
  } = useCombinedAuth();
  
  const { darkMode } = useDarkMode();
  const [activeSection, setActiveSection] = useState('profile');

  // Build sections
  const sections = [
    { id: 'profile', label: 'Profile', icon: '👤' },
    { id: 'accounts', label: 'Blink Accounts', icon: '💳' },
    { id: 'tipping', label: 'Tipping', icon: '💰' },
    { id: 'preferences', label: 'Preferences', icon: '⚙️' },
  ];

  const handleSignOut = async () => {
    if (confirm('Are you sure you want to sign out?')) {
      await logout();
      onClose?.();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className={`w-full max-w-2xl max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col ${
        darkMode ? 'bg-gray-900' : 'bg-white'
      }`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-4 border-b ${
          darkMode ? 'border-gray-700' : 'border-gray-200'
        }`}>
          <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            Settings
          </h2>
          <button
            onClick={onClose}
            className={`p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${
              darkMode ? 'text-gray-400' : 'text-gray-600'
            }`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar Navigation */}
          <nav className={`w-48 flex-shrink-0 border-r overflow-y-auto ${
            darkMode ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50'
          }`}>
            <ul className="py-2">
              {sections.map((section) => (
                <li key={section.id}>
                  <button
                    onClick={() => setActiveSection(section.id)}
                    className={`w-full px-4 py-3 text-left flex items-center gap-3 transition-colors ${
                      activeSection === section.id
                        ? darkMode
                          ? 'bg-blink-accent/20 text-blink-accent border-r-2 border-blink-accent'
                          : 'bg-blink-accent/10 text-blink-accent border-r-2 border-blink-accent'
                        : darkMode
                          ? 'text-gray-300 hover:bg-gray-700'
                          : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <span className="text-lg">{section.icon}</span>
                    <span className="text-sm font-medium">{section.label}</span>
                  </button>
                </li>
              ))}
            </ul>

            {/* Sign Out Button */}
            <div className={`p-4 border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
              <button
                onClick={handleSignOut}
                className="w-full px-4 py-2 text-sm font-medium text-red-500 hover:bg-red-500/10 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Sign Out
              </button>
            </div>
          </nav>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeSection === 'profile' && (
              <ProfileSection 
                user={user}
                authMode={authMode}
                publicKey={publicKey}
                hasServerSession={hasServerSession}
              />
            )}
            {activeSection === 'accounts' && (
              <BlinkAccountsSection />
            )}
            {activeSection === 'tipping' && (
              <TippingSection />
            )}
            {activeSection === 'preferences' && (
              <PreferencesSection />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

