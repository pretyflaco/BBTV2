import { useState, useEffect, useRef, useCallback } from 'react';
import { useCombinedAuth } from '../lib/hooks/useCombinedAuth';
import { useBlinkWebSocket } from '../lib/hooks/useBlinkWebSocket';
import { useBlinkPOSWebSocket } from '../lib/hooks/useBlinkPOSWebSocket';
import { useCurrencies } from '../lib/hooks/useCurrencies';
import { useDarkMode } from '../lib/hooks/useDarkMode';
import { useNFC } from './NFCPayment';
import PaymentAnimation from './PaymentAnimation';
import POS from './POS';
import ItemCart from './ItemCart';
import KeyManagementSection from './Settings/KeyManagementSection';
import NWCClient from '../lib/nwc/NWCClient';
import { isNpubCashAddress, validateNpubCashAddress, probeNpubCashAddress } from '../lib/lnurl';

// Predefined Tip Profiles for different regions
const TIP_PROFILES = [
  { id: 'na', name: 'North America (US/CA)', tipOptions: [18, 20, 25] },
  { id: 'eu', name: 'Western Europe (Standard)', tipOptions: [5, 10, 15] },
  { id: 'africa', name: 'Africa (Standard/South)', tipOptions: [10, 12, 15] },
  { id: 'africa-low', name: 'Africa (Low/Round Up)', tipOptions: [5, 10] },
  { id: 'asia', name: 'Asia & Oceania (Low)', tipOptions: [2, 5, 10] },
  { id: 'latam', name: 'Latin America (Included)', tipOptions: [10, 12, 15] },
  { id: 'mena', name: 'Middle East (Variable)', tipOptions: [5, 10, 15] },
];

