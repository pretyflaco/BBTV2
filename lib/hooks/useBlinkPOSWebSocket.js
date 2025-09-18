import { useEffect, useState, useRef } from 'react';

export function useBlinkPOSWebSocket(userApiKey, userWalletId, onPaymentReceived) {
  const [connected, setConnected] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const wsRef = useRef(null);
  const processedPayments = useRef(new Set());

  // Function to create WebSocket connection for BlinkPOS
  const createConnection = () => {
    // We need to get the BlinkPOS API key from the server
    // Since we can't expose it in the frontend, we'll use a server-side endpoint
    console.log('🔗 BlinkPOS WebSocket: Connecting via server proxy...');

    // Connect to our own WebSocket proxy that will handle BlinkPOS credentials
    const ws = new WebSocket(`ws://localhost:3001/blinkpos-ws`);
    return ws;
  };

  // Function to handle reconnection with exponential backoff
  const scheduleReconnect = () => {
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000); // Max 30 seconds
    console.log(`🔄 BlinkPOS - Scheduling reconnect in ${delay}ms (attempt ${reconnectAttempts + 1})`);
    
    setTimeout(() => {
      setReconnectAttempts(prev => prev + 1);
    }, delay);
  };

  // Function to forward payment when detected
  const forwardPayment = async (paymentData) => {
    if (!userApiKey || !userWalletId) {
      console.error('❌ Cannot forward payment: missing user credentials');
      return;
    }

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
              userApiKey: userApiKey,
              userWalletId: userWalletId,
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
            userApiKey: userApiKey,
            userWalletId: userWalletId,
            memo: paymentData.memo
          })
        });
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
      }

    } catch (error) {
      console.error('❌ Payment forwarding error:', error);
      // Remove from processed set if forwarding failed
      processedPayments.current.delete(paymentData.id);
    }
  };

  useEffect(() => {
    // Only start if we have user credentials
    if (!userApiKey || !userWalletId) {
      console.log('⚠️ BlinkPOS WebSocket: Waiting for user credentials...');
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

            if (message.type === 'connection_ack') {
              console.log('✅ BlinkPOS WebSocket: Authenticated');
              
              // Subscribe to transaction updates for BlinkPOS account
              const subscription = {
                id: 'blinkpos-payments',
                type: 'subscribe',
                payload: {
                  query: `
                    subscription {
                      myUpdates {
                        update {
                          ... on LnUpdate {
                            transaction {
                              id
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
          
          // Only reconnect if it wasn't a manual close
          if (event.code !== 1000 && userApiKey && userWalletId) {
            console.log('🔄 BlinkPOS connection lost, scheduling reconnect...');
            scheduleReconnect();
          }
        };

        ws.onerror = (error) => {
          console.error('❌ BlinkPOS WebSocket: Error:', error);
          setConnected(false);
          
          if (userApiKey && userWalletId) {
            console.log('🔄 BlinkPOS connection error, scheduling reconnect...');
            scheduleReconnect();
          }
        };

      } catch (error) {
        console.error('❌ Failed to connect BlinkPOS WebSocket:', error);
        scheduleReconnect();
      }
    };

    connectToBlinkPOS();

    // Cleanup
    return () => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
    };
  }, [userApiKey, userWalletId, reconnectAttempts]);

  // Manual reconnection function
  const manualReconnect = () => {
    console.log('🔄 Manual BlinkPOS reconnect triggered');
    setReconnectAttempts(prev => prev + 1);
  };

  return {
    connected,
    manualReconnect,
    reconnectAttempts
  };
}
