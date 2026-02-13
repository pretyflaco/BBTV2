import { useEffect, useRef } from "react"

import { playSound, SOUND_THEMES, type SoundThemeName } from "../lib/audio-utils"

interface Payment {
  amount: number
  currency: string
  memo?: string
}

interface PaymentAnimationProps {
  show: boolean
  payment: Payment | null
  onHide: () => void
  soundEnabled?: boolean
  soundTheme?: SoundThemeName
}

export default function PaymentAnimation({
  show,
  payment,
  onHide,
  soundEnabled = true,
  soundTheme = "success",
}: PaymentAnimationProps) {
  const soundPlayedRef = useRef<boolean>(false)

  // Play sound when animation shows (uses shared audio utility for iOS compatibility)
  useEffect(() => {
    if (show && soundEnabled && !soundPlayedRef.current) {
      soundPlayedRef.current = true
      const themeConfig = SOUND_THEMES[soundTheme] || SOUND_THEMES.success
      playSound(themeConfig.payment, 0.7)
    }

    // Reset the flag when animation is hidden
    if (!show) {
      soundPlayedRef.current = false
    }
  }, [show, soundEnabled, soundTheme])

  if (!show) return null

  const handleDone = (e: React.MouseEvent<HTMLButtonElement>) => {
    console.log("🎬 Payment animation dismissed by Done button")
    e.stopPropagation()
    onHide()
  }

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only dismiss if clicking the overlay itself, not the button
    // This prevents accidental dismissals while still allowing Done button to work
    e.stopPropagation()
  }

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    // Block touch events from reaching elements underneath
    e.stopPropagation()
  }

  return (
    <div
      className={`payment-overlay ${show ? "active" : ""}`}
      onClick={handleOverlayClick}
      onTouchStart={handleTouchStart}
      style={{
        backgroundColor: "rgba(34, 197, 94, 0.95)",
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
      }}
    >
      {/* Main content area */}
      <div className="flex-1 flex flex-col items-center justify-center">
        {/* Checkmark */}
        <img src="/checkmark.png" alt="Success" className="w-[123px] h-[123px] mb-8" />

        {/* Payment info */}
        <div className="text-white text-center">
          <div className="text-3xl font-bold mb-4">Payment Received</div>

          {payment && (
            <>
              <div className="text-5xl font-bold mb-2">+{payment.amount}</div>
              <div className="text-2xl font-medium mb-6">
                {payment.currency === "BTC" ? "sats" : payment.currency}
              </div>
            </>
          )}

          {payment?.memo && (
            <div className="text-lg mt-4 opacity-90 max-w-md mx-auto">{payment.memo}</div>
          )}
        </div>
      </div>

      {/* Done Button */}
      <div className="px-6 pb-10 pt-6 w-full">
        <button
          onClick={handleDone}
          className="w-full h-14 bg-white hover:bg-gray-100 text-green-600 rounded-lg text-xl font-semibold transition-colors shadow-lg"
          style={{ fontFamily: "'Source Sans Pro', sans-serif" }}
        >
          Done
        </button>
      </div>
    </div>
  )
}
