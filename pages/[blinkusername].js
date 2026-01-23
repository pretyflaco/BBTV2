import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import QRCode from 'react-qr-code';

/**
 * Public POS Page - Pay any Blink user directly
 * 
 * URL: track.twentyone.ist/[blinkusername]
 * 
 * Features:
 * - No authentication required
 * - Creates invoices directly to user's Blink wallet
 * - Light mode default for public-facing POS
 * - NFC support for tap-to-pay
 * - Real-time payment detection
 */

// Validate username on server side
export async function getServerSideProps(context) {
  const { blinkusername } = context.params;
  
  // Basic username validation (alphanumeric, 3-30 chars)
  const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/;
  if (!usernameRegex.test(blinkusername)) {
    return { notFound: true };
  }

  // Check if user exists by querying Blink API
  try {
    const response = await fetch('https://api.blink.sv/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          query AccountDefaultWallet($username: Username!) {
            accountDefaultWallet(username: $username) {
              id
              walletCurrency
            }
          }
        `,
        variables: { username: blinkusername }
      })
    });

    const data = await response.json();
    
    if (data.errors || !data.data?.accountDefaultWallet?.id) {
      console.log(`[PublicPOS] User not found: ${blinkusername}`);
      return { notFound: true };
    }

    return {
      props: {
        username: blinkusername,
        walletCurrency: data.data.accountDefaultWallet.walletCurrency || 'BTC'
      }
    };
  } catch (error) {
    console.error('[PublicPOS] Error validating username:', error);
    return { notFound: true };
  }
}

// Numpad component
function Numpad({ onInput, onDelete, onClear }) {
  const buttons = [
    '1', '2', '3',
    '4', '5', '6',
    '7', '8', '9',
    'C', '0', '⌫'
  ];

  return (
    <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto">
      {buttons.map((btn) => (
        <button
          key={btn}
          onClick={() => {
            if (btn === 'C') onClear();
            else if (btn === '⌫') onDelete();
            else onInput(btn);
          }}
          className={`
            py-4 text-2xl font-semibold rounded-lg transition-all
            ${btn === 'C' 
              ? 'bg-red-100 text-red-600 hover:bg-red-200 active:bg-red-300' 
              : btn === '⌫'
              ? 'bg-gray-100 text-gray-600 hover:bg-gray-200 active:bg-gray-300'
              : 'bg-gray-100 text-gray-800 hover:bg-gray-200 active:bg-gray-300'
            }
          `}
        >
          {btn}
        </button>
      ))}
    </div>
  );
}

// Payment status indicator
function PaymentStatus({ status, onReset }) {
  if (status === 'success') {
    return (
      <div className="text-center py-8">
        <div className="text-6xl mb-4">✅</div>
        <h2 className="text-2xl font-bold text-green-600 mb-2">Payment Received!</h2>
        <p className="text-gray-600 mb-6">Thank you for your payment</p>
        <button
          onClick={onReset}
          className="px-6 py-3 bg-blink-gradient text-white font-semibold rounded-lg hover:opacity-90 transition"
        >
          New Payment
        </button>
      </div>
    );
  }

  if (status === 'expired') {
    return (
      <div className="text-center py-8">
        <div className="text-6xl mb-4">⏰</div>
        <h2 className="text-2xl font-bold text-amber-600 mb-2">Invoice Expired</h2>
        <p className="text-gray-600 mb-6">Please create a new invoice</p>
        <button
          onClick={onReset}
          className="px-6 py-3 bg-blink-gradient text-white font-semibold rounded-lg hover:opacity-90 transition"
        >
          Try Again
        </button>
      </div>
    );
  }

  return null;
}

export default function PublicPOS({ username, walletCurrency }) {
  const [amount, setAmount] = useState('0');
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [paymentStatus, setPaymentStatus] = useState(null); // null | 'pending' | 'success' | 'expired'
  const [copied, setCopied] = useState(false);
  const [nfcSupported, setNfcSupported] = useState(false);

  // Check NFC support
  useEffect(() => {
    if ('NDEFReader' in window) {
      setNfcSupported(true);
    }
  }, []);

  // Format amount for display
  const displayAmount = parseInt(amount, 10).toLocaleString();

  // Handle numpad input
  const handleInput = useCallback((digit) => {
    setAmount((prev) => {
      const newAmount = prev === '0' ? digit : prev + digit;
      // Limit to 8 digits (99,999,999 sats max)
      return newAmount.length <= 8 ? newAmount : prev;
    });
  }, []);

  const handleDelete = useCallback(() => {
    setAmount((prev) => (prev.length > 1 ? prev.slice(0, -1) : '0'));
  }, []);

  const handleClear = useCallback(() => {
    setAmount('0');
  }, []);

  // Create invoice
  const createInvoice = useCallback(async () => {
    const satsAmount = parseInt(amount, 10);
    if (satsAmount < 1) {
      setError('Please enter an amount');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/blink/public-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          amount: satsAmount,
          memo: `Payment to ${username}`,
          walletCurrency
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create invoice');
      }

      setInvoice(data.invoice);
      setPaymentStatus('pending');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [amount, username, walletCurrency]);

  // Poll for payment status
  useEffect(() => {
    if (!invoice?.paymentHash || paymentStatus !== 'pending') return;

    let cancelled = false;
    let pollCount = 0;
    const maxPolls = 180; // 15 minutes at 5 second intervals

    const pollPayment = async () => {
      if (cancelled || pollCount >= maxPolls) {
        if (pollCount >= maxPolls) {
          setPaymentStatus('expired');
        }
        return;
      }

      try {
        // Query Blink API directly for payment status (public query)
        const response = await fetch('https://api.blink.sv/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `
              query LnInvoicePaymentStatus($input: LnInvoicePaymentStatusInput!) {
                lnInvoicePaymentStatus(input: $input) {
                  status
                }
              }
            `,
            variables: {
              input: { paymentRequest: invoice.paymentRequest }
            }
          })
        });

        const data = await response.json();
        const status = data.data?.lnInvoicePaymentStatus?.status;

        if (status === 'PAID') {
          setPaymentStatus('success');
          return;
        }
      } catch (err) {
        console.warn('Payment poll error:', err);
      }

      pollCount++;
      if (!cancelled) {
        setTimeout(pollPayment, 5000); // Poll every 5 seconds
      }
    };

    // Start polling after a short delay
    const initialDelay = setTimeout(pollPayment, 2000);

    return () => {
      cancelled = true;
      clearTimeout(initialDelay);
    };
  }, [invoice, paymentStatus]);

  // Copy invoice to clipboard
  const copyInvoice = useCallback(async () => {
    if (!invoice?.paymentRequest) return;
    
    try {
      await navigator.clipboard.writeText(invoice.paymentRequest);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  }, [invoice]);

  // Open in wallet (lightning: URI)
  const openInWallet = useCallback(() => {
    if (!invoice?.paymentRequest) return;
    window.location.href = `lightning:${invoice.paymentRequest}`;
  }, [invoice]);

  // Reset to amount entry
  const resetPayment = useCallback(() => {
    setInvoice(null);
    setPaymentStatus(null);
    setAmount('0');
    setError(null);
  }, []);

  // Handle NFC tap
  const handleNfcTap = useCallback(async () => {
    if (!invoice?.paymentRequest || !nfcSupported) return;

    try {
      const ndef = new NDEFReader();
      await ndef.write({
        records: [
          { recordType: 'url', data: `lightning:${invoice.paymentRequest}` }
        ]
      });
      console.log('NFC write successful');
    } catch (err) {
      console.error('NFC error:', err);
    }
  }, [invoice, nfcSupported]);

  return (
    <>
      <Head>
        <title>Pay {username} | Blink</title>
        <meta name="description" content={`Pay ${username} with Bitcoin Lightning`} />
        <meta name="theme-color" content="#ffffff" />
        <link rel="icon" href="/icons/blink-dark-192x192.svg" />
        <link rel="apple-touch-icon" href="/icons/blink-dark-192x192.svg" />
      </Head>

      <div className="min-h-screen bg-white flex flex-col">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-4 py-3">
          <div className="max-w-md mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img 
                src="/icons/blink-dark-192x192.svg" 
                alt="Blink" 
                className="w-8 h-8"
              />
              <span className="font-semibold text-gray-800">Blink</span>
            </div>
            <div className="text-sm text-gray-500">
              Pay <span className="font-semibold text-gray-800">{username}</span>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 flex flex-col justify-center px-4 py-6">
          <div className="max-w-md mx-auto w-full">
            
            {/* Payment Success/Expired */}
            {(paymentStatus === 'success' || paymentStatus === 'expired') && (
              <PaymentStatus status={paymentStatus} onReset={resetPayment} />
            )}

            {/* Invoice Display */}
            {invoice && paymentStatus === 'pending' && (
              <div className="text-center">
                {/* QR Code */}
                <div className="bg-white p-4 rounded-xl shadow-lg inline-block mb-4">
                  <QRCode
                    value={invoice.paymentRequest}
                    size={220}
                    level="M"
                  />
                </div>

                {/* Amount */}
                <p className="text-2xl font-bold text-gray-800 mb-1">
                  {parseInt(amount, 10).toLocaleString()} sats
                </p>
                <p className="text-sm text-gray-500 mb-4">
                  Waiting for payment...
                </p>

                {/* Action Buttons */}
                <div className="flex gap-2 justify-center mb-4">
                  <button
                    onClick={copyInvoice}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition text-sm font-medium"
                  >
                    {copied ? '✓ Copied' : '📋 Copy'}
                  </button>
                  <button
                    onClick={openInWallet}
                    className="px-4 py-2 bg-blink-gradient text-white rounded-lg hover:opacity-90 transition text-sm font-medium"
                  >
                    ⚡ Open Wallet
                  </button>
                </div>

                {/* NFC Button */}
                {nfcSupported && (
                  <button
                    onClick={handleNfcTap}
                    className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition text-sm font-medium"
                  >
                    📱 Tap to Pay (NFC)
                  </button>
                )}

                {/* Cancel */}
                <button
                  onClick={resetPayment}
                  className="mt-4 text-sm text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Amount Entry */}
            {!invoice && paymentStatus !== 'success' && paymentStatus !== 'expired' && (
              <>
                {/* Amount Display */}
                <div className="text-center mb-8">
                  <p className="text-5xl font-bold text-gray-800 mb-2">
                    {displayAmount}
                  </p>
                  <p className="text-gray-500">sats</p>
                </div>

                {/* Error */}
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-center text-sm">
                    {error}
                  </div>
                )}

                {/* Numpad */}
                <Numpad
                  onInput={handleInput}
                  onDelete={handleDelete}
                  onClear={handleClear}
                />

                {/* Create Invoice Button */}
                <div className="mt-6">
                  <button
                    onClick={createInvoice}
                    disabled={loading || amount === '0'}
                    className={`
                      w-full py-4 rounded-lg font-semibold text-lg transition
                      ${loading || amount === '0'
                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        : 'bg-blink-gradient text-white hover:opacity-90'
                      }
                    `}
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Creating Invoice...
                      </span>
                    ) : (
                      'Create Invoice'
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t border-gray-200 px-4 py-3">
          <div className="max-w-md mx-auto text-center text-xs text-gray-400">
            Powered by{' '}
            <a 
              href="https://blink.sv" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blink-primary hover:underline"
            >
              Blink
            </a>
            {' '}• Lightning payments
          </div>
        </footer>
      </div>
    </>
  );
}
