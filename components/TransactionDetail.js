/**
 * TransactionDetail - Full-screen page showing transaction details
 * Styled like other submenus (Export Options, Wallets, etc.)
 * Inspired by blink-mobile transaction detail screen
 */

import { useState } from 'react';

// Helper to determine transaction type from settlementVia
const getTransactionType = (settlementVia) => {
  if (!settlementVia || !settlementVia.__typename) {
    return 'Unknown';
  }
  
  switch (settlementVia.__typename) {
    case 'SettlementViaOnChain':
      return 'OnChain';
    case 'SettlementViaLn':
      return 'Lightning';
    case 'SettlementViaIntraLedger':
      return 'IntraLedger';
    default:
      return 'Unknown';
  }
};

// Copy to clipboard with feedback
const copyToClipboard = async (text, label, setToast) => {
  try {
    await navigator.clipboard.writeText(text);
    setToast(`${label} copied to clipboard`);
    setTimeout(() => setToast(null), 2000);
  } catch (err) {
    console.error('Failed to copy:', err);
  }
};

// Detail Row Component
const DetailRow = ({ label, value, copyable = false, onCopy, externalLink, darkMode }) => {
  if (!value || value === '-') return null;
  
  const isLongValue = typeof value === 'string' && value.length > 50;
  
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1">
        <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          {label}
        </span>
        <div className="flex items-center gap-2">
          {externalLink && (
            <button
              onClick={() => window.open(externalLink, '_blank')}
              className={`p-1.5 rounded-md transition-colors ${
                darkMode 
                  ? 'text-amber-400 hover:bg-gray-700' 
                  : 'text-amber-600 hover:bg-gray-100'
              }`}
              title="Open in external viewer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </button>
          )}
          {copyable && onCopy && (
            <button
              onClick={() => onCopy(value, label)}
              className={`p-1.5 rounded-md transition-colors ${
                darkMode 
                  ? 'text-amber-400 hover:bg-gray-700' 
                  : 'text-amber-600 hover:bg-gray-100'
              }`}
              title={`Copy ${label}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
          )}
        </div>
      </div>
      <div className={`p-3 rounded-lg ${darkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
        <span className={`text-sm font-medium break-all ${
          darkMode ? 'text-white' : 'text-gray-900'
        } ${isLongValue ? 'text-xs' : ''}`}>
          {value}
        </span>
      </div>
    </div>
  );
};

export default function TransactionDetail({ transaction, onClose, darkMode = false }) {
  const [toast, setToast] = useState(null);
  
  if (!transaction) return null;
  
  const {
    id,
    direction,
    status,
    amount,
    currency,
    settlementCurrency,
    settlementAmount,
    settlementFee,
    date,
    createdAt,
    memo,
    initiationVia,
    settlementVia
  } = transaction;
  
  const isReceive = direction === 'RECEIVE';
  const txType = getTransactionType(settlementVia);
  
  // Get counterparty info
  const getCounterparty = () => {
    if (settlementVia?.__typename === 'SettlementViaIntraLedger') {
      return settlementVia.counterPartyUsername || 'Blink User';
    }
    if (initiationVia?.__typename === 'InitiationViaIntraLedger') {
      return initiationVia.counterPartyUsername || 'Blink User';
    }
    return null;
  };
  
  // Get payment hash
  const getPaymentHash = () => {
    if (initiationVia?.__typename === 'InitiationViaLn') {
      return initiationVia.paymentHash;
    }
    return null;
  };
  
  // Get preimage
  const getPreimage = () => {
    if (settlementVia?.__typename === 'SettlementViaLn' || 
        settlementVia?.__typename === 'SettlementViaIntraLedger') {
      return settlementVia.preImage;
    }
    return null;
  };
  
  // Get on-chain transaction hash
  const getOnChainHash = () => {
    if (settlementVia?.__typename === 'SettlementViaOnChain') {
      return settlementVia.transactionHash;
    }
    return null;
  };
  
  // Get on-chain address
  const getOnChainAddress = () => {
    if (initiationVia?.__typename === 'InitiationViaOnChain') {
      return initiationVia.address;
    }
    return null;
  };
  
  const handleCopy = (text, label) => {
    copyToClipboard(text, label, setToast);
  };
  
  // Format fee
  const formatFee = () => {
    if (settlementFee === undefined || settlementFee === null) return null;
    if (settlementCurrency === 'BTC') {
      return `${Math.abs(settlementFee).toLocaleString()} sats`;
    } else if (settlementCurrency === 'USD') {
      return `$${(Math.abs(settlementFee) / 100).toFixed(2)}`;
    }
    return `${Math.abs(settlementFee)} ${settlementCurrency}`;
  };
  
  const counterparty = getCounterparty();
  const paymentHash = getPaymentHash();
  const preimage = getPreimage();
  const onChainHash = getOnChainHash();
  const onChainAddress = getOnChainAddress();
  const fee = formatFee();
  
  return (
    <div className={`fixed inset-0 z-50 overflow-y-auto ${darkMode ? 'bg-black' : 'bg-white'}`}>
      <div className="min-h-screen">
        {/* Header - Sticky */}
        <div className={`sticky top-0 z-10 shadow ${darkMode ? 'bg-blink-dark shadow-black' : 'bg-gray-50'}`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <button
                onClick={onClose}
                className={`flex items-center transition-colors ${
                  darkMode 
                    ? 'text-white hover:text-blink-accent' 
                    : 'text-gray-700 hover:text-blink-accent'
                }`}
              >
                <span className="text-2xl mr-2">‹</span>
                <span className="text-lg">Back</span>
              </button>
              <h1 
                className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}
                style={{fontFamily: "'Source Sans Pro', sans-serif"}}
              >
                Transaction Details
              </h1>
              <div className="w-16"></div>
            </div>
          </div>
        </div>

        {/* Amount Header Section */}
        <div className={`py-8 px-4 ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
          <div className="max-w-md mx-auto text-center">
            {/* Direction Icon */}
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
              isReceive 
                ? darkMode ? 'bg-green-900/30' : 'bg-green-100'
                : darkMode ? 'bg-red-900/30' : 'bg-red-100'
            }`}>
              <svg 
                className={`w-8 h-8 ${isReceive ? 'text-green-500' : 'text-red-500'}`} 
                fill="currentColor" 
                viewBox="0 0 24 24"
              >
                <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
              </svg>
            </div>
            
            {/* Direction Text */}
            <p className={`text-lg font-medium mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              {isReceive ? 'You received' : 'You sent'}
            </p>
            
            {/* Amount */}
            <p className={`text-4xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {amount}
            </p>
            
            {/* Status Badge */}
            <div className="mt-4">
              <span className={`inline-flex px-4 py-1.5 rounded-full text-sm font-medium ${
                status === 'SUCCESS' || status === 'SETTLED'
                  ? darkMode ? 'bg-green-900/30 text-green-400' : 'bg-green-100 text-green-800'
                  : status === 'PENDING'
                    ? darkMode ? 'bg-yellow-900/30 text-yellow-400' : 'bg-yellow-100 text-yellow-800'
                    : darkMode ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-800'
              }`}>
                {status}
              </span>
            </div>
          </div>
        </div>

        {/* Transaction Details */}
        <div className="max-w-md mx-auto px-4 py-6">
          {/* Account/Wallet */}
          <DetailRow
            label={isReceive ? 'Receiving Account' : 'Sending Account'}
            value={
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded text-xs font-bold ${
                  settlementCurrency === 'BTC' 
                    ? 'bg-amber-500 text-black' 
                    : 'bg-green-500 text-white'
                }`}>
                  {settlementCurrency || 'BTC'}
                </span>
                <span>{settlementCurrency === 'BTC' ? 'BTC Account' : 'USD Account'}</span>
              </div>
            }
            darkMode={darkMode}
          />
          
          {/* Date */}
          <DetailRow
            label="Date"
            value={date}
            darkMode={darkMode}
          />
          
          {/* Fee (only for sent transactions) */}
          {!isReceive && fee && (
            <DetailRow
              label="Fee"
              value={fee}
              darkMode={darkMode}
            />
          )}
          
          {/* Description/Memo */}
          <DetailRow
            label="Description"
            value={memo}
            copyable={true}
            onCopy={handleCopy}
            darkMode={darkMode}
          />
          
          {/* Paid to/from */}
          {counterparty && (
            <DetailRow
              label={isReceive ? 'Paid from' : 'Paid to'}
              value={counterparty}
              darkMode={darkMode}
            />
          )}
          
          {/* Type */}
          <DetailRow
            label="Type"
            value={txType}
            darkMode={darkMode}
          />
          
          {/* On-Chain Transaction Hash */}
          {onChainHash && (
            <DetailRow
              label="Transaction Hash"
              value={onChainHash}
              copyable={true}
              onCopy={handleCopy}
              externalLink={`https://mempool.space/tx/${onChainHash}`}
              darkMode={darkMode}
            />
          )}
          
          {/* On-Chain Address */}
          {onChainAddress && (
            <DetailRow
              label="Address"
              value={onChainAddress}
              copyable={true}
              onCopy={handleCopy}
              externalLink={`https://mempool.space/address/${onChainAddress}`}
              darkMode={darkMode}
            />
          )}
          
          {/* Payment Hash (Lightning) */}
          {paymentHash && (
            <DetailRow
              label="Hash"
              value={paymentHash}
              copyable={true}
              onCopy={handleCopy}
              darkMode={darkMode}
            />
          )}
          
          {/* Preimage / Proof of Payment */}
          {preimage && (
            <DetailRow
              label="Preimage / Proof of Payment"
              value={preimage}
              copyable={true}
              onCopy={handleCopy}
              darkMode={darkMode}
            />
          )}
          
          {/* Blink Internal ID */}
          <DetailRow
            label="Blink Internal Id"
            value={id}
            copyable={true}
            onCopy={handleCopy}
            darkMode={darkMode}
          />
        </div>
        
        {/* Toast Notification */}
        {toast && (
          <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 px-4 py-2 bg-green-600 text-white rounded-lg shadow-lg text-sm font-medium z-50">
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
