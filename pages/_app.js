import '../public/css/globals.css';
import { AuthProvider } from '../lib/hooks/useAuth';

function MyApp({ Component, pageProps }) {
  return (
    <AuthProvider>
      <Component {...pageProps} />
    </AuthProvider>
  );
}

export default MyApp;
