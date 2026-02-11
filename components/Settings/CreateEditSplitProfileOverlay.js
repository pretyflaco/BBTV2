/**
 * CreateEditSplitProfileOverlay - Create or edit a split payment profile
 * Extracted from Dashboard.js
 */
import { getLnAddressDomain } from '../../lib/config/api';

export default function CreateEditSplitProfileOverlay({
  darkMode,
  editingSplitProfile,
  newSplitProfileLabel,
  newSplitProfileRecipients,
  newRecipientInput,
  recipientValidation,
  splitProfileError,
  useCustomWeights,
  setShowCreateSplitProfile,
  setShowTipSettings,
  setEditingSplitProfile,
  setNewSplitProfileLabel,
  setNewSplitProfileRecipients,
  setNewRecipientInput,
  setRecipientValidation,
  setSplitProfileError,
  setUseCustomWeights,
  addRecipientToProfile,
  removeRecipientFromProfile,
  saveSplitProfile,
  getSubmenuBgClasses,
  getSubmenuHeaderClasses,
}) {
  const lnAddressDomain = getLnAddressDomain();

  return (
    <div className={`fixed inset-0 ${getSubmenuBgClasses()} z-50 overflow-y-auto`}>
      <div className="min-h-screen" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
        {/* Header */}
        <div className={`${getSubmenuHeaderClasses()} sticky top-0 z-10`}>
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
                        {recipient.type === 'npub_cash' ? recipient.username : `${recipient.username}@${lnAddressDomain}`}
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
                  Add {recipientValidation.type === 'npub_cash' ? recipientValidation.address : `${newRecipientInput}@${lnAddressDomain}`}
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
  );
}