export default function Dashboard() {
  const { 
    user, logout, authMode, getApiKey, hasServerSession, publicKey, 
    activeBlinkAccount, blinkAccounts, addBlinkAccount, addBlinkLnAddressWallet, removeBlinkAccount, setActiveBlinkAccount, 
    storeBlinkAccountOnServer, tippingSettings: profileTippingSettings, updateTippingSettings: updateProfileTippingSettings, 
    nostrProfile,
    // NWC data from useCombinedAuth (user-scoped)
    nwcConnections, activeNWC, addNWCConnection, removeNWCConnection, setActiveNWC, 
    nwcMakeInvoice, nwcLookupInvoice, nwcListTransactions, nwcHasCapability, nwcClientReady,
    // npub.cash wallet data
    activeNpubCashWallet, npubCashWallets, addNpubCashWallet
  } = useCombinedAuth();
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
  const [currentView, setCurrentView] = useState('pos'); // 'cart', 'pos', or 'transactions'
  const [cartCheckoutData, setCartCheckoutData] = useState(null); // Data from cart checkout to prefill POS
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
  const [showTipSettings, setShowTipSettings] = useState(false);
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [showKeyManagement, setShowKeyManagement] = useState(false);
  const [showCurrencySettings, setShowCurrencySettings] = useState(false);
  const [showAddAccountForm, setShowAddAccountForm] = useState(false);
  const [newAccountApiKey, setNewAccountApiKey] = useState('');
  const [newAccountLabel, setNewAccountLabel] = useState('');
  const [newAccountNwcUri, setNewAccountNwcUri] = useState('');
  const [newAccountType, setNewAccountType] = useState(null); // null | 'blink' | 'blink-ln-address' | 'nwc' | 'npub-cash'
  const [addAccountLoading, setAddAccountLoading] = useState(false);
  const [addAccountError, setAddAccountError] = useState(null);
  const [nwcValidating, setNwcValidating] = useState(false);
  const [nwcValidated, setNwcValidated] = useState(null); // { walletPubkey, relays, capabilities }
  const [newAccountLnAddress, setNewAccountLnAddress] = useState('');
  const [lnAddressValidating, setLnAddressValidating] = useState(false);
  const [lnAddressValidated, setLnAddressValidated] = useState(null); // { username, walletId, walletCurrency, lightningAddress }
  const [newNpubCashAddress, setNewNpubCashAddress] = useState('');
  const [npubCashValidating, setNpubCashValidating] = useState(false);
  const [npubCashValidated, setNpubCashValidated] = useState(null); // { lightningAddress, minSendable, maxSendable }
  const [confirmDeleteWallet, setConfirmDeleteWallet] = useState(null); // { type: 'blink'|'nwc', id: string }
  // Tip Profile state
  const [showTipProfileSettings, setShowTipProfileSettings] = useState(false);
  const [activeTipProfile, setActiveTipProfile] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('blinkpos-active-tip-profile');
      return saved ? JSON.parse(saved) : null;
    }
    return null;
  });
  
  // Split Profiles state
  const [splitProfiles, setSplitProfiles] = useState([]);
  const [activeSplitProfile, setActiveSplitProfile] = useState(null);
  const [splitProfilesLoading, setSplitProfilesLoading] = useState(false);
  const [showCreateSplitProfile, setShowCreateSplitProfile] = useState(false);
  const [editingSplitProfile, setEditingSplitProfile] = useState(null);
  const [newSplitProfileLabel, setNewSplitProfileLabel] = useState('');
  const [newSplitProfileRecipients, setNewSplitProfileRecipients] = useState([]); // Array of { username, validated }
  const [newRecipientInput, setNewRecipientInput] = useState(''); // Current input for adding a recipient
  const [splitProfileError, setSplitProfileError] = useState(null);
  const [recipientValidation, setRecipientValidation] = useState({ status: null, message: '', isValidating: false });
  
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

  // Persist active tip profile and update tipPresets when profile changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (activeTipProfile) {
        localStorage.setItem('blinkpos-active-tip-profile', JSON.stringify(activeTipProfile));
        // Update tipPresets to match the profile's tip options
        setTipPresets(activeTipProfile.tipOptions);
      } else {
        localStorage.removeItem('blinkpos-active-tip-profile');
      }
    }
  }, [activeTipProfile]);

  // Clear tip recipient when user changes (no persistence across sessions)
  useEffect(() => {
    setTipRecipient('');
    setUsernameValidation({ status: null, message: '', isValidating: false });
    // Also clear any existing localStorage value
    if (typeof window !== 'undefined') {
      localStorage.removeItem('blinkpos-tip-recipient');
    }
  }, [user?.username]);

  // Server sync for preferences (cross-device sync)
  // Fetch preferences from server on login and sync when changed
  const serverSyncTimerRef = useRef(null);
  const lastSyncedPrefsRef = useRef(null);
  
  // Sync preferences to server (debounced)
  const syncPreferencesToServer = useCallback(async (prefs) => {
    if (!publicKey) return;
    
    // Clear existing timer
    if (serverSyncTimerRef.current) {
      clearTimeout(serverSyncTimerRef.current);
    }
    
    // Debounce the sync (2 seconds)
    serverSyncTimerRef.current = setTimeout(async () => {
      try {
        console.log('[Dashboard] Syncing preferences to server...');
        
        const response = await fetch('/api/user/sync', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pubkey: publicKey,
            field: 'preferences',
            data: prefs
          })
        });
        
        if (response.ok) {
          console.log('[Dashboard] ✓ Preferences synced to server');
          lastSyncedPrefsRef.current = JSON.stringify(prefs);
        }
      } catch (err) {
        console.error('[Dashboard] Server sync error:', err);
      }
    }, 2000);
  }, [publicKey]);

  // Fetch preferences from server on login
  useEffect(() => {
    if (!publicKey) return;
    
    const fetchServerPreferences = async () => {
      try {
        console.log('[Dashboard] Fetching preferences from server...');
        const response = await fetch(`/api/user/sync?pubkey=${publicKey}`);
        
        if (!response.ok) return;
        
        const data = await response.json();
        const serverPrefs = data.preferences;
        
        if (serverPrefs) {
          console.log('[Dashboard] Loaded preferences from server');
          
          // Apply server preferences to local state
          if (serverPrefs.soundEnabled !== undefined) {
            setSoundEnabled(serverPrefs.soundEnabled);
            localStorage.setItem('soundEnabled', JSON.stringify(serverPrefs.soundEnabled));
          }
          if (serverPrefs.soundTheme) {
            setSoundTheme(serverPrefs.soundTheme);
            localStorage.setItem('soundTheme', serverPrefs.soundTheme);
          }
          if (serverPrefs.tipsEnabled !== undefined) {
            setTipsEnabled(serverPrefs.tipsEnabled);
            localStorage.setItem('blinkpos-tips-enabled', serverPrefs.tipsEnabled.toString());
          }
          if (serverPrefs.tipPresets) {
            setTipPresets(serverPrefs.tipPresets);
            localStorage.setItem('blinkpos-tip-presets', JSON.stringify(serverPrefs.tipPresets));
          }
          if (serverPrefs.displayCurrency) {
            setDisplayCurrency(serverPrefs.displayCurrency);
          }
          
          lastSyncedPrefsRef.current = JSON.stringify(serverPrefs);
        } else {
          // No server preferences - sync current local to server
          const currentPrefs = {
            soundEnabled,
            soundTheme,
            tipsEnabled,
            tipPresets,
            displayCurrency
          };
          syncPreferencesToServer(currentPrefs);
        }
      } catch (err) {
        console.error('[Dashboard] Failed to fetch server preferences:', err);
      }
    };
    
    fetchServerPreferences();
  }, [publicKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync preferences to server when they change
  useEffect(() => {
    if (!publicKey) return;
    
    const currentPrefs = {
      soundEnabled,
      soundTheme,
      tipsEnabled,
      tipPresets,
      displayCurrency
    };
    
    const currentPrefsStr = JSON.stringify(currentPrefs);
    
    // Only sync if preferences actually changed (avoid initial sync loop)
    if (lastSyncedPrefsRef.current && lastSyncedPrefsRef.current !== currentPrefsStr) {
      syncPreferencesToServer(currentPrefs);
    }
  }, [publicKey, soundEnabled, soundTheme, tipsEnabled, tipPresets, displayCurrency, syncPreferencesToServer]);

  // Cleanup server sync timer on unmount
  useEffect(() => {
    return () => {
      if (serverSyncTimerRef.current) {
        clearTimeout(serverSyncTimerRef.current);
      }
    };
  }, []);

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

  // Auto-enable tipsEnabled when a valid recipient is set
  useEffect(() => {
    if (tipRecipient && usernameValidation.status === 'success') {
      setTipsEnabled(true);
    }
  }, [tipRecipient, usernameValidation.status]);

  // Get user's API key for direct WebSocket connection
  // Works with both legacy (API key) and Nostr (profile-based) auth
  // Re-fetches when user changes OR when active Blink account changes (after account switch in Settings)
  useEffect(() => {
    if (user) {
      fetchApiKey();
    }
  }, [user, activeBlinkAccount]);

  const fetchApiKey = async () => {
    try {
      // useCombinedAuth.getApiKey() handles both auth methods:
      // - Legacy: fetches from server (/api/auth/get-api-key)
      // - Nostr: decrypts from local profile storage
      const key = await getApiKey();
      if (key) {
        setApiKey(key);
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
        isForwarded: true,
        isNwc: forwardedPayment.isNwc
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
    },
    // NWC options for forwarding to NWC wallets
    {
      isActive: !!activeNWC && nwcClientReady,
      makeInvoice: nwcMakeInvoice
    },
    // Blink Lightning Address options for forwarding without API key
    {
      isActive: activeBlinkAccount?.type === 'ln-address',
      walletId: activeBlinkAccount?.walletId,
      username: activeBlinkAccount?.username
    },
    // npub.cash options for forwarding to Cashu ecash (intraledger via Blink)
    {
      isActive: activeNpubCashWallet?.type === 'npub-cash' && !activeNWC,
      address: activeNpubCashWallet?.lightningAddress
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

  // Refresh transaction data when active wallet changes (NWC or Blink)
  // This ensures we show the correct wallet's transactions
  const prevActiveNWCRef = useRef(activeNWC?.id);
  const prevActiveBlinkRef = useRef(activeBlinkAccount?.id);
  
  useEffect(() => {
    const nwcChanged = activeNWC?.id !== prevActiveNWCRef.current;
    const blinkChanged = activeBlinkAccount?.id !== prevActiveBlinkRef.current;
    
    if (nwcChanged || blinkChanged) {
      console.log('[Dashboard] Active wallet changed:', {
        nwcFrom: prevActiveNWCRef.current?.substring(0, 8),
        nwcTo: activeNWC?.id?.substring(0, 8),
        blinkFrom: prevActiveBlinkRef.current?.substring(0, 8),
        blinkTo: activeBlinkAccount?.id?.substring(0, 8)
      });
      
      prevActiveNWCRef.current = activeNWC?.id;
      prevActiveBlinkRef.current = activeBlinkAccount?.id;
      
      // Clear existing transactions to prevent showing old wallet's data
      setTransactions([]);
      
      // If we're viewing transactions, refresh the data for the new active wallet
      if (currentView === 'transactions') {
        // Small delay to ensure the NWC client is ready after switching
        setTimeout(() => {
          console.log('[Dashboard] Refreshing transactions for new active wallet');
          fetchData();
        }, 100);
      }
    }
  }, [activeNWC?.id, activeBlinkAccount?.id, currentView]);

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

  // Refresh data when payment received (direct Blink payments, NOT BlinkPOS forwarded payments)
  useEffect(() => {
    // Skip if this is a forwarded payment (already handled in BlinkPOS callback)
    // Forwarded payments have isForwarded: true set by triggerPaymentAnimation
    if (lastPayment && !lastPayment.isForwarded) {
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
    // Check if NWC wallet is ACTIVE (user chose to use NWC for this session)
    const isNwcActive = activeNWC && nwcClientReady;
    const hasBlinkAccount = blinkAccounts && blinkAccounts.length > 0;
    
    // If NWC wallet is ACTIVE, fetch NWC transactions (even if user also has Blink account)
    // This respects the user's choice of which wallet to use
    if (isNwcActive && nwcHasCapability('list_transactions')) {
      console.log('Fetching NWC transaction history for ACTIVE NWC wallet:', activeNWC?.label);
      setLoading(true);
      try {
        const result = await nwcListTransactions({ limit: 100 });
        console.log('NWC list_transactions raw result:', JSON.stringify(result, null, 2));
        if (result.success && result.transactions) {
          // Convert NWC transactions to our format
          // NIP-47 fields: type, amount (msats), description, payment_hash, created_at, settled_at
          // Load locally stored memos for NWC transactions
          // (needed because long memos are hashed in BOLT11 and NWC returns description_hash, not the text)
          let storedMemos = {};
          try {
            storedMemos = JSON.parse(localStorage.getItem('blinkpos_nwc_memos') || '{}');
          } catch (e) {
            console.warn('Failed to load stored NWC memos:', e);
          }
          
          const formattedTransactions = result.transactions.map((tx, index) => {
            console.log(`NWC Transaction ${index}:`, JSON.stringify(tx, null, 2));
            // Convert millisats to sats
            const satsAmount = Math.round((tx.amount || 0) / 1000);
            // Format date like Blink API does
            const txDate = tx.created_at 
              ? new Date(tx.created_at * 1000).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })
              : new Date().toLocaleDateString();
            
            // Try to find the memo:
            // 1. First check if we have it stored locally (for BlinkPOS-created invoices with long memos)
            // 2. Then try the NWC response fields
            // 3. Fall back to a descriptive default
            const localMemo = tx.payment_hash && storedMemos[tx.payment_hash]?.memo;
            const memo = localMemo
              || tx.description 
              || tx.memo 
              || tx.metadata?.description 
              || tx.metadata?.memo
              || tx.invoice_description
              || (tx.type === 'incoming' ? `Received ${satsAmount} sats` : `Sent ${satsAmount} sats`);
            
            if (localMemo) {
              console.log(`✓ Found stored memo for ${tx.payment_hash?.substring(0, 16)}:`, localMemo.substring(0, 50) + '...');
            }
            
            return {
              id: tx.payment_hash || tx.preimage || `nwc-${Date.now()}-${index}`,
              direction: tx.type === 'incoming' ? 'RECEIVE' : 'SEND',
              status: tx.settled_at ? 'SUCCESS' : 'PENDING',
              // Format amount like Blink: "21 sats" or "-21 sats"
              amount: tx.type === 'incoming' ? `${satsAmount} sats` : `-${satsAmount} sats`,
              settlementAmount: satsAmount,
              currency: 'BTC',
              date: txDate,
              createdAt: tx.created_at ? new Date(tx.created_at * 1000).toISOString() : new Date().toISOString(),
              memo: memo,
              isNwc: true
            };
          });
          console.log('Formatted NWC transactions:', formattedTransactions);
          setTransactions(formattedTransactions);
          setError('');
        } else {
          console.log('NWC transaction fetch failed:', result.error);
          setTransactions([]);
        }
      } catch (err) {
        console.error('NWC transaction error:', err);
        setTransactions([]);
      } finally {
        setLoading(false);
      }
      return; // NWC transactions fetched, don't continue to Blink
    }
    
    // NWC is active but doesn't support list_transactions
    if (isNwcActive) {
      console.log('NWC wallet active but doesn\'t support list_transactions capability');
      setLoading(false);
      setTransactions([]);
      return;
    }
    
    // NWC is not active - check if we can fetch Blink transactions
    // Skip if active Blink wallet is a Lightning Address wallet (no transaction history available)
    if (activeBlinkAccount?.type === 'ln-address') {
      console.log('Lightning Address wallet active - transaction history not available');
      setLoading(false);
      setTransactions([]);
      return;
    }
    
    // Skip if npub.cash wallet is active (no transaction history available via Blink API)
    if (activeNpubCashWallet) {
      console.log('npub.cash wallet active - transaction history not available via Blink API');
      setLoading(false);
      setTransactions([]);
      return;
    }
    
    // Skip if no Blink API credentials available
    if (!apiKey && !hasServerSession) {
      console.log('No wallet credentials available for transaction fetch');
      setLoading(false);
      setTransactions([]);
      return;
    }
    
    console.log('Fetching Blink transaction history for active Blink wallet');
    
    try {
      setLoading(true);
      
      // ✅ ADDED: Fetch with 10 second timeout to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      try {
        // Build request headers
        // - With server session: rely on auth-token cookie (more secure)
        // - Without server session: include API key in header (fallback)
        const headers = {};
        if (apiKey && !hasServerSession) {
          headers['X-API-KEY'] = apiKey;
        }

        // Fetch transactions only (no balance for employee privacy)
        const transactionsRes = await fetch('/api/blink/transactions?first=100', {
          signal: controller.signal,
          headers,
          credentials: 'include' // Include cookies for session-based auth
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
          const errorData = await transactionsRes.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to fetch transactions');
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

  // Fetch split profiles from server
  const fetchSplitProfiles = useCallback(async () => {
    if (!publicKey) {
      console.log('[SplitProfiles] No public key available');
      return;
    }
    
    setSplitProfilesLoading(true);
    try {
      console.log('[SplitProfiles] Fetching profiles for:', publicKey);
      const response = await fetch(`/api/split-profiles?pubkey=${publicKey}`);
      
      if (response.ok) {
        const data = await response.json();
        setSplitProfiles(data.splitProfiles || []);
        
        // Set active profile
        if (data.activeSplitProfileId && data.splitProfiles) {
          const active = data.splitProfiles.find(p => p.id === data.activeSplitProfileId);
          setActiveSplitProfile(active || null);
          
          // If we have an active profile, enable tips and set the recipient
          if (active && active.recipients?.length > 0) {
            setTipsEnabled(true);
            setTipRecipient(active.recipients[0].username);
          }
        } else {
          setActiveSplitProfile(null);
        }
        
        console.log('[SplitProfiles] Loaded', data.splitProfiles?.length || 0, 'profiles');
      } else {
        console.error('[SplitProfiles] Failed to fetch:', response.status);
      }
    } catch (err) {
      console.error('[SplitProfiles] Error:', err);
    } finally {
      setSplitProfilesLoading(false);
    }
  }, [publicKey]);

  // Save split profile to server
  const saveSplitProfile = async (profile, setActive = false) => {
    if (!publicKey) return null;
    
    setSplitProfileError(null);
    try {
      const response = await fetch('/api/split-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pubkey: publicKey,
          profile,
          setActive
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        await fetchSplitProfiles(); // Refresh the list
        return data.profile;
      } else {
        const error = await response.json();
        setSplitProfileError(error.error || 'Failed to save profile');
        return null;
      }
    } catch (err) {
      console.error('[SplitProfiles] Save error:', err);
      setSplitProfileError('Failed to save profile');
      return null;
    }
  };

  // Delete split profile
  const deleteSplitProfile = async (profileId) => {
    if (!publicKey) return false;
    
    try {
      const response = await fetch('/api/split-profiles', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pubkey: publicKey,
          profileId
        })
      });
      
      if (response.ok) {
        await fetchSplitProfiles(); // Refresh the list
        return true;
      }
      return false;
    } catch (err) {
      console.error('[SplitProfiles] Delete error:', err);
      return false;
    }
  };

  // Set active split profile
  const setActiveSplitProfileById = async (profileId) => {
    if (!publicKey) return;
    
    if (!profileId) {
      // Deactivate - set to None
      setActiveSplitProfile(null);
      setTipsEnabled(false);
      setTipRecipient('');
      
      // Save null active profile to server
      const userData = await fetch(`/api/split-profiles?pubkey=${publicKey}`).then(r => r.json());
      await fetch('/api/split-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pubkey: publicKey,
          profile: splitProfiles[0], // Need at least one profile to update activeSplitProfileId
          setActive: false
        })
      });
      return;
    }
    
    const profile = splitProfiles.find(p => p.id === profileId);
    if (profile) {
      // Update server with new active profile
      await saveSplitProfile(profile, true);
      
      // Local state update will happen via fetchSplitProfiles in saveSplitProfile
    }
  };

  // Validate recipient username (Blink username or npub.cash address)
  const validateRecipientUsername = useCallback(async (username) => {
    if (!username || username.trim() === '') {
      setRecipientValidation({ status: null, message: '', isValidating: false });
      return;
    }

    const input = username.trim();

    // Check if this is an npub.cash address
    if (isNpubCashAddress(input)) {
      setRecipientValidation({ status: null, message: '', isValidating: true });
      
      try {
        // Validate the npub.cash address format
        const validation = validateNpubCashAddress(input);
        if (!validation.valid) {
          setRecipientValidation({ 
            status: 'error', 
            message: validation.error, 
            isValidating: false 
          });
          return;
        }

        // Probe the endpoint to confirm it responds
        const probeResult = await probeNpubCashAddress(input);
        
        if (probeResult.valid) {
          setRecipientValidation({ 
            status: 'success', 
            message: `Valid npub.cash address (${probeResult.minSats}-${probeResult.maxSats?.toLocaleString()} sats)`,
            isValidating: false,
            type: 'npub_cash',
            address: input
          });
        } else {
          setRecipientValidation({ 
            status: 'error', 
            message: probeResult.error || 'Could not reach npub.cash endpoint', 
            isValidating: false 
          });
        }
      } catch (err) {
        console.error('npub.cash validation error:', err);
        setRecipientValidation({ 
          status: 'error', 
          message: err.message || 'Failed to validate npub.cash address', 
          isValidating: false 
        });
      }
      return;
    }

    // Otherwise, validate as Blink username
    // Clean username input - strip @blink.sv if user enters full Lightning Address
    let cleanedUsername = input;
    if (cleanedUsername.includes('@blink.sv')) {
      cleanedUsername = cleanedUsername.replace('@blink.sv', '').trim();
    }
    if (cleanedUsername.includes('@')) {
      cleanedUsername = cleanedUsername.split('@')[0].trim();
    }

    setRecipientValidation({ status: null, message: '', isValidating: true });

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
        body: JSON.stringify({ query, variables }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.errors) {
        const errorMessage = data.errors[0].message;
        if (errorMessage.includes('Invalid value for Username')) {
          setRecipientValidation({ 
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
        setRecipientValidation({ 
          status: 'success', 
          message: 'Blink user found', 
          isValidating: false,
          type: 'blink'
        });
      } else {
        setRecipientValidation({ 
          status: 'error', 
          message: 'Blink username not found. For npub.cash, enter full address (e.g., npub1xxx@npub.cash)', 
          isValidating: false 
        });
      }
    } catch (err) {
      console.error('Recipient validation error:', err);
      setRecipientValidation({ 
        status: 'error', 
        message: 'Validation failed', 
        isValidating: false 
      });
    }
  }, []);

  // Debounced recipient username validation for current input
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      validateRecipientUsername(newRecipientInput);
    }, 500); // 500ms delay

    return () => clearTimeout(timeoutId);
  }, [newRecipientInput, validateRecipientUsername]);

  // Add a validated recipient to the list
  const addRecipientToProfile = useCallback(() => {
    if (recipientValidation.status !== 'success' || !newRecipientInput.trim()) return;
    
    // Use the address from validation for npub.cash, or cleaned username for Blink
    const recipientType = recipientValidation.type || 'blink';
    const recipientAddress = recipientType === 'npub_cash' 
      ? recipientValidation.address 
      : newRecipientInput.trim().toLowerCase().replace('@blink.sv', '');
    
    // Check if already added
    if (newSplitProfileRecipients.some(r => r.username === recipientAddress)) {
      setSplitProfileError('This recipient is already added');
      return;
    }
    
    setNewSplitProfileRecipients(prev => [...prev, { 
      username: recipientAddress, 
      validated: true,
      type: recipientType  // 'blink' or 'npub_cash'
    }]);
    setNewRecipientInput('');
    setRecipientValidation({ status: null, message: '', isValidating: false });
    setSplitProfileError(null);
  }, [recipientValidation.status, recipientValidation.type, recipientValidation.address, newRecipientInput, newSplitProfileRecipients]);

  // Remove a recipient from the list
  const removeRecipientFromProfile = useCallback((username) => {
    setNewSplitProfileRecipients(prev => prev.filter(r => r.username !== username));
  }, []);

  // Fetch split profiles when user is authenticated
  useEffect(() => {
    if (publicKey && authMode === 'nostr') {
      fetchSplitProfiles();
    }
  }, [publicKey, authMode, fetchSplitProfiles]);

  // Load more historical transactions to populate older months
  const loadMoreHistoricalTransactions = async (cursor, currentTransactions) => {
    try {
      // Load several batches to get a good historical view
      let allTransactions = [...currentTransactions];
      let nextCursor = cursor;
      let hasMore = true;
      let batchCount = 0;
      const maxBatches = 5; // Load up to 5 more batches (500 more transactions)
      
      // Build request headers
      // With server session: rely on cookie; without: include API key
      const headers = {};
      if (apiKey && !hasServerSession) {
        headers['X-API-KEY'] = apiKey;
      }
      
      while (hasMore && batchCount < maxBatches) {
        const response = await fetch(`/api/blink/transactions?first=100&after=${nextCursor}`, { headers, credentials: 'include' });
        
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
      // Build request headers
      const headers = {};
      if (apiKey && !hasServerSession) {
        headers['X-API-KEY'] = apiKey;
      }
      
      const lastTransaction = transactions[transactions.length - 1];
      const response = await fetch(`/api/blink/transactions?first=100&after=${lastTransaction?.cursor || ''}`, { headers, credentials: 'include' });
      
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

  // Export all transactions to CSV using official Blink CSV export
  const exportFullTransactions = async () => {
    setExportingData(true);
    try {
      console.log('Starting full transaction export using Blink official CSV...');
      
      // Get all wallet IDs
      const walletIds = wallets.map(w => w.id);
      
      if (walletIds.length === 0) {
        throw new Error('No wallets found. Please ensure you are logged in.');
      }
      
      console.log(`Exporting CSV for wallets: ${walletIds.join(', ')}`);
      
      // Build request headers
      const headers = {
        'Content-Type': 'application/json',
      };
      if (apiKey && !hasServerSession) {
        headers['X-API-KEY'] = apiKey;
      }
      
      // Call the CSV export API
      const response = await fetch('/api/blink/csv-export', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ walletIds })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `API returned ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.csv) {
        throw new Error('No CSV data received from API');
      }
      
      const csv = data.csv;
      console.log(`CSV received, length: ${csv.length} characters`);
      
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
      
      // Build request headers
      const headers = {};
      if (apiKey && !hasServerSession) {
        headers['X-API-KEY'] = apiKey;
      }
      
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
        
        const response = await fetch(url, { headers, credentials: 'include' });
        
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
    // - On Cart screen (not showing any overlay)
    // - On POS numpad screen (not showing invoice/tips)
    // - On transactions screen
    // Navigation order: Cart ← → POS ← → Transactions
    // Left swipe: Cart → POS → Transactions
    // Right swipe: Transactions → POS → Cart
    if (isLeftSwipe && !showingInvoice) {
      if (currentView === 'cart') {
        setCurrentView('pos');
      } else if (currentView === 'pos') {
        setCurrentView('transactions');
      }
    } else if (isRightSwipe) {
      if (currentView === 'transactions') {
        setCurrentView('pos');
      } else if (currentView === 'pos' && !showingInvoice) {
        setCurrentView('cart');
      }
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
              {/* Blink Logo - Left (tap to toggle dark mode) */}
              <button 
                onClick={toggleDarkMode}
                className="flex items-center focus:outline-none"
                aria-label="Toggle dark mode"
              >
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
              </button>
              
              {/* Navigation Dots - Center */}
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentView('cart')}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    currentView === 'cart'
                      ? 'bg-blink-accent'
                      : 'bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500'
                  }`}
                  aria-label="Cart"
                />
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
              
              {/* Right Side: Menu Button */}
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
        </header>
      )}

      {/* Full Screen Menu */}
      {sideMenuOpen && (
        <div className="fixed inset-0 bg-white dark:bg-black z-50 overflow-y-auto">
          <div className="min-h-screen" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
            {/* Header */}
            <div className="bg-gray-50 dark:bg-blink-dark shadow dark:shadow-black sticky top-0 z-10">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16">
                  <button
                    onClick={() => setSideMenuOpen(false)}
                    className="flex items-center text-gray-700 dark:text-white hover:text-blink-accent dark:hover:text-blink-accent"
                  >
                    <span className="text-2xl mr-2">‹</span>
                    <span className="text-lg">Back</span>
                  </button>
                  <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                    Menu
                  </h1>
                  <div className="w-16"></div>
                </div>
              </div>
            </div>

            {/* Menu Content */}
            <div className="max-w-md mx-auto px-4 py-6">
              <div className="space-y-4">
                {/* Profile Info */}
                <div className={`rounded-lg p-4 ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
                  <div className="flex items-center gap-3">
                    {/* Avatar */}
                    {authMode === 'nostr' && nostrProfile?.picture ? (
                      <img 
                        src={nostrProfile.picture} 
                        alt="Profile"
                        className="w-10 h-10 rounded-full object-cover ring-2 ring-purple-500/30"
                        onError={(e) => {
                          // Fallback to default avatar on error
                          e.target.style.display = 'none';
                          e.target.nextElementSibling.style.display = 'flex';
                        }}
                      />
                    ) : null}
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      authMode === 'nostr' ? 'bg-purple-500/20' : 'bg-blink-accent/20'
                    }`} style={{ display: (authMode === 'nostr' && nostrProfile?.picture) ? 'none' : 'flex' }}>
                      <svg className={`w-5 h-5 ${authMode === 'nostr' ? 'text-purple-400' : 'text-blink-accent'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-medium text-blink-accent truncate">
                        {authMode === 'nostr' 
                          ? (nostrProfile?.display_name || nostrProfile?.name || user?.username || 'Nostr User')
                          : (user?.username || 'User')}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Wallet */}
                <button
                  onClick={() => setShowAccountSettings(true)}
                  className={`w-full rounded-lg p-4 ${darkMode ? 'bg-gray-900 hover:bg-gray-800' : 'bg-gray-50 hover:bg-gray-100'} transition-colors`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">Wallet</span>
                    <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                      <span>{activeNWC ? activeNWC.label : activeNpubCashWallet ? (activeNpubCashWallet.label || activeNpubCashWallet.lightningAddress) : (activeBlinkAccount?.label || activeBlinkAccount?.username || 'None')}</span>
                      <span className="ml-1">›</span>
                    </div>
                  </div>
                </button>

                {/* Currency Selection */}
                <button
                  onClick={() => setShowCurrencySettings(true)}
                  className={`w-full rounded-lg p-4 ${darkMode ? 'bg-gray-900 hover:bg-gray-800' : 'bg-gray-50 hover:bg-gray-100'} transition-colors`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">Display Currency</span>
                    <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                      <span>{displayCurrency}</span>
                      <span className="ml-1">›</span>
                    </div>
                  </div>
                </button>

                {/* Payment Splits */}
                <button
                  onClick={() => setShowTipSettings(true)}
                  className={`w-full rounded-lg p-4 ${darkMode ? 'bg-gray-900 hover:bg-gray-800' : 'bg-gray-50 hover:bg-gray-100'} transition-colors`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">Payment Splits</span>
                    <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                      <span>{activeSplitProfile?.label || 'None'}</span>
                      <span className="ml-1">›</span>
                    </div>
                  </div>
                </button>

                {/* Tip Settings */}
                <button
                  onClick={() => setShowTipProfileSettings(true)}
                  className={`w-full rounded-lg p-4 ${darkMode ? 'bg-gray-900 hover:bg-gray-800' : 'bg-gray-50 hover:bg-gray-100'} transition-colors`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">Tip Settings</span>
                    <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                      <span>{activeTipProfile?.name || 'Custom'}</span>
                      <span className="ml-1">›</span>
                    </div>
                  </div>
                </button>

                {/* Sound Effects */}
                <button
                  onClick={() => setShowSoundThemes(true)}
                  className={`w-full rounded-lg p-4 ${darkMode ? 'bg-gray-900 hover:bg-gray-800' : 'bg-gray-50 hover:bg-gray-100'} transition-colors`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">Sound Effects</span>
                    <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                      <span>{!soundEnabled ? 'None' : soundTheme === 'success' ? 'Success' : soundTheme === 'zelda' ? 'Zelda' : soundTheme === 'free' ? 'Free' : soundTheme === 'retro' ? 'Retro' : 'None'}</span>
                      <span className="ml-1">›</span>
                    </div>
                  </div>
                </button>

                {/* Key Management (for generated accounts) */}
                {authMode === 'nostr' && (
                  <button
                    onClick={() => {
                      setShowKeyManagement(true);
                      setSideMenuOpen(false);
                    }}
                    className={`w-full rounded-lg p-4 ${darkMode ? 'bg-gray-900 hover:bg-gray-800' : 'bg-gray-50 hover:bg-gray-100'} transition-colors`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">Key Management</span>
                      <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                        </svg>
                        <span className="ml-1">›</span>
                      </div>
                    </div>
                  </button>
                )}

                {/* Action Buttons */}
                <div className="space-y-3 pt-4">
                  {showInstallPrompt && (
                    <button
                      onClick={() => {
                        handleInstallApp();
                        setSideMenuOpen(false);
                      }}
                      className="w-full py-3 bg-green-500 hover:bg-green-600 text-white rounded-lg text-base font-medium transition-colors flex items-center justify-center gap-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                    className="w-full py-3 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-base font-medium transition-colors"
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Key Management Overlay */}
      {showKeyManagement && (
        <div className="fixed inset-0 bg-white dark:bg-black z-50 overflow-y-auto">
          <div className="min-h-screen">
            {/* Header */}
            <div className="bg-gray-50 dark:bg-blink-dark shadow dark:shadow-black sticky top-0 z-10">
              <div className="max-w-md mx-auto px-4 py-4">
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setShowKeyManagement(false)}
                    className="flex items-center text-gray-600 dark:text-gray-400 text-base"
                  >
                    <svg className="w-6 h-6 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                    </svg>
                    Back
                  </button>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">Key Management</h2>
                  <div className="w-16"></div>
                </div>
              </div>
            </div>
            {/* Content */}
            <div className="max-w-md mx-auto px-4 py-6">
              <KeyManagementSection />
            </div>
          </div>
        </div>
      )}

      {/* Themes Overlay */}
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
                    Themes
                  </h1>
                  <div className="w-16"></div>
                </div>
              </div>
            </div>

            {/* Themes List */}
            <div className="max-w-md mx-auto px-4 py-6">
              <div className="space-y-3">
                {/* None Option */}
                <button
                  onClick={() => {
                    setSoundEnabled(false);
                    setShowSoundThemes(false);
                  }}
                  className={`w-full p-4 rounded-lg border-2 transition-all ${
                    !soundEnabled
                      ? 'border-blue-600 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-blink-dark hover:border-gray-400 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-left">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
                        None
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Sound effects disabled
                      </p>
                    </div>
                    {!soundEnabled && (
                      <div className="text-blue-600 dark:text-blue-400 text-2xl">✓</div>
                    )}
                  </div>
                </button>

                {/* Success Theme */}
                <button
                  onClick={() => {
                    setSoundEnabled(true);
                    setSoundTheme('success');
                    setShowSoundThemes(false);
                  }}
                  className={`w-full p-4 rounded-lg border-2 transition-all ${
                    soundEnabled && soundTheme === 'success'
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
                    {soundEnabled && soundTheme === 'success' && (
                      <div className="text-blue-600 dark:text-blue-400 text-2xl">✓</div>
                    )}
                  </div>
                </button>

                {/* Zelda Theme */}
                <button
                  onClick={() => {
                    setSoundEnabled(true);
                    setSoundTheme('zelda');
                    setShowSoundThemes(false);
                  }}
                  className={`w-full p-4 rounded-lg border-2 transition-all ${
                    soundEnabled && soundTheme === 'zelda'
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
                    {soundEnabled && soundTheme === 'zelda' && (
                      <div className="text-blue-600 dark:text-blue-400 text-2xl">✓</div>
                    )}
                  </div>
                </button>

                {/* Free Theme */}
                <button
                  onClick={() => {
                    setSoundEnabled(true);
                    setSoundTheme('free');
                    setShowSoundThemes(false);
                  }}
                  className={`w-full p-4 rounded-lg border-2 transition-all ${
                    soundEnabled && soundTheme === 'free'
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
                    {soundEnabled && soundTheme === 'free' && (
                      <div className="text-blue-600 dark:text-blue-400 text-2xl">✓</div>
                    )}
                  </div>
                </button>

                {/* Retro Theme */}
                <button
                  onClick={() => {
                    setSoundEnabled(true);
                    setSoundTheme('retro');
                    setShowSoundThemes(false);
                  }}
                  className={`w-full p-4 rounded-lg border-2 transition-all ${
                    soundEnabled && soundTheme === 'retro'
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
                    {soundEnabled && soundTheme === 'retro' && (
                      <div className="text-blue-600 dark:text-blue-400 text-2xl">✓</div>
                    )}
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tip Profile Settings Overlay */}
      {showTipProfileSettings && (
        <div className="fixed inset-0 bg-white dark:bg-black z-50 overflow-y-auto">
          <div className="min-h-screen" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
            {/* Header */}
            <div className="bg-gray-50 dark:bg-blink-dark shadow dark:shadow-black sticky top-0 z-10">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16">
                  <button
                    onClick={() => setShowTipProfileSettings(false)}
                    className="flex items-center text-gray-700 dark:text-white hover:text-blink-accent dark:hover:text-blink-accent"
                  >
                    <span className="text-2xl mr-2">‹</span>
                    <span className="text-lg">Back</span>
                  </button>
                  <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                    Tip Settings
                  </h1>
                  <div className="w-16"></div>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="max-w-md mx-auto px-4 py-6">
              <div className="space-y-4">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Select a tip profile based on your region. This determines the tip percentages shown to customers.
                </p>

                {/* Custom Option (No Profile) */}
                <div
                  className={`w-full p-4 rounded-lg border-2 transition-all ${
                    !activeTipProfile
                      ? 'border-blink-accent bg-blink-accent/10'
                      : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-blink-dark'
                  }`}
                >
                  <button
                    onClick={() => {
                      setActiveTipProfile(null);
                    }}
                    className="w-full"
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-left">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                          Custom
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Set your own tip percentages
                        </p>
                      </div>
                      {!activeTipProfile && (
                        <div className="text-blink-accent text-2xl">✓</div>
                      )}
                    </div>
                  </button>

                  {/* Custom Tip Percentages Editor (only visible when Custom is selected) */}
                  {!activeTipProfile && (
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                        Custom Tip Percentages
                      </label>
                      <div className="flex flex-wrap gap-2">
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
                              className="w-16 px-2 py-2 text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded text-center"
                              min="0"
                              max="100"
                              step="0.5"
                            />
                            <span className="ml-1 text-gray-500 dark:text-gray-400">%</span>
                            {tipPresets.length > 1 && (
                              <button
                                onClick={() => setTipPresets(tipPresets.filter((_, i) => i !== index))}
                                className="ml-2 text-red-500 hover:text-red-700"
                              >
                                ×
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={() => setTipPresets([...tipPresets, 5])}
                        className="mt-3 px-4 py-2 text-sm bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded transition-colors"
                      >
                        Add Option
                      </button>
                    </div>
                  )}
                </div>

                {/* Predefined Profiles */}
                {TIP_PROFILES.map((profile) => (
                  <button
                    key={profile.id}
                    onClick={() => {
                      setActiveTipProfile(profile);
                      setShowTipProfileSettings(false);
                    }}
                    className={`w-full p-4 rounded-lg border-2 transition-all ${
                      activeTipProfile?.id === profile.id
                        ? 'border-blink-accent bg-blink-accent/10'
                        : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-blink-dark hover:border-gray-400 dark:hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-left">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                          {profile.name}
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {profile.tipOptions.join('%, ')}%
                        </p>
                      </div>
                      {activeTipProfile?.id === profile.id && (
                        <div className="text-blink-accent text-2xl">✓</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Split Settings Overlay */}
      {showTipSettings && !showCreateSplitProfile && (
        <div className="fixed inset-0 bg-white dark:bg-black z-50 overflow-y-auto">
          <div className="min-h-screen" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
            {/* Header */}
            <div className="bg-gray-50 dark:bg-blink-dark shadow dark:shadow-black sticky top-0 z-10">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16">
                  <button
                    onClick={() => setShowTipSettings(false)}
                    className="flex items-center text-gray-700 dark:text-white hover:text-blink-accent dark:hover:text-blink-accent"
                  >
                    <span className="text-2xl mr-2">‹</span>
                    <span className="text-lg">Back</span>
                  </button>
                  <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                    Payment Splits
                  </h1>
                  <div className="w-16"></div>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="max-w-md mx-auto px-4 py-6">
              <div className="space-y-4">
                {/* Create New Profile Button */}
                {authMode === 'nostr' && (
                  <button
                    onClick={() => {
                      setEditingSplitProfile(null);
                      setNewSplitProfileLabel('');
                      setNewSplitProfileRecipients([]);
                      setNewRecipientInput('');
                      setRecipientValidation({ status: null, message: '', isValidating: false });
                      setSplitProfileError(null);
                      setShowCreateSplitProfile(true);
                    }}
                    className="w-full py-3 text-sm font-medium bg-blink-accent text-black rounded-lg hover:bg-blink-accent/90 transition-colors flex items-center justify-center gap-2"
                  >
                    <span className="text-lg">+</span>
                    <span>New Split Profile</span>
                  </button>
                )}

                {/* None Option */}
                <button
                  onClick={() => {
                    setActiveSplitProfileById(null);
                    setShowTipSettings(false);
                  }}
                  className={`w-full p-4 rounded-lg border-2 transition-all ${
                    !activeSplitProfile
                      ? 'border-blue-600 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-blink-dark hover:border-gray-400 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-left">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                        None
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Payment splits disabled
                      </p>
                    </div>
                    {!activeSplitProfile && (
                      <div className="text-blue-600 dark:text-blue-400 text-2xl">✓</div>
                    )}
                  </div>
                </button>

                {/* Loading State */}
                {splitProfilesLoading && (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blink-accent"></div>
                  </div>
                )}

                {/* Split Profiles List */}
                {!splitProfilesLoading && splitProfiles.map((profile) => (
                  <div
                    key={profile.id}
                    className={`w-full p-4 rounded-lg border-2 transition-all ${
                      activeSplitProfile?.id === profile.id
                        ? 'border-blue-600 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-blink-dark'
                    }`}
                  >
                    <button
                      onClick={() => {
                        setActiveSplitProfileById(profile.id);
                        setShowTipSettings(false);
                      }}
                      className="w-full"
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-left">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                            {profile.label}
                          </h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {profile.recipients.map(r => r.type === 'npub_cash' ? r.username : `${r.username}@blink.sv`).join(', ')}
                          </p>
                        </div>
                        {activeSplitProfile?.id === profile.id && (
                          <div className="text-blue-600 dark:text-blue-400 text-2xl">✓</div>
                        )}
                      </div>
                    </button>
                    {/* Edit/Delete Actions */}
                    <div className="flex gap-2 mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                      <button
                        onClick={() => {
                          setEditingSplitProfile(profile);
                          setNewSplitProfileLabel(profile.label);
                          // Initialize recipients array from profile
                          setNewSplitProfileRecipients(
                            profile.recipients?.map(r => ({ username: r.username, validated: true, type: r.type || 'blink' })) || []
                          );
                          setNewRecipientInput('');
                          setRecipientValidation({ status: null, message: '', isValidating: false });
                          setSplitProfileError(null);
                          setShowCreateSplitProfile(true);
                        }}
                        className="flex-1 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-blink-accent border border-gray-300 dark:border-gray-600 rounded"
                      >
                        Edit
                      </button>
                      <button
                        onClick={async () => {
                          if (confirm('Delete this split profile?')) {
                            await deleteSplitProfile(profile.id);
                          }
                        }}
                        className="flex-1 py-2 text-sm text-red-500 hover:text-red-700 border border-gray-300 dark:border-gray-600 rounded"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}

                {/* No Profiles Yet Message */}
                {!splitProfilesLoading && splitProfiles.length === 0 && authMode === 'nostr' && (
                  <div className={`rounded-lg p-6 text-center ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
                    <p className="text-gray-600 dark:text-gray-400 mb-2">
                      No split profiles yet
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-500">
                      Create a split profile to automatically share a portion of payments with another Blink user.
                    </p>
                  </div>
                )}

                {/* Not Signed In Message */}
                {authMode !== 'nostr' && (
                  <div className={`rounded-lg p-6 text-center ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
                    <p className="text-gray-600 dark:text-gray-400 mb-2">
                      Sign in with Nostr to use split profiles
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-500">
                      Split profiles are synced across devices and require Nostr authentication.
                    </p>
                  </div>
                )}

              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Split Profile Overlay */}
      {showCreateSplitProfile && (
        <div className="fixed inset-0 bg-white dark:bg-black z-50 overflow-y-auto">
          <div className="min-h-screen" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
            {/* Header */}
            <div className="bg-gray-50 dark:bg-blink-dark shadow dark:shadow-black sticky top-0 z-10">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16">
                  <button
                    onClick={() => {
                      setShowCreateSplitProfile(false);
                      setEditingSplitProfile(null);
                    }}
                    className="flex items-center text-gray-700 dark:text-white hover:text-blink-accent dark:hover:text-blink-accent"
                  >
                    <span className="text-2xl mr-2">‹</span>
                    <span className="text-lg">Back</span>
                  </button>
                  <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                    {editingSplitProfile ? 'Edit Profile' : 'New Profile'}
                  </h1>
                  <div className="w-16"></div>
                </div>
              </div>
            </div>

            {/* Form Content */}
            <div className="max-w-md mx-auto px-4 py-6">
              <div className="space-y-4">
                {/* Error Message */}
                {splitProfileError && (
                  <div className="p-3 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-lg">
                    <p className="text-sm text-red-700 dark:text-red-400">{splitProfileError}</p>
                  </div>
                )}

                {/* Profile Label */}
                <div className={`rounded-lg p-4 ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
                  <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                    Profile Name
                  </label>
                  <input
                    type="text"
                    value={newSplitProfileLabel}
                    onChange={(e) => setNewSplitProfileLabel(e.target.value)}
                    placeholder="e.g., Staff Tips, Partner Split"
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blink-accent focus:border-transparent"
                  />
                </div>

                {/* Recipients */}
                <div className={`rounded-lg p-4 ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
                  <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                    Recipients
                  </label>
                  
                  {/* Added Recipients List */}
                  {newSplitProfileRecipients.length > 0 && (
                    <div className="mb-3 space-y-2">
                      {newSplitProfileRecipients.map((recipient, index) => (
                        <div key={recipient.username} className="flex items-center justify-between px-3 py-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
                          <span className="text-sm text-green-700 dark:text-green-400">
                            {recipient.type === 'npub_cash' ? recipient.username : `${recipient.username}@blink.sv`}
                          </span>
                          <button
                            onClick={() => removeRecipientFromProfile(recipient.username)}
                            className="text-red-500 hover:text-red-700 text-lg font-bold"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Split will be divided evenly ({(100 / newSplitProfileRecipients.length).toFixed(1)}% each)
                      </p>
                    </div>
                  )}

                  {/* Add New Recipient Input */}
                  <div className="relative">
                    <input
                      type="text"
                      value={newRecipientInput}
                      onChange={(e) => {
                        const value = e.target.value.replace(/@blink\.sv$/, '');
                        setNewRecipientInput(value);
                      }}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && recipientValidation.status === 'success') {
                          e.preventDefault();
                          addRecipientToProfile();
                        }
                      }}
                      placeholder="Blink username or npub1...@npub.cash"
                      className={`w-full px-3 py-2 text-sm border rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blink-accent focus:border-transparent ${
                        recipientValidation.status === 'success' ? 'border-green-500' :
                        recipientValidation.status === 'error' ? 'border-red-500' :
                        'border-gray-300 dark:border-gray-600'
                      }`}
                    />
                    {recipientValidation.isValidating && (
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blink-accent"></div>
                      </div>
                    )}
                    {recipientValidation.status === 'success' && (
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-green-500">✓</div>
                    )}
                  </div>
                  {recipientValidation.message && recipientValidation.status === 'error' && (
                    <p className="text-xs mt-1 text-red-500">{recipientValidation.message}</p>
                  )}
                  {recipientValidation.status === 'success' && newRecipientInput && (
                    <button
                      onClick={addRecipientToProfile}
                      className="mt-2 w-full py-2 text-sm font-medium bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors"
                    >
                      Add {recipientValidation.type === 'npub_cash' ? recipientValidation.address : `${newRecipientInput}@blink.sv`}
                    </button>
                  )}
                  {newSplitProfileRecipients.length === 0 && (
                    <p className="text-xs mt-2 text-gray-500 dark:text-gray-400">
                      Add at least one recipient for the split
                    </p>
                  )}
                </div>

                {/* Save Button */}
                <button
                  onClick={async () => {
                    if (!newSplitProfileLabel.trim()) {
                      setSplitProfileError('Please enter a profile name');
                      return;
                    }
                    if (newSplitProfileRecipients.length === 0) {
                      setSplitProfileError('Please add at least one recipient');
                      return;
                    }
                    
                    // Calculate equal shares
                    const sharePerRecipient = 100 / newSplitProfileRecipients.length;
                    
                    const profile = {
                      id: editingSplitProfile?.id,
                      label: newSplitProfileLabel.trim(),
                      recipients: newSplitProfileRecipients.map(r => ({
                        username: r.username,
                        type: r.type || 'blink',  // 'blink' or 'npub_cash'
                        share: sharePerRecipient
                      }))
                    };
                    
                    const saved = await saveSplitProfile(profile, true);
                    if (saved) {
                      setShowCreateSplitProfile(false);
                      setEditingSplitProfile(null);
                      setShowTipSettings(false);
                    }
                  }}
                  disabled={!newSplitProfileLabel.trim() || newSplitProfileRecipients.length === 0}
                  className="w-full py-3 text-sm font-medium bg-blink-accent text-black rounded-lg hover:bg-blink-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {editingSplitProfile ? 'Save Changes' : 'Create Profile'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Currency Settings Overlay */}
      {showCurrencySettings && (
        <div className="fixed inset-0 bg-white dark:bg-black z-50 overflow-y-auto">
          <div className="min-h-screen" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
            {/* Header */}
            <div className="bg-gray-50 dark:bg-blink-dark shadow dark:shadow-black sticky top-0 z-10">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16">
                  <button
                    onClick={() => setShowCurrencySettings(false)}
                    className="flex items-center text-gray-700 dark:text-white hover:text-blink-accent dark:hover:text-blink-accent"
                  >
                    <span className="text-2xl mr-2">‹</span>
                    <span className="text-lg">Back</span>
                  </button>
                  <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                    Currency
                  </h1>
                  <div className="w-16"></div>
                </div>
              </div>
            </div>

            {/* Currency List */}
            <div className="max-w-md mx-auto px-4 py-6">
              <div className="space-y-2">
                {currenciesLoading ? (
                  <div className="text-center py-4 text-gray-500">Loading...</div>
                ) : (
                  getAllCurrencies().map((currency) => (
                    <button
                      key={currency.id}
                      onClick={() => {
                        setDisplayCurrency(currency.id);
                        setShowCurrencySettings(false);
                      }}
                      className={`w-full p-3 rounded-lg text-left transition-all ${
                        displayCurrency === currency.id
                          ? 'bg-blink-accent/20 border-2 border-blink-accent'
                          : darkMode
                            ? 'bg-gray-900 hover:bg-gray-800 border-2 border-transparent'
                            : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                          {currency.flag ? `${currency.flag} ` : ''}{currency.id} - {currency.name}
                        </span>
                        {displayCurrency === currency.id && (
                          <svg className="w-5 h-5 text-blink-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Wallets Overlay */}
      {showAccountSettings && (
        <div className="fixed inset-0 bg-white dark:bg-black z-50 overflow-y-auto">
          <div className="min-h-screen" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
            {/* Header */}
            <div className="bg-gray-50 dark:bg-blink-dark shadow dark:shadow-black sticky top-0 z-10">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16">
                  <button
                    onClick={() => {
                      setShowAccountSettings(false);
                      setShowAddAccountForm(false);
                      setNewAccountApiKey('');
                      setNewAccountLabel('');
                      setNewAccountNwcUri('');
                      setNewAccountLnAddress('');
                      setNewAccountType(null);
                      setAddAccountError(null);
                      setNwcValidated(null);
                      setLnAddressValidated(null);
                      setConfirmDeleteWallet(null);
                    }}
                    className="flex items-center text-gray-700 dark:text-white hover:text-blink-accent dark:hover:text-blink-accent"
                  >
                    <span className="text-2xl mr-2">‹</span>
                    <span className="text-lg">Back</span>
                  </button>
                  <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                    Wallets
                  </h1>
                  <div className="w-16"></div>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="max-w-md mx-auto px-4 py-6">
              <div className="space-y-4">
                {/* Add Wallet Button */}
                {authMode === 'nostr' && !showAddAccountForm && (
                  <button
                    onClick={() => setShowAddAccountForm(true)}
                    className="w-full py-3 text-sm font-medium bg-blink-accent text-black rounded-lg hover:bg-blink-accent/90 transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                    </svg>
                    Add Wallet
                  </button>
                )}

                {/* Add Wallet Form - Step 1: Label */}
                {showAddAccountForm && !newAccountType && (
                  <div className={`rounded-lg p-4 ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
                    <h3 className={`text-sm font-medium mb-3 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      Step 1: Name Your Wallet
                    </h3>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Label</label>
                        <input
                          type="text"
                          value={newAccountLabel}
                          onChange={(e) => setNewAccountLabel(e.target.value)}
                          placeholder="My Wallet"
                          className={`w-full px-3 py-2 rounded-md border text-sm ${
                            darkMode 
                              ? 'bg-gray-800 border-gray-600 text-white placeholder-gray-500' 
                              : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                          } focus:outline-none focus:ring-2 focus:ring-blink-accent focus:border-transparent`}
                        />
                      </div>
                      
                      <h3 className={`text-sm font-medium pt-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                        Step 2: Choose Wallet Type
                      </h3>
                      
                      {/* Wallet Type Selection */}
                      <div className="space-y-2">
                        {/* Blink Lightning Address - Recommended, first option */}
                        <button
                          type="button"
                          onClick={() => setNewAccountType('blink-ln-address')}
                          className={`w-full p-3 rounded-lg border-2 text-left transition-all hover:scale-[1.01] ${
                            darkMode 
                              ? 'border-amber-500/40 bg-amber-900/20 hover:border-amber-500/60' 
                              : 'border-amber-300 bg-amber-50 hover:border-amber-400'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">⚡</span>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className={`font-medium text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>Blink Lightning Address</span>
                                <span className="px-1.5 py-0.5 text-xs font-medium rounded bg-amber-500 text-black">Recommended</span>
                              </div>
                              <p className={`text-xs mt-0.5 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Simple setup with username</p>
                            </div>
                          </div>
                        </button>
                        
                        <div className="grid grid-cols-2 gap-2">
                          {/* Blink API Key */}
                          <button
                            type="button"
                            onClick={() => setNewAccountType('blink')}
                            className={`p-3 rounded-lg border-2 text-center transition-all hover:scale-[1.02] ${
                              darkMode 
                                ? 'border-gray-600 bg-gray-800 hover:border-gray-500' 
                                : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                            }`}
                          >
                            <svg className={`w-6 h-6 mx-auto mb-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                            </svg>
                            <span className={`font-medium text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>Blink API</span>
                            <p className={`text-xs mt-0.5 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Full features</p>
                          </button>
                          
                          {/* NWC */}
                          <button
                            type="button"
                            onClick={() => setNewAccountType('nwc')}
                            className={`p-3 rounded-lg border-2 text-center transition-all hover:scale-[1.02] ${
                              darkMode 
                                ? 'border-purple-500/30 bg-purple-900/10 hover:border-purple-500/50' 
                                : 'border-purple-200 bg-purple-50 hover:border-purple-300'
                            }`}
                          >
                            <svg className="w-6 h-6 mx-auto mb-1 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            <span className={`font-medium text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>NWC</span>
                            <p className={`text-xs mt-0.5 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Any wallet</p>
                          </button>
                        </div>
                        
                        {/* npub.cash - Full width below the 2-column grid */}
                        <button
                          type="button"
                          onClick={() => setNewAccountType('npub-cash')}
                          className={`w-full p-3 rounded-lg border-2 text-left transition-all hover:scale-[1.01] ${
                            darkMode 
                              ? 'border-teal-500/40 bg-teal-900/20 hover:border-teal-500/60' 
                              : 'border-teal-300 bg-teal-50 hover:border-teal-400'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">🥜</span>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className={`font-medium text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>npub.cash (Cashu)</span>
                                <span className="px-1.5 py-0.5 text-xs font-medium rounded bg-teal-500 text-white">Zero Fees</span>
                              </div>
                              <p className={`text-xs mt-0.5 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Receive payments as Cashu ecash tokens</p>
                            </div>
                          </div>
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setShowAddAccountForm(false);
                          setNewAccountLabel('');
                          setAddAccountError(null);
                        }}
                        className={`w-full py-2 text-sm font-medium rounded-md transition-colors ${
                          darkMode 
                            ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' 
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Add Wallet Form - Step 2: Blink API Key */}
                {showAddAccountForm && newAccountType === 'blink' && (
                  <div className={`rounded-lg p-4 ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
                    <div className="flex items-center gap-2 mb-3">
                      <button
                        onClick={() => { setNewAccountType(null); setAddAccountError(null); }}
                        className={`p-1 rounded ${darkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-200'}`}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>
                      <h3 className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                        Add Blink Wallet
                      </h3>
                    </div>
                    <form onSubmit={async (e) => {
                      e.preventDefault();
                      if (!newAccountApiKey.trim()) {
                        setAddAccountError('Enter an API key');
                        return;
                      }
                      setAddAccountLoading(true);
                      setAddAccountError(null);
                      try {
                        const response = await fetch('https://api.blink.sv/graphql', {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            'X-API-KEY': newAccountApiKey.trim()
                          },
                          body: JSON.stringify({
                            query: 'query { me { id username defaultAccount { displayCurrency } } }'
                          })
                        });
                        if (!response.ok) throw new Error('Invalid API key');
                        const data = await response.json();
                        if (data.errors || !data.data?.me?.id) throw new Error('Invalid API key');
                        const result = await addBlinkAccount({
                          label: newAccountLabel.trim() || 'Blink Wallet',
                          apiKey: newAccountApiKey.trim(),
                          username: data.data.me.username,
                          defaultCurrency: data.data.me.defaultAccount?.displayCurrency || 'BTC'
                        });
                        if (!result.success) throw new Error(result.error || 'Failed to add wallet');
                        if (authMode === 'nostr') {
                          await storeBlinkAccountOnServer(
                            newAccountApiKey.trim(),
                            data.data.me.defaultAccount?.displayCurrency || 'BTC',
                            newAccountLabel || data.data.me.username
                          );
                        }
                        // Reset form
                        setNewAccountApiKey('');
                        setNewAccountLabel('');
                        setNewAccountType(null);
                        setShowAddAccountForm(false);
                      } catch (err) {
                        setAddAccountError(err.message);
                      } finally {
                        setAddAccountLoading(false);
                      }
                    }} className="space-y-3">
                      <div className={`p-2 rounded text-xs ${darkMode ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-600'}`}>
                        Label: <span className="font-medium">{newAccountLabel || 'Blink Wallet'}</span>
                      </div>
                      <div>
                        <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Blink API Key</label>
                        <input
                          type="password"
                          value={newAccountApiKey}
                          onChange={(e) => setNewAccountApiKey(e.target.value)}
                          placeholder="blink_..."
                          required
                          autoFocus
                          autoComplete="off"
                          data-1p-ignore="true"
                          data-lpignore="true"
                          className={`w-full px-3 py-2 rounded-md border text-sm ${
                            darkMode 
                              ? 'bg-gray-800 border-gray-600 text-white placeholder-gray-500' 
                              : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                          } focus:outline-none focus:ring-2 focus:ring-blink-accent focus:border-transparent`}
                        />
                        <p className={`text-xs mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                          Get from <a href="https://dashboard.blink.sv" target="_blank" rel="noopener noreferrer" className="text-blink-accent hover:underline">dashboard.blink.sv</a>
                        </p>
                      </div>
                      {addAccountError && (
                        <p className="text-sm text-red-500">{addAccountError}</p>
                      )}
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          disabled={addAccountLoading}
                          className="flex-1 py-2 bg-blink-accent text-black text-sm font-medium rounded-md hover:bg-blink-accent/90 disabled:opacity-50 transition-colors"
                        >
                          {addAccountLoading ? 'Validating...' : 'Add Wallet'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowAddAccountForm(false);
                            setNewAccountApiKey('');
                            setNewAccountLabel('');
                            setNewAccountType(null);
                            setAddAccountError(null);
                          }}
                          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                            darkMode 
                              ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' 
                              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                          }`}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {/* Add Wallet Form - Step 2: Blink Lightning Address */}
                {showAddAccountForm && newAccountType === 'blink-ln-address' && (
                  <div className={`rounded-lg p-4 ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
                    <div className="flex items-center gap-2 mb-3">
                      <button
                        onClick={() => { setNewAccountType(null); setAddAccountError(null); setLnAddressValidated(null); setNewAccountLnAddress(''); }}
                        className={`p-1 rounded ${darkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-200'}`}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>
                      <h3 className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                        Add Blink Lightning Address
                      </h3>
                    </div>
                    <form onSubmit={async (e) => {
                      e.preventDefault();
                      if (!lnAddressValidated) {
                        // Validate first
                        if (!newAccountLnAddress.trim()) {
                          setAddAccountError('Enter a username or lightning address');
                          return;
                        }
                        setLnAddressValidating(true);
                        setAddAccountError(null);
                        try {
                          const response = await fetch('/api/blink/validate-ln-address', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ lnAddress: newAccountLnAddress.trim() })
                          });
                          const data = await response.json();
                          if (!response.ok) {
                            setAddAccountError(data.error || 'Failed to validate');
                            setLnAddressValidating(false);
                            return;
                          }
                          setLnAddressValidated(data);
                        } catch (err) {
                          setAddAccountError(err.message || 'Validation failed');
                        } finally {
                          setLnAddressValidating(false);
                        }
                        return;
                      }
                      // Add the wallet
                      setAddAccountLoading(true);
                      setAddAccountError(null);
                      try {
                        const result = await addBlinkLnAddressWallet({
                          label: newAccountLabel.trim() || `${lnAddressValidated.username}@blink.sv`,
                          username: lnAddressValidated.username,
                          walletId: lnAddressValidated.walletId,
                          walletCurrency: lnAddressValidated.walletCurrency,
                          lightningAddress: lnAddressValidated.lightningAddress
                        });
                        if (!result.success) throw new Error(result.error || 'Failed to add wallet');
                        // Reset form
                        setNewAccountLnAddress('');
                        setNewAccountLabel('');
                        setNewAccountType(null);
                        setShowAddAccountForm(false);
                        setLnAddressValidated(null);
                      } catch (err) {
                        setAddAccountError(err.message);
                      } finally {
                        setAddAccountLoading(false);
                      }
                    }} className="space-y-3">
                      <div className={`p-2 rounded text-xs ${darkMode ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-600'}`}>
                        Label: <span className="font-medium">{newAccountLabel || 'Blink Wallet'}</span>
                      </div>
                      <div>
                        <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Blink Username</label>
                        <input
                          type="text"
                          value={newAccountLnAddress}
                          onChange={(e) => { setNewAccountLnAddress(e.target.value); setLnAddressValidated(null); setAddAccountError(null); }}
                          placeholder="username or username@blink.sv"
                          required
                          autoFocus
                          autoComplete="off"
                          data-1p-ignore="true"
                          data-lpignore="true"
                          className={`w-full px-3 py-2 rounded-md border text-sm ${
                            darkMode 
                              ? 'bg-gray-800 border-gray-600 text-white placeholder-gray-500' 
                              : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                          } focus:outline-none focus:ring-2 focus:ring-blink-accent focus:border-transparent`}
                        />
                        <p className={`text-xs mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                          Your Blink wallet username
                        </p>
                      </div>
                      
                      {/* Validated Info */}
                      {lnAddressValidated && (
                        <div className={`p-3 rounded-md ${darkMode ? 'bg-green-900/20 border-green-500/30' : 'bg-green-50 border-green-200'} border`}>
                          <div className="flex items-center gap-2 mb-1">
                            <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                            </svg>
                            <span className={`text-sm font-medium ${darkMode ? 'text-green-400' : 'text-green-700'}`}>
                              {lnAddressValidated.lightningAddress}
                            </span>
                          </div>
                          <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                            Note: Transaction history not available with this method
                          </p>
                        </div>
                      )}
                      
                      {addAccountError && (
                        <p className="text-sm text-red-500">{addAccountError}</p>
                      )}
                      
                      {/* Validate button */}
                      {!lnAddressValidated && newAccountLnAddress.trim() && (
                        <button
                          type="submit"
                          disabled={lnAddressValidating}
                          className="w-full py-2 bg-blink-accent text-black text-sm font-medium rounded-md hover:bg-blink-accent/90 disabled:opacity-50 transition-colors"
                        >
                          {lnAddressValidating ? 'Validating...' : 'Validate'}
                        </button>
                      )}
                      
                      <div className="flex gap-2">
                        {lnAddressValidated && (
                          <button
                            type="submit"
                            disabled={addAccountLoading}
                            className="flex-1 py-2 bg-blink-accent text-black text-sm font-medium rounded-md hover:bg-blink-accent/90 disabled:opacity-50 transition-colors"
                          >
                            {addAccountLoading ? 'Adding...' : 'Add Wallet'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setShowAddAccountForm(false);
                            setNewAccountLnAddress('');
                            setNewAccountLabel('');
                            setNewAccountType(null);
                            setAddAccountError(null);
                            setLnAddressValidated(null);
                          }}
                          className={`${lnAddressValidated ? 'flex-1' : 'w-full'} py-2 text-sm font-medium rounded-md transition-colors ${
                            darkMode 
                              ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' 
                              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                          }`}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {/* Add Wallet Form - Step 2: NWC Connection */}
                {showAddAccountForm && newAccountType === 'nwc' && (
                  <div className={`rounded-lg p-4 ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
                    <div className="flex items-center gap-2 mb-3">
                      <button
                        onClick={() => { setNewAccountType(null); setAddAccountError(null); setNwcValidated(null); setNewAccountNwcUri(''); }}
                        className={`p-1 rounded ${darkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-200'}`}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>
                      <h3 className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                        Add NWC Wallet
                      </h3>
                    </div>
                    <form onSubmit={async (e) => {
                      e.preventDefault();
                      if (!nwcValidated) {
                        // Validate first
                        if (!newAccountNwcUri.trim()) {
                          setAddAccountError('Enter a connection string');
                          return;
                        }
                        setNwcValidating(true);
                        setAddAccountError(null);
                        try {
                          const validation = await NWCClient.validate(newAccountNwcUri.trim());
                          if (!validation.valid) {
                            setAddAccountError(validation.error || 'Invalid connection string');
                            setNwcValidating(false);
                            return;
                          }
                          const tempClient = new NWCClient(newAccountNwcUri.trim());
                          setNwcValidated({
                            walletPubkey: tempClient.getWalletPubkey(),
                            relays: tempClient.getRelays(),
                            capabilities: validation.info?.methods || []
                          });
                          tempClient.close();
                        } catch (err) {
                          setAddAccountError(err.message || 'Invalid connection string');
                        } finally {
                          setNwcValidating(false);
                        }
                        return;
                      }
                      // Add the wallet
                      setAddAccountLoading(true);
                      setAddAccountError(null);
                      try {
                        const result = await addNWCConnection(newAccountNwcUri.trim(), newAccountLabel.trim() || 'NWC Wallet');
                        if (!result.success) throw new Error(result.error || 'Failed to add wallet');
                        // Reset form
                        setNewAccountNwcUri('');
                        setNewAccountLabel('');
                        setNewAccountType(null);
                        setNwcValidated(null);
                        setShowAddAccountForm(false);
                      } catch (err) {
                        setAddAccountError(err.message);
                      } finally {
                        setAddAccountLoading(false);
                      }
                    }} className="space-y-3">
                      <div className={`p-2 rounded text-xs ${darkMode ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-600'}`}>
                        Label: <span className="font-medium">{newAccountLabel || 'NWC Wallet'}</span>
                      </div>
                      <div>
                        <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">NWC Connection String</label>
                        <textarea
                          value={newAccountNwcUri}
                          onChange={(e) => { setNewAccountNwcUri(e.target.value); setNwcValidated(null); }}
                          placeholder="nostr+walletconnect://..."
                          rows={3}
                          autoFocus
                          autoComplete="off"
                          data-1p-ignore="true"
                          data-lpignore="true"
                          className={`w-full px-3 py-2 rounded-md border text-sm font-mono resize-none ${
                            darkMode 
                              ? 'bg-gray-800 border-gray-600 text-white placeholder-gray-500' 
                              : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                          } focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent`}
                        />
                        <p className={`text-xs mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                          Get from your wallet app (Alby, Phoenix, Zeus, etc.)
                        </p>
                      </div>
                      
                      {/* NWC Validation Result */}
                      {nwcValidated && (
                        <div className={`p-3 rounded-lg ${darkMode ? 'bg-green-900/20 border border-green-500/30' : 'bg-green-50 border border-green-200'}`}>
                          <div className="flex items-center gap-2 mb-2">
                            <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                            </svg>
                            <span className={`text-sm font-medium ${darkMode ? 'text-green-400' : 'text-green-700'}`}>Valid Connection</span>
                          </div>
                          <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                            Wallet: {nwcValidated.walletPubkey.slice(0, 8)}...{nwcValidated.walletPubkey.slice(-8)}
                          </p>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {nwcValidated.capabilities.slice(0, 4).map((cap, i) => (
                              <span key={i} className={`px-2 py-0.5 rounded text-xs ${darkMode ? 'bg-gray-700 text-gray-400' : 'bg-gray-200 text-gray-600'}`}>{cap}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {addAccountError && (
                        <p className="text-sm text-red-500">{addAccountError}</p>
                      )}
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          disabled={addAccountLoading || nwcValidating}
                          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors disabled:opacity-50 ${
                            nwcValidated
                              ? 'bg-purple-600 text-white hover:bg-purple-700'
                              : 'bg-purple-600 text-white hover:bg-purple-700'
                          }`}
                        >
                          {nwcValidating ? 'Validating...' : addAccountLoading ? 'Adding...' : nwcValidated ? 'Add Wallet' : 'Validate'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowAddAccountForm(false);
                            setNewAccountNwcUri('');
                            setNewAccountLabel('');
                            setNewAccountType(null);
                            setNwcValidated(null);
                            setAddAccountError(null);
                          }}
                          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                            darkMode 
                              ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' 
                              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                          }`}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {/* Add Wallet Form - Step 2: npub.cash */}
                {showAddAccountForm && newAccountType === 'npub-cash' && (
                  <div className={`rounded-lg p-4 ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
                    <div className="flex items-center gap-2 mb-3">
                      <button
                        onClick={() => { setNewAccountType(null); setAddAccountError(null); setNpubCashValidated(null); setNewNpubCashAddress(''); }}
                        className={`p-1 rounded ${darkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-200'}`}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>
                      <h3 className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                        Add npub.cash Wallet
                      </h3>
                    </div>
                    <form onSubmit={async (e) => {
                      e.preventDefault();
                      if (!npubCashValidated) {
                        // Validate first
                        if (!newNpubCashAddress.trim()) {
                          setAddAccountError('Enter an npub.cash address');
                          return;
                        }
                        if (!isNpubCashAddress(newNpubCashAddress.trim())) {
                          setAddAccountError('Invalid npub.cash address format. Must be npub1...@npub.cash or username@npub.cash');
                          return;
                        }
                        setNpubCashValidating(true);
                        setAddAccountError(null);
                        try {
                          const probeResult = await probeNpubCashAddress(newNpubCashAddress.trim());
                          if (probeResult.valid) {
                            setNpubCashValidated({
                              lightningAddress: newNpubCashAddress.trim(),
                              minSendable: probeResult.minSats,
                              maxSendable: probeResult.maxSats
                            });
                          } else {
                            setAddAccountError(probeResult.error || 'Could not validate npub.cash address');
                          }
                        } catch (err) {
                          setAddAccountError(err.message || 'Validation failed');
                        } finally {
                          setNpubCashValidating(false);
                        }
                        return;
                      }
                      // Add the wallet
                      setAddAccountLoading(true);
                      setAddAccountError(null);
                      try {
                        const result = await addNpubCashWallet({
                          label: newAccountLabel.trim() || npubCashValidated.lightningAddress,
                          lightningAddress: npubCashValidated.lightningAddress
                        });
                        if (!result.success) throw new Error(result.error || 'Failed to add wallet');
                        // Reset form
                        setNewNpubCashAddress('');
                        setNewAccountLabel('');
                        setNewAccountType(null);
                        setShowAddAccountForm(false);
                        setNpubCashValidated(null);
                      } catch (err) {
                        setAddAccountError(err.message);
                      } finally {
                        setAddAccountLoading(false);
                      }
                    }} className="space-y-3">
                      <div className={`p-2 rounded text-xs ${darkMode ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-600'}`}>
                        Label: <span className="font-medium">{newAccountLabel || 'npub.cash Wallet'}</span>
                      </div>
                      <div>
                        <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">npub.cash Lightning Address</label>
                        <input
                          type="text"
                          value={newNpubCashAddress}
                          onChange={(e) => { setNewNpubCashAddress(e.target.value); setNpubCashValidated(null); }}
                          placeholder="npub1...@npub.cash or username@npub.cash"
                          autoFocus
                          autoComplete="off"
                          data-1p-ignore="true"
                          data-lpignore="true"
                          className={`w-full px-3 py-2 rounded-md border text-sm ${
                            npubCashValidated ? 'border-green-500' : 
                            darkMode 
                              ? 'bg-gray-800 border-gray-600 text-white placeholder-gray-500' 
                              : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                          } focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent`}
                        />
                        <p className={`text-xs mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                          Your full npub.cash Lightning Address
                        </p>
                      </div>
                      
                      {/* Validation result */}
                      {npubCashValidated && (
                        <div className={`p-3 rounded-md ${darkMode ? 'bg-green-900/20 border-green-500/30' : 'bg-green-50 border-green-200'} border`}>
                          <div className="flex items-center gap-2 mb-1">
                            <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                            </svg>
                            <span className={`text-sm font-medium ${darkMode ? 'text-green-400' : 'text-green-700'}`}>
                              {npubCashValidated.lightningAddress}
                            </span>
                          </div>
                          <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                            Min: {npubCashValidated.minSendable} sats • Max: {npubCashValidated.maxSendable?.toLocaleString()} sats
                          </p>
                          <p className={`text-xs mt-1 ${darkMode ? 'text-teal-400' : 'text-teal-600'}`}>
                            Payments will be converted to Cashu ecash tokens
                          </p>
                        </div>
                      )}

                      {addAccountError && (
                        <p className="text-sm text-red-500">{addAccountError}</p>
                      )}

                      <div className="flex gap-2">
                        <button
                          type="submit"
                          disabled={npubCashValidating || addAccountLoading}
                          className="flex-1 py-2 bg-teal-500 text-white text-sm font-medium rounded-md hover:bg-teal-600 disabled:opacity-50 transition-colors"
                        >
                          {npubCashValidating ? 'Validating...' : addAccountLoading ? 'Adding...' : npubCashValidated ? 'Add Wallet' : 'Validate'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowAddAccountForm(false);
                            setNewNpubCashAddress('');
                            setNewAccountLabel('');
                            setNewAccountType(null);
                            setNpubCashValidated(null);
                            setAddAccountError(null);
                          }}
                          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                            darkMode 
                              ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' 
                              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                          }`}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {/* Wallets List */}
                <div className="space-y-2">
                  {/* Blink Accounts (exclude npub.cash which is shown separately) */}
                  {blinkAccounts && blinkAccounts.filter(a => a.type !== 'npub-cash').map((account) => (
                    <div
                      key={`blink-${account.id}`}
                      className={`rounded-lg p-4 border transition-colors ${
                        account.isActive && !activeNWC
                          ? darkMode
                            ? 'bg-blink-accent/10 border-blink-accent'
                            : 'bg-blink-accent/5 border-blink-accent'
                          : darkMode
                            ? 'bg-gray-900 border-gray-700'
                            : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center ${
                            account.isActive && !activeNWC
                              ? 'bg-blink-accent/20' 
                              : darkMode ? 'bg-gray-800' : 'bg-gray-200'
                          }`}>
                            <span className="text-lg">⚡</span>
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h5 className={`font-medium truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                                {account.label || 'Blink Wallet'}
                              </h5>
                              <span className={`px-1.5 py-0.5 text-xs rounded ${darkMode ? 'bg-amber-900/30 text-amber-400' : 'bg-amber-100 text-amber-700'}`}>
                                {account.type === 'ln-address' ? 'Blink Lightning Address' : 'Blink API Key'}
                              </span>
                            </div>
                            <p className={`text-sm truncate ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                              @{account.username || 'Unknown'}
                            </p>
                          </div>
                        </div>
                        <div className="flex-shrink-0 ml-2 flex items-center gap-2">
                          {account.isActive && !activeNWC ? (
                            <span className="px-3 py-1 text-xs font-medium bg-blink-accent/20 text-blink-accent rounded">
                              Active
                            </span>
                          ) : (
                            <button
                              onClick={async () => {
                                // Deactivate any active NWC first
                                if (activeNWC) {
                                  await setActiveNWC(null);
                                }
                                setActiveBlinkAccount(account.id);
                              }}
                              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                                darkMode 
                                  ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' 
                                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                              }`}
                            >
                              Use
                            </button>
                          )}
                          {/* Delete button */}
                          {confirmDeleteWallet?.type === 'blink' && confirmDeleteWallet?.id === account.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => { removeBlinkAccount(account.id); setConfirmDeleteWallet(null); }}
                                className="px-2 py-1 text-xs font-medium bg-red-600 text-white rounded hover:bg-red-700"
                              >
                                Delete
                              </button>
                              <button
                                onClick={() => setConfirmDeleteWallet(null)}
                                className={`px-2 py-1 text-xs rounded ${darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'}`}
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDeleteWallet({ type: 'blink', id: account.id })}
                              className={`p-1.5 rounded transition-colors ${darkMode ? 'text-gray-500 hover:text-red-400 hover:bg-gray-800' : 'text-gray-400 hover:text-red-500 hover:bg-gray-100'}`}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* npub.cash Wallets */}
                  {npubCashWallets && npubCashWallets.map((wallet) => (
                    <div
                      key={`npubcash-${wallet.id}`}
                      className={`rounded-lg p-4 border transition-colors ${
                        wallet.isActive && !activeNWC
                          ? darkMode
                            ? 'bg-teal-900/20 border-teal-500'
                            : 'bg-teal-50 border-teal-400'
                          : darkMode
                            ? 'bg-gray-900 border-gray-700'
                            : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center ${
                            wallet.isActive && !activeNWC
                              ? 'bg-teal-500/20' 
                              : darkMode ? 'bg-gray-800' : 'bg-gray-200'
                          }`}>
                            <span className="text-lg">🥜</span>
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h5 className={`font-medium truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                                {wallet.label || 'npub.cash Wallet'}
                              </h5>
                              <span className={`px-1.5 py-0.5 text-xs rounded ${darkMode ? 'bg-teal-900/30 text-teal-400' : 'bg-teal-100 text-teal-700'}`}>Cashu</span>
                            </div>
                            <p className={`text-sm truncate ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                              {wallet.lightningAddress}
                            </p>
                          </div>
                        </div>
                        <div className="flex-shrink-0 ml-2 flex items-center gap-2">
                          {wallet.isActive && !activeNWC ? (
                            <span className="px-3 py-1 text-xs font-medium bg-teal-500/20 text-teal-400 rounded">
                              Active
                            </span>
                          ) : (
                            <button
                              onClick={async () => {
                                // Deactivate NWC if active
                                if (activeNWC) {
                                  await setActiveNWC(null);
                                }
                                // Deactivate any other Blink account
                                if (activeBlinkAccount) {
                                  await setActiveBlinkAccount(null);
                                }
                                // Activate this npub.cash wallet
                                await setActiveBlinkAccount(wallet.id);
                              }}
                              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                                darkMode 
                                  ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' 
                                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                              }`}
                            >
                              Use
                            </button>
                          )}
                          {/* Delete button */}
                          {confirmDeleteWallet?.type === 'npub-cash' && confirmDeleteWallet?.id === wallet.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => { removeBlinkAccount(wallet.id); setConfirmDeleteWallet(null); }}
                                className="px-2 py-1 text-xs font-medium bg-red-600 text-white rounded hover:bg-red-700"
                              >
                                Delete
                              </button>
                              <button
                                onClick={() => setConfirmDeleteWallet(null)}
                                className={`px-2 py-1 text-xs rounded ${darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'}`}
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDeleteWallet({ type: 'npub-cash', id: wallet.id })}
                              className={`p-1.5 rounded transition-colors ${darkMode ? 'text-gray-500 hover:text-red-400 hover:bg-gray-800' : 'text-gray-400 hover:text-red-500 hover:bg-gray-100'}`}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* NWC Connections */}
                  {nwcConnections && nwcConnections.map((conn) => (
                    <div
                      key={`nwc-${conn.id}`}
                      className={`rounded-lg p-4 border transition-colors ${
                        activeNWC?.id === conn.id
                          ? darkMode
                            ? 'bg-purple-900/20 border-purple-500'
                            : 'bg-purple-50 border-purple-400'
                          : darkMode
                            ? 'bg-gray-900 border-gray-700'
                            : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center ${
                            activeNWC?.id === conn.id
                              ? 'bg-purple-500/20' 
                              : darkMode ? 'bg-gray-800' : 'bg-gray-200'
                          }`}>
                            <svg className={`w-5 h-5 ${activeNWC?.id === conn.id ? 'text-purple-400' : darkMode ? 'text-gray-400' : 'text-gray-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h5 className={`font-medium truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                                {conn.label || 'NWC Wallet'}
                              </h5>
                              <span className={`px-1.5 py-0.5 text-xs rounded ${darkMode ? 'bg-purple-900/30 text-purple-400' : 'bg-purple-100 text-purple-700'}`}>NWC</span>
                            </div>
                            <p className={`text-xs font-mono truncate ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                              {conn.walletPubkey?.slice(0, 8)}...{conn.walletPubkey?.slice(-8)}
                            </p>
                          </div>
                        </div>
                        <div className="flex-shrink-0 ml-2 flex items-center gap-2">
                          {activeNWC?.id === conn.id ? (
                            <span className="px-3 py-1 text-xs font-medium bg-purple-500/20 text-purple-400 rounded">
                              Active
                            </span>
                          ) : (
                            <button
                              onClick={async () => {
                                // Deactivate any active Blink account first
                                if (activeBlinkAccount) {
                                  // Note: We can't easily deactivate Blink accounts, but we set NWC as active
                                }
                                await setActiveNWC(conn.id);
                              }}
                              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                                darkMode 
                                  ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' 
                                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                              }`}
                            >
                              Use
                            </button>
                          )}
                          {/* Delete button */}
                          {confirmDeleteWallet?.type === 'nwc' && confirmDeleteWallet?.id === conn.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => { removeNWCConnection(conn.id); setConfirmDeleteWallet(null); }}
                                className="px-2 py-1 text-xs font-medium bg-red-600 text-white rounded hover:bg-red-700"
                              >
                                Delete
                              </button>
                              <button
                                onClick={() => setConfirmDeleteWallet(null)}
                                className={`px-2 py-1 text-xs rounded ${darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'}`}
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDeleteWallet({ type: 'nwc', id: conn.id })}
                              className={`p-1.5 rounded transition-colors ${darkMode ? 'text-gray-500 hover:text-red-400 hover:bg-gray-800' : 'text-gray-400 hover:text-red-500 hover:bg-gray-100'}`}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Empty state */}
                  {(!blinkAccounts || blinkAccounts.length === 0) && (!nwcConnections || nwcConnections.length === 0) && (
                    <div className={`rounded-lg p-8 text-center ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
                      <svg className={`w-12 h-12 mx-auto mb-3 ${darkMode ? 'text-gray-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                      </svg>
                      <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        No wallets connected
                      </p>
                      <p className={`text-xs mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                        Add a Blink, NWC, or npub.cash wallet to get started
                      </p>
                    </div>
                  )}
                </div>

                {/* Help links */}
                <div className={`text-xs text-center space-y-1 ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                  <p>
                    <span className="text-amber-500">Blink:</span>{' '}
                    <a href="https://dashboard.blink.sv" target="_blank" rel="noopener noreferrer" className="hover:underline">dashboard.blink.sv</a>
                  </p>
                  <p>
                    <span className="text-purple-500">NWC:</span>{' '}
                    <a href="https://nwc.dev" target="_blank" rel="noopener noreferrer" className="hover:underline">nwc.dev</a>
                    {' · '}
                    Alby, Phoenix, Zeus, Mutiny
                  </p>
                </div>
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

        {/* Owner/Agent Display - Left aligned on POS and Cart only */}
        {!showingInvoice && (currentView === 'pos' || currentView === 'cart') && (
          <div className="flex flex-col gap-1 mb-2 bg-white dark:bg-black">
            {/* Owner Display - Always show when logged in */}
            <div className="flex items-center gap-2">
              {(() => {
                const hasWallet = activeNWC || activeNpubCashWallet || activeBlinkAccount;
                const dotColor = activeNWC ? "/purpledot.svg" : activeNpubCashWallet ? "/tealdot.svg" : hasWallet ? "/bluedot.svg" : "/yellowdot.svg";
                return <img src={dotColor} alt="Owner" className="w-2 h-2" />;
              })()}
              <span className={`font-semibold ${
                activeNWC ? 'text-purple-600 dark:text-purple-400' : 
                activeNpubCashWallet ? 'text-teal-600 dark:text-teal-400' : 
                (activeBlinkAccount?.label || activeBlinkAccount?.username) ? 'text-blue-600 dark:text-blue-400' :
                'text-yellow-600 dark:text-yellow-400'
              }`} style={{fontSize: '11.2px'}}>
                {activeNWC ? activeNWC.label : activeNpubCashWallet ? (activeNpubCashWallet.label || activeNpubCashWallet.lightningAddress) : (activeBlinkAccount?.label || activeBlinkAccount?.username || 'Connect wallet to start')}
              </span>
            </div>
            
            {/* Agent Display - Show when split profile is active */}
            {activeSplitProfile && (
              <div className="flex items-center gap-2">
                <img 
                  src="/greendot.svg" 
                  alt="Split Active" 
                  className="w-2 h-2"
                />
                <span className="text-green-600 dark:text-green-400 font-semibold" style={{fontSize: '11.2px'}}>
                  {activeSplitProfile.label}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Conditional Content Based on Current View */}
        {currentView === 'cart' ? (
          <div className="h-[calc(100vh-180px)] min-h-[400px]">
            <ItemCart
              displayCurrency={displayCurrency}
              currencies={currencies}
              publicKey={publicKey}
              onCheckout={(checkoutData) => {
                // Store checkout data and switch to POS
                setCartCheckoutData(checkoutData);
                setCurrentView('pos');
              }}
              soundEnabled={soundEnabled}
              darkMode={darkMode}
              toggleDarkMode={toggleDarkMode}
            />
          </div>
        ) : currentView === 'pos' ? (
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
            tipRecipients={activeSplitProfile?.recipients || []}
            soundEnabled={soundEnabled}
            onInvoiceStateChange={setShowingInvoice}
            onInvoiceChange={setCurrentInvoice}
            darkMode={darkMode}
            toggleDarkMode={toggleDarkMode}
            nfcState={nfcState}
            activeNWC={activeNWC}
            nwcClientReady={nwcClientReady}
            nwcMakeInvoice={nwcMakeInvoice}
            nwcLookupInvoice={nwcLookupInvoice}
            activeBlinkAccount={activeBlinkAccount}
            activeNpubCashWallet={activeNpubCashWallet}
            cartCheckoutData={cartCheckoutData}
            onCartCheckoutProcessed={() => setCartCheckoutData(null)}
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

      {/* Settings Modal */}
    </div>
  );
}
