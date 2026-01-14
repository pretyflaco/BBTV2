/**
 * TransactionDetail - Full-screen page showing transaction details
 * Styled like other submenus (Export Options, Wallets, etc.)
 * Inspired by blink-mobile transaction detail screen
 */

import { useState, useEffect } from 'react';

// Predefined label options with colors
const TRANSACTION_LABELS = [
  { id: 'none', name: 'No Label', color: 'gray', bgLight: 'bg-gray-100', bgDark: 'bg-gray-800', textLight: 'text-gray-600', textDark: 'text-gray-400', borderLight: 'border-gray-300', borderDark: 'border-gray-600' },
  { id: 'personal', name: 'Personal', color: 'blue', bgLight: 'bg-blue-100', bgDark: 'bg-blue-900/30', textLight: 'text-blue-700', textDark: 'text-blue-300', borderLight: 'border-blue-400', borderDark: 'border-blue-500' },
  { id: 'business', name: 'Business', color: 'purple', bgLight: 'bg-purple-100', bgDark: 'bg-purple-900/30', textLight: 'text-purple-700', textDark: 'text-purple-300', borderLight: 'border-purple-400', borderDark: 'border-purple-500' },
  { id: 'refund', name: 'Refund', color: 'orange', bgLight: 'bg-orange-100', bgDark: 'bg-orange-900/30', textLight: 'text-orange-700', textDark: 'text-orange-300', borderLight: 'border-orange-400', borderDark: 'border-orange-500' },
  { id: 'subscription', name: 'Subscription', color: 'cyan', bgLight: 'bg-cyan-100', bgDark: 'bg-cyan-900/30', textLight: 'text-cyan-700', textDark: 'text-cyan-300', borderLight: 'border-cyan-400', borderDark: 'border-cyan-500' },
  { id: 'salary', name: 'Salary/Income', color: 'green', bgLight: 'bg-green-100', bgDark: 'bg-green-900/30', textLight: 'text-green-700', textDark: 'text-green-300', borderLight: 'border-green-400', borderDark: 'border-green-500' },
  { id: 'expense', name: 'Expense', color: 'red', bgLight: 'bg-red-100', bgDark: 'bg-red-900/30', textLight: 'text-red-700', textDark: 'text-red-300', borderLight: 'border-red-400', borderDark: 'border-red-500' },
  { id: 'gift', name: 'Gift', color: 'pink', bgLight: 'bg-pink-100', bgDark: 'bg-pink-900/30', textLight: 'text-pink-700', textDark: 'text-pink-300', borderLight: 'border-pink-400', borderDark: 'border-pink-500' },
  { id: 'savings', name: 'Savings', color: 'amber', bgLight: 'bg-amber-100', bgDark: 'bg-amber-900/30', textLight: 'text-amber-700', textDark: 'text-amber-300', borderLight: 'border-amber-400', borderDark: 'border-amber-500' },
];

// Storage key for transaction labels (localStorage cache)
const TX_LABELS_STORAGE_KEY = 'blinkpos_tx_labels';

// In-memory cache for labels (populated from server/localStorage)
let labelsCache = null;

// Load labels from localStorage (cache)
const loadLocalLabels = () => {
  try {
    const stored = localStorage.getItem(TX_LABELS_STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (err) {
    console.error('Failed to load transaction labels from localStorage:', err);
    return {};
  }
};

// Save labels to localStorage (cache)
const saveLocalLabels = (labels) => {
  try {
    localStorage.setItem(TX_LABELS_STORAGE_KEY, JSON.stringify(labels));
    labelsCache = labels;
  } catch (err) {
    console.error('Failed to save transaction labels to localStorage:', err);
  }
};

// Load labels from server
const loadServerLabels = async () => {
  try {
    const response = await fetch('/api/user/sync');
    if (response.ok) {
      const data = await response.json();
      if (data.transactionLabels) {
        // Merge server labels with local (server takes precedence for conflicts)
        const localLabels = loadLocalLabels();
        const mergedLabels = { ...localLabels, ...data.transactionLabels };
        saveLocalLabels(mergedLabels);
        return mergedLabels;
      }
    }
  } catch (err) {
    console.error('Failed to load transaction labels from server:', err);
  }
  return loadLocalLabels();
};

// Save labels to server
const saveServerLabels = async (labels) => {
  try {
    const response = await fetch('/api/user/sync', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        field: 'transactionLabels',
        data: labels
      })
    });
    if (!response.ok) {
      console.error('Failed to sync transaction labels to server');
    }
  } catch (err) {
    console.error('Failed to save transaction labels to server:', err);
  }
};

