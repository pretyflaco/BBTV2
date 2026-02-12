/**
 * NostrConnectServiceNDK - NIP-46 (Nostr Connect) implementation using NDK
 *
 * This is the NDK implementation using @nostr-dev-kit/ndk instead of nostr-tools.
 * NDK handles NIP-46 more robustly, particularly with nsec.app on iOS Safari.
 *
 * Key differences from nostr-tools implementation:
 * - NDK properly waits for EOSE before processing events
 * - NDK handles subscription lifecycle better
 * - NDK supports both bunker:// URLs and NIP-05 identifiers (e.g., user@nsec.app)
 * - NDK's NDKNip46Signer has better error handling and auth URL support
 *
 * Based on habla.news implementation which works flawlessly with nsec.app.
 *
 * @see https://github.com/nostr-protocol/nips/blob/master/46.md
 * @see https://github.com/nostr-dev-kit/ndk
 */

import NDK, { NDKNip46Signer, NDKPrivateKeySigner, NDKUser } from "@nostr-dev-kit/ndk"
import { nip19 } from "nostr-tools"

// =====================================================================
// Type definitions
// =====================================================================

/** Connection lifecycle states (includes NDK-specific 'awaiting_approval') */
type ConnectionState = "disconnected" | "connecting" | "awaiting_approval" | "connected"

/** Persisted NDK NIP-46 session data */
interface NDKSession {
  publicKey: string
  bunkerUrl: string
  localSignerPrivkey: string
  relays: string[]
  connectedAt: number
}

/** Result returned by every connection attempt */
interface ConnectionResult {
  success: boolean
  publicKey?: string
  error?: string
  /** True when the remote signer needs user approval (nsec.app) */
  needsApproval?: boolean
  /** Auth URL if signer requires browser approval */
  authUrl?: string
  /** Set when connection type is blocked for security reasons */
  securityRejection?: boolean
  /** Set when bunker URL is missing a secret */
  noSecret?: boolean
  /** Set when using an unsupported connection type (nip05 / npub) */
  unsupportedType?: string
}

/** Options for the connect() method */
interface ConnectOptions {
  /** Callback when signer requests auth URL approval */
  onAuthUrl?: (url: string) => void
  /** Callback for status updates */
  onStatusChange?: (state: ConnectionState) => void
  /** Connection timeout in ms */
  timeout?: number
}

/** Unsigned Nostr event template passed to signEvent */
interface UnsignedEvent {
  kind: number
  content?: string
  tags?: string[][]
  created_at?: number
  [key: string]: unknown
}

/** Signed Nostr event (raw format from NDKEvent.rawEvent()) */
interface SignedEvent {
  id: string
  pubkey: string
  created_at: number
  kind: number
  tags: string[][]
  content: string
  sig: string
}

/** Result returned from signEvent */
interface SignEventResult {
  success: boolean
  event?: SignedEvent
  error?: string
}

/** Parsed bunker input variants */
interface ParsedBunkerURL {
  type: "bunker"
  pubkey: string
  relays: string[]
  secret?: string
}

interface ParsedNip05 {
  type: "nip05"
  nip05: string
  pubkey?: undefined
  relays?: undefined
  secret?: undefined
}

interface ParsedNpub {
  type: "npub"
  pubkey: string
  relays: string[]
  nip05?: undefined
  secret?: undefined
}

type ParsedBunkerInput = ParsedBunkerURL | ParsedNip05 | ParsedNpub

/** Session data written via storeSession (before connectedAt is added) */
interface StoreSessionData {
  publicKey: string
  bunkerUrl: string
  localSignerPrivkey: string
  relays: string[]
}

// =====================================================================
// Constants
// =====================================================================

// Default relays for NIP-46 connections
const DEFAULT_NIP46_RELAYS: string[] = [
  "wss://relay.nsec.app",
  "wss://relay.damus.io",
  "wss://nos.lol",
]

// Storage keys
const NDK_NIP46_SESSION_KEY = "blinkpos_ndk_nip46_session"
const NDK_LOCAL_SIGNER_KEY = "blinkpos_ndk_local_signer"

// Connection timeout (60 seconds - NDK handles this better)
const CONNECTION_TIMEOUT = 60000

