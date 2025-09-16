import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../lib/hooks/useAuth';
import { useBlinkWebSocket } from '../lib/hooks/useBlinkWebSocket';
import PaymentAnimation from './PaymentAnimation';
import POS from './POS';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [apiKey, setApiKey] = useState(null);
  const [sideMenuOpen, setSideMenuOpen] = useState(false);
  const [expandedMonths, setExpandedMonths] = useState(new Set());
  const [monthlyTransactions, setMonthlyTransactions] = useState({});
  const [hasMoreTransactions, setHasMoreTransactions] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [currentView, setCurrentView] = useState('transactions'); // 'transactions' or 'pos'
  const [displayCurrency, setDisplayCurrency] = useState('USD'); // 'USD' or 'BTC'
  const [wallets, setWallets] = useState([]);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  
  // Get user's API key for direct WebSocket connection
  useEffect(() => {
    if (user) {
      // Get the API key from local storage or make an API call
      fetchApiKey();
    }
  }, [user]);

  const fetchApiKey = async () => {
    try {
      const response = await fetch('/api/auth/get-api-key');
      if (response.ok) {
        const data = await response.json();
        setApiKey(data.apiKey);
      }
    } catch (error) {
      console.error('Failed to get API key:', error);
    }
  };

  // Use direct Blink WebSocket connection (like the donation button)
  const { connected, lastPayment, showAnimation, hideAnimation } = useBlinkWebSocket(apiKey, user?.username);
  
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Ref for POS payment received callback
  const posPaymentReceivedRef = useRef(null);

  // Fetch initial data
  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  // Fetch wallets when API key becomes available
  useEffect(() => {
    if (apiKey) {
      fetchWallets();
    }
  }, [apiKey, fetchWallets]);

  // PWA Install prompt
  useEffect(() => {
    const handler = (e) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later
      setDeferredPrompt(e);
      setShowInstallPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // Refresh data when payment received and clear POS invoice
  useEffect(() => {
    if (lastPayment) {
      // Clear the POS invoice immediately when payment is received
      if (posPaymentReceivedRef.current) {
        posPaymentReceivedRef.current();
      }
      
      // Small delay to ensure transaction is processed
      setTimeout(() => {
        fetchData();
      }, 1000);
    }
  }, [lastPayment]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch transactions only (no balance for employee privacy)
      const transactionsRes = await fetch('/api/blink/transactions?first=100');

      if (transactionsRes.ok) {
        const transactionsData = await transactionsRes.json();
        
        setTransactions(transactionsData.transactions);
        setHasMoreTransactions(transactionsData.pageInfo?.hasNextPage || false);
        setError('');
        
        // If we have pagination info and more pages available, load more historical data
        if (transactionsData.pageInfo?.hasNextPage) {
          const finalHasMore = await loadMoreHistoricalTransactions(transactionsData.pageInfo.endCursor, transactionsData.transactions);
          setHasMoreTransactions(finalHasMore);
        }
      } else {
        throw new Error('Failed to fetch transactions');
      }
    } catch (err) {
      console.error('Fetch error:', err);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  // Fetch wallet information for POS
  const fetchWallets = useCallback(async () => {
    if (!apiKey) {
      console.log('No API key available yet, skipping wallet fetch');
      return;
    }

    try {
      const response = await fetch('/api/blink/wallets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ apiKey }),
      });

      if (response.ok) {
        const walletsData = await response.json();
        const walletsList = walletsData.wallets || [];
        setWallets(walletsList);
        
        // Debug log
        console.log('Fetched wallets:', walletsList);
      } else {
        console.error('Failed to fetch wallets:', response.status, response.statusText);
      }
    } catch (err) {
      console.error('Failed to fetch wallets:', err);
    }
  }, [apiKey]);

  // Load more historical transactions to populate older months
  const loadMoreHistoricalTransactions = async (cursor, currentTransactions) => {
    try {
      // Load several batches to get a good historical view
      let allTransactions = [...currentTransactions];
      let nextCursor = cursor;
      let hasMore = true;
      let batchCount = 0;
      const maxBatches = 5; // Load up to 5 more batches (500 more transactions)
      
      while (hasMore && batchCount < maxBatches) {
        const response = await fetch(`/api/blink/transactions?first=100&after=${nextCursor}`);
        
        if (response.ok) {
          const data = await response.json();
          allTransactions = [...allTransactions, ...data.transactions];
          
          hasMore = data.pageInfo?.hasNextPage;
          nextCursor = data.pageInfo?.endCursor;
          batchCount++;
          
          // Update transactions in real-time so user sees progress
          setTransactions([...allTransactions]);
        } else {
          break;
        }
      }
      
      console.log(`Loaded ${allTransactions.length} total transactions across ${batchCount + 1} batches`);
      return hasMore; // Return whether more transactions are available
    } catch (error) {
      console.error('Error loading historical transactions:', error);
      return false;
    }
  };

  // Load more months on demand
  const loadMoreMonths = async () => {
    if (loadingMore || !hasMoreTransactions) return;
    
    setLoadingMore(true);
    try {
      const lastTransaction = transactions[transactions.length - 1];
      const response = await fetch(`/api/blink/transactions?first=100&after=${lastTransaction?.cursor || ''}`);
      
      if (response.ok) {
        const data = await response.json();
        const newTransactions = data.transactions;
        
        if (newTransactions.length > 0) {
          setTransactions(prev => [...prev, ...newTransactions]);
          setHasMoreTransactions(data.pageInfo?.hasNextPage || false);
        } else {
          setHasMoreTransactions(false);
        }
      }
    } catch (error) {
      console.error('Error loading more months:', error);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleRefresh = () => {
    fetchData();
  };

  const handleLogout = () => {
    logout();
  };

  const handleInstallApp = async () => {
    if (deferredPrompt) {
      // Show the install prompt
      deferredPrompt.prompt();
      
      // Wait for the user to respond to the prompt
      const { outcome } = await deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        console.log('User accepted the install prompt');
      } else {
        console.log('User dismissed the install prompt');
      }
      
      // Clear the deferred prompt
      setDeferredPrompt(null);
      setShowInstallPrompt(false);
    }
  };

  // Handle touch events for swipe navigation
  const handleTouchStart = (e) => {
    touchStartX.current = e.targetTouches[0].clientX;
  };

  const handleTouchMove = (e) => {
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return;
    
    const distance = touchStartX.current - touchEndX.current;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;

    if (isLeftSwipe && currentView === 'transactions') {
      setCurrentView('pos');
    } else if (isRightSwipe && currentView === 'pos') {
      setCurrentView('transactions');
    }

    // Reset touch positions
    touchStartX.current = 0;
    touchEndX.current = 0;
  };

  // Group transactions by month
  const groupTransactionsByMonth = (transactions) => {
    const grouped = {};
    
    transactions.forEach(tx => {
      try {
        // Parse the date string more robustly
        let date;
        if (tx.date.includes(',')) {
          // Format like "Jan 15, 2024, 10:30 AM"
          date = new Date(tx.date);
        } else {
          // Try parsing as is
          date = new Date(tx.date);
        }
        
        // Validate the date
        if (isNaN(date.getTime())) {
          console.warn('Invalid date format:', tx.date);
          return;
        }
        
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const monthLabel = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
        
        if (!grouped[monthKey]) {
          grouped[monthKey] = {
            label: monthLabel,
            transactions: [],
            year: date.getFullYear(),
            month: date.getMonth()
          };
        }
        
        grouped[monthKey].transactions.push(tx);
      } catch (error) {
        console.error('Error processing transaction date:', tx.date, error);
      }
    });
    
    // Sort months by date (newest first)
    const sortedEntries = Object.entries(grouped).sort(([a], [b]) => b.localeCompare(a));
    
    return Object.fromEntries(sortedEntries);
  };

  // Get month groups from current transactions (excluding recent 5)
  const getMonthGroups = () => {
    const pastTransactions = transactions.slice(5); // Skip the 5 most recent
    return groupTransactionsByMonth(pastTransactions);
  };

  // Toggle month expansion and load more transactions if needed
  const toggleMonth = async (monthKey) => {
    const newExpanded = new Set(expandedMonths);
    
    if (newExpanded.has(monthKey)) {
      newExpanded.delete(monthKey);
    } else {
      newExpanded.add(monthKey);
      
      // If we don't have enough transactions for this month, load more
      const monthData = getMonthGroups()[monthKey];
      if (monthData && monthData.transactions.length < 20) {
        await loadMoreTransactionsForMonth(monthKey);
      }
    }
    
    setExpandedMonths(newExpanded);
  };

  // Load more transactions for a specific month
  const loadMoreTransactionsForMonth = async (monthKey) => {
    try {
      // If we already have enough transactions for most months, don't load more
      const monthGroups = getMonthGroups();
      const monthData = monthGroups[monthKey];
      
      if (monthData && monthData.transactions.length >= 10) {
        return; // Already have enough transactions for this month
      }
      
      // Load more transactions if we don't have enough historical data
      if (hasMoreTransactions) {
        await loadMoreMonths();
      }
    } catch (error) {
      console.error('Error loading more transactions for month:', error);
    }
  };

  if (loading && transactions.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blink-orange mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading transactions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Payment Animation Overlay */}
      <PaymentAnimation 
        show={showAnimation} 
        payment={lastPayment}
        onHide={hideAnimation}
      />

      {/* Mobile Header - Only Connection Status Visible */}
      <header className="bg-white shadow sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            {/* Connection Status */}
            <div className="flex items-center">
              <div className={`w-3 h-3 rounded-full mr-2 ${connected ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span className="text-sm text-gray-600">
                {connected ? 'Connected' : 'Disconnected'}
                {user?.username && (
                  <span className="ml-2 text-blink-orange font-medium">
                    @{user.username}
                  </span>
                )}
              </span>
            </div>
            
            {/* Menu Button */}
            <button
              onClick={() => setSideMenuOpen(!sideMenuOpen)}
              className="p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
              aria-label="Open menu"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Side Menu Overlay */}
      {sideMenuOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden" aria-labelledby="slide-over-title" role="dialog" aria-modal="true">
          <div className="absolute inset-0 overflow-hidden">
            {/* Background overlay */}
            <div 
              className="absolute inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
              onClick={() => setSideMenuOpen(false)}
            ></div>
            
            {/* Side menu panel */}
            <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
              <div className="pointer-events-auto relative w-screen max-w-md side-menu-panel">
                <div className="flex h-full flex-col overflow-y-scroll bg-white py-6 shadow-xl side-menu-slide-in">
                  <div className="px-4 sm:px-6">
                    <div className="flex items-start justify-between">
                      <h2 className="text-lg font-medium text-gray-900" id="slide-over-title">
                        Blink Balance Tracker V2
                      </h2>
                      <div className="ml-3 flex h-7 items-center">
                        <button
                          type="button"
                          className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                          onClick={() => setSideMenuOpen(false)}
                        >
                          <span className="sr-only">Close panel</span>
                          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="relative mt-6 flex-1 px-4 sm:px-6">
                    {/* Menu content */}
                    <div className="space-y-6">
                      {/* Welcome message */}
                      <div className="border-b border-gray-200 pb-4">
                        <p className="text-sm text-gray-500">Welcome, {user?.username}</p>
                      </div>
                      
                      {/* Currency Selection */}
                      <div className="border-b border-gray-200 pb-4">
                        <label className="block text-sm font-medium text-gray-900 mb-2">
                          Display Currency
                        </label>
                        <select
                          value={displayCurrency}
                          onChange={(e) => setDisplayCurrency(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blink-orange focus:border-transparent text-sm"
                        >
                          <option value="USD">USD - US Dollar</option>
                          <option value="BTC">BTC - Bitcoin (Satoshis)</option>
                          <option value="KES">KES - Kenyan Shilling</option>
                        </select>
                      </div>


                      {/* Connection Status (detailed) */}
                      <div className="border-b border-gray-200 pb-4">
                        <h3 className="text-sm font-medium text-gray-900 mb-2">Connection Status</h3>
                        <div className="flex items-center">
                          <div className={`w-3 h-3 rounded-full mr-2 ${connected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                          <span className="text-sm text-gray-600">
                            {connected ? 'Connected to Blink WebSocket' : 'Disconnected from Blink WebSocket'}
                            {user?.username && (
                              <div className="mt-1 text-blink-orange font-medium">
                                @{user.username}
                              </div>
                            )}
                          </span>
                        </div>
                      </div>
                      
                      {/* Action buttons */}
                      <div className="space-y-3">
                        {/* Install App Button */}
                        {showInstallPrompt && (
                          <button
                            onClick={() => {
                              handleInstallApp();
                              setSideMenuOpen(false);
                            }}
                            className="w-full bg-green-500 hover:bg-green-700 text-white font-bold py-3 px-4 rounded transition-colors mobile-button flex items-center justify-center"
                          >
                            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                            </svg>
                            Install App
                          </button>
                        )}
                        
                        <button
                          onClick={() => {
                            handleRefresh();
                            setSideMenuOpen(false);
                          }}
                          disabled={loading}
                          className="w-full bg-blue-500 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded disabled:opacity-50 transition-colors mobile-button"
                        >
                          {loading ? 'Refreshing...' : 'Refresh Data'}
                        </button>
                        
                        <button
                          onClick={() => {
                            handleLogout();
                            setSideMenuOpen(false);
                          }}
                          className="w-full bg-red-500 hover:bg-red-700 text-white font-bold py-3 px-4 rounded transition-colors mobile-button"
                        >
                          Logout
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <main 
        className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 mobile-content"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {error && (
          <div className="mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {/* View Switch */}
        <div className="flex justify-center mb-6">
          <div className="bg-gray-100 rounded-lg p-1 flex">
            <button
              onClick={() => setCurrentView('transactions')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                currentView === 'transactions'
                  ? 'bg-white text-blink-orange shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              📊 Transaction History
            </button>
            <button
              onClick={() => setCurrentView('pos')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                currentView === 'pos'
                  ? 'bg-white text-blink-orange shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              💰 Point of Sale
            </button>
          </div>
        </div>

        {/* Conditional Content Based on Current View */}
        {currentView === 'pos' ? (
          <POS 
            apiKey={apiKey}
            user={user}
            displayCurrency={displayCurrency}
            wallets={wallets}
            onPaymentReceived={posPaymentReceivedRef}
          />
        ) : (
          <>
            {/* Most Recent Transactions */}
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Most Recent Transactions</h2>
          <div className="bg-white shadow overflow-hidden sm:rounded-md">
            <ul className="divide-y divide-gray-200">
              {transactions.slice(0, 5).map((tx) => (
                <li key={tx.id} className="px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className={`flex-shrink-0 w-2 h-2 rounded-full mr-3 ${
                        tx.direction === 'RECEIVE' ? 'bg-green-500' : 'bg-red-500'
                      }`}></div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {tx.amount}
                        </p>
                        <p className="text-sm text-gray-500">{tx.memo}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-900">{tx.status}</p>
                      <p className="text-sm text-gray-500">{tx.date}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Past Transactions - Grouped by Month */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Past Transactions</h2>
          
          {(() => {
            const monthGroups = getMonthGroups();
            const monthKeys = Object.keys(monthGroups);
            
            if (monthKeys.length === 0) {
              return (
                <div className="bg-white shadow rounded-lg p-6 text-center text-gray-500">
                  No past transactions available
                </div>
              );
            }
            
            return (
              <div className="space-y-4">
                {monthKeys.map(monthKey => {
                  const monthData = monthGroups[monthKey];
                  const isExpanded = expandedMonths.has(monthKey);
                  const transactionCount = monthData.transactions.length;
                  
                  return (
                    <div key={monthKey} className="bg-white shadow rounded-lg overflow-hidden">
                      {/* Month Header - Clickable */}
                      <button
                        onClick={() => toggleMonth(monthKey)}
                        className="w-full px-6 py-4 text-left hover:bg-gray-50 focus:outline-none focus:bg-gray-50 transition-colors month-group-header"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-lg font-medium text-gray-900">
                              {monthData.label}
                            </h3>
                            <p className="text-sm text-gray-500">
                              {transactionCount} transaction{transactionCount !== 1 ? 's' : ''}
                            </p>
                          </div>
                          <div className="flex items-center">
                            <svg
                              className={`w-5 h-5 text-gray-400 transform transition-transform ${
                                isExpanded ? 'rotate-180' : ''
                              }`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </div>
                      </button>
                      
                      {/* Month Transactions - Expandable */}
                      {isExpanded && (
                        <div className="border-t border-gray-200 month-group-content">
                          {/* Mobile-friendly card layout for small screens */}
                          <div className="block sm:hidden">
                            <div className="p-4 space-y-3">
                              {monthData.transactions.map((tx) => (
                                <div key={tx.id} className="bg-gray-50 rounded-lg p-4 transaction-card-mobile">
                                  <div className="flex items-center justify-between mb-2">
                                    <span className={`text-lg font-medium ${
                                      tx.direction === 'RECEIVE' ? 'text-green-600' : 'text-red-600'
                                    }`}>
                                      {tx.amount}
                                    </span>
                                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                                      {tx.status}
                                    </span>
                                  </div>
                                  <div className="text-sm text-gray-900 mb-1">{tx.date}</div>
                                  {tx.memo && tx.memo !== '-' && (
                                    <div className="text-sm text-gray-500">{tx.memo}</div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Desktop table layout for larger screens */}
                          <div className="hidden sm:block">
                            <div className="overflow-x-auto">
                              <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                  <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                      Amount
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                      Status
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                      Date
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                      Memo
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                  {monthData.transactions.map((tx) => (
                                    <tr key={tx.id} className="hover:bg-gray-50">
                                      <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`text-sm font-medium ${
                                          tx.direction === 'RECEIVE' ? 'text-green-600' : 'text-red-600'
                                        }`}>
                                          {tx.amount}
                                        </span>
                                      </td>
                                      <td className="px-6 py-4 whitespace-nowrap">
                                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                                          {tx.status}
                                        </span>
                                      </td>
                                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        {tx.date}
                                      </td>
                                      <td className="px-6 py-4 text-sm text-gray-500">
                                        {tx.memo && tx.memo !== '-' ? tx.memo : '-'}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
          
          {/* Load More Months Button */}
          {hasMoreTransactions && (
            <div className="mt-6 text-center">
              <button
                onClick={loadMoreMonths}
                disabled={loadingMore}
                className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors mobile-button"
              >
                {loadingMore ? (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Loading More Months...
                  </div>
                ) : (
                  'Load More Months'
                )}
              </button>
              <p className="text-sm text-gray-500 mt-2">
                Load more historical transaction data
              </p>
            </div>
          )}
        </div>
          </>
        )}
      </main>
    </div>
  );
}
