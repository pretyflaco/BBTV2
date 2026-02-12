/**
 * Batch Payments Library
 *
 * Provides functionality for batch payment processing:
 * - CSV parsing with recipient type detection
 * - Recipient validation (Blink, Lightning Address, LNURL)
 * - Fee estimation
 * - Chunked payment execution
 */

// CSV Parser
export {
  parseCSV,
  parseCSVLine,
  detectRecipientType,
  normalizeRecipient,
  generateTemplate,
  quickValidate,
  RECIPIENT_TYPES,
  type RecipientType,
  type ParsedRecipient,
  type ParseResult,
  type QuickValidateResult,
} from "./csv-parser"

// Recipient Validator
export {
  validateRecipient,
  validateAllRecipients,
  validateBlinkUser,
  validateLnAddress,
  validateLnurl,
  ERROR_CODES,
  type ValidationResult,
  type ValidationError,
  type LnurlData,
  type ValidationOptions,
  type AllValidationResults,
} from "./recipient-validator"

// Fee Calculator
export {
  estimateFee,
  calculateFeeSummary,
  validateBalance,
  DEFAULT_FEE_RATE,
  MIN_FEE_SATS,
  MAX_FEE_RATE,
  type FeeEstimate,
  type FeeSummary,
  type BalanceValidation,
} from "./fee-calculator"

// Payment Executor
export {
  processPayment,
  executeBatchPayments,
  PAYMENT_ERROR_CODES,
  type PaymentResult,
  type PaymentResultWithRecipient,
  type BatchExecutionResult,
} from "./payment-executor"
