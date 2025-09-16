import { useAuth } from '../lib/hooks/useAuth';
import LoginForm from '../components/LoginForm';
import Dashboard from '../components/Dashboard';

export default function Home() {
  const { user, loading } = useAuth();

  console.log('Home render - loading:', loading, 'user:', user);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blink-orange mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading authentication...</p>
          <p className="mt-2 text-sm text-gray-400">This should only show for a few seconds</p>
        </div>
      </div>
    );
  }

  return user ? <Dashboard /> : <LoginForm />;
}
