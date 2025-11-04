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

const NFCPayment = ({ paymentRequest, onPaymentSuccess, onPaymentError, soundEnabled }) => {
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
        alert('Not a compatible Boltcard. Please use a valid Lightning NFC card.');
        setNfcMessage(''); // Reset for next scan
        return;
      }

      // Check if we have a payment request (invoice)
      if (!paymentRequest) {
        alert('Please create an invoice first before scanning the card.');
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
            console.log('Boltcard payment successful!');
            if (onPaymentSuccess) {
              onPaymentSuccess(lnurlResponse);
            }
          } else {
            console.error('LNURL response error:', lnurlResponse);
            const errorMsg = lnurlResponse.reason || 'Payment processing failed';
            if (onPaymentError) {
              onPaymentError(errorMsg);
            }
            alert(`Boltcard payment failed: ${errorMsg}`);
          }
        } else {
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

          const message = `Error processing Boltcard payment.\n\nHTTP error code: ${result.status}${
            errorMessage ? `\n\nError: ${errorMessage}` : ''
          }`;
          
          console.error(message);
          if (onPaymentError) {
            onPaymentError(message);
          }
          alert(message);
        }
      } catch (error) {
        console.error('Error processing Boltcard payment:', error);
        const errorMsg = `Failed to process Boltcard payment: ${error.message}`;
        if (onPaymentError) {
          onPaymentError(errorMsg);
        }
        alert(errorMsg);
      } finally {
        setIsProcessing(false);
        setNfcMessage(''); // Reset for next scan
      }
    })();
  }, [nfcMessage, paymentRequest, soundEnabled, onPaymentSuccess, onPaymentError]);

  // Don't show anything if invoice hasn't been created yet
  if (paymentRequest) {
    return null;
  }

  // Show activation button when no invoice is present
  return (
    <div className="w-full mb-3">
      <button
        onClick={activateNfcScan}
        disabled={hasNFCPermission || !isNfcSupported || isProcessing}
        className={`w-full h-12 rounded-lg text-base font-normal transition-colors shadow-md ${
          hasNFCPermission
            ? 'bg-green-100 dark:bg-green-900 border-2 border-green-500 dark:border-green-400 text-green-700 dark:text-green-300 cursor-default'
            : !isNfcSupported
            ? 'bg-gray-200 dark:bg-gray-700 border-2 border-gray-400 dark:border-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
            : 'bg-white dark:bg-black border-2 border-purple-600 dark:border-purple-500 hover:border-purple-700 dark:hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900 text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300'
        }`}
        style={{ fontFamily: "'Source Sans Pro', sans-serif" }}
      >
        {!isNfcSupported
          ? '🚫 Boltcard not supported on this device'
          : hasNFCPermission
          ? '✓ Boltcard activated - Ready to scan'
          : '📱 Activate Boltcard payments'}
      </button>
      
      {isProcessing && (
        <div className="mt-2 text-center">
          <div className="inline-flex items-center gap-2 text-blue-600 dark:text-blue-400">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 dark:border-blue-400"></div>
            <span className="text-sm">Processing Boltcard payment...</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default NFCPayment;

