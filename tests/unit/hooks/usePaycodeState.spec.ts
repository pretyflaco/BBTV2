/**
 * Tests for usePaycodeState hook
 *
 * @module tests/unit/hooks/usePaycodeState.spec
 */

import { renderHook, act } from '@testing-library/react';
import { usePaycodeState } from '../../../lib/hooks/usePaycodeState';

// ============================================================================
// Test Setup
// ============================================================================

describe('usePaycodeState', () => {
  // ==========================================================================
  // Initial State Tests
  // ==========================================================================

  describe('Initial State', () => {
    it('should initialize with default values', () => {
      const { result } = renderHook(() => usePaycodeState());

      expect(result.current.showPaycode).toBe(false);
      expect(result.current.paycodeAmount).toBe('');
      expect(result.current.paycodeGeneratingPdf).toBe(false);
      expect(result.current.hasPaycodeAmount).toBe(false);
    });
  });

  // ==========================================================================
  // Visibility Tests
  // ==========================================================================

  describe('Visibility State', () => {
    it('should set showPaycode to true', () => {
      const { result } = renderHook(() => usePaycodeState());

      act(() => {
        result.current.setShowPaycode(true);
      });

      expect(result.current.showPaycode).toBe(true);
    });

    it('should set showPaycode to false', () => {
      const { result } = renderHook(() => usePaycodeState());

      act(() => {
        result.current.setShowPaycode(true);
      });

      act(() => {
        result.current.setShowPaycode(false);
      });

      expect(result.current.showPaycode).toBe(false);
    });

    it('should open paycode modal', () => {
      const { result } = renderHook(() => usePaycodeState());

      act(() => {
        result.current.openPaycode();
      });

      expect(result.current.showPaycode).toBe(true);
    });

    it('should close paycode modal', () => {
      const { result } = renderHook(() => usePaycodeState());

      act(() => {
        result.current.openPaycode();
      });

      act(() => {
        result.current.closePaycode();
      });

      expect(result.current.showPaycode).toBe(false);
    });

    it('should toggle paycode visibility from closed to open', () => {
      const { result } = renderHook(() => usePaycodeState());

      expect(result.current.showPaycode).toBe(false);

      act(() => {
        result.current.togglePaycode();
      });

      expect(result.current.showPaycode).toBe(true);
    });

    it('should toggle paycode visibility from open to closed', () => {
      const { result } = renderHook(() => usePaycodeState());

      act(() => {
        result.current.openPaycode();
      });

      act(() => {
        result.current.togglePaycode();
      });

      expect(result.current.showPaycode).toBe(false);
    });

    it('should toggle multiple times correctly', () => {
      const { result } = renderHook(() => usePaycodeState());

      expect(result.current.showPaycode).toBe(false);

      act(() => {
        result.current.togglePaycode();
      });
      expect(result.current.showPaycode).toBe(true);

      act(() => {
        result.current.togglePaycode();
      });
      expect(result.current.showPaycode).toBe(false);

      act(() => {
        result.current.togglePaycode();
      });
      expect(result.current.showPaycode).toBe(true);
    });
  });

  // ==========================================================================
  // Amount Tests
  // ==========================================================================

  describe('Amount State', () => {
    it('should set paycode amount', () => {
      const { result } = renderHook(() => usePaycodeState());

      act(() => {
        result.current.setPaycodeAmount('10000');
      });

      expect(result.current.paycodeAmount).toBe('10000');
      expect(result.current.hasPaycodeAmount).toBe(true);
    });

    it('should clear paycode amount', () => {
      const { result } = renderHook(() => usePaycodeState());

      act(() => {
        result.current.setPaycodeAmount('50000');
      });

      act(() => {
        result.current.clearPaycodeAmount();
      });

      expect(result.current.paycodeAmount).toBe('');
      expect(result.current.hasPaycodeAmount).toBe(false);
    });

    it('should handle empty string amount', () => {
      const { result } = renderHook(() => usePaycodeState());

      act(() => {
        result.current.setPaycodeAmount('');
      });

      expect(result.current.paycodeAmount).toBe('');
      expect(result.current.hasPaycodeAmount).toBe(false);
    });

    it('should handle various amount formats', () => {
      const { result } = renderHook(() => usePaycodeState());

      // Numeric string
      act(() => {
        result.current.setPaycodeAmount('100000');
      });
      expect(result.current.paycodeAmount).toBe('100000');

      // String with decimals (should be allowed as string)
      act(() => {
        result.current.setPaycodeAmount('100.50');
      });
      expect(result.current.paycodeAmount).toBe('100.50');

      // Large amount
      act(() => {
        result.current.setPaycodeAmount('21000000000000');
      });
      expect(result.current.paycodeAmount).toBe('21000000000000');
    });
  });

  // ==========================================================================
  // PDF Generation Tests
  // ==========================================================================

  describe('PDF Generation State', () => {
    it('should set paycodeGeneratingPdf to true', () => {
      const { result } = renderHook(() => usePaycodeState());

      act(() => {
        result.current.setPaycodeGeneratingPdf(true);
      });

      expect(result.current.paycodeGeneratingPdf).toBe(true);
    });

    it('should set paycodeGeneratingPdf to false', () => {
      const { result } = renderHook(() => usePaycodeState());

      act(() => {
        result.current.setPaycodeGeneratingPdf(true);
      });

      act(() => {
        result.current.setPaycodeGeneratingPdf(false);
      });

      expect(result.current.paycodeGeneratingPdf).toBe(false);
    });

    it('should start PDF generation', () => {
      const { result } = renderHook(() => usePaycodeState());

      act(() => {
        result.current.startPdfGeneration();
      });

      expect(result.current.paycodeGeneratingPdf).toBe(true);
    });

    it('should finish PDF generation', () => {
      const { result } = renderHook(() => usePaycodeState());

      act(() => {
        result.current.startPdfGeneration();
      });

      act(() => {
        result.current.finishPdfGeneration();
      });

      expect(result.current.paycodeGeneratingPdf).toBe(false);
    });
  });

  // ==========================================================================
  // Combined Actions Tests
  // ==========================================================================

  describe('Combined Actions', () => {
    it('should reset all paycode state', () => {
      const { result } = renderHook(() => usePaycodeState());

      // Set various states
      act(() => {
        result.current.openPaycode();
        result.current.setPaycodeAmount('25000');
        result.current.startPdfGeneration();
      });

      expect(result.current.showPaycode).toBe(true);
      expect(result.current.paycodeAmount).toBe('25000');
      expect(result.current.paycodeGeneratingPdf).toBe(true);

      // Reset everything
      act(() => {
        result.current.resetPaycode();
      });

      expect(result.current.showPaycode).toBe(false);
      expect(result.current.paycodeAmount).toBe('');
      expect(result.current.paycodeGeneratingPdf).toBe(false);
      expect(result.current.hasPaycodeAmount).toBe(false);
    });

    it('should open paycode with a specific amount', () => {
      const { result } = renderHook(() => usePaycodeState());

      act(() => {
        result.current.openPaycodeWithAmount('100000');
      });

      expect(result.current.showPaycode).toBe(true);
      expect(result.current.paycodeAmount).toBe('100000');
      expect(result.current.hasPaycodeAmount).toBe(true);
    });

    it('should open paycode with empty amount (any amount)', () => {
      const { result } = renderHook(() => usePaycodeState());

      act(() => {
        result.current.openPaycodeWithAmount('');
      });

      expect(result.current.showPaycode).toBe(true);
      expect(result.current.paycodeAmount).toBe('');
      expect(result.current.hasPaycodeAmount).toBe(false);
    });
  });

  // ==========================================================================
  // Callback Stability Tests
  // ==========================================================================

  describe('Callback Stability', () => {
    it('should maintain stable setShowPaycode reference', () => {
      const { result, rerender } = renderHook(() => usePaycodeState());

      const firstRef = result.current.setShowPaycode;

      rerender();

      expect(result.current.setShowPaycode).toBe(firstRef);
    });

    it('should maintain stable openPaycode reference', () => {
      const { result, rerender } = renderHook(() => usePaycodeState());

      const firstRef = result.current.openPaycode;

      rerender();

      expect(result.current.openPaycode).toBe(firstRef);
    });

    it('should maintain stable closePaycode reference', () => {
      const { result, rerender } = renderHook(() => usePaycodeState());

      const firstRef = result.current.closePaycode;

      rerender();

      expect(result.current.closePaycode).toBe(firstRef);
    });

    it('should maintain stable togglePaycode reference', () => {
      const { result, rerender } = renderHook(() => usePaycodeState());

      const firstRef = result.current.togglePaycode;

      rerender();

      expect(result.current.togglePaycode).toBe(firstRef);
    });

    it('should maintain stable setPaycodeAmount reference', () => {
      const { result, rerender } = renderHook(() => usePaycodeState());

      const firstRef = result.current.setPaycodeAmount;

      rerender();

      expect(result.current.setPaycodeAmount).toBe(firstRef);
    });

    it('should maintain stable clearPaycodeAmount reference', () => {
      const { result, rerender } = renderHook(() => usePaycodeState());

      const firstRef = result.current.clearPaycodeAmount;

      rerender();

      expect(result.current.clearPaycodeAmount).toBe(firstRef);
    });

    it('should maintain stable setPaycodeGeneratingPdf reference', () => {
      const { result, rerender } = renderHook(() => usePaycodeState());

      const firstRef = result.current.setPaycodeGeneratingPdf;

      rerender();

      expect(result.current.setPaycodeGeneratingPdf).toBe(firstRef);
    });

    it('should maintain stable startPdfGeneration reference', () => {
      const { result, rerender } = renderHook(() => usePaycodeState());

      const firstRef = result.current.startPdfGeneration;

      rerender();

      expect(result.current.startPdfGeneration).toBe(firstRef);
    });

    it('should maintain stable finishPdfGeneration reference', () => {
      const { result, rerender } = renderHook(() => usePaycodeState());

      const firstRef = result.current.finishPdfGeneration;

      rerender();

      expect(result.current.finishPdfGeneration).toBe(firstRef);
    });

    it('should maintain stable resetPaycode reference', () => {
      const { result, rerender } = renderHook(() => usePaycodeState());

      const firstRef = result.current.resetPaycode;

      rerender();

      expect(result.current.resetPaycode).toBe(firstRef);
    });

    it('should maintain stable openPaycodeWithAmount reference', () => {
      const { result, rerender } = renderHook(() => usePaycodeState());

      const firstRef = result.current.openPaycodeWithAmount;

      rerender();

      expect(result.current.openPaycodeWithAmount).toBe(firstRef);
    });
  });

  // ==========================================================================
  // Derived State Tests
  // ==========================================================================

  describe('Derived State', () => {
    it('should update hasPaycodeAmount when amount is set', () => {
      const { result } = renderHook(() => usePaycodeState());

      expect(result.current.hasPaycodeAmount).toBe(false);

      act(() => {
        result.current.setPaycodeAmount('1000');
      });

      expect(result.current.hasPaycodeAmount).toBe(true);
    });

    it('should update hasPaycodeAmount when amount is cleared', () => {
      const { result } = renderHook(() => usePaycodeState());

      act(() => {
        result.current.setPaycodeAmount('1000');
      });

      expect(result.current.hasPaycodeAmount).toBe(true);

      act(() => {
        result.current.clearPaycodeAmount();
      });

      expect(result.current.hasPaycodeAmount).toBe(false);
    });

    it('should correctly identify empty string as no amount', () => {
      const { result } = renderHook(() => usePaycodeState());

      act(() => {
        result.current.setPaycodeAmount('');
      });

      expect(result.current.hasPaycodeAmount).toBe(false);
    });

    it('should correctly identify zero as having an amount', () => {
      const { result } = renderHook(() => usePaycodeState());

      act(() => {
        result.current.setPaycodeAmount('0');
      });

      // '0' is a non-empty string, so hasPaycodeAmount should be true
      expect(result.current.hasPaycodeAmount).toBe(true);
    });
  });

  // ==========================================================================
  // Workflow Tests
  // ==========================================================================

  describe('Workflow: User generates a paycode with specific amount', () => {
    it('should handle complete paycode generation flow', () => {
      const { result } = renderHook(() => usePaycodeState());

      // User clicks to open paycode modal
      act(() => {
        result.current.openPaycode();
      });

      expect(result.current.showPaycode).toBe(true);

      // User enters amount
      act(() => {
        result.current.setPaycodeAmount('50000');
      });

      expect(result.current.paycodeAmount).toBe('50000');
      expect(result.current.hasPaycodeAmount).toBe(true);

      // User clicks generate PDF
      act(() => {
        result.current.startPdfGeneration();
      });

      expect(result.current.paycodeGeneratingPdf).toBe(true);

      // PDF generation completes
      act(() => {
        result.current.finishPdfGeneration();
      });

      expect(result.current.paycodeGeneratingPdf).toBe(false);

      // User closes modal
      act(() => {
        result.current.closePaycode();
      });

      expect(result.current.showPaycode).toBe(false);
      // Amount should still be preserved
      expect(result.current.paycodeAmount).toBe('50000');
    });
  });

  describe('Workflow: User generates a paycode for any amount', () => {
    it('should handle any-amount paycode flow', () => {
      const { result } = renderHook(() => usePaycodeState());

      // User opens with no specific amount
      act(() => {
        result.current.openPaycode();
      });

      expect(result.current.showPaycode).toBe(true);
      expect(result.current.paycodeAmount).toBe('');
      expect(result.current.hasPaycodeAmount).toBe(false);

      // User generates PDF without specifying amount
      act(() => {
        result.current.startPdfGeneration();
      });

      expect(result.current.paycodeGeneratingPdf).toBe(true);

      act(() => {
        result.current.finishPdfGeneration();
      });

      expect(result.current.paycodeGeneratingPdf).toBe(false);
    });
  });

  describe('Workflow: User cancels paycode generation', () => {
    it('should properly reset when user cancels', () => {
      const { result } = renderHook(() => usePaycodeState());

      // User opens modal and enters amount
      act(() => {
        result.current.openPaycodeWithAmount('25000');
      });

      expect(result.current.showPaycode).toBe(true);
      expect(result.current.paycodeAmount).toBe('25000');

      // User decides to cancel
      act(() => {
        result.current.resetPaycode();
      });

      expect(result.current.showPaycode).toBe(false);
      expect(result.current.paycodeAmount).toBe('');
      expect(result.current.paycodeGeneratingPdf).toBe(false);
    });
  });

  describe('Workflow: Multiple paycode generations in session', () => {
    it('should handle generating multiple paycodes', () => {
      const { result } = renderHook(() => usePaycodeState());

      // First paycode
      act(() => {
        result.current.openPaycodeWithAmount('10000');
      });
      act(() => {
        result.current.startPdfGeneration();
      });
      act(() => {
        result.current.finishPdfGeneration();
      });
      act(() => {
        result.current.resetPaycode();
      });

      // Second paycode with different amount
      act(() => {
        result.current.openPaycodeWithAmount('50000');
      });

      expect(result.current.showPaycode).toBe(true);
      expect(result.current.paycodeAmount).toBe('50000');

      act(() => {
        result.current.startPdfGeneration();
      });
      act(() => {
        result.current.finishPdfGeneration();
      });
      act(() => {
        result.current.resetPaycode();
      });

      // Third paycode (any amount)
      act(() => {
        result.current.openPaycode();
      });

      expect(result.current.showPaycode).toBe(true);
      expect(result.current.paycodeAmount).toBe('');
      expect(result.current.hasPaycodeAmount).toBe(false);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('Edge Cases', () => {
    it('should handle rapid state changes', () => {
      const { result } = renderHook(() => usePaycodeState());

      act(() => {
        result.current.openPaycode();
        result.current.closePaycode();
        result.current.openPaycode();
      });

      expect(result.current.showPaycode).toBe(true);
    });

    it('should handle setting same amount multiple times', () => {
      const { result } = renderHook(() => usePaycodeState());

      act(() => {
        result.current.setPaycodeAmount('1000');
      });

      act(() => {
        result.current.setPaycodeAmount('1000');
      });

      expect(result.current.paycodeAmount).toBe('1000');
    });

    it('should handle reset during PDF generation', () => {
      const { result } = renderHook(() => usePaycodeState());

      act(() => {
        result.current.openPaycodeWithAmount('5000');
        result.current.startPdfGeneration();
      });

      expect(result.current.paycodeGeneratingPdf).toBe(true);

      // User force-resets during generation
      act(() => {
        result.current.resetPaycode();
      });

      expect(result.current.showPaycode).toBe(false);
      expect(result.current.paycodeAmount).toBe('');
      expect(result.current.paycodeGeneratingPdf).toBe(false);
    });
  });
});
