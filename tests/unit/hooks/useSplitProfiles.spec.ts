import { renderHook, act } from '@testing-library/react';
import { useSplitProfiles } from '../../../lib/hooks/useSplitProfiles';
import type { SplitProfile, SplitRecipient } from '../../../lib/hooks/useSplitProfiles';

describe('useSplitProfiles', () => {
  // Helper to create a mock recipient
  const createMockRecipient = (overrides: Partial<SplitRecipient> = {}): SplitRecipient => ({
    username: 'alice',
    validated: true,
    type: 'blink',
    weight: 50,
    locked: false,
    ...overrides,
  });

  // Helper to create a mock profile
  const createMockProfile = (overrides: Partial<SplitProfile> = {}): SplitProfile => ({
    id: 'profile-1',
    label: 'Test Profile',
    recipients: [
      createMockRecipient({ username: 'alice', weight: 50 }),
      createMockRecipient({ username: 'bob', weight: 50 }),
    ],
    ...overrides,
  });

  describe('initial state', () => {
    it('initializes with empty profiles array', () => {
      const { result } = renderHook(() => useSplitProfiles());
      expect(result.current.splitProfiles).toEqual([]);
    });

    it('initializes with null active profile', () => {
      const { result } = renderHook(() => useSplitProfiles());
      expect(result.current.activeSplitProfile).toBeNull();
    });

    it('initializes with loading state as false', () => {
      const { result } = renderHook(() => useSplitProfiles());
      expect(result.current.splitProfilesLoading).toBe(false);
    });

    it('initializes with create profile modal closed', () => {
      const { result } = renderHook(() => useSplitProfiles());
      expect(result.current.showCreateSplitProfile).toBe(false);
    });

    it('initializes with no profile being edited', () => {
      const { result } = renderHook(() => useSplitProfiles());
      expect(result.current.editingSplitProfile).toBeNull();
    });

    it('initializes with empty form fields', () => {
      const { result } = renderHook(() => useSplitProfiles());
      expect(result.current.newSplitProfileLabel).toBe('');
      expect(result.current.newSplitProfileRecipients).toEqual([]);
      expect(result.current.newRecipientInput).toBe('');
    });

    it('initializes with null error', () => {
      const { result } = renderHook(() => useSplitProfiles());
      expect(result.current.splitProfileError).toBeNull();
    });

    it('initializes with default recipient validation state', () => {
      const { result } = renderHook(() => useSplitProfiles());
      expect(result.current.recipientValidation).toEqual({
        status: null,
        message: '',
        isValidating: false,
      });
    });

    it('initializes with custom weights disabled', () => {
      const { result } = renderHook(() => useSplitProfiles());
      expect(result.current.useCustomWeights).toBe(false);
    });
  });

  describe('profile list actions', () => {
    it('setSplitProfiles updates the profiles list', () => {
      const { result } = renderHook(() => useSplitProfiles());
      const profiles = [createMockProfile()];

      act(() => {
        result.current.setSplitProfiles(profiles);
      });

      expect(result.current.splitProfiles).toEqual(profiles);
    });

    it('setActiveSplitProfile sets the active profile', () => {
      const { result } = renderHook(() => useSplitProfiles());
      const profile = createMockProfile();

      act(() => {
        result.current.setActiveSplitProfile(profile);
      });

      expect(result.current.activeSplitProfile).toEqual(profile);
    });

    it('setActiveSplitProfile can clear the active profile', () => {
      const { result } = renderHook(() => useSplitProfiles());
      const profile = createMockProfile();

      act(() => {
        result.current.setActiveSplitProfile(profile);
      });
      expect(result.current.activeSplitProfile).toEqual(profile);

      act(() => {
        result.current.setActiveSplitProfile(null);
      });
      expect(result.current.activeSplitProfile).toBeNull();
    });

    it('setSplitProfilesLoading toggles loading state', () => {
      const { result } = renderHook(() => useSplitProfiles());

      act(() => {
        result.current.setSplitProfilesLoading(true);
      });
      expect(result.current.splitProfilesLoading).toBe(true);

      act(() => {
        result.current.setSplitProfilesLoading(false);
      });
      expect(result.current.splitProfilesLoading).toBe(false);
    });
  });

  describe('UI state actions', () => {
    it('setShowCreateSplitProfile opens the create modal', () => {
      const { result } = renderHook(() => useSplitProfiles());

      act(() => {
        result.current.setShowCreateSplitProfile(true);
      });

      expect(result.current.showCreateSplitProfile).toBe(true);
    });

    it('setEditingSplitProfile sets the profile being edited', () => {
      const { result } = renderHook(() => useSplitProfiles());
      const profile = createMockProfile();

      act(() => {
        result.current.setEditingSplitProfile(profile);
      });

      expect(result.current.editingSplitProfile).toEqual(profile);
    });
  });

  describe('form actions', () => {
    it('setNewSplitProfileLabel updates the label', () => {
      const { result } = renderHook(() => useSplitProfiles());

      act(() => {
        result.current.setNewSplitProfileLabel('My Profile');
      });

      expect(result.current.newSplitProfileLabel).toBe('My Profile');
    });

    it('setNewSplitProfileRecipients updates recipients list', () => {
      const { result } = renderHook(() => useSplitProfiles());
      const recipients = [createMockRecipient()];

      act(() => {
        result.current.setNewSplitProfileRecipients(recipients);
      });

      expect(result.current.newSplitProfileRecipients).toEqual(recipients);
    });

    it('setNewRecipientInput updates input value', () => {
      const { result } = renderHook(() => useSplitProfiles());

      act(() => {
        result.current.setNewRecipientInput('alice');
      });

      expect(result.current.newRecipientInput).toBe('alice');
    });

    it('setSplitProfileError sets error message', () => {
      const { result } = renderHook(() => useSplitProfiles());

      act(() => {
        result.current.setSplitProfileError('Failed to save');
      });

      expect(result.current.splitProfileError).toBe('Failed to save');
    });

    it('setUseCustomWeights toggles weight mode', () => {
      const { result } = renderHook(() => useSplitProfiles());

      act(() => {
        result.current.setUseCustomWeights(true);
      });
      expect(result.current.useCustomWeights).toBe(true);

      act(() => {
        result.current.setUseCustomWeights(false);
      });
      expect(result.current.useCustomWeights).toBe(false);
    });
  });

  describe('recipient validation actions', () => {
    it('setRecipientValidation updates validation state', () => {
      const { result } = renderHook(() => useSplitProfiles());

      act(() => {
        result.current.setRecipientValidation({
          status: 'validating',
          message: 'Checking...',
          isValidating: true,
        });
      });

      expect(result.current.recipientValidation).toEqual({
        status: 'validating',
        message: 'Checking...',
        isValidating: true,
      });
    });

    it('setRecipientValidation can set success with type and address', () => {
      const { result } = renderHook(() => useSplitProfiles());

      act(() => {
        result.current.setRecipientValidation({
          status: 'success',
          message: 'Valid recipient',
          isValidating: false,
          type: 'blink',
          address: 'alice',
        });
      });

      expect(result.current.recipientValidation).toEqual({
        status: 'success',
        message: 'Valid recipient',
        isValidating: false,
        type: 'blink',
        address: 'alice',
      });
    });

    it('clearRecipientValidation resets validation state', () => {
      const { result } = renderHook(() => useSplitProfiles());

      // Set some validation state
      act(() => {
        result.current.setRecipientValidation({
          status: 'error',
          message: 'Invalid',
          isValidating: false,
        });
      });

      // Clear it
      act(() => {
        result.current.clearRecipientValidation();
      });

      expect(result.current.recipientValidation).toEqual({
        status: null,
        message: '',
        isValidating: false,
      });
    });
  });

  describe('resetSplitProfileForm', () => {
    it('resets all form state to initial values', () => {
      const { result } = renderHook(() => useSplitProfiles());

      // Set various form values
      act(() => {
        result.current.setNewSplitProfileLabel('My Profile');
        result.current.setNewSplitProfileRecipients([createMockRecipient()]);
        result.current.setNewRecipientInput('bob');
        result.current.setSplitProfileError('Some error');
        result.current.setRecipientValidation({
          status: 'success',
          message: 'Valid',
          isValidating: false,
        });
        result.current.setUseCustomWeights(true);
        result.current.setEditingSplitProfile(createMockProfile());
        result.current.setShowCreateSplitProfile(true);
      });

      // Reset the form
      act(() => {
        result.current.resetSplitProfileForm();
      });

      expect(result.current.newSplitProfileLabel).toBe('');
      expect(result.current.newSplitProfileRecipients).toEqual([]);
      expect(result.current.newRecipientInput).toBe('');
      expect(result.current.splitProfileError).toBeNull();
      expect(result.current.recipientValidation).toEqual({
        status: null,
        message: '',
        isValidating: false,
      });
      expect(result.current.useCustomWeights).toBe(false);
      expect(result.current.editingSplitProfile).toBeNull();
      expect(result.current.showCreateSplitProfile).toBe(false);
    });

    it('does not affect profile list state', () => {
      const { result } = renderHook(() => useSplitProfiles());
      const profiles = [createMockProfile()];
      const activeProfile = createMockProfile({ id: 'active-1' });

      act(() => {
        result.current.setSplitProfiles(profiles);
        result.current.setActiveSplitProfile(activeProfile);
        result.current.setSplitProfilesLoading(true);
      });

      act(() => {
        result.current.resetSplitProfileForm();
      });

      expect(result.current.splitProfiles).toEqual(profiles);
      expect(result.current.activeSplitProfile).toEqual(activeProfile);
      expect(result.current.splitProfilesLoading).toBe(true);
    });
  });

  describe('startEditingProfile', () => {
    it('populates form with profile data', () => {
      const { result } = renderHook(() => useSplitProfiles());
      const profile = createMockProfile({
        label: 'Edit This',
        recipients: [
          createMockRecipient({ username: 'alice', weight: 60 }),
          createMockRecipient({ username: 'bob', weight: 40 }),
        ],
      });

      act(() => {
        result.current.startEditingProfile(profile);
      });

      expect(result.current.editingSplitProfile).toEqual(profile);
      expect(result.current.newSplitProfileLabel).toBe('Edit This');
      expect(result.current.newSplitProfileRecipients).toHaveLength(2);
      expect(result.current.showCreateSplitProfile).toBe(true);
    });

    it('clears input and validation state', () => {
      const { result } = renderHook(() => useSplitProfiles());
      const profile = createMockProfile();

      // Set some prior state
      act(() => {
        result.current.setNewRecipientInput('charlie');
        result.current.setSplitProfileError('Old error');
        result.current.setRecipientValidation({
          status: 'error',
          message: 'Previous error',
          isValidating: false,
        });
      });

      act(() => {
        result.current.startEditingProfile(profile);
      });

      expect(result.current.newRecipientInput).toBe('');
      expect(result.current.splitProfileError).toBeNull();
      expect(result.current.recipientValidation).toEqual({
        status: null,
        message: '',
        isValidating: false,
      });
    });

    it('detects custom weights when recipients have non-equal weights', () => {
      const { result } = renderHook(() => useSplitProfiles());
      const profile = createMockProfile({
        recipients: [
          createMockRecipient({ username: 'alice', weight: 70 }),
          createMockRecipient({ username: 'bob', weight: 30 }),
        ],
      });

      act(() => {
        result.current.startEditingProfile(profile);
      });

      expect(result.current.useCustomWeights).toBe(true);
    });

    it('does not set custom weights when recipients have equal weights', () => {
      const { result } = renderHook(() => useSplitProfiles());
      const profile = createMockProfile({
        recipients: [
          createMockRecipient({ username: 'alice', weight: 50 }),
          createMockRecipient({ username: 'bob', weight: 50 }),
        ],
      });

      act(() => {
        result.current.startEditingProfile(profile);
      });

      expect(result.current.useCustomWeights).toBe(false);
    });

    it('handles profile with three equal recipients', () => {
      const { result } = renderHook(() => useSplitProfiles());
      const profile = createMockProfile({
        recipients: [
          createMockRecipient({ username: 'alice', weight: 33.33 }),
          createMockRecipient({ username: 'bob', weight: 33.33 }),
          createMockRecipient({ username: 'charlie', weight: 33.34 }),
        ],
      });

      act(() => {
        result.current.startEditingProfile(profile);
      });

      // Small rounding differences should not trigger custom weights
      expect(result.current.useCustomWeights).toBe(false);
    });

    it('creates a copy of recipients array', () => {
      const { result } = renderHook(() => useSplitProfiles());
      const profile = createMockProfile();

      act(() => {
        result.current.startEditingProfile(profile);
      });

      // Modify the form recipients
      act(() => {
        result.current.setNewSplitProfileRecipients([]);
      });

      // Original profile should be unchanged
      expect(profile.recipients).toHaveLength(2);
    });
  });

  describe('addRecipientToList', () => {
    it('adds a recipient to empty list', () => {
      const { result } = renderHook(() => useSplitProfiles());
      const recipient = createMockRecipient({ username: 'alice' });

      act(() => {
        result.current.addRecipientToList(recipient);
      });

      expect(result.current.newSplitProfileRecipients).toHaveLength(1);
      expect(result.current.newSplitProfileRecipients[0]).toEqual(recipient);
    });

    it('adds recipient to existing list', () => {
      const { result } = renderHook(() => useSplitProfiles());

      act(() => {
        result.current.addRecipientToList(createMockRecipient({ username: 'alice' }));
        result.current.addRecipientToList(createMockRecipient({ username: 'bob' }));
      });

      expect(result.current.newSplitProfileRecipients).toHaveLength(2);
    });

    it('prevents duplicate recipients', () => {
      const { result } = renderHook(() => useSplitProfiles());

      act(() => {
        result.current.addRecipientToList(createMockRecipient({ username: 'alice' }));
        result.current.addRecipientToList(createMockRecipient({ username: 'alice' }));
      });

      expect(result.current.newSplitProfileRecipients).toHaveLength(1);
    });

    it('clears input and validation after adding', () => {
      const { result } = renderHook(() => useSplitProfiles());

      act(() => {
        result.current.setNewRecipientInput('alice');
        result.current.setRecipientValidation({
          status: 'success',
          message: 'Valid',
          isValidating: false,
        });
      });

      act(() => {
        result.current.addRecipientToList(createMockRecipient({ username: 'alice' }));
      });

      expect(result.current.newRecipientInput).toBe('');
      expect(result.current.recipientValidation).toEqual({
        status: null,
        message: '',
        isValidating: false,
      });
    });
  });

  describe('removeRecipientFromList', () => {
    it('removes recipient by username', () => {
      const { result } = renderHook(() => useSplitProfiles());

      act(() => {
        result.current.addRecipientToList(createMockRecipient({ username: 'alice' }));
        result.current.addRecipientToList(createMockRecipient({ username: 'bob' }));
      });

      act(() => {
        result.current.removeRecipientFromList('alice');
      });

      expect(result.current.newSplitProfileRecipients).toHaveLength(1);
      expect(result.current.newSplitProfileRecipients[0].username).toBe('bob');
    });

    it('does nothing if username not found', () => {
      const { result } = renderHook(() => useSplitProfiles());

      act(() => {
        result.current.addRecipientToList(createMockRecipient({ username: 'alice' }));
      });

      act(() => {
        result.current.removeRecipientFromList('nonexistent');
      });

      expect(result.current.newSplitProfileRecipients).toHaveLength(1);
    });
  });

  describe('updateRecipientWeight', () => {
    it('updates the weight of a specific recipient', () => {
      const { result } = renderHook(() => useSplitProfiles());

      act(() => {
        result.current.addRecipientToList(createMockRecipient({ username: 'alice', weight: 50 }));
        result.current.addRecipientToList(createMockRecipient({ username: 'bob', weight: 50 }));
      });

      act(() => {
        result.current.updateRecipientWeight('alice', 75);
      });

      const alice = result.current.newSplitProfileRecipients.find((r) => r.username === 'alice');
      const bob = result.current.newSplitProfileRecipients.find((r) => r.username === 'bob');

      expect(alice?.weight).toBe(75);
      expect(bob?.weight).toBe(50);
    });

    it('does nothing if username not found', () => {
      const { result } = renderHook(() => useSplitProfiles());

      act(() => {
        result.current.addRecipientToList(createMockRecipient({ username: 'alice', weight: 50 }));
      });

      act(() => {
        result.current.updateRecipientWeight('nonexistent', 100);
      });

      expect(result.current.newSplitProfileRecipients[0].weight).toBe(50);
    });
  });

  describe('toggleRecipientLock', () => {
    it('toggles the locked state of a recipient', () => {
      const { result } = renderHook(() => useSplitProfiles());

      act(() => {
        result.current.addRecipientToList(createMockRecipient({ username: 'alice', locked: false }));
      });

      act(() => {
        result.current.toggleRecipientLock('alice');
      });

      expect(result.current.newSplitProfileRecipients[0].locked).toBe(true);

      act(() => {
        result.current.toggleRecipientLock('alice');
      });

      expect(result.current.newSplitProfileRecipients[0].locked).toBe(false);
    });

    it('does nothing if username not found', () => {
      const { result } = renderHook(() => useSplitProfiles());

      act(() => {
        result.current.addRecipientToList(createMockRecipient({ username: 'alice', locked: false }));
      });

      act(() => {
        result.current.toggleRecipientLock('nonexistent');
      });

      expect(result.current.newSplitProfileRecipients[0].locked).toBe(false);
    });
  });

  describe('callback stability', () => {
    it('resetSplitProfileForm maintains referential equality', () => {
      const { result, rerender } = renderHook(() => useSplitProfiles());
      const firstRef = result.current.resetSplitProfileForm;
      
      rerender();
      
      expect(result.current.resetSplitProfileForm).toBe(firstRef);
    });

    it('startEditingProfile maintains referential equality', () => {
      const { result, rerender } = renderHook(() => useSplitProfiles());
      const firstRef = result.current.startEditingProfile;
      
      rerender();
      
      expect(result.current.startEditingProfile).toBe(firstRef);
    });

    it('clearRecipientValidation maintains referential equality', () => {
      const { result, rerender } = renderHook(() => useSplitProfiles());
      const firstRef = result.current.clearRecipientValidation;
      
      rerender();
      
      expect(result.current.clearRecipientValidation).toBe(firstRef);
    });

    it('addRecipientToList maintains referential equality', () => {
      const { result, rerender } = renderHook(() => useSplitProfiles());
      const firstRef = result.current.addRecipientToList;
      
      rerender();
      
      expect(result.current.addRecipientToList).toBe(firstRef);
    });

    it('removeRecipientFromList maintains referential equality', () => {
      const { result, rerender } = renderHook(() => useSplitProfiles());
      const firstRef = result.current.removeRecipientFromList;
      
      rerender();
      
      expect(result.current.removeRecipientFromList).toBe(firstRef);
    });

    it('updateRecipientWeight maintains referential equality', () => {
      const { result, rerender } = renderHook(() => useSplitProfiles());
      const firstRef = result.current.updateRecipientWeight;
      
      rerender();
      
      expect(result.current.updateRecipientWeight).toBe(firstRef);
    });

    it('toggleRecipientLock maintains referential equality', () => {
      const { result, rerender } = renderHook(() => useSplitProfiles());
      const firstRef = result.current.toggleRecipientLock;
      
      rerender();
      
      expect(result.current.toggleRecipientLock).toBe(firstRef);
    });
  });

  describe('typical workflow scenarios', () => {
    it('handles create new profile workflow', () => {
      const { result } = renderHook(() => useSplitProfiles());

      // User clicks "Create Profile"
      act(() => {
        result.current.setShowCreateSplitProfile(true);
      });

      // User enters profile name
      act(() => {
        result.current.setNewSplitProfileLabel('Team Split');
      });

      // User types recipient
      act(() => {
        result.current.setNewRecipientInput('alice');
      });

      // Validation starts
      act(() => {
        result.current.setRecipientValidation({
          status: 'validating',
          message: 'Validating...',
          isValidating: true,
        });
      });

      // Validation succeeds
      act(() => {
        result.current.setRecipientValidation({
          status: 'success',
          message: 'Valid Blink user',
          isValidating: false,
          type: 'blink',
          address: 'alice',
        });
      });

      // User adds recipient
      act(() => {
        result.current.addRecipientToList(createMockRecipient({ username: 'alice', weight: 100 }));
      });

      // Verify final state
      expect(result.current.newSplitProfileLabel).toBe('Team Split');
      expect(result.current.newSplitProfileRecipients).toHaveLength(1);
      expect(result.current.newRecipientInput).toBe('');
    });

    it('handles edit profile workflow', () => {
      const { result } = renderHook(() => useSplitProfiles());
      const existingProfile = createMockProfile({
        id: 'existing-1',
        label: 'Old Name',
        recipients: [
          createMockRecipient({ username: 'alice', weight: 50 }),
          createMockRecipient({ username: 'bob', weight: 50 }),
        ],
      });

      // Load existing profiles
      act(() => {
        result.current.setSplitProfiles([existingProfile]);
      });

      // User clicks edit
      act(() => {
        result.current.startEditingProfile(existingProfile);
      });

      // User modifies the label
      act(() => {
        result.current.setNewSplitProfileLabel('Updated Name');
      });

      // User removes a recipient
      act(() => {
        result.current.removeRecipientFromList('bob');
      });

      // Verify state
      expect(result.current.editingSplitProfile?.id).toBe('existing-1');
      expect(result.current.newSplitProfileLabel).toBe('Updated Name');
      expect(result.current.newSplitProfileRecipients).toHaveLength(1);
      expect(result.current.showCreateSplitProfile).toBe(true);
    });

    it('handles save error workflow', () => {
      const { result } = renderHook(() => useSplitProfiles());

      // User creates a profile
      act(() => {
        result.current.setShowCreateSplitProfile(true);
        result.current.setNewSplitProfileLabel('My Profile');
        result.current.addRecipientToList(createMockRecipient({ username: 'alice' }));
      });

      // Save fails
      act(() => {
        result.current.setSplitProfileError('Network error: failed to save');
      });

      // Error is displayed
      expect(result.current.splitProfileError).toBe('Network error: failed to save');
      expect(result.current.showCreateSplitProfile).toBe(true);

      // User tries again and clears error
      act(() => {
        result.current.setSplitProfileError(null);
      });

      expect(result.current.splitProfileError).toBeNull();
    });

    it('handles cancel workflow', () => {
      const { result } = renderHook(() => useSplitProfiles());

      // User starts creating
      act(() => {
        result.current.setShowCreateSplitProfile(true);
        result.current.setNewSplitProfileLabel('Partial');
        result.current.addRecipientToList(createMockRecipient({ username: 'alice' }));
      });

      // User cancels
      act(() => {
        result.current.resetSplitProfileForm();
      });

      // Everything should be reset
      expect(result.current.showCreateSplitProfile).toBe(false);
      expect(result.current.newSplitProfileLabel).toBe('');
      expect(result.current.newSplitProfileRecipients).toEqual([]);
    });

    it('handles custom weights workflow', () => {
      const { result } = renderHook(() => useSplitProfiles());

      // Start creating profile
      act(() => {
        result.current.setShowCreateSplitProfile(true);
        result.current.setNewSplitProfileLabel('Custom Weights');
        result.current.addRecipientToList(createMockRecipient({ username: 'alice', weight: 50 }));
        result.current.addRecipientToList(createMockRecipient({ username: 'bob', weight: 50 }));
      });

      // Enable custom weights
      act(() => {
        result.current.setUseCustomWeights(true);
      });

      // Adjust weights
      act(() => {
        result.current.updateRecipientWeight('alice', 70);
        result.current.updateRecipientWeight('bob', 30);
      });

      // Lock alice's weight
      act(() => {
        result.current.toggleRecipientLock('alice');
      });

      // Verify
      expect(result.current.useCustomWeights).toBe(true);
      const alice = result.current.newSplitProfileRecipients.find((r) => r.username === 'alice');
      const bob = result.current.newSplitProfileRecipients.find((r) => r.username === 'bob');
      expect(alice?.weight).toBe(70);
      expect(alice?.locked).toBe(true);
      expect(bob?.weight).toBe(30);
      expect(bob?.locked).toBe(false);
    });

    it('handles recipient validation failure workflow', () => {
      const { result } = renderHook(() => useSplitProfiles());

      // User types invalid recipient
      act(() => {
        result.current.setNewRecipientInput('invalid-user');
      });

      // Validation starts
      act(() => {
        result.current.setRecipientValidation({
          status: 'validating',
          message: 'Checking...',
          isValidating: true,
        });
      });

      // Validation fails
      act(() => {
        result.current.setRecipientValidation({
          status: 'error',
          message: 'User not found',
          isValidating: false,
        });
      });

      // Error is shown
      expect(result.current.recipientValidation.status).toBe('error');
      expect(result.current.recipientValidation.message).toBe('User not found');

      // User clears and tries again
      act(() => {
        result.current.setNewRecipientInput('');
        result.current.clearRecipientValidation();
      });

      expect(result.current.newRecipientInput).toBe('');
      expect(result.current.recipientValidation.status).toBeNull();
    });
  });
});
