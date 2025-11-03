import { useEffect, useState, useRef } from 'react';

export function useBlinkPOSWebSocket(userApiKey, userWalletId, onPaymentReceived) {
  const [connected, setConnected] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [shouldConnect, setShouldConnect] = useState(false); // Manual control flag
  const wsRef = useRef(null);
  const processedPayments = useRef(new Set());
  
  // CRITICAL: Track current user context to prevent cross-user contamination
  const currentUserContext = useRef({ userApiKey, userWalletId });
  
  // CRITICAL: Generate unique session ID to track payments per browser session
  const sessionId = useRef(Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15));
  
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
      timestamp: new Date().toISOString()
    });
  }, [userApiKey, userWalletId]);

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
    
    // CRITICAL: Validate current user credentials before forwarding
    if (!currentApiKey || !currentWalletId) {
      console.error('❌ CRITICAL: Cannot forward payment - missing user credentials:', {
        hasApiKey: !!currentApiKey,
        hasWalletId: !!currentWalletId,
        paymentId: paymentData.id,
        paymentAmount: paymentData.amount,
        timestamp: new Date().toISOString()
      });
      return;
    }
    
    // CRITICAL: Double-check against prop values to detect inconsistencies
    if (currentApiKey !== userApiKey || currentWalletId !== userWalletId) {
      console.error('❌ CRITICAL: User context mismatch detected!', {
        paymentId: paymentData.id,
        currentApiKeyPrefix: currentApiKey?.substring(0, 10) + '...',
        propApiKeyPrefix: userApiKey?.substring(0, 10) + '...',
        currentWalletId,
        propWalletId: userWalletId,
        timestamp: new Date().toISOString()
      });
      return;
    }
    
    // CRITICAL: Log payment forwarding attempt with full context
    console.log('💰 PAYMENT FORWARDING ATTEMPT:', {
      sessionId: sessionId.current,
      paymentId: paymentData.id,
      amount: paymentData.amount,
      toWalletId: currentWalletId,
      apiKeyPrefix: currentApiKey?.substring(0, 10) + '...',
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
        toUserWallet: userWalletId
      });

      // Mark as processed to prevent duplicates
      processedPayments.current.add(paymentData.id);

      // Try tip-aware forwarding first if we have a payment hash
      let response;
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
        
        // If tip-aware forwarding fails, fall back to regular forwarding
        if (!response.ok) {
          console.log('⚠️ Tip-aware forwarding failed, falling back to regular forwarding');
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

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Payment forwarding failed:', response.status, errorText);
        throw new Error(`Payment forwarding failed: ${response.status}`);
      }
      
      const result = await response.json();

      if (result.success) {
        console.log('✅ Payment forwarded successfully!');
        
        // Trigger the callback with forwarded payment data
        if (onPaymentReceived) {
          onPaymentReceived({
            amount: paymentData.amount,
            currency: 'BTC',
            memo: paymentData.memo || 'Forwarded payment',
            isForwarded: true,
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
    // Only start if manually triggered AND we have user credentials
    if (!shouldConnect) {
      console.log('⏸️ BlinkPOS WebSocket: Connection not requested (lazy-loading mode)');
      return;
    }

    if (!userApiKey || !userWalletId) {
      console.log('⚠️ BlinkPOS WebSocket: Waiting for user credentials...', {
        hasApiKey: !!userApiKey,
        hasWalletId: !!userWalletId,
        apiKeyPrefix: userApiKey?.substring(0, 10) + '...',
        walletId: userWalletId,
        timestamp: new Date().toISOString()
      });
      
      // CRITICAL: Close any existing connection when credentials are missing
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        console.log('🔒 Closing existing WebSocket connection due to missing credentials');
        wsRef.current.close();
        wsRef.current = null;
        setConnected(false);
      }
      return;
    }

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
  }, [shouldConnect, userApiKey, userWalletId, reconnectAttempts]);


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
