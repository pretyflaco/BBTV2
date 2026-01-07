/**
 * Batch Payments Library
 *
 * Provides functionality for batch payment processing:
 * - CSV parsing with recipient type detection
 * - Recipient validation (Blink, Lightning Address, LNURL)
 * - Fee estimation
 * - Chunked payment execution
 */

const csvParser = require('./csv-parser');
const recipientValidator = require('./recipient-validator');
const feeCalculator = require('./fee-calculator');
const paymentExecutor = require('./payment-executor');

module.exports = {
  // CSV Parser
  parseCSV: csvParser.parseCSV,
  parseCSVLine: csvParser.parseCSVLine,
  detectRecipientType: csvParser.detectRecipientType,
  normalizeRecipient: csvParser.normalizeRecipient,
  generateTemplate: csvParser.generateTemplate,
  quickValidate: csvParser.quickValidate,
  RECIPIENT_TYPES: csvParser.RECIPIENT_TYPES,

  // Recipient Validator
  validateRecipient: recipientValidator.validateRecipient,
  validateAllRecipients: recipientValidator.validateAllRecipients,
  validateBlinkUser: recipientValidator.validateBlinkUser,
  validateLnAddress: recipientValidator.validateLnAddress,
  validateLnurl: recipientValidator.validateLnurl,
  ERROR_CODES: recipientValidator.ERROR_CODES,

  // Fee Calculator
  estimateFee: feeCalculator.estimateFee,
  calculateFeeSummary: feeCalculator.calculateFeeSummary,
  validateBalance: feeCalculator.validateBalance,

  // Payment Executor
  processPayment: paymentExecutor.processPayment,
  executeBatchPayments: paymentExecutor.executeBatchPayments,
  PAYMENT_ERROR_CODES: paymentExecutor.PAYMENT_ERROR_CODES
};