// Get all labels (from cache or load)
export const getAllTransactionLabels = () => {
  if (labelsCache === null) {
    labelsCache = loadLocalLabels();
  }
  return labelsCache;
};

// Get label for a specific transaction
export const getTransactionLabel = (txId) => {
  const labels = getAllTransactionLabels();
  const labelId = labels[txId];
  return TRANSACTION_LABELS.find(l => l.id === labelId) || TRANSACTION_LABELS[0];
};

// Initialize labels from server (call on app mount)
export const initTransactionLabels = async () => {
  labelsCache = await loadServerLabels();
  return labelsCache;
};

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

// Label Selector Component
const LabelSelector = ({ currentLabel, onSelectLabel, darkMode, isSyncing }) => {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1">
        <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          Label
        </span>
        {isSyncing && (
          <span className="text-xs text-blue-500 dark:text-blue-400 flex items-center gap-1">
            <div className="animate-spin rounded-full h-3 w-3 border border-blue-500 border-t-transparent"></div>
            Syncing...
          </span>
        )}
      </div>
      
      {/* Current Label / Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full p-3 rounded-lg border-2 transition-colors flex items-center justify-between ${
          darkMode 
            ? `${currentLabel.bgDark} ${currentLabel.borderDark}` 
            : `${currentLabel.bgLight} ${currentLabel.borderLight}`
        }`}
      >
        <div className="flex items-center gap-2">
          {/* Color dot */}
          <div className={`w-3 h-3 rounded-full`} style={{
            backgroundColor: currentLabel.color === 'gray' ? '#6b7280' : currentLabel.color === 'blue' ? '#3b82f6' : currentLabel.color === 'purple' ? '#a855f7' : currentLabel.color === 'orange' ? '#f97316' : currentLabel.color === 'cyan' ? '#06b6d4' : currentLabel.color === 'green' ? '#22c55e' : currentLabel.color === 'red' ? '#ef4444' : currentLabel.color === 'pink' ? '#ec4899' : currentLabel.color === 'amber' ? '#f59e0b' : '#6b7280'
          }}></div>
          <span className={`text-sm font-medium ${darkMode ? currentLabel.textDark : currentLabel.textLight}`}>
            {currentLabel.name}
          </span>
        </div>
        <svg 
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''} ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      
      {/* Dropdown Options */}
      {isOpen && (
        <div className={`mt-2 rounded-lg border overflow-hidden ${
          darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        }`}>
          {TRANSACTION_LABELS.map((label) => (
            <button
              key={label.id}
              onClick={() => {
                onSelectLabel(label);
                setIsOpen(false);
              }}
              className={`w-full px-4 py-3 flex items-center gap-3 transition-colors ${
                currentLabel.id === label.id
                  ? darkMode ? 'bg-gray-700' : 'bg-gray-100'
                  : darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'
              }`}
            >
              {/* Color indicator */}
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center`} style={{
                borderColor: label.color === 'gray' ? '#6b7280' : label.color === 'blue' ? '#3b82f6' : label.color === 'purple' ? '#a855f7' : label.color === 'orange' ? '#f97316' : label.color === 'cyan' ? '#06b6d4' : label.color === 'green' ? '#22c55e' : label.color === 'red' ? '#ef4444' : label.color === 'pink' ? '#ec4899' : label.color === 'amber' ? '#f59e0b' : '#6b7280',
                backgroundColor: label.id !== 'none' ? (label.color === 'gray' ? '#6b728020' : label.color === 'blue' ? '#3b82f620' : label.color === 'purple' ? '#a855f720' : label.color === 'orange' ? '#f9731620' : label.color === 'cyan' ? '#06b6d420' : label.color === 'green' ? '#22c55e20' : label.color === 'red' ? '#ef444420' : label.color === 'pink' ? '#ec489920' : label.color === 'amber' ? '#f59e0b20' : '#6b728020') : 'transparent'
              }}>
                {currentLabel.id === label.id && (
                  <svg className="w-2.5 h-2.5" style={{ color: label.color === 'gray' ? '#6b7280' : label.color === 'blue' ? '#3b82f6' : label.color === 'purple' ? '#a855f7' : label.color === 'orange' ? '#f97316' : label.color === 'cyan' ? '#06b6d4' : label.color === 'green' ? '#22c55e' : label.color === 'red' ? '#ef4444' : label.color === 'pink' ? '#ec4899' : label.color === 'amber' ? '#f59e0b' : '#6b7280' }} fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
              <span className={`text-sm font-medium ${darkMode ? label.textDark : label.textLight}`}>
                {label.name}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default function TransactionDetail({ transaction, onClose, darkMode = false, onLabelChange }) {
  const [toast, setToast] = useState(null);
  const [currentLabel, setCurrentLabel] = useState(TRANSACTION_LABELS[0]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  
  // Load label for this transaction on mount
  useEffect(() => {
    if (transaction?.id) {
      const label = getTransactionLabel(transaction.id);
      setCurrentLabel(label);
    }
  }, [transaction?.id]);
  
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
    settlementDisplayAmount,
    settlementDisplayCurrency,
    date,
    createdAt,
    memo,
    initiationVia,
    settlementVia
  } = transaction;
  
  const isReceive = direction === 'RECEIVE';
  const txType = getTransactionType(settlementVia);
  
  // Format display amount (fiat) - primary amount shown large
  const formatDisplayAmount = () => {
    if (settlementDisplayAmount !== undefined && settlementDisplayCurrency) {
      // settlementDisplayAmount is already in major units (e.g., 10.50 for $10.50)
      const sign = isReceive ? '+' : '-';
      const absAmount = Math.abs(settlementDisplayAmount);
      
      // Format with currency symbol
      if (settlementDisplayCurrency === 'USD') {
        return `${sign}$${absAmount.toFixed(2)}`;
      }
      // For other currencies, use locale formatting
      try {
        const formatted = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: settlementDisplayCurrency,
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }).format(absAmount);
        return `${sign}${formatted}`;
      } catch {
        return `${sign}${absAmount.toFixed(2)} ${settlementDisplayCurrency}`;
      }
    }
    // Fallback to the pre-formatted amount
    return amount;
  };
  
  // Format settlement amount (sats/USD) - secondary amount shown smaller
  const formatSettlementAmount = () => {
    if (settlementAmount === undefined) return null;
    const absAmount = Math.abs(settlementAmount);
    
    if (settlementCurrency === 'BTC') {
      return `${absAmount.toLocaleString()} sats`;
    } else if (settlementCurrency === 'USD') {
      // settlementAmount is in cents
      return `$${(absAmount / 100).toFixed(2)} USD`;
    }
    return `${absAmount.toLocaleString()} ${settlementCurrency}`;
  };
  
  // Determine if we should show secondary amount (when display currency differs from settlement)
  const shouldShowSecondaryAmount = () => {
    if (!settlementDisplayCurrency || !settlementCurrency) return false;
    // Always show sats as secondary for BTC wallet transactions
    if (settlementCurrency === 'BTC') return true;
    // Show secondary if currencies are different
    return settlementDisplayCurrency !== settlementCurrency;
  };
  
  const primaryAmount = formatDisplayAmount();
  const secondaryAmount = shouldShowSecondaryAmount() ? formatSettlementAmount() : null;
  
  // Handle label selection
  const handleSelectLabel = async (label) => {
    setCurrentLabel(label);
    setIsSyncing(true);
    
    // Update local cache
    const labels = getAllTransactionLabels();
    if (label.id === 'none') {
      delete labels[id];
    } else {
      labels[id] = label.id;
    }
    
    // Save to localStorage immediately
    saveLocalLabels(labels);
    
    // Show confirmation toast
    setToast(label.id === 'none' ? 'Label removed' : `Labeled as "${label.name}"`);
    setTimeout(() => setToast(null), 2000);
    
    // Notify parent if callback provided
    if (onLabelChange) {
      onLabelChange(id, label);
    }
    
    // Sync to server in background
    await saveServerLabels(labels);
    setIsSyncing(false);
  };
  
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
  
  // Generate and download PDF receipt
  const handleDownloadReceipt = async () => {
    setIsGeneratingPdf(true);
    setToast('Generating PDF receipt...');
    
    try {
      const response = await fetch('/api/transaction/receipt-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to generate PDF');
      }
      
      const { pdf, transactionId } = await response.json();
      
      // Convert base64 to blob
      const byteCharacters = atob(pdf);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/pdf' });
      
      // Create download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `blink-receipt-${transactionId.slice(0, 8)}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      setToast('Receipt downloaded!');
      setTimeout(() => setToast(null), 2000);
    } catch (error) {
      console.error('Failed to generate receipt:', error);
      setToast('Failed to generate receipt');
      setTimeout(() => setToast(null), 3000);
    } finally {
      setIsGeneratingPdf(false);
    }
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
            {/* Label Badge - Show above amount if labeled */}
            {currentLabel.id !== 'none' && (
              <div className="mb-3">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
                  darkMode ? currentLabel.bgDark : currentLabel.bgLight
                } ${darkMode ? currentLabel.textDark : currentLabel.textLight}`}>
                  <div className={`w-2 h-2 rounded-full`} style={{
                    backgroundColor: currentLabel.color === 'blue' ? '#3b82f6' : currentLabel.color === 'purple' ? '#a855f7' : currentLabel.color === 'orange' ? '#f97316' : currentLabel.color === 'cyan' ? '#06b6d4' : currentLabel.color === 'green' ? '#22c55e' : currentLabel.color === 'red' ? '#ef4444' : currentLabel.color === 'pink' ? '#ec4899' : currentLabel.color === 'amber' ? '#f59e0b' : '#6b7280'
                  }}></div>
                  {currentLabel.name}
                </span>
              </div>
            )}
            
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
            
            {/* Primary Amount (Fiat) */}
            <p className={`text-4xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {primaryAmount}
            </p>
            
            {/* Secondary Amount (Sats) */}
            {secondaryAmount && (
              <p className={`text-lg mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                {secondaryAmount}
              </p>
            )}
            
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
          {/* Label Selector */}
          <LabelSelector
            currentLabel={currentLabel}
            onSelectLabel={handleSelectLabel}
            darkMode={darkMode}
            isSyncing={isSyncing}
          />
          
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
          
          {/* PDF Receipt Button */}
          <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={handleDownloadReceipt}
              disabled={isGeneratingPdf}
              className={`w-full flex items-center justify-center gap-3 px-4 py-3 rounded-lg font-medium transition-all ${
                isGeneratingPdf
                  ? 'bg-gray-300 dark:bg-gray-700 cursor-not-allowed'
                  : darkMode
                    ? 'bg-amber-500 hover:bg-amber-600 text-black'
                    : 'bg-amber-500 hover:bg-amber-600 text-white'
              }`}
            >
              {isGeneratingPdf ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span>Download PDF Receipt</span>
                </>
              )}
            </button>
            <p className={`text-xs text-center mt-2 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
              Generate a PDF receipt to share as proof of payment
            </p>
          </div>
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
