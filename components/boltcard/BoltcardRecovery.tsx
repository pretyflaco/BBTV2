/**
 * BoltcardRecovery - Recovery UI for orphaned Boltcards
 *
 * Use case: User deleted their card record from the database but the
 * physical card still has keys programmed. Since we never delete the
 * IssuerKey, we can still derive the keys needed to wipe the card.
 *
 * This component allows the user to:
 * 1. Enter the card UID (found on the card or via NFC reader)
 * 2. Derive the wipe keys from their IssuerKey
 * 3. Display the keys as QR code and copyable text
 */

import { useState } from "react"
import { useTheme } from "../../lib/hooks/useTheme"
import { QRCodeSVG } from "qrcode.react"

// ============================================================================
// Types & Interfaces
// ============================================================================

/** Recovery keys data returned from /api/boltcard/recover-keys */
interface RecoveryKeysData {
  uid?: string
  keyVersion?: number
  keys?: Record<string, string>
  wipeJson?: Record<string, unknown>
  instructions?: {
    versionNote?: string
  }
}

/** Props for BoltcardRecovery component */
interface BoltcardRecoveryProps {
  onClose: () => void
}

// ============================================================================
// Component
// ============================================================================

export default function BoltcardRecovery({ onClose }: BoltcardRecoveryProps) {
  const { darkMode } = useTheme()

  const [uid, setUid] = useState("")
  const [version, setVersion] = useState("1")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [wipeKeys, setWipeKeys] = useState<RecoveryKeysData | null>(null)
  const [keysRevealed, setKeysRevealed] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  /**
   * Handle form submission - fetch recovery keys from API
   */
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault()
    setError(null)
    setWipeKeys(null)
    setKeysRevealed(false)

    // Validate UID format
    const normalizedUid = uid.toLowerCase().replace(/[:\s-]/g, "")
    if (!/^[0-9a-f]{14}$/.test(normalizedUid)) {
      setError("Card UID must be 14 hex characters (7 bytes). Example: 04A39493CC8680")
      return
    }

    setLoading(true)

    try {
      const response = await fetch("/api/boltcard/recover-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // Include cookies for session auth
        body: JSON.stringify({
          uid: normalizedUid,
          version: parseInt(version, 10) || 1,
        }),
      })

      const data: RecoveryKeysData & { message?: string; error?: string } =
        await response.json()

      if (!response.ok) {
        throw new Error(data.message || data.error || "Failed to recover keys")
      }

      setWipeKeys(data)
    } catch (err: unknown) {
      console.error("Recovery failed:", err)
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  /**
   * Copy key to clipboard
   */
  const handleCopyKey = async (keyName: string, keyValue: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(keyValue)
      setCopiedKey(keyName)
      setTimeout(() => setCopiedKey(null), 2000)
    } catch (err: unknown) {
      console.error("Failed to copy:", err)
    }
  }

  /**
   * Copy wipe JSON to clipboard
   */
  const handleCopyWipeJson = async (): Promise<void> => {
    if (!wipeKeys?.wipeJson) return
    try {
      await navigator.clipboard.writeText(JSON.stringify(wipeKeys.wipeJson, null, 2))
      setCopiedKey("wipeJson")
      setTimeout(() => setCopiedKey(null), 2000)
    } catch (err: unknown) {
      console.error("Failed to copy:", err)
    }
  }

  /**
   * Reset form to try again
   */
  const handleReset = (): void => {
    setWipeKeys(null)
    setKeysRevealed(false)
    setError(null)
  }

  const wipeJsonString = wipeKeys?.wipeJson ? JSON.stringify(wipeKeys.wipeJson) : null

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center">
      <div
        className={`w-full sm:max-w-md max-h-[90vh] sm:max-h-[85vh] sm:mx-4 sm:rounded-xl shadow-2xl overflow-hidden flex flex-col ${
          darkMode ? "bg-black" : "bg-white"
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-4 py-3 border-b ${
            darkMode ? "border-gray-700" : "border-gray-200"
          }`}
        >
          <h2
            className={`text-lg font-bold ${darkMode ? "text-white" : "text-gray-900"}`}
          >
            Recover Card Keys
          </h2>
          <button
            onClick={onClose}
            className={`p-2 -mr-2 rounded-md ${
              darkMode
                ? "text-gray-400 hover:text-gray-300 hover:bg-gray-800"
                : "text-gray-600 hover:text-gray-800 hover:bg-gray-100"
            }`}
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Introduction */}
          {!wipeKeys && (
            <div className={`p-3 rounded-lg ${darkMode ? "bg-gray-900" : "bg-gray-50"}`}>
              <p className={`text-sm ${darkMode ? "text-gray-300" : "text-gray-600"}`}>
                Use this tool if you've deleted a card from BlinkPOS but the physical card
                still has keys programmed. Enter the card's UID to recover the wipe keys.
              </p>
            </div>
          )}

          {/* UID Input Form */}
          {!wipeKeys && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  className={`block text-sm font-medium mb-1 ${
                    darkMode ? "text-gray-300" : "text-gray-700"
                  }`}
                >
                  Card UID
                </label>
                <input
                  type="text"
                  value={uid}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setUid(e.target.value.toUpperCase())
                  }
                  placeholder="04A39493CC8680"
                  maxLength={20}
                  className={`w-full px-3 py-2 rounded-md border text-sm font-mono ${
                    darkMode
                      ? "bg-gray-800 border-gray-600 text-white placeholder-gray-500"
                      : "bg-white border-gray-300 text-gray-900 placeholder-gray-400"
                  } focus:outline-none focus:ring-2 focus:ring-blink-accent focus:border-transparent`}
                />
                <p
                  className={`mt-1 text-xs ${darkMode ? "text-gray-500" : "text-gray-400"}`}
                >
                  14 hex characters (7 bytes). Find this on the card or use an NFC reader
                  app.
                </p>
              </div>

              <div>
                <label
                  className={`block text-sm font-medium mb-1 ${
                    darkMode ? "text-gray-300" : "text-gray-700"
                  }`}
                >
                  Key Version (optional)
                </label>
                <select
                  value={version}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                    setVersion(e.target.value)
                  }
                  className={`w-full px-3 py-2 rounded-md border text-sm ${
                    darkMode
                      ? "bg-gray-800 border-gray-600 text-white"
                      : "bg-white border-gray-300 text-gray-900"
                  } focus:outline-none focus:ring-2 focus:ring-blink-accent focus:border-transparent`}
                >
                  <option value="1">Version 1 (most common)</option>
                  <option value="2">Version 2</option>
                  <option value="3">Version 3</option>
                  <option value="4">Version 4</option>
                  <option value="5">Version 5</option>
                </select>
                <p
                  className={`mt-1 text-xs ${darkMode ? "text-gray-500" : "text-gray-400"}`}
                >
                  If reset fails, try other versions. Cards increment version when
                  re-programmed.
                </p>
              </div>

              {error && (
                <div
                  className={`p-3 rounded-lg border ${
                    darkMode
                      ? "bg-red-900/10 border-red-500/30"
                      : "bg-red-50 border-red-200"
                  }`}
                >
                  <p className={`text-sm ${darkMode ? "text-red-400" : "text-red-700"}`}>
                    {error}
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !uid.trim()}
                className="w-full py-3 bg-blink-accent text-black text-sm font-medium rounded-lg hover:bg-blink-accent/90 disabled:opacity-50 transition-colors"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                    Recovering Keys...
                  </span>
                ) : (
                  "Recover Keys"
                )}
              </button>
            </form>
          )}

          {/* Success - Security Warning */}
          {wipeKeys && !keysRevealed && (
            <div className="space-y-4">
              <div
                className={`p-4 rounded-lg border ${
                  darkMode
                    ? "bg-yellow-900/10 border-yellow-500/30"
                    : "bg-yellow-50 border-yellow-200"
                }`}
              >
                <h5
                  className={`text-sm font-bold mb-2 flex items-center gap-2 ${darkMode ? "text-yellow-400" : "text-yellow-700"}`}
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  Security Warning
                </h5>
                <p
                  className={`text-xs mb-3 ${darkMode ? "text-yellow-300" : "text-yellow-600"}`}
                >
                  The keys you are about to view are sensitive cryptographic secrets.
                  <strong> Anyone with access to these keys can reset your card.</strong>
                </p>
                <ul
                  className={`text-xs space-y-1 list-disc list-inside ${darkMode ? "text-yellow-300" : "text-yellow-600"}`}
                >
                  <li>Do not share these keys with anyone</li>
                  <li>Do not screenshot or save them insecurely</li>
                  <li>Close this window after you're done</li>
                </ul>
              </div>

              <button
                onClick={() => setKeysRevealed(true)}
                className="w-full py-3 bg-yellow-500 text-black text-sm font-medium rounded-lg hover:bg-yellow-400 transition-colors"
              >
                I Understand, Show Keys
              </button>

              <button
                onClick={handleReset}
                className={`w-full py-2 text-sm font-medium rounded-md transition-colors ${
                  darkMode
                    ? "bg-gray-800 text-gray-300 hover:bg-gray-700"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                }`}
              >
                Try Different UID
              </button>
            </div>
          )}

          {/* Success - Keys Revealed */}
          {wipeKeys && keysRevealed && (
            <>
              {/* Card info */}
              <div
                className={`p-3 rounded-lg ${darkMode ? "bg-gray-800" : "bg-gray-100"}`}
              >
                <div className="flex justify-between text-sm">
                  <span className={darkMode ? "text-gray-400" : "text-gray-500"}>
                    Card UID
                  </span>
                  <span
                    className={`font-mono ${darkMode ? "text-white" : "text-gray-900"}`}
                  >
                    {wipeKeys.uid?.toUpperCase() || uid.toUpperCase()}
                  </span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className={darkMode ? "text-gray-400" : "text-gray-500"}>
                    Key Version
                  </span>
                  <span className={darkMode ? "text-white" : "text-gray-900"}>
                    {wipeKeys.keyVersion || version}
                  </span>
                </div>
              </div>

              {/* Wipe JSON QR Code */}
              {wipeJsonString && (
                <div
                  className={`p-4 rounded-lg ${darkMode ? "bg-gray-800" : "bg-gray-100"}`}
                >
                  <p
                    className={`text-xs text-center mb-3 ${darkMode ? "text-gray-400" : "text-gray-500"}`}
                  >
                    Scan with NFC Programmer app (Reset screen)
                  </p>
                  <div className="flex justify-center mb-3">
                    <div className="p-3 bg-white rounded-lg">
                      <QRCodeSVG
                        value={wipeJsonString}
                        size={180}
                        level="M"
                        includeMargin={false}
                      />
                    </div>
                  </div>
                  <button
                    onClick={handleCopyWipeJson}
                    className={`w-full py-2 text-xs font-medium rounded-md transition-colors flex items-center justify-center gap-2 ${
                      copiedKey === "wipeJson"
                        ? "bg-green-500 text-white"
                        : darkMode
                          ? "bg-gray-700 text-gray-300 hover:bg-gray-600"
                          : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                    }`}
                  >
                    {copiedKey === "wipeJson" ? (
                      <>
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
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                        Copied!
                      </>
                    ) : (
                      <>
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
                            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                          />
                        </svg>
                        Copy Wipe JSON
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Individual keys with copy buttons */}
              <div
                className={`rounded-lg overflow-hidden ${darkMode ? "bg-gray-800" : "bg-gray-100"}`}
              >
                <div className={`px-3 py-2 ${darkMode ? "bg-gray-700" : "bg-gray-200"}`}>
                  <h5
                    className={`text-xs font-medium ${darkMode ? "text-gray-300" : "text-gray-700"}`}
                  >
                    Individual Keys (for manual entry)
                  </h5>
                </div>
                <div className="p-2 space-y-1">
                  {wipeKeys.keys &&
                    Object.entries(wipeKeys.keys).map(([keyName, keyValue]) => (
                      <button
                        key={keyName}
                        onClick={() => handleCopyKey(keyName, keyValue)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-md transition-colors ${
                          copiedKey === keyName
                            ? "bg-green-500 text-white"
                            : darkMode
                              ? "hover:bg-gray-700"
                              : "hover:bg-gray-200"
                        }`}
                      >
                        <span
                          className={`text-xs font-bold ${
                            copiedKey === keyName ? "text-white" : "text-blink-accent"
                          }`}
                        >
                          {keyName.toUpperCase()}
                        </span>
                        <span
                          className={`font-mono text-xs ${
                            copiedKey === keyName
                              ? "text-white"
                              : darkMode
                                ? "text-gray-300"
                                : "text-gray-700"
                          }`}
                        >
                          {copiedKey === keyName ? "Copied!" : keyValue}
                        </span>
                      </button>
                    ))}
                </div>
              </div>

              {/* Instructions */}
              <div
                className={`p-3 rounded-lg ${darkMode ? "bg-gray-800" : "bg-gray-100"}`}
              >
                <h5
                  className={`text-xs font-medium mb-2 ${darkMode ? "text-gray-300" : "text-gray-700"}`}
                >
                  How to Reset:
                </h5>
                <ol
                  className={`text-xs space-y-1 list-decimal list-inside ${
                    darkMode ? "text-gray-400" : "text-gray-500"
                  }`}
                >
                  <li>Open the Bolt Card NFC Programmer app</li>
                  <li>Go to the "Reset" screen</li>
                  <li>Scan the QR code above, OR enter keys manually</li>
                  <li>Tap your card on your phone when prompted</li>
                  <li>Wait for reset to complete</li>
                </ol>
              </div>

              {/* Version note */}
              {wipeKeys.instructions?.versionNote && (
                <div
                  className={`p-3 rounded-lg border ${
                    darkMode
                      ? "bg-blue-900/10 border-blue-500/30"
                      : "bg-blue-50 border-blue-200"
                  }`}
                >
                  <p
                    className={`text-xs ${darkMode ? "text-blue-300" : "text-blue-600"}`}
                  >
                    {wipeKeys.instructions.versionNote}
                  </p>
                </div>
              )}

              {/* Action buttons */}
              <div className="space-y-2">
                <button
                  onClick={handleReset}
                  className={`w-full py-2 text-sm font-medium rounded-md transition-colors ${
                    darkMode
                      ? "bg-gray-800 text-gray-300 hover:bg-gray-700"
                      : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  }`}
                >
                  Try Different UID/Version
                </button>

                <button
                  onClick={onClose}
                  className="w-full py-2 bg-blink-accent text-black text-sm font-medium rounded-md hover:bg-blink-accent/90 transition-colors"
                >
                  Done
                </button>
              </div>
            </>
          )}

          {/* App download links */}
          {!wipeKeys && (
            <div
              className={`p-3 rounded-lg border ${
                darkMode
                  ? "bg-blue-900/10 border-blue-500/30"
                  : "bg-blue-50 border-blue-200"
              }`}
            >
              <p
                className={`text-xs mb-2 ${darkMode ? "text-blue-300" : "text-blue-700"}`}
              >
                Need the NFC Programmer app?
              </p>
              <div className="flex gap-2">
                <a
                  href="https://play.google.com/store/apps/details?id=com.lightningnfcapp"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-2 px-3 bg-blink-accent/20 text-blink-accent text-xs font-medium rounded-md text-center hover:bg-blink-accent/30 transition-colors"
                >
                  Google Play
                </a>
                <a
                  href="https://apps.apple.com/app/boltcard-nfc-programmer/id6450968873"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-2 px-3 bg-blink-accent/20 text-blink-accent text-xs font-medium rounded-md text-center hover:bg-blink-accent/30 transition-colors"
                >
                  App Store
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
