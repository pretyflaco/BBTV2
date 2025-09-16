import { useState, useEffect } from 'react';
import QRCode from 'react-qr-code';

const POS = ({ apiKey, user, displayCurrency, wallets }) => {
  const [amount, setAmount] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedWallet, setSelectedWallet] = useState(null);

  // Set default wallet when wallets are loaded
  useEffect(() => {
    console.log('Wallets changed:', wallets);
    if (wallets && wallets.length > 0) {
      // Always use BTC wallet for POS
      const btcWallet = wallets.find(w => w.walletCurrency === 'BTC');
      if (btcWallet && !selectedWallet) {
        setSelectedWallet(btcWallet);
        console.log('Selected BTC wallet:', btcWallet);
      } else if (!btcWallet) {
        console.error('No BTC wallet found in:', wallets);
        setError('No BTC wallet available for invoice generation');
      }
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
    setQuantity(1);
    setInvoice(null);
    setError('');
  };

  const handlePlusPress = () => {
    setQuantity(prev => prev + 1);
  };

  const createInvoice = async () => {
    if (!amount) {
      setError('Please enter an amount');
      return;
    }

    if (!selectedWallet) {
      setError('No BTC wallet available. Please try refreshing.');
      return;
    }

    if (!apiKey) {
      setError('No API key available. Please log in again.');
      return;
    }

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    const totalAmount = numericAmount * quantity;

    setLoading(true);
    setError('');

    try {
      console.log('Creating invoice with:', {
        amount: totalAmount,
        originalAmount: numericAmount,
        quantity: quantity,
        currency: 'BTC', // Always BTC for simplicity
        walletId: selectedWallet.id,
        hasApiKey: !!apiKey
      });

      const response = await fetch('/api/blink/create-invoice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: totalAmount,
          currency: 'BTC', // Always create BTC invoices
          memo: quantity > 1 ? `${quantity}x ${numericAmount} sats` : '', // Show quantity in memo if multiple
          walletId: selectedWallet.id,
          apiKey: apiKey // Pass user's API key
        }),
      });

      const data = await response.json();

      console.log('Invoice response:', data);

      if (!response.ok) {
        throw new Error(data.error || `Server error: ${response.status}`);
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
      {/* Compact Header */}
      <div className="bg-blink-orange text-white p-3">
        <h2 className="text-lg font-bold text-center">Point of Sale</h2>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-3 py-2 mx-3 mt-3 rounded text-sm">
          {error}
        </div>
      )}

      {/* Compact Amount Display */}
      <div className="p-4">
        <div className="text-center mb-4">
          <div className="text-3xl font-bold text-gray-800 mb-1">
            {amount ? (
              quantity > 1 ? (
                <div>
                  <span className="text-lg text-gray-600">{quantity}x </span>
                  {amount} sats = <span className="text-blink-orange">{amount * quantity} sats</span>
                </div>
              ) : (
                `${amount} sats`
              )
            ) : '0 sats'}
          </div>
          <div className="text-sm text-gray-600">
            {quantity > 1 && <div className="mb-1">Quantity: {quantity} items</div>}
            {!apiKey ? '⚠ No API key' : 
             !selectedWallet?.id ? '⚠ Loading wallet...' : 
             '✓ BTC wallet ready'}
          </div>
        </div>

      </div>

      {/* Compact Numpad */}
      <div className="flex-1 px-4 pb-4">
        <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto">
          {/* Row 1 */}
          <button
            onClick={() => handleDigitPress('1')}
            className="h-12 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-xl font-bold transition-colors shadow-md"
          >
            1
          </button>
          <button
            onClick={() => handleDigitPress('2')}
            className="h-12 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-xl font-bold transition-colors shadow-md"
          >
            2
          </button>
          <button
            onClick={() => handleDigitPress('3')}
            className="h-12 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-xl font-bold transition-colors shadow-md"
          >
            3
          </button>

          {/* Row 2 */}
          <button
            onClick={() => handleDigitPress('4')}
            className="h-12 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-xl font-bold transition-colors shadow-md"
          >
            4
          </button>
          <button
            onClick={() => handleDigitPress('5')}
            className="h-12 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-xl font-bold transition-colors shadow-md"
          >
            5
          </button>
          <button
            onClick={() => handleDigitPress('6')}
            className="h-12 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-xl font-bold transition-colors shadow-md"
          >
            6
          </button>

          {/* Row 3 */}
          <button
            onClick={() => handleDigitPress('7')}
            className="h-12 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-xl font-bold transition-colors shadow-md"
          >
            7
          </button>
          <button
            onClick={() => handleDigitPress('8')}
            className="h-12 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-xl font-bold transition-colors shadow-md"
          >
            8
          </button>
          <button
            onClick={() => handleDigitPress('9')}
            className="h-12 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-xl font-bold transition-colors shadow-md"
          >
            9
          </button>

          {/* Row 4 */}
          <button
            onClick={handlePlusPress}
            className="h-12 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xl font-bold transition-colors shadow-md flex items-center justify-center"
          >
            +
          </button>
          <button
            onClick={() => handleDigitPress('0')}
            className="h-12 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-xl font-bold transition-colors shadow-md"
          >
            0
          </button>
          <button
            onClick={handleBackspace}
            className="h-12 bg-red-600 hover:bg-red-700 text-white rounded-lg text-lg font-bold transition-colors flex items-center justify-center shadow-md"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 001.414.586H19a2 2 0 002-2V7a2 2 0 00-2-2h-8.172a2 2 0 00-1.414.586L3 12z" />
            </svg>
          </button>
        </div>

        {/* Compact Action Buttons */}
        <div className="mt-4 space-y-3 max-w-xs mx-auto">
          <button
            onClick={createInvoice}
            disabled={!amount || loading || !selectedWallet || !apiKey}
            className="w-full bg-blink-orange hover:bg-orange-600 disabled:bg-gray-300 text-white font-bold py-3 rounded-lg transition-colors"
          >
            {loading ? 'Creating...' : 'Create Invoice'}
          </button>
          
          <button
            onClick={handleClear}
            className="w-full bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 rounded-lg transition-colors text-sm"
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  );
};

export default POS;
