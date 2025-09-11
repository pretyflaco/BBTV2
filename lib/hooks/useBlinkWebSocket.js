import { useEffect, useState } from 'react';

export function useBlinkWebSocket(apiKey, username) {
  const [lastPayment, setLastPayment] = useState(null);
  const [showAnimation, setShowAnimation] = useState(false);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!apiKey || !username) return;

    console.log('🔗 Direct Blink WebSocket: Connecting...');

    // Connect directly to Blink WebSocket (like the donation button does)
    const ws = new WebSocket('wss://ws.blink.sv/graphql', 'graphql-transport-ws');

    ws.onopen = () => {
      console.log('🟢 Direct Blink WebSocket: Connected');
      setConnected(true);
      
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

        if (message.type === 'connection_ack') {
          console.log('✅ Direct Blink WebSocket: Authenticated');
          
          // Subscribe to transaction updates
          const subscription = {
            id: '1',
            type: 'subscribe',
            payload: {
              query: `
                subscription {
                  myUpdates {
                    update {
                      ... on LnUpdate {
                        transaction {
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
            
            console.log('🎬 TRIGGERING ANIMATION!');
            
            // Auto-hide after 4 seconds
            setTimeout(() => {
              console.log('🎬 Hiding animation');
              setShowAnimation(false);
            }, 4000);
          }
        }
        
      } catch (error) {
        console.error('❌ Direct Blink WebSocket: Parse error:', error);
      }
    };

    ws.onclose = (event) => {
      console.log('🔴 Direct Blink WebSocket: Closed', event.code, event.reason);
      setConnected(false);
    };

    ws.onerror = (error) => {
      console.error('❌ Direct Blink WebSocket: Error:', error);
      setConnected(false);
    };

    // Cleanup
    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [apiKey, username]);

  return {
    connected,
    lastPayment,
    showAnimation,
    hideAnimation: () => setShowAnimation(false)
  };
}
