import { useState, useEffect, useRef, createContext, useContext } from 'react';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // Start with loading: true since we always check auth on mount
  const [loading, setLoading] = useState(true);
  
  // Track if auth check has been initiated to handle React Strict Mode
  const authCheckInitiated = useRef(false);

  // Check authentication status on mount
  useEffect(() => {
    // Only run on client side
    if (typeof window !== 'undefined') {
      // In React Strict Mode, effects run twice. Only initiate auth check once.
      if (authCheckInitiated.current) {
        return;
      }
      authCheckInitiated.current = true;
      checkAuth();
    } else {
      setLoading(false);
    }
  }, []);

  const checkAuth = async () => {
    // Add timeout to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    
    try {
      const response = await fetch('/api/auth/verify', {
        signal: controller.signal
      });
      
      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        console.error('Auth check timed out');
      } else {
        console.error('Auth check failed:', error);
      }
      setUser(null);
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  const login = async (username, apiKey) => {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, apiKey }),
      });

      const data = await response.json();

      if (response.ok) {
        setUser(data.user);
        return { success: true };
      } else {
        return { success: false, error: data.error };
      }
    } catch (error) {
      console.error('Login failed:', error);
      return { success: false, error: 'Login failed' };
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setUser(null);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const value = {
    user,
    loading,
    login,
    logout,
    isAuthenticated: !!user,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
