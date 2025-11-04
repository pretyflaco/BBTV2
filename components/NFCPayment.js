import { useState, useEffect } from 'react';

// TODO: refine the interface
const decodeNDEFRecord = (record) => {
  if (!record.data) {
    console.log('No data found in NFC record');
    return '';
  }

  let buffer;
  if (record.data instanceof ArrayBuffer) {
    buffer = record.data;
  } else if (record.data instanceof DataView) {
    buffer = record.data.buffer;
  } else {
    console.log('Data type not supported');
    return '';
  }

  const decoder = new TextDecoder(record.encoding || 'utf-8');
  return decoder.decode(buffer);
};

// Hook to manage NFC state and functionality
export const useNFC = ({ paymentRequest, onPaymentSuccess, onPaymentError, soundEnabled }) => {
  const [hasNFCPermission, setHasNFCPermission] = useState(false);
  const [nfcMessage, setNfcMessage] = useState('');
  const [isNfcSupported, setIsNfcSupported] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleNFCScan = async () => {
    if (typeof window === 'undefined' || !('NDEFReader' in window)) {
      console.error('NFC is not supported on this device/browser');
      return;
    }

    console.log('NFC is supported, starting scan...');

    const ndef = new NDEFReader();

    try {
      await ndef.scan();
      console.log('NFC scan started successfully.');

      ndef.onreading = (event) => {
        console.log('NFC tag detected and read:', event.message);
        const record = event.message.records[0];
        const text = decodeNDEFRecord(record);
        console.log('Decoded NFC message:', text);
        setNfcMessage(text);
      };

      ndef.onreadingerror = (error) => {
        console.error('Cannot read data from the NFC tag:', error);
        if (onPaymentError) {
          onPaymentError('Cannot read NFC tag. Please try again.');
        }
      };
    } catch (error) {
      console.error(`Error! Scan failed to start: ${error}`);
    }
  };

  const activateNfcScan = async () => {
    try {
      await handleNFCScan();
      alert(
        'Boltcard is now active. There will be no need to activate it again. Please tap your card to process the payment.'
      );
    } catch (error) {
      console.error('Failed to activate NFC:', error);
      if (onPaymentError) {
        onPaymentError('Failed to activate NFC. Please try again.');
      }
    }
  };

  // Check NFC support and permissions on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    setIsNfcSupported('NDEFReader' in window);

    (async () => {
      if (!('permissions' in navigator)) {
        console.error('Permissions API not supported');
        return;
      }

      let result;
      try {
        // @ts-ignore - NFC permission is not in TypeScript's navigator.permissions
        result = await navigator.permissions.query({ name: 'nfc' });
      } catch (err) {
        console.error('Error querying NFC permission:', err);
        return;
      }

      console.log('NFC permission query result:', result);

      if (result.state === 'granted') {
        setHasNFCPermission(true);
      } else {
        setHasNFCPermission(false);
      }

      result.onchange = () => {
        if (result.state === 'granted') {
          setHasNFCPermission(true);
        } else {
          setHasNFCPermission(false);
        }
      };
    })();
  }, []);

  // Auto-start scanning when permission is granted
  useEffect(() => {
    if (hasNFCPermission) {
      handleNFCScan();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasNFCPermission]);

  // Process NFC message when received
  useEffect(() => {
    (async () => {
      if (!nfcMessage) {
        return;
      }

      // Validate that it's an LNURL
      if (!nfcMessage.toLowerCase().includes('lnurl')) {
        console.error('Not a compatible Boltcard');
        setNfcMessage(''); // Reset for next scan
        return;
      }

      // Check if we have a payment request (invoice)
      if (!paymentRequest) {
        console.error('No payment request available for NFC payment');
        setNfcMessage(''); // Reset for next scan
        return;
      }

      // Play payment sound if enabled
      if (soundEnabled) {
        try {
          const sound = new Audio('/chaching.mp3');
          sound.volume = 0.5;
          await sound.play();
        } catch (error) {
          console.error('Failed to play payment sound:', error);
        }
      }

      setIsProcessing(true);

      try {
        // Call our proxy endpoint to handle the LNURL request
        const result = await fetch('/api/lnurl-proxy', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            lnurl: nfcMessage,
            paymentRequest,
          }),
        });

        if (result.ok) {
          const lnurlResponse = await result.json();
          
          if (lnurlResponse?.status?.toLowerCase() === 'ok') {
            console.log('✅ Boltcard payment successful!');
            if (onPaymentSuccess) {
              onPaymentSuccess(lnurlResponse);
            }
          } else {
            // Log error but don't show alert - payment might have succeeded via WebSocket
            console.log('LNURL response status:', lnurlResponse.status, lnurlResponse.reason);
            // Don't call onPaymentError or show alert - WebSocket will handle success
          }
        } else {
          // Log error but don't show alert - payment might have succeeded via WebSocket
          let errorMessage = '';
          try {
            const decoded = await result.json();
            if (decoded.reason) {
              errorMessage += decoded.reason;
            }
            if (decoded.message) {
              errorMessage += decoded.message;
            }
          } catch (e) {
            errorMessage = 'Unknown error';
          }

          // HTTP 400 with "Replayed or expired query" means payment already processed
          console.log(`LNURL withdraw response: ${result.status} - ${errorMessage}`);
          // Don't show alert - the payment likely succeeded via WebSocket already
        }
      } catch (error) {
        console.error('Error processing Boltcard payment:', error);
        // Don't show alert - payment might have succeeded via WebSocket
        // The catch error is often a network/CORS issue after payment succeeds
      } finally {
        setIsProcessing(false);
        setNfcMessage(''); // Reset for next scan
      }
    })();
  }, [nfcMessage, paymentRequest, soundEnabled, onPaymentSuccess, onPaymentError]);

  // Return the state and control functions
  return {
    isNfcSupported,
    hasNFCPermission,
    isProcessing,
    activateNfcScan,
  };
};

// Default export for backwards compatibility (though not used anymore)
export default function NFCPayment() {
  return null;
}

