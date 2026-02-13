/**
 * NpubCashSetup - Connect via npub.cash Lightning Address
 *
 * Allows users to receive payments to their npub.cash address.
 * npub.cash converts Lightning payments to Cashu ecash tokens
 * that can be claimed with the user's Nostr key.
 *
 * Benefits:
 * - No API key required - just enter your npub.cash address
 * - Zero fees (npub.cash uses Blink, so intraledger)
 * - Privacy via Cashu ecash tokens
 * - Claim tokens anytime with your nsec
 *
 * Every valid npub automatically has a npub.cash Lightning address.
 */

import { nip19 } from "nostr-tools"
import { useState, useEffect, useRef } from "react"

import { useTheme } from "../../lib/hooks/useTheme"
import { validateNpubCashAddress, probeNpubCashAddress } from "../../lib/lnurl"

interface NpubCashCompleteData {
  type: "npub-cash"
  address: string
  localpart: string
  isNpub: boolean
  pubkey: string | undefined
  label: string
}

interface NpubCashSetupProps {
  onComplete: (data: NpubCashCompleteData) => void
  onCancel: () => void
  userPublicKey?: string
}

interface AddressInfo {
  address: string
  localpart: string
  isNpub: boolean
  pubkey: string | undefined
  minSats: number
  maxSats: number
}

