import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import { formatDisplayAmount as formatCurrency, getCurrencyById, isBitcoinCurrency, parseAmountParts } from '../lib/currency-utils';
import { formatNumber } from '../lib/number-format';
import { unlockAudioContext, playSound } from '../lib/audio-utils';

const ItemCart = forwardRef(({ 
  displayCurrency, 
  numberFormat = 'auto',
  bitcoinFormat = 'sats',
  currencies, 
  publicKey, 
  onCheckout,
  soundEnabled,
  darkMode,
  theme,
  cycleTheme,
  isViewTransitioning = false,
  exchangeRate = null,
  onActivate // Called when view becomes active
}, ref) => {
  const [cartItems, setCartItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedItems, setSelectedItems] = useState([]); // Array of { item, quantity }
  const [total, setTotal] = useState(0);
  
  // Add item form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [addingItem, setAddingItem] = useState(false);
  
  // Edit/Delete state
  const [editingItem, setEditingItem] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  
  // Search state
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef(null);
  
  // Add Item form refs for keyboard navigation
  const addItemNameRef = useRef(null);
  const addItemPriceRef = useRef(null);
  const addItemButtonRef = useRef(null);
  
  // Refs for item buttons to enable scroll-into-view
  const itemRefs = useRef([]);
  
  // Keyboard navigation state
  // Navigation indices: 0=Search, 1=AddItem, 2...(2+items.length-1)=Items, then C and OK
  const [keyboardNavIndex, setKeyboardNavIndex] = useState(0); // Start with Search selected
  const [exitedToGlobalNav, setExitedToGlobalNav] = useState(false); // Track if user exited to global nav

  // Helper function to get dynamic font size based on amount length
  // Returns mobile size + desktop size (20% larger on desktop via md: breakpoint)
  // Considers BOTH numeric digits AND total display length to prevent overflow
  const getDynamicFontSize = (displayText) => {
    const text = String(displayText);
    
    // Extract only numeric characters (remove currency symbols, spaces, "sats", commas, etc.)
    const numericOnly = text.replace(/[^0-9.]/g, '');
    const numericLength = numericOnly.length;
    
    // Total display length (includes symbols, spaces, commas)
    const totalLength = text.length;
    
    // Calculate size based on numeric length (original thresholds)
    let sizeFromNumeric;
    if (numericLength <= 6) sizeFromNumeric = 7;
    else if (numericLength <= 9) sizeFromNumeric = 6;
    else if (numericLength <= 11) sizeFromNumeric = 5;
    else if (numericLength <= 13) sizeFromNumeric = 4;
    else if (numericLength <= 15) sizeFromNumeric = 3;
    else if (numericLength <= 16) sizeFromNumeric = 2;
    else sizeFromNumeric = 1;
    
    // Calculate size based on total display length (for long currency symbols/names)
    let sizeFromTotal;
    if (totalLength <= 10) sizeFromTotal = 7;
    else if (totalLength <= 14) sizeFromTotal = 6;
    else if (totalLength <= 18) sizeFromTotal = 5;
    else if (totalLength <= 22) sizeFromTotal = 4;
    else if (totalLength <= 26) sizeFromTotal = 3;
    else if (totalLength <= 30) sizeFromTotal = 2;
    else sizeFromTotal = 1;
    
    // Use the SMALLER size to prevent overflow
    const finalSize = Math.min(sizeFromNumeric, sizeFromTotal);
    
    // Map size number to Tailwind classes
    const sizeClasses = {
      7: 'text-6xl md:text-7xl',
      6: 'text-5xl md:text-6xl',
      5: 'text-4xl md:text-5xl',
      4: 'text-3xl md:text-4xl',
      3: 'text-2xl md:text-3xl',
      2: 'text-xl md:text-2xl',
      1: 'text-lg md:text-xl'
    };
    
    return sizeClasses[finalSize] || sizeClasses[1];
  };

  // Play keystroke sound (also unlocks iOS audio on first press)
  const playKeystrokeSound = () => {
    if (soundEnabled) {
      // Unlock AudioContext on user gesture for iOS Safari
      unlockAudioContext();
      playSound('/click.mp3', 0.3);
    }
  };

  // Helper for localStorage key
  const getLocalStorageKey = () => 'publicpos-cart-items';
  
  // Load cart items from localStorage (for public mode)
  const loadLocalCartItems = useCallback(() => {
    try {
      const stored = localStorage.getItem(getLocalStorageKey());
      if (stored) {
        const items = JSON.parse(stored);
        setCartItems(items);
      } else {
        setCartItems([]);
      }
    } catch (err) {
      console.error('Error loading local cart items:', err);
      setCartItems([]);
    }
    setLoading(false);
  }, []);

  // Save cart items to localStorage (for public mode)
  const saveLocalCartItems = useCallback((items) => {
    try {
      localStorage.setItem(getLocalStorageKey(), JSON.stringify(items));
    } catch (err) {
      console.error('Error saving local cart items:', err);
    }
  }, []);

  // Fetch cart items from server (for authenticated mode)
  const fetchCartItems = useCallback(async () => {
    // For public mode (no publicKey), use localStorage
    if (!publicKey) {
      loadLocalCartItems();
      return;
    }
    
    try {
      setLoading(true);
      const response = await fetch(`/api/user/cart-items?pubkey=${publicKey}`, {
        credentials: 'include'
      });
      const data = await response.json();
      
      if (data.success) {
        setCartItems(data.cartItems || []);
      } else {
        setError(data.error || 'Failed to load items');
      }
    } catch (err) {
      console.error('Error fetching cart items:', err);
      setError('Failed to load items');
    } finally {
      setLoading(false);
    }
  }, [publicKey, loadLocalCartItems]);

  useEffect(() => {
    fetchCartItems();
  }, [fetchCartItems]);

  // Calculate total when selected items change
  useEffect(() => {
    const newTotal = selectedItems.reduce((sum, selected) => {
      return sum + (selected.item.price * selected.quantity);
    }, 0);
    setTotal(newTotal);
  }, [selectedItems]);

  const formatDisplayAmount = (value, currency) => {
    return formatCurrency(value, currency, currencies, numberFormat, bitcoinFormat);
  };

  // Render amount with properly styled Bitcoin symbol (smaller ₿ for BIP-177)
  const renderStyledAmount = (value, currency, className = '') => {
    const formatted = formatDisplayAmount(value, currency);
    const parts = parseAmountParts(formatted, currency, bitcoinFormat);
    
    if (parts.isBip177) {
      // Render BIP-177 with smaller, lighter Bitcoin symbol moved up 10%
      return (
        <span className={className}>
          <span style={{ fontSize: '0.75em', fontWeight: 300, position: 'relative', top: '-0.07em' }}>{parts.symbol}</span>
          {parts.value}
        </span>
      );
    }
    
    // For all other currencies, render as-is
    return <span className={className}>{formatted}</span>;
  };

  // Calculate sats equivalent for fiat amounts
  const getSatsEquivalent = (fiatAmount) => {
    if (!exchangeRate?.satPriceInCurrency) return '0';
    if (fiatAmount <= 0) return '0';
    const currency = getCurrencyById(displayCurrency, currencies);
    const fractionDigits = currency?.fractionDigits ?? 2;
    const amountInMinorUnits = fiatAmount * Math.pow(10, fractionDigits);
    const sats = Math.round(amountInMinorUnits / exchangeRate.satPriceInCurrency);
    return formatNumber(sats, numberFormat, 0);
  };

  // Handle item click - add to selection
  const handleItemClick = (item) => {
    playKeystrokeSound();
    
    const existingIndex = selectedItems.findIndex(s => s.item.id === item.id);
    
    if (existingIndex >= 0) {
      // Increment quantity
      const newSelected = [...selectedItems];
      newSelected[existingIndex].quantity += 1;
      setSelectedItems(newSelected);
    } else {
      // Add new item
      setSelectedItems([...selectedItems, { item, quantity: 1 }]);
    }
  };

  // Remove one quantity of item from selection
  const handleRemoveFromSelection = (itemId) => {
    playKeystrokeSound();
    
    const existingIndex = selectedItems.findIndex(s => s.item.id === itemId);
    
    if (existingIndex >= 0) {
      const newSelected = [...selectedItems];
      if (newSelected[existingIndex].quantity > 1) {
        newSelected[existingIndex].quantity -= 1;
      } else {
        newSelected.splice(existingIndex, 1);
      }
      setSelectedItems(newSelected);
    }
  };

  // Clear all selections
  const handleClear = () => {
    playKeystrokeSound();
    setSelectedItems([]);
    setError('');
  };

  // Handle checkout - pass total to POS
  const handleCheckout = () => {
    if (total <= 0) return;
    
    playKeystrokeSound();
    
    // Build memo from selected items with names and amounts
    const itemsList = selectedItems.map(s => {
      const itemTotal = s.item.price * s.quantity;
      const formattedAmount = formatDisplayAmount(itemTotal, displayCurrency);
      if (s.quantity > 1) {
        return `${s.item.name} x${s.quantity} ${formattedAmount}`;
      }
      return `${s.item.name} ${formattedAmount}`;
    }).join(', ');
    
    if (onCheckout) {
      onCheckout({
        total,
        currency: displayCurrency,
        items: selectedItems,
        memo: itemsList
      });
    }
  };

  // Add new item
  const handleAddItem = async () => {
    if (!newItemName.trim() || !newItemPrice || parseFloat(newItemPrice) <= 0) {
      setError('Please enter a valid name and price');
      return;
    }
    
    setAddingItem(true);
    setError('');
    
    // For public mode (no publicKey), use localStorage
    if (!publicKey) {
      try {
        const newItem = {
          id: `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name: newItemName.trim(),
          price: parseFloat(newItemPrice),
          currency: displayCurrency,
          createdAt: new Date().toISOString()
        };
        const updatedItems = [...cartItems, newItem];
        setCartItems(updatedItems);
        saveLocalCartItems(updatedItems);
        setNewItemName('');
        setNewItemPrice('');
        setShowAddForm(false);
      } catch (err) {
        console.error('Error adding local item:', err);
        setError('Failed to add item');
      } finally {
        setAddingItem(false);
      }
      return;
    }
    
    // Authenticated mode - use server
    try {
      const response = await fetch('/api/user/cart-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          pubkey: publicKey,
          name: newItemName.trim(),
          price: parseFloat(newItemPrice),
          currency: displayCurrency
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setCartItems([...cartItems, data.item]);
        setNewItemName('');
        setNewItemPrice('');
        setShowAddForm(false);
      } else {
        setError(data.error || 'Failed to add item');
      }
    } catch (err) {
      console.error('Error adding item:', err);
      setError('Failed to add item');
    } finally {
      setAddingItem(false);
    }
  };

  // Delete item
  const handleDeleteItem = async (itemId) => {
    // For public mode (no publicKey), use localStorage
    if (!publicKey) {
      try {
        const updatedItems = cartItems.filter(item => item.id !== itemId);
        setCartItems(updatedItems);
        saveLocalCartItems(updatedItems);
        setSelectedItems(selectedItems.filter(s => s.item.id !== itemId));
        setConfirmDelete(null);
        setError('');
      } catch (err) {
        console.error('Error deleting local item:', err);
        setError('Failed to delete item');
      }
      return;
    }
    
    // Authenticated mode - use server
    try {
      console.log('Deleting item:', itemId, 'pubkey:', publicKey);
      const response = await fetch('/api/user/cart-items', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Include cookies for session auth
        body: JSON.stringify({
          pubkey: publicKey,
          itemId
        })
      });
      
      const data = await response.json();
      console.log('Delete response:', response.status, data);
      
      if (response.ok && data.success) {
        setCartItems(cartItems.filter(item => item.id !== itemId));
        // Also remove from selection if present
        setSelectedItems(selectedItems.filter(s => s.item.id !== itemId));
        setConfirmDelete(null);
        setError(''); // Clear any previous errors
      } else {
        setError(data.error || `Failed to delete item (${response.status})`);
      }
    } catch (err) {
      console.error('Error deleting item:', err);
      setError('Failed to delete item: ' + err.message);
    }
  };

  // Update item
  const handleUpdateItem = async () => {
    if (!editingItem) return;
    
    // For public mode (no publicKey), use localStorage
    if (!publicKey) {
      try {
        const updatedItem = { ...editingItem, updatedAt: new Date().toISOString() };
        const updatedItems = cartItems.map(item => 
          item.id === editingItem.id ? updatedItem : item
        );
        setCartItems(updatedItems);
        saveLocalCartItems(updatedItems);
        setEditingItem(null);
      } catch (err) {
        console.error('Error updating local item:', err);
        setError('Failed to update item');
      }
      return;
    }
    
    // Authenticated mode - use server
    try {
      const response = await fetch('/api/user/cart-items', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          pubkey: publicKey,
          itemId: editingItem.id,
          name: editingItem.name,
          price: editingItem.price,
          currency: editingItem.currency
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setCartItems(cartItems.map(item => 
          item.id === editingItem.id ? data.item : item
        ));
        setEditingItem(null);
      } else {
        setError(data.error || 'Failed to update item');
      }
    } catch (err) {
      console.error('Error updating item:', err);
      setError('Failed to update item');
    }
  };

  // Get selected quantity for an item
  const getSelectedQuantity = (itemId) => {
    const selected = selectedItems.find(s => s.item.id === itemId);
    return selected ? selected.quantity : 0;
  };

  // Filter items based on search query (case insensitive, starts with)
  const filteredItems = searchQuery
    ? cartItems.filter(item => 
        item.name.toLowerCase().startsWith(searchQuery.toLowerCase())
      )
    : cartItems;

  // Handle search activation
  const handleSearchClick = () => {
    setIsSearching(true);
    // Focus input after state update
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 100);
  };

  // Handle search close
  const handleSearchClose = () => {
    setIsSearching(false);
    setSearchQuery('');
  };

  // Calculate navigation indices based on current filtered items
  // Layout: [Search, AddItem] -> [Items...] -> [C, OK]
  // C and OK are only navigatable if there are items to select
  const getNavIndices = useCallback(() => {
    const itemCount = filteredItems.length;
    const hasItems = itemCount > 0;
    return {
      search: 0,
      addItem: 1,
      firstItem: 2,
      lastItem: itemCount > 0 ? 2 + itemCount - 1 : 1, // If no items, lastItem is addItem
      clear: 2 + itemCount,
      ok: 2 + itemCount + 1,
      total: 2 + itemCount + 2,
      hasItems // C and OK only navigatable when there are items
    };
  }, [filteredItems.length]);

  // Reset navigation index when entering the view
  useEffect(() => {
    if (onActivate) {
      setKeyboardNavIndex(0); // Reset to Search when activated
    }
  }, [onActivate]);

  // Scroll selected item into view when keyboard navigation changes
  useEffect(() => {
    const indices = getNavIndices();
    // Check if an item is selected (index 2 to 2 + itemCount - 1)
    if (keyboardNavIndex >= indices.firstItem && keyboardNavIndex <= indices.lastItem) {
      const itemIndex = keyboardNavIndex - indices.firstItem;
      const itemElement = itemRefs.current[itemIndex];
      if (itemElement) {
        itemElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [keyboardNavIndex, getNavIndices]);

  // Expose keyboard navigation handlers via ref
  useImperativeHandle(ref, () => ({
    // Check if cart is in a state where it can handle keyboard nav
    isCartNavActive: () => !showAddForm && !editingItem && !confirmDelete && !isSearching && !exitedToGlobalNav,
    
    // Reset selection to Search when entering the view
    resetNavigation: () => {
      setKeyboardNavIndex(0);
      setExitedToGlobalNav(false);
    },
    
    // Re-enter local cart navigation (called when user navigates back to cart)
    enterLocalNav: () => {
      setExitedToGlobalNav(false);
    },
    
    // Handle keyboard navigation
    handleCartKey: (key) => {
      // Don't handle keys if in a modal state
      if (showAddForm || editingItem || confirmDelete) return false;
      
      // If in search mode and typing, let the input handle it
      if (isSearching) {
        if (key === 'Escape') {
          handleSearchClose();
          return true;
        }
        if (key === 'Enter') {
          // Confirm search and jump to first item
          if (filteredItems.length > 0) {
            setIsSearching(false);
            setKeyboardNavIndex(2); // First item
          }
          return true;
        }
        return false; // Let input handle other keys
      }
      
      const indices = getNavIndices();
      
      if (key === 'ArrowRight') {
        // Move right within row
        if (keyboardNavIndex === indices.search) {
          setKeyboardNavIndex(indices.addItem);
        } else if (keyboardNavIndex === indices.clear && indices.hasItems) {
          setKeyboardNavIndex(indices.ok);
        }
        // Items are single column, no right movement
        return true;
      } else if (key === 'ArrowLeft') {
        // Move left within row
        if (keyboardNavIndex === indices.addItem) {
          setKeyboardNavIndex(indices.search);
        } else if (keyboardNavIndex === indices.ok && indices.hasItems) {
          setKeyboardNavIndex(indices.clear);
        }
        // Items are single column, no left movement
        return true;
      } else if (key === 'ArrowDown') {
        // Move down
        if (keyboardNavIndex === indices.search || keyboardNavIndex === indices.addItem) {
          // From top row, go to first item (only if there are items)
          if (indices.hasItems) {
            setKeyboardNavIndex(indices.firstItem);
          }
          // If no items, stay in top row (C and OK are not navigatable)
        } else if (keyboardNavIndex >= indices.firstItem && keyboardNavIndex < indices.lastItem) {
          // Move to next item
          setKeyboardNavIndex(keyboardNavIndex + 1);
        } else if (keyboardNavIndex === indices.lastItem && indices.hasItems) {
          // From last item, go to OK button
          setKeyboardNavIndex(indices.ok);
        }
        // At C or OK, stay there
        return true;
      } else if (key === 'ArrowUp') {
        // Move up
        if ((keyboardNavIndex === indices.clear || keyboardNavIndex === indices.ok) && indices.hasItems) {
          // From bottom row, go to last item
          setKeyboardNavIndex(indices.lastItem);
        } else if (keyboardNavIndex > indices.firstItem && keyboardNavIndex <= indices.lastItem) {
          // Move to previous item
          setKeyboardNavIndex(keyboardNavIndex - 1);
        } else if (keyboardNavIndex === indices.firstItem) {
          // From first item, go to Search
          setKeyboardNavIndex(indices.search);
        } else if (keyboardNavIndex === indices.addItem) {
          // From AddItem, go to Search
          setKeyboardNavIndex(indices.search);
        } else if (keyboardNavIndex === indices.search) {
          // From Search, exit to global navigation
          setExitedToGlobalNav(true);
          return false;
        }
        return true;
      } else if (key === 'Enter') {
        // Enter behavior depends on what's selected
        if (keyboardNavIndex === indices.search) {
          // Open search
          handleSearchClick();
        } else if (keyboardNavIndex === indices.addItem) {
          // Open add item form
          setShowAddForm(true);
        } else if (keyboardNavIndex >= indices.firstItem && keyboardNavIndex <= indices.lastItem && indices.hasItems) {
          // On item, jump to OK button
          setKeyboardNavIndex(indices.ok);
        } else if (keyboardNavIndex === indices.clear && selectedItems.length > 0) {
          // Clear selection
          handleClear();
        } else if (keyboardNavIndex === indices.ok && total > 0) {
          // Checkout
          handleCheckout();
        }
        return true;
      } else if (key === ' ') {
        // Spacebar adds item to cart (when an item is selected)
        if (keyboardNavIndex >= indices.firstItem && keyboardNavIndex <= indices.lastItem && indices.hasItems) {
          const itemIndex = keyboardNavIndex - indices.firstItem;
          if (filteredItems[itemIndex]) {
            handleItemClick(filteredItems[itemIndex]);
          }
        }
        return true;
      } else if (key === 'Backspace') {
        // If an item is selected, reduce its quantity by 1
        if (keyboardNavIndex >= indices.firstItem && keyboardNavIndex <= indices.lastItem) {
          const itemIndex = keyboardNavIndex - indices.firstItem;
          if (filteredItems[itemIndex]) {
            handleRemoveFromSelection(filteredItems[itemIndex].id);
          }
          return true;
        }
        return false;
      } else if (key === 'Escape') {
        // Escape does nothing when not in search mode
        // (Search mode Escape is handled by the search input's onKeyDown)
        return true;
      }
      
      return false;
    },
  }), [showAddForm, editingItem, confirmDelete, isSearching, exitedToGlobalNav, keyboardNavIndex, filteredItems, selectedItems, total, getNavIndices, handleSearchClick, handleClear, handleCheckout, handleItemClick, handleRemoveFromSelection]);

  return (
    <div className="h-full flex flex-col bg-white dark:bg-black relative overflow-hidden" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
      {/* Amount Display - Compact */}
      <div className="flex-shrink-0 px-4">
        <div className="text-center">
          <div className="text-center">
            <div className={`font-semibold text-gray-800 dark:text-gray-100 min-h-[72px] flex items-center justify-center leading-none tracking-normal max-w-full overflow-hidden px-2 ${getDynamicFontSize(formatDisplayAmount(total, displayCurrency))}`} style={{fontFamily: "'Source Sans Pro', sans-serif", wordBreak: 'keep-all', overflowWrap: 'normal'}}>
              {total > 0 ? (
                renderStyledAmount(total, displayCurrency, "text-blink-accent")
              ) : (
                renderStyledAmount(0, displayCurrency)
              )}
            </div>
            {/* Sats equivalent for fiat currencies */}
            {!isBitcoinCurrency(displayCurrency) && (
              <div className="text-sm text-gray-500 dark:text-gray-400 -mt-1">
                ({getSatsEquivalent(total)} sats)
              </div>
            )}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            <div className="mb-1 min-h-[20px] max-w-full overflow-x-auto px-2">
              {selectedItems.length > 0 && (
                <div className="whitespace-nowrap">
                  {selectedItems.map((s, i) => (
                    <span key={s.item.id}>
                      {i > 0 && ' + '}
                      {s.quantity > 1 ? `${s.item.name} ×${s.quantity}` : s.item.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          {/* Error Message - inline below amount */}
          {error && (
            <div className="mt-2 bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-200 px-3 py-2 rounded text-sm animate-pulse">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Items Grid - In place of numpad */}
      <div className="flex-1 px-4 pb-4 relative overflow-hidden flex flex-col min-h-0">
        {loading && !isViewTransitioning ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-blink-accent border-t-transparent"></div>
          </div>
        ) : showAddForm ? (
          /* Add Item Form - scrollable for mobile keyboard */
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-md mx-auto space-y-4 pb-4">
              <h3 className="text-xl font-semibold text-center text-gray-800 dark:text-white">Add New Item</h3>
              
              <div>
                <label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Item Name
                </label>
                <input
                  ref={addItemNameRef}
                  type="text"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newItemName.trim()) {
                      e.preventDefault();
                      addItemPriceRef.current?.focus();
                    }
                  }}
                  placeholder="e.g., Ice Cream"
                  className="w-full px-4 py-3 text-lg border-2 border-blue-600 dark:border-blue-500 rounded-lg bg-white dark:bg-blink-dark text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>
              
              <div>
                <label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Price
                </label>
                <input
                  ref={addItemPriceRef}
                  type="number"
                  value={newItemPrice}
                  onChange={(e) => setNewItemPrice(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newItemPrice && parseFloat(newItemPrice) > 0) {
                      e.preventDefault();
                      addItemButtonRef.current?.focus();
                    }
                  }}
                  placeholder="1"
                  min="0"
                  step="any"
                  className="w-full px-4 py-3 text-lg border-2 border-blue-600 dark:border-blue-500 rounded-lg bg-white dark:bg-blink-dark text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-3 pt-4">
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    setNewItemName('');
                    setNewItemPrice('');
                  }}
                  className="h-14 md:h-16 bg-white dark:bg-black border-2 border-gray-500 hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-900 text-gray-600 dark:text-gray-400 rounded-lg text-lg md:text-xl font-normal transition-colors shadow-md"
                >
                  Cancel
                </button>
                <button
                  ref={addItemButtonRef}
                  onClick={handleAddItem}
                  disabled={addingItem || !newItemName.trim() || !newItemPrice}
                  className="h-14 md:h-16 bg-white dark:bg-black border-2 border-green-600 dark:border-green-500 hover:border-green-700 dark:hover:border-green-400 hover:bg-green-50 dark:hover:bg-green-900 text-green-600 dark:text-green-400 disabled:border-gray-400 disabled:text-gray-400 disabled:cursor-not-allowed rounded-lg text-lg md:text-xl font-normal transition-colors shadow-md"
                >
                  {addingItem ? 'Adding...' : 'Add'}
                </button>
              </div>
            </div>
          </div>
        ) : editingItem ? (
          /* Edit Item Form - scrollable for mobile keyboard */
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-md mx-auto space-y-4 pb-4">
              <h3 className="text-xl font-semibold text-center text-gray-800 dark:text-white">Edit Item</h3>
              
              <div>
                <label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Item Name
                </label>
                <input
                  type="text"
                  value={editingItem.name}
                  onChange={(e) => setEditingItem({...editingItem, name: e.target.value})}
                  className="w-full px-4 py-3 text-lg border-2 border-blue-600 dark:border-blue-500 rounded-lg bg-white dark:bg-blink-dark text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>
              
              <div>
                <label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Price
                </label>
                <input
                  type="number"
                  value={editingItem.price}
                  onChange={(e) => setEditingItem({...editingItem, price: parseFloat(e.target.value) || 0})}
                  min="0"
                  step="any"
                  className="w-full px-4 py-3 text-lg border-2 border-blue-600 dark:border-blue-500 rounded-lg bg-white dark:bg-blink-dark text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-3 pt-4">
                <button
                  onClick={() => setEditingItem(null)}
                  className="h-14 md:h-16 bg-white dark:bg-black border-2 border-gray-500 hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-900 text-gray-600 dark:text-gray-400 rounded-lg text-lg md:text-xl font-normal transition-colors shadow-md"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateItem}
                  className="h-14 md:h-16 bg-white dark:bg-black border-2 border-green-600 dark:border-green-500 hover:border-green-700 dark:hover:border-green-400 hover:bg-green-50 dark:hover:bg-green-900 text-green-600 dark:text-green-400 rounded-lg text-lg md:text-xl font-normal transition-colors shadow-md"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        ) : confirmDelete ? (
          /* Delete Confirmation */
          <div className="max-w-md mx-auto space-y-4">
            <h3 className="text-xl font-semibold text-center text-gray-800 dark:text-white">Delete Item?</h3>
            <p className="text-center text-lg text-gray-600 dark:text-gray-400">
              Are you sure you want to delete "{confirmDelete.name}"?
            </p>
            
            <div className="grid grid-cols-2 gap-3 pt-4">
              <button
                onClick={() => setConfirmDelete(null)}
                className="h-14 md:h-16 bg-white dark:bg-black border-2 border-gray-500 hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-900 text-gray-600 dark:text-gray-400 rounded-lg text-lg md:text-xl font-normal transition-colors shadow-md"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteItem(confirmDelete.id)}
                className="h-14 md:h-16 bg-white dark:bg-black border-2 border-red-600 dark:border-red-500 hover:border-red-700 dark:hover:border-red-400 hover:bg-red-50 dark:hover:bg-red-900 text-red-600 dark:text-red-400 rounded-lg text-lg md:text-xl font-normal transition-colors shadow-md"
              >
                Delete
              </button>
            </div>
          </div>
        ) : (
          /* Items List with fixed header and footer */
          <div className="flex-1 flex flex-col min-h-0">
            {/* Fixed top row: Search and Add Item buttons */}
            <div className="flex-shrink-0 max-w-md mx-auto w-full mb-2">
              {isSearching ? (
                /* Expanded Search Input */
                <div className="w-full h-14 md:h-16 bg-white dark:bg-black border-2 border-orange-500 dark:border-orange-500 rounded-lg flex items-center shadow-md">
                  <div className="flex items-center justify-center w-14 text-orange-500 dark:text-orange-400">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        handleSearchClose();
                        setKeyboardNavIndex(0); // Select Search button
                      } else if (e.key === 'Enter') {
                        e.preventDefault();
                        if (filteredItems.length > 0) {
                          setIsSearching(false);
                          setKeyboardNavIndex(2); // First item
                        }
                      }
                    }}
                    placeholder="Search items..."
                    className="flex-1 h-full bg-transparent text-gray-900 dark:text-white focus:outline-none text-lg"
                    autoFocus
                  />
                  <button
                    onClick={handleSearchClose}
                    className="w-14 h-full flex items-center justify-center text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ) : (
                /* Search and Add Item buttons row */
                <div className="grid grid-cols-2 gap-3 w-full">
                  {/* Search Button */}
                  <button
                    onClick={handleSearchClick}
                    className={`w-full h-14 md:h-16 bg-white dark:bg-black border-2 rounded-lg text-lg md:text-xl font-normal transition-colors shadow-md flex items-center justify-center gap-2 ${
                      keyboardNavIndex === 0
                        ? 'border-orange-400 ring-2 ring-orange-400 bg-orange-50 dark:bg-orange-900 text-orange-700 dark:text-orange-300'
                        : 'border-orange-500 dark:border-orange-500 hover:border-orange-600 dark:hover:border-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900 text-orange-500 dark:text-orange-400 hover:text-orange-600 dark:hover:text-orange-300'
                    }`}
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    Search
                  </button>
                  
                  {/* Add Item Button */}
                  <button
                    onClick={() => setShowAddForm(true)}
                    className={`w-full h-14 md:h-16 bg-white dark:bg-black border-2 border-dashed rounded-lg text-lg md:text-xl font-normal transition-colors shadow-md flex items-center justify-center gap-2 ${
                      keyboardNavIndex === 1
                        ? 'border-orange-400 ring-2 ring-orange-400 bg-orange-50 dark:bg-orange-900 text-orange-700 dark:text-orange-300'
                        : 'border-orange-500 dark:border-orange-500 hover:border-orange-600 dark:hover:border-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900 text-orange-500 dark:text-orange-400 hover:text-orange-600 dark:hover:text-orange-300'
                    }`}
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                    </svg>
                    Add item
                  </button>
                </div>
              )}
            </div>

            {/* Scrollable items area - takes remaining space between fixed elements */}
            <div className="flex-1 overflow-y-auto min-h-0">
              <div className="flex flex-col gap-3 max-w-md mx-auto pb-2">
                {/* Item Buttons */}
                {filteredItems.map((item, itemIndex) => {
                  const quantity = getSelectedQuantity(item.id);
                  const navIndex = 2 + itemIndex; // Item navigation indices start at 2
                  const isKeyboardSelected = keyboardNavIndex === navIndex;
                  return (
                    <div 
                      key={item.id}
                      ref={el => itemRefs.current[itemIndex] = el}
                    >
                      <div
                        className={`w-full h-14 md:h-16 bg-white dark:bg-black border-2 rounded-lg transition-colors shadow-md flex items-center ${
                          isKeyboardSelected
                            ? 'border-blue-400 ring-2 ring-blue-400 bg-blue-50 dark:bg-blue-900'
                            : quantity > 0
                            ? 'border-blink-accent'
                            : 'border-blue-600 dark:border-blue-500 hover:border-blue-700 dark:hover:border-blue-400'
                        }`}
                      >
                        {/* Main clickable area for item selection */}
                        <button
                          onClick={() => handleItemClick(item)}
                          className={`flex-1 h-full flex flex-col justify-center px-4 text-left ${
                            isKeyboardSelected
                              ? 'text-blue-700 dark:text-blue-300'
                              : quantity > 0
                              ? 'text-blink-accent'
                              : 'text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300'
                          }`}
                        >
                          <span className="text-base font-medium truncate">{item.name}</span>
                          <span className="text-sm opacity-75">{formatDisplayAmount(item.price, displayCurrency)}</span>
                        </button>
                        
                        {/* Edit and Delete icons - moved towards center */}
                        <div className="flex items-center gap-1">
                          {/* Edit icon */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingItem({...item});
                            }}
                            className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors rounded"
                            title="Edit item"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          
                          {/* Delete icon */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDelete(item);
                            }}
                            className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors rounded"
                            title="Delete item"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                        
                        {/* Quantity indicator - inline at right end */}
                        {quantity > 0 ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveFromSelection(item.id);
                            }}
                            className="h-full px-5 bg-blink-accent text-white font-bold text-lg flex items-center justify-center rounded-r-md hover:bg-orange-600 transition-colors min-w-[56px]"
                            title="Click to remove one"
                          >
                            {quantity}
                          </button>
                        ) : (
                          /* Empty spacer when no quantity to maintain consistent button layout */
                          <div className="w-2"></div>
                        )}
                      </div>
                    </div>
                  );
                })}
                
                {/* No items message */}
                {cartItems.length === 0 && (
                  <div className="text-center text-gray-500 dark:text-gray-400 mt-8">
                    <p className="mb-2">No items yet</p>
                    <p className="text-sm">Tap "Add item" to create your first item</p>
                  </div>
                )}
                
                {/* No search results message */}
                {cartItems.length > 0 && filteredItems.length === 0 && searchQuery && (
                  <div className="text-center text-gray-500 dark:text-gray-400 mt-8">
                    <p className="mb-2">No items found</p>
                    <p className="text-sm">No items starting with "{searchQuery}"</p>
                  </div>
                )}
              </div>
            </div>

            {/* Fixed bottom row: C and OK buttons */}
            <div className="flex-shrink-0 pt-3 max-w-md mx-auto w-full">
              {(() => {
                const clearIndex = 2 + filteredItems.length;
                const okIndex = 2 + filteredItems.length + 1;
                return (
              <div className="grid grid-cols-2 gap-3 w-full">
                {/* Clear button */}
                <button
                  onClick={handleClear}
                  disabled={selectedItems.length === 0}
                  className={`w-full h-14 md:h-16 bg-white dark:bg-black border-2 rounded-lg text-lg md:text-xl font-normal leading-none tracking-normal transition-colors shadow-md ${
                    keyboardNavIndex === clearIndex
                      ? 'border-red-400 ring-2 ring-red-400 bg-red-50 dark:bg-red-900 text-red-700 dark:text-red-300'
                      : selectedItems.length === 0
                      ? 'border-gray-400 dark:border-gray-600 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                      : 'border-red-600 dark:border-red-500 hover:border-red-700 dark:hover:border-red-400 hover:bg-red-50 dark:hover:bg-red-900 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300'
                  }`}
                  style={{fontFamily: "'Source Sans Pro', sans-serif"}}
                >
                  C
                </button>
                
                {/* OK/Checkout button */}
                <button
                  onClick={handleCheckout}
                  disabled={total <= 0}
                  className={`w-full h-14 md:h-16 border-2 rounded-lg text-lg md:text-xl font-normal leading-none tracking-normal transition-colors shadow-md flex items-center justify-center ${
                    keyboardNavIndex === okIndex
                      ? 'bg-green-50 dark:bg-green-900 border-green-400 ring-2 ring-green-400 text-green-700 dark:text-green-300'
                      : total <= 0 
                      ? 'bg-gray-200 dark:bg-blink-dark border-gray-400 dark:border-gray-600 text-gray-400 dark:text-gray-500 cursor-not-allowed' 
                      : 'bg-white dark:bg-black border-green-600 dark:border-green-500 hover:border-green-700 dark:hover:border-green-400 hover:bg-green-50 dark:hover:bg-green-900 text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300'
                  }`}
                  style={{fontFamily: "'Source Sans Pro', sans-serif"}}
                >
                  OK
                </button>
              </div>
                );
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

ItemCart.displayName = 'ItemCart';
export default ItemCart;
