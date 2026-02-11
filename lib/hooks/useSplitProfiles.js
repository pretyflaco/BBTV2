import { useState, useCallback } from 'react';

/**
 * Default recipient validation state
 */
const DEFAULT_RECIPIENT_VALIDATION = {
  status: null,
  message: '',
  isValidating: false,
};

/**
 * Hook for managing split payment profile state
 * 
 * Extracted from Dashboard.js to manage:
 * - Profile list and active profile selection
 * - Profile creation/editing UI state
 * - Form fields for new profiles
 * - Recipient validation state
 * - Weight distribution mode
 * 
 * @returns {Object} Split profile state and actions
 */
export function useSplitProfiles() {
  // Profile list state
  const [splitProfiles, setSplitProfiles] = useState([]);
  const [activeSplitProfile, setActiveSplitProfile] = useState(null);
  const [splitProfilesLoading, setSplitProfilesLoading] = useState(false);

  // Profile creation/editing UI state
  const [showCreateSplitProfile, setShowCreateSplitProfile] = useState(false);
  const [editingSplitProfile, setEditingSplitProfile] = useState(null);

  // Form state
  const [newSplitProfileLabel, setNewSplitProfileLabel] = useState('');
  const [newSplitProfileRecipients, setNewSplitProfileRecipients] = useState([]); // Array of { username, validated, type, weight, locked }
  const [newRecipientInput, setNewRecipientInput] = useState(''); // Current input for adding a recipient

  // Error state
  const [splitProfileError, setSplitProfileError] = useState(null);

  // Recipient validation state
  const [recipientValidation, setRecipientValidation] = useState(DEFAULT_RECIPIENT_VALIDATION);

  // Weight mode
  const [useCustomWeights, setUseCustomWeights] = useState(false); // Toggle for custom weight mode

  /**
   * Reset the split profile form to initial state
   */
  const resetSplitProfileForm = useCallback(() => {
    setNewSplitProfileLabel('');
    setNewSplitProfileRecipients([]);
    setNewRecipientInput('');
    setSplitProfileError(null);
    setRecipientValidation(DEFAULT_RECIPIENT_VALIDATION);
    setUseCustomWeights(false);
    setEditingSplitProfile(null);
    setShowCreateSplitProfile(false);
  }, []);

  /**
   * Start editing an existing profile - populates form with profile data
   * @param {Object} profile - Profile to edit
   */
  const startEditingProfile = useCallback((profile) => {
    setEditingSplitProfile(profile);
    setNewSplitProfileLabel(profile.label);
    setNewSplitProfileRecipients([...profile.recipients]);
    setNewRecipientInput('');
    setSplitProfileError(null);
    setRecipientValidation(DEFAULT_RECIPIENT_VALIDATION);
    // Check if any recipients have non-equal weights
    const hasCustomWeights = profile.recipients.some((r, i, arr) => {
      const equalWeight = 100 / arr.length;
      return Math.abs(r.weight - equalWeight) > 0.01;
    });
    setUseCustomWeights(hasCustomWeights);
    setShowCreateSplitProfile(true);
  }, []);

  /**
   * Clear recipient validation state
   */
  const clearRecipientValidation = useCallback(() => {
    setRecipientValidation(DEFAULT_RECIPIENT_VALIDATION);
  }, []);

  /**
   * Add a validated recipient to the list
   * @param {Object} recipient - Recipient to add
   */
  const addRecipientToList = useCallback((recipient) => {
    setNewSplitProfileRecipients((prev) => {
      // Check for duplicates
      if (prev.some((r) => r.username === recipient.username)) {
        return prev;
      }
      return [...prev, recipient];
    });
    setNewRecipientInput('');
    setRecipientValidation(DEFAULT_RECIPIENT_VALIDATION);
  }, []);

  /**
   * Remove a recipient from the list by username
   * @param {string} username - Username to remove
   */
  const removeRecipientFromList = useCallback((username) => {
    setNewSplitProfileRecipients((prev) => prev.filter((r) => r.username !== username));
  }, []);

  /**
   * Update a recipient's weight
   * @param {string} username - Username to update
   * @param {number} weight - New weight value
   */
  const updateRecipientWeight = useCallback((username, weight) => {
    setNewSplitProfileRecipients((prev) =>
      prev.map((r) => (r.username === username ? { ...r, weight } : r))
    );
  }, []);

  /**
   * Toggle a recipient's locked state
   * @param {string} username - Username to toggle
   */
  const toggleRecipientLock = useCallback((username) => {
    setNewSplitProfileRecipients((prev) =>
      prev.map((r) => (r.username === username ? { ...r, locked: !r.locked } : r))
    );
  }, []);

  return {
    // Profile list state
    splitProfiles,
    setSplitProfiles,
    activeSplitProfile,
    setActiveSplitProfile,
    splitProfilesLoading,
    setSplitProfilesLoading,

    // Profile creation/editing UI state
    showCreateSplitProfile,
    setShowCreateSplitProfile,
    editingSplitProfile,
    setEditingSplitProfile,

    // Form state
    newSplitProfileLabel,
    setNewSplitProfileLabel,
    newSplitProfileRecipients,
    setNewSplitProfileRecipients,
    newRecipientInput,
    setNewRecipientInput,

    // Error state
    splitProfileError,
    setSplitProfileError,

    // Recipient validation state
    recipientValidation,
    setRecipientValidation,

    // Weight mode
    useCustomWeights,
    setUseCustomWeights,

    // Utility functions
    resetSplitProfileForm,
    startEditingProfile,
    clearRecipientValidation,
    addRecipientToList,
    removeRecipientFromList,
    updateRecipientWeight,
    toggleRecipientLock,
  };
}

export default useSplitProfiles;