export default function NpubCashSetup({
  onComplete,
  onCancel,
  userPublicKey,
}: NpubCashSetupProps) {
  const { darkMode } = useTheme()

  const [address, setAddress] = useState("")
  const [label, setLabel] = useState("")
  const [validating, setValidating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [addressInfo, setAddressInfo] = useState<AddressInfo | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)

  // Convert hex pubkey to npub if available
  const userNpub = userPublicKey ? nip19.npubEncode(userPublicKey) : null
  const autoConfigAddress = userNpub ? `${userNpub}@npub.cash` : null

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Auto-configure with user's npub
  const handleAutoConfig = async () => {
    if (!autoConfigAddress) return

    setAddress(autoConfigAddress)
    setLabel("My npub.cash Wallet")
    setValidating(true)
    setError(null)
    setAddressInfo(null)

    try {
      // Validate format
      const validation = validateNpubCashAddress(autoConfigAddress)
      if (!validation.valid) {
        setError(validation.error || "Invalid npub.cash address")
        setValidating(false)
        return
      }

      // Probe to confirm it works
      const probeResult = await probeNpubCashAddress(autoConfigAddress)

      if (!probeResult.valid) {
        setError(probeResult.error || "Could not reach npub.cash endpoint")
        setValidating(false)
        return
      }

      setAddressInfo({
        address: autoConfigAddress,
        localpart: validation.localpart!,
        isNpub: true,
        pubkey: validation.pubkey,
        minSats: probeResult.minSats!,
        maxSats: probeResult.maxSats!,
      })

      setValidating(false)
    } catch (err: unknown) {
      console.error("Auto-config validation error:", err)
      setError((err as Error).message || "Failed to validate npub.cash address")
      setValidating(false)
    }
  }

  const validateAddress = async (addr: string) => {
    if (!addr) return

    setValidating(true)
    setError(null)
    setAddressInfo(null)

    try {
      // First validate format
      const validation = validateNpubCashAddress(addr)
      if (!validation.valid) {
        setError(validation.error || "Invalid npub.cash address")
        setValidating(false)
        return
      }

      // Probe the endpoint to confirm it responds
      const probeResult = await probeNpubCashAddress(addr)

      if (!probeResult.valid) {
        setError(probeResult.error || "Could not reach npub.cash endpoint")
        setValidating(false)
        return
      }

      setAddressInfo({
        address: addr,
        localpart: validation.localpart!,
        isNpub: validation.isNpub!,
        pubkey: validation.pubkey,
        minSats: probeResult.minSats!,
        maxSats: probeResult.maxSats!,
      })

      setValidating(false)
    } catch (err: unknown) {
      console.error("Validation error:", err)
      setError((err as Error).message || "Failed to validate npub.cash address")
      setValidating(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (!address.trim()) {
      setError("Please enter your npub.cash address")
      return
    }

    if (!addressInfo) {
      await validateAddress(address.trim())
      return
    }

    // Return the connection data to parent
    onComplete({
      type: "npub-cash",
      address: addressInfo.address,
      localpart: addressInfo.localpart,
      isNpub: addressInfo.isNpub,
      pubkey: addressInfo.pubkey,
      label: label.trim() || addressInfo.address,
    })
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.trim()

    // Auto-append @npub.cash if user only enters npub or username
    // Only if it doesn't contain @ yet
    if (
      value &&
      !value.includes("@") &&
      (value.startsWith("npub1") || value.length > 3)
    ) {
      // Don't auto-append yet, but show hint
    }

    setAddress(value)
    setError(null)
    setAddressInfo(null)
  }

  const handleValidateClick = () => {
    let addr = address.trim()

    // Auto-append @npub.cash if missing
    if (addr && !addr.includes("@")) {
      addr = `${addr}@npub.cash`
      setAddress(addr)
    }

    validateAddress(addr)
  }

  // Check if input looks valid
  const hasInput = address.trim().length >= 5

  return (
    <div
      className={`rounded-2xl p-6 ${darkMode ? "bg-gray-800" : "bg-white"} shadow-xl max-w-md mx-auto`}
    >
      {/* Back button */}
      <button
        onClick={onCancel}
        className={`mb-4 p-2 rounded-lg transition-colors ${
          darkMode
            ? "text-gray-400 hover:text-white hover:bg-gray-700"
            : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
        }`}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M10 19l-7-7m0 0l7-7m-7 7h18"
          />
        </svg>
      </button>

      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 mb-4">
          <span className="text-3xl">🥜</span>
        </div>
        <h2 className={`text-xl font-bold ${darkMode ? "text-white" : "text-gray-900"}`}>
          Connect npub.cash Wallet
        </h2>
        <p className={`mt-2 text-sm ${darkMode ? "text-gray-400" : "text-gray-600"}`}>
          Receive payments as Cashu ecash tokens
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Quick Setup with User's npub */}
        {autoConfigAddress && !addressInfo && (
          <div
            className={`p-4 rounded-xl border-2 ${
              darkMode
                ? "bg-gradient-to-br from-emerald-900/30 to-teal-900/30 border-emerald-500/50"
                : "bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-300"
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">⚡</span>
              <span
                className={`font-semibold ${darkMode ? "text-emerald-400" : "text-emerald-700"}`}
              >
                Quick Setup
              </span>
            </div>
            <p className={`text-sm mb-3 ${darkMode ? "text-gray-300" : "text-gray-600"}`}>
              Use your Nostr identity to receive payments instantly!
            </p>
            <button
              type="button"
              onClick={handleAutoConfig}
              disabled={validating}
              className={`w-full py-3 px-4 rounded-xl font-medium transition-all ${
                validating
                  ? `${darkMode ? "bg-gray-700 text-gray-500" : "bg-gray-200 text-gray-400"} cursor-wait`
                  : "bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white shadow-lg hover:shadow-emerald-500/25"
              }`}
            >
              {validating ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Setting up...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  🥜 Use my npub
                </span>
              )}
            </button>
            <p
              className={`mt-2 text-xs text-center ${darkMode ? "text-gray-500" : "text-gray-500"}`}
            >
              Your address:{" "}
              <span className="font-mono">{userNpub?.slice(0, 12)}...@npub.cash</span>
            </p>
          </div>
        )}

        {/* Divider - only show if auto-config is available and not yet validated */}
        {autoConfigAddress && !addressInfo && (
          <div className="flex items-center gap-3">
            <div className={`flex-1 h-px ${darkMode ? "bg-gray-700" : "bg-gray-200"}`} />
            <span className={`text-xs ${darkMode ? "text-gray-500" : "text-gray-400"}`}>
              or enter manually
            </span>
            <div className={`flex-1 h-px ${darkMode ? "bg-gray-700" : "bg-gray-200"}`} />
          </div>
        )}

        {/* npub.cash Address Input */}
        <div>
          <label
            className={`block text-sm font-medium mb-2 ${darkMode ? "text-gray-300" : "text-gray-700"}`}
          >
            npub.cash Address
          </label>
          <input
            ref={inputRef}
            type="text"
            value={address}
            onChange={handleInputChange}
            placeholder="npub1abc...@npub.cash or username@npub.cash"
            autoComplete="off"
            data-1p-ignore="true"
            data-lpignore="true"
            className={`w-full px-4 py-3 rounded-xl border-2 text-sm transition-colors ${
              darkMode
                ? "bg-gray-700 border-gray-600 text-white placeholder-gray-500 focus:border-emerald-500"
                : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-emerald-500"
            } focus:outline-none focus:ring-2 focus:ring-emerald-500/20`}
          />
          <p className={`mt-2 text-xs ${darkMode ? "text-gray-500" : "text-gray-500"}`}>
            Every npub automatically has a npub.cash Lightning address
          </p>
        </div>

        {/* Label Input */}
        <div>
          <label
            className={`block text-sm font-medium mb-2 ${darkMode ? "text-gray-300" : "text-gray-700"}`}
          >
            Wallet Name (optional)
          </label>
          <input
            type="text"
            value={label}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setLabel(e.target.value)
            }
            placeholder="My npub.cash Wallet"
            autoComplete="off"
            data-1p-ignore="true"
            data-lpignore="true"
            className={`w-full px-4 py-3 rounded-xl border-2 text-sm transition-colors ${
              darkMode
                ? "bg-gray-700 border-gray-600 text-white placeholder-gray-500 focus:border-emerald-500"
                : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-emerald-500"
            } focus:outline-none focus:ring-2 focus:ring-emerald-500/20`}
          />
        </div>

        {/* Error Display */}
        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
            <p className="text-sm text-red-500">{error}</p>
          </div>
        )}

        {/* Address Info Display */}
        {addressInfo && (
          <div
            className={`p-4 rounded-xl ${darkMode ? "bg-emerald-900/20 border-emerald-500/30" : "bg-emerald-50 border-emerald-200"} border`}
          >
            <div className="flex items-center gap-2 mb-3">
              <svg
                className="w-5 h-5 text-emerald-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <span
                className={`font-medium ${darkMode ? "text-emerald-400" : "text-emerald-700"}`}
              >
                npub.cash Address Valid!
              </span>
            </div>

            <div className="space-y-2 text-sm">
              <div className={darkMode ? "text-gray-300" : "text-gray-600"}>
                <span className="font-medium">Address:</span>{" "}
                <span className="font-mono text-xs break-all">{addressInfo.address}</span>
              </div>
              <div className={darkMode ? "text-gray-300" : "text-gray-600"}>
                <span className="font-medium">Type:</span>{" "}
                {addressInfo.isNpub ? "Nostr Public Key (npub)" : "Username"}
              </div>
              <div className={darkMode ? "text-gray-300" : "text-gray-600"}>
                <span className="font-medium">Limits:</span> {addressInfo.minSats} -{" "}
                {addressInfo.maxSats?.toLocaleString()} sats
              </div>
            </div>

            {/* Info notice */}
            <div
              className={`mt-3 pt-3 border-t ${darkMode ? "border-gray-700" : "border-emerald-200"}`}
            >
              <p className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                🥜 Payments will be converted to Cashu ecash tokens. Claim them anytime
                using your Nostr key.
              </p>
            </div>
          </div>
        )}

        {/* Validate Button (shown when input present but not validated) */}
        {hasInput && !addressInfo && !validating && (
          <button
            type="button"
            onClick={handleValidateClick}
            className="w-full py-3 px-4 rounded-xl font-medium transition-all bg-emerald-500 hover:bg-emerald-600 text-white"
          >
            Validate Address
          </button>
        )}

        {/* Validating State */}
        {validating && (
          <div
            className={`flex items-center justify-center gap-3 py-3 px-4 rounded-xl ${
              darkMode ? "bg-gray-700" : "bg-gray-100"
            }`}
          >
            <svg
              className="w-5 h-5 animate-spin text-emerald-500"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span className={darkMode ? "text-gray-300" : "text-gray-600"}>
              Validating...
            </span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className={`flex-1 py-3 px-4 rounded-xl font-medium border-2 transition-colors ${
              darkMode
                ? "border-gray-600 text-gray-300 hover:bg-gray-700"
                : "border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            Back
          </button>
          <button
            type="submit"
            disabled={!addressInfo || validating}
            className={`flex-1 py-3 px-4 rounded-xl font-medium transition-all ${
              addressInfo
                ? "bg-gradient-to-r from-emerald-400 to-teal-500 hover:from-emerald-500 hover:to-teal-600 text-white shadow-lg"
                : `${darkMode ? "bg-gray-700 text-gray-500" : "bg-gray-200 text-gray-400"} cursor-not-allowed`
            }`}
          >
            Connect Wallet
          </button>
        </div>
      </form>

      {/* Info Section */}
      <div
        className={`mt-6 pt-6 border-t ${darkMode ? "border-gray-700" : "border-gray-200"}`}
      >
        <h3
          className={`text-sm font-medium mb-3 ${darkMode ? "text-gray-300" : "text-gray-700"}`}
        >
          How npub.cash works
        </h3>
        <ul
          className={`space-y-2 text-sm ${darkMode ? "text-gray-500" : "text-gray-500"}`}
        >
          <li className="flex items-start gap-2">
            <svg
              className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M5 13l4 4L19 7"
              />
            </svg>
            <span>Lightning payments are converted to Cashu ecash</span>
          </li>
          <li className="flex items-start gap-2">
            <svg
              className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M5 13l4 4L19 7"
              />
            </svg>
            <span>Claim tokens anytime with your Nostr key (nsec)</span>
          </li>
          <li className="flex items-start gap-2">
            <svg
              className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M5 13l4 4L19 7"
              />
            </svg>
            <span>Zero fees - npub.cash uses Blink (intraledger)</span>
          </li>
          <li className="flex items-start gap-2">
            <svg
              className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M5 13l4 4L19 7"
              />
            </svg>
            <span>Enhanced privacy via blind signatures</span>
          </li>
        </ul>

        <div
          className={`mt-4 p-3 rounded-lg ${darkMode ? "bg-gray-700/50" : "bg-gray-50"}`}
        >
          <p className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
            💡 <strong>No registration needed</strong> - every valid npub has an npub.cash
            address automatically. Use a Cashu wallet like Minibits, Nutstash, or eNuts to
            claim your tokens.
          </p>
        </div>
      </div>
    </div>
  )
}