// =====================================================================
// Service class
// =====================================================================

class NostrConnectServiceNDK {
  /** Dedicated NDK instance for bunker connection */
  static bunkerNDK: NDK | null = null

  /** NIP-46 remote signer */
  static signer: NDKNip46Signer | null = null

  /** Local signer for NIP-46 communication */
  static localSigner: NDKPrivateKeySigner | null = null

  static connectionState: ConnectionState = "disconnected"

  static userPublicKey: string | null = null

  /** Current bunker URL or NIP-05 being connected */
  static currentBunkerInput: string | null = null

  /** Bunker pubkey extracted from bunker URL (for retry without secret) */
  static currentBunkerPubkey: string | null = null

  /** Relays extracted from bunker URL (for retry without secret) */
  static currentRelays: string[] | null = null

  /** Callback for auth URL */
  static authUrlCallback: ((url: string) => void) | null = null

  /**
   * Parse bunker input to determine type and extract settings.
   * Supports:
   * - bunker://pubkey?relay=...&secret=...
   * - user@nsec.app (NIP-05 with NIP-46 support)
   * - npub... (just pubkey, will use default relays)
   * - Raw 64-char hex pubkey
   *
   * @param input - Bunker URL, NIP-05, or npub
   */
  static async parseBunkerInput(input: string): Promise<ParsedBunkerInput | null> {
    if (!input || typeof input !== "string") {
      return null
    }

    const trimmed: string = input.trim()

    // bunker:// URL
    if (trimmed.startsWith("bunker://")) {
      try {
        const url = new URL(trimmed)
        const pubkey: string = url.hostname || url.pathname.replace(/^\/\//, "")
        const relays: string[] = url.searchParams.getAll("relay")
        const secret: string | null = url.searchParams.get("secret")

        if (!pubkey || pubkey.length !== 64) {
          console.error("[NDK-NIP46] Invalid pubkey in bunker URL")
          return null
        }

        return {
          type: "bunker",
          pubkey,
          relays: relays.length > 0 ? relays : DEFAULT_NIP46_RELAYS,
          secret: secret || undefined,
        }
      } catch (e: unknown) {
        console.error("[NDK-NIP46] Failed to parse bunker URL:", e)
        return null
      }
    }

    // NIP-05 identifier (contains @)
    if (trimmed.includes("@")) {
      return {
        type: "nip05",
        nip05: trimmed,
      }
    }

    // npub
    if (trimmed.startsWith("npub")) {
      try {
        const decoded = nip19.decode(trimmed)
        if (decoded.type === "npub") {
          return {
            type: "npub",
            pubkey: decoded.data as string,
            relays: DEFAULT_NIP46_RELAYS,
          }
        }
      } catch (e: unknown) {
        console.error("[NDK-NIP46] Failed to decode npub:", e)
      }
    }

    // Raw hex pubkey
    if (/^[0-9a-f]{64}$/i.test(trimmed)) {
      return {
        type: "npub",
        pubkey: trimmed.toLowerCase(),
        relays: DEFAULT_NIP46_RELAYS,
      }
    }

    return null
  }

  /**
   * Get or create the local signer for NIP-46 communication.
   * This is stored for session persistence.
   *
   * @param forceNew - Force creation of a new signer
   */
  static getOrCreateLocalSigner(forceNew: boolean = false): NDKPrivateKeySigner {
    if (forceNew) {
      this.localSigner = null
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem(NDK_LOCAL_SIGNER_KEY)
      }
    }

    if (this.localSigner) {
      return this.localSigner
    }

    // Try to restore from storage
    if (typeof localStorage !== "undefined") {
      const stored: string | null = localStorage.getItem(NDK_LOCAL_SIGNER_KEY)
      if (stored) {
        try {
          this.localSigner = new NDKPrivateKeySigner(stored)
          console.log("[NDK-NIP46] Restored local signer from storage")
          return this.localSigner
        } catch (e: unknown) {
          console.warn("[NDK-NIP46] Failed to restore local signer:", e)
          localStorage.removeItem(NDK_LOCAL_SIGNER_KEY)
        }
      }
    }

    // Generate new local signer
    console.log("[NDK-NIP46] Generating new local signer")
    this.localSigner = NDKPrivateKeySigner.generate()

    // Store for persistence
    if (typeof localStorage !== "undefined" && this.localSigner.privateKey) {
      localStorage.setItem(NDK_LOCAL_SIGNER_KEY, this.localSigner.privateKey)
    }

    return this.localSigner
  }

