import { useState, useEffect, useCallback, forwardRef, useImperativeHandle, useMemo } from 'react';
import { bech32 } from 'bech32';

/**
 * Network Component - Bitcoin Circular Economy Dashboard
 * 
 * Views:
 * 1. Discovery - Browse and join communities
 * 2. My Communities - View communities user is part of
 * 3. Community Dashboard - Metrics, leaderboard, activity for a community
 * 4. Leader Dashboard - Manage applications (if user is a leader)
 * 5. Create Community - Create new community (whitelisted leaders only)
 */

/**
 * Convert hex public key to npub format
 * @param {string} hexPubkey - 64 character hex public key
 * @returns {string|null} - npub encoded key or null if invalid
 */
function hexToNpub(hexPubkey) {
  if (!hexPubkey || typeof hexPubkey !== 'string') return null;
  
  // If already npub format, return as-is
  if (hexPubkey.startsWith('npub1')) return hexPubkey;
  
  // Validate hex format (64 characters)
  if (!/^[0-9a-fA-F]{64}$/.test(hexPubkey)) return null;
  
  try {
    // Convert hex to bytes
    const bytes = [];
    for (let i = 0; i < hexPubkey.length; i += 2) {
      bytes.push(parseInt(hexPubkey.substr(i, 2), 16));
    }
    
    // Encode as bech32 with 'npub' prefix
    const words = bech32.toWords(new Uint8Array(bytes));
    return bech32.encode('npub', words);
  } catch (e) {
    console.error('Error converting hex to npub:', e);
    return null;
  }
}

