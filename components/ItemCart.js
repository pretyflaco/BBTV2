import { useState, useEffect, useCallback, useRef } from 'react';
import { formatDisplayAmount as formatCurrency, getCurrencyById } from '../lib/currency-utils';

const ItemCart = ({ 
  displayCurrency, 
  currencies, 
  publicKey, 
  onCheckout,
  soundEnabled,
  darkMode,
  toggleDarkMode 
}) => {
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

  // Helper function to get dynamic font size based on amount length
  const getDynamicFontSize = (displayText) => {
    const numericOnly = String(displayText).replace(/[^0-9.]/g, '');
    const length = numericOnly.length;
    
    if (length <= 6) return 'text-6xl';
    if (length <= 9) return 'text-5xl';
    if (length <= 11) return 'text-4xl';
    if (length <= 13) return 'text-3xl';
    if (length <= 15) return 'text-2xl';
    if (length <= 16) return 'text-xl';
    return 'text-lg';
  };

  // Play keystroke sound
  const playKeystrokeSound = () => {
    if (soundEnabled) {
      const audio = new Audio('/click.mp3');
      audio.volume = 0.3;
      audio.play().catch(console.error);
    }
  };

  // Fetch cart items from server
  const fetchCartItems = useCallback(async () => {
    if (!publicKey) return;
    
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
  }, [publicKey]);

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
    return formatCurrency(value, currency, currencies);
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

  return (
    <div className="h-full flex flex-col bg-white dark:bg-black relative overflow-hidden" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
      {/* Amount Display - Same position as POS */}
      <div className="flex-shrink-0 px-4 pb-2">
        <div className="text-center mb-2">
          <div className="text-center">
            <div className={`font-semibold text-gray-800 dark:text-gray-100 mb-1 min-h-[96px] flex items-center justify-center leading-none tracking-normal max-w-full overflow-hidden px-2 ${getDynamicFontSize(formatDisplayAmount(total, displayCurrency))}`} style={{fontFamily: "'Source Sans Pro', sans-serif", wordBreak: 'keep-all', overflowWrap: 'normal'}}>
              {total > 0 ? (
                <span className="text-blink-accent">{formatDisplayAmount(total, displayCurrency)}</span>
              ) : (
                formatDisplayAmount(0, displayCurrency)
              )}
            </div>
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
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blink-accent"></div>
          </div>
        ) : showAddForm ? (
          /* Add Item Form - scrollable for mobile keyboard */
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-sm mx-auto space-y-4 pb-4">
              <h3 className="text-lg font-semibold text-center text-gray-800 dark:text-white">Add New Item</h3>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Item Name
                </label>
                <input
                  type="text"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  placeholder="e.g., Ice Cream"
                  className="w-full px-3 py-2 border-2 border-blue-600 dark:border-blue-500 rounded-lg bg-white dark:bg-blink-dark text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Price
                </label>
                <input
                  type="number"
                  value={newItemPrice}
                  onChange={(e) => setNewItemPrice(e.target.value)}
                  placeholder="1"
                  min="0"
                  step="any"
                  className="w-full px-3 py-2 border-2 border-blue-600 dark:border-blue-500 rounded-lg bg-white dark:bg-blink-dark text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-3 pt-4">
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    setNewItemName('');
                    setNewItemPrice('');
                  }}
                  className="h-12 bg-white dark:bg-black border-2 border-gray-500 hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-900 text-gray-600 dark:text-gray-400 rounded-lg text-lg font-normal transition-colors shadow-md"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddItem}
                  disabled={addingItem || !newItemName.trim() || !newItemPrice}
                  className="h-12 bg-white dark:bg-black border-2 border-green-600 dark:border-green-500 hover:border-green-700 dark:hover:border-green-400 hover:bg-green-50 dark:hover:bg-green-900 text-green-600 dark:text-green-400 disabled:border-gray-400 disabled:text-gray-400 disabled:cursor-not-allowed rounded-lg text-lg font-normal transition-colors shadow-md"
                >
                  {addingItem ? 'Adding...' : 'Add'}
                </button>
              </div>
            </div>
          </div>
        ) : editingItem ? (
          /* Edit Item Form - scrollable for mobile keyboard */
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-sm mx-auto space-y-4 pb-4">
              <h3 className="text-lg font-semibold text-center text-gray-800 dark:text-white">Edit Item</h3>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Item Name
                </label>
                <input
                  type="text"
                  value={editingItem.name}
                  onChange={(e) => setEditingItem({...editingItem, name: e.target.value})}
                  className="w-full px-3 py-2 border-2 border-blue-600 dark:border-blue-500 rounded-lg bg-white dark:bg-blink-dark text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Price
                </label>
                <input
                  type="number"
                  value={editingItem.price}
                  onChange={(e) => setEditingItem({...editingItem, price: parseFloat(e.target.value) || 0})}
                  min="0"
                  step="any"
                  className="w-full px-3 py-2 border-2 border-blue-600 dark:border-blue-500 rounded-lg bg-white dark:bg-blink-dark text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-3 pt-4">
                <button
                  onClick={() => setEditingItem(null)}
                  className="h-12 bg-white dark:bg-black border-2 border-gray-500 hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-900 text-gray-600 dark:text-gray-400 rounded-lg text-lg font-normal transition-colors shadow-md"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateItem}
                  className="h-12 bg-white dark:bg-black border-2 border-green-600 dark:border-green-500 hover:border-green-700 dark:hover:border-green-400 hover:bg-green-50 dark:hover:bg-green-900 text-green-600 dark:text-green-400 rounded-lg text-lg font-normal transition-colors shadow-md"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        ) : confirmDelete ? (
          /* Delete Confirmation */
          <div className="max-w-sm mx-auto space-y-4">
            <h3 className="text-lg font-semibold text-center text-gray-800 dark:text-white">Delete Item?</h3>
            <p className="text-center text-gray-600 dark:text-gray-400">
              Are you sure you want to delete "{confirmDelete.name}"?
            </p>
            
            <div className="grid grid-cols-2 gap-3 pt-4">
              <button
                onClick={() => setConfirmDelete(null)}
                className="h-12 bg-white dark:bg-black border-2 border-gray-500 hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-900 text-gray-600 dark:text-gray-400 rounded-lg text-lg font-normal transition-colors shadow-md"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteItem(confirmDelete.id)}
                className="h-12 bg-white dark:bg-black border-2 border-red-600 dark:border-red-500 hover:border-red-700 dark:hover:border-red-400 hover:bg-red-50 dark:hover:bg-red-900 text-red-600 dark:text-red-400 rounded-lg text-lg font-normal transition-colors shadow-md"
              >
                Delete
              </button>
            </div>
          </div>
        ) : (
          /* Items List with fixed header and footer */
          <div className="flex-1 flex flex-col min-h-0">
            {/* Fixed top row: Search and Add Item buttons */}
            <div className="flex-shrink-0 max-w-sm mx-auto w-full mb-2">
              {isSearching ? (
                /* Expanded Search Input */
                <div className="w-full h-14 bg-white dark:bg-black border-2 border-orange-500 dark:border-orange-500 rounded-lg flex items-center shadow-md">
                  <div className="flex items-center justify-center w-12 text-orange-500 dark:text-orange-400">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search items..."
                    className="flex-1 h-full bg-transparent text-gray-900 dark:text-white focus:outline-none text-base"
                    autoFocus
                  />
                  <button
                    onClick={handleSearchClose}
                    className="w-12 h-full flex items-center justify-center text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ) : (
                /* Search and Add Item buttons row */
                <div className="grid grid-cols-2 gap-2 w-full">
                  {/* Search Button */}
                  <button
                    onClick={handleSearchClick}
                    className="w-full h-14 bg-white dark:bg-black border-2 border-orange-500 dark:border-orange-500 hover:border-orange-600 dark:hover:border-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900 text-orange-500 dark:text-orange-400 hover:text-orange-600 dark:hover:text-orange-300 rounded-lg text-base font-normal transition-colors shadow-md flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    Search
                  </button>
                  
                  {/* Add Item Button */}
                  <button
                    onClick={() => setShowAddForm(true)}
                    className="w-full h-14 bg-white dark:bg-black border-2 border-dashed border-orange-500 dark:border-orange-500 hover:border-orange-600 dark:hover:border-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900 text-orange-500 dark:text-orange-400 hover:text-orange-600 dark:hover:text-orange-300 rounded-lg text-base font-normal transition-colors shadow-md flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                    </svg>
                    Add item
                  </button>
                </div>
              )}
            </div>

            {/* Scrollable items area - takes remaining space between fixed elements */}
            <div className="flex-1 overflow-y-auto min-h-0">
              <div className="flex flex-col gap-2 max-w-sm mx-auto pb-2">
                {/* Item Buttons */}
                {filteredItems.map((item) => {
                  const quantity = getSelectedQuantity(item.id);
                  return (
                    <div key={item.id}>
                      <div
                        className={`w-full h-14 bg-white dark:bg-black border-2 rounded-lg transition-colors shadow-md flex items-center ${
                          quantity > 0
                            ? 'border-blink-accent'
                            : 'border-blue-600 dark:border-blue-500 hover:border-blue-700 dark:hover:border-blue-400'
                        }`}
                      >
                        {/* Main clickable area for item selection */}
                        <button
                          onClick={() => handleItemClick(item)}
                          className={`flex-1 h-full flex flex-col justify-center px-3 text-left ${
                            quantity > 0
                              ? 'text-blink-accent'
                              : 'text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300'
                          }`}
                        >
                          <span className="text-sm font-medium truncate">{item.name}</span>
                          <span className="text-xs opacity-75">{item.price}</span>
                        </button>
                        
                        {/* Edit and Delete icons - moved towards center */}
                        <div className="flex items-center gap-1">
                          {/* Edit icon */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingItem({...item});
                            }}
                            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors rounded"
                            title="Edit item"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          
                          {/* Delete icon */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDelete(item);
                            }}
                            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors rounded"
                            title="Delete item"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                            className="h-full px-4 bg-blink-accent text-white font-bold flex items-center justify-center rounded-r-md hover:bg-orange-600 transition-colors min-w-[48px]"
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
            <div className="flex-shrink-0 pt-2 max-w-sm mx-auto w-full">
              <div className="grid grid-cols-2 gap-2 w-full">
                {/* Clear button */}
                <button
                  onClick={handleClear}
                  disabled={selectedItems.length === 0}
                  className="w-full h-14 bg-white dark:bg-black border-2 border-red-600 dark:border-red-500 hover:border-red-700 dark:hover:border-red-400 hover:bg-red-50 dark:hover:bg-red-900 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 disabled:border-gray-400 dark:disabled:border-gray-600 disabled:text-gray-400 dark:disabled:text-gray-500 disabled:cursor-not-allowed rounded-lg text-lg font-normal leading-none tracking-normal transition-colors shadow-md"
                  style={{fontFamily: "'Source Sans Pro', sans-serif"}}
                >
                  C
                </button>
                
                {/* OK/Checkout button */}
                <button
                  onClick={handleCheckout}
                  disabled={total <= 0}
                  className={`w-full h-14 ${total <= 0 ? 'bg-gray-200 dark:bg-blink-dark border-2 border-gray-400 dark:border-gray-600 text-gray-400 dark:text-gray-500' : 'bg-white dark:bg-black border-2 border-green-600 dark:border-green-500 hover:border-green-700 dark:hover:border-green-400 hover:bg-green-50 dark:hover:bg-green-900 text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300'} disabled:cursor-not-allowed rounded-lg text-lg font-normal leading-none tracking-normal transition-colors shadow-md flex items-center justify-center`}
                  style={{fontFamily: "'Source Sans Pro', sans-serif"}}
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ItemCart;