  /**
   * Connect using a bunker URL or NIP-05 identifier.
   * This is the main entry point for NIP-46 connections.
   *
   * @param bunkerInput - bunker:// URL or NIP-05 (e.g., user@nsec.app)
   * @param options - Connection options
   */
  static async connect(
    bunkerInput: string,
    options: ConnectOptions = {},
  ): Promise<ConnectionResult> {
    const { onAuthUrl, onStatusChange, timeout = CONNECTION_TIMEOUT } = options

    console.log("[NDK-NIP46] Starting connection...")
    console.log("[NDK-NIP46] Input:", bunkerInput?.slice(0, 50) + "...")

    this.authUrlCallback = onAuthUrl ?? null
    this.currentBunkerInput = bunkerInput

    try {
      // Parse the input to determine connection type
      const parsed: ParsedBunkerInput | null = await this.parseBunkerInput(bunkerInput)
      if (!parsed) {
        return { success: false, error: "Invalid bunker URL or NIP-05 identifier" }
      }

      console.log("[NDK-NIP46] Parsed input type:", parsed.type)

      // SECURITY: Block NIP-05 and npub connections - no secret verification mechanism
      // These connection types cannot prevent hijacking attacks on NIP-46 relays
      // See: Mike Dilger security disclosure on NIP-46 relay monitoring attacks
      if (parsed.type === "nip05" || parsed.type === "npub") {
        console.error(
          "[NDK-NIP46] SECURITY: NIP-05 and npub connections blocked (no secret mechanism)",
        )
        return {
          success: false,
          error:
            "NIP-05 and npub connections are not supported for security reasons. Please use a bunker:// URL with a secret from your signer app, or scan the QR code.",
          securityRejection: true,
          unsupportedType: parsed.type,
        }
      }

      // SECURITY: Require secret in bunker URLs to prevent connection hijacking
      // See: https://github.com/nostrband/nostrconnect.org - nostrconnect.org recommendations
      if (parsed.type === "bunker" && !parsed.secret) {
        console.error(
          "[NDK-NIP46] SECURITY: Bunker URL has no secret - rejecting to prevent hijacking",
        )
        return {
          success: false,
          error:
            "This bunker URL does not contain a verification secret. For your security, please generate a NEW bunker URL from your signer app that includes a secret.",
          securityRejection: true,
          noSecret: true,
        }
      }

      this.connectionState = "connecting"
      onStatusChange?.("connecting")

      // After the security early-returns above, TypeScript narrows `parsed` to
      // ParsedBunkerURL only. We widen it back to the full union so the NIP-05
      // resolution code below compiles. That code path is currently unreachable
      // (nip05/npub are blocked above) but kept for future reference.
      const parsedInput: ParsedBunkerInput = parsed as ParsedBunkerInput

      // Get relays - for NIP-05, we'll resolve them
      let relays: string[] = parsedInput.relays || DEFAULT_NIP46_RELAYS
      let targetPubkey: string | undefined = parsedInput.pubkey

      // For NIP-05, resolve the user first (currently unreachable — nip05 blocked above)
      if (parsedInput.type === "nip05") {
        console.log("[NDK-NIP46] Resolving NIP-05:", parsedInput.nip05)

        // Create temporary NDK to resolve NIP-05
        const tempNDK = new NDK({ explicitRelayUrls: DEFAULT_NIP46_RELAYS })
        await tempNDK.connect()

        try {
          const user: NDKUser | undefined = await NDKUser.fromNip05(
            parsedInput.nip05!,
            tempNDK,
          )
          if (!user) {
            return {
              success: false,
              error: `Could not resolve NIP-05: ${parsedInput.nip05}`,
            }
          }

          targetPubkey = user.pubkey
          // Use NIP-46 relays from NIP-05 profile if available
          const nip46Urls = (user as unknown as { nip46Urls?: string[] }).nip46Urls
          if (nip46Urls && nip46Urls.length > 0) {
            relays = nip46Urls
            console.log("[NDK-NIP46] Using NIP-46 relays from profile:", relays)
          }
        } finally {
          // Clean up temp NDK
          // Note: NDK doesn't have explicit disconnect, connections close naturally
        }
      }

      console.log("[NDK-NIP46] Target pubkey:", targetPubkey?.slice(0, 16) + "...")
      console.log("[NDK-NIP46] Relays:", relays)

      // v60: Store bunker pubkey and relays for retry without secret
      if (parsedInput.type === "bunker" && parsedInput.pubkey) {
        this.currentBunkerPubkey = parsedInput.pubkey
        this.currentRelays = relays
        console.log(
          "[NDK-NIP46] v60: Stored bunker pubkey for potential secretless retry",
        )
      }

      // Close any existing bunker NDK
      if (this.bunkerNDK) {
        console.log("[NDK-NIP46] Closing existing bunker NDK")
        this.bunkerNDK = null
      }

      // Create dedicated NDK instance for this bunker connection
      // This follows habla.news pattern - each connection gets its own NDK
      this.bunkerNDK = new NDK({
        explicitRelayUrls: relays,
      })

      console.log("[NDK-NIP46] Connecting bunker NDK to relays...")
      await this.bunkerNDK.connect()
      console.log("[NDK-NIP46] Bunker NDK connected")

      // Get or create local signer for NIP-46 communication
      const localSigner: NDKPrivateKeySigner = this.getOrCreateLocalSigner()

      // Create NIP-46 signer
      // v54: Match habla.news pattern EXACTLY - use constructor with bunker URL and NDKPrivateKeySigner object
      // This is what works in production with nsec.app
      console.log("[NDK-NIP46] Creating NDKNip46Signer...")
      console.log("[NDK-NIP46] Input type:", parsed.type)
      console.log("[NDK-NIP46] Secret included:", parsed.secret ? "yes" : "no")

      // CRITICAL: Use the constructor directly with the full bunker:// URL (or target pubkey for NIP-05)
      // and pass the NDKPrivateKeySigner object, NOT a string/nsec
      // This matches habla.news which works flawlessly with nsec.app
      if (parsed.type === "bunker") {
        // For bunker:// URLs, pass the full URL as the second parameter
        // The constructor will call bunkerFlowInit() which extracts the secret
        console.log("[NDK-NIP46] Using constructor with bunker URL (habla.news pattern)")
        this.signer = new NDKNip46Signer(this.bunkerNDK, bunkerInput, localSigner)

        // Debug: log what NDK extracted from the bunker URL
        const signerAny = this.signer as unknown as {
          bunkerPubkey?: string
          userPubkey?: string
          secret?: string
          relayUrls?: string[]
        }
        console.log(
          "[NDK-NIP46] NDK parsed bunkerPubkey:",
          signerAny.bunkerPubkey?.slice(0, 16) + "...",
        )
        console.log(
          "[NDK-NIP46] NDK parsed userPubkey:",
          signerAny.userPubkey || "(none)",
        )
        console.log(
          "[NDK-NIP46] NDK parsed secret:",
          signerAny.secret ? "yes (" + signerAny.secret.length + " chars)" : "no",
        )
        console.log("[NDK-NIP46] NDK parsed relayUrls:", signerAny.relayUrls)
      } else {
        // For NIP-05 or npub, use constructor with target pubkey
        console.log("[NDK-NIP46] Using constructor with target pubkey")
        this.signer = new NDKNip46Signer(this.bunkerNDK, targetPubkey!, localSigner)
      }

      // Set up auth URL handler
      // NDKNip46Signer extends EventEmitter, so .on() is available at runtime
      ;(
        this.signer as unknown as {
          on: (event: string, cb: (url: string) => void) => void
        }
      ).on("authUrl", (url: string) => {
        console.log("[NDK-NIP46] Auth URL received:", url)
        this.connectionState = "awaiting_approval"
        onStatusChange?.("awaiting_approval")

        if (onAuthUrl) {
          onAuthUrl(url)
        } else {
          // Default: open in popup
          console.log("[NDK-NIP46] Opening auth URL in popup...")
          if (typeof window !== "undefined") {
            window.open(url, "auth", "width=600,height=600")
          }
        }
      })

      // Wait for signer to be ready (this handles the NIP-46 handshake)
      // v61: Implement retry logic - on "invalid secret", retry WITHOUT the secret
      //      Build a proper bunker:// URL without secret (NDK expects bunker URL format)
      console.log("[NDK-NIP46] v61: Waiting for signer to be ready (with retry logic)...")

      const MAX_RETRIES = 5
      const RETRY_DELAY_MS = 3000 // 3 seconds between retries
      let lastError: unknown = null

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          console.log(`[NDK-NIP46] v61: Connection attempt ${attempt}/${MAX_RETRIES}...`)

          // Create timeout promise for this attempt
          const attemptTimeout: number = Math.min(timeout, 15000) // Max 15s per attempt
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(
              () => reject(new Error("Connection attempt timed out")),
              attemptTimeout,
            )
          })