const Network = forwardRef(({ 
  publicKey,  // Nostr public key (hex or npub format)
  nostrProfile, // Nostr profile with picture, name, display_name
  darkMode, 
  toggleDarkMode,
  onInternalTransition 
}, ref) => {
  // Convert publicKey (hex) to npub format for API calls
  const npubKey = useMemo(() => hexToNpub(publicKey), [publicKey]);
  
  // View state
  const [currentView, setCurrentView] = useState('discovery'); // discovery, my-communities, community, leader, create
  const [selectedCommunity, setSelectedCommunity] = useState(null);
  
  // Data state
  const [communities, setCommunities] = useState([]);
  const [myMemberships, setMyMemberships] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [pendingApplications, setPendingApplications] = useState([]);
  const [leaderProfiles, setLeaderProfiles] = useState({}); // npub -> profile data
  const [userConsents, setUserConsents] = useState({}); // communityId -> consent data
  
  // UI state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Consent modal state
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [consentCommunity, setConsentCommunity] = useState(null);
  const [consentApiKey, setConsentApiKey] = useState('');
  const [submittingConsent, setSubmittingConsent] = useState(false);
  
  // Sync state
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  
  // Period filter state
  const [selectedPeriod, setSelectedPeriod] = useState('current_week');
  const [periodMetrics, setPeriodMetrics] = useState(null);
  const [dataCoverage, setDataCoverage] = useState(null);
  const [coverageWarning, setCoverageWarning] = useState(null);
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isWhitelistedLeader, setIsWhitelistedLeader] = useState(false);
  const [userRole, setUserRole] = useState('user'); // super_admin, community_leader, user
  
  // Application form state
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [applicationNote, setApplicationNote] = useState('');
  const [applyingTo, setApplyingTo] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Fetch communities on mount
  useEffect(() => {
    fetchCommunities();
    if (npubKey) {
      fetchMyMemberships();
      checkWhitelistStatus();
      fetchPendingApplications(); // For leaders to see pending applications
      fetchUserConsents(); // Check user's data sharing consents
    }
  }, [npubKey]);

  // Fetch leaderboard data
  useEffect(() => {
    fetchLeaderboard();
  }, []);

  // Fetch period metrics when community or period changes
  useEffect(() => {
    if (selectedCommunity?.id && currentView === 'community') {
      fetchPeriodMetrics(selectedCommunity.id, selectedPeriod);
    }
  }, [selectedCommunity?.id, selectedPeriod, currentView]);

  const fetchCommunities = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/network/communities');
      const data = await response.json();
      
      if (data.success) {
        const communitiesList = data.communities || [];
        setCommunities(communitiesList);
        
        // Fetch leader profiles for all communities
        fetchLeaderProfiles(communitiesList);
      } else {
        throw new Error(data.error || 'Failed to fetch communities');
      }
    } catch (err) {
      console.error('Error fetching communities:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Fetch Nostr profiles for community leaders
  const fetchLeaderProfiles = async (communitiesList) => {
    const uniqueLeaders = [...new Set(communitiesList.map(c => c.leader_npub).filter(Boolean))];
    
    for (const leaderNpub of uniqueLeaders) {
      // Skip if already fetched
      if (leaderProfiles[leaderNpub]) continue;
      
      try {
        const response = await fetch(`/api/network/profiles?npub=${encodeURIComponent(leaderNpub)}`);
        const data = await response.json();
        
        if (data.success && data.profile) {
          setLeaderProfiles(prev => ({
            ...prev,
            [leaderNpub]: data.profile
          }));
        }
      } catch (err) {
        console.error(`Error fetching profile for ${leaderNpub}:`, err);
      }
    }
  };

  // Fetch user's consent status for all communities
  const fetchUserConsents = async () => {
    if (!npubKey) return;
    
    try {
      const response = await fetch('/api/network/consent', {
        headers: {
          'X-User-Npub': npubKey
        }
      });
      const data = await response.json();
      
      if (data.success && data.consents) {
        const consentsMap = {};
        data.consents.forEach(c => {
          consentsMap[c.community_id] = c;
        });
        setUserConsents(consentsMap);
      }
    } catch (err) {
      console.error('Error fetching consents:', err);
    }
  };

  // Submit data sharing consent
  const submitConsent = async () => {
    if (!npubKey || !consentCommunity || !consentApiKey) return;
    
    setSubmittingConsent(true);
    setError('');
    
    try {
      const response = await fetch('/api/network/consent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Npub': npubKey
        },
        body: JSON.stringify({
          communityId: consentCommunity.id,
          apiKey: consentApiKey
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Update local state
        setUserConsents(prev => ({
          ...prev,
          [consentCommunity.id]: {
            ...data.consent,
            community_id: consentCommunity.id,
            status: 'active'
          }
        }));
        
        setShowConsentModal(false);
        setConsentCommunity(null);
        setConsentApiKey('');
      } else {
        throw new Error(data.error || 'Failed to submit consent');
      }
    } catch (err) {
      console.error('Error submitting consent:', err);
      setError(err.message);
    } finally {
      setSubmittingConsent(false);
    }
  };

  // Revoke data sharing consent
  const revokeConsent = async (communityId) => {
    if (!npubKey) return;
    
    try {
      const response = await fetch(`/api/network/consent?communityId=${communityId}`, {
        method: 'DELETE',
        headers: {
          'X-User-Npub': npubKey
        }
      });
      
      const data = await response.json();
      
      if (data.success) {
        setUserConsents(prev => {
          const updated = { ...prev };
          if (updated[communityId]) {
            updated[communityId] = { ...updated[communityId], status: 'revoked' };
          }
          return updated;
        });
      }
    } catch (err) {
      console.error('Error revoking consent:', err);
    }
  };

  // Open consent modal
  const openConsentModal = (community) => {
    setConsentCommunity(community);
    setConsentApiKey('');
    setError('');
    setShowConsentModal(true);
  };

  // Fetch metrics for a specific period
  const fetchPeriodMetrics = async (communityId, period) => {
    if (!communityId) return;
    
    setLoadingMetrics(true);
    try {
      const response = await fetch(
        `/api/network/metrics?communityId=${communityId}&period=${period}`
      );
      const data = await response.json();
      
      if (data.success) {
        setPeriodMetrics(data.metrics);
        setDataCoverage(data.data_coverage);
        setCoverageWarning(data.coverage_warning);
      }
    } catch (err) {
      console.error('Error fetching period metrics:', err);
    } finally {
      setLoadingMetrics(false);
    }
  };

  // Trigger data sync for a community
  const triggerSync = async (communityId) => {
    if (!npubKey || syncing) return;
    
    setSyncing(true);
    setSyncResult(null);
    setError('');
    
    try {
      const response = await fetch('/api/network/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Npub': npubKey
        },
        body: JSON.stringify({ communityId })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setSyncResult(data);
        // Refresh communities to get updated metrics and update selectedCommunity
        const commResponse = await fetch('/api/network/communities');
        const commData = await commResponse.json();
        if (commData.success) {
          setCommunities(commData.communities || []);
          // Update selectedCommunity with fresh data
          const updated = commData.communities.find(c => c.id === communityId);
          if (updated) {
            setSelectedCommunity(updated);
          }
        }
      } else {
        throw new Error(data.error || 'Sync failed');
      }
    } catch (err) {
      console.error('Error syncing:', err);
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  };

  const fetchMyMemberships = async () => {
    if (!npubKey) return;
    
    try {
      const response = await fetch('/api/network/memberships', {
        headers: {
          'X-User-Npub': npubKey
        }
      });
      const data = await response.json();
      
      if (data.success) {
        setMyMemberships(data.memberships || []);
      }
    } catch (err) {
      console.error('Error fetching memberships:', err);
    }
  };

  const fetchLeaderboard = async (period = 'current_month') => {
    try {
      const response = await fetch(`/api/network/leaderboard?period=${period}&sortBy=volume`);
      const data = await response.json();
      
      if (data.success) {
        setLeaderboard(data.leaderboard || []);
      }
    } catch (err) {
      console.error('Error fetching leaderboard:', err);
    }
  };


  const checkWhitelistStatus = async () => {
    if (!npubKey) return;
    
    try {
      const response = await fetch('/api/network/whitelist/check', {
        headers: {
          'X-User-Npub': npubKey
        }
      });
      const data = await response.json();
      setIsSuperAdmin(data.isSuperAdmin || false);
      setIsWhitelistedLeader(data.isWhitelisted || false);
      setUserRole(data.role || 'user');
    } catch (err) {
      console.error('Error checking whitelist status:', err);
    }
  };

  // Fetch pending applications for leaders
  const fetchPendingApplications = async (communityId = null) => {
    if (!npubKey) return;
    
    try {
      const url = communityId 
        ? `/api/network/memberships/pending?communityId=${communityId}`
        : '/api/network/memberships/pending';
        
      const response = await fetch(url, {
        headers: {
          'X-User-Npub': npubKey
        }
      });
      const data = await response.json();
      
      if (data.success) {
        setPendingApplications(data.applications || []);
      }
    } catch (err) {
      console.error('Error fetching pending applications:', err);
    }
  };

  const handleApplyToJoin = async (community) => {
    setApplyingTo(community);
    setShowApplyModal(true);
    setApplicationNote('');
  };

  const submitApplication = async () => {
    if (!applyingTo || !npubKey) return;
    
    setSubmitting(true);
    setError('');
    
    try {
      const response = await fetch('/api/network/memberships/apply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Npub': npubKey
        },
        body: JSON.stringify({
          communityId: applyingTo.id,
          applicationNote
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Add the pending membership to local state immediately
        const newMembership = {
          id: data.membership.id,
          community_id: applyingTo.id,
          community_name: applyingTo.name,
          community_slug: applyingTo.slug,
          role: 'member',
          status: 'pending',
          applied_at: data.membership.applied_at
        };
        setMyMemberships(prev => [...prev, newMembership]);
        
        setShowApplyModal(false);
        setApplyingTo(null);
        setApplicationNote('');
      } else if (response.status === 409) {
        // Already has pending application
        setError('You already have a pending application for this community');
      } else {
        throw new Error(data.error || 'Failed to submit application');
      }
    } catch (err) {
      console.error('Error submitting application:', err);
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Review application (approve/reject)
  const [reviewingId, setReviewingId] = useState(null);
  const [reviewSuccess, setReviewSuccess] = useState(null);
  
  const reviewApplication = async (applicationId, action) => {
    if (!npubKey || reviewingId) return;
    
    setReviewingId(applicationId);
    setError('');
    setReviewSuccess(null);
    
    console.log(`[Network] Reviewing application ${applicationId} with action: ${action}`);
    
    try {
      const response = await fetch('/api/network/memberships/review', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Npub': npubKey
        },
        body: JSON.stringify({
          applicationId,
          action
        })
      });
      
      console.log(`[Network] Review response status: ${response.status}`);
      
      const data = await response.json();
      console.log(`[Network] Review response data:`, data);
      
      if (data.success) {
        // Remove the application from the list
        setPendingApplications(prev => prev.filter(app => app.id !== applicationId));
        
        // Show success feedback
        setReviewSuccess(action === 'approve' ? 'Member approved!' : 'Application rejected');
        setTimeout(() => setReviewSuccess(null), 3000);
        
        console.log(`[Network] Application ${action}ed successfully`);
      } else {
        throw new Error(data.error || `Failed to ${action} application`);
      }
    } catch (err) {
      console.error(`[Network] Error ${action}ing application:`, err);
      setError(err.message || `Failed to ${action} application`);
    } finally {
      setReviewingId(null);
    }
  };

  const navigateToView = (view, community = null) => {
    if (onInternalTransition) onInternalTransition();
    setSelectedCommunity(community);
    setCurrentView(view);
  };

  // Expose methods for keyboard navigation
  useImperativeHandle(ref, () => ({
    getCurrentView: () => currentView,
    navigateBack: () => {
      if (currentView !== 'discovery') {
        navigateToView('discovery');
        return true;
      }
      return false;
    }
  }));

  // Filter communities based on search
  const filteredCommunities = communities.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.city?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.country_code?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Get membership info for a community
  const getMembershipInfo = (communityId) => {
    const membership = myMemberships.find(m => m.community_id === communityId);
    return membership || null;
  };

  // Get membership status for a community (backwards compatibility)
  const getMembershipStatus = (communityId) => {
    const membership = getMembershipInfo(communityId);
    return membership?.status || null;
  };

  // Get role badge color and text
  const getRoleBadge = (role) => {
    switch (role) {
      case 'leader':
        return { bg: 'bg-purple-100 dark:bg-purple-900', text: 'text-purple-700 dark:text-purple-300', label: 'Leader' };
      case 'admin':
        return { bg: 'bg-blue-100 dark:bg-blue-900', text: 'text-blue-700 dark:text-blue-300', label: 'Admin' };
      default:
        return { bg: 'bg-green-100 dark:bg-green-900', text: 'text-green-700 dark:text-green-300', label: 'Member' };
    }
  };

  // Render loading state
  if (loading && communities.length === 0) {
    return (
      <div className="h-full flex flex-col bg-white dark:bg-black" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-teal-500 border-t-transparent mb-4"></div>
            <div className="text-lg text-gray-600 dark:text-gray-400">Loading Network...</div>
          </div>
        </div>
      </div>
    );
  }

  // ============================================
  // DISCOVERY VIEW
  // ============================================
  if (currentView === 'discovery') {
    return (
      <div className="h-full flex flex-col bg-white dark:bg-black overflow-hidden" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
        {/* Header */}
        <div className="px-4 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Bitcoin Circular Economies
              </h1>
              {isSuperAdmin && (
                <span className="text-xs text-purple-600 dark:text-purple-400 font-medium">
                  Super Admin
                </span>
              )}
            </div>
            {isSuperAdmin && (
              <button
                onClick={() => navigateToView('create')}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium"
              >
                + Add Community
              </button>
            )}
          </div>
          
          {/* Tab Navigation */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => navigateToView('discovery')}
              className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium"
            >
              Discover
            </button>
            <button
              onClick={() => navigateToView('my-communities')}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 text-sm font-medium"
            >
              My Communities ({myMemberships.filter(m => m.status === 'approved').length})
            </button>
          </div>
          
          {/* Search */}
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search communities..."
              className="w-full px-4 py-3 pl-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-blink-dark text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>

        {/* Community List */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {error && (
            <div className="mb-4 bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-200 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {filteredCommunities.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">🌍</div>
              <p className="text-gray-600 dark:text-gray-400 text-lg">
                {searchQuery ? 'No communities found' : 'No communities yet'}
              </p>
              <p className="text-gray-500 dark:text-gray-500 text-sm mt-2">
                {searchQuery ? 'Try a different search term' : 'Be the first to create one!'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredCommunities.map((community) => {
                const membership = getMembershipInfo(community.id);
                const membershipStatus = membership?.status || null;
                const roleBadge = membership ? getRoleBadge(membership.role) : null;
                
                return (
                  <div
                    key={community.id}
                    className="bg-gray-50 dark:bg-blink-dark rounded-lg p-4 border border-gray-200 dark:border-gray-700"
                  >
                    <div className="flex items-start gap-3">
                      {/* Community Leader Avatar */}
                      <div className="flex-shrink-0">
                        {leaderProfiles[community.leader_npub]?.picture ? (
                          <img 
                            src={leaderProfiles[community.leader_npub].picture}
                            alt={leaderProfiles[community.leader_npub]?.name || community.name}
                            className="w-12 h-12 rounded-full object-cover ring-2 ring-purple-500/30"
                            onError={(e) => {
                              // Fallback to initial on error
                              e.target.style.display = 'none';
                              e.target.nextElementSibling.style.display = 'flex';
                            }}
                          />
                        ) : null}
                        <div 
                          className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-teal-500 flex items-center justify-center text-white font-bold text-lg"
                          style={{ display: leaderProfiles[community.leader_npub]?.picture ? 'none' : 'flex' }}
                        >
                          {community.name.charAt(0)}
                        </div>
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
                            {community.name}
                          </h3>
                          {membershipStatus === 'approved' && roleBadge && (
                            <span className={`px-2 py-0.5 ${roleBadge.bg} ${roleBadge.text} text-xs rounded-full flex-shrink-0`}>
                              {roleBadge.label}
                            </span>
                          )}
                          {membershipStatus === 'pending' && (
                            <span className="px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300 text-xs rounded-full flex-shrink-0">
                              Pending
                            </span>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          <span>{community.city || community.region || 'Location not set'}</span>
                          {community.country_code && (
                            <span className="text-gray-400">• {community.country_code}</span>
                          )}
                        </div>
                        
                        {community.description && (
                          <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mb-3">
                            {community.description}
                          </p>
                        )}
                        
                        {/* Stats Row */}
                        <div className="flex items-center gap-4 text-sm">
                          <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                            <span>{community.member_count || 0} members</span>
                          </div>
                          {community.transaction_volume_sats > 0 && (
                            <div className="flex items-center gap-1 text-teal-600 dark:text-teal-400">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                              </svg>
                              <span>{(community.transaction_volume_sats || 0).toLocaleString()} sats</span>
                            </div>
                          )}
                          {community.tx_count_growth_percent > 0 && (
                            <div className="text-green-600 dark:text-green-400 text-sm font-medium">
                              +{community.tx_count_growth_percent.toFixed(1)}% growth
                            </div>
                          )}
                        </div>
                        
                        {/* Action Button - Inline for mobile-friendly layout */}
                        <div className="mt-3 flex justify-end">
                          {membershipStatus === 'approved' ? (
                            <button
                              onClick={() => navigateToView('community', community)}
                              className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm font-medium"
                            >
                              View
                            </button>
                          ) : membershipStatus === 'pending' ? (
                            <button
                              disabled
                              className="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 rounded-lg cursor-not-allowed text-sm font-medium"
                            >
                              Applied
                            </button>
                          ) : (
                            <button
                              onClick={() => handleApplyToJoin(community)}
                              className="px-4 py-2 border-2 border-teal-600 text-teal-600 dark:text-teal-400 rounded-lg hover:bg-teal-50 dark:hover:bg-teal-900 transition-colors text-sm font-medium"
                            >
                              Join
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Leaderboard Section */}
        {leaderboard.length > 0 && (
          <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-4">
            <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-3">
              🏆 Community Leaderboard
            </h3>
            <div className="space-y-3">
              {leaderboard.map((c) => (
                <div
                  key={c.id}
                  className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`font-bold text-lg ${
                        c.rank === 1 ? 'text-yellow-500' :
                        c.rank === 2 ? 'text-gray-400' :
                        c.rank === 3 ? 'text-amber-600' :
                        'text-gray-500 dark:text-gray-400'
                      }`}>
                        #{c.rank}
                      </span>
                      <span className="font-semibold text-gray-800 dark:text-white">{c.name}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {c.country_code === 'ZA' ? '🇿🇦' : c.country_code === 'ZW' ? '🇿🇼' : '🌍'}
                      </span>
                    </div>
                    {c.milestones?.length > 0 && (
                      <div className="flex gap-1">
                        {c.milestones.slice(0, 3).map((m, i) => (
                          <span key={i} title={m.label} className="text-sm">{m.badge}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center text-xs">
                    <div>
                      <div className="font-bold text-teal-600 dark:text-teal-400">{c.member_count}</div>
                      <div className="text-gray-500">Members</div>
                    </div>
                    <div>
                      <div className="font-bold text-blue-600 dark:text-blue-400">{c.transaction_count}</div>
                      <div className="text-gray-500">Txs</div>
                    </div>
                    <div>
                      <div className="font-bold text-purple-600 dark:text-purple-400">
                        {c.transaction_volume_sats >= 1000 
                          ? `${(c.transaction_volume_sats / 1000).toFixed(1)}k` 
                          : c.transaction_volume_sats}
                      </div>
                      <div className="text-gray-500">Sats</div>
                    </div>
                    <div>
                      <div className="font-bold text-green-600 dark:text-green-400">{c.closed_loop_ratio}%</div>
                      <div className="text-gray-500">Loop</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Apply Modal */}
        {showApplyModal && applyingTo && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-md w-full p-6">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                Join {applyingTo.name}
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Your application will be reviewed by the community leader.
              </p>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Message to Leader (optional)
                </label>
                <textarea
                  value={applicationNote}
                  onChange={(e) => setApplicationNote(e.target.value)}
                  placeholder="Introduce yourself or explain why you want to join..."
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-blink-dark text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              
              {error && (
                <div className="mb-4 text-sm text-red-600 dark:text-red-400">
                  {error}
                </div>
              )}
              
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowApplyModal(false);
                    setApplyingTo(null);
                    setError('');
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={submitApplication}
                  disabled={submitting}
                  className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Applying...' : 'Apply'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Data Sharing Consent Modal */}
        {showConsentModal && consentCommunity && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-md w-full p-6">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                📊 Share Transaction Data
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Help {consentCommunity.name} track community metrics by sharing your Blink transaction history.
              </p>
              
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 mb-4">
                <h4 className="font-medium text-blue-800 dark:text-blue-300 mb-2">What we'll access:</h4>
                <ul className="text-sm text-blue-700 dark:text-blue-400 space-y-1">
                  <li>• Transaction amounts and dates</li>
                  <li>• Counterparty info (to detect internal trades)</li>
                  <li>• Used for community metrics only</li>
                </ul>
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Blink API Key (READ-only)
                </label>
                <input
                  type="password"
                  value={consentApiKey}
                  onChange={(e) => setConsentApiKey(e.target.value)}
                  placeholder="blink_xxxxx..."
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-blink-dark text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono text-sm"
                />
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Get your API key from <a href="https://dashboard.blink.sv" target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline">dashboard.blink.sv</a> → API Keys
                </p>
              </div>
              
              {error && (
                <div className="mb-4 text-sm text-red-600 dark:text-red-400">
                  {error}
                </div>
              )}
              
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowConsentModal(false);
                    setConsentCommunity(null);
                    setConsentApiKey('');
                    setError('');
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={submitConsent}
                  disabled={submittingConsent || !consentApiKey}
                  className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50"
                >
                  {submittingConsent ? 'Sharing...' : 'Share Data'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================================
  // MY COMMUNITIES VIEW
  // ============================================
  if (currentView === 'my-communities') {
    const approvedMemberships = myMemberships.filter(m => m.status === 'approved');
    const pendingMemberships = myMemberships.filter(m => m.status === 'pending');
    
    return (
      <div className="h-full flex flex-col bg-white dark:bg-black overflow-hidden" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
        {/* Header */}
        <div className="px-4 py-4 border-b border-gray-200 dark:border-gray-700">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            My Communities
          </h1>
          
          {/* Tab Navigation */}
          <div className="flex gap-2">
            <button
              onClick={() => navigateToView('discovery')}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 text-sm font-medium"
            >
              Discover
            </button>
            <button
              onClick={() => navigateToView('my-communities')}
              className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium"
            >
              My Communities ({approvedMemberships.length})
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {/* Pending Applications */}
          {pendingMemberships.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-yellow-600 dark:text-yellow-400 mb-3">
                Pending Applications ({pendingMemberships.length})
              </h3>
              <div className="space-y-3">
                {pendingMemberships.map((m) => (
                  <div
                    key={m.id}
                    className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium text-gray-900 dark:text-white">
                          {m.community_name}
                        </h4>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          Applied {new Date(m.applied_at).toLocaleDateString()}
                        </p>
                      </div>
                      <span className="px-3 py-1 bg-yellow-100 dark:bg-yellow-800 text-yellow-700 dark:text-yellow-300 text-sm rounded-full">
                        Pending
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Active Memberships */}
          {approvedMemberships.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">🤝</div>
              <p className="text-gray-600 dark:text-gray-400 text-lg">
                You haven't joined any communities yet
              </p>
              <button
                onClick={() => navigateToView('discovery')}
                className="mt-4 px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
              >
                Browse Communities
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                Active Memberships
              </h3>
              {approvedMemberships.map((m) => {
                const roleBadge = getRoleBadge(m.role);
                const community = communities.find(c => c.id === m.community_id);
                const leaderNpub = community?.leader_npub;
                const leaderProfile = leaderNpub ? leaderProfiles[leaderNpub] : null;
                
                return (
                  <div
                    key={m.id}
                    onClick={() => {
                      navigateToView('community', community || {
                        id: m.community_id,
                        name: m.community_name,
                        slug: m.community_slug
                      });
                    }}
                    className="bg-gray-50 dark:bg-blink-dark rounded-lg p-4 border border-gray-200 dark:border-gray-700 cursor-pointer hover:border-teal-500 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {/* Community Avatar */}
                      <div className="flex-shrink-0">
                        {leaderProfile?.picture ? (
                          <img 
                            src={leaderProfile.picture}
                            alt={leaderProfile?.name || m.community_name}
                            className="w-10 h-10 rounded-full object-cover ring-2 ring-purple-500/30"
                            onError={(e) => {
                              e.target.style.display = 'none';
                              e.target.nextElementSibling.style.display = 'flex';
                            }}
                          />
                        ) : null}
                        <div 
                          className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-teal-500 flex items-center justify-center text-white font-bold text-sm"
                          style={{ display: leaderProfile?.picture ? 'none' : 'flex' }}
                        >
                          {m.community_name?.charAt(0) || '?'}
                        </div>
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-gray-900 dark:text-white truncate">
                          {m.community_name}
                        </h4>
                        <div className="flex items-center gap-3 mt-1 text-sm text-gray-500 dark:text-gray-400">
                          <span>{m.member_count || 0} members</span>
                          <span className={`px-2 py-0.5 ${roleBadge.bg} ${roleBadge.text} text-xs rounded-full`}>
                            {roleBadge.label}
                          </span>
                        </div>
                      </div>
                      
                      <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ============================================
  // COMMUNITY DASHBOARD VIEW
  // ============================================
  if (currentView === 'community' && selectedCommunity) {
    const membership = myMemberships.find(m => m.community_id === selectedCommunity.id);
    const isLeader = membership?.role === 'leader';
    
    return (
      <div className="h-full flex flex-col bg-white dark:bg-black overflow-hidden" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
        {/* Header */}
        <div className="px-4 py-4 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => navigateToView('my-communities')}
            className="flex items-center text-gray-600 dark:text-gray-400 hover:text-teal-600 dark:hover:text-teal-400 mb-3"
          >
            <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              {/* Leader Profile Image */}
              <div className="flex-shrink-0">
                {leaderProfiles[selectedCommunity.leader_npub]?.picture ? (
                  <img 
                    src={leaderProfiles[selectedCommunity.leader_npub].picture}
                    alt={leaderProfiles[selectedCommunity.leader_npub]?.name || selectedCommunity.name}
                    className="w-14 h-14 rounded-full object-cover ring-2 ring-purple-500/30"
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.nextElementSibling.style.display = 'flex';
                    }}
                  />
                ) : null}
                <div 
                  className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-500 to-teal-500 flex items-center justify-center text-white font-bold text-xl"
                  style={{ display: leaderProfiles[selectedCommunity.leader_npub]?.picture ? 'none' : 'flex' }}
                >
                  {selectedCommunity.name.charAt(0)}
                </div>
              </div>
              
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {selectedCommunity.name}
                </h1>
                <p className="text-gray-500 dark:text-gray-400 text-sm">
                  {selectedCommunity.city || selectedCommunity.region}
                  {selectedCommunity.country_code && ` • ${selectedCommunity.country_code}`}
                </p>
              </div>
            </div>
            {isLeader && (
              <button
                onClick={() => navigateToView('leader', selectedCommunity)}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium"
              >
                Manage
              </button>
            )}
          </div>
        </div>

        {/* Period Selector */}
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Period:</span>
            <div className="flex gap-1">
              {[
                { value: 'current_week', label: 'This Week' },
                { value: 'last_week', label: 'Last Week' },
                { value: 'current_month', label: 'This Month' },
                { value: 'last_month', label: 'Last Month' },
              ].map(p => (
                <button
                  key={p.value}
                  onClick={() => setSelectedPeriod(p.value)}
                  className={`px-2 py-1 text-xs rounded-lg transition-colors ${
                    selectedPeriod === p.value
                      ? 'bg-teal-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          {periodMetrics && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
              {periodMetrics.period_label}: {new Date(periodMetrics.period_start).toLocaleDateString()} - {new Date(periodMetrics.period_end).toLocaleDateString()}
            </p>
          )}
          
          {/* Coverage Warning */}
          {coverageWarning && (
            <div className="mt-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <p className="text-xs text-amber-700 dark:text-amber-300 text-center">
                ⚠️ {coverageWarning.message}
              </p>
            </div>
          )}
          
          {/* Data Coverage Info */}
          {dataCoverage && dataCoverage.oldest_transaction && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 text-center">
              📊 Synced data: {new Date(dataCoverage.oldest_transaction).toLocaleDateString()} - {new Date(dataCoverage.newest_transaction).toLocaleDateString()} ({dataCoverage.total_synced_transactions} txs)
            </p>
          )}
        </div>

        {/* Stats Cards */}
        <div className="px-4 py-4 grid grid-cols-2 gap-4">
          <div className="bg-teal-50 dark:bg-teal-900/20 rounded-lg p-4">
            <div className="text-3xl font-bold text-teal-600 dark:text-teal-400">
              {selectedCommunity.member_count || 0}
            </div>
            <div className="text-sm text-teal-700 dark:text-teal-300">Members</div>
          </div>
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
            <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
              {selectedCommunity.data_sharing_member_count || 0}
            </div>
            <div className="text-sm text-blue-700 dark:text-blue-300">Sharing Data</div>
          </div>
          {/* Period-based metrics */}
          {periodMetrics && periodMetrics.transaction_count > 0 ? (
            <>
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                  {periodMetrics.transaction_count?.toLocaleString() || 0}
                </div>
                <div className="text-sm text-green-700 dark:text-green-300">Transactions</div>
              </div>
              <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4">
                <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                  {(periodMetrics.total_volume_sats || 0).toLocaleString()}
                </div>
                <div className="text-sm text-purple-700 dark:text-purple-300">Volume (sats)</div>
              </div>
              <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4">
                <div className="text-3xl font-bold text-orange-600 dark:text-orange-400">
                  {periodMetrics.closed_loop_ratio || 0}%
                </div>
                <div className="text-sm text-orange-700 dark:text-orange-300">Closed Loop</div>
              </div>
              <div className="bg-pink-50 dark:bg-pink-900/20 rounded-lg p-4">
                <div className="text-3xl font-bold text-pink-600 dark:text-pink-400">
                  {periodMetrics.velocity || 0}
                </div>
                <div className="text-sm text-pink-700 dark:text-pink-300">Txs/Member</div>
              </div>
            </>
          ) : periodMetrics && periodMetrics.total_synced_txs > 0 ? (
            <div className="col-span-2 text-center py-4 text-gray-500 dark:text-gray-400">
              <p className="text-sm">No transactions in this period</p>
              <p className="text-xs mt-1">({periodMetrics.total_synced_txs} total synced transactions)</p>
            </div>
          ) : loadingMetrics ? (
            <div className="col-span-2 text-center py-4 text-gray-500 dark:text-gray-400">
              Loading metrics...
            </div>
          ) : null}
        </div>

        {/* Data Sharing Opt-in Banner */}
        {membership && userConsents[selectedCommunity.id]?.status !== 'active' && (
          <div className="mx-4 mb-4 bg-gradient-to-r from-teal-500 to-blue-600 rounded-lg p-4 text-white">
            <div className="flex items-start gap-3">
              <div className="text-2xl">📊</div>
              <div className="flex-1">
                <h3 className="font-semibold mb-1">Help grow community metrics!</h3>
                <p className="text-sm text-white/90 mb-3">
                  Share your Blink transaction data to contribute to community statistics like volume, velocity, and growth.
                </p>
                <button
                  onClick={() => openConsentModal(selectedCommunity)}
                  className="px-4 py-2 bg-white text-teal-600 rounded-lg font-medium text-sm hover:bg-white/90 transition-colors"
                >
                  Share My Data
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Data Sharing Status */}
        {userConsents[selectedCommunity.id]?.status === 'active' && (
          <div className="mx-4 mb-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-green-600 dark:text-green-400">✓</span>
                <span className="text-green-700 dark:text-green-300 font-medium">Data Sharing Active</span>
                {userConsents[selectedCommunity.id].blink_username && (
                  <span className="text-green-600 dark:text-green-400 text-sm">
                    (@{userConsents[selectedCommunity.id].blink_username})
                  </span>
                )}
              </div>
              <button
                onClick={() => revokeConsent(selectedCommunity.id)}
                className="text-sm text-red-600 dark:text-red-400 hover:underline"
              >
                Revoke
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4">
          {selectedCommunity.description && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">
                About
              </h3>
              <p className="text-gray-700 dark:text-gray-300">
                {selectedCommunity.description}
              </p>
            </div>
          )}

          {/* Growth Chart Placeholder */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-3">
              Monthly Growth
            </h3>
            <div className="bg-gray-50 dark:bg-blink-dark rounded-lg p-6 text-center border border-gray-200 dark:border-gray-700">
              <div className="text-5xl mb-2">📈</div>
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                Growth charts will appear as more data is collected
              </p>
            </div>
          </div>

        </div>

        {/* Data Sharing Consent Modal */}
        {showConsentModal && consentCommunity && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-md w-full p-6">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                📊 Share Transaction Data
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Help {consentCommunity.name} track community metrics by sharing your Blink transaction history.
              </p>
              
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 mb-4">
                <h4 className="font-medium text-blue-800 dark:text-blue-300 mb-2">What we'll access:</h4>
                <ul className="text-sm text-blue-700 dark:text-blue-400 space-y-1">
                  <li>• Transaction amounts and dates</li>
                  <li>• Counterparty info (to detect internal trades)</li>
                  <li>• Used for community metrics only</li>
                </ul>
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Blink API Key (READ-only)
                </label>
                <input
                  type="password"
                  value={consentApiKey}
                  onChange={(e) => setConsentApiKey(e.target.value)}
                  placeholder="blink_xxxxx..."
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-blink-dark text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono text-sm"
                />
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Get your API key from <a href="https://dashboard.blink.sv" target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline">dashboard.blink.sv</a> → API Keys
                </p>
              </div>
              
              {error && (
                <div className="mb-4 text-sm text-red-600 dark:text-red-400">
                  {error}
                </div>
              )}
              
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowConsentModal(false);
                    setConsentCommunity(null);
                    setConsentApiKey('');
                    setError('');
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={submitConsent}
                  disabled={submittingConsent || !consentApiKey}
                  className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50"
                >
                  {submittingConsent ? 'Sharing...' : 'Share Data'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================================
  // LEADER DASHBOARD VIEW
  // ============================================
  if (currentView === 'leader' && selectedCommunity) {
    // Filter applications for this community
    const communityApplications = pendingApplications.filter(
      app => app.community_id === selectedCommunity.id
    );
    
    // Calculate time ago for applications
    const getTimeAgo = (dateStr) => {
      const applied = new Date(dateStr);
      const now = new Date();
      const hoursAgo = (now - applied) / (1000 * 60 * 60);
      if (hoursAgo < 1) return 'Just now';
      if (hoursAgo < 24) return `${Math.round(hoursAgo)} hours ago`;
      return `${Math.round(hoursAgo / 24)} days ago`;
    };
    
    return (
      <div className="h-full flex flex-col bg-white dark:bg-black overflow-hidden" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
        {/* Header */}
        <div className="px-4 py-4 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => navigateToView('community', selectedCommunity)}
            className="flex items-center text-gray-600 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 mb-3"
          >
            <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
            Back to Dashboard
          </button>
          
          <div className="flex items-center gap-3">
            {/* Leader Profile Image */}
            <div className="flex-shrink-0">
              {leaderProfiles[selectedCommunity.leader_npub]?.picture ? (
                <img 
                  src={leaderProfiles[selectedCommunity.leader_npub].picture}
                  alt={selectedCommunity.name}
                  className="w-12 h-12 rounded-full object-cover ring-2 ring-purple-500/30"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.nextElementSibling.style.display = 'flex';
                  }}
                />
              ) : null}
              <div 
                className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-teal-500 flex items-center justify-center text-white font-bold text-lg"
                style={{ display: leaderProfiles[selectedCommunity.leader_npub]?.picture ? 'none' : 'flex' }}
              >
                {selectedCommunity.name.charAt(0)}
              </div>
            </div>
            
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Leader Dashboard
              </h1>
              <p className="text-gray-500 dark:text-gray-400">
                {selectedCommunity.name}
              </p>
            </div>
          </div>
        </div>

        {/* Pending Applications */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Pending Applications
            </h3>
            <button
              onClick={() => fetchPendingApplications(selectedCommunity.id)}
              className="text-sm text-teal-600 dark:text-teal-400 hover:underline"
            >
              Refresh
            </button>
          </div>
          
          {/* Success/Error Messages */}
          {reviewSuccess && (
            <div className="mb-4 p-3 bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700 rounded-lg text-green-700 dark:text-green-300 text-sm">
              ✅ {reviewSuccess}
            </div>
          )}
          {error && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-lg text-red-700 dark:text-red-300 text-sm">
              ❌ {error}
            </div>
          )}
          
          {communityApplications.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 dark:bg-blink-dark rounded-lg">
              <div className="text-4xl mb-2">✅</div>
              <p className="text-gray-500 dark:text-gray-400">
                No pending applications
              </p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
                New applications will appear here
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {communityApplications.map((app) => (
                <div
                  key={app.id}
                  className="bg-gray-50 dark:bg-blink-dark rounded-lg p-4 border border-gray-200 dark:border-gray-700"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900 dark:text-white font-mono text-sm break-all">
                        {app.user_npub}
                      </p>
                      {app.application_note && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 italic">
                          "{app.application_note}"
                        </p>
                      )}
                      <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                        Applied {getTimeAgo(app.applied_at)}
                      </p>
                    </div>
                    <div className="flex gap-2 ml-4">
                      <button 
                        onClick={() => reviewApplication(app.id, 'reject')}
                        disabled={reviewingId === app.id}
                        className="px-3 py-1.5 bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400 rounded-lg text-sm hover:bg-red-200 dark:hover:bg-red-800 disabled:opacity-50"
                      >
                        {reviewingId === app.id ? '...' : 'Reject'}
                      </button>
                      <button 
                        onClick={() => reviewApplication(app.id, 'approve')}
                        disabled={reviewingId === app.id}
                        className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
                      >
                        {reviewingId === app.id ? '...' : 'Approve'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Data Sync Section */}
          <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                📊 Transaction Data
              </h3>
              <button
                onClick={() => triggerSync(selectedCommunity.id)}
                disabled={syncing}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {syncing ? (
                  <>
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Syncing...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Sync Now
                  </>
                )}
              </button>
            </div>
            
            <div className="bg-gray-50 dark:bg-blink-dark rounded-lg p-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Members Sharing Data</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">
                    {selectedCommunity.data_sharing_member_count || 0}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Transactions</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">
                    {selectedCommunity.transaction_count || 0}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Volume</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">
                    {(selectedCommunity.transaction_volume_sats || 0).toLocaleString()} sats
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Closed Loop</p>
                  <p className="text-xl font-bold text-green-600 dark:text-green-400">
                    {selectedCommunity.closed_loop_ratio || 0}%
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Txs/Member</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">
                    {selectedCommunity.velocity || 0}
                  </p>
                </div>
              </div>
              
              {syncResult && (
                <div className="mt-4 p-3 bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700 rounded-lg text-green-700 dark:text-green-300 text-sm">
                  ✅ Synced {syncResult.members_synced} member(s), {syncResult.total_transactions} transactions
                </div>
              )}
              
              {selectedCommunity.oldest_tx_date && selectedCommunity.newest_tx_date && (
                <div className="mt-4 p-3 bg-gray-100 dark:bg-gray-800 rounded-lg">
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1">
                    📅 Data Period: {selectedCommunity.period_days || 0} days
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    {new Date(selectedCommunity.oldest_tx_date).toLocaleDateString()} → {new Date(selectedCommunity.newest_tx_date).toLocaleDateString()}
                  </p>
                </div>
              )}
              
              {selectedCommunity.metrics_last_updated && (
                <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                  Last synced: {new Date(selectedCommunity.metrics_last_updated).toLocaleString()}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============================================
  // CREATE COMMUNITY VIEW (Super Admin Only)
  // ============================================
  if (currentView === 'create') {
    // Only super admin can access this view
    if (!isSuperAdmin) {
      return (
        <div className="h-full flex flex-col bg-white dark:bg-black overflow-hidden" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-6xl mb-4">🔒</div>
              <p className="text-gray-600 dark:text-gray-400 text-lg">
                Access Denied
              </p>
              <p className="text-gray-500 dark:text-gray-500 text-sm mt-2">
                Only super admin can create new communities
              </p>
              <button
                onClick={() => navigateToView('discovery')}
                className="mt-4 px-4 py-2 bg-teal-600 text-white rounded-lg"
              >
                Go Back
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="h-full flex flex-col bg-white dark:bg-black overflow-hidden" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
        {/* Header */}
        <div className="px-4 py-4 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => navigateToView('discovery')}
            className="flex items-center text-gray-600 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 mb-3"
          >
            <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Add Community
            </h1>
            <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 text-xs rounded-full">
              Super Admin
            </span>
          </div>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Create a new Bitcoin Circular Economy and assign a leader
          </p>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 mb-6">
            <h3 className="font-medium text-purple-800 dark:text-purple-300 mb-2">
              How it works
            </h3>
            <ul className="text-sm text-purple-700 dark:text-purple-400 space-y-1">
              <li>• You provide community details and leader's npub</li>
              <li>• The leader will be whitelisted automatically</li>
              <li>• Leader can then approve member applications</li>
              <li>• Members can opt-in to share transaction data</li>
            </ul>
          </div>

          <div className="text-center py-8 bg-gray-50 dark:bg-blink-dark rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600">
            <div className="text-5xl mb-3">🚧</div>
            <p className="text-gray-600 dark:text-gray-400">
              Community creation form coming soon
            </p>
            <p className="text-gray-500 dark:text-gray-500 text-sm mt-2">
              Run database migrations first to enable this feature
            </p>
          </div>

          {/* Preview of current communities */}
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-3">
              Current Pioneer Communities
            </h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-blink-dark rounded-lg">
                <div>
                  <span className="font-medium text-gray-900 dark:text-white">Bitcoin Ekasi</span>
                  <span className="text-gray-500 dark:text-gray-400 text-sm ml-2">🇿🇦 South Africa</span>
                </div>
                <span className="text-xs text-green-600 dark:text-green-400">Active</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-blink-dark rounded-lg">
                <div>
                  <span className="font-medium text-gray-900 dark:text-white">Bitcoin Victoria Falls</span>
                  <span className="text-gray-500 dark:text-gray-400 text-sm ml-2">🇿🇼 Zimbabwe</span>
                </div>
                <span className="text-xs text-green-600 dark:text-green-400">Active</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Default fallback
  return null;
});

Network.displayName = 'Network';
export default Network;
