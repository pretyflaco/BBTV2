/**
 * useThermalPrint - React hook for thermal printing vouchers
 * 
 * Provides a simple interface to the ESC/POS printing system for React components.
 * Handles platform detection, adapter selection, and print job management.
 * 
 * Usage:
 * ```jsx
 * import { useThermalPrint } from '@/lib/escpos/hooks/useThermalPrint';
 * 
 * function VoucherComponent({ voucher }) {
 *   const { 
 *     print, 
 *     printMethods, 
 *     selectedMethod, 
 *     setSelectedMethod,
 *     isPrinting,
 *     error 
 *   } = useThermalPrint();
 * 
 *   return (
 *     <button onClick={() => print(voucher)} disabled={isPrinting}>
 *       {isPrinting ? 'Printing...' : 'Print'}
 *     </button>
 *   );
 * }
 * ```
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getPrintService, PrintStatus, ReceiptType } from '../PrintService.js';
import { getConnectionManager } from '../ConnectionManager.js';

/**
 * useThermalPrint hook
 * @param {object} options - Hook options
 * @returns {object} Hook state and methods
 */
export function useThermalPrint(options = {}) {
  // State
  const [printMethods, setPrintMethods] = useState([]);
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [printStatus, setPrintStatus] = useState(null);
  const [error, setError] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [recommendations, setRecommendations] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Refs
  const printServiceRef = useRef(null);
  const connectionManagerRef = useRef(null);

  // Initialize services
  useEffect(() => {
    printServiceRef.current = getPrintService(options);
    connectionManagerRef.current = getConnectionManager();

    // Load available methods
    const loadMethods = async () => {
      setIsLoading(true);
      try {
        const methods = await printServiceRef.current.getAvailableMethods();
        const recs = await printServiceRef.current.getRecommendations();
        
        setPrintMethods(methods);
        setRecommendations(recs);

        // Select recommended method
        const recommended = methods.find(m => m.recommended && m.available);
        if (recommended) {
          setSelectedMethod(recommended.type);
        } else {
          // Fall back to first available
          const firstAvailable = methods.find(m => m.available);
          if (firstAvailable) {
            setSelectedMethod(firstAvailable.type);
          }
        }
      } catch (e) {
        console.error('Error loading print methods:', e);
        setError('Failed to initialize print system');
      } finally {
        setIsLoading(false);
      }
    };

    loadMethods();

    // Subscribe to print events
    const unsubscribeStatus = printServiceRef.current.on('jobStatus', ({ status, error: jobError }) => {
      setPrintStatus(status);
      if (status === PrintStatus.FAILED && jobError) {
        setError(jobError);
      }
    });

    const unsubscribeComplete = printServiceRef.current.on('jobCompleted', (data) => {
      setIsPrinting(false);
      setLastResult({ success: true, ...data });
    });

    const unsubscribeFailed = printServiceRef.current.on('jobFailed', ({ error: jobError }) => {
      setIsPrinting(false);
      setError(jobError);
      setLastResult({ success: false, error: jobError });
    });

    return () => {
      unsubscribeStatus();
      unsubscribeComplete();
      unsubscribeFailed();
    };
  }, []);

  /**
   * Print a voucher
   * @param {object} voucher - Voucher data
   * @param {object} printOptions - Print options
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  const print = useCallback(async (voucher, printOptions = {}) => {
    if (!printServiceRef.current) {
      return { success: false, error: 'Print service not initialized' };
    }

    setIsPrinting(true);
    setError(null);
    setPrintStatus(PrintStatus.PENDING);

    try {
      let result;

      if (selectedMethod && selectedMethod !== 'auto') {
        result = await printServiceRef.current.printWithAdapter(voucher, selectedMethod, printOptions);
      } else {
        result = await printServiceRef.current.printVoucher(voucher, printOptions);
      }

      setLastResult(result);
      
      if (!result.success) {
        setError(result.error);
      }

      return result;
    } catch (e) {
      const errorMsg = e.message || 'Print failed';
      setError(errorMsg);
      setLastResult({ success: false, error: errorMsg });
      return { success: false, error: errorMsg };
    } finally {
      setIsPrinting(false);
    }
  }, [selectedMethod]);

  /**
   * Print with a specific receipt type
   */
  const printStandard = useCallback((voucher, opts = {}) => {
    return print(voucher, { ...opts, receiptType: ReceiptType.STANDARD });
  }, [print]);

  const printMinimal = useCallback((voucher, opts = {}) => {
    return print(voucher, { ...opts, receiptType: ReceiptType.MINIMAL });
  }, [print]);

  const printReissue = useCallback((voucher, opts = {}) => {
    return print(voucher, { ...opts, receiptType: ReceiptType.REISSUE });
  }, [print]);

  /**
   * Change print method
   */
  const selectMethod = useCallback(async (methodType) => {
    setSelectedMethod(methodType);
    
    if (connectionManagerRef.current) {
      try {
        await connectionManagerRef.current.setActiveAdapter(methodType);
      } catch (e) {
        console.warn('Could not set adapter:', e);
      }
    }
  }, []);

  /**
   * Get deep link URL for companion app
   */
  const getDeepLinkUrl = useCallback(async (voucher, opts = {}) => {
    if (!printServiceRef.current) return null;
    try {
      return await printServiceRef.current.getDeepLinkUrl(voucher, opts);
    } catch (e) {
      return null;
    }
  }, []);

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Check if a method is available
   */
  const isMethodAvailable = useCallback((methodType) => {
    const method = printMethods.find(m => m.type === methodType);
    return method?.available || false;
  }, [printMethods]);

  /**
   * Check if on mobile
   */
  const isMobile = useCallback(() => {
    return connectionManagerRef.current?.isMobile() || false;
  }, []);

  return {
    // State
    printMethods,
    selectedMethod,
    isPrinting,
    printStatus,
    error,
    lastResult,
    recommendations,
    isLoading,

    // Methods
    print,
    printStandard,
    printMinimal,
    printReissue,
    selectMethod,
    setSelectedMethod: selectMethod,
    getDeepLinkUrl,
    clearError,
    isMethodAvailable,
    isMobile,

    // Service access (for advanced use)
    printService: printServiceRef.current,
    connectionManager: connectionManagerRef.current,
  };
}

export default useThermalPrint;
