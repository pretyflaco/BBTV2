/**
 * SessionEstablishmentModal - Shows progress while establishing server session
 * 
 * This modal is shown after extension sign-in when:
 * - User is locally authenticated (isAuthenticated: true)
 * - But server session is not yet established (hasServerSession: false)
 * 
 * It prevents the "partial sign-in" race condition where Dashboard renders
 * and fetches data before the NIP-98 server session cookie is set, causing 401 errors.
 * 
 * Features:
 * - 3-step progress indicator (Connected → Signing → Loading data)
 * - Timeout handling (~10s) with error state
 * - Retry button on failure
 * - Auto-completes when hasServerSession becomes true
 */

import { useState, useEffect, useRef } from 'react';
import ProgressStepper from './ProgressStepper';

// Session establishment timeout (10 seconds)
const SESSION_TIMEOUT = 10000;

/**
 * @param {Object} props
 * @param {boolean} props.hasServerSession - Whether server session is established
 * @param {Function} props.onRetry - Called when user clicks retry
 * @param {Function} props.onCancel - Called when user cancels (signs out)
 * @param {string} props.signInMethod - Method used to sign in ('extension', 'externalSigner')
 */
export default function SessionEstablishmentModal({
  hasServerSession,
  onRetry,
  onCancel,
  signInMethod = 'extension'
}) {
  // Stage: 'connected' | 'signing' | 'syncing' | 'complete' | 'error'
  const [stage, setStage] = useState('connected');
  const [errorMessage, setErrorMessage] = useState('');
  const timeoutRef = useRef(null);
  const startTimeRef = useRef(Date.now());

  // Define stages based on sign-in method
  const stages = [
    { 
      id: 'connected', 
      label: signInMethod === 'extension' 
        ? 'Connected to extension' 
        : 'Connected to signer'
    },
    { id: 'signing', label: 'Signing authentication' },
    { id: 'syncing', label: 'Loading your data' },
  ];

  // Progress through stages over time to give visual feedback
  useEffect(() => {
    if (stage === 'connected') {
      // Move to signing after a brief moment
      const timer = setTimeout(() => {
        if (!hasServerSession) {
          setStage('signing');
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [stage, hasServerSession]);

  // Set up timeout
  useEffect(() => {
    startTimeRef.current = Date.now();
    
    timeoutRef.current = setTimeout(() => {
      if (!hasServerSession) {
        console.log('[SessionEstablishmentModal] Timeout - session not established');
        setStage('error');
        setErrorMessage('Session establishment timed out. The server may be slow or there was a signing issue.');
      }
    }, SESSION_TIMEOUT);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [hasServerSession]);

  // Watch for session establishment
  useEffect(() => {
    if (hasServerSession && stage !== 'complete') {
      console.log('[SessionEstablishmentModal] Session established!');
      // Clear timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      // Show syncing briefly, then complete
      setStage('syncing');
      setTimeout(() => {
        setStage('complete');
      }, 500);
    }
  }, [hasServerSession, stage]);

  const handleRetry = () => {
    console.log('[SessionEstablishmentModal] Retry clicked');
    setStage('connected');
    setErrorMessage('');
    startTimeRef.current = Date.now();
    onRetry?.();
  };

  const handleCancel = () => {
    console.log('[SessionEstablishmentModal] Cancel clicked');
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    onCancel?.();
  };

  // Don't render if complete (parent should hide modal)
  if (stage === 'complete') {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-sm w-full shadow-xl overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 text-center border-b border-gray-100 dark:border-gray-800">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {stage === 'error' ? 'Connection Issue' : 'Completing Sign-in...'}
          </h3>
          {stage !== 'error' && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Establishing secure session
            </p>
          )}
        </div>

        {/* Content */}
        <div className="px-6 py-5">
          {stage !== 'error' ? (
            <>
              <ProgressStepper 
                stages={stages}
                currentStage={stage} 
                errorStage={null} 
                waitingForApproval={false} 
              />
              
              {/* Helpful tip during signing */}
              {stage === 'signing' && (
                <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <p className="text-sm text-blue-700 dark:text-blue-400">
                    {signInMethod === 'extension' 
                      ? 'Your browser extension is signing the authentication request...'
                      : 'Your signer app is signing the authentication request...'
                    }
                  </p>
                </div>
              )}
            </>
          ) : (
            /* Error View */
            <div className="py-4 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              
              <p className="text-gray-700 dark:text-gray-300 mb-2">
                {errorMessage}
              </p>
              
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                This can happen if:
              </p>
              <ul className="text-sm text-gray-500 dark:text-gray-400 text-left list-disc list-inside mb-4 space-y-1">
                <li>The signing request was rejected</li>
                <li>Your extension didn't respond in time</li>
                <li>There's a network connectivity issue</li>
              </ul>
              
              <div className="flex gap-3 mt-6">
                <button
                  onClick={handleRetry}
                  className="flex-1 py-3 px-4 text-base font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition-colors"
                >
                  Try Again
                </button>
                <button
                  onClick={handleCancel}
                  className="flex-1 py-3 px-4 text-base font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition-colors"
                >
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
