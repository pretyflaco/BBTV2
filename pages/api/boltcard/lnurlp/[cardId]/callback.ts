// Types removed: NextApiRequest, NextApiResponse (unused - handler uses custom types)

/**
 * LNURL-pay callback endpoint for Boltcard top-up
 *
 * GET /api/boltcard/lnurlp/[cardId]/callback?amount=...
 *
 * This is called by the wallet when the user wants to pay/top-up
 *
 * Query parameters:
 * - amount: Amount in millisats
 * - comment: Optional comment (up to 100 chars as specified in metadata)
 */

// Re-export the main handler which handles both metadata and callback
export { default } from "../[cardId]"
