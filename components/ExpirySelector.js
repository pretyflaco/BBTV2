/**
 * ExpirySelector Component
 * 
 * Reusable component for selecting voucher expiry duration.
 * Styled as horizontal pill buttons to match the grid selector in MultiVoucher.
 */

import { useState, useEffect } from 'react';

// Expiry preset options (must match lib/voucher-expiry.js)
const EXPIRY_OPTIONS = [
  { id: '15m', label: '15 min', description: '15 minutes' },
  { id: '1h', label: '1 hour', description: '1 hour' },
  { id: '24h', label: '24h', description: '24 hours' },
  { id: '7d', label: '7 days', description: '7 days' },
  { id: '30d', label: '30 days', description: '30 days' },
  { id: '6mo', label: '6 months', description: '6 months' },
];

const DEFAULT_EXPIRY = '6mo';

/**
 * ExpirySelector - Horizontal pill button selector for voucher expiry
 * 
 * @param {string} value - Currently selected expiry ID
 * @param {function} onChange - Callback when selection changes (receives expiry ID)
 * @param {string} className - Additional CSS classes
 * @param {boolean} compact - Use compact mode (smaller buttons)
 * @param {boolean} disabled - Disable the selector
 */
export default function ExpirySelector({ 
  value = DEFAULT_EXPIRY, 
  onChange, 
  className = '',
  compact = false,
  disabled = false 
}) {
  const [selected, setSelected] = useState(value);

  // Sync with external value changes
  useEffect(() => {
    if (value !== selected) {
      setSelected(value);
    }
  }, [value]);

  const handleSelect = (expiryId) => {
    if (disabled) return;
    setSelected(expiryId);
    if (onChange) {
      onChange(expiryId);
    }
  };

  return (
    <div className={`${className}`}>
      {/* Label */}
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        Voucher Expiry
      </label>
      
      {/* Horizontal scrolling pill buttons */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {EXPIRY_OPTIONS.map(option => (
          <button
            key={option.id}
            type="button"
            onClick={() => handleSelect(option.id)}
            disabled={disabled}
            className={`
              flex-shrink-0 
              ${compact ? 'px-3 py-1.5 text-sm' : 'px-4 py-2'}
              rounded-full border-2 font-medium transition-all duration-200
              ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              ${selected === option.id
                ? 'border-purple-500 bg-purple-500 text-white shadow-md'
                : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-purple-400 dark:hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/30'
              }
            `}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Selected expiry description */}
      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        {selected === '6mo' 
          ? 'Voucher valid for 6 months (recommended for gift cards)'
          : `Voucher expires after ${EXPIRY_OPTIONS.find(o => o.id === selected)?.description || selected}`
        }
      </div>
    </div>
  );
}

/**
 * ExpiryBadge - Display expiry status as a colored badge
 * 
 * @param {number} expiresAt - Expiry timestamp
 * @param {string} status - Voucher status (ACTIVE, CLAIMED, CANCELLED, EXPIRED)
 * @param {boolean} compact - Use compact mode
 */
export function ExpiryBadge({ expiresAt, status, compact = false }) {
  const now = Date.now();
  const timeRemaining = expiresAt ? expiresAt - now : 0;
  
  // Calculate display values
  let badgeColor = 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
  let label = '';
  
  if (status === 'CLAIMED') {
    badgeColor = 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    label = 'Claimed';
  } else if (status === 'CANCELLED') {
    badgeColor = 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500';
    label = 'Cancelled';
  } else if (status === 'EXPIRED') {
    badgeColor = 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400';
    label = 'Expired';
  } else if (timeRemaining <= 0) {
    badgeColor = 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400';
    label = 'Expired';
  } else if (timeRemaining < 60 * 60 * 1000) {
    // Less than 1 hour
    badgeColor = 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400';
    const mins = Math.ceil(timeRemaining / (60 * 1000));
    label = `${mins}m left`;
  } else if (timeRemaining < 24 * 60 * 60 * 1000) {
    // Less than 24 hours
    badgeColor = 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
    const hours = Math.ceil(timeRemaining / (60 * 60 * 1000));
    label = `${hours}h left`;
  } else if (timeRemaining < 7 * 24 * 60 * 60 * 1000) {
    // Less than 7 days
    badgeColor = 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
    const days = Math.ceil(timeRemaining / (24 * 60 * 60 * 1000));
    label = `${days}d left`;
  } else {
    // More than 7 days
    badgeColor = 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
    const date = new Date(expiresAt);
    label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  return (
    <span className={`
      inline-flex items-center rounded-full font-medium
      ${compact ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs'}
      ${badgeColor}
    `}>
      {label}
    </span>
  );
}

/**
 * Format expiry date for display
 * @param {number} expiresAt - Expiry timestamp
 * @returns {string} Formatted date string
 */
export function formatExpiryDate(expiresAt) {
  if (!expiresAt) return 'No expiry';
  const date = new Date(expiresAt);
  return date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Get expiry option by ID
 * @param {string} id - Expiry ID
 * @returns {object|null} Expiry option object
 */
export function getExpiryOption(id) {
  return EXPIRY_OPTIONS.find(o => o.id === id) || null;
}

// Export constants for use in other components
export { EXPIRY_OPTIONS, DEFAULT_EXPIRY };
