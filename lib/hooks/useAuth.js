import { useState, useEffect, createContext, useContext } from 'react';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);

  // Check authentication status on mount
  useEffect(() => {
    // Only run on client side
    if (typeof window !== 'undefined') {
      setLoading(true);
      checkAuth();
    }
  }, []);

  const checkAuth = async () => {
    console.log('checkAuth: Starting authentication check...');
    
    // Add timeout to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    
    try {
      console.log('checkAuth: Fetching /api/auth/verify...');
      const response = await fetch('/api/auth/verify', {
        signal: controller.signal
      });
      console.log('checkAuth: Response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('checkAuth: Auth successful, setting user:', data.user);
        setUser(data.user);
      } else {
        console.log('checkAuth: Auth failed, clearing user');
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
      console.log('checkAuth: Setting loading to false');
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
