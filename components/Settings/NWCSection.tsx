/**
 * NWCSection - Manage NWC (Nostr Wallet Connect) wallets
 */

import { useState, useEffect } from "react"

import { useCombinedAuth } from "../../lib/hooks/useCombinedAuth"
import { useTheme } from "../../lib/hooks/useTheme"
import NWCSetup from "../wallet/NWCSetup"

// Local shapes for NWC data returned by useCombinedAuth (typed as unknown)
interface NWCConnection {
  id: string
  label: string
  walletPubkey: string
  capabilities?: string[]
}

interface NWCBalanceResult {
  success: boolean
  balance?: number
}

interface NWCActionResult {
  success: boolean
  error?: string
}

interface NWCData {
  connectionString: string
  label: string
}

export default function NWCSection() {
  const { darkMode } = useTheme()
  const {
    nwcConnections,
    activeNWC,
    nwcLoading: loading,
    addNWCConnection: addConnection,
    removeNWCConnection: removeConnection,
    setActiveNWC: setActiveConnection,
    nwcGetBalance: getBalance,
    nwcHasCapability: hasCapability,
  } = useCombinedAuth()

  // Cast the unknown arrays/objects to local typed shapes
  const connections = nwcConnections as NWCConnection[]
  const activeConnection = activeNWC as NWCConnection | null

  const [showAddForm, setShowAddForm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [balances, setBalances] = useState<Record<string, number>>({})
  const [loadingBalance, setLoadingBalance] = useState<Record<string, boolean>>({})
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  // Fetch balance for active connection
  useEffect(() => {
    if (activeConnection && hasCapability("get_balance")) {
      fetchBalance(activeConnection.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConnection])

  const fetchBalance = async (connectionId: string) => {
    setLoadingBalance((prev) => ({ ...prev, [connectionId]: true }))

    try {
      const result = (await getBalance()) as NWCBalanceResult
      if (result.success && result.balance !== undefined) {
        setBalances((prev) => ({ ...prev, [connectionId]: result.balance! }))
      }
    } catch (err: unknown) {
      console.error("Failed to fetch balance:", err)
    } finally {
      setLoadingBalance((prev) => ({ ...prev, [connectionId]: false }))
    }
  }

  const handleAddConnection = async (nwcData: NWCData) => {
    setError(null)

    try {
      const result = (await addConnection(
        nwcData.connectionString,
        nwcData.label,
      )) as NWCActionResult

      if (!result.success) {
        setError(result.error || "Failed to add connection")
        return
      }

      setShowAddForm(false)
    } catch (err: unknown) {
      setError((err as Error).message)
    }
  }

  const handleSetActive = async (connectionId: string) => {
    const result = (await setActiveConnection(connectionId)) as NWCActionResult
    if (!result.success) {
      setError(result.error || null)
    }
  }

  const handleDelete = (connectionId: string) => {
    removeConnection(connectionId)
    setConfirmDelete(null)
  }

  const formatBalance = (msats: number | undefined | null): string => {
    if (msats === undefined || msats === null) return "-"
    const sats = Math.floor(msats / 1000)
    return sats.toLocaleString() + " sats"
  }

  if (loading) {
    return (
      <div className={`p-4 rounded-lg ${darkMode ? "bg-gray-800" : "bg-gray-50"}`}>
        <div className="animate-pulse flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-lg ${darkMode ? "bg-gray-700" : "bg-gray-200"}`}
          />
          <div className="flex-1">
            <div
              className={`h-4 w-32 rounded ${darkMode ? "bg-gray-700" : "bg-gray-200"}`}
            />
            <div
              className={`h-3 w-48 rounded mt-2 ${darkMode ? "bg-gray-700" : "bg-gray-200"}`}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3
            className={`text-lg font-semibold ${darkMode ? "text-white" : "text-gray-900"}`}
          >
            NWC Wallets
          </h3>
          <p className={`text-sm ${darkMode ? "text-gray-400" : "text-gray-600"}`}>
            Manage your Nostr Wallet Connect connections
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-600 text-white font-medium text-sm hover:from-purple-600 hover:to-pink-700 transition-all"
        >
          + Add Wallet
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <p className="text-sm text-red-500">{error}</p>
          <button
            onClick={() => setError(null)}
            className="text-xs text-red-400 hover:text-red-300 mt-1"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Add Form Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="max-w-md w-full">
            <NWCSetup
              onComplete={handleAddConnection}
              onCancel={() => setShowAddForm(false)}
            />
          </div>
        </div>
      )}

      {/* Connections List */}
      {connections.length === 0 ? (
        <div
          className={`p-8 rounded-xl border-2 border-dashed text-center ${
            darkMode ? "border-gray-700 bg-gray-800/50" : "border-gray-200 bg-gray-50"
          }`}
        >
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-purple-500/10 mb-4">
            <svg
              className="w-6 h-6 text-purple-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          </div>
          <h4 className={`font-medium ${darkMode ? "text-gray-300" : "text-gray-700"}`}>
            No NWC Wallets Connected
          </h4>
          <p className={`text-sm mt-1 ${darkMode ? "text-gray-500" : "text-gray-500"}`}>
            Connect your first wallet using Nostr Wallet Connect
          </p>
          <button
            onClick={() => setShowAddForm(true)}
            className="mt-4 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium transition-colors"
          >
            Connect Wallet
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {connections.map((conn) => (
            <div
              key={conn.id}
              className={`p-4 rounded-xl border-2 transition-all ${
                conn.id === activeConnection?.id
                  ? darkMode
                    ? "border-purple-500 bg-purple-900/20"
                    : "border-purple-400 bg-purple-50"
                  : darkMode
                    ? "border-gray-700 bg-gray-800 hover:border-gray-600"
                    : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <div className="flex items-start gap-4">
                {/* Icon */}
                <div
                  className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${
                    conn.id === activeConnection?.id
                      ? "bg-gradient-to-br from-purple-500 to-pink-600"
                      : darkMode
                        ? "bg-gray-700"
                        : "bg-gray-100"
                  }`}
                >
                  <svg
                    className={`w-5 h-5 ${
                      conn.id === activeConnection?.id
                        ? "text-white"
                        : darkMode
                          ? "text-gray-400"
                          : "text-gray-500"
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4
                      className={`font-medium ${darkMode ? "text-white" : "text-gray-900"}`}
                    >
                      {conn.label}
                    </h4>
                    {conn.id === activeConnection?.id && (
                      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-purple-500 text-white">
                        Active
                      </span>
                    )}
                  </div>

                  <p
                    className={`text-xs font-mono mt-1 ${
                      darkMode ? "text-gray-500" : "text-gray-400"
                    }`}
                  >
                    {conn.walletPubkey.slice(0, 8)}...{conn.walletPubkey.slice(-8)}
                  </p>

                  {/* Balance */}
                  {conn.id === activeConnection?.id && hasCapability("get_balance") && (
                    <div className="mt-2 flex items-center gap-2">
                      <span
                        className={`text-sm ${darkMode ? "text-gray-400" : "text-gray-600"}`}
                      >
                        Balance:
                      </span>
                      {loadingBalance[conn.id] ? (
                        <span
                          className={`text-sm ${darkMode ? "text-gray-500" : "text-gray-400"}`}
                        >
                          Loading...
                        </span>
                      ) : (
                        <span
                          className={`text-sm font-medium ${
                            darkMode ? "text-amber-400" : "text-amber-600"
                          }`}
                        >
                          {formatBalance(balances[conn.id])}
                        </span>
                      )}
                      <button
                        onClick={() => fetchBalance(conn.id)}
                        disabled={loadingBalance[conn.id]}
                        className={`p-1 rounded transition-colors ${
                          darkMode
                            ? "hover:bg-gray-700 text-gray-500"
                            : "hover:bg-gray-100 text-gray-400"
                        }`}
                      >
                        <svg
                          className={`w-4 h-4 ${loadingBalance[conn.id] ? "animate-spin" : ""}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                          />
                        </svg>
                      </button>
                    </div>
                  )}

                  {/* Capabilities */}
                  <div className="mt-2 flex flex-wrap gap-1">
                    {conn.capabilities?.slice(0, 4).map((cap, i) => (
                      <span
                        key={i}
                        className={`px-2 py-0.5 rounded text-xs ${
                          darkMode
                            ? "bg-gray-700 text-gray-400"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {cap}
                      </span>
                    ))}
                    {(conn.capabilities?.length ?? 0) > 4 && (
                      <span
                        className={`px-2 py-0.5 rounded text-xs ${
                          darkMode
                            ? "bg-gray-700 text-gray-500"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        +{conn.capabilities!.length - 4}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  {conn.id !== activeConnection?.id && (
                    <button
                      onClick={() => handleSetActive(conn.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        darkMode
                          ? "bg-gray-700 text-gray-300 hover:bg-gray-600"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      Set Active
                    </button>
                  )}

                  {confirmDelete === conn.id ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleDelete(conn.id)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600 text-white hover:bg-red-700"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                          darkMode
                            ? "bg-gray-700 text-gray-300"
                            : "bg-gray-200 text-gray-700"
                        }`}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(conn.id)}
                      className={`p-2 rounded-lg transition-colors ${
                        darkMode
                          ? "text-gray-500 hover:text-red-400 hover:bg-gray-700"
                          : "text-gray-400 hover:text-red-500 hover:bg-gray-100"
                      }`}
                    >
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
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info */}
      <div className={`p-4 rounded-lg ${darkMode ? "bg-gray-800/50" : "bg-gray-50"}`}>
        <h4
          className={`text-sm font-medium mb-2 ${darkMode ? "text-gray-300" : "text-gray-700"}`}
        >
          About NWC
        </h4>
        <p className={`text-xs ${darkMode ? "text-gray-500" : "text-gray-500"}`}>
          Nostr Wallet Connect (NIP-47) lets you securely connect any compatible Lightning
          wallet without sharing your private keys. Your wallet app controls all payments.
        </p>
        <a
          href="https://nwc.dev"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 mt-2 text-xs text-purple-500 hover:text-purple-400"
        >
          Learn more about NWC
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
        </a>
      </div>
    </div>
  )
}
