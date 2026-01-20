import { useState, useEffect, useRef, useCallback } from 'react';
import { useCombinedAuth } from '../lib/hooks/useCombinedAuth';
import { useBlinkWebSocket } from '../lib/hooks/useBlinkWebSocket';
import { useBlinkPOSWebSocket } from '../lib/hooks/useBlinkPOSWebSocket';
import { useCurrencies } from '../lib/hooks/useCurrencies';
import { useDarkMode } from '../lib/hooks/useDarkMode';
import { useNFC } from './NFCPayment';
import PaymentAnimation from './PaymentAnimation';
import POS from './POS';
import Voucher from './Voucher';
import MultiVoucher from './MultiVoucher';
import VoucherManager from './VoucherManager';
import Network from './Network';
import ItemCart from './ItemCart';
import BatchPayments from './BatchPayments';
import KeyManagementSection from './Settings/KeyManagementSection';
import NWCClient from '../lib/nwc/NWCClient';
import { isNpubCashAddress, validateNpubCashAddress, probeNpubCashAddress } from '../lib/lnurl';
import TransactionDetail, { getTransactionLabel, initTransactionLabels } from './TransactionDetail';
import ExpirySelector from './ExpirySelector';
import QRCode from 'react-qr-code';
import { bech32 } from 'bech32';