          // Race between connection and timeout
          // blockUntilReady() returns an NDKUser
          const user = await Promise.race([this.signer.blockUntilReady(), timeoutPromise])

          if (user && (user as NDKUser).pubkey) {
            const pubkey: string = (user as NDKUser).pubkey
            console.log(
              "[NDK-NIP46] v61: Signer ready! User pubkey:",
              pubkey.slice(0, 16) + "...",
            )

            this.connectionState = "connected"
            this.userPublicKey = pubkey
            onStatusChange?.("connected")

            // Store session for persistence
            this.storeSession({
              publicKey: pubkey,
              bunkerUrl: bunkerInput,
              localSignerPrivkey: localSigner.privateKey!,
              relays,
            })

            return { success: true, publicKey: pubkey }
          }
        } catch (attemptError: unknown) {
          lastError = attemptError
          const errorMsg: string =
            attemptError instanceof Error ? attemptError.message : String(attemptError)
          console.log(`[NDK-NIP46] v61: Attempt ${attempt} failed:`, errorMsg)

          // Check if this is an "invalid secret" error - means nsec.app needs approval
          if (errorMsg.includes("invalid secret") || errorMsg.includes("secret")) {
            console.log(
              '[NDK-NIP46] v61: Got "invalid secret" - nsec.app needs approval, will retry...',
            )
            this.connectionState = "awaiting_approval"
            onStatusChange?.("awaiting_approval")

            if (attempt < MAX_RETRIES) {
              // Wait before retrying - give user time to approve in nsec.app
              console.log(`[NDK-NIP46] v61: Waiting ${RETRY_DELAY_MS}ms before retry...`)
              await new Promise<void>((resolve) => setTimeout(resolve, RETRY_DELAY_MS))

              // v61: On retries after "invalid secret", try connecting WITHOUT the secret
              // If the client pubkey was approved in nsec.app, this should work
              // The secret is only for initial authentication; after approval, client is trusted
              console.log(
                "[NDK-NIP46] v61: Re-creating signer for retry (without secret)...",
              )

              // Build a bunker URL WITHOUT the secret
              // NDK expects bunker:// format, not raw pubkey
              const bunkerPubkey: string | undefined =
                this.currentBunkerPubkey || targetPubkey
              const retryRelays: string[] = this.currentRelays ||
                relays || ["wss://relay.nsec.app"]

              if (bunkerPubkey) {
                // Construct bunker URL without secret
                const relayParams: string = retryRelays
                  .map((r: string) => `relay=${encodeURIComponent(r)}`)
                  .join("&")
                const retryBunkerUrl = `bunker://${bunkerPubkey}?${relayParams}`
                console.log(
                  "[NDK-NIP46] v61: Retry bunker URL (no secret):",
                  retryBunkerUrl.slice(0, 50) + "...",
                )

                this.signer = new NDKNip46Signer(
                  this.bunkerNDK!,
                  retryBunkerUrl,
                  localSigner,
                )
              } else {
                console.log(
                  "[NDK-NIP46] v61: No bunker pubkey available, using original input",
                )
                this.signer = new NDKNip46Signer(
                  this.bunkerNDK!,
                  bunkerInput,
                  localSigner,
                )
              }

              // Re-attach auth URL listener on the new signer
              ;(
                this.signer as unknown as {
                  on: (event: string, cb: (url: string) => void) => void
                }
              ).on("authUrl", (url: string) => {
                console.log("[NDK-NIP46] Auth URL received on retry:", url)
                this.connectionState = "awaiting_approval"
                onStatusChange?.("awaiting_approval")
                if (onAuthUrl) {
                  onAuthUrl(url)
                }
              })
              continue // Retry
            }
          }

          // For other errors or if we've exhausted retries, break
          break
        }
      }

      // If we get here, all retries failed
      throw lastError || new Error("Connection failed after retries")
    } catch (err: unknown) {
      console.error("[NDK-NIP46] Connection failed:", err)

      // Capture whether we were awaiting approval before resetting state
      const wasAwaitingApproval: boolean = this.connectionState === "awaiting_approval"

      this.connectionState = "disconnected"
      options.onStatusChange?.("disconnected")

      // Check for specific error types
      const errorMessage: string = err instanceof Error ? err.message : String(err)

      if (errorMessage.includes("timed out")) {
        return {
          success: false,
          error:
            "Connection timed out. Please ensure your signer app is open and try again.",
          needsApproval: wasAwaitingApproval,
        }
      }

      if (errorMessage.includes("invalid secret") || errorMessage.includes("secret")) {
        return {
          success: false,
          error:
            "Please open your signer app (nsec.app) and approve the connection request, then try again.",
          needsApproval: true,
        }
      }

      return { success: false, error: errorMessage }
    }
  }

  /**
   * Sign an event using the connected remote signer.
   *
   * v63: Fixed to properly use NDKEvent for signing.
   * NDK signers expect NDKEvent objects, not raw event templates.
   * We create an NDKEvent, sign it, then extract the raw signed event.
   *
   * @param eventTemplate - Unsigned event (kind, content, tags, created_at)
   */
  static async signEvent(eventTemplate: UnsignedEvent): Promise<SignEventResult> {
    if (!this.signer || this.connectionState !== "connected") {
      console.error("[NDK-NIP46] Cannot sign: not connected")
      return { success: false, error: "Not connected to remote signer" }
    }

    try {
      console.log("[NDK-NIP46] Signing event kind:", eventTemplate.kind)

      // v63: Create an NDKEvent from the template
      // NDK signers work with NDKEvent objects, not raw templates
      // Dynamic import because NDKEvent is a class used at runtime only
      const { NDKEvent } = await import("@nostr-dev-kit/ndk")

      const ndkEvent = new NDKEvent(this.bunkerNDK!)
      ndkEvent.kind = eventTemplate.kind
      ndkEvent.content = eventTemplate.content || ""
      ndkEvent.tags = eventTemplate.tags || []
      ndkEvent.created_at = eventTemplate.created_at || Math.floor(Date.now() / 1000)

      console.log("[NDK-NIP46] v63: Created NDKEvent, calling sign() with signer...")

      // Sign the event using the NIP-46 signer
      await ndkEvent.sign(this.signer)

      console.log(
        "[NDK-NIP46] v63: NDKEvent signed, id:",
        ndkEvent.id?.slice(0, 16) + "...",
      )
      console.log(
        "[NDK-NIP46] v63: NDKEvent pubkey:",
        ndkEvent.pubkey?.slice(0, 16) + "...",
      )
      console.log("[NDK-NIP46] v63: NDKEvent sig present:", !!ndkEvent.sig)

      // Extract the raw signed event object
      // NDKEvent.rawEvent() returns the NostrEvent format
      const signedEvent = ndkEvent.rawEvent() as unknown as SignedEvent

      console.log("[NDK-NIP46] v63: Raw event extracted")
      console.log("[NDK-NIP46] v63: Raw event id:", signedEvent.id?.slice(0, 16) + "...")
      console.log(
        "[NDK-NIP46] v63: Raw event pubkey:",
        signedEvent.pubkey?.slice(0, 16) + "...",
      )
      console.log(
        "[NDK-NIP46] v63: Raw event sig:",
        signedEvent.sig?.slice(0, 16) + "...",
      )

      console.log("[NDK-NIP46] Event signed successfully")
      return { success: true, event: signedEvent }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      console.error("[NDK-NIP46] Signing failed:", err)
      return { success: false, error: errorMsg || "Signing failed" }
    }
  }

  /**
   * Get the user's public key.
   */
  static async getPublicKey(): Promise<string | null> {
    if (this.userPublicKey) {
      return this.userPublicKey
    }

    if (this.signer) {
      try {
        const user: NDKUser = await this.signer.user()
        return user?.pubkey || null
      } catch (e: unknown) {
        console.error("[NDK-NIP46] Failed to get public key:", e)
      }
    }

    return null
  }

  /**
   * Check if there's an active NIP-46 connection.
   */
  static isConnected(): boolean {
    return this.connectionState === "connected" && this.signer !== null
  }

  /**
   * Get the current connection state.
   */
  static getConnectionState(): ConnectionState {
    return this.connectionState
  }

  /**
   * Attempt to restore a previous NIP-46 session.
   */
  static async restoreSession(): Promise<ConnectionResult> {
    const session: NDKSession | null = this.getStoredSession()
    if (!session) {
      console.log("[NDK-NIP46] No stored session to restore")
      return { success: false, error: "No session found" }
    }

    console.log("[NDK-NIP46] Attempting to restore session...")
    console.log("[NDK-NIP46] Session pubkey:", session.publicKey?.slice(0, 16) + "...")

    try {
      // Restore local signer from session
      if (session.localSignerPrivkey) {
        this.localSigner = new NDKPrivateKeySigner(session.localSignerPrivkey)
      }

      // Reconnect using stored bunker URL
      const result: ConnectionResult = await this.connect(session.bunkerUrl, {
        timeout: 30000, // Shorter timeout for restore
      })

      if (result.success) {
        console.log("[NDK-NIP46] Session restored successfully")
        return result
      }

      // If restore failed, clear session
      console.warn("[NDK-NIP46] Session restore failed:", result.error)
      this.clearSession()
      return result
    } catch (err: unknown) {
      console.error("[NDK-NIP46] Session restore error:", err)
      this.clearSession()
      return { success: false, error: "Session expired or invalid" }
    }
  }

  /**
   * Disconnect and clean up the NIP-46 connection.
   */
  static async disconnect(): Promise<void> {
    console.log("[NDK-NIP46] Disconnecting...")

    this.signer = null
    this.bunkerNDK = null
    this.localSigner = null
    this.connectionState = "disconnected"
    this.userPublicKey = null
    this.currentBunkerInput = null
    this.currentBunkerPubkey = null
    this.currentRelays = null
    this.authUrlCallback = null

    this.clearSession()

    console.log("[NDK-NIP46] Disconnected")
  }

  // =============== Session Storage Methods ===============

  /**
   * Store session data for persistence.
   */
  private static storeSession(sessionData: StoreSessionData): void {
    if (typeof localStorage !== "undefined") {
      const session: NDKSession = {
        ...sessionData,
        connectedAt: Date.now(),
      }
      localStorage.setItem(NDK_NIP46_SESSION_KEY, JSON.stringify(session))
      console.log("[NDK-NIP46] Session stored")
    }
  }

  /**
   * Get stored session data.
   */
  private static getStoredSession(): NDKSession | null {
    if (typeof localStorage === "undefined") return null
    try {
      const stored: string | null = localStorage.getItem(NDK_NIP46_SESSION_KEY)
      return stored ? (JSON.parse(stored) as NDKSession) : null
    } catch {
      return null
    }
  }

  /**
   * Check if a stored session exists.
   */
  static hasStoredSession(): boolean {
    return this.getStoredSession() !== null
  }

  /**
   * Clear stored session data.
   */
  private static clearSession(): void {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(NDK_NIP46_SESSION_KEY)
      localStorage.removeItem(NDK_LOCAL_SIGNER_KEY)
    }
    console.log("[NDK-NIP46] Session cleared")
  }

  /**
   * Get default relays.
   */
  static getDefaultRelays(): string[] {
    return [...DEFAULT_NIP46_RELAYS]
  }
}

export default NostrConnectServiceNDK
