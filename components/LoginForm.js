import { useState } from 'react';
import { useAuth } from '../lib/hooks/useAuth';

export default function LoginForm() {
  const [username, setUsername] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const result = await login(username, apiKey);

    if (!result.success) {
      setError(result.error || 'Login failed');
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Blink Balance Tracker V2
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Sign in with your Blink API key
          </p>
        </div>
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="username" className="sr-only">
              Username
            </label>
            <input
              id="username"
              name="username"
              type="text"
              required
              className="relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blink-orange focus:border-blink-orange focus:z-10 sm:text-sm"
              placeholder="Blink Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          
          <div>
            <label htmlFor="apiKey" className="sr-only">
              API Key
            </label>
            <input
              id="apiKey"
              name="apiKey"
              type="password"
              required
              className="relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blink-orange focus:border-blink-orange focus:z-10 sm:text-sm"
              placeholder="Blink API Key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>

          {error && (
            <div className="text-red-600 text-sm text-center">
              {error}
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blink-orange hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blink-orange disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>
        </form>

        <div className="text-xs text-gray-500 text-center">
          <p>Your API key is encrypted and stored securely.</p>
          <p className="mt-1">
            Get your API key from{' '}
            <a
              href="https://dashboard.blink.sv"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blink-orange hover:underline"
            >
              Blink Dashboard
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
