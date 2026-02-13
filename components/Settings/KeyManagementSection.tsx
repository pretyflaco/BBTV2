/**
 * KeyManagementSection - Manage Nostr keys for generated accounts
 *
 * Features:
 * - View public key (npub)
 * - Export private key (nsec) with password verification
 * - Delete local account
 */

import { useState } from "react"

import { useNostrAuth } from "../../lib/hooks/useNostrAuth"
import { useTheme } from "../../lib/hooks/useTheme"
import NostrAuthService from "../../lib/nostr/NostrAuthService"
import CryptoUtils, { type EncryptedData } from "../../lib/storage/CryptoUtils"

// Bech32 encoding for npub/nsec display
const BECH32_ALPHABET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"

function bech32Encode(prefix: string, data: Uint8Array): string {
  // Convert 8-bit bytes to 5-bit groups
  let value = 0
  let bits = 0
  const result: number[] = []

  for (const byte of data) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      bits -= 5
      result.push((value >> bits) & 31)
    }
  }
  if (bits > 0) {
    result.push((value << (5 - bits)) & 31)
  }

  // Calculate checksum (simplified - real bech32 has more complex checksum)
  const polymod = (values: number[]): number => {
    const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]
    let chk = 1
    for (const v of values) {
      const b = chk >> 25
      chk = ((chk & 0x1ffffff) << 5) ^ v
      for (let i = 0; i < 5; i++) {
        if ((b >> i) & 1) chk ^= GEN[i]
      }
    }
    return chk
  }

  const hrpExpand = (hrp: string): number[] => {
    const ret: number[] = []
    for (const c of hrp) {
      ret.push(c.charCodeAt(0) >> 5)
    }
    ret.push(0)
    for (const c of hrp) {
      ret.push(c.charCodeAt(0) & 31)
    }
    return ret
  }

  const createChecksum = (hrp: string, data: number[]): number[] => {
    const values = [...hrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0]
    const mod = polymod(values) ^ 1
    const ret: number[] = []
    for (let p = 0; p < 6; p++) {
      ret.push((mod >> (5 * (5 - p))) & 31)
    }
    return ret
  }

  const checksum = createChecksum(prefix, result)
  const combined = [...result, ...checksum]

  return prefix + "1" + combined.map((i) => BECH32_ALPHABET[i]).join("")
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16)
  }
  return bytes
}

type CopiedField = "npub" | "nsec" | null

