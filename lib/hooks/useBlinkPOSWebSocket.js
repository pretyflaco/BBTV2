import { useEffect, useState, useRef } from 'react';

/**
 * @param {string} userApiKey - User's Blink API key (for Blink wallet forwarding)
 * @param {string} userWalletId - User's Blink wallet ID (for Blink wallet forwarding)
 * @param {Function} onPaymentReceived - Callback when payment is forwarded
 * @param {Object} nwcOptions - NWC wallet options for forwarding
 * @param {boolean} nwcOptions.isActive - Whether NWC wallet is active
 * @param {Function} nwcOptions.makeInvoice - Function to create NWC invoice
 * @param {Object} blinkLnAddressOptions - Blink Lightning Address wallet options
 * @param {boolean} blinkLnAddressOptions.isActive - Whether LN Address wallet is active
 * @param {string} blinkLnAddressOptions.walletId - Wallet ID for the LN Address wallet
 * @param {string} blinkLnAddressOptions.username - Blink username
 * @param {Object} npubCashOptions - npub.cash wallet options for forwarding
 * @param {boolean} npubCashOptions.isActive - Whether npub.cash wallet is active
 * @param {string} npubCashOptions.address - Full npub.cash address (e.g., "npub1xxx@npub.cash")
 */
export function useBlinkPOSWebSocket(userApiKey, userWalletId, onPaymentReceived, nwcOptions = {}, blinkLnAddressOptions = {}, npubCashOptions = {}) {
  const [connected, setConnected] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [shouldConnect, setShouldConnect] = useState(false); // Manual control flag
  const wsRef = useRef(null);
  const processedPayments = useRef(new Set());
  
  // CRITICAL: Track current user context to prevent cross-user contamination
  const currentUserContext = useRef({ userApiKey, userWalletId });
  
  // Track NWC options in ref for access in callbacks
  const nwcRef = useRef(nwcOptions);
  
  // Track Blink Lightning Address options in ref
  const blinkLnAddressRef = useRef(blinkLnAddressOptions);
  
  // Track npub.cash options in ref
  const npubCashRef = useRef(npubCashOptions);
  
  // CRITICAL: Generate unique session ID to track payments per browser session
  const sessionId = useRef(Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15));
  
  // Update NWC ref when options change
  useEffect(() => {
    nwcRef.current = nwcOptions;
  }, [nwcOptions]);
  
  // Update Blink LN Address ref when options change
  useEffect(() => {
    blinkLnAddressRef.current = blinkLnAddressOptions;
  }, [blinkLnAddressOptions]);
  
  // Update npub.cash ref when options change
  useEffect(() => {
    npubCashRef.current = npubCashOptions;
  }, [npubCashOptions]);
  
  // Update current user context when props change
  useEffect(() => {
    currentUserContext.current = { userApiKey, userWalletId };
    
    // Log user context changes for debugging
    console.log('🔄 BlinkPOS WebSocket user context updated:', {
      sessionId: sessionId.current,
      hasApiKey: !!userApiKey,
      hasWalletId: !!userWalletId,
      apiKeyPrefix: userApiKey?.substring(0, 10) + '...',
      walletId: userWalletId,
      nwcActive: nwcOptions?.isActive || false,
      blinkLnAddressActive: blinkLnAddressOptions?.isActive || false,
      blinkLnAddressUsername: blinkLnAddressOptions?.username,
      npubCashActive: npubCashOptions?.isActive || false,
      npubCashAddress: npubCashOptions?.address,
      timestamp: new Date().toISOString()
    });
  }, [userApiKey, userWalletId, nwcOptions?.isActive, blinkLnAddressOptions?.isActive, blinkLnAddressOptions?.username, npubCashOptions?.isActive, npubCashOptions?.address]);

  // Function to create WebSocket connection for BlinkPOS
  const createConnection = () => {
    // We need to get the BlinkPOS API key from the server
    // Since we can't expose it in the frontend, we'll use a server-side endpoint
    console.log('🔗 BlinkPOS WebSocket: Connecting via server proxy...');

    // Connect to our own WebSocket proxy that will handle BlinkPOS credentials
    const ws = new WebSocket(`ws://localhost:3001/blinkpos-ws`);
    return ws;
  };


  // Function to forward payment when detected
  const forwardPayment = async (paymentData) => {
    // CRITICAL: Use current user context to prevent stale closures
    const { userApiKey: currentApiKey, userWalletId: currentWalletId } = currentUserContext.current;
    const currentNwc = nwcRef.current;
    const currentBlinkLnAddress = blinkLnAddressRef.current;
    const currentNpubCash = npubCashRef.current;
    
    // Check if NWC is active
    const useNwc = currentNwc?.isActive && currentNwc?.makeInvoice;
    
    // Check if Blink Lightning Address is active
    const useBlinkLnAddress = currentBlinkLnAddress?.isActive && currentBlinkLnAddress?.walletId;
    
    // Check if npub.cash is active
    const useNpubCash = currentNpubCash?.isActive && currentNpubCash?.address;
    
    // CRITICAL: Validate we have either Blink API key, NWC, Lightning Address, or npub.cash credentials
    if (!useNwc && !useBlinkLnAddress && !useNpubCash && (!currentApiKey || !currentWalletId)) {
      console.error('❌ CRITICAL: Cannot forward payment - missing credentials:', {
        hasApiKey: !!currentApiKey,
        hasWalletId: !!currentWalletId,
        nwcActive: useNwc,
        blinkLnAddressActive: useBlinkLnAddress,
        npubCashActive: useNpubCash,
        paymentId: paymentData.id,
        paymentAmount: paymentData.amount,
        timestamp: new Date().toISOString()
      });
      return;
    }
    
    // Determine destination
    let destination = 'Blink Wallet';
    let destinationId = currentWalletId;
    if (useNwc) {
      destination = 'NWC Wallet';
      destinationId = 'NWC';
    } else if (useBlinkLnAddress) {
      destination = `Blink LN Address (${currentBlinkLnAddress.username})`;
      destinationId = currentBlinkLnAddress.walletId;
    } else if (useNpubCash) {
      destination = `npub.cash (${currentNpubCash.address})`;
      destinationId = 'npub.cash';
    }
    
    // CRITICAL: Log payment forwarding attempt with full context
    console.log('💰 PAYMENT FORWARDING ATTEMPT:', {
      sessionId: sessionId.current,
      paymentId: paymentData.id,
      amount: paymentData.amount,
      destination,
      toWalletId: destinationId,
      apiKeyPrefix: useNwc || useBlinkLnAddress || useNpubCash ? 'N/A' : currentApiKey?.substring(0, 10) + '...',
      timestamp: new Date().toISOString()
    });

    if (processedPayments.current.has(paymentData.id)) {
      console.log('⚠️ Payment already processed, skipping:', paymentData.id);
      return;
    }

    try {
      console.log('🔄 Forwarding payment immediately:', {
        paymentId: paymentData.id,
        amount: paymentData.amount,
        destination: useNwc ? 'NWC Wallet' : useNpubCash ? 'npub.cash' : currentWalletId
      });

      // Mark as processed to prevent duplicates
      processedPayments.current.add(paymentData.id);

      let response;
      
      // NWC FORWARDING PATH
      // Chronology must match Blink: base amount FIRST, tips SECOND
      if (useNwc) {
        console.log('⚡ Forwarding to NWC wallet...');
        
        let baseAmount = paymentData.amount;
        // Ensure memo always has BlinkPOS prefix
        const originalMemo = paymentData.memo || `${paymentData.amount} sats`;
        let enhancedMemo = originalMemo.startsWith('BlinkPOS:') 
          ? originalMemo 
          : `BlinkPOS: ${originalMemo}`;
        let deferredTipData = null;
        
        // Step 1: Get tip data WITHOUT sending tips yet (deferTips=true)
        if (paymentData.paymentHash) {
          console.log('🎯 Checking for tip data before NWC forwarding (deferTips=true)...');
          
          const tipResponse = await fetch('/api/blink/forward-nwc-with-tips', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              paymentHash: paymentData.paymentHash,
              totalAmount: paymentData.amount,
              memo: paymentData.memo,
              deferTips: true  // Don't send tips yet - we'll do it after base amount
            })
          });
          
          if (tipResponse.ok) {
            const tipResult = await tipResponse.json();
            if (tipResult.success) {
              baseAmount = tipResult.baseAmount;
              enhancedMemo = tipResult.enhancedMemo;
              
              // Store deferred tip data for sending AFTER base amount
              if (tipResult.tipsDeferred && tipResult.tipData) {
                deferredTipData = tipResult.tipData;
                console.log('📄 Tip data retrieved (deferred), will forward base amount FIRST:', {
                  originalAmount: paymentData.amount,
                  baseAmount,
                  tipAmount: tipResult.tipAmount,
                  memo: enhancedMemo
                });
              } else {
                console.log('📄 No tips to defer, forwarding base amount:', {
                  baseAmount,
                  memo: enhancedMemo
                });
              }
            }
          } else {
            // No tip data found or error - forward full amount with BlinkPOS prefix
            console.log('ℹ️ No tip data found, forwarding full amount to NWC with BlinkPOS prefix');
          }
        }
        
        // Step 2: Create invoice from NWC wallet for the base amount FIRST
        console.log('📝 Creating NWC invoice for base amount:', { baseAmount, enhancedMemo });
        
        if (!currentNwc || !currentNwc.makeInvoice) {
          console.error('❌ NWC makeInvoice not available!', { 
            hasNwc: !!currentNwc, 
            hasMakeInvoice: !!currentNwc?.makeInvoice 
          });
          throw new Error('NWC makeInvoice function not available');
        }
        
        let nwcInvoiceResult;
        try {
          nwcInvoiceResult = await currentNwc.makeInvoice({
            amount: baseAmount * 1000, // NWC uses millisats
            description: enhancedMemo,
            expiry: 3600
          });
        } catch (nwcError) {
          console.error('❌ NWC makeInvoice threw an error:', nwcError);
          throw nwcError;
        }
        
        console.log('📄 NWC makeInvoice result:', nwcInvoiceResult);
        
        if (!nwcInvoiceResult.success || !nwcInvoiceResult.invoice) {
          console.error('❌ NWC invoice creation failed:', nwcInvoiceResult);
          throw new Error(nwcInvoiceResult.error || 'Failed to create NWC invoice');
        }
        
        console.log('✅ NWC invoice created:', {
          paymentHash: nwcInvoiceResult.payment_hash?.substring(0, 16) + '...',
          amount: baseAmount
        });
        
        // Store the memo locally so we can display it in transaction history
        // (NWC list_transactions returns description_hash for long memos, not the actual text)
        if (nwcInvoiceResult.payment_hash) {
          try {
            const nwcMemoKey = 'blinkpos_nwc_memos';
            const storedMemos = JSON.parse(localStorage.getItem(nwcMemoKey) || '{}');
            storedMemos[nwcInvoiceResult.payment_hash] = {
              memo: enhancedMemo,
              amount: baseAmount,
              createdAt: Date.now()
            };
            // Keep only last 500 entries to prevent localStorage bloat
            const entries = Object.entries(storedMemos);
            if (entries.length > 500) {
              const sorted = entries.sort((a, b) => b[1].createdAt - a[1].createdAt);
              const trimmed = Object.fromEntries(sorted.slice(0, 500));
              localStorage.setItem(nwcMemoKey, JSON.stringify(trimmed));
            } else {
              localStorage.setItem(nwcMemoKey, JSON.stringify(storedMemos));
            }
            console.log('💾 Stored NWC invoice memo for payment_hash:', nwcInvoiceResult.payment_hash.substring(0, 16) + '...');
          } catch (e) {
            console.warn('Failed to store NWC memo:', e);
          }
        }
        
        // Step 3: Pay the NWC invoice from BlinkPOS (BASE AMOUNT FIRST)
        response = await fetch('/api/blink/pay-invoice', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            invoice: nwcInvoiceResult.invoice,
            memo: enhancedMemo
          })
        });
        
        // Step 4: Send tips AFTER base amount has been forwarded (TIPS SECOND)
        if (response.ok && deferredTipData) {
          console.log('💡 Base amount forwarded, now sending tips SECOND...');
          
          const sendTipsResponse = await fetch('/api/blink/send-nwc-tips', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              paymentHash: paymentData.paymentHash,
              tipData: deferredTipData
            })
          });
          
          if (sendTipsResponse.ok) {
            const sendTipsResult = await sendTipsResponse.json();
            console.log('✅ Tips sent successfully AFTER base amount:', {
              tipResult: sendTipsResult.tipResult
            });
          } else {
            console.error('❌ Failed to send tips after base amount forwarding');
          }
        }
      }
      // BLINK LIGHTNING ADDRESS FORWARDING PATH
      else if (useBlinkLnAddress) {
        console.log('⚡ Forwarding to Blink Lightning Address wallet:', currentBlinkLnAddress.username);
        
        let baseAmount = paymentData.amount;
        // Ensure memo always has BlinkPOS prefix
        const originalMemo = paymentData.memo || `${paymentData.amount} sats`;
        let enhancedMemo = originalMemo.startsWith('BlinkPOS:') 
          ? originalMemo 
          : `BlinkPOS: ${originalMemo}`;
        
        // For Lightning Address wallets, forward via the ln-address endpoint
        response = await fetch('/api/blink/forward-ln-address', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            paymentHash: paymentData.paymentHash,
            totalAmount: paymentData.amount,
            memo: paymentData.memo,
            recipientWalletId: currentBlinkLnAddress.walletId,
            recipientUsername: currentBlinkLnAddress.username
          })
        });
        
        // Handle 409 - payment being handled by webhook
        if (response.status === 409) {
          console.log('ℹ️ [LN Address] Payment already being processed by webhook - skipping');
          if (onPaymentReceived) {
            onPaymentReceived({
              amount: paymentData.amount,
              currency: 'BTC',
              memo: paymentData.memo || 'Payment forwarded by server',
              isForwarded: true,
              handledByWebhook: true
            });
          }
          return;
        }
      }
      // NPUB.CASH FORWARDING PATH (Cashu ecash via LNURL-pay, intraledger)
      else if (useNpubCash) {
        console.log('🥜 Forwarding to npub.cash wallet:', currentNpubCash.address);
        
        // Ensure memo always has BlinkPOS prefix
        const originalMemo = paymentData.memo || `${paymentData.amount} sats`;
        let enhancedMemo = originalMemo.startsWith('BlinkPOS:') 
          ? originalMemo 
          : `BlinkPOS: ${originalMemo}`;
        
        // For npub.cash wallets, forward via LNURL-pay (intraledger since npub.cash uses Blink)
        response = await fetch('/api/blink/forward-npubcash', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            paymentHash: paymentData.paymentHash,
            totalAmount: paymentData.amount,
            memo: paymentData.memo,
            recipientAddress: currentNpubCash.address
          })
        });
        
        // Handle 409 - payment being handled by webhook
        if (response.status === 409) {
          console.log('ℹ️ [npub.cash] Payment already being processed by webhook - skipping');
          if (onPaymentReceived) {
            onPaymentReceived({
              amount: paymentData.amount,
              currency: 'BTC',
              memo: paymentData.memo || 'Payment forwarded by server',
              isForwarded: true,
              handledByWebhook: true
            });
          }
          return;
        }
      }
      // BLINK API KEY FORWARDING PATH
      else {
        // Try tip-aware forwarding first if we have a payment hash
        if (paymentData.paymentHash) {
          console.log('🎯 Attempting tip-aware forwarding...');
          response = await fetch('/api/blink/forward-with-tips', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              paymentHash: paymentData.paymentHash,
              totalAmount: paymentData.amount,
              memo: paymentData.memo
            })
          });
          
          // Handle response from tip-aware forwarding
          if (!response.ok) {
            // CRITICAL: If 409 (Conflict), payment is being handled by webhook - don't retry!
            if (response.status === 409) {
              console.log('ℹ️ Payment already being processed by another handler (webhook) - skipping client forwarding');
              // Treat as success - the payment will be forwarded by the webhook
              if (onPaymentReceived) {
                onPaymentReceived({
                  amount: paymentData.amount,
                  currency: 'BTC',
                  memo: paymentData.memo || 'Payment forwarded by server',
                  isForwarded: true,
                  handledByWebhook: true
                });
              }
              return;
            }
            
            // For other errors, log but don't fall back to non-atomic forwarding
            // This prevents duplicate payouts
            console.error('❌ Tip-aware forwarding failed:', response.status);
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Forwarding failed: ${response.status}`);
          }
        } else {
          // No payment hash available, use regular forwarding
          console.log('🔄 Using regular forwarding (no payment hash)');
          response = await fetch('/api/blink/forward-payment', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              amount: paymentData.amount,
              userApiKey: currentApiKey,
              userWalletId: currentWalletId,
              memo: paymentData.memo
            })
          });
        }
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Payment forwarding failed:', response.status, errorText);
        throw new Error(`Payment forwarding failed: ${response.status}`);
      }
      
      const result = await response.json();

      if (result.success) {
        console.log('✅ Payment forwarded successfully!', useNwc ? '(to NWC)' : '(to Blink)');
        
        // Trigger the callback with forwarded payment data
        if (onPaymentReceived) {
          onPaymentReceived({
            amount: paymentData.amount,
            currency: 'BTC',
            memo: paymentData.memo || 'Forwarded payment',
            isForwarded: true,
            isNwc: useNwc,
            originalPaymentId: paymentData.id
          });
        }
      } else {
        console.error('❌ Payment forwarding failed:', result.error);
        throw new Error(result.error || 'Payment forwarding failed');
      }

    } catch (error) {
      console.error('❌ Payment forwarding error:', error.message);
      // Remove from processed set if forwarding failed
      processedPayments.current.delete(paymentData.id);
    }
  };

  useEffect(() => {
    // Only start if manually triggered
    if (!shouldConnect) {
      console.log('⏸️ BlinkPOS WebSocket: Connection not requested (lazy-loading mode)');
      return;
    }

    // Check if we have a valid forwarding destination (Blink API key, NWC, Lightning Address, or npub.cash)
    const hasBlinkCredentials = userApiKey && userWalletId;
    const hasNwcDestination = nwcOptions?.isActive && nwcOptions?.makeInvoice;
    const hasBlinkLnAddress = blinkLnAddressOptions?.isActive && blinkLnAddressOptions?.walletId;
    const hasNpubCash = npubCashOptions?.isActive && npubCashOptions?.address;
    
    if (!hasBlinkCredentials && !hasNwcDestination && !hasBlinkLnAddress && !hasNpubCash) {
      console.log('⚠️ BlinkPOS WebSocket: Waiting for forwarding destination...', {
        hasApiKey: !!userApiKey,
        hasWalletId: !!userWalletId,
        nwcActive: !!nwcOptions?.isActive,
        blinkLnAddressActive: !!blinkLnAddressOptions?.isActive,
        timestamp: new Date().toISOString()
      });
      
      // CRITICAL: Close any existing connection when no forwarding destination
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        console.log('🔒 Closing existing WebSocket connection due to missing forwarding destination');
        wsRef.current.close();
        wsRef.current = null;
        setConnected(false);
      }
      return;
    }
    
    // Determine destination type
    let destination = 'Blink';
    if (hasNwcDestination) destination = 'NWC';
    else if (hasBlinkLnAddress) destination = 'Blink LN Address';
    else if (hasNpubCash) destination = 'npub.cash';
    
    console.log('✅ BlinkPOS WebSocket: Valid forwarding destination found', {
      destination,
      hasBlinkCredentials,
      hasNwcDestination,
      hasBlinkLnAddress,
      hasNpubCash
    });

    // For now, let's use a simpler approach: direct WebSocket to Blink with BlinkPOS credentials
    // We'll handle this securely by fetching the BlinkPOS API key server-side
    const connectToBlinkPOS = async () => {
      try {
        // Get BlinkPOS credentials from server
        const response = await fetch('/api/blink/blinkpos-credentials');
        if (!response.ok) {
          throw new Error('Failed to get BlinkPOS credentials');
        }
        
        const { apiKey: blinkposApiKey } = await response.json();
        
        console.log('🔗 BlinkPOS WebSocket: Connecting to Blink with BlinkPOS credentials...');
        
        // Connect directly to Blink WebSocket with BlinkPOS credentials
        const ws = new WebSocket('wss://ws.blink.sv/graphql', 'graphql-transport-ws');
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('🟢 BlinkPOS WebSocket: Connected');
          setConnected(true);
          setReconnectAttempts(0);
          
          // Send connection init with BlinkPOS API key
          const initMessage = {
            type: 'connection_init',
            payload: {
              'X-API-KEY': blinkposApiKey
            }
          };
          
          console.log('📤 BlinkPOS WebSocket: Sending connection init');
          ws.send(JSON.stringify(initMessage));
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            console.log('📨 BlinkPOS WebSocket: Message received:', message.type);

            // BTCPayServer pattern: Reset error count on successful message
            setReconnectAttempts(0);

            if (message.type === 'connection_ack') {
              console.log('✅ BlinkPOS WebSocket: Authenticated');
              
              // Subscribe to transaction updates for BlinkPOS account
              const subscription = {
                id: 'blinkpos-payments',
                type: 'subscribe',
                payload: {
                  query: `
                    subscription myUpdates {
                      myUpdates {
                        update {
                          ... on LnUpdate {
                            transaction {
                              id
                              initiationVia {
                                ... on InitiationViaLn {
                                  paymentHash
                                }
                              }
                              direction
                              settlementAmount
                              settlementCurrency
                              status
                              createdAt
                              memo
                            }
                            paymentHash
                          }
                        }
                      }
                    }
                  `,
                  variables: {}
                }
              };
              
              console.log('📡 BlinkPOS WebSocket: Subscribing to payment updates');
              ws.send(JSON.stringify(subscription));
            }
            
            else if (message.type === 'next') {
              console.log('📝 BlinkPOS WebSocket: Transaction update:', message.payload);
              
              const transaction = message.payload?.data?.myUpdates?.update?.transaction;
              if (transaction && transaction.direction === 'RECEIVE' && transaction.status === 'SUCCESS') {
                console.log('🎉 BLINKPOS PAYMENT DETECTED!', {
                  id: transaction.id,
                  amount: transaction.settlementAmount,
                  memo: transaction.memo
                });
                
                // Forward payment immediately with tip support
                const paymentHash = message.payload?.data?.myUpdates?.update?.paymentHash;
                
                forwardPayment({
                  id: transaction.id,
                  amount: transaction.settlementAmount,
                  currency: transaction.settlementCurrency,
                  memo: transaction.memo,
                  paymentHash: paymentHash
                });
              }
            }
            
          } catch (error) {
            console.error('❌ BlinkPOS WebSocket: Parse error:', error);
          }
        };

        ws.onclose = (event) => {
          console.log('🔴 BlinkPOS WebSocket: Closed', event.code, event.reason);
          setConnected(false);
          
          // Only reconnect if it wasn't a manual close AND shouldConnect is still true
          if (event.code !== 1000 && shouldConnect && userApiKey && userWalletId) {
            console.log('🔄 BlinkPOS connection lost, scheduling reconnect...');
            setTimeout(() => {
              setReconnectAttempts(prev => prev + 1);
            }, Math.min(1000 * Math.pow(2, reconnectAttempts), 30000));
          }
        };

        ws.onerror = (error) => {
          console.error('❌ BlinkPOS WebSocket: Error:', error);
          setConnected(false);
          
          // Only reconnect if shouldConnect is still true
          if (shouldConnect && userApiKey && userWalletId) {
            console.log('🔄 BlinkPOS connection error, scheduling reconnect...');
            setTimeout(() => {
              setReconnectAttempts(prev => prev + 1);
            }, Math.min(1000 * Math.pow(2, reconnectAttempts), 30000));
          }
        };

      } catch (error) {
        console.error('❌ Failed to connect BlinkPOS WebSocket:', error);
        
        // Only retry if shouldConnect is still true
        if (shouldConnect) {
          setTimeout(() => {
            setReconnectAttempts(prev => prev + 1);
          }, Math.min(1000 * Math.pow(2, reconnectAttempts), 30000));
        }
      }
    };

    connectToBlinkPOS();

    // Cleanup
    return () => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        console.log('🧹 Cleaning up BlinkPOS WebSocket connection');
        wsRef.current.close();
      }
    };
  }, [shouldConnect, userApiKey, userWalletId, reconnectAttempts, nwcOptions?.isActive]);


  // Manual connect function - triggers connection
  const connect = () => {
    console.log('🔗 BlinkPOS WebSocket: Manual connect requested');
    setShouldConnect(true);
    setReconnectAttempts(0); // Reset reconnect attempts when manually connecting
  };

  // Manual disconnect function - closes connection and prevents auto-reconnect
  const disconnect = () => {
    console.log('🔌 BlinkPOS WebSocket: Manual disconnect requested');
    setShouldConnect(false);
    setReconnectAttempts(0);
    
    // Close existing connection
    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
        wsRef.current.close(1000, 'Manual disconnect'); // 1000 = normal closure
      }
      wsRef.current = null;
    }
    
    setConnected(false);
    
    // Clear processed payments for clean slate
    processedPayments.current.clear();
  };

  // Manual reconnection function
  const manualReconnect = () => {
    console.log('🔄 Manual BlinkPOS reconnect triggered');
    setReconnectAttempts(prev => prev + 1);
  };

  return {
    connected,
    connect,
    disconnect,
    manualReconnect,
    reconnectAttempts
  };
}
