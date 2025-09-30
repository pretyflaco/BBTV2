import { useEffect, useState } from 'react';

export function useBlinkWebSocket(apiKey, username) {
  const [lastPayment, setLastPayment] = useState(null);
  const [showAnimation, setShowAnimation] = useState(false);
  const [connected, setConnected] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [lastActivity, setLastActivity] = useState(Date.now());

  // Function to create WebSocket connection
  const createConnection = () => {
    if (!apiKey || !username) return null;

    console.log('🔗 Direct Blink WebSocket: Connecting...', { attempts: reconnectAttempts });

    // Connect directly to Blink WebSocket (like the donation button does)
    const ws = new WebSocket('wss://ws.blink.sv/graphql', 'graphql-transport-ws');

    return ws;
  };

  // Function to handle reconnection with exponential backoff
  const scheduleReconnect = () => {
    // BTCPayServer pattern: Only give up after 10 consecutive failures
    if (reconnectAttempts >= 10) {
      console.log('❌ WebSocket connection abandoned after 10 consecutive failures - possible service outage.');
      const delay = 60000; // 1 minute delay after 10 failures
      console.log(`🔄 Scheduling reconnect in ${delay}ms (attempt ${reconnectAttempts + 1}) - service outage mode`);
      
      setTimeout(() => {
        setReconnectAttempts(prev => prev + 1);
      }, delay);
      return;
    }
    
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000); // Max 30 seconds
    console.log(`🔄 Scheduling reconnect in ${delay}ms (attempt ${reconnectAttempts + 1})`);
    
    setTimeout(() => {
      setReconnectAttempts(prev => prev + 1);
    }, delay);
  };

  useEffect(() => {
    if (!apiKey || !username) return;

    const ws = createConnection();
    if (!ws) return;

    ws.onopen = () => {
      console.log('🟢 Direct Blink WebSocket: Connected');
      setConnected(true);
      setReconnectAttempts(0); // Reset attempts on successful connection
      
      // Send connection init with API key
      const initMessage = {
        type: 'connection_init',
        payload: {
          'X-API-KEY': apiKey
        }
      };
      
      console.log('📤 Direct Blink WebSocket: Sending connection init');
      ws.send(JSON.stringify(initMessage));
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('📨 Direct Blink WebSocket: Message received:', message.type);

        // BTCPayServer pattern: Reset error count on successful message
        setReconnectAttempts(0);

        if (message.type === 'connection_ack') {
          console.log('✅ Direct Blink WebSocket: Authenticated');
          
          // Subscribe to transaction updates
          const subscription = {
            id: '1',
            type: 'subscribe',
            payload: {
              query: `
                subscription myUpdates {
                  myUpdates {
                    update {
                      ... on LnUpdate {
                        transaction {
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
                      }
                    }
                  }
                }
              `,
              variables: {}
            }
          };
          
          console.log('📡 Direct Blink WebSocket: Subscribing to updates');
          ws.send(JSON.stringify(subscription));
        }
        
        else if (message.type === 'next') {
          console.log('📝 Direct Blink WebSocket: Transaction data:', message.payload);
          
          const transaction = message.payload?.data?.myUpdates?.update?.transaction;
          if (transaction && transaction.direction === 'RECEIVE') {
            console.log('🎉 DIRECT PAYMENT DETECTED!', transaction);
            
            const paymentData = {
              amount: transaction.settlementAmount,
              currency: transaction.settlementCurrency,
              memo: transaction.memo
            };
            
            setLastPayment(paymentData);
            setShowAnimation(true);
            
            console.log('🎬 TRIGGERING ANIMATION! (Manual dismiss required)');
          }
        }
        
      } catch (error) {
        console.error('❌ Direct Blink WebSocket: Parse error:', error);
      }
    };

    ws.onclose = (event) => {
      console.log('🔴 Direct Blink WebSocket: Closed', event.code, event.reason);
      setConnected(false);
      
      // Only reconnect if it wasn't a manual close (code 1000)
      if (event.code !== 1000 && apiKey && username) {
        console.log('🔄 Connection lost, scheduling reconnect...');
        scheduleReconnect();
      }
    };

    ws.onerror = (error) => {
      console.error('❌ Direct Blink WebSocket: Error:', error);
      setConnected(false);
      
      // Schedule reconnect on error
      if (apiKey && username) {
        console.log('🔄 Connection error, scheduling reconnect...');
        scheduleReconnect();
      }
    };

    // Cleanup
    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [apiKey, username]);

  // Activity-based reconnection - detect when user becomes active
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && !connected && apiKey && username) {
        console.log('🎯 Tab became visible and not connected - triggering reconnect');
        setReconnectAttempts(prev => prev + 1);
      }
    };

    const handleFocus = () => {
      setLastActivity(Date.now());
      if (!connected && apiKey && username) {
        console.log('🎯 Window focused and not connected - triggering reconnect');
        setReconnectAttempts(prev => prev + 1);
      }
    };

    const handleUserActivity = () => {
      setLastActivity(Date.now());
    };

    // Listen for visibility and focus events
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    
    // Listen for user activity
    window.addEventListener('click', handleUserActivity);
    window.addEventListener('keydown', handleUserActivity);
    window.addEventListener('touchstart', handleUserActivity);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('click', handleUserActivity);
      window.removeEventListener('keydown', handleUserActivity);
      window.removeEventListener('touchstart', handleUserActivity);
    };
  }, [connected, apiKey, username]);

  // Manual reconnection function
  const manualReconnect = () => {
    console.log('🔄 Manual reconnect triggered');
    setReconnectAttempts(prev => prev + 1);
  };

  // Function to manually trigger payment animation (for forwarded payments)
  const triggerPaymentAnimation = (paymentData) => {
    setLastPayment(paymentData);
    setShowAnimation(true);
  };

  return {
    connected,
    lastPayment,
    showAnimation,
    hideAnimation: () => setShowAnimation(false),
    triggerPaymentAnimation,
    manualReconnect,
    reconnectAttempts
  };
}
