import { useState } from 'react';
import { useAuth } from '../lib/hooks/useAuth';
import { useTheme } from '../lib/hooks/useTheme';

export default function LoginForm() {
  const { darkMode } = useTheme();
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pasting, setPasting] = useState(false);
  
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Use only API key for login, username will be fetched from API
    const result = await login(null, apiKey);

    if (!result.success) {
      setError(result.error || 'Login failed');
    }

    setLoading(false);
  };

  const handlePasteFromClipboard = async () => {
    setPasting(true);
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text.trim()) {
          setApiKey(text.trim());
          setError(''); // Clear any existing errors
        } else {
          setError('Clipboard is empty');
        }
      } else {
        setError('Clipboard access not supported in this browser');
      }
    } catch (error) {
      console.error('Paste error:', error);
      setError('Failed to read from clipboard. Please paste manually.');
    } finally {
      setPasting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-black">
      <div className="max-w-md w-full space-y-8">
        <div>
          <div className="flex justify-center mb-6">
            <img 
              src={darkMode ? "/logos/blink-logo-full.svg" : "/logos/blink-logo-full-dark.svg"} 
              alt="Blink" 
              className="h-24"
            />
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-gray-100">
            Blink POS
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
            Sign in with your Blink API key (READ + RECEIVE Scopes)
          </p>
        </div>
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit} autoComplete="off">
          <div className="space-y-4">
            <div>
              <label htmlFor="apiKey" className="sr-only">
                API Key
              </label>
              <input
                id="apiKey"
                name="apiKey"
                type="password"
                required
                autoComplete="off"
                data-1p-ignore="true"
                data-lpignore="true"
                className="relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-gray-100 bg-white dark:bg-blink-dark rounded-md focus:outline-none focus:ring-blink-accent focus:border-blink-accent focus:z-10 sm:text-sm"
                placeholder="Blink API Key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>
            
            {/* Paste Button */}
            <div className="flex justify-center">
              <button
                type="button"
                onClick={handlePasteFromClipboard}
                disabled={pasting}
                className="inline-flex items-center px-6 py-3 rounded-full shadow-sm bg-gray-700 dark:bg-gray-700 text-base font-medium text-white hover:bg-gray-600 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-black focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {pasting ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Pasting...
                  </>
                ) : (
                  <>
                    <svg className="-ml-1 mr-2 h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                    </svg>
                    Paste API Key from Clipboard
                  </>
                )}
              </button>
            </div>
          </div>

          {error && (
            <div className="text-red-600 dark:text-red-400 text-sm text-center">
              {error}
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-4 px-6 border border-transparent text-xl font-bold rounded-full text-black bg-[#FFAD0D] hover:bg-[#D9930B] focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-black focus:ring-[#FFAD0D] disabled:opacity-50 shadow-lg"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>
        </form>

        <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
          <p>Your API key is encrypted and stored securely.</p>
          <p className="mt-1">
            Get your API key from{' '}
            <a
              href="https://dashboard.blink.sv"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blink-accent hover:underline"
            >
              Blink Dashboard
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