// Spinner colors matching the numpad buttons (rotates on each transition)
const SPINNER_COLORS = [
  'border-blue-600',    // Digits
  'border-green-600',   // OK/Continue
  'border-orange-500',  // Backspace
  'border-red-600',     // Clear
  'border-yellow-500',  // Skip tip
  'border-purple-600',  // Variety
  'border-cyan-500',    // Variety
  'border-pink-500',    // Variety
];

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
    getActiveNWCUri, // For server-side NWC forwarding via webhook
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
  const [currentView, setCurrentView] = useState('pos'); // 'cart', 'pos', 'voucher', 'multivoucher', or 'transactions'
  const [isViewTransitioning, setIsViewTransitioning] = useState(false); // Loading animation between views
  const [transitionColorIndex, setTransitionColorIndex] = useState(0); // Rotating spinner color
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
  const [showingVoucherQR, setShowingVoucherQR] = useState(false);
  const [showSoundThemes, setShowSoundThemes] = useState(false);
  const [showTipSettings, setShowTipSettings] = useState(false);
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [showKeyManagement, setShowKeyManagement] = useState(false);
  const [showBatchPayments, setShowBatchPayments] = useState(false);
  const [showNetworkOverlay, setShowNetworkOverlay] = useState(false);
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
  
  // Voucher Wallet state (separate from regular wallet - for voucher feature)
  const [showVoucherWalletSettings, setShowVoucherWalletSettings] = useState(false);
  const [voucherWallet, setVoucherWallet] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('blinkpos-voucher-wallet');
      return saved ? JSON.parse(saved) : null;
    }
    return null;
  });
  const [voucherWalletApiKey, setVoucherWalletApiKey] = useState('');
  const [voucherWalletLabel, setVoucherWalletLabel] = useState('');
  const [voucherWalletLoading, setVoucherWalletLoading] = useState(false);
  const [voucherWalletError, setVoucherWalletError] = useState(null);
  const [voucherWalletValidating, setVoucherWalletValidating] = useState(false);
  const [voucherWalletScopes, setVoucherWalletScopes] = useState(null); // Scopes returned from authorization query
  
  // Tip Profile state
  const [showTipProfileSettings, setShowTipProfileSettings] = useState(false);
  // % Settings submenu state (shows Tip % and Commission % options when voucher wallet connected)
  const [showPercentSettings, setShowPercentSettings] = useState(false);
  const [showCommissionSettings, setShowCommissionSettings] = useState(false);
  // Commission settings state (for voucher commission)
  const [commissionEnabled, setCommissionEnabled] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('blinkpos-commission-enabled') === 'true';
    }
    return false;
  });
  const [commissionPresets, setCommissionPresets] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('blinkpos-commission-presets');
      return saved ? JSON.parse(saved) : [1, 2, 3]; // Default commission percentages
    }
    return [1, 2, 3];
  });
  // Paycode state
  const [showPaycode, setShowPaycode] = useState(false);
  const [paycodeAmount, setPaycodeAmount] = useState(''); // Amount in sats (empty = any amount)
  const [paycodeGeneratingPdf, setPaycodeGeneratingPdf] = useState(false);
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
  const [newSplitProfileRecipients, setNewSplitProfileRecipients] = useState([]); // Array of { username, validated, type, weight, locked }
  const [newRecipientInput, setNewRecipientInput] = useState(''); // Current input for adding a recipient
  const [splitProfileError, setSplitProfileError] = useState(null);
  const [recipientValidation, setRecipientValidation] = useState({ status: null, message: '', isValidating: false });
  const [useCustomWeights, setUseCustomWeights] = useState(false); // Toggle for custom weight mode
  
  // Date Range Selection for Transaction History
  const [showDateRangeSelector, setShowDateRangeSelector] = useState(false);
  const [selectedDateRange, setSelectedDateRange] = useState(null); // { type: 'preset' | 'custom', start: Date, end: Date, label: string }
  const [customDateStart, setCustomDateStart] = useState('');
  const [customDateEnd, setCustomDateEnd] = useState('');
  const [customTimeStart, setCustomTimeStart] = useState('00:00');
  const [customTimeEnd, setCustomTimeEnd] = useState('23:59');
  const [showTimeInputs, setShowTimeInputs] = useState(false);
  const [filteredTransactions, setFilteredTransactions] = useState([]);
  const [dateFilterActive, setDateFilterActive] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState(null); // Transaction detail modal
  const [labelUpdateTrigger, setLabelUpdateTrigger] = useState(0); // Trigger re-render when labels change

  // Transaction search state
  const [isSearchingTx, setIsSearchingTx] = useState(false);
  const [txSearchInput, setTxSearchInput] = useState(''); // Input field value
  const [txSearchQuery, setTxSearchQuery] = useState(''); // Locked/active search query
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const txSearchInputRef = useRef(null);

  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const touchStartY = useRef(0);
  const touchEndY = useRef(0);
  
  // Refs for keyboard navigation
  const posRef = useRef(null);
  const voucherRef = useRef(null);
  const multiVoucherRef = useRef(null);
  const voucherManagerRef = useRef(null);
  const cartRef = useRef(null);
  
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

  // Persist commission settings to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('blinkpos-commission-enabled', commissionEnabled.toString());
    }
  }, [commissionEnabled]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('blinkpos-commission-presets', JSON.stringify(commissionPresets));
    }
  }, [commissionPresets]);

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
        
        // Initialize transaction labels from server
        await initTransactionLabels();
        console.log('[Dashboard] Transaction labels synced from server');
        
        // Sync voucher wallet from server
        if (data.voucherWallet && data.voucherWallet.apiKey) {
          console.log('[Dashboard] Loaded voucher wallet from server:', data.voucherWallet.label);
          setVoucherWallet(data.voucherWallet);
          localStorage.setItem('blinkpos-voucher-wallet', JSON.stringify(data.voucherWallet));
        } else if (!data.voucherWallet) {
          // Check if we have local voucher wallet to sync to server
          const localVoucherWallet = localStorage.getItem('blinkpos-voucher-wallet');
          if (localVoucherWallet) {
            const parsed = JSON.parse(localVoucherWallet);
            console.log('[Dashboard] Syncing local voucher wallet to server');
            syncVoucherWalletToServer(parsed);
          }
        }
        
      } catch (err) {
        console.error('[Dashboard] Failed to fetch server preferences:', err);
      }
    };
    
    fetchServerPreferences();
  }, [publicKey]); // eslint-disable-line react-hooks/exhaustive-deps
  
  // Sync voucher wallet to server
  const syncVoucherWalletToServer = useCallback(async (walletData) => {
    if (!publicKey) return;
    
    try {
      console.log('[Dashboard] Syncing voucher wallet to server...');
      const response = await fetch('/api/user/sync', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pubkey: publicKey,
          field: 'voucherWallet',
          data: walletData
        })
      });
      
      if (response.ok) {
        console.log('[Dashboard] ✓ Voucher wallet synced to server');
      }
    } catch (err) {
      console.error('[Dashboard] Failed to sync voucher wallet:', err);
    }
  }, [publicKey]);

  // Migration: Fetch missing username for voucher wallet (for wallets created before username was added)
  useEffect(() => {
    const migrateVoucherWalletUsername = async () => {
      if (!voucherWallet || !voucherWallet.apiKey || voucherWallet.username) {
        return; // No wallet, no API key, or already has username
      }
      
      console.log('[Dashboard] Migrating voucher wallet: fetching username...');
      
      try {
        const response = await fetch('https://api.blink.sv/graphql', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-KEY': voucherWallet.apiKey
          },
          body: JSON.stringify({
            query: '{ me { username } }'
          })
        });
        
        if (!response.ok) {
          console.warn('[Dashboard] Failed to fetch username for voucher wallet migration');
          return;
        }
        
        const data = await response.json();
        const username = data.data?.me?.username;
        
        if (username) {
          console.log('[Dashboard] ✓ Voucher wallet username fetched:', username);
          
          // Update wallet data with username
          const updatedWallet = { ...voucherWallet, username };
          setVoucherWallet(updatedWallet);
          
          // Save to localStorage
          if (typeof window !== 'undefined') {
            localStorage.setItem('blinkpos-voucher-wallet', JSON.stringify(updatedWallet));
          }
          
          // Sync to server
          syncVoucherWalletToServer(updatedWallet);
        }
      } catch (err) {
        console.error('[Dashboard] Failed to migrate voucher wallet username:', err);
      }
    };
    
    migrateVoucherWalletUsername();
  }, [voucherWallet?.apiKey]); // Only run when voucherWallet.apiKey changes (initial load)

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
        return key; // Return the key so callers can use it immediately
      }
      return null;
    } catch (error) {
      console.error('Failed to get API key:', error);
      return null;
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
    reconnectAttempts: blinkposReconnectAttempts,
    setExpectedPaymentHash: blinkposSetExpectedPaymentHash
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
    },
    // CRITICAL: Expected payment hash to prevent cross-device animation triggering
    // Only trigger callback if payment matches this client's pending invoice
    currentInvoice?.paymentHash
  );

  // Track current invoice for NFC payments and payment hash for WebSocket filtering
  // Now stores { paymentRequest, paymentHash } object
  const [currentInvoice, setCurrentInvoice] = useState(null);
  
  // Setup NFC for Boltcard payments
  const nfcState = useNFC({
    paymentRequest: currentInvoice?.paymentRequest,
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
      
      // Clear existing transactions and reset all history state
      setTransactions([]);
      setPastTransactionsLoaded(false);
      setHasMoreTransactions(false);
      setFilteredTransactions([]);
      setDateFilterActive(false);
      
      // Refresh API key for the new account first, then fetch transactions
      if (blinkChanged && activeBlinkAccount) {
        fetchApiKey().then((newApiKey) => {
          // If we're viewing transactions, refresh the data for the new active wallet
          // Pass the new API key directly to avoid race condition with state update
          if (currentView === 'transactions') {
            console.log('[Dashboard] Refreshing transactions for new active Blink wallet, newApiKey:', newApiKey ? newApiKey.substring(0, 8) + '...' : 'none');
            fetchData(newApiKey);
          }
        });
      } else if (currentView === 'transactions') {
        // For NWC changes, just fetch directly
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

  const fetchData = async (overrideApiKey = null) => {
    // Use override API key if provided (for account switching), otherwise use state
    const effectiveApiKey = overrideApiKey || apiKey;
    
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
    if (!effectiveApiKey && !hasServerSession) {
      console.log('No wallet credentials available for transaction fetch');
      setLoading(false);
      setTransactions([]);
      return;
    }
    
    console.log('Fetching Blink transaction history for active Blink wallet, apiKey:', effectiveApiKey ? effectiveApiKey.substring(0, 8) + '...' : 'none');
    
    try {
      setLoading(true);
      
      // ✅ ADDED: Fetch with 10 second timeout to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      try {
        // Build request headers
        // Always include API key for Blink accounts to ensure correct account is used
        // (server session may have cached a different account's key)
        const headers = {};
        if (effectiveApiKey) {
          headers['X-API-KEY'] = effectiveApiKey;
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
    
    setNewSplitProfileRecipients(prev => {
      const newRecipients = [...prev, { 
        username: recipientAddress, 
        validated: true,
        type: recipientType,  // 'blink' or 'npub_cash'
        weight: 100 / (prev.length + 1)  // Default even weight
      }];
      // Redistribute weights evenly when not using custom weights
      if (!useCustomWeights) {
        const evenWeight = 100 / newRecipients.length;
        return newRecipients.map(r => ({ ...r, weight: evenWeight }));
      }
      return newRecipients;
    });
    setNewRecipientInput('');
    setRecipientValidation({ status: null, message: '', isValidating: false });
    setSplitProfileError(null);
  }, [recipientValidation.status, recipientValidation.type, recipientValidation.address, newRecipientInput, newSplitProfileRecipients, useCustomWeights]);

  // Remove a recipient from the list
  const removeRecipientFromProfile = useCallback((username) => {
    setNewSplitProfileRecipients(prev => {
      const filtered = prev.filter(r => r.username !== username);
      // Redistribute weights evenly when not using custom weights
      if (!useCustomWeights && filtered.length > 0) {
        const evenWeight = 100 / filtered.length;
        return filtered.map(r => ({ ...r, weight: evenWeight }));
      }
      return filtered;
    });
  }, [useCustomWeights]);

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
      // Always include API key to ensure correct account is used
      const headers = {};
      if (apiKey) {
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
      // Always include API key to ensure correct account is used
      const headers = {};
      if (apiKey) {
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

  // Date range presets for transaction filtering
  const getDateRangePresets = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0); // Last day of previous month
    
    const last7Days = new Date(today);
    last7Days.setDate(last7Days.getDate() - 6); // 7 days including today
    
    const last30Days = new Date(today);
    last30Days.setDate(last30Days.getDate() - 29); // 30 days including today
    
    return [
      { 
        id: 'today', 
        label: 'Today', 
        start: today, 
        end: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1) // End of today
      },
      { 
        id: 'yesterday', 
        label: 'Yesterday', 
        start: yesterday, 
        end: new Date(yesterday.getTime() + 24 * 60 * 60 * 1000 - 1)
      },
      { 
        id: 'last7days', 
        label: 'Last 7 Days', 
        start: last7Days, 
        end: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1)
      },
      { 
        id: 'last30days', 
        label: 'Last 30 Days', 
        start: last30Days, 
        end: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1)
      },
      { 
        id: 'thismonth', 
        label: 'This Month', 
        start: thisMonthStart, 
        end: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1)
      },
      { 
        id: 'lastmonth', 
        label: 'Last Month', 
        start: lastMonthStart, 
        end: lastMonthEnd
      }
    ];
  };

  // Parse createdAt value to Date object (handles various formats from Blink API)
  const parseCreatedAt = (createdAt) => {
    if (!createdAt) return null;
    
    try {
      // If it's a number, it's likely a Unix timestamp
      if (typeof createdAt === 'number') {
        // Check if it's in seconds (10 digits) or milliseconds (13 digits)
        if (createdAt < 10000000000) {
          // Unix timestamp in seconds
          return new Date(createdAt * 1000);
        } else {
          // Unix timestamp in milliseconds
          return new Date(createdAt);
        }
      }
      
      // If it's a string
      if (typeof createdAt === 'string') {
        // Check if it's a numeric string (timestamp)
        const numericValue = parseInt(createdAt, 10);
        if (!isNaN(numericValue) && createdAt.match(/^\d+$/)) {
          // It's a numeric timestamp string
          if (numericValue < 10000000000) {
            return new Date(numericValue * 1000);
          } else {
            return new Date(numericValue);
          }
        }
        
        // Otherwise treat as ISO string or date string
        const date = new Date(createdAt);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error parsing createdAt:', createdAt, error);
      return null;
    }
  };

  // Parse transaction date string to Date object (for formatted display dates)
  const parseTransactionDate = (dateString) => {
    try {
      // Handle format like "Dec 14, 2025, 10:30 AM"
      const date = new Date(dateString);
      if (!isNaN(date.getTime())) {
        return date;
      }
      return null;
    } catch (error) {
      console.error('Error parsing date:', dateString, error);
      return null;
    }
  };

  // Filter transactions by date range
  const filterTransactionsByDateRange = (txs, startDate, endDate) => {
    console.log('Filtering transactions:', { 
      count: txs.length, 
      startDate: startDate.toISOString(), 
      endDate: endDate.toISOString() 
    });
    
    const filtered = txs.filter(tx => {
      // Parse the createdAt field properly (handles Unix timestamps)
      const txDate = parseCreatedAt(tx.createdAt) || parseTransactionDate(tx.date);
      
      if (!txDate) {
        console.log('Could not parse date for tx:', tx.id, tx.createdAt, tx.date);
        return false;
      }
      
      const isInRange = txDate >= startDate && txDate <= endDate;
      return isInRange;
    });
    
    console.log('Filtered result:', filtered.length, 'transactions');
    if (txs.length > 0 && filtered.length === 0) {
      // Debug: show first transaction's date info
      const firstTx = txs[0];
      const parsedDate = parseCreatedAt(firstTx.createdAt);
      console.log('Debug first tx:', { 
        createdAt: firstTx.createdAt, 
        type: typeof firstTx.createdAt,
        parsedDate: parsedDate?.toISOString(),
        date: firstTx.date 
      });
    }
    
    return filtered;
  };

  // Load and filter transactions by date range
  const loadTransactionsForDateRange = async (dateRange) => {
    if (loadingMore) return;
    
    setLoadingMore(true);
    setDateFilterActive(true);
    setSelectedDateRange(dateRange);
    
    try {
      // Always include API key to ensure correct account is used
      const headers = {};
      if (apiKey) {
        headers['X-API-KEY'] = apiKey;
      }
      
      // We need to load enough transactions to cover the date range
      // Start by loading initial batch, then load more if needed
      let allTransactions = [...transactions];
      let cursor = allTransactions.length > 0 ? allTransactions[allTransactions.length - 1]?.cursor : null;
      let hasMore = hasMoreTransactions;
      let batchCount = 0;
      const maxBatches = 10; // Load up to 10 batches (1000 transactions)
      
      // Check if we already have transactions covering the date range
      const existingFiltered = filterTransactionsByDateRange(allTransactions, dateRange.start, dateRange.end);
      
      // If we have existing transactions and the oldest one is older than our range start,
      // we might have enough data
      const oldestTx = allTransactions[allTransactions.length - 1];
      let oldestDate = parseCreatedAt(oldestTx?.createdAt) || parseTransactionDate(oldestTx?.date);
      
      // Load more if we don't have enough data covering the date range
      while (hasMore && batchCount < maxBatches) {
        // If oldest transaction is older than our range start, we have enough
        if (oldestDate && oldestDate < dateRange.start) {
          break;
        }
        
        batchCount++;
        const url = cursor 
          ? `/api/blink/transactions?first=100&after=${cursor}` 
          : '/api/blink/transactions?first=100';
          
        const response = await fetch(url, { headers, credentials: 'include' });
        
        if (response.ok) {
          const data = await response.json();
          
          if (data.transactions && data.transactions.length > 0) {
            allTransactions = [...allTransactions, ...data.transactions];
            cursor = data.pageInfo?.endCursor;
            hasMore = data.pageInfo?.hasNextPage || false;
            
            // Update the oldest date check
            const newOldest = allTransactions[allTransactions.length - 1];
            const newOldestDate = parseCreatedAt(newOldest?.createdAt) || parseTransactionDate(newOldest?.date);
            if (newOldestDate && newOldestDate < dateRange.start) {
              break; // We have enough data
            }
          } else {
            break;
          }
        } else {
          break;
        }
      }
      
      // Update main transactions state
      setTransactions(allTransactions);
      setHasMoreTransactions(hasMore);
      
      // Filter and set filtered transactions
      const filtered = filterTransactionsByDateRange(allTransactions, dateRange.start, dateRange.end);
      setFilteredTransactions(filtered);
      setPastTransactionsLoaded(true);
      
      console.log(`Date range filter: ${dateRange.label}, found ${filtered.length} transactions out of ${allTransactions.length} total`);
      
    } catch (error) {
      console.error('Error loading transactions for date range:', error);
    } finally {
      setLoadingMore(false);
      setShowDateRangeSelector(false);
    }
  };

  // Handle custom date range selection
  const handleCustomDateRange = () => {
    if (!customDateStart || !customDateEnd) {
      return;
    }
    
    const start = new Date(customDateStart);
    const end = new Date(customDateEnd);
    
    // Apply time if time inputs are shown
    if (showTimeInputs && customTimeStart) {
      const [startHour, startMin] = customTimeStart.split(':').map(Number);
      start.setHours(startHour, startMin, 0, 0);
    } else {
      start.setHours(0, 0, 0, 0);
    }
    
    if (showTimeInputs && customTimeEnd) {
      const [endHour, endMin] = customTimeEnd.split(':').map(Number);
      end.setHours(endHour, endMin, 59, 999);
    } else {
      end.setHours(23, 59, 59, 999);
    }
    
    if (start > end) {
      alert('Start date/time must be before end date/time');
      return;
    }
    
    // Format label based on whether time is included
    let label;
    if (showTimeInputs) {
      const formatDateTime = (d) => {
        return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      };
      label = `${formatDateTime(start)} - ${formatDateTime(end)}`;
    } else {
      label = `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
    }
    
    const dateRange = {
      type: 'custom',
      start,
      end,
      label
    };
    
    loadTransactionsForDateRange(dateRange);
  };

  // Clear date filter
  const clearDateFilter = () => {
    setDateFilterActive(false);
    setSelectedDateRange(null);
    setFilteredTransactions([]);
    setCustomDateStart('');
    setCustomDateEnd('');
    setCustomTimeStart('00:00');
    setCustomTimeEnd('23:59');
    setShowTimeInputs(false);
  };

  // Calculate summary stats for filtered transactions
  const getFilteredStats = () => {
    const txs = dateFilterActive ? filteredTransactions : transactions;
    
    let totalReceived = 0;
    let totalSent = 0;
    let receiveCount = 0;
    let sendCount = 0;
    
    txs.forEach(tx => {
      const amount = Math.abs(tx.settlementAmount || 0);
      if (tx.direction === 'RECEIVE') {
        totalReceived += amount;
        receiveCount++;
      } else {
        totalSent += amount;
        sendCount++;
      }
    });
    
    return {
      totalReceived,
      totalSent,
      receiveCount,
      sendCount,
      netAmount: totalReceived - totalSent,
      transactionCount: txs.length
    };
  };

  // Filter transactions by search query (memo, username, amount)
  const filterTransactionsBySearch = (txList, query) => {
    if (!query || !query.trim()) return txList;
    const lowerQuery = query.toLowerCase().trim();
    return txList.filter(tx => {
      // Search in memo
      if (tx.memo && tx.memo.toLowerCase().includes(lowerQuery)) return true;
      // Search in amount string
      if (tx.amount && tx.amount.toLowerCase().includes(lowerQuery)) return true;
      // Search in counterparty username (from settlementVia or initiationVia)
      const username = tx.settlementVia?.counterPartyUsername || tx.initiationVia?.counterPartyUsername;
      if (username && username.toLowerCase().includes(lowerQuery)) return true;
      return false;
    });
  };

  // Get display transactions (applies search filter on top of date filter)
  const getDisplayTransactions = () => {
    const baseTxs = dateFilterActive ? filteredTransactions : transactions;
    return filterTransactionsBySearch(baseTxs, txSearchQuery);
  };

  // Handle transaction search activation
  const handleTxSearchClick = () => {
    setIsSearchingTx(true);
    setTxSearchInput(txSearchQuery); // Pre-fill with current search if any
    setTimeout(() => {
      txSearchInputRef.current?.focus();
    }, 100);
  };

  // Handle transaction search submit (lock in the search)
  const handleTxSearchSubmit = () => {
    if (!txSearchInput.trim()) {
      // If empty, just close the input
      setIsSearchingTx(false);
      return;
    }
    
    // Show loading animation
    setIsSearchLoading(true);
    setIsSearchingTx(false); // Close input immediately
    
    // Brief delay to show loading, then apply search
    setTimeout(() => {
      setTxSearchQuery(txSearchInput.trim());
      setIsSearchLoading(false);
    }, 400);
  };

  // Handle Enter key in search input
  const handleTxSearchKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleTxSearchSubmit();
    } else if (e.key === 'Escape') {
      setIsSearchingTx(false);
      setTxSearchInput('');
    }
  };

  // Handle transaction search close/clear
  const handleTxSearchClose = () => {
    setIsSearchingTx(false);
    setTxSearchInput('');
    setTxSearchQuery('');
  };

  // Handle view transition with loading animation
  const handleViewTransition = (newView) => {
    if (newView === currentView) return;
    
    // Rotate to next spinner color
    setTransitionColorIndex(prev => (prev + 1) % SPINNER_COLORS.length);
    
    // Show loading animation
    setIsViewTransitioning(true);
    
    // Brief delay to show the animation, then switch view
    setTimeout(() => {
      setCurrentView(newView);
      setIsViewTransitioning(false);
      
      // Reset cart navigation when entering cart view
      if (newView === 'cart' && cartRef.current) {
        cartRef.current.resetNavigation?.();
      }
    }, 150);
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
      // Always include API key to ensure correct account is used
      if (apiKey) {
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
      
      // Always include API key to ensure correct account is used
      const headers = {};
      if (apiKey) {
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
    touchStartY.current = e.targetTouches[0].clientY;
  };

  const handleTouchMove = (e) => {
    touchEndX.current = e.targetTouches[0].clientX;
    touchEndY.current = e.targetTouches[0].clientY;
  };

  const handleTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return;
    
    const distanceX = touchStartX.current - touchEndX.current;
    const distanceY = touchStartY.current - touchEndY.current;
    const isLeftSwipe = distanceX > 50 && Math.abs(distanceY) < 50;
    const isRightSwipe = distanceX < -50 && Math.abs(distanceY) < 50;
    const isUpSwipe = distanceY > 50 && Math.abs(distanceX) < 50;
    const isDownSwipe = distanceY < -50 && Math.abs(distanceX) < 50;

    // Only allow swipe navigation when:
    // - On Cart screen (not showing any overlay)
    // - On POS numpad screen (not showing invoice/tips)
    // - On Voucher numpad screen (not showing voucher QR)
    // - On MultiVoucher screen
    // - On transactions screen
    // Navigation order (horizontal): Cart ← → POS ← → Transactions
    // Navigation order (vertical): POS ↕ Voucher ↔ MultiVoucher
    // Navigation order (voucher row): MultiVoucher ← → Voucher
    
    // Horizontal swipes (left/right) - for cart, pos, transactions, and voucher row
    // Direction convention: Swipe LEFT moves to the RIGHT item (finger drags content left, next item appears from right)
    // Top row (left to right): Cart - POS - Transactions
    // Bottom row (left to right): MultiVoucher - Voucher - VoucherManager
    // IMPORTANT: Disable swipes when showing invoice (POS checkout) or voucher QR (voucher checkout)
    if (isLeftSwipe && !showingInvoice && !showingVoucherQR && !isViewTransitioning) {
      if (currentView === 'cart') {
        handleViewTransition('pos');
      } else if (currentView === 'pos') {
        handleViewTransition('transactions');
      } else if (currentView === 'multivoucher' && voucherWallet) {
        // Left swipe from multivoucher goes to voucher (same as cart→pos)
        handleViewTransition('voucher');
      } else if (currentView === 'voucher' && voucherWallet) {
        // Left swipe from voucher goes to vouchermanager (same as pos→transactions)
        handleViewTransition('vouchermanager');
      }
    } else if (isRightSwipe && !showingVoucherQR && !isViewTransitioning) {
      if (currentView === 'transactions') {
        handleViewTransition('pos');
      } else if (currentView === 'pos' && !showingInvoice) {
        handleViewTransition('cart');
      } else if (currentView === 'vouchermanager' && voucherWallet) {
        // Right swipe from vouchermanager goes to voucher (same as transactions→pos)
        handleViewTransition('voucher');
      } else if (currentView === 'voucher' && voucherWallet) {
        // Right swipe from voucher goes to multivoucher (same as pos→cart)
        handleViewTransition('multivoucher');
      }
    }
    // Vertical swipes (up) - between POS and Single Voucher only
    // From POS: swipe up → Voucher
    // From Voucher (Single): swipe up → POS (return to POS)
    // NOTE: MultiVoucher and VoucherManager have scrollable content,
    // so swipe UP is disabled to avoid conflicts with scrolling.
    // Users can navigate horizontally to Single Voucher, then swipe up to POS.
    // IMPORTANT: Disable swipes when showing voucher QR (voucher checkout)
    else if (isUpSwipe && !showingInvoice && !showingVoucherQR && !isViewTransitioning && voucherWallet) {
      if (currentView === 'pos') {
        handleViewTransition('voucher');
      } else if (currentView === 'voucher') {
        // Only Single Voucher can swipe up to POS
        handleViewTransition('pos');
      }
    }

    // Reset touch positions
    touchStartX.current = 0;
    touchEndX.current = 0;
    touchStartY.current = 0;
    touchEndY.current = 0;
  };

  // Keyboard navigation for desktop users
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Skip if side menu is open
      if (sideMenuOpen) return;
      
      // Skip if focused on input/textarea elements
      const activeElement = document.activeElement;
      if (activeElement && (
        activeElement.tagName === 'INPUT' || 
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.isContentEditable
      )) {
        return;
      }

      // Check if tip dialog is open - delegate keyboard to POS
      if (currentView === 'pos' && posRef.current?.isTipDialogOpen?.()) {
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(e.key)) {
          e.preventDefault();
          posRef.current.handleTipDialogKey(e.key);
          return;
        }
      }

      // Check if commission dialog is open - delegate keyboard to Voucher
      if (currentView === 'voucher' && voucherRef.current?.isCommissionDialogOpen?.()) {
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(e.key)) {
          e.preventDefault();
          voucherRef.current.handleCommissionDialogKey(e.key);
          return;
        }
      }

      // Check if commission dialog is open on MultiVoucher - delegate keyboard
      if (currentView === 'multivoucher' && multiVoucherRef.current?.isCommissionDialogOpen?.()) {
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(e.key)) {
          e.preventDefault();
          multiVoucherRef.current.handleCommissionDialogKey(e.key);
          return;
        }
      }

      // Check if cart is active and can handle keyboard navigation
      if (currentView === 'cart' && cartRef.current?.isCartNavActive?.()) {
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', 'Escape', 'Backspace', ' '].includes(e.key)) {
          const handled = cartRef.current.handleCartKey(e.key);
          if (handled) {
            e.preventDefault();
            return;
          }
          // If not handled (e.g., ArrowUp from Search), fall through to global navigation
        }
      }
      
      // If cart view but exited to global nav, DOWN arrow re-enters local cart navigation
      if (currentView === 'cart' && e.key === 'ArrowDown' && cartRef.current?.enterLocalNav) {
        if (!cartRef.current.isCartNavActive?.()) {
          e.preventDefault();
          cartRef.current.enterLocalNav();
          return;
        }
      }

      // Escape key for checkout screens and success animations
      if (e.key === 'Escape') {
        // Payment success animation - Done
        if (showAnimation) {
          e.preventDefault();
          hideAnimation();
          return;
        }
        
        // Voucher success (redeemed) - Done
        if (currentView === 'voucher' && voucherRef.current?.isRedeemed?.()) {
          e.preventDefault();
          voucherRef.current.handleClear();
          return;
        }
        
        // POS checkout screen - Cancel
        if (currentView === 'pos' && showingInvoice) {
          e.preventDefault();
          posRef.current?.handleClear?.();
          return;
        }
        
        // Voucher checkout screen - Cancel (only if not redeemed)
        if (currentView === 'voucher' && showingVoucherQR && !voucherRef.current?.isRedeemed?.()) {
          e.preventDefault();
          voucherRef.current?.handleClear?.();
          return;
        }
      }

      // Arrow key navigation between views (only when not in checkout or modal states)
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault(); // Prevent page scroll
        
        // Block navigation during checkout states
        if (showingInvoice || showingVoucherQR || isViewTransitioning) return;
        
        if (e.key === 'ArrowLeft') {
          // Navigate left: Transactions → POS → Cart, VoucherManager → Voucher → MultiVoucher
          if (currentView === 'transactions') {
            handleViewTransition('pos');
          } else if (currentView === 'pos') {
            handleViewTransition('cart');
          } else if (currentView === 'vouchermanager' && voucherWallet) {
            handleViewTransition('voucher');
          } else if (currentView === 'voucher' && voucherWallet) {
            handleViewTransition('multivoucher');
          }
        } else if (e.key === 'ArrowRight') {
          // Navigate right: Cart → POS → Transactions, MultiVoucher → Voucher → VoucherManager
          if (currentView === 'cart') {
            handleViewTransition('pos');
          } else if (currentView === 'pos') {
            handleViewTransition('transactions');
          } else if (currentView === 'multivoucher' && voucherWallet) {
            handleViewTransition('voucher');
          } else if (currentView === 'voucher' && voucherWallet) {
            handleViewTransition('vouchermanager');
          }
        } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && voucherWallet) {
          // Navigate up/down: POS ↔ Voucher row
          if (currentView === 'pos') {
            handleViewTransition('voucher');
          } else if (currentView === 'voucher' || currentView === 'multivoucher' || currentView === 'vouchermanager') {
            handleViewTransition('pos');
          }
        }
        return;
      }

      // Numpad input (only on POS and Voucher views, only when showing numpad)
      if (currentView === 'pos' && !showingInvoice && posRef.current) {
        // Digit keys (top row and numpad)
        if (/^[0-9]$/.test(e.key)) {
          e.preventDefault();
          posRef.current.handleDigitPress(e.key);
          return;
        }
        // Decimal point
        if (e.key === '.' || e.key === ',') {
          e.preventDefault();
          posRef.current.handleDigitPress('.');
          return;
        }
        // Backspace
        if (e.key === 'Backspace') {
          e.preventDefault();
          posRef.current.handleBackspace();
          return;
        }
        // Escape = Clear
        if (e.key === 'Escape') {
          e.preventDefault();
          posRef.current.handleClear();
          return;
        }
        // Enter = Submit (OK) - only if there's a valid amount
        if (e.key === 'Enter') {
          e.preventDefault();
          if (posRef.current.hasValidAmount?.()) {
            posRef.current.handleSubmit();
          }
          return;
        }
        // Plus key = add to stack
        if (e.key === '+') {
          e.preventDefault();
          posRef.current.handlePlusPress();
          return;
        }
      } else if (currentView === 'voucher' && !showingVoucherQR && voucherRef.current) {
        // Digit keys (top row and numpad)
        if (/^[0-9]$/.test(e.key)) {
          e.preventDefault();
          voucherRef.current.handleDigitPress(e.key);
          return;
        }
        // Decimal point
        if (e.key === '.' || e.key === ',') {
          e.preventDefault();
          voucherRef.current.handleDigitPress('.');
          return;
        }
        // Backspace
        if (e.key === 'Backspace') {
          e.preventDefault();
          voucherRef.current.handleBackspace();
          return;
        }
        // Escape = Clear
        if (e.key === 'Escape') {
          e.preventDefault();
          voucherRef.current.handleClear();
          return;
        }
        // Enter = Submit (Create Voucher) - only if there's a valid amount
        if (e.key === 'Enter') {
          e.preventDefault();
          if (voucherRef.current.hasValidAmount?.()) {
            voucherRef.current.handleSubmit();
          }
          return;
        }
      } else if (currentView === 'multivoucher' && multiVoucherRef.current) {
        // MultiVoucher keyboard handling - only on amount step
        const step = multiVoucherRef.current.getCurrentStep?.();
        if (step === 'amount') {
          // Digit keys
          if (/^[0-9]$/.test(e.key)) {
            e.preventDefault();
            multiVoucherRef.current.handleDigitPress(e.key);
            return;
          }
          // Decimal point
          if (e.key === '.' || e.key === ',') {
            e.preventDefault();
            multiVoucherRef.current.handleDigitPress('.');
            return;
          }
          // Backspace
          if (e.key === 'Backspace') {
            e.preventDefault();
            multiVoucherRef.current.handleBackspace();
            return;
          }
          // Escape = Clear
          if (e.key === 'Escape') {
            e.preventDefault();
            multiVoucherRef.current.handleClear();
            return;
          }
          // Enter = Submit (proceed to config)
          if (e.key === 'Enter') {
            e.preventDefault();
            if (multiVoucherRef.current.hasValidAmount?.()) {
              multiVoucherRef.current.handleSubmit();
            }
            return;
          }
        } else if (step === 'config' || step === 'preview') {
          // On config/preview, Escape goes back, Enter proceeds
          if (e.key === 'Escape') {
            e.preventDefault();
            multiVoucherRef.current.handleClear();
            return;
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            multiVoucherRef.current.handleSubmit();
            return;
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentView, sideMenuOpen, showingInvoice, showingVoucherQR, isViewTransitioning, voucherWallet]);

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

  if (loading && transactions.length === 0 && !isViewTransitioning) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-blink-accent border-t-transparent mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading transactions...</p>
        </div>
      </div>
    );
  }

  // Determine if current view should prevent scrolling (POS-style fixed views)
  const isFixedView = currentView === 'pos' || currentView === 'cart' || currentView === 'voucher' || currentView === 'multivoucher' || currentView === 'vouchermanager';
  
  return (
    <div className={`bg-white dark:bg-black ${isFixedView ? 'h-screen overflow-hidden fixed inset-0' : 'min-h-screen'}`}>
      {/* Payment Animation Overlay */}
      <PaymentAnimation 
        show={showAnimation} 
        payment={lastPayment}
        onHide={hideAnimation}
        soundEnabled={soundEnabled}
        soundTheme={soundTheme}
      />

      {/* Mobile Header - Hidden when showing invoice or voucher QR */}
      {!showingInvoice && !showingVoucherQR && (
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
              
              {/* Navigation Dots - Center - Two rows layout */}
              <div className="flex flex-col items-center gap-1">
                {/* Upper row: Cart - POS - History */}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleViewTransition('cart')}
                    disabled={isViewTransitioning}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      currentView === 'cart'
                        ? 'bg-blink-accent'
                        : 'bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500'
                    }`}
                    aria-label="Cart"
                  />
                  <button
                    onClick={() => handleViewTransition('pos')}
                    disabled={isViewTransitioning}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      currentView === 'pos'
                        ? 'bg-blink-accent'
                        : 'bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500'
                    }`}
                    aria-label="POS"
                  />
                  <button
                    onClick={() => handleViewTransition('transactions')}
                    disabled={isViewTransitioning}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      currentView === 'transactions'
                        ? 'bg-blink-accent'
                        : 'bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500'
                    }`}
                    aria-label="History"
                  />
                </div>
                {/* Lower row: MultiVoucher - Voucher - VoucherManager (below POS) */}
                {voucherWallet && (
                  <div className="flex gap-2 justify-center">
                    {/* MultiVoucher dot - left */}
                    <button
                      onClick={() => {
                        // Allow navigation from POS, voucher, multivoucher, or vouchermanager
                        if (currentView === 'pos' || currentView === 'voucher' || currentView === 'multivoucher' || currentView === 'vouchermanager') {
                          handleViewTransition('multivoucher');
                        }
                      }}
                      disabled={isViewTransitioning || (currentView !== 'pos' && currentView !== 'voucher' && currentView !== 'multivoucher' && currentView !== 'vouchermanager')}
                      className={`w-2 h-2 rounded-full transition-colors ${
                        currentView === 'multivoucher'
                          ? 'bg-purple-600 dark:bg-purple-400'
                          : (currentView === 'pos' || currentView === 'voucher' || currentView === 'vouchermanager')
                            ? 'bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500'
                            : 'bg-gray-200 dark:bg-gray-700 opacity-50 cursor-not-allowed'
                      }`}
                      aria-label="Multi-Voucher"
                      title="Multi-Voucher (batch create)"
                    />
                    {/* Voucher dot - center */}
                    <button
                      onClick={() => {
                        // Allow navigation from POS, voucher, multivoucher, or vouchermanager
                        if (currentView === 'pos' || currentView === 'voucher' || currentView === 'multivoucher' || currentView === 'vouchermanager') {
                          handleViewTransition('voucher');
                        }
                      }}
                      disabled={isViewTransitioning || (currentView !== 'pos' && currentView !== 'voucher' && currentView !== 'multivoucher' && currentView !== 'vouchermanager')}
                      className={`w-2 h-2 rounded-full transition-colors ${
                        currentView === 'voucher'
                          ? 'bg-purple-600 dark:bg-purple-400'
                          : (currentView === 'pos' || currentView === 'multivoucher' || currentView === 'vouchermanager')
                            ? 'bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500'
                            : 'bg-gray-200 dark:bg-gray-700 opacity-50 cursor-not-allowed'
                      }`}
                      aria-label="Voucher"
                      title="Single Voucher"
                    />
                    {/* VoucherManager dot - right */}
                    <button
                      onClick={() => {
                        // Allow navigation from POS, voucher, multivoucher, or vouchermanager
                        if (currentView === 'pos' || currentView === 'voucher' || currentView === 'multivoucher' || currentView === 'vouchermanager') {
                          handleViewTransition('vouchermanager');
                        }
                      }}
                      disabled={isViewTransitioning || (currentView !== 'pos' && currentView !== 'voucher' && currentView !== 'multivoucher' && currentView !== 'vouchermanager')}
                      className={`w-2 h-2 rounded-full transition-colors ${
                        currentView === 'vouchermanager'
                          ? 'bg-purple-600 dark:bg-purple-400'
                          : (currentView === 'pos' || currentView === 'voucher' || currentView === 'multivoucher')
                            ? 'bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500'
                            : 'bg-gray-200 dark:bg-gray-700 opacity-50 cursor-not-allowed'
                      }`}
                      aria-label="Voucher Manager"
                      title="Voucher Manager"
                    />
                  </div>
                )}
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
                {/* Profile Info - Clickable to access Key Management */}
                <button
                  onClick={() => {
                    if (authMode === 'nostr') {
                      setShowKeyManagement(true);
                      setSideMenuOpen(false);
                    }
                  }}
                  className={`w-full rounded-lg p-4 ${darkMode ? 'bg-gray-900 hover:bg-gray-800' : 'bg-gray-50 hover:bg-gray-100'} transition-colors ${authMode === 'nostr' ? 'cursor-pointer' : 'cursor-default'}`}
                >
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
                    {/* Key icon indicator for nostr users */}
                    {authMode === 'nostr' && (
                      <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                        </svg>
                        <span className="ml-1">›</span>
                      </div>
                    )}
                  </div>
                </button>

                {/* Receive Wallet */}
                <button
                  onClick={() => setShowAccountSettings(true)}
                  className={`w-full rounded-lg p-4 ${darkMode ? 'bg-gray-900 hover:bg-gray-800' : 'bg-gray-50 hover:bg-gray-100'} transition-colors`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">Receive Wallet</span>
                    <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                      <span>{activeNWC ? activeNWC.label : activeNpubCashWallet ? (activeNpubCashWallet.label || activeNpubCashWallet.lightningAddress) : (activeBlinkAccount?.label || activeBlinkAccount?.username || 'None')}</span>
                      <span className="ml-1">›</span>
                    </div>
                  </div>
                </button>

                {/* Send Wallet - For voucher feature (requires Blink API key with WRITE scope) */}
                <button
                  onClick={() => setShowVoucherWalletSettings(true)}
                  className={`w-full rounded-lg p-4 ${darkMode ? 'bg-gray-900 hover:bg-gray-800' : 'bg-gray-50 hover:bg-gray-100'} transition-colors`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">Send Wallet</span>
                      <span className="px-1.5 py-0.5 text-xs font-medium rounded bg-purple-500/20 text-purple-400">Beta</span>
                    </div>
                    <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                      <span>{voucherWallet ? (voucherWallet.label || voucherWallet.username || 'Connected') : 'None'}</span>
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

                {/* Tip Settings / Tip & Commission Settings */}
                <button
                  onClick={() => voucherWallet ? setShowPercentSettings(true) : setShowTipProfileSettings(true)}
                  className={`w-full rounded-lg p-4 ${darkMode ? 'bg-gray-900 hover:bg-gray-800' : 'bg-gray-50 hover:bg-gray-100'} transition-colors`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {voucherWallet ? 'Tip & Commission Settings' : 'Tip Settings'}
                    </span>
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

                {/* Paycodes (only show if user has active Blink account with username) */}
                {activeBlinkAccount?.username && (
                  <button
                    onClick={() => {
                      setShowPaycode(true);
                      setSideMenuOpen(false);
                    }}
                    className={`w-full rounded-lg p-4 ${darkMode ? 'bg-gray-900 hover:bg-gray-800' : 'bg-gray-50 hover:bg-gray-100'} transition-colors`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">Paycodes</span>
                      <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                        </svg>
                        <span className="ml-1">›</span>
                      </div>
                    </div>
                  </button>
                )}

                {/* Batch Payments (only show if user has Voucher wallet with WRITE API key) */}
                {voucherWallet?.apiKey && (
                  <button
                    onClick={() => {
                      setShowBatchPayments(true);
                      setSideMenuOpen(false);
                    }}
                    className={`w-full rounded-lg p-4 ${darkMode ? 'bg-gray-900 hover:bg-gray-800' : 'bg-gray-50 hover:bg-gray-100'} transition-colors`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">Batch Payments</span>
                      <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                        <span className="ml-1">›</span>
                      </div>
                    </div>
                  </button>
                )}

                {/* Circular Economy Network */}
                <button
                  onClick={() => {
                    setShowNetworkOverlay(true);
                    setSideMenuOpen(false);
                  }}
                  className={`w-full rounded-lg p-4 ${darkMode ? 'bg-gray-900 hover:bg-gray-800' : 'bg-gray-50 hover:bg-gray-100'} transition-colors`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">Circular Economy Network</span>
                    <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                      </svg>
                      <span className="ml-1">›</span>
                    </div>
                  </div>
                </button>

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

      {/* Batch Payments Overlay (uses Voucher wallet API key with WRITE permission) */}
      {/* Batch Payments Overlay */}
      {showBatchPayments && voucherWallet?.apiKey && (
        <div className="fixed inset-0 bg-white dark:bg-black z-50 overflow-y-auto">
          <div className="min-h-screen" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
            {/* Header */}
            <div className="bg-gray-50 dark:bg-blink-dark shadow dark:shadow-black sticky top-0 z-10">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16">
                  <button
                    onClick={() => {
                      setShowBatchPayments(false);
                      setSideMenuOpen(true);
                    }}
                    className="flex items-center text-gray-700 dark:text-white hover:text-blink-accent dark:hover:text-blink-accent"
                  >
                    <span className="text-2xl mr-2">‹</span>
                    <span className="text-lg">Back</span>
                  </button>
                  <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                    Batch Payments
                  </h1>
                  <div className="w-16"></div>
                </div>
              </div>
            </div>
            {/* Content */}
            <div className="max-w-md mx-auto px-4 py-6">
              <BatchPayments
                apiKey={voucherWallet.apiKey}
                walletId={voucherWallet.walletId}
                darkMode={darkMode}
                onClose={() => {
                  setShowBatchPayments(false);
                  setSideMenuOpen(true);
                }}
                hideHeader={true}
              />
            </div>
          </div>
        </div>
      )}

      {/* Circular Economy Network Overlay */}
      {showNetworkOverlay && (
        <div className="fixed inset-0 bg-white dark:bg-black z-50 overflow-hidden">
          <div className="h-full flex flex-col" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
            {/* Header */}
            <div className="flex-shrink-0 bg-gray-50 dark:bg-blink-dark shadow dark:shadow-black">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16">
                  <button
                    onClick={() => {
                      setShowNetworkOverlay(false);
                      setSideMenuOpen(true);
                    }}
                    className="flex items-center text-gray-700 dark:text-white hover:text-blink-accent dark:hover:text-blink-accent"
                  >
                    <span className="text-2xl mr-2">‹</span>
                    <span className="text-lg">Back</span>
                  </button>
                  <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                    Circular Economy Network
                  </h1>
                  <div className="w-16"></div>
                </div>
              </div>
            </div>
            {/* Content */}
            <div className="flex-1 overflow-hidden">
              <Network
                publicKey={publicKey}
                nostrProfile={nostrProfile}
                darkMode={darkMode}
                toggleDarkMode={toggleDarkMode}
                hideHeader={true}
                onInternalTransition={() => {
                  setTransitionColorIndex(prev => (prev + 1) % SPINNER_COLORS.length);
                  setIsViewTransitioning(true);
                  setTimeout(() => setIsViewTransitioning(false), 120);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Paycodes Overlay */}
      {showPaycode && activeBlinkAccount?.username && (() => {
        // Generate LNURL for the paycode
        const username = activeBlinkAccount.username;
        const hasFixedAmount = paycodeAmount && parseInt(paycodeAmount) > 0;
        
        // Use our custom LNURL-pay endpoint for fixed amounts (sets min=max)
        // Use Blink's endpoint for variable amounts
        const lnurlPayEndpoint = hasFixedAmount
          ? `https://track.twentyone.ist/api/paycode/lnurlp/${username}?amount=${paycodeAmount}`
          : `https://pay.blink.sv/.well-known/lnurlp/${username}`;
        
        // Encode to LNURL using bech32
        const words = bech32.toWords(Buffer.from(lnurlPayEndpoint, 'utf8'));
        const lnurl = bech32.encode('lnurl', words, 1500);
        
        // Web fallback URL - for wallets that don't support LNURL, camera apps open this page
        const webURL = `https://pay.blink.sv/${username}`;
        
        // INTERIM FIX: Use raw LNURL for Blink mobile compatibility
        // Blink mobile has a bug where it doesn't properly handle URLs with ?lightning= param
        // See: https://github.com/blinkbitcoin/blink-mobile/issues/3583
        // Once fixed, we can restore the web fallback: (webURL + '?lightning=' + lnurl).toUpperCase()
        const paycodeURL = lnurl.toUpperCase();
        const lightningAddress = `${username}@blink.sv`;

        // Generate PDF function
        const generatePaycodePdf = async () => {
          setPaycodeGeneratingPdf(true);
          try {
            // Create a canvas from the QR code to get data URL
            const qrCanvas = document.createElement('canvas');
            const QRCodeLib = await import('qrcode');
            await QRCodeLib.toCanvas(qrCanvas, paycodeURL, {
              width: 400,
              margin: 2,
              errorCorrectionLevel: 'H'
            });
            const qrDataUrl = qrCanvas.toDataURL('image/png');

            // Call the PDF API
            const response = await fetch('/api/paycode/pdf', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                lightningAddress,
                qrDataUrl,
                amount: paycodeAmount ? parseInt(paycodeAmount) : null,
                displayAmount: paycodeAmount ? `${parseInt(paycodeAmount).toLocaleString()} sats` : null,
                webUrl: webURL
              })
            });

            if (!response.ok) {
              throw new Error('Failed to generate PDF');
            }

            const { pdf } = await response.json();
            
            // Download the PDF
            const link = document.createElement('a');
            link.href = `data:application/pdf;base64,${pdf}`;
            link.download = `paycode-${username}${paycodeAmount ? `-${paycodeAmount}sats` : ''}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          } catch (error) {
            console.error('Error generating PDF:', error);
            alert('Failed to generate PDF. Please try again.');
          } finally {
            setPaycodeGeneratingPdf(false);
          }
        };

        return (
          <div className="fixed inset-0 bg-white dark:bg-black z-50 overflow-y-auto">
            <div className="min-h-screen" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
              {/* Header */}
              <div className="bg-gray-50 dark:bg-blink-dark shadow dark:shadow-black sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                  <div className="flex justify-between items-center h-16">
                    <button
                      onClick={() => {
                        setShowPaycode(false);
                        setPaycodeAmount('');
                      }}
                      className="flex items-center text-gray-700 dark:text-white hover:text-blink-accent dark:hover:text-blink-accent"
                    >
                      <span className="text-2xl mr-2">‹</span>
                      <span className="text-lg">Back</span>
                    </button>
                    <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                      Paycodes
                    </h1>
                    <div className="w-16"></div>
                  </div>
                </div>
              </div>

              {/* Paycode Content */}
              <div className="max-w-md mx-auto px-4 py-6">
                <div className="text-center space-y-6">
                  {/* Lightning Address Header */}
                  <div>
                    <p className="text-lg font-semibold text-blink-accent">
                      Pay {lightningAddress}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                      Display this static QR code to accept Lightning payments.
                    </p>
                  </div>

                  {/* Amount Configuration */}
                  <div className={`p-4 rounded-lg ${darkMode ? 'bg-gray-900' : 'bg-gray-100'}`}>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Fixed Amount (optional)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={paycodeAmount}
                        onChange={(e) => setPaycodeAmount(e.target.value)}
                        placeholder="Any amount"
                        min="1"
                        className={`flex-1 px-3 py-2 rounded-lg border text-center ${
                          darkMode 
                            ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-500' 
                            : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                        } focus:outline-none focus:ring-2 focus:ring-purple-500`}
                      />
                      <span className="text-sm text-gray-500 dark:text-gray-400">sats</span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                      {paycodeAmount && parseInt(paycodeAmount) > 0 
                        ? `QR will request exactly ${parseInt(paycodeAmount).toLocaleString()} sats`
                        : 'Leave empty to allow payer to choose any amount'}
                    </p>
                  </div>

                  {/* QR Code */}
                  <div className="flex justify-center">
                    <div className="bg-white p-4 rounded-lg shadow-lg border-2 border-gray-200 dark:border-gray-600">
                      <QRCode
                        value={paycodeURL}
                        size={256}
                        bgColor="#ffffff"
                        fgColor="#000000"
                        level="H"
                      />
                    </div>
                  </div>

                  {/* Amount Display (if set) */}
                  {paycodeAmount && parseInt(paycodeAmount) > 0 && (
                    <div className="bg-purple-100 dark:bg-purple-900/30 px-4 py-2 rounded-lg">
                      <p className="text-lg font-bold text-purple-700 dark:text-purple-300">
                        {parseInt(paycodeAmount).toLocaleString()} sats
                      </p>
                    </div>
                  )}

                  {/* Troubleshooting Note */}
                  <div className={`p-4 rounded-lg ${darkMode ? 'bg-yellow-900/30' : 'bg-yellow-50'}`}>
                    <p className="text-sm text-yellow-700 dark:text-yellow-300">
                      <strong>Having trouble scanning?</strong>{' '}
                      Some wallets don't support static QR codes. Scan with your phone's camera app to open a webpage for creating a fresh invoice.
                    </p>
                  </div>

                  {/* Action Buttons */}
                  <div className="space-y-3">
                    {/* Download PDF Button */}
                    <button
                      onClick={generatePaycodePdf}
                      disabled={paycodeGeneratingPdf}
                      className="w-full py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white rounded-lg text-base font-medium transition-colors flex items-center justify-center gap-2"
                    >
                      {paycodeGeneratingPdf ? (
                        <>
                          <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                          Generating PDF...
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          Download PDF
                        </>
                      )}
                    </button>

                    {/* Copy Lightning Address */}
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(lightningAddress);
                      }}
                      className="w-full py-3 bg-blink-accent hover:bg-blue-600 text-white rounded-lg text-base font-medium transition-colors flex items-center justify-center gap-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Copy Lightning Address
                    </button>

                    {/* Copy Paycode LNURL */}
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(paycodeURL);
                      }}
                      className={`w-full py-3 rounded-lg text-base font-medium transition-colors flex items-center justify-center gap-2 ${
                        darkMode 
                          ? 'bg-gray-800 hover:bg-gray-700 text-white' 
                          : 'bg-gray-200 hover:bg-gray-300 text-gray-900'
                      }`}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                      Copy Paycode LNURL
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

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

      {/* % Settings Submenu Overlay (Tip % and Commission % when voucher wallet connected) */}
      {showPercentSettings && (
        <div className="fixed inset-0 bg-white dark:bg-black z-50 overflow-y-auto">
          <div className="min-h-screen" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
            {/* Header */}
            <div className="bg-gray-50 dark:bg-blink-dark shadow dark:shadow-black sticky top-0 z-10">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16">
                  <button
                    onClick={() => setShowPercentSettings(false)}
                    className="flex items-center text-gray-700 dark:text-white hover:text-blink-accent dark:hover:text-blink-accent"
                  >
                    <span className="text-2xl mr-2">‹</span>
                    <span className="text-lg">Back</span>
                  </button>
                  <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                    % Settings
                  </h1>
                  <div className="w-16"></div>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="max-w-md mx-auto px-4 py-6">
              <div className="space-y-4">
                {/* Tip % Settings */}
                <button
                  onClick={() => {
                    setShowPercentSettings(false);
                    setShowTipProfileSettings(true);
                  }}
                  className={`w-full p-4 rounded-lg border-2 transition-all border-gray-300 dark:border-gray-700 bg-white dark:bg-blink-dark hover:border-gray-400 dark:hover:border-gray-600`}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-left">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                        Tip % Settings
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Configure tip percentages for POS payments
                      </p>
                    </div>
                    <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                      <span>{activeTipProfile?.name || 'Custom'}</span>
                      <span className="ml-1">›</span>
                    </div>
                  </div>
                </button>

                {/* Commission % Settings */}
                <button
                  onClick={() => {
                    setShowPercentSettings(false);
                    setShowCommissionSettings(true);
                  }}
                  className={`w-full p-4 rounded-lg border-2 transition-all border-gray-300 dark:border-gray-700 bg-white dark:bg-blink-dark hover:border-gray-400 dark:hover:border-gray-600`}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-left">
                      <h3 className="text-lg font-semibold text-purple-600 dark:text-purple-400 mb-1">
                        Commission % Settings
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Configure commission for voucher creation
                      </p>
                    </div>
                    <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                      <span>{commissionEnabled ? `${commissionPresets.join('%, ')}%` : 'Disabled'}</span>
                      <span className="ml-1">›</span>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Commission % Settings Overlay */}
      {showCommissionSettings && (
        <div className="fixed inset-0 bg-white dark:bg-black z-50 overflow-y-auto">
          <div className="min-h-screen" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
            {/* Header */}
            <div className="bg-gray-50 dark:bg-blink-dark shadow dark:shadow-black sticky top-0 z-10">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16">
                  <button
                    onClick={() => {
                      setShowCommissionSettings(false);
                      setShowPercentSettings(true);
                    }}
                    className="flex items-center text-gray-700 dark:text-white hover:text-blink-accent dark:hover:text-blink-accent"
                  >
                    <span className="text-2xl mr-2">‹</span>
                    <span className="text-lg">Back</span>
                  </button>
                  <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                    Commission % Settings
                  </h1>
                  <div className="w-16"></div>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="max-w-md mx-auto px-4 py-6">
              <div className="space-y-4">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  When enabled, a commission selection screen will appear after entering a voucher amount. The commission percentage is deducted from the voucher value - for example, a $100 voucher with 2% commission creates a voucher worth $98 in sats.
                </p>

                {/* Enable/Disable Commission */}
                <div className={`p-4 rounded-lg border-2 transition-all ${
                  commissionEnabled
                    ? 'border-purple-600 dark:border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                    : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-blink-dark'
                }`}>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Enable Commission
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Show commission options when creating vouchers
                      </p>
                    </div>
                    <button
                      onClick={() => setCommissionEnabled(!commissionEnabled)}
                      className="inline-flex gap-0.5 cursor-pointer focus:outline-none"
                    >
                      <span className={`w-5 h-5 transition-colors ${
                        commissionEnabled ? 'bg-purple-600 dark:bg-purple-500' : 'bg-gray-300 dark:bg-gray-600'
                      }`} />
                      <span className={`w-5 h-5 transition-colors ${
                        commissionEnabled ? 'bg-gray-300 dark:bg-gray-600' : 'bg-purple-600 dark:bg-purple-500'
                      }`} />
                    </button>
                  </div>

                  {commissionEnabled && (
                    <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                        Commission Percentage Options (1-3 presets)
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {commissionPresets.map((preset, index) => (
                          <div key={index} className="flex items-center">
                            <input
                              type="number"
                              value={preset}
                              onChange={(e) => {
                                const newPresets = [...commissionPresets];
                                newPresets[index] = parseFloat(e.target.value) || 0;
                                setCommissionPresets(newPresets);
                              }}
                              className="w-16 px-2 py-2 text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded text-center"
                              min="0"
                              max="100"
                              step="0.5"
                            />
                            <span className="ml-1 text-gray-500 dark:text-gray-400">%</span>
                            {commissionPresets.length > 1 && (
                              <button
                                onClick={() => setCommissionPresets(commissionPresets.filter((_, i) => i !== index))}
                                className="ml-2 text-red-500 hover:text-red-700"
                              >
                                ×
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      {commissionPresets.length < 3 && (
                        <button
                          onClick={() => setCommissionPresets([...commissionPresets, commissionPresets.length === 1 ? 2 : 3])}
                          className="mt-3 px-4 py-2 text-sm bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded transition-colors"
                        >
                          Add Option
                        </button>
                      )}
                    </div>
                  )}
                </div>
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
                    onClick={() => {
                      setShowTipProfileSettings(false);
                      // If voucher wallet is connected, go back to % Settings menu
                      if (voucherWallet) {
                        setShowPercentSettings(true);
                      }
                    }}
                    className="flex items-center text-gray-700 dark:text-white hover:text-blink-accent dark:hover:text-blink-accent"
                  >
                    <span className="text-2xl mr-2">‹</span>
                    <span className="text-lg">Back</span>
                  </button>
                  <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                    Tip % Settings
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
                      setUseCustomWeights(false);
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
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-blink-accent border-t-transparent"></div>
                  </div>
                )}

                {/* Split Profiles List */}
                {!splitProfilesLoading && splitProfiles.map((profile) => {
                  // Check if profile uses custom weights (not evenly distributed)
                  const evenShare = 100 / (profile.recipients?.length || 1);
                  const hasCustomWeights = profile.recipients?.some(r => Math.abs((r.share || evenShare) - evenShare) > 0.01);
                  
                  return (
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
                            {hasCustomWeights 
                              ? profile.recipients.map(r => {
                                  const name = r.type === 'npub_cash' ? r.username : `${r.username}@blink.sv`;
                                  return `${name} (${Math.round(r.share || evenShare)}%)`;
                                }).join(', ')
                              : profile.recipients.map(r => r.type === 'npub_cash' ? r.username : `${r.username}@blink.sv`).join(', ')
                            }
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
                          // Initialize recipients array from profile with weights
                          const recipients = profile.recipients?.map(r => ({ 
                            username: r.username, 
                            validated: true, 
                            type: r.type || 'blink',
                            weight: r.share || (100 / (profile.recipients?.length || 1))
                          })) || [];
                          setNewSplitProfileRecipients(recipients);
                          // Check if profile uses custom weights (not evenly distributed)
                          const evenShare = 100 / (recipients.length || 1);
                          const hasCustomWeights = recipients.some(r => Math.abs(r.weight - evenShare) > 0.01);
                          setUseCustomWeights(hasCustomWeights);
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
                  );
                })}

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
                          <span className="text-sm text-green-700 dark:text-green-400 flex-1">
                            {recipient.type === 'npub_cash' ? recipient.username : `${recipient.username}@blink.sv`}
                          </span>
                          {useCustomWeights && (
                            <div className="flex items-center mx-2">
                              <input
                                type="number"
                                min="1"
                                max="99"
                                value={Math.round(recipient.weight || (100 / newSplitProfileRecipients.length))}
                                onChange={(e) => {
                                  const newWeight = Math.max(1, Math.min(99, parseInt(e.target.value) || 1));
                                  setNewSplitProfileRecipients(prev => {
                                    // Mark this recipient as locked (manually edited)
                                    const updated = prev.map((r, i) => 
                                      i === index ? { ...r, weight: newWeight, locked: true } : r
                                    );
                                    
                                    // Calculate sum of locked weights (including the one just changed)
                                    const lockedSum = updated
                                      .filter(r => r.locked)
                                      .reduce((sum, r) => sum + r.weight, 0);
                                    
                                    // Get unlocked recipients
                                    const unlockedRecipients = updated.filter(r => !r.locked);
                                    
                                    // If there are unlocked recipients, distribute remaining weight among them
                                    if (unlockedRecipients.length > 0) {
                                      const remainingWeight = Math.max(0, 100 - lockedSum);
                                      const weightPerUnlocked = remainingWeight / unlockedRecipients.length;
                                      
                                      return updated.map(r => 
                                        r.locked ? r : { ...r, weight: weightPerUnlocked }
                                      );
                                    }
                                    
                                    // All recipients are locked, just return updated
                                    return updated;
                                  });
                                }}
                                className={`w-16 px-2 py-1 text-sm text-center border rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white ${
                                  recipient.locked 
                                    ? 'border-blink-accent ring-1 ring-blink-accent/30' 
                                    : 'border-gray-300 dark:border-gray-600'
                                }`}
                              />
                              <span className="ml-1 text-sm text-gray-500 dark:text-gray-400">%</span>
                              {recipient.locked && (
                                <button
                                  onClick={() => {
                                    // Unlock this recipient and redistribute
                                    setNewSplitProfileRecipients(prev => {
                                      const updated = prev.map((r, i) => 
                                        i === index ? { ...r, locked: false } : r
                                      );
                                      
                                      // Recalculate: get locked sum and redistribute among unlocked
                                      const lockedSum = updated
                                        .filter(r => r.locked)
                                        .reduce((sum, r) => sum + r.weight, 0);
                                      
                                      const unlockedRecipients = updated.filter(r => !r.locked);
                                      if (unlockedRecipients.length > 0) {
                                        const remainingWeight = Math.max(0, 100 - lockedSum);
                                        const weightPerUnlocked = remainingWeight / unlockedRecipients.length;
                                        
                                        return updated.map(r => 
                                          r.locked ? r : { ...r, weight: weightPerUnlocked }
                                        );
                                      }
                                      
                                      return updated;
                                    });
                                  }}
                                  className="ml-1 text-xs text-blink-accent hover:text-blink-accent/70"
                                  title="Unlock - allow auto-adjustment"
                                >
                                  🔒
                                </button>
                              )}
                            </div>
                          )}
                          <button
                            onClick={() => removeRecipientFromProfile(recipient.username)}
                            className="text-red-500 hover:text-red-700 text-lg font-bold ml-2"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      
                      {/* Custom Weights Toggle - only show when 2+ recipients */}
                      {newSplitProfileRecipients.length > 1 && (
                        <div className="flex items-center justify-between py-2 mt-2 border-t border-gray-200 dark:border-gray-700">
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            Custom split weights
                          </span>
                          <button
                            onClick={() => {
                              if (useCustomWeights) {
                                // Switching to even split - reset all weights
                                const evenWeight = 100 / newSplitProfileRecipients.length;
                                setNewSplitProfileRecipients(prev => 
                                  prev.map(r => ({ ...r, weight: evenWeight }))
                                );
                              }
                              setUseCustomWeights(!useCustomWeights);
                            }}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                              useCustomWeights ? 'bg-blink-accent' : 'bg-gray-300 dark:bg-gray-600'
                            }`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                useCustomWeights ? 'translate-x-6' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </div>
                      )}
                      
                      {/* Weight Summary */}
                      {useCustomWeights ? (
                        <div className="text-xs mt-1">
                          {(() => {
                            const totalWeight = newSplitProfileRecipients.reduce((sum, r) => sum + (r.weight || 0), 0);
                            const isValid = Math.abs(totalWeight - 100) < 0.01;
                            return (
                              <p className={isValid ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}>
                                Total: {Math.round(totalWeight)}% {isValid ? '✓' : `(must equal 100%)`}
                              </p>
                            );
                          })()}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Split will be divided evenly ({(100 / newSplitProfileRecipients.length).toFixed(1)}% each)
                        </p>
                      )}
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
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-blink-accent border-t-transparent"></div>
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
                    
                    // Calculate shares based on custom weights or even split
                    let recipients;
                    if (useCustomWeights && newSplitProfileRecipients.length > 1) {
                      // Validate total weights equal 100%
                      const totalWeight = newSplitProfileRecipients.reduce((sum, r) => sum + (r.weight || 0), 0);
                      if (Math.abs(totalWeight - 100) > 0.01) {
                        setSplitProfileError(`Total split weights must equal 100% (currently ${Math.round(totalWeight)}%)`);
                        return;
                      }
                      
                      recipients = newSplitProfileRecipients.map(r => ({
                        username: r.username,
                        type: r.type || 'blink',
                        share: r.weight
                      }));
                    } else {
                      // Even split
                      const sharePerRecipient = 100 / newSplitProfileRecipients.length;
                      recipients = newSplitProfileRecipients.map(r => ({
                        username: r.username,
                        type: r.type || 'blink',
                        share: sharePerRecipient
                      }));
                    }
                    
                    const profile = {
                      id: editingSplitProfile?.id,
                      label: newSplitProfileLabel.trim(),
                      recipients,
                      useCustomWeights: useCustomWeights && newSplitProfileRecipients.length > 1
                    };
                    
                    const saved = await saveSplitProfile(profile, true);
                    if (saved) {
                      setShowCreateSplitProfile(false);
                      setEditingSplitProfile(null);
                      setShowTipSettings(false);
                      setUseCustomWeights(false);
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
                          Get from your wallet app (Alby, Coinos, Zeus, minibits.cash, etc.)
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
                    Alby, Coinos, Zeus, minibits.cash etc.
                  </p>
                  <p>
                    <span className="text-emerald-500">Cashu:</span>{' '}
                    <a href="https://npub.cash" target="_blank" rel="noopener noreferrer" className="hover:underline">npub.cash</a>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Voucher Wallet Overlay */}
      {showVoucherWalletSettings && (
        <div className="fixed inset-0 bg-white dark:bg-black z-50 overflow-y-auto">
          <div className="min-h-screen" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
            {/* Header */}
            <div className="bg-gray-50 dark:bg-blink-dark shadow dark:shadow-black sticky top-0 z-10">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16">
                  <button
                    onClick={() => {
                      setShowVoucherWalletSettings(false);
                      setVoucherWalletApiKey('');
                      setVoucherWalletLabel('');
                      setVoucherWalletError(null);
                      setVoucherWalletScopes(null);
                    }}
                    className="flex items-center text-gray-700 dark:text-white hover:text-blink-accent dark:hover:text-blink-accent"
                  >
                    <span className="text-2xl mr-2">‹</span>
                    <span className="text-lg">Back</span>
                  </button>
                  <div className="flex items-center gap-2">
                    <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                      Voucher Wallet
                    </h1>
                    <span className="px-2 py-0.5 text-xs font-medium rounded bg-purple-500/20 text-purple-400">Beta</span>
                  </div>
                  <div className="w-16"></div>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="max-w-md mx-auto px-4 py-6">
              <div className="space-y-4">
                {/* Info Banner */}
                <div className={`p-4 rounded-lg ${darkMode ? 'bg-purple-900/20 border border-purple-500/30' : 'bg-purple-50 border border-purple-200'}`}>
                  <div className="flex gap-3">
                    <svg className="w-5 h-5 text-purple-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <p className={`text-sm font-medium ${darkMode ? 'text-purple-300' : 'text-purple-800'}`}>
                        Voucher Wallet Requirements
                      </p>
                      <p className={`text-xs mt-1 ${darkMode ? 'text-purple-400/80' : 'text-purple-600'}`}>
                        This wallet is used for voucher operations. It requires a Blink API key with <strong>WRITE</strong> scope to create and manage vouchers.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Current Voucher Wallet */}
                {voucherWallet && (
                  <div className={`rounded-lg p-4 border-2 ${darkMode ? 'bg-purple-900/20 border-purple-500' : 'bg-purple-50 border-purple-400'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center bg-purple-500/20">
                          <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
                          </svg>
                        </div>
                        <div className="min-w-0">
                          <h5 className={`font-medium truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                            {voucherWallet.label || 'Voucher Wallet'}
                          </h5>
                          <p className={`text-sm truncate ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                            @{voucherWallet.username}
                          </p>
                          {voucherWallet.walletId && (
                            <p className={`text-xs truncate ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                              Wallet: {voucherWallet.walletId}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-1 mt-1">
                            {voucherWallet.scopes?.map((scope) => (
                              <span key={scope} className={`px-1.5 py-0.5 rounded text-xs ${
                                scope === 'WRITE' 
                                  ? 'bg-green-500/20 text-green-400' 
                                  : 'bg-gray-500/20 text-gray-400'
                              }`}>
                                {scope}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          if (typeof window !== 'undefined') {
                            localStorage.removeItem('blinkpos-voucher-wallet');
                          }
                          setVoucherWallet(null);
                          // Sync deletion to server
                          syncVoucherWalletToServer(null);
                        }}
                        className={`p-2 rounded transition-colors ${darkMode ? 'text-gray-500 hover:text-red-400 hover:bg-gray-800' : 'text-gray-400 hover:text-red-500 hover:bg-gray-100'}`}
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}

                {/* Add Voucher Wallet Form */}
                {!voucherWallet && (
                  <div className={`rounded-lg p-4 ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
                    <h3 className={`text-sm font-medium mb-3 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      Connect Blink API Key
                    </h3>
                    <form onSubmit={async (e) => {
                      e.preventDefault();
                      if (!voucherWalletApiKey.trim()) {
                        setVoucherWalletError('Please enter an API key');
                        return;
                      }
                      
                      setVoucherWalletLoading(true);
                      setVoucherWalletError(null);
                      setVoucherWalletScopes(null);
                      
                      try {
                        // Step 1: Check scopes using authorization query
                        setVoucherWalletValidating(true);
                        const scopeResponse = await fetch('https://api.blink.sv/graphql', {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            'X-API-KEY': voucherWalletApiKey.trim()
                          },
                          body: JSON.stringify({
                            query: '{ authorization { scopes } }'
                          })
                        });
                        
                        if (!scopeResponse.ok) {
                          throw new Error('Invalid API key');
                        }
                        
                        const scopeData = await scopeResponse.json();
                        if (scopeData.errors) {
                          throw new Error(scopeData.errors[0]?.message || 'Failed to check API key scopes');
                        }
                        
                        const scopes = scopeData.data?.authorization?.scopes || [];
                        setVoucherWalletScopes(scopes);
                        
                        // Step 2: Verify WRITE scope is present
                        if (!scopes.includes('WRITE')) {
                          setVoucherWalletError(`This API key does not have WRITE scope. Found scopes: ${scopes.join(', ') || 'none'}. The voucher feature requires WRITE permission.`);
                          setVoucherWalletLoading(false);
                          setVoucherWalletValidating(false);
                          return;
                        }
                        
                        // Step 3: Get user info and wallet ID
                        const userResponse = await fetch('https://api.blink.sv/graphql', {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            'X-API-KEY': voucherWalletApiKey.trim()
                          },
                          body: JSON.stringify({
                            query: '{ me { id username defaultAccount { displayCurrency wallets { id walletCurrency } } } }'
                          })
                        });
                        
                        if (!userResponse.ok) {
                          throw new Error('Failed to validate API key');
                        }
                        
                        const userData = await userResponse.json();
                        if (userData.errors || !userData.data?.me?.id) {
                          throw new Error('Invalid API key');
                        }
                        
                        // Get BTC wallet ID
                        const wallets = userData.data.me.defaultAccount?.wallets || [];
                        const btcWallet = wallets.find(w => w.walletCurrency === 'BTC');
                        
                        if (!btcWallet) {
                          throw new Error('No BTC wallet found for this account. The voucher feature requires a BTC wallet.');
                        }
                        
                        // Save voucher wallet
                        const walletData = {
                          apiKey: voucherWalletApiKey.trim(),
                          walletId: btcWallet.id,
                          label: voucherWalletLabel.trim() || 'Voucher Wallet',
                          username: userData.data.me.username,
                          userId: userData.data.me.id,
                          displayCurrency: userData.data.me.defaultAccount?.displayCurrency || 'BTC',
                          scopes: scopes,
                          createdAt: Date.now()
                        };
                        
                        if (typeof window !== 'undefined') {
                          localStorage.setItem('blinkpos-voucher-wallet', JSON.stringify(walletData));
                        }
                        setVoucherWallet(walletData);
                        
                        // Sync to server for cross-device access
                        syncVoucherWalletToServer(walletData);
                        
                        // Reset form
                        setVoucherWalletApiKey('');
                        setVoucherWalletLabel('');
                        setVoucherWalletScopes(null);
                      } catch (err) {
                        setVoucherWalletError(err.message);
                      } finally {
                        setVoucherWalletLoading(false);
                        setVoucherWalletValidating(false);
                      }
                    }} className="space-y-3">
                      <div>
                        <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                          Label (optional)
                        </label>
                        <input
                          type="text"
                          value={voucherWalletLabel}
                          onChange={(e) => setVoucherWalletLabel(e.target.value)}
                          placeholder="My Voucher Wallet"
                          autoComplete="off"
                          data-1p-ignore="true"
                          data-lpignore="true"
                          className={`w-full px-3 py-2 rounded-md border text-sm ${
                            darkMode 
                              ? 'bg-gray-800 border-gray-600 text-white placeholder-gray-500' 
                              : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                          } focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent`}
                        />
                      </div>
                      <div>
                        <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                          Blink API Key <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="password"
                          value={voucherWalletApiKey}
                          onChange={(e) => {
                            setVoucherWalletApiKey(e.target.value);
                            setVoucherWalletError(null);
                            setVoucherWalletScopes(null);
                          }}
                          placeholder="blink_..."
                          required
                          autoComplete="off"
                          data-1p-ignore="true"
                          data-lpignore="true"
                          className={`w-full px-3 py-2 rounded-md border text-sm ${
                            darkMode 
                              ? 'bg-gray-800 border-gray-600 text-white placeholder-gray-500' 
                              : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                          } focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent`}
                        />
                        <p className={`text-xs mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                          Get from <a href="https://dashboard.blink.sv" target="_blank" rel="noopener noreferrer" className="text-purple-500 hover:underline">dashboard.blink.sv</a>. 
                          Must have <span className="font-semibold">WRITE</span> scope.
                        </p>
                      </div>
                      
                      {/* Scopes Display */}
                      {voucherWalletScopes && (
                        <div className={`p-3 rounded-md ${
                          voucherWalletScopes.includes('WRITE')
                            ? darkMode ? 'bg-green-900/20 border border-green-500/30' : 'bg-green-50 border border-green-200'
                            : darkMode ? 'bg-red-900/20 border border-red-500/30' : 'bg-red-50 border border-red-200'
                        }`}>
                          <div className="flex items-center gap-2 mb-1">
                            {voucherWalletScopes.includes('WRITE') ? (
                              <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                              </svg>
                            ) : (
                              <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            )}
                            <span className={`text-sm font-medium ${
                              voucherWalletScopes.includes('WRITE')
                                ? darkMode ? 'text-green-400' : 'text-green-700'
                                : darkMode ? 'text-red-400' : 'text-red-700'
                            }`}>
                              {voucherWalletScopes.includes('WRITE') ? 'WRITE scope found' : 'Missing WRITE scope'}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {voucherWalletScopes.map((scope) => (
                              <span key={scope} className={`px-2 py-0.5 rounded text-xs ${
                                scope === 'WRITE' 
                                  ? 'bg-green-500/20 text-green-400' 
                                  : darkMode ? 'bg-gray-700 text-gray-400' : 'bg-gray-200 text-gray-600'
                              }`}>
                                {scope}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {voucherWalletError && (
                        <div className={`p-3 rounded-md ${darkMode ? 'bg-red-900/20 border border-red-500/30' : 'bg-red-50 border border-red-200'}`}>
                          <p className="text-sm text-red-500">{voucherWalletError}</p>
                        </div>
                      )}
                      
                      <button
                        type="submit"
                        disabled={voucherWalletLoading || !voucherWalletApiKey.trim()}
                        className="w-full py-3 bg-purple-600 text-white text-sm font-medium rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {voucherWalletLoading 
                          ? (voucherWalletValidating ? 'Checking scopes...' : 'Adding...') 
                          : 'Add Voucher Wallet'
                        }
                      </button>
                    </form>
                  </div>
                )}

                {/* Help Section */}
                <div className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                  <p className="font-medium mb-1">About Voucher Wallet:</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    <li>Used exclusively for voucher creation and redemption</li>
                    <li>Separate from your main receiving wallet</li>
                    <li>Requires API key with WRITE permission</li>
                  </ul>
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
                {/* Filtered Export - Show when date filter is active */}
                {dateFilterActive && filteredTransactions.length > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-sm font-medium text-green-600 dark:text-green-400">
                        Active Filter: {selectedDateRange?.label} ({filteredTransactions.length} transactions)
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        // Export filtered transactions
                        const csv = convertTransactionsToBasicCSV(filteredTransactions);
                        const date = new Date();
                        const dateStr = date.getFullYear() + 
                                        String(date.getMonth() + 1).padStart(2, '0') + 
                                        String(date.getDate()).padStart(2, '0');
                        const username = user?.username || 'user';
                        const rangeLabel = selectedDateRange?.label?.replace(/[^a-zA-Z0-9]/g, '-') || 'filtered';
                        const filename = `${dateStr}-${username}-${rangeLabel}-transactions.csv`;
                        downloadCSV(csv, filename);
                        setShowExportOptions(false);
                      }}
                      disabled={exportingData}
                      className="w-full p-4 rounded-lg border-2 border-green-500 dark:border-green-400 bg-white dark:bg-blink-dark hover:border-green-600 dark:hover:border-green-300 hover:bg-green-50 dark:hover:bg-green-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-left">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
                            Export Filtered
                          </h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {selectedDateRange?.label} - {filteredTransactions.length} transactions (CSV)
                          </p>
                        </div>
                        <div className="text-green-600 dark:text-green-400 text-xl">↓</div>
                      </div>
                    </button>
                  </div>
                )}

                {dateFilterActive && filteredTransactions.length > 0 && (
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-gray-300 dark:border-gray-600"></div>
                    </div>
                    <div className="relative flex justify-center text-sm">
                      <span className="px-2 bg-white dark:bg-black text-gray-500">Or export all history</span>
                    </div>
                  </div>
                )}

                {/* Basic Export */}
                <button
                  onClick={exportBasicTransactions}
                  disabled={exportingData}
                  className="w-full p-4 rounded-lg border-2 border-blue-500 dark:border-blue-400 bg-white dark:bg-blink-dark hover:border-blue-600 dark:hover:border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-left">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
                        Basic (All)
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {exportingData ? 'Exporting simplified transaction summary...' : 'All transactions - simplified format (CSV)'}
                      </p>
                    </div>
                    {exportingData ? (
                      <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-600 dark:border-blue-400 border-t-transparent"></div>
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
                        Full (All)
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {exportingData ? 'Exporting complete transaction history...' : 'All transactions - complete format (CSV)'}
                      </p>
                    </div>
                    {exportingData ? (
                      <div className="animate-spin rounded-full h-6 w-6 border-2 border-yellow-600 dark:border-yellow-400 border-t-transparent"></div>
                    ) : (
                      <div className="text-yellow-600 dark:text-yellow-400 text-xl">↓</div>
                    )}
                  </div>
                </button>
              </div>
              
              {/* Info Text */}
              <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                {dateFilterActive && filteredTransactions.length > 0 && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    <strong>Filtered Export:</strong> Only transactions from {selectedDateRange?.label}.
                  </p>
                )}
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

      {/* Date Range Selector Modal */}
      {showDateRangeSelector && (
        <div className="fixed inset-0 bg-white dark:bg-black z-50 overflow-y-auto">
          <div className="min-h-screen">
            {/* Header */}
            <div className="bg-gray-50 dark:bg-blink-dark shadow dark:shadow-black sticky top-0 z-10">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16">
                  <button
                    onClick={() => setShowDateRangeSelector(false)}
                    className="flex items-center text-gray-700 dark:text-white hover:text-blink-accent dark:hover:text-blink-accent"
                  >
                    <span className="text-2xl mr-2">‹</span>
                    <span className="text-lg">Back</span>
                  </button>
                  <h1 className="text-xl font-bold text-gray-900 dark:text-white" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
                    Select Date Range
                  </h1>
                  <div className="w-16"></div>
                </div>
              </div>
            </div>

            {/* Date Range Options */}
            <div className="max-w-md mx-auto px-4 py-6">
              <div className="space-y-3">
                {/* Quick Options */}
                <div className="mb-4">
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3 uppercase tracking-wide">
                    Quick Options
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {getDateRangePresets().map((preset) => (
                      <button
                        key={preset.id}
                        onClick={() => loadTransactionsForDateRange({ type: 'preset', ...preset })}
                        disabled={loadingMore}
                        className="p-4 rounded-lg border-2 border-blue-500 dark:border-blue-400 bg-white dark:bg-blink-dark hover:border-blue-600 dark:hover:border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-left"
                      >
                        <h4 className="text-base font-semibold text-gray-900 dark:text-white" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
                          {preset.label}
                        </h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {preset.start.toLocaleDateString()} {preset.id !== 'today' && preset.id !== 'yesterday' && `- ${preset.end.toLocaleDateString()}`}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Date Range */}
                <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3 uppercase tracking-wide">
                    Custom Range
                  </h3>
                  <div className="space-y-3">
                    {/* Start Date/Time */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Start Date
                      </label>
                      <div className={`flex gap-2 ${showTimeInputs ? 'flex-col sm:flex-row' : ''}`}>
                        <input
                          type="date"
                          value={customDateStart}
                          onChange={(e) => setCustomDateStart(e.target.value)}
                          max={customDateEnd || new Date().toISOString().split('T')[0]}
                          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                        {showTimeInputs && (
                          <input
                            type="time"
                            value={customTimeStart}
                            onChange={(e) => setCustomTimeStart(e.target.value)}
                            className="w-full sm:w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        )}
                      </div>
                    </div>
                    
                    {/* End Date/Time */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        End Date
                      </label>
                      <div className={`flex gap-2 ${showTimeInputs ? 'flex-col sm:flex-row' : ''}`}>
                        <input
                          type="date"
                          value={customDateEnd}
                          onChange={(e) => setCustomDateEnd(e.target.value)}
                          min={customDateStart}
                          max={new Date().toISOString().split('T')[0]}
                          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                        {showTimeInputs && (
                          <input
                            type="time"
                            value={customTimeEnd}
                            onChange={(e) => setCustomTimeEnd(e.target.value)}
                            className="w-full sm:w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        )}
                      </div>
                    </div>

                    {/* Toggle Time Inputs */}
                    <button
                      type="button"
                      onClick={() => setShowTimeInputs(!showTimeInputs)}
                      className={`flex items-center gap-2 text-sm font-medium transition-colors ${
                        showTimeInputs 
                          ? 'text-blue-600 dark:text-blue-400' 
                          : 'text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400'
                      }`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {showTimeInputs ? 'Hide time options' : 'Add specific times'}
                    </button>

                    {/* Apply Button */}
                    <button
                      onClick={handleCustomDateRange}
                      disabled={!customDateStart || !customDateEnd || loadingMore}
                      className="w-full py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {loadingMore ? (
                        <div className="flex items-center justify-center">
                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                          Loading...
                        </div>
                      ) : (
                        'Apply Custom Range'
                      )}
                    </button>
                  </div>
                </div>
              </div>
              
              {/* Info Text */}
              <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Select a date range to filter and view transactions. You can then export the filtered data using the Export button.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <main 
        className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mobile-content ${isFixedView ? 'h-[calc(100vh-80px)] overflow-hidden py-2' : 'py-6'}`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {error && (
          <div className="mb-4 bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-200 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {/* Owner/Agent Display - Left aligned on POS, Cart, Voucher, MultiVoucher, and VoucherManager (hidden when showing voucher QR) */}
        {!showingInvoice && !showingVoucherQR && (currentView === 'pos' || currentView === 'cart' || currentView === 'voucher' || currentView === 'multivoucher' || currentView === 'vouchermanager') && (
          <div className="flex flex-col gap-1 mb-2 bg-white dark:bg-black">
            {/* Owner Display Row - with Expiry Selector on right for Voucher screen */}
            <div className="flex items-center justify-between">
              {/* Left side: Owner info */}
              {(() => {
                // For voucher, multivoucher, and vouchermanager views, show voucher wallet
                if (currentView === 'voucher' || currentView === 'multivoucher' || currentView === 'vouchermanager') {
                  if (voucherWallet) {
                    return (
                      <div className="flex items-center gap-2">
                        <img src="/purpledot.svg" alt="Voucher Wallet" className="w-2 h-2" />
                        <span className="font-semibold text-purple-600 dark:text-purple-400" style={{fontSize: '11.2px'}}>
                          {voucherWallet.label || voucherWallet.username || 'Voucher Wallet'}
                        </span>
                      </div>
                    );
                  } else {
                    return (
                      <button 
                        onClick={() => setShowVoucherWalletSettings(true)}
                        className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                      >
                        <img src="/yellowdot.svg" alt="No Wallet" className="w-2 h-2" />
                        <span className="font-semibold text-yellow-600 dark:text-yellow-400" style={{fontSize: '11.2px'}}>
                          Connect voucher wallet
                        </span>
                      </button>
                    );
                  }
                }
                
                // For POS/Cart view, show regular wallet
                const hasWallet = activeNWC || activeNpubCashWallet || activeBlinkAccount;
                const noWallet = !hasWallet;
                const dotColor = activeNWC ? "/purpledot.svg" : activeNpubCashWallet ? "/tealdot.svg" : hasWallet ? "/bluedot.svg" : "/yellowdot.svg";
                const textColorClass = activeNWC ? 'text-purple-600 dark:text-purple-400' : 
                  activeNpubCashWallet ? 'text-teal-600 dark:text-teal-400' : 
                  hasWallet ? 'text-blue-600 dark:text-blue-400' :
                  'text-yellow-600 dark:text-yellow-400';
                const displayText = activeNWC ? activeNWC.label : activeNpubCashWallet ? (activeNpubCashWallet.label || activeNpubCashWallet.lightningAddress) : (activeBlinkAccount?.label || activeBlinkAccount?.username || 'Connect wallet to start');
                
                if (noWallet) {
                  return (
                    <button 
                      onClick={() => setShowAccountSettings(true)}
                      className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                    >
                      <img src={dotColor} alt="Owner" className="w-2 h-2" />
                      <span className={`font-semibold ${textColorClass}`} style={{fontSize: '11.2px'}}>
                        {displayText}
                      </span>
                    </button>
                  );
                }
                
                return (
                  <div className="flex items-center gap-2">
                    <img src={dotColor} alt="Owner" className="w-2 h-2" />
                    <span className={`font-semibold ${textColorClass}`} style={{fontSize: '11.2px'}}>
                      {displayText}
                    </span>
                  </div>
                );
              })()}
              
              {/* Right side: Expiry Selector (on Voucher and MultiVoucher screens) */}
              {currentView === 'voucher' && !showingVoucherQR && (
                <ExpirySelector
                  value={voucherRef.current?.getSelectedExpiry?.() || '7d'}
                  onChange={(expiryId) => voucherRef.current?.setSelectedExpiry?.(expiryId)}
                />
              )}
              {currentView === 'multivoucher' && (
                <ExpirySelector
                  value={multiVoucherRef.current?.getSelectedExpiry?.() || '7d'}
                  onChange={(expiryId) => multiVoucherRef.current?.setSelectedExpiry?.(expiryId)}
                />
              )}
            </div>
            
            {/* Agent Display Row - Always reserve space for consistent numpad positioning */}
            {/* On POS/Cart: Show split profile if active, otherwise empty placeholder */}
            {/* On Voucher/MultiVoucher/VoucherManager: Always show empty placeholder to match POS layout */}
            <div className="flex items-center gap-2 min-h-[18px]">
              {activeSplitProfile && currentView !== 'voucher' && currentView !== 'multivoucher' && currentView !== 'vouchermanager' && (
                <>
                  <img 
                    src="/greendot.svg" 
                    alt="Split Active" 
                    className="w-2 h-2"
                  />
                  <span className="text-green-600 dark:text-green-400 font-semibold" style={{fontSize: '11.2px'}}>
                    {activeSplitProfile.label}
                  </span>
                </>
              )}
            </div>
          </div>
        )}

        {/* View Transition Loading Overlay */}
        {isViewTransitioning && (
          <div className="fixed inset-0 z-40 bg-white/80 dark:bg-black/80 flex items-center justify-center backdrop-blur-sm">
            <div className={`animate-spin rounded-full h-12 w-12 border-4 ${SPINNER_COLORS[transitionColorIndex]} border-t-transparent`}></div>
          </div>
        )}

        {/* Conditional Content Based on Current View */}
        {currentView === 'cart' ? (
          <div className="h-[calc(100vh-180px)] min-h-[400px]">
            <ItemCart
              ref={cartRef}
              displayCurrency={displayCurrency}
              currencies={currencies}
              publicKey={publicKey}
              onCheckout={(checkoutData) => {
                // Store checkout data and switch to POS
                setCartCheckoutData(checkoutData);
                handleViewTransition('pos');
              }}
              soundEnabled={soundEnabled}
              darkMode={darkMode}
              toggleDarkMode={toggleDarkMode}
              isViewTransitioning={isViewTransitioning}
            />
          </div>
        ) : currentView === 'pos' ? (
          <POS 
            ref={posRef}
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
            onInvoiceChange={(invoiceData) => {
              setCurrentInvoice(invoiceData);
              // CRITICAL: Immediately set expected payment hash to bypass React render cycle
              // This ensures the WebSocket knows which payment to accept BEFORE React re-renders
              blinkposSetExpectedPaymentHash(invoiceData?.paymentHash || null);
            }}
            darkMode={darkMode}
            toggleDarkMode={toggleDarkMode}
            nfcState={nfcState}
            activeNWC={activeNWC}
            nwcClientReady={nwcClientReady}
            nwcMakeInvoice={nwcMakeInvoice}
            nwcLookupInvoice={nwcLookupInvoice}
            getActiveNWCUri={getActiveNWCUri}
            activeBlinkAccount={activeBlinkAccount}
            activeNpubCashWallet={activeNpubCashWallet}
            cartCheckoutData={cartCheckoutData}
            onCartCheckoutProcessed={() => setCartCheckoutData(null)}
            onInternalTransition={() => {
              // Rotate spinner color and show brief transition
              setTransitionColorIndex(prev => (prev + 1) % SPINNER_COLORS.length);
              setIsViewTransitioning(true);
              setTimeout(() => setIsViewTransitioning(false), 120);
            }}
            triggerPaymentAnimation={triggerPaymentAnimation}
          />
        ) : currentView === 'multivoucher' ? (
          <div className="h-[calc(100vh-180px)] min-h-[400px]">
            <MultiVoucher
              ref={multiVoucherRef}
              voucherWallet={voucherWallet}
              displayCurrency={displayCurrency}
              currencies={currencies}
              darkMode={darkMode}
              toggleDarkMode={toggleDarkMode}
              soundEnabled={soundEnabled}
              commissionEnabled={commissionEnabled}
              commissionPresets={commissionPresets}
              onInternalTransition={() => {
                // Rotate spinner color and show brief transition
                setTransitionColorIndex(prev => (prev + 1) % SPINNER_COLORS.length);
                setIsViewTransitioning(true);
                setTimeout(() => setIsViewTransitioning(false), 120);
              }}
            />
          </div>
        ) : currentView === 'voucher' ? (
          <div className="h-[calc(100vh-180px)] min-h-[400px]">
            <Voucher
              ref={voucherRef}
              voucherWallet={voucherWallet}
              displayCurrency={displayCurrency}
              currencies={currencies}
              darkMode={darkMode}
              toggleDarkMode={toggleDarkMode}
              soundEnabled={soundEnabled}
              onVoucherStateChange={setShowingVoucherQR}
              commissionEnabled={commissionEnabled}
              commissionPresets={commissionPresets}
              onInternalTransition={() => {
                // Rotate spinner color and show brief transition
                setTransitionColorIndex(prev => (prev + 1) % SPINNER_COLORS.length);
                setIsViewTransitioning(true);
                setTimeout(() => setIsViewTransitioning(false), 120);
              }}
            />
          </div>
        ) : currentView === 'vouchermanager' ? (
          <div className="h-[calc(100vh-180px)] min-h-[400px]">
            <VoucherManager
              ref={voucherManagerRef}
              voucherWallet={voucherWallet}
              displayCurrency={displayCurrency}
              currencies={currencies}
              darkMode={darkMode}
              toggleDarkMode={toggleDarkMode}
              soundEnabled={soundEnabled}
              onInternalTransition={() => {
                // Rotate spinner color and show brief transition
                setTransitionColorIndex(prev => (prev + 1) % SPINNER_COLORS.length);
                setIsViewTransitioning(true);
                setTimeout(() => setIsViewTransitioning(false), 120);
              }}
            />
          </div>
        ) : (
          <>
            {/* Most Recent Transactions */}
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">Most Recent Transactions</h2>
          {(() => {
            // Check if current wallet type doesn't support transaction history
            const isLnAddressWallet = activeBlinkAccount?.type === 'ln-address';
            const isNpubCashWallet = activeNpubCashWallet?.type === 'npub-cash' && !activeNWC;
            const walletDoesNotSupportHistory = isLnAddressWallet || isNpubCashWallet;

            if (walletDoesNotSupportHistory && transactions.length === 0) {
              // Show informative message about wallet limitation
              const walletType = isLnAddressWallet ? 'Blink Lightning Address' : 'npub.cash';
              return (
                <div className="bg-white dark:bg-blink-dark shadow dark:shadow-black rounded-lg p-6">
                  <div className="flex flex-col items-center gap-4 text-center">
                    <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                      <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                        Transaction History Not Available
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 max-w-md">
                        {walletType} wallets are designed for receiving payments only and do not provide transaction history.
                        {isLnAddressWallet && " To view transaction history, please use a Blink API Key wallet."}
                      </p>
                    </div>
                  </div>
                </div>
              );
            }

            // Show normal transaction list
            return (
              <div className="bg-white dark:bg-blink-dark shadow dark:shadow-black overflow-hidden sm:rounded-md">
                <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                  {transactions.slice(0, 5).map((tx) => (
                    <li 
                      key={tx.id} 
                      className="px-6 py-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      onClick={() => setSelectedTransaction(tx)}
                    >
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
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <p className="text-sm text-gray-900 dark:text-gray-100">{tx.status}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">{tx.date}</p>
                          </div>
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })()}
        </div>

        {/* Past Transactions - Grouped by Month or Filtered */}
        <div>
          {/* Title Row - Own line */}
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            {dateFilterActive ? 'Filtered Transactions' : 'Past Transactions'}
          </h2>
          
          {/* Date Range Tag - Own line when active */}
          {dateFilterActive && selectedDateRange && (
            <div className="mb-4">
              <button
                onClick={clearDateFilter}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
              >
                <span>{selectedDateRange.label}</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {/* Top Action Buttons - Only visible when there are transactions */}
          {transactions.length > 0 && (
          <div className="mb-4">
            {isSearchingTx ? (
              /* Expanded Search Input */
              <div className="max-w-sm h-10 bg-white dark:bg-black border-2 border-orange-500 dark:border-orange-500 rounded-lg flex items-center shadow-md">
                {/* Cancel button */}
                <button
                  onClick={() => { setIsSearchingTx(false); setTxSearchInput(''); }}
                  className="w-10 h-full flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                <input
                  ref={txSearchInputRef}
                  type="text"
                  value={txSearchInput}
                  onChange={(e) => setTxSearchInput(e.target.value)}
                  onKeyDown={handleTxSearchKeyDown}
                  placeholder="Search memo, amount, username..."
                  className="flex-1 h-full bg-transparent text-gray-900 dark:text-white focus:outline-none text-sm"
                  autoFocus
                />
                {/* Submit button */}
                <button
                  onClick={handleTxSearchSubmit}
                  disabled={!txSearchInput.trim()}
                  className="w-10 h-full flex items-center justify-center text-orange-500 hover:text-orange-600 dark:text-orange-400 dark:hover:text-orange-300 disabled:text-gray-300 dark:disabled:text-gray-600 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </button>
              </div>
            ) : (
              /* Filter, Search, Export buttons row */
              <div className="flex gap-2 max-w-sm">
                {/* Filter Button */}
                <button
                  onClick={() => setShowDateRangeSelector(true)}
                  disabled={loadingMore}
                  className="flex-1 h-10 bg-white dark:bg-black border border-blue-500 dark:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900 text-blue-600 dark:text-blue-400 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Filter
                </button>
                
                {/* Search Button */}
                <button
                  onClick={txSearchQuery ? handleTxSearchClose : handleTxSearchClick}
                  className={`flex-1 h-10 bg-white dark:bg-black border rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                    txSearchQuery 
                      ? 'border-orange-500 dark:border-orange-400 bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-300' 
                      : 'border-orange-500 dark:border-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900 text-orange-500 dark:text-orange-400'
                  }`}
                >
                  {isSearchLoading ? (
                    /* Loading spinner */
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-orange-500 border-t-transparent"></div>
                  ) : txSearchQuery ? (
                    /* Active search - show query with X */
                    <>
                      <span className="truncate max-w-[80px]">"{txSearchQuery}"</span>
                      <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </>
                  ) : (
                    /* Default search icon */
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      Search
                    </>
                  )}
                </button>
                
                {/* Export Button */}
                <button
                  onClick={() => setShowExportOptions(true)}
                  className="flex-1 h-10 bg-white dark:bg-black border border-yellow-500 dark:border-yellow-400 hover:bg-yellow-50 dark:hover:bg-yellow-900 text-yellow-600 dark:text-yellow-400 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Export
                </button>
              </div>
            )}
          </div>
          )}

          {/* Summary Stats - Show when date filter is active */}
          {dateFilterActive && filteredTransactions.length > 0 && (() => {
            const stats = getFilteredStats();
            const currency = filteredTransactions[0]?.settlementCurrency || 'BTC';
            const formatStatAmount = (amount) => {
              if (currency === 'BTC') {
                return `${Math.abs(amount).toLocaleString()} sats`;
              } else if (currency === 'USD') {
                return `$${(Math.abs(amount) / 100).toFixed(2)}`;
              }
              return `${Math.abs(amount).toLocaleString()} ${currency}`;
            };
            
            return (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <div className="bg-green-50 dark:bg-green-900/30 rounded-lg p-3 text-center">
                  <div className="text-xs text-green-600 dark:text-green-400 font-medium uppercase">Received</div>
                  <div className="text-lg font-bold text-green-700 dark:text-green-300">{formatStatAmount(stats.totalReceived)}</div>
                  <div className="text-xs text-green-500 dark:text-green-500">{stats.receiveCount} transactions</div>
                </div>
                <div className="bg-red-50 dark:bg-red-900/30 rounded-lg p-3 text-center">
                  <div className="text-xs text-red-600 dark:text-red-400 font-medium uppercase">Sent</div>
                  <div className="text-lg font-bold text-red-700 dark:text-red-300">{formatStatAmount(stats.totalSent)}</div>
                  <div className="text-xs text-red-500 dark:text-red-500">{stats.sendCount} transactions</div>
                </div>
                <div className={`rounded-lg p-3 text-center ${stats.netAmount >= 0 ? 'bg-blue-50 dark:bg-blue-900/30' : 'bg-orange-50 dark:bg-orange-900/30'}`}>
                  <div className={`text-xs font-medium uppercase ${stats.netAmount >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-orange-600 dark:text-orange-400'}`}>Net</div>
                  <div className={`text-lg font-bold ${stats.netAmount >= 0 ? 'text-blue-700 dark:text-blue-300' : 'text-orange-700 dark:text-orange-300'}`}>
                    {stats.netAmount >= 0 ? '+' : '-'}{formatStatAmount(stats.netAmount)}
                  </div>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-center">
                  <div className="text-xs text-gray-600 dark:text-gray-400 font-medium uppercase">Total</div>
                  <div className="text-lg font-bold text-gray-700 dark:text-gray-300">{stats.transactionCount}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-500">transactions</div>
                </div>
              </div>
            );
          })()}
          
          {!pastTransactionsLoaded ? (
            <div className="bg-white dark:bg-blink-dark shadow dark:shadow-black rounded-lg p-6 text-center text-gray-500 dark:text-gray-400">
              <div className="flex flex-col items-center gap-3">
                <svg className="w-12 h-12 text-gray-400 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p>Click "Show" to select a date range and view transactions</p>
              </div>
            </div>
          ) : dateFilterActive && filteredTransactions.length === 0 ? (
            <div className="bg-white dark:bg-blink-dark shadow dark:shadow-black rounded-lg p-6 text-center text-gray-500 dark:text-gray-400">
              <div className="flex flex-col items-center gap-3">
                <svg className="w-12 h-12 text-gray-400 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p>No transactions found for {selectedDateRange?.label || 'selected date range'}</p>
                <button
                  onClick={() => setShowDateRangeSelector(true)}
                  className="mt-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Try Different Range
                </button>
              </div>
            </div>
          ) : isSearchLoading ? (
            /* Search Loading State */
            <div className="bg-white dark:bg-blink-dark shadow dark:shadow-black rounded-lg p-8 text-center">
              <div className="flex flex-col items-center gap-3">
                <div className="animate-spin rounded-full h-8 w-8 border-3 border-orange-500 border-t-transparent"></div>
                <p className="text-gray-500 dark:text-gray-400 text-sm">Searching...</p>
              </div>
            </div>
          ) : dateFilterActive && filteredTransactions.length > 0 ? (
            (() => {
              const displayTxs = getDisplayTransactions();

              if (displayTxs.length === 0 && txSearchQuery) {
                // Search returned no results
                return (
                  <div className="bg-white dark:bg-blink-dark shadow dark:shadow-black rounded-lg p-6 text-center text-gray-500 dark:text-gray-400">
                    <div className="flex flex-col items-center gap-3">
                      <svg className="w-12 h-12 text-gray-400 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      <p>No transactions match "{txSearchQuery}"</p>
                      <button
                        onClick={handleTxSearchClose}
                        className="mt-2 px-4 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
                      >
                        Clear Search
                      </button>
                    </div>
                  </div>
                );
              }
              
              return (
                <div className="bg-white dark:bg-blink-dark shadow dark:shadow-black rounded-lg overflow-hidden">
                  {/* Search Results Count */}
                  {txSearchQuery && (
                    <div className="px-4 py-2 bg-orange-50 dark:bg-orange-900/20 border-b border-orange-200 dark:border-orange-800">
                      <span className="text-sm text-orange-700 dark:text-orange-300">
                        Found {displayTxs.length} result{displayTxs.length !== 1 ? 's' : ''} for "{txSearchQuery}"
                      </span>
                    </div>
                  )}
                  
                  {/* Filtered Transactions List - Mobile */}
                  <div className="block sm:hidden">
                    <div className="p-4 space-y-3">
                      {displayTxs.map((tx) => {
                        const txLabel = getTransactionLabel(tx.id);
                        return (
                          <div 
                            key={tx.id} 
                            className={`bg-white dark:bg-blink-dark rounded-lg p-4 border cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors ${
                              txLabel.id !== 'none' 
                                ? `${txLabel.borderLight} dark:${txLabel.borderDark}` 
                                : 'border-gray-200 dark:border-gray-700'
                            }`}
                            onClick={() => setSelectedTransaction(tx)}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                {/* Label indicator dot */}
                                {txLabel.id !== 'none' && (
                                  <div className={`w-2.5 h-2.5 rounded-full ${txLabel.bgLight} dark:${txLabel.bgDark}`} 
                                    style={{ backgroundColor: txLabel.color === 'blue' ? '#3b82f6' : txLabel.color === 'purple' ? '#a855f7' : txLabel.color === 'orange' ? '#f97316' : txLabel.color === 'cyan' ? '#06b6d4' : txLabel.color === 'green' ? '#22c55e' : txLabel.color === 'red' ? '#ef4444' : txLabel.color === 'pink' ? '#ec4899' : txLabel.color === 'amber' ? '#f59e0b' : '#6b7280' }}
                                  />
                                )}
                                <span className={`text-lg font-medium ${
                                  tx.direction === 'RECEIVE' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                                }`}>
                                  {tx.amount}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">
                                  {tx.status}
                                </span>
                                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                                </svg>
                              </div>
                            </div>
                            <div className="text-sm text-gray-900 dark:text-gray-100 mb-1">{tx.date}</div>
                            {tx.memo && tx.memo !== '-' && (
                              <div className="text-sm text-gray-500 dark:text-gray-400">{tx.memo}</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Filtered Transactions Table - Desktop */}
                  <div className="hidden sm:block">
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Amount</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Date</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Memo</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"></th>
                          </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-blink-dark divide-y divide-gray-200 dark:divide-gray-700">
                          {displayTxs.map((tx) => (
                            <tr 
                              key={tx.id} 
                              className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                              onClick={() => setSelectedTransaction(tx)}
                            >
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
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{tx.date}</td>
                              <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{tx.memo && tx.memo !== '-' ? tx.memo : '-'}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-right">
                                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                                </svg>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              );
            })()
          ) : isSearchLoading ? (
            /* Search Loading State (for month-grouped view) */
            <div className="bg-white dark:bg-blink-dark shadow dark:shadow-black rounded-lg p-8 text-center">
              <div className="flex flex-col items-center gap-3">
                <div className="animate-spin rounded-full h-8 w-8 border-3 border-orange-500 border-t-transparent"></div>
                <p className="text-gray-500 dark:text-gray-400 text-sm">Searching...</p>
              </div>
            </div>
          ) : (() => {
            const monthGroups = getMonthGroups();

            // Apply search filter to month groups if search is active
            const filteredMonthGroups = {};
            Object.entries(monthGroups).forEach(([monthKey, monthData]) => {
              const filteredTxs = filterTransactionsBySearch(monthData.transactions, txSearchQuery);
              if (filteredTxs.length > 0) {
                filteredMonthGroups[monthKey] = {
                  ...monthData,
                  transactions: filteredTxs
                };
              }
            });
            
            const monthKeys = Object.keys(filteredMonthGroups);
            
            // Show search no results message
            if (monthKeys.length === 0 && txSearchQuery) {
              return (
                <div className="bg-white dark:bg-blink-dark shadow dark:shadow-black rounded-lg p-6 text-center text-gray-500 dark:text-gray-400">
                  <div className="flex flex-col items-center gap-3">
                    <svg className="w-12 h-12 text-gray-400 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <p>No transactions match "{txSearchQuery}"</p>
                    <button
                      onClick={handleTxSearchClose}
                      className="mt-2 px-4 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
                    >
                      Clear Search
                    </button>
                  </div>
                </div>
              );
            }
            
            if (monthKeys.length === 0) {
              // Check if current wallet type doesn't support transaction history
              const isLnAddressWallet = activeBlinkAccount?.type === 'ln-address';
              const isNpubCashWallet = activeNpubCashWallet?.type === 'npub-cash' && !activeNWC;
              const walletDoesNotSupportHistory = isLnAddressWallet || isNpubCashWallet;

              if (walletDoesNotSupportHistory) {
                // Show informative message about wallet limitation
                const walletType = isLnAddressWallet ? 'Blink Lightning Address' : 'npub.cash';
                return (
                  <div className="bg-white dark:bg-blink-dark shadow dark:shadow-black rounded-lg p-6">
                    <div className="flex flex-col items-center gap-4 text-center">
                      <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                        <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                          Transaction History Not Available
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 max-w-md">
                          {walletType} wallets are designed for receiving payments only and do not provide transaction history.
                          {isLnAddressWallet && " To view transaction history, please use a Blink API Key wallet."}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div className="bg-white dark:bg-blink-dark shadow dark:shadow-black rounded-lg p-6 text-center text-gray-500 dark:text-gray-400">
                  No past transactions available
                </div>
              );
            }
            
            // Calculate total search results count
            const totalSearchResults = txSearchQuery 
              ? Object.values(filteredMonthGroups).reduce((sum, m) => sum + m.transactions.length, 0)
              : 0;
            
            return (
              <div className="space-y-4">
                {/* Search Results Count */}
                {txSearchQuery && (
                  <div className="px-4 py-2 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                    <span className="text-sm text-orange-700 dark:text-orange-300">
                      Found {totalSearchResults} result{totalSearchResults !== 1 ? 's' : ''} for "{txSearchQuery}"
                    </span>
                  </div>
                )}
                
                {monthKeys.map(monthKey => {
                  const monthData = filteredMonthGroups[monthKey];
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
                              {monthData.transactions.map((tx) => {
                                const txLabel = getTransactionLabel(tx.id);
                                return (
                                  <div 
                                    key={tx.id} 
                                    className={`bg-white dark:bg-blink-dark rounded-lg p-4 border transaction-card-mobile cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors ${
                                      txLabel.id !== 'none' 
                                        ? `${txLabel.borderLight} dark:${txLabel.borderDark}` 
                                        : 'border-gray-200 dark:border-gray-700'
                                    }`}
                                    onClick={() => setSelectedTransaction(tx)}
                                  >
                                    <div className="flex items-center justify-between mb-2">
                                      <div className="flex items-center gap-2">
                                        {/* Label indicator dot */}
                                        {txLabel.id !== 'none' && (
                                          <div className={`w-2.5 h-2.5 rounded-full`} 
                                            style={{ backgroundColor: txLabel.color === 'blue' ? '#3b82f6' : txLabel.color === 'purple' ? '#a855f7' : txLabel.color === 'orange' ? '#f97316' : txLabel.color === 'cyan' ? '#06b6d4' : txLabel.color === 'green' ? '#22c55e' : txLabel.color === 'red' ? '#ef4444' : txLabel.color === 'pink' ? '#ec4899' : txLabel.color === 'amber' ? '#f59e0b' : '#6b7280' }}
                                          />
                                        )}
                                        <span className={`text-lg font-medium ${
                                          tx.direction === 'RECEIVE' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                                        }`}>
                                          {tx.amount}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">
                                          {tx.status}
                                        </span>
                                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                                        </svg>
                                      </div>
                                    </div>
                                    <div className="text-sm text-gray-900 dark:text-gray-100 mb-1">{tx.date}</div>
                                    {tx.memo && tx.memo !== '-' && (
                                      <div className="text-sm text-gray-500 dark:text-gray-400">{tx.memo}</div>
                                    )}
                                  </div>
                                );
                              })}
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
                                    <th className="px-6 py-3"></th>
                                  </tr>
                                </thead>
                                <tbody className="bg-white dark:bg-blink-dark divide-y divide-gray-200 dark:divide-gray-700">
                                  {monthData.transactions.map((tx) => (
                                    <tr 
                                      key={tx.id} 
                                      className="hover:bg-gray-50 dark:hover:bg-gray-700 bg-white dark:bg-blink-dark cursor-pointer"
                                      onClick={() => setSelectedTransaction(tx)}
                                    >
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
                                      <td className="px-6 py-4 whitespace-nowrap">
                                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                                        </svg>
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
          
          {/* Bottom Action Buttons - Show Filter/Export only when > 5 transactions loaded */}
          {(() => {
            const displayTxCount = dateFilterActive ? filteredTransactions.length : transactions.length;
            const showBottomFilterExport = displayTxCount > 5;
            const showMoreButton = pastTransactionsLoaded && hasMoreTransactions;
            
            // Don't show section at all if nothing to show
            if (!showBottomFilterExport && !showMoreButton) return null;
            
            return (
              <div className="mt-6 px-4">
                <div className={`grid gap-3 max-w-sm mx-auto ${
                  showBottomFilterExport && showMoreButton ? 'grid-cols-3' : 
                  showMoreButton ? 'grid-cols-1' : 'grid-cols-2'
                }`}>
                  {/* Filter Button - Only when > 5 transactions */}
                  {showBottomFilterExport && (
                    <button
                      onClick={() => setShowDateRangeSelector(true)}
                      disabled={loadingMore}
                      className="h-16 bg-white dark:bg-black border-2 border-blue-600 dark:border-blue-500 hover:border-blue-700 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 disabled:border-gray-400 disabled:text-gray-400 disabled:cursor-not-allowed disabled:hover:bg-white dark:disabled:hover:bg-black rounded-lg text-lg font-normal transition-colors shadow-md"
                      style={{fontFamily: "'Source Sans Pro', sans-serif"}}
                    >
                      <div className="flex items-center justify-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        Filter
                      </div>
                    </button>
                  )}

                  {/* Show More Button - Only when more data is available */}
                  {showMoreButton && (
                    <button
                      onClick={loadMoreMonths}
                      disabled={loadingMore}
                      className="h-16 bg-white dark:bg-black border-2 border-gray-400 dark:border-gray-500 hover:border-gray-500 dark:hover:border-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900 text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 disabled:border-gray-300 disabled:text-gray-300 disabled:cursor-not-allowed rounded-lg text-lg font-normal transition-colors shadow-md"
                      style={{fontFamily: "'Source Sans Pro', sans-serif"}}
                    >
                      {loadingMore ? (
                        <div className="flex items-center justify-center">
                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent mr-2"></div>
                          Loading...
                        </div>
                      ) : (
                        'More'
                      )}
                    </button>
                  )}
                  
                  {/* Export Button - Only when > 5 transactions */}
                  {showBottomFilterExport && (
                    <button
                      onClick={() => setShowExportOptions(true)}
                      className="h-16 bg-white dark:bg-black border-2 border-yellow-500 dark:border-yellow-400 hover:border-yellow-600 dark:hover:border-yellow-300 hover:bg-yellow-50 dark:hover:bg-yellow-900 text-yellow-600 dark:text-yellow-400 hover:text-yellow-700 dark:hover:text-yellow-300 rounded-lg text-lg font-normal transition-colors shadow-md"
                      style={{fontFamily: "'Source Sans Pro', sans-serif"}}
                    >
                      Export
                    </button>
                  )}
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center mt-2">
                  {dateFilterActive && selectedDateRange
                    ? `Showing: ${selectedDateRange.label}`
                    : hasMoreTransactions 
                      ? `${transactions.length} transactions loaded · More available`
                      : `All ${transactions.length} transactions loaded`}
                </p>
              </div>
            );
          })()}
        </div>
          </>
        )}
      </main>

      {/* Transaction Detail Modal */}
      {selectedTransaction && (
        <TransactionDetail
          transaction={selectedTransaction}
          onClose={() => setSelectedTransaction(null)}
          darkMode={darkMode}
          onLabelChange={() => setLabelUpdateTrigger(prev => prev + 1)}
        />
      )}

      {/* Settings Modal */}
    </div>
  );
}
