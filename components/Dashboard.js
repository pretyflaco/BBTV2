import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../lib/hooks/useAuth';
import { useBlinkWebSocket } from '../lib/hooks/useBlinkWebSocket';
import { useBlinkPOSWebSocket } from '../lib/hooks/useBlinkPOSWebSocket';
import { useCurrencies } from '../lib/hooks/useCurrencies';
import { useDarkMode } from '../lib/hooks/useDarkMode';
import { useNFC } from './NFCPayment';
import PaymentAnimation from './PaymentAnimation';
import POS from './POS';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const { currencies, loading: currenciesLoading, getAllCurrencies } = useCurrencies();
  const { darkMode, toggleDarkMode } = useDarkMode();
  const [apiKey, setApiKey] = useState(null);
  const [sideMenuOpen, setSideMenuOpen] = useState(false);
  const [expandedMonths, setExpandedMonths] = useState(new Set());
  const [monthlyTransactions, setMonthlyTransactions] = useState({});
  const [hasMoreTransactions, setHasMoreTransactions] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pastTransactionsLoaded, setPastTransactionsLoaded] = useState(false);
  const [showExportOptions, setShowExportOptions] = useState(false);
  const [exportingData, setExportingData] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [currentView, setCurrentView] = useState('pos'); // 'transactions' or 'pos'
  const [displayCurrency, setDisplayCurrency] = useState('USD'); // 'USD' or 'BTC'
  const [wallets, setWallets] = useState([]);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    // Load sound preference from localStorage, default to true
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('soundEnabled');
      return saved !== null ? JSON.parse(saved) : true;
    }
    return true;
  }); // Sound effects on/off
  
  const [soundTheme, setSoundTheme] = useState(() => {
    // Load sound theme from localStorage, default to 'success'
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('soundTheme');
      return saved || 'success';
    }
    return 'success';
  });

  // Tip functionality state
  const [tipsEnabled, setTipsEnabled] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('blinkpos-tips-enabled') === 'true';
    }
    return false;
  });
  const [tipPresets, setTipPresets] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('blinkpos-tip-presets');
      return saved ? JSON.parse(saved) : [7.5, 10, 12.5, 20]; // Default tip percentages
    }
    return [7.5, 10, 12.5, 20];
  });
  const [tipRecipient, setTipRecipient] = useState('');
  const [usernameValidation, setUsernameValidation] = useState({ status: null, message: '', isValidating: false });
  const [showingInvoice, setShowingInvoice] = useState(false);
  const [showSoundThemes, setShowSoundThemes] = useState(false);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  
  // Save sound preference to localStorage when it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('soundEnabled', JSON.stringify(soundEnabled));
    }
  }, [soundEnabled]);
  
  // Save sound theme to localStorage when it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('soundTheme', soundTheme);
    }
  }, [soundTheme]);

  // Persist tip settings to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('blinkpos-tips-enabled', tipsEnabled.toString());
    }
  }, [tipsEnabled]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('blinkpos-tip-presets', JSON.stringify(tipPresets));
    }
  }, [tipPresets]);

  // Clear tip recipient when user changes (no persistence across sessions)
  useEffect(() => {
    setTipRecipient('');
    setUsernameValidation({ status: null, message: '', isValidating: false });
    // Also clear any existing localStorage value
    if (typeof window !== 'undefined') {
      localStorage.removeItem('blinkpos-tip-recipient');
    }
  }, [user?.username]);

  // Validate Blink username function
  const validateBlinkUsername = async (username) => {
    if (!username || username.trim() === '') {
      setUsernameValidation({ status: null, message: '', isValidating: false });
      return;
    }

    // Clean username input - strip @blink.sv if user enters full Lightning Address
    let cleanedUsername = username.trim();
    if (cleanedUsername.includes('@blink.sv')) {
      cleanedUsername = cleanedUsername.replace('@blink.sv', '').trim();
    }
    if (cleanedUsername.includes('@')) {
      cleanedUsername = cleanedUsername.split('@')[0].trim();
    }

    setUsernameValidation({ status: null, message: '', isValidating: true });

    const query = `
      query Query($username: Username!) {
        usernameAvailable(username: $username)
      }
    `;

    const variables = {
      username: cleanedUsername
    };

    try {
      const response = await fetch('https://api.blink.sv/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: query,
          variables: variables
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.errors) {
        const errorMessage = data.errors[0].message;
        if (errorMessage.includes('Invalid value for Username')) {
          setUsernameValidation({ 
            status: 'error', 
            message: 'Invalid username format', 
            isValidating: false 
          });
          return;
        }
        throw new Error(errorMessage);
      }

      // usernameAvailable: true means username does NOT exist
      // usernameAvailable: false means username DOES exist
      const usernameExists = !data.data.usernameAvailable;

      if (usernameExists) {
        setUsernameValidation({ 
          status: 'success', 
          message: 'Blink username found', 
          isValidating: false 
        });
      } else {
        setUsernameValidation({ 
          status: 'error', 
          message: 'This Blink username does not exist yet', 
          isValidating: false 
        });
      }

    } catch (error) {
      console.error('Error checking username:', error);
      setUsernameValidation({ 
        status: 'error', 
        message: 'Error checking username. Please try again.', 
        isValidating: false 
      });
    }
  };

  // Debounced username validation
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      validateBlinkUsername(tipRecipient);
    }, 500); // 500ms delay

    return () => clearTimeout(timeoutId);
  }, [tipRecipient]);

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

  // Use direct Blink WebSocket connection for user account (balance updates)
  // NOTE: Only needed for non-POS payments. Currently disabled for POS-only mode.
  // To enable: pass apiKey and user?.username instead of null
  const { connected, lastPayment, showAnimation, hideAnimation, triggerPaymentAnimation, manualReconnect, reconnectAttempts } = useBlinkWebSocket(null, null);
  
  // Setup BlinkPOS WebSocket for real-time payment detection and forwarding
  // LAZY-LOADED: Connection only established when POS invoice is created
  const userBtcWallet = wallets.find(w => w.walletCurrency === 'BTC');
  const { 
    connected: blinkposConnected, 
    connect: blinkposConnect, 
    disconnect: blinkposDisconnect,
    manualReconnect: blinkposReconnect, 
    reconnectAttempts: blinkposReconnectAttempts 
  } = useBlinkPOSWebSocket(
    apiKey, 
    userBtcWallet?.id, 
    (forwardedPayment) => {
      console.log('🎉 Payment forwarded from BlinkPOS to user account:', forwardedPayment);
      
      // Trigger payment animation immediately when payment is forwarded
      triggerPaymentAnimation({
        amount: forwardedPayment.amount,
        currency: forwardedPayment.currency || 'BTC',
        memo: forwardedPayment.memo || `BlinkPOS: ${forwardedPayment.amount} sats`,
        isForwarded: true
      });
      
      // Note: Sound is played by PaymentAnimation component, not here
      
      // Clear POS invoice
      if (posPaymentReceivedRef.current) {
        posPaymentReceivedRef.current();
      }
      
      // Disconnect WebSocket after payment received
      console.log('💤 Disconnecting BlinkPOS WebSocket after payment received');
      blinkposDisconnect();
      
      // Refresh data to show the forwarded payment
      fetchData();
    }
  );

  // Track current invoice for NFC payments
  const [currentInvoice, setCurrentInvoice] = useState(null);
  
  // Setup NFC for Boltcard payments
  const nfcState = useNFC({
    paymentRequest: currentInvoice,
    onPaymentSuccess: () => {
      console.log('🎉 NFC Boltcard payment successful');
      // Payment will be picked up by BlinkPOS WebSocket
    },
    onPaymentError: (error) => {
      console.error('NFC payment error:', error);
    },
    soundEnabled,
    soundTheme,
  });
  
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false); // ✅ Changed: Start as not loading
  const [error, setError] = useState('');

  // Ref for POS payment received callback
  const posPaymentReceivedRef = useRef(null);

  // Set display currency from user preference (removed immediate fetchData)
  useEffect(() => {
    if (user) {
      // ✅ REMOVED: fetchData() - transactions now load ONLY when user clicks "Transactions" tab
      
      // Set display currency from user preference
      if (user.preferredCurrency) {
        console.log(`Setting display currency to user preference: ${user.preferredCurrency}`);
        setDisplayCurrency(user.preferredCurrency);
      }
    }
  }, [user]);

  // Refresh transaction data when switching to transaction history view
  useEffect(() => {
    if (currentView === 'transactions' && user) {
      console.log('Switching to transaction history - refreshing data...');
      fetchData();
    }
  }, [currentView]);

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
      
      // ✅ ADDED: Fetch with 10 second timeout to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      try {
      // Fetch transactions only (no balance for employee privacy)
        const transactionsRes = await fetch('/api/blink/transactions?first=100', {
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);

      if (transactionsRes.ok) {
        const transactionsData = await transactionsRes.json();
        
        setTransactions(transactionsData.transactions);
        setHasMoreTransactions(transactionsData.pageInfo?.hasNextPage || false);
        setError('');
        
        // Don't automatically load past transactions - user must click "Show" button
        // This saves bandwidth and respects user's data plan
      } else {
        throw new Error('Failed to fetch transactions');
        }
      } catch (fetchErr) {
        clearTimeout(timeoutId);
        if (fetchErr.name === 'AbortError') {
          throw new Error('Transaction loading timed out. Please try again.');
        }
        throw fetchErr;
      }
    } catch (err) {
      console.error('Fetch error:', err);
      setError(err.message || 'Failed to load data');
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

  // Load past transactions (initial load of historical data)
  const loadPastTransactions = async () => {
    if (loadingMore || !hasMoreTransactions) return;
    
    setLoadingMore(true);
    try {
      // Get the last transaction from current transactions
      const lastTransaction = transactions[transactions.length - 1];
      
      if (lastTransaction?.cursor) {
        // Load historical transactions (same logic as before, but triggered by user)
        const finalHasMore = await loadMoreHistoricalTransactions(lastTransaction.cursor, transactions);
        setHasMoreTransactions(finalHasMore);
        setPastTransactionsLoaded(true);
      }
    } catch (error) {
      console.error('Error loading past transactions:', error);
    } finally {
      setLoadingMore(false);
    }
  };

  // Load more months on demand (after initial past transactions are loaded)
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

  // Export all transactions to CSV
  const exportFullTransactions = async () => {
    setExportingData(true);
    try {
      console.log('Starting full transaction export...');
      
      // Fetch ALL transactions by paginating through all pages
      let allTransactions = [];
      let hasMore = true;
      let cursor = null;
      let pageCount = 0;
      
      while (hasMore) {
        pageCount++;
        const url = cursor 
          ? `/api/blink/transactions?first=100&after=${cursor}`
          : '/api/blink/transactions?first=100';
        
        console.log(`Fetching page ${pageCount}, cursor: ${cursor ? cursor.substring(0, 20) + '...' : 'none'}`);
        
        const response = await fetch(url);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('API response error:', response.status, errorText);
          throw new Error(`API returned ${response.status}: ${errorText.substring(0, 200)}`);
        }
        
        const data = await response.json();
        console.log(`Received ${data.transactions?.length || 0} transactions`);
        
        if (!data.transactions || !Array.isArray(data.transactions)) {
          console.error('Invalid data structure:', data);
          throw new Error('Invalid transaction data received from API');
        }
        
        allTransactions = [...allTransactions, ...data.transactions];
        hasMore = data.pageInfo?.hasNextPage || false;
        cursor = data.pageInfo?.endCursor;
        
        console.log(`Total so far: ${allTransactions.length}, hasMore: ${hasMore}`);
      }
      
      console.log(`Fetched ${allTransactions.length} total transactions across ${pageCount} pages`);
      
      // Convert transactions to CSV format
      console.log('Converting to CSV...');
      console.log('Sample transaction:', allTransactions[0]);
      const csv = convertTransactionsToCSV(allTransactions);
      console.log(`CSV generated, length: ${csv.length} characters`);
      
      // Generate filename with date and username
      const date = new Date();
      const dateStr = date.getFullYear() + 
                      String(date.getMonth() + 1).padStart(2, '0') + 
                      String(date.getDate()).padStart(2, '0');
      const username = user?.username || 'user';
      const filename = `${dateStr}-${username}-transactions-FULL-blink.csv`;
      
      // Trigger download
      downloadCSV(csv, filename);
      
      setShowExportOptions(false);
    } catch (error) {
      console.error('Error exporting transactions:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      alert(`Failed to export transactions: ${error.message || 'Unknown error'}. Check console for details.`);
    } finally {
      setExportingData(false);
    }
  };

  // Export basic transactions to CSV (simplified format)
  const exportBasicTransactions = async () => {
    setExportingData(true);
    try {
      console.log('Starting basic transaction export...');
      
      // Fetch ALL transactions by paginating through all pages
      let allTransactions = [];
      let hasMore = true;
      let cursor = null;
      let pageCount = 0;
      
      while (hasMore) {
        pageCount++;
        const url = cursor 
          ? `/api/blink/transactions?first=100&after=${cursor}`
          : '/api/blink/transactions?first=100';
        
        console.log(`Fetching page ${pageCount}, cursor: ${cursor ? cursor.substring(0, 20) + '...' : 'none'}`);
        
        const response = await fetch(url);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('API response error:', response.status, errorText);
          throw new Error(`API returned ${response.status}: ${errorText.substring(0, 200)}`);
        }
        
        const data = await response.json();
        console.log(`Received ${data.transactions?.length || 0} transactions`);
        
        if (!data.transactions || !Array.isArray(data.transactions)) {
          console.error('Invalid data structure:', data);
          throw new Error('Invalid transaction data received from API');
        }
        
        allTransactions = [...allTransactions, ...data.transactions];
        hasMore = data.pageInfo?.hasNextPage || false;
        cursor = data.pageInfo?.endCursor;
        
        console.log(`Total so far: ${allTransactions.length}, hasMore: ${hasMore}`);
      }
      
      console.log(`Fetched ${allTransactions.length} total transactions across ${pageCount} pages`);
      
      // Convert transactions to Basic CSV format
      console.log('Converting to Basic CSV...');
      const csv = convertTransactionsToBasicCSV(allTransactions);
      console.log(`CSV generated, length: ${csv.length} characters`);
      
      // Generate filename with date and username
      const date = new Date();
      const dateStr = date.getFullYear() + 
                      String(date.getMonth() + 1).padStart(2, '0') + 
                      String(date.getDate()).padStart(2, '0');
      const username = user?.username || 'user';
      const filename = `${dateStr}-${username}-transactions-BASIC-blink.csv`;
      
      // Trigger download
      downloadCSV(csv, filename);
      
      setShowExportOptions(false);
    } catch (error) {
      console.error('Error exporting basic transactions:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      alert(`Failed to export transactions: ${error.message || 'Unknown error'}. Check console for details.`);
    } finally {
      setExportingData(false);
    }
  };

  // Convert transactions to Basic CSV format (simplified)
  const convertTransactionsToBasicCSV = (txs) => {
    // CSV Header: timestamp, type, credit, debit, fee, currency, status, InMemo, username
    const header = 'timestamp,type,credit,debit,fee,currency,status,InMemo,username';
    
    // CSV Rows
    const rows = txs.map((tx, index) => {
      try {
        // Timestamp - convert Unix timestamp to readable format
        const timestamp = tx.createdAt ? new Date(parseInt(tx.createdAt) * 1000).toString() : '';
        
        // Determine transaction type from settlementVia
        let type = '';
        if (tx.settlementVia?.__typename === 'SettlementViaLn') {
          type = 'ln_on_us';
        } else if (tx.settlementVia?.__typename === 'SettlementViaOnChain') {
          type = 'onchain';
        } else if (tx.settlementVia?.__typename === 'SettlementViaIntraLedger') {
          type = 'intraledger';
        }
        
        // Calculate credit/debit based on direction and amount
        const absoluteAmount = Math.abs(tx.settlementAmount || 0);
        const credit = tx.direction === 'RECEIVE' ? absoluteAmount : 0;
        const debit = tx.direction === 'SEND' ? absoluteAmount : 0;
        
        // Fee
        const fee = Math.abs(tx.settlementFee || 0);
        
        // Currency
        const currency = tx.settlementCurrency || 'BTC';
        
        // Status
        const status = tx.status || '';
        
        // InMemo (memo field)
        const inMemo = tx.memo || '';
        
        // Username - extract from initiationVia or settlementVia
        let username = '';
        
        // For RECEIVE transactions: get sender info from initiationVia
        if (tx.direction === 'RECEIVE') {
          if (tx.initiationVia?.__typename === 'InitiationViaIntraLedger') {
            username = tx.initiationVia.counterPartyUsername || '';
          }
          // Also check settlementVia for intraledger receives
          if (!username && tx.settlementVia?.__typename === 'SettlementViaIntraLedger') {
            username = tx.settlementVia.counterPartyUsername || '';
          }
        }
        
        // For SEND transactions: get recipient info from settlementVia
        if (tx.direction === 'SEND') {
          if (tx.settlementVia?.__typename === 'SettlementViaIntraLedger') {
            username = tx.settlementVia.counterPartyUsername || '';
          }
          // Fallback to initiationVia
          if (!username && tx.initiationVia?.__typename === 'InitiationViaIntraLedger') {
            username = tx.initiationVia.counterPartyUsername || '';
          }
        }
        
        // Escape commas and quotes in fields
        const escape = (field) => {
          const str = String(field);
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        };
        
        return [
          escape(timestamp),
          escape(type),
          escape(credit),
          escape(debit),
          escape(fee),
          escape(currency),
          escape(status),
          escape(inMemo),
          escape(username)
        ].join(',');
      } catch (error) {
        console.error(`Error processing transaction ${index}:`, error);
        console.error('Transaction data:', tx);
        throw new Error(`Failed to convert transaction ${index}: ${error.message}`);
      }
    });
    
    return [header, ...rows].join('\n');
  };

  // Convert transactions to CSV format matching Blink's schema
  const convertTransactionsToCSV = (txs) => {
    // CSV Header
    const header = 'id,walletId,type,credit,debit,fee,currency,timestamp,pendingConfirmation,journalId,lnMemo,usd,feeUsd,recipientWalletId,username,memoFromPayer,paymentHash,pubkey,feeKnownInAdvance,address,txHash,displayAmount,displayFee,displayCurrency';
    
    // CSV Rows
    const rows = txs.map((tx, index) => {
      try {
      // Extract basic transaction data
      const id = tx.id || '';
      const walletId = tx.walletId || '';
      
      // Determine transaction type from settlementVia
      let type = '';
      if (tx.settlementVia?.__typename === 'SettlementViaLn') {
        type = 'ln_on_us';
      } else if (tx.settlementVia?.__typename === 'SettlementViaOnChain') {
        type = 'onchain';
      } else if (tx.settlementVia?.__typename === 'SettlementViaIntraLedger') {
        type = 'intraledger';
      }
      
      // Calculate credit/debit based on direction and amount
      const absoluteAmount = Math.abs(tx.settlementAmount || 0);
      const credit = tx.direction === 'RECEIVE' ? absoluteAmount : 0;
      const debit = tx.direction === 'SEND' ? absoluteAmount : 0;
      
      // Fee handling
      const fee = Math.abs(tx.settlementFee || 0);
      
      // Currency
      const currency = tx.settlementCurrency || 'BTC';
      
      // Timestamp - convert Unix timestamp to readable format
      const timestamp = tx.createdAt ? new Date(parseInt(tx.createdAt) * 1000).toString() : '';
      
      // Pending confirmation
      const pendingConfirmation = tx.status === 'PENDING';
      
      // Journal ID (not available from GraphQL, leave empty)
      const journalId = '';
      
      // Memo
      const lnMemo = tx.memo || '';
      
      // Display amounts (USD or other fiat)
      const usd = tx.settlementDisplayAmount || '';
      const feeUsd = tx.settlementDisplayFee || '';
      
      // Recipient wallet ID and username - check both initiationVia and settlementVia
      let recipientWalletId = '';
      let username = '';
      
      // For RECEIVE transactions: get sender info from initiationVia
      if (tx.direction === 'RECEIVE') {
        if (tx.initiationVia?.__typename === 'InitiationViaIntraLedger') {
          username = tx.initiationVia.counterPartyUsername || '';
          recipientWalletId = tx.initiationVia.counterPartyWalletId || '';
        }
        // Also check settlementVia for intraledger receives
        if (!username && tx.settlementVia?.__typename === 'SettlementViaIntraLedger') {
          username = tx.settlementVia.counterPartyUsername || '';
          recipientWalletId = tx.settlementVia.counterPartyWalletId || '';
        }
      }
      
      // For SEND transactions: get recipient info from settlementVia (or initiationVia as fallback)
      if (tx.direction === 'SEND') {
        if (tx.settlementVia?.__typename === 'SettlementViaIntraLedger') {
          username = tx.settlementVia.counterPartyUsername || '';
          recipientWalletId = tx.settlementVia.counterPartyWalletId || '';
        }
        // Fallback to initiationVia
        if (!username && tx.initiationVia?.__typename === 'InitiationViaIntraLedger') {
          username = tx.initiationVia.counterPartyUsername || '';
          recipientWalletId = tx.initiationVia.counterPartyWalletId || '';
        }
      }
      
      // Memo from payer (not available separately, using main memo)
      const memoFromPayer = '';
      
      // Payment hash
      let paymentHash = '';
      if (tx.initiationVia?.__typename === 'InitiationViaLn') {
        paymentHash = tx.initiationVia.paymentHash || '';
      }
      // Also check for preImage in settlementVia
      if (!paymentHash && tx.settlementVia?.preImage) {
        paymentHash = tx.settlementVia.preImage;
      }
      
      // Pubkey (not available from GraphQL)
      const pubkey = '';
      
      // Fee known in advance (Lightning fees are known, onchain are estimates)
      const feeKnownInAdvance = type === 'ln_on_us' || type === 'intraledger';
      
      // Address (for onchain)
      let address = '';
      if (tx.initiationVia?.__typename === 'InitiationViaOnChain') {
        address = tx.initiationVia.address || '';
      }
      
      // Transaction hash (for onchain)
      let txHash = '';
      if (tx.settlementVia?.__typename === 'SettlementViaOnChain') {
        txHash = tx.settlementVia.transactionHash || '';
      }
      // For lightning, use payment hash as txHash if no onchain hash
      if (!txHash && paymentHash) {
        txHash = paymentHash;
      }
      
      // Display amounts
      const displayAmount = absoluteAmount;
      const displayFee = fee;
      const displayCurrency = tx.settlementDisplayCurrency || 'USD';
      
      // Escape commas and quotes in fields
      const escape = (field) => {
        const str = String(field);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };
      
      return [
        escape(id),
        escape(walletId),
        escape(type),
        escape(credit),
        escape(debit),
        escape(fee),
        escape(currency),
        escape(timestamp),
        escape(pendingConfirmation),
        escape(journalId),
        escape(lnMemo),
        escape(usd),
        escape(feeUsd),
        escape(recipientWalletId),
        escape(username),
        escape(memoFromPayer),
        escape(paymentHash),
        escape(pubkey),
        escape(feeKnownInAdvance),
        escape(address),
        escape(txHash),
        escape(displayAmount),
        escape(displayFee),
        escape(displayCurrency)
      ].join(',');
      } catch (error) {
        console.error(`Error processing transaction ${index}:`, error);
        console.error('Transaction data:', tx);
        throw new Error(`Failed to convert transaction ${index}: ${error.message}`);
      }
    });
    
    return [header, ...rows].join('\n');
  };

  // Download CSV file
  const downloadCSV = (csvContent, filename) => {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    
    // Check if native share is available (for mobile)
    if (navigator.share && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      // Create a File object for sharing
      const file = new File([blob], filename, { type: 'text/csv' });
      
      navigator.share({
        files: [file],
        title: 'Blink Transactions Export',
        text: 'Transaction history from Blink'
      }).catch((error) => {
        console.log('Share failed, falling back to download:', error);
        // Fallback to regular download
        triggerDownload(blob, filename);
      });
    } else {
      // Regular download for desktop or if share not available
      triggerDownload(blob, filename);
    }
  };

  // Trigger download via link
  const triggerDownload = (blob, filename) => {
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
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

    // Only allow swipe navigation when:
    // - On POS numpad screen (not showing invoice/tips)
    // - On transactions screen
    // Left swipe: POS → Transactions (only when not showing invoice/tips)
    // Right swipe: Transactions → POS
    if (isLeftSwipe && currentView === 'pos' && !showingInvoice) {
      setCurrentView('transactions');
    } else if (isRightSwipe && currentView === 'transactions') {
      setCurrentView('pos');
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
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blink-accent mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading transactions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      {/* Payment Animation Overlay */}
      <PaymentAnimation 
        show={showAnimation} 
        payment={lastPayment}
        onHide={hideAnimation}
        soundEnabled={soundEnabled}
        soundTheme={soundTheme}
      />

      {/* Mobile Header - Hidden when showing invoice */}
      {!showingInvoice && (
        <header className="bg-gray-50 dark:bg-blink-dark shadow dark:shadow-black sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between py-4">
              {/* Blink Logo - Left */}
              <div className="flex items-center">
                <img 
                  src="/logos/blink-icon-light.svg" 
                  alt="Blink" 
                  className="h-12 w-12 dark:hidden"
                />
                <img 
                  src="/logos/blink-icon-dark.svg" 
                  alt="Blink" 
                  className="h-12 w-12 hidden dark:block"
                />
              </div>
              
              {/* Right Side: Dark Mode Toggle + Menu Button */}
              <div className="flex items-center gap-3">
                {/* Dark Mode Toggle */}
                <button
                  onClick={toggleDarkMode}
                  className="inline-flex gap-0.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-600 focus:ring-offset-2 rounded"
                  aria-label="Toggle dark mode"
                >
                  <span
                    className={`w-5 h-5 transition-colors duration-200 ease-in-out ${
                      darkMode ? 'bg-blue-600 dark:bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                  />
                  <span
                    className={`w-5 h-5 transition-colors duration-200 ease-in-out ${
                      darkMode ? 'bg-gray-300 dark:bg-gray-600' : 'bg-blink-accent'
                    }`}
                  />
                </button>
                
                {/* Menu Button */}
                <button
                  onClick={() => setSideMenuOpen(!sideMenuOpen)}
                  className="p-2 rounded-md text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-blink-dark focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
                  aria-label="Open menu"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </header>
      )}

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
                <div className="flex h-full flex-col overflow-y-scroll bg-white dark:bg-black py-6 shadow-xl side-menu-slide-in" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
                  <div className="px-4 sm:px-6">
                    <div className="flex items-start justify-between">
                      {/* Logo */}
                      <div className="flex items-center">
                        <img 
                          src={darkMode ? '/logos/blink-icon-dark.svg' : '/logos/blink-icon-light.svg'}
                          alt="Blink Logo"
                          className="h-8 w-8"
                        />
                      </div>
                      <div className="ml-3 flex h-7 items-center">
                        <button
                          type="button"
                          className="rounded-md bg-white dark:bg-black text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-600 dark:focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-black"
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
                      <div className="border-b border-gray-300 dark:border-gray-700 pb-4">
                        <p className="text-sm text-gray-600 dark:text-white">Welcome, {user?.username}</p>
                      </div>
                      
                      {/* Currency Selection */}
                      <div className="border-b border-gray-300 dark:border-gray-700 pb-4">
                        <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">
                          Display Currency
                        </label>
                        <select
                          value={displayCurrency}
                          onChange={(e) => setDisplayCurrency(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-blink-dark text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-600 focus:border-transparent text-sm"
                          disabled={currenciesLoading}
                        >
                          {currenciesLoading ? (
                            <option>Loading currencies...</option>
                          ) : (
                            getAllCurrencies().map((currency) => (
                              <option key={currency.id} value={currency.id}>
                                {currency.flag ? `${currency.flag} ` : ''}{currency.id} - {currency.name}
                              </option>
                            ))
                          )}
                        </select>
                      </div>

                      {/* Dark Mode Toggle */}
                      <div className="border-b border-gray-300 dark:border-gray-700 pb-4">
                        <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">
                          Dark Mode
                        </label>
                        <div className="flex items-center">
                          <button
                            onClick={toggleDarkMode}
                            className="inline-flex gap-0.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-600 focus:ring-offset-2 rounded"
                          >
                            <span
                              className={`w-5 h-5 transition-colors duration-200 ease-in-out ${
                                darkMode ? 'bg-blue-600 dark:bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'
                              }`}
                            />
                            <span
                              className={`w-5 h-5 transition-colors duration-200 ease-in-out ${
                                darkMode ? 'bg-gray-300 dark:bg-gray-600' : 'bg-blink-accent'
                              }`}
                            />
                          </button>
                          <span className="ml-3 text-sm text-gray-700 dark:text-white">
                            {darkMode ? 'ON' : 'OFF'}
                          </span>
                        </div>
                      </div>

                      {/* Sound Settings */}
                      <div className="border-b border-gray-300 dark:border-gray-700 pb-4">
                        <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">
                          Sound Effects
                        </label>
                        <div className="flex items-center mb-3">
                          <button
                            onClick={() => setSoundEnabled(!soundEnabled)}
                            className="inline-flex gap-0.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-600 focus:ring-offset-2 rounded"
                          >
                            <span
                              className={`w-5 h-5 transition-colors duration-200 ease-in-out ${
                                soundEnabled ? 'bg-blue-600 dark:bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'
                              }`}
                            />
                            <span
                              className={`w-5 h-5 transition-colors duration-200 ease-in-out ${
                                soundEnabled ? 'bg-gray-300 dark:bg-gray-600' : 'bg-blink-accent'
                              }`}
                            />
                          </button>
                          <span className="ml-3 text-sm text-gray-700 dark:text-white">
                            {soundEnabled ? 'ON' : 'OFF'}
                          </span>
                        </div>
                        
                        {/* Sound Themes button (only show when sound is ON) */}
                        {soundEnabled && (
                          <button
                            onClick={() => setShowSoundThemes(true)}
                            className="w-full flex items-center justify-between px-3 py-2 text-sm bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-white rounded-md transition-colors"
                          >
                            <span>Sound Themes</span>
                            <span className="text-gray-500 dark:text-gray-400">›</span>
                          </button>
                        )}
                      </div>

                      {/* Tip Settings */}
                      <div className="border-b border-gray-300 dark:border-gray-700 pb-4">
                        <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">
                          Tips
                        </label>
                        
                        <div className="space-y-4">
                          {/* Enable Tips Toggle */}
                          <div className="flex items-center">
                            <button
                              onClick={() => setTipsEnabled(!tipsEnabled)}
                              className="inline-flex gap-0.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-600 focus:ring-offset-2 rounded"
                            >
                              <span
                                className={`w-5 h-5 transition-colors duration-200 ease-in-out ${
                                  tipsEnabled ? 'bg-blue-600 dark:bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'
                                }`}
                              />
                              <span
                                className={`w-5 h-5 transition-colors duration-200 ease-in-out ${
                                  tipsEnabled ? 'bg-gray-300 dark:bg-gray-600' : 'bg-blink-accent'
                                }`}
                              />
                            </button>
                            <span className="ml-3 text-sm text-gray-700 dark:text-white">
                              {tipsEnabled ? 'ON' : 'OFF'}
                            </span>
                          </div>

                          {/* Tip Settings (only show when enabled) */}
                          {tipsEnabled && (
                            <>
                              <div>
                                <label className="block text-xs font-medium text-gray-700 dark:text-white mb-1">
                                  Recipient
                                </label>
                                <div className="relative">
                                  <input
                                    type="text"
                                    value={tipRecipient}
                                    onChange={(e) => setTipRecipient(e.target.value)}
                                    placeholder="Enter Blink username"
                                    className={`w-full px-2 py-1 text-sm border rounded-md bg-white dark:bg-blink-dark text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-600 focus:border-transparent ${
                                      usernameValidation.status === 'success' ? 'border-green-500' :
                                      usernameValidation.status === 'error' ? 'border-red-500' :
                                      'border-gray-300 dark:border-gray-600'
                                    }`}
                                  />
                                  {usernameValidation.isValidating && (
                                    <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                                    </div>
                                  )}
                                  {usernameValidation.status === 'success' && (
                                    <div className="absolute right-2 top-1/2 transform -translate-y-1/2 text-green-500">
                                      ✓
                                    </div>
                                  )}
                                </div>
                                
                                {/* Validation message - only show errors */}
                                {usernameValidation.message && usernameValidation.status === 'error' && (
                                  <div className="text-xs mt-1 text-red-600 dark:text-red-400">
                                    {usernameValidation.message}
                                  </div>
                                )}
                              </div>

                              <div>
                                <label className="block text-xs font-medium text-gray-700 dark:text-white mb-1">
                                  Tip Presets (%)
                                </label>
                                <div className="flex gap-1 mb-2">
                                  {tipPresets.map((preset, index) => (
                                    <div key={index} className="flex items-center">
                                      <input
                                        type="number"
                                        value={preset}
                                        onChange={(e) => {
                                          const newPresets = [...tipPresets];
                                          newPresets[index] = parseFloat(e.target.value) || 0;
                                          setTipPresets(newPresets);
                                        }}
                                        className="w-12 px-1 py-1 text-xs border border-gray-300 dark:border-gray-600 bg-white dark:bg-blink-dark text-gray-900 dark:text-white rounded text-center"
                                        min="0"
                                        max="100"
                                        step="0.5"
                                      />
                                      {index === tipPresets.length - 1 && tipPresets.length > 1 && (
                                        <button
                                          onClick={() => setTipPresets(tipPresets.filter((_, i) => i !== index))}
                                          className="ml-1 text-red-500 hover:text-red-700 text-xs"
                                        >
                                          ×
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                </div>
                                <button
                                  onClick={() => setTipPresets([...tipPresets, 5])}
                                  className="text-xs bg-blink-accent hover:bg-orange-500 text-white px-2 py-1 rounded transition-colors"
                                >
                                  Add
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Account Status */}
                      <div className="border-b border-gray-300 dark:border-gray-700 pb-4">
                        <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">Account Status</h3>
                        <div className="flex items-center">
                          <div className={`w-3 h-3 rounded-full mr-2 ${user ? 'bg-green-500' : 'bg-red-500'}`}></div>
                          <span className="text-sm text-gray-700 dark:text-white">
                            {user?.username && (
                              <div>
                                <span className="text-blink-accent font-medium">
                                  Logged in as {user.username}
                                </span>
                                {tipsEnabled && tipRecipient && (
                                  <div className="mt-1 text-gray-700 dark:text-white">
                                    Tips: <span className="text-green-600 font-medium">{tipRecipient}@blink.sv</span>
                                  </div>
                                )}
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
                            className="w-full h-16 bg-white dark:bg-black border-2 border-green-500 hover:border-green-600 hover:bg-green-50 dark:hover:bg-green-900 text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 rounded-lg text-lg font-normal transition-colors shadow-md flex items-center justify-center"
                            style={{fontFamily: "'Source Sans Pro', sans-serif"}}
                          >
                            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                            </svg>
                            Install App
                          </button>
                        )}
                        
                        <button
                          onClick={() => {
                            handleLogout();
                            setSideMenuOpen(false);
                          }}
                          className="w-full h-12 bg-white dark:bg-black border-2 border-red-600 dark:border-red-500 hover:border-red-700 dark:hover:border-red-400 hover:bg-red-50 dark:hover:bg-red-900 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 rounded-lg text-lg font-normal transition-colors shadow-md"
                          style={{fontFamily: "'Source Sans Pro', sans-serif"}}
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

      {/* Sound Themes Overlay */}
      {showSoundThemes && (
        <div className="fixed inset-0 bg-white dark:bg-black z-50 overflow-y-auto">
          <div className="min-h-screen">
            {/* Header */}
            <div className="bg-gray-50 dark:bg-blink-dark shadow dark:shadow-black sticky top-0 z-10">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16">
                  <button
                    onClick={() => setShowSoundThemes(false)}
                    className="flex items-center text-gray-700 dark:text-white hover:text-blink-accent dark:hover:text-blink-accent"
                  >
                    <span className="text-2xl mr-2">‹</span>
                    <span className="text-lg">Back</span>
                  </button>
                  <h1 className="text-xl font-bold text-gray-900 dark:text-white" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
                    Sound Themes
                  </h1>
                  <div className="w-16"></div>
                </div>
              </div>
            </div>

            {/* Sound Themes List */}
            <div className="max-w-md mx-auto px-4 py-6">
              <div className="space-y-3">
                {/* Success Theme */}
                <button
                  onClick={() => {
                    setSoundTheme('success');
                    setShowSoundThemes(false);
                  }}
                  className={`w-full p-4 rounded-lg border-2 transition-all ${
                    soundTheme === 'success'
                      ? 'border-blue-600 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-blink-dark hover:border-gray-400 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-left">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
                        Success
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Classic payment sounds
                      </p>
                    </div>
                    {soundTheme === 'success' && (
                      <div className="text-blue-600 dark:text-blue-400 text-2xl">✓</div>
                    )}
                  </div>
                </button>

                {/* Zelda Theme */}
                <button
                  onClick={() => {
                    setSoundTheme('zelda');
                    setShowSoundThemes(false);
                  }}
                  className={`w-full p-4 rounded-lg border-2 transition-all ${
                    soundTheme === 'zelda'
                      ? 'border-blue-600 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-blink-dark hover:border-gray-400 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-left">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
                        Zelda
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Breath of the Wild sounds
                      </p>
                    </div>
                    {soundTheme === 'zelda' && (
                      <div className="text-blue-600 dark:text-blue-400 text-2xl">✓</div>
                    )}
                  </div>
                </button>

                {/* Free Theme */}
                <button
                  onClick={() => {
                    setSoundTheme('free');
                    setShowSoundThemes(false);
                  }}
                  className={`w-full p-4 rounded-lg border-2 transition-all ${
                    soundTheme === 'free'
                      ? 'border-blue-600 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-blink-dark hover:border-gray-400 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-left">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
                        Free
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Freedom sounds
                      </p>
                    </div>
                    {soundTheme === 'free' && (
                      <div className="text-blue-600 dark:text-blue-400 text-2xl">✓</div>
                    )}
                  </div>
                </button>

                {/* Retro Theme */}
                <button
                  onClick={() => {
                    setSoundTheme('retro');
                    setShowSoundThemes(false);
                  }}
                  className={`w-full p-4 rounded-lg border-2 transition-all ${
                    soundTheme === 'retro'
                      ? 'border-blue-600 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-blink-dark hover:border-gray-400 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-left">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
                        Retro
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Classic 8-bit sounds
                      </p>
                    </div>
                    {soundTheme === 'retro' && (
                      <div className="text-blue-600 dark:text-blue-400 text-2xl">✓</div>
                    )}
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Export Options Overlay */}
      {showExportOptions && (
        <div className="fixed inset-0 bg-white dark:bg-black z-50 overflow-y-auto">
          <div className="min-h-screen">
            {/* Header */}
            <div className="bg-gray-50 dark:bg-blink-dark shadow dark:shadow-black sticky top-0 z-10">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16">
                  <button
                    onClick={() => setShowExportOptions(false)}
                    className="flex items-center text-gray-700 dark:text-white hover:text-blink-accent dark:hover:text-blink-accent"
                  >
                    <span className="text-2xl mr-2">‹</span>
                    <span className="text-lg">Back</span>
                  </button>
                  <h1 className="text-xl font-bold text-gray-900 dark:text-white" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
                    Export Options
                  </h1>
                  <div className="w-16"></div>
                </div>
              </div>
            </div>

            {/* Export Options List */}
            <div className="max-w-md mx-auto px-4 py-6">
              <div className="space-y-3">
                {/* Basic Export */}
                <button
                  onClick={exportBasicTransactions}
                  disabled={exportingData}
                  className="w-full p-4 rounded-lg border-2 border-blue-500 dark:border-blue-400 bg-white dark:bg-blink-dark hover:border-blue-600 dark:hover:border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-left">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
                        Basic
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {exportingData ? 'Exporting simplified transaction summary...' : 'Simplified transaction summary (CSV)'}
                      </p>
                    </div>
                    {exportingData ? (
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 dark:border-blue-400"></div>
                    ) : (
                      <div className="text-blue-600 dark:text-blue-400 text-xl">↓</div>
                    )}
                  </div>
                </button>

                {/* Full Export */}
                <button
                  onClick={exportFullTransactions}
                  disabled={exportingData}
                  className="w-full p-4 rounded-lg border-2 border-yellow-500 dark:border-yellow-400 bg-white dark:bg-blink-dark hover:border-yellow-600 dark:hover:border-yellow-300 hover:bg-yellow-50 dark:hover:bg-yellow-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-left">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
                        Full
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {exportingData ? 'Exporting complete transaction history...' : 'Complete transaction history (CSV)'}
                      </p>
                    </div>
                    {exportingData ? (
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-yellow-600 dark:border-yellow-400"></div>
                    ) : (
                      <div className="text-yellow-600 dark:text-yellow-400 text-xl">↓</div>
                    )}
                  </div>
                </button>
              </div>
              
              {/* Info Text */}
              <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  <strong>Basic Export:</strong> Simplified CSV with 9 essential columns (timestamp, type, credit, debit, fee, currency, status, memo, username).
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  <strong>Full Export:</strong> Complete transaction data with all 24 fields matching Blink's official format.
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
                  On mobile devices, you'll have the option to save or share the file with other apps.
                </p>
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
          <div className="mb-4 bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-200 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {/* Dot Navigation - Consistent position on all pages */}
        {!showingInvoice && (
          <div className="flex justify-center mt-4 mb-4 gap-2">
              <button
                onClick={() => setCurrentView('pos')}
              className={`w-2 h-2 rounded-full transition-colors ${
                  currentView === 'pos'
                  ? 'bg-blink-accent'
                  : 'bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500'
                }`}
              aria-label="POS"
            />
              <button
                onClick={() => setCurrentView('transactions')}
              className={`w-2 h-2 rounded-full transition-colors ${
                  currentView === 'transactions'
                  ? 'bg-blink-accent'
                  : 'bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500'
                }`}
              aria-label="History"
            />
          </div>
        )}

        {/* Owner/Agent Display - Left aligned on POS only */}
        {!showingInvoice && currentView === 'pos' && (
          <div className="flex flex-col gap-1 mb-2 bg-white dark:bg-black">
            {/* Owner Display - Always show when logged in */}
            <div className="flex items-center gap-2">
              <img 
                src="/bluedot.svg" 
                alt="Owner" 
                className="w-2 h-2"
              />
              <span className="text-blue-600 dark:text-blue-400 font-semibold" style={{fontSize: '11.2px'}}>
                {user?.username || 'owner'}
              </span>
            </div>
            
            {/* Agent Display - Show when agent is added and username is valid */}
            {tipsEnabled && tipRecipient && usernameValidation.status === 'success' && (
              <div className="flex items-center gap-2">
                <img 
                  src="/greendot.svg" 
                  alt="Agent" 
                  className="w-2 h-2"
                />
                <span className="text-green-600 dark:text-green-400 font-semibold" style={{fontSize: '11.2px'}}>
                  {tipRecipient}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Conditional Content Based on Current View */}
        {currentView === 'pos' ? (
          <POS 
            apiKey={apiKey}
            user={user}
            displayCurrency={displayCurrency}
            currencies={currencies}
            wallets={wallets}
            onPaymentReceived={posPaymentReceivedRef}
            connected={connected}
            manualReconnect={manualReconnect}
            reconnectAttempts={reconnectAttempts}
            blinkposConnected={blinkposConnected}
            blinkposConnect={blinkposConnect}
            blinkposDisconnect={blinkposDisconnect}
            blinkposReconnect={blinkposReconnect}
            blinkposReconnectAttempts={blinkposReconnectAttempts}
            tipsEnabled={tipsEnabled}
            tipPresets={tipPresets}
            tipRecipient={tipRecipient}
            soundEnabled={soundEnabled}
            onInvoiceStateChange={setShowingInvoice}
            onInvoiceChange={setCurrentInvoice}
            darkMode={darkMode}
            toggleDarkMode={toggleDarkMode}
            nfcState={nfcState}
          />
        ) : (
          <>
            {/* Most Recent Transactions */}
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">Most Recent Transactions</h2>
          <div className="bg-white dark:bg-blink-dark shadow dark:shadow-black overflow-hidden sm:rounded-md">
            <ul className="divide-y divide-gray-200 dark:divide-gray-700">
              {transactions.slice(0, 5).map((tx) => (
                <li key={tx.id} className="px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className={`flex-shrink-0 w-2 h-2 rounded-full mr-3 ${
                        tx.direction === 'RECEIVE' ? 'bg-green-500' : 'bg-red-500'
                      }`}></div>
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {tx.amount}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{tx.memo}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-900 dark:text-gray-100">{tx.status}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{tx.date}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Past Transactions - Grouped by Month */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">Past Transactions</h2>
          
          {!pastTransactionsLoaded ? (
            <div className="bg-white dark:bg-blink-dark shadow dark:shadow-black rounded-lg p-6 text-center text-gray-500 dark:text-gray-400">
              Click "Show" to load past transaction history
            </div>
          ) : (() => {
            const monthGroups = getMonthGroups();
            const monthKeys = Object.keys(monthGroups);
            
            if (monthKeys.length === 0) {
              return (
                <div className="bg-white dark:bg-blink-dark shadow dark:shadow-black rounded-lg p-6 text-center text-gray-500 dark:text-gray-400">
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
                    <div key={monthKey} className="bg-white dark:bg-blink-dark shadow dark:shadow-black rounded-lg overflow-hidden">
                      {/* Month Header - Clickable */}
                      <button
                        onClick={() => toggleMonth(monthKey)}
                        className="w-full px-6 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:bg-white dark:focus:bg-gray-700 transition-colors month-group-header"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                              {monthData.label}
                            </h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
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
                        <div className="border-t border-gray-200 dark:border-gray-700 month-group-content">
                          {/* Mobile-friendly card layout for small screens */}
                          <div className="block sm:hidden">
                            <div className="p-4 space-y-3">
                              {monthData.transactions.map((tx) => (
                                <div key={tx.id} className="bg-white dark:bg-blink-dark rounded-lg p-4 border border-gray-200 dark:border-gray-700 transaction-card-mobile">
                                  <div className="flex items-center justify-between mb-2">
                                    <span className={`text-lg font-medium ${
                                      tx.direction === 'RECEIVE' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                                    }`}>
                                      {tx.amount}
                                    </span>
                                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">
                                      {tx.status}
                                    </span>
                                  </div>
                                  <div className="text-sm text-gray-900 dark:text-gray-100 mb-1">{tx.date}</div>
                                  {tx.memo && tx.memo !== '-' && (
                                    <div className="text-sm text-gray-500 dark:text-gray-400">{tx.memo}</div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Desktop table layout for larger screens */}
                          <div className="hidden sm:block">
                            <div className="overflow-x-auto">
                              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                <thead className="bg-white dark:bg-blink-dark">
                                  <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                      Amount
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                      Status
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                      Date
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                      Memo
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="bg-white dark:bg-blink-dark divide-y divide-gray-200 dark:divide-gray-700">
                                  {monthData.transactions.map((tx) => (
                                    <tr key={tx.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 bg-white dark:bg-blink-dark">
                                      <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`text-sm font-medium ${
                                          tx.direction === 'RECEIVE' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                                        }`}>
                                          {tx.amount}
                                        </span>
                                      </td>
                                      <td className="px-6 py-4 whitespace-nowrap">
                                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">
                                          {tx.status}
                                        </span>
                                      </td>
                                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                                        {tx.date}
                                      </td>
                                      <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
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
          
          {/* Action Buttons - Always visible */}
          <div className="mt-6 px-4">
            <div className={`grid gap-3 max-w-sm mx-auto ${hasMoreTransactions ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {/* Show / Show More Button */}
              {hasMoreTransactions && (
                <button
                  onClick={pastTransactionsLoaded ? loadMoreMonths : loadPastTransactions}
                  disabled={loadingMore}
                  className="h-16 bg-white dark:bg-black border-2 border-blue-600 dark:border-blue-500 hover:border-blue-700 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 disabled:border-gray-400 disabled:text-gray-400 disabled:cursor-not-allowed disabled:hover:bg-white dark:disabled:hover:bg-black rounded-lg text-lg font-normal transition-colors shadow-md"
                  style={{fontFamily: "'Source Sans Pro', sans-serif"}}
                >
                  {loadingMore ? (
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                      Loading...
                    </div>
                  ) : pastTransactionsLoaded ? (
                    'Show More'
                  ) : (
                    'Show'
                  )}
                </button>
              )}
              
              {/* Export Button */}
              <button
                onClick={() => setShowExportOptions(true)}
                className="h-16 bg-white dark:bg-black border-2 border-yellow-500 dark:border-yellow-400 hover:border-yellow-600 dark:hover:border-yellow-300 hover:bg-yellow-50 dark:hover:bg-yellow-900 text-yellow-600 dark:text-yellow-400 hover:text-yellow-700 dark:hover:text-yellow-300 rounded-lg text-lg font-normal transition-colors shadow-md"
                style={{fontFamily: "'Source Sans Pro', sans-serif"}}
              >
                Export
              </button>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center mt-2">
              {!pastTransactionsLoaded && hasMoreTransactions
                ? 'Load past transactions or export current data'
                : hasMoreTransactions 
                  ? 'Load more historical data or export transactions'
                  : 'Export transaction data'}
            </p>
          </div>
        </div>
          </>
        )}
      </main>
    </div>
  );
}