export default function KeyManagementSection() {
  const { darkMode } = useTheme()
  const { publicKey, method, signOut } = useNostrAuth()

  const [showExportModal, setShowExportModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [password, setPassword] = useState("")
  const [exportedNsec, setExportedNsec] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState<CopiedField>(null)

  // Check if this is a generated account (keys created in-app with password)
  // Only generated accounts have their nsec stored locally
  const isGeneratedAccount = method === "generated"
  const hasStoredNsec = NostrAuthService.hasStoredEncryptedNsec()

  // Show section for all Nostr users (to see their npub)
  // But only show export/delete options for generated accounts
  const canExportKeys = isGeneratedAccount && hasStoredNsec

  // Don't show at all if no public key (not logged in)
  if (!publicKey) {
    return null
  }

  // Convert public key to npub
  const npub = publicKey ? bech32Encode("npub", hexToBytes(publicKey)) : null

  // Handle copy to clipboard
  const handleCopy = async (text: string, type: CopiedField) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(type)
      setTimeout(() => setCopied(null), 2000)
    } catch (err: unknown) {
      console.error("Failed to copy:", err)
    }
  }

  // Handle export nsec
  const handleExportNsec = async () => {
    setLoading(true)
    setError(null)

    try {
      const encryptedNsec = NostrAuthService.getStoredEncryptedNsec()

      if (!encryptedNsec) {
        setError("No encrypted key found")
        setLoading(false)
        return
      }

      // Decrypt with password
      // EncryptedNsecData omits hasPassword but is structurally compatible with EncryptedData
      const privateKey = await CryptoUtils.decryptWithPassword(
        encryptedNsec as unknown as EncryptedData,
        password,
      )

      // Convert to nsec format
      const nsec = bech32Encode("nsec", hexToBytes(privateKey))
      setExportedNsec(nsec)
      setPassword("")
    } catch (_err: unknown) {
      setError("Incorrect password")
    }

    setLoading(false)
  }

  // Handle delete account
  const handleDeleteAccount = () => {
    NostrAuthService.clearEncryptedNsec()
    NostrAuthService.clearAuthData()
    signOut()
    window.location.reload()
  }

  return (
    <div className="space-y-4">
      <h3
        className={`text-sm font-semibold uppercase tracking-wider ${
          darkMode ? "text-gray-400" : "text-gray-600"
        }`}
      >
        Key Management
      </h3>

      <div className={`rounded-lg p-4 ${darkMode ? "bg-gray-900" : "bg-gray-50"}`}>
        {/* Public Key (npub) */}
        <div className="space-y-3">
          <div>
            <label
              className={`block text-sm font-medium mb-1 ${
                darkMode ? "text-gray-400" : "text-gray-600"
              }`}
            >
              Public Key (npub)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={npub || ""}
                readOnly
                className={`flex-1 px-3 py-2 text-xs font-mono rounded-lg border ${
                  darkMode
                    ? "bg-gray-800 border-gray-700 text-gray-300"
                    : "bg-white border-gray-200 text-gray-700"
                }`}
              />
              <button
                onClick={() => handleCopy(npub!, "npub")}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  copied === "npub"
                    ? "bg-green-500 text-white"
                    : darkMode
                      ? "bg-gray-700 text-gray-300 hover:bg-gray-600"
                      : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                }`}
              >
                {copied === "npub" ? "✓" : "Copy"}
              </button>
            </div>
            <p className={`mt-1 text-xs ${darkMode ? "text-gray-500" : "text-gray-400"}`}>
              Share this to receive messages on Nostr
            </p>
          </div>

          {/* Export Private Key Button - only for generated accounts */}
          {canExportKeys && (
            <button
              onClick={() => setShowExportModal(true)}
              className={`w-full py-2 px-4 rounded-lg text-sm font-medium border transition-colors ${
                darkMode
                  ? "border-amber-600 text-amber-400 hover:bg-amber-900/20"
                  : "border-amber-500 text-amber-600 hover:bg-amber-50"
              }`}
            >
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
                Export Private Key (nsec)
              </span>
            </button>
          )}

          {/* Info for external signer users */}
          {!isGeneratedAccount && (
            <div className={`p-3 rounded-lg ${darkMode ? "bg-gray-800" : "bg-blue-50"}`}>
              <p className={`text-xs ${darkMode ? "text-gray-400" : "text-blue-700"}`}>
                🔐 Your private key is securely managed by your external signer app. This
                app only has access to your public key.
              </p>
            </div>
          )}

          {/* Delete Account Button - only for generated accounts */}
          {canExportKeys && (
            <button
              onClick={() => setShowDeleteModal(true)}
              className={`w-full py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                darkMode
                  ? "text-red-400 hover:bg-red-900/20"
                  : "text-red-600 hover:bg-red-50"
              }`}
            >
              Delete Account from Device
            </button>
          )}
        </div>
      </div>

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
          <div
            className={`w-full max-w-md rounded-xl p-6 ${
              darkMode ? "bg-gray-900" : "bg-white"
            }`}
          >
            <h3
              className={`text-lg font-bold mb-4 ${darkMode ? "text-white" : "text-gray-900"}`}
            >
              Export Private Key
            </h3>

            {!exportedNsec ? (
              <>
                <p
                  className={`text-sm mb-4 ${darkMode ? "text-gray-400" : "text-gray-600"}`}
                >
                  Enter your password to reveal your private key (nsec). Keep it secret!
                </p>

                <input
                  type="password"
                  value={password}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setPassword(e.target.value)
                  }
                  placeholder="Enter your password"
                  className={`w-full px-4 py-3 rounded-lg border mb-3 ${
                    darkMode
                      ? "bg-gray-800 border-gray-700 text-white"
                      : "bg-white border-gray-200 text-gray-900"
                  }`}
                  autoFocus
                  autoComplete="current-password"
                />

                {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowExportModal(false)
                      setPassword("")
                      setError(null)
                    }}
                    className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium ${
                      darkMode
                        ? "bg-gray-700 text-gray-300 hover:bg-gray-600"
                        : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                    }`}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleExportNsec}
                    disabled={!password || loading}
                    className="flex-1 py-2 px-4 rounded-lg text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50"
                  >
                    {loading ? "Decrypting..." : "Reveal Key"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div
                  className={`p-3 rounded-lg mb-4 ${
                    darkMode
                      ? "bg-red-900/20 border border-red-800"
                      : "bg-red-50 border border-red-200"
                  }`}
                >
                  <p
                    className={`text-sm font-medium ${darkMode ? "text-red-300" : "text-red-700"}`}
                  >
                    ⚠️ Never share this key with anyone!
                  </p>
                </div>

                <div
                  className={`p-3 rounded-lg font-mono text-xs break-all mb-4 ${
                    darkMode ? "bg-gray-800 text-gray-300" : "bg-gray-100 text-gray-700"
                  }`}
                >
                  {exportedNsec}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => handleCopy(exportedNsec, "nsec")}
                    className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium ${
                      copied === "nsec"
                        ? "bg-green-500 text-white"
                        : "bg-amber-500 text-white hover:bg-amber-600"
                    }`}
                  >
                    {copied === "nsec" ? "✓ Copied!" : "Copy to Clipboard"}
                  </button>
                  <button
                    onClick={() => {
                      setShowExportModal(false)
                      setExportedNsec(null)
                      setPassword("")
                    }}
                    className={`py-2 px-4 rounded-lg text-sm font-medium ${
                      darkMode
                        ? "bg-gray-700 text-gray-300 hover:bg-gray-600"
                        : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                    }`}
                  >
                    Done
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
          <div
            className={`w-full max-w-md rounded-xl p-6 ${
              darkMode ? "bg-gray-900" : "bg-white"
            }`}
          >
            <h3
              className={`text-lg font-bold mb-4 ${darkMode ? "text-white" : "text-gray-900"}`}
            >
              Delete Account?
            </h3>

            <div
              className={`p-3 rounded-lg mb-4 ${
                darkMode
                  ? "bg-red-900/20 border border-red-800"
                  : "bg-red-50 border border-red-200"
              }`}
            >
              <p className={`text-sm ${darkMode ? "text-red-300" : "text-red-700"}`}>
                <strong>Warning:</strong> This will delete your encrypted private key from
                this device. If you haven&apos;t exported your nsec, you will lose access
                to this Nostr identity forever.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium ${
                  darkMode
                    ? "bg-gray-700 text-gray-300 hover:bg-gray-600"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                }`}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                className="flex-1 py-2 px-4 rounded-lg text-sm font-medium bg-red-500 text-white hover:bg-red-600"
              >
                Delete Account
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
