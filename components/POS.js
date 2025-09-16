import { useState, useEffect } from 'react';
import QRCode from 'react-qr-code';

const POS = ({ apiKey, user, displayCurrency, wallets }) => {
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedWallet, setSelectedWallet] = useState(null);

  // Set default wallet when wallets are loaded
  useEffect(() => {
    if (wallets && wallets.length > 0 && !selectedWallet) {
      // Default to BTC wallet, fallback to first wallet
      const btcWallet = wallets.find(w => w.walletCurrency === 'BTC');
      setSelectedWallet(btcWallet || wallets[0]);
    }
  }, [wallets, selectedWallet]);

  const formatDisplayAmount = (value, currency) => {
    if (!value) return '';
    
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return '';

    if (currency === 'BTC') {
      return `${numValue.toLocaleString()} sats`;
    } else if (currency === 'USD') {
      return `$${numValue.toFixed(2)}`;
    }
    return `${numValue} ${currency}`;
  };

  const handleDigitPress = (digit) => {
    if (amount === '0' && digit !== '.') {
      setAmount(digit);
    } else if (digit === '.' && amount.includes('.')) {
      // Don't add multiple decimal points
      return;
    } else if (displayCurrency === 'USD' && amount.includes('.') && amount.split('.')[1].length >= 2) {
      // Don't allow more than 2 decimal places for USD
      return;
    } else {
      setAmount(amount + digit);
    }
  };

  const handleBackspace = () => {
    setAmount(amount.slice(0, -1));
  };

  const handleClear = () => {
    setAmount('');
    setMemo('');
    setInvoice(null);
    setError('');
  };

  const createInvoice = async () => {
    if (!amount || !selectedWallet) {
      setError('Please enter an amount and select a wallet');
      return;
    }

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/blink/create-invoice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: numericAmount,
          currency: displayCurrency === 'BTC' ? 'BTC' : 'USD',
          memo: memo.trim(),
          walletId: selectedWallet.id
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create invoice');
      }

      if (data.success && data.invoice) {
        setInvoice(data.invoice);
      } else {
        throw new Error('Invalid response from server');
      }

    } catch (err) {
      console.error('Invoice creation error:', err);
      setError(err.message || 'Failed to create invoice');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      // You could add a toast notification here
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  if (invoice) {
    return (
      <div className="h-full flex flex-col bg-white">
        {/* Header */}
        <div className="bg-blink-orange text-white p-4 flex items-center justify-between">
          <button
            onClick={handleClear}
            className="text-white hover:text-gray-200 flex items-center"
          >
            <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
            New Payment
          </button>
          <h2 className="text-xl font-bold">Payment Request</h2>
          <div className="w-8"></div>
        </div>

        {/* Invoice Display */}
        <div className="flex-1 p-6 flex flex-col items-center justify-center space-y-6">
          {/* Amount */}
          <div className="text-center">
            <div className="text-3xl font-bold text-gray-800">
              {formatDisplayAmount(invoice.amount, invoice.currency)}
            </div>
            {invoice.memo && (
              <div className="text-gray-600 mt-2">{invoice.memo}</div>
            )}
          </div>

          {/* QR Code */}
          <div className="bg-white p-4 rounded-lg shadow-lg border-2 border-gray-200">
            <QRCode 
              value={invoice.paymentRequest} 
              size={256}
              bgColor="#ffffff"
              fgColor="#000000"
            />
          </div>

          {/* Payment Request */}
          <div className="w-full max-w-md">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Lightning Invoice
            </label>
            <div className="flex">
              <input
                type="text"
                value={invoice.paymentRequest}
                readOnly
                className="flex-1 px-3 py-2 border border-gray-300 rounded-l-md bg-gray-50 text-sm font-mono"
              />
              <button
                onClick={() => copyToClipboard(invoice.paymentRequest)}
                className="px-4 py-2 bg-blue-500 text-white rounded-r-md hover:bg-blue-600 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
          </div>

          {/* Instructions */}
          <div className="text-center text-gray-600 text-sm max-w-md">
            <p>Scan the QR code with a Lightning wallet or copy the invoice to complete the payment.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="bg-blink-orange text-white p-4">
        <h2 className="text-xl font-bold text-center">Point of Sale</h2>
        <p className="text-center text-orange-100 text-sm mt-1">
          Create Lightning invoices for customers
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 mx-4 mt-4 rounded">
          {error}
        </div>
      )}

      {/* Amount Display */}
      <div className="p-6">
        <div className="text-center mb-6">
          <div className="text-4xl font-bold text-gray-800 mb-2">
            {amount ? formatDisplayAmount(amount, displayCurrency) : formatDisplayAmount('0', displayCurrency)}
          </div>
          <div className="text-gray-600">
            Receiving to: {selectedWallet?.walletCurrency || 'No wallet'} wallet
          </div>
        </div>

        {/* Memo Input */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Memo (optional)
          </label>
          <input
            type="text"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="Description for this payment..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blink-orange focus:border-transparent"
            maxLength={100}
          />
        </div>
      </div>

      {/* Numpad */}
      <div className="flex-1 px-6 pb-6">
        <div className="grid grid-cols-3 gap-4 max-w-sm mx-auto">
          {/* Row 1 */}
          <button
            onClick={() => handleDigitPress('1')}
            className="aspect-square bg-gray-100 hover:bg-gray-200 rounded-lg text-2xl font-semibold transition-colors"
          >
            1
          </button>
          <button
            onClick={() => handleDigitPress('2')}
            className="aspect-square bg-gray-100 hover:bg-gray-200 rounded-lg text-2xl font-semibold transition-colors"
          >
            2
          </button>
          <button
            onClick={() => handleDigitPress('3')}
            className="aspect-square bg-gray-100 hover:bg-gray-200 rounded-lg text-2xl font-semibold transition-colors"
          >
            3
          </button>

          {/* Row 2 */}
          <button
            onClick={() => handleDigitPress('4')}
            className="aspect-square bg-gray-100 hover:bg-gray-200 rounded-lg text-2xl font-semibold transition-colors"
          >
            4
          </button>
          <button
            onClick={() => handleDigitPress('5')}
            className="aspect-square bg-gray-100 hover:bg-gray-200 rounded-lg text-2xl font-semibold transition-colors"
          >
            5
          </button>
          <button
            onClick={() => handleDigitPress('6')}
            className="aspect-square bg-gray-100 hover:bg-gray-200 rounded-lg text-2xl font-semibold transition-colors"
          >
            6
          </button>

          {/* Row 3 */}
          <button
            onClick={() => handleDigitPress('7')}
            className="aspect-square bg-gray-100 hover:bg-gray-200 rounded-lg text-2xl font-semibold transition-colors"
          >
            7
          </button>
          <button
            onClick={() => handleDigitPress('8')}
            className="aspect-square bg-gray-100 hover:bg-gray-200 rounded-lg text-2xl font-semibold transition-colors"
          >
            8
          </button>
          <button
            onClick={() => handleDigitPress('9')}
            className="aspect-square bg-gray-100 hover:bg-gray-200 rounded-lg text-2xl font-semibold transition-colors"
          >
            9
          </button>

          {/* Row 4 */}
          {displayCurrency === 'USD' && (
            <button
              onClick={() => handleDigitPress('.')}
              className="aspect-square bg-gray-100 hover:bg-gray-200 rounded-lg text-2xl font-semibold transition-colors"
            >
              .
            </button>
          )}
          {displayCurrency === 'BTC' && <div></div>}
          
          <button
            onClick={() => handleDigitPress('0')}
            className="aspect-square bg-gray-100 hover:bg-gray-200 rounded-lg text-2xl font-semibold transition-colors"
          >
            0
          </button>
          <button
            onClick={handleBackspace}
            className="aspect-square bg-gray-100 hover:bg-gray-200 rounded-lg text-xl font-semibold transition-colors flex items-center justify-center"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 001.414.586H19a2 2 0 002-2V7a2 2 0 00-2-2h-8.172a2 2 0 00-1.414.586L3 12z" />
            </svg>
          </button>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 space-y-4 max-w-sm mx-auto">
          <button
            onClick={createInvoice}
            disabled={!amount || loading}
            className="w-full bg-blink-orange hover:bg-orange-600 disabled:bg-gray-300 text-white font-bold py-4 rounded-lg transition-colors text-lg"
          >
            {loading ? 'Creating Invoice...' : 'Create Invoice'}
          </button>
          
          <button
            onClick={handleClear}
            className="w-full bg-gray-500 hover:bg-gray-600 text-white font-bold py-3 rounded-lg transition-colors"
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  );
};

export default POS;
