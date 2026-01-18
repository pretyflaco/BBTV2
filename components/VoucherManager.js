import { useState, useEffect, useRef, forwardRef, useImperativeHandle, useCallback } from 'react';
import { formatDisplayAmount as formatCurrency } from '../lib/currency-utils';

const VoucherManager = forwardRef(({ 
  voucherWallet, 
  displayCurrency, 
  currencies, 
  darkMode, 
  toggleDarkMode, 
  soundEnabled,
  onInternalTransition
}, ref) => {
  const [vouchers, setVouchers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedVoucher, setSelectedVoucher] = useState(null);
  const [filter, setFilter] = useState('all'); // 'all', 'active', 'claimed'
  
  const pollingIntervalRef = useRef(null);

  // Expose methods for keyboard navigation
  useImperativeHandle(ref, () => ({
    getCurrentStep: () => 'list',
    hasValidAmount: () => false,
    handleDigitPress: () => {},
    handleBackspace: () => {},
    handleClear: () => fetchVouchers(),
    handleSubmit: () => {},
    isCommissionDialogOpen: () => false,
    handleCommissionDialogKey: () => {},
  }));

  // Fetch vouchers
  const fetchVouchers = useCallback(async () => {
    try {
      setError('');
      const response = await fetch('/api/voucher/list');
      const data = await response.json();
      
      if (data.success) {
        setVouchers(data.vouchers);
      } else {
        setError(data.error || 'Failed to load vouchers');
      }
    } catch (err) {
      console.error('Error fetching vouchers:', err);
      setError('Failed to load vouchers');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch and polling
  useEffect(() => {
    fetchVouchers();
    
    // Poll every 5 seconds for updates
    pollingIntervalRef.current = setInterval(fetchVouchers, 5000);
    
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [fetchVouchers]);

  // Format time remaining
  const formatTimeRemaining = (ms) => {
    if (!ms || ms <= 0) return 'Expired';
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Format date
  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  // Filter vouchers
  const filteredVouchers = vouchers.filter(v => {
    if (filter === 'active') return !v.claimed;
    if (filter === 'claimed') return v.claimed;
    return true;
  });

  // Stats
  const activeCount = vouchers.filter(v => !v.claimed).length;
  const claimedCount = vouchers.filter(v => v.claimed).length;
  const totalSats = vouchers.reduce((sum, v) => sum + v.amount, 0);
  const claimedSats = vouchers.filter(v => v.claimed).reduce((sum, v) => sum + v.amount, 0);

  // Render voucher detail modal
  const renderVoucherDetail = () => {
    if (!selectedVoucher) return null;
    
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl max-w-sm w-full p-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                {selectedVoucher.shortId}
              </div>
              <div className={`text-sm font-medium ${selectedVoucher.claimed ? 'text-green-600 dark:text-green-400' : 'text-purple-600 dark:text-purple-400'}`}>
                {selectedVoucher.claimed ? 'Claimed' : 'Active'}
              </div>
            </div>
            <button
              onClick={() => setSelectedVoucher(null)}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
            >
              <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <div className="space-y-3">
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Amount</div>
              <div className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                {selectedVoucher.amount.toLocaleString()} sats
              </div>
              {selectedVoucher.displayAmount && selectedVoucher.displayCurrency && (
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  {formatCurrency(selectedVoucher.displayAmount, selectedVoucher.displayCurrency)}
                </div>
              )}
            </div>
            
            {selectedVoucher.commissionPercent > 0 && (
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Commission</div>
                <div className="text-lg font-medium text-gray-900 dark:text-gray-100">
                  {selectedVoucher.commissionPercent}%
                </div>
              </div>
            )}
            
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Created</div>
              <div className="text-sm text-gray-900 dark:text-gray-100">
                {new Date(selectedVoucher.createdAt).toLocaleString()}
              </div>
            </div>
            
            {!selectedVoucher.claimed && selectedVoucher.timeRemaining && (
              <div className="bg-yellow-50 dark:bg-yellow-900/30 rounded-lg p-3">
                <div className="text-xs text-yellow-600 dark:text-yellow-400 mb-1">Time Remaining</div>
                <div className="text-lg font-medium text-yellow-700 dark:text-yellow-300">
                  {formatTimeRemaining(selectedVoucher.timeRemaining)}
                </div>
              </div>
            )}
            
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Voucher ID</div>
              <div className="text-xs text-gray-600 dark:text-gray-400 font-mono break-all">
                {selectedVoucher.id}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-black" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
      {/* Header Stats */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800">
        <div className="text-center mb-3">
          <div className="text-2xl font-semibold text-purple-600 dark:text-purple-400">
            Voucher Manager
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {vouchers.length} total voucher{vouchers.length !== 1 ? 's' : ''}
          </div>
        </div>
        
        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-2">
            <div className="text-lg font-semibold text-purple-600 dark:text-purple-400">{activeCount}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Active</div>
          </div>
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-2">
            <div className="text-lg font-semibold text-green-600 dark:text-green-400">{claimedCount}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Claimed</div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2">
            <div className="text-lg font-semibold text-gray-700 dark:text-gray-300">{claimedSats.toLocaleString()}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Sats Out</div>
          </div>
        </div>
      </div>
      
      {/* Filter Tabs */}
      <div className="px-4 py-2 flex gap-2 border-b border-gray-200 dark:border-gray-800">
        {[
          { id: 'all', label: 'All' },
          { id: 'active', label: 'Active' },
          { id: 'claimed', label: 'Claimed' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => {
              if (onInternalTransition) onInternalTransition();
              setFilter(tab.id);
            }}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === tab.id
                ? 'bg-purple-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
        
        {/* Refresh button */}
        <button
          onClick={() => {
            if (onInternalTransition) onInternalTransition();
            fetchVouchers();
          }}
          className="ml-auto p-1.5 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          <svg className={`w-4 h-4 text-gray-600 dark:text-gray-400 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>
      
      {/* Voucher List */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {error && (
          <div className="mb-3 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 px-3 py-2 rounded-lg text-sm">
            {error}
          </div>
        )}
        
        {loading && vouchers.length === 0 ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin w-8 h-8 border-3 border-purple-600 border-t-transparent rounded-full"></div>
          </div>
        ) : filteredVouchers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-500 dark:text-gray-400">
            <svg className="w-12 h-12 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
            </svg>
            <div className="text-sm">
              {filter === 'all' ? 'No vouchers yet' : `No ${filter} vouchers`}
            </div>
            <div className="text-xs mt-1">
              Create vouchers from the Voucher or Multi-Voucher screens
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredVouchers.map((voucher) => (
              <button
                key={voucher.id}
                onClick={() => {
                  if (onInternalTransition) onInternalTransition();
                  setSelectedVoucher(voucher);
                }}
                className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-left hover:border-purple-400 dark:hover:border-purple-500 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {/* Status indicator */}
                    <div className={`w-2 h-2 rounded-full ${voucher.claimed ? 'bg-green-500' : 'bg-purple-500 animate-pulse'}`}></div>
                    
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {voucher.amount.toLocaleString()} sats
                        </span>
                        {voucher.commissionPercent > 0 && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            +{voucher.commissionPercent}%
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                        {voucher.shortId}
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className={`text-sm font-medium ${voucher.claimed ? 'text-green-600 dark:text-green-400' : 'text-purple-600 dark:text-purple-400'}`}>
                      {voucher.claimed ? 'Claimed' : 'Active'}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {!voucher.claimed && voucher.timeRemaining 
                        ? formatTimeRemaining(voucher.timeRemaining)
                        : formatDate(voucher.createdAt)
                      }
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      
      {/* Voucher Detail Modal */}
      {renderVoucherDetail()}
    </div>
  );
});

VoucherManager.displayName = 'VoucherManager';
export default VoucherManager;
