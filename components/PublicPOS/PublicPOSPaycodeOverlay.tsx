import QRCode from "react-qr-code"
import { bech32 } from "bech32"
import { getLnAddressDomain, getPayUrl } from "../../lib/config/api"

/**
 * PublicPOSPaycodeOverlay - Paycode overlay for PublicPOSDashboard
 *
 * Generates static LNURL paycodes with optional fixed amounts,
 * QR code display, PDF generation, and copy-to-clipboard actions
 */

interface PublicPOSPaycodeOverlayProps {
  onClose: () => void
  username: string
  darkMode: boolean
  paycodeAmount: string
  setPaycodeAmount: (value: string) => void
  paycodeGeneratingPdf: boolean
  setPaycodeGeneratingPdf: (value: boolean) => void
  getSubmenuBgClasses: () => string
  getSubmenuHeaderClasses: () => string
}

export default function PublicPOSPaycodeOverlay({
  onClose,
  username,
  darkMode,
  paycodeAmount,
  setPaycodeAmount,
  paycodeGeneratingPdf,
  setPaycodeGeneratingPdf,
  getSubmenuBgClasses,
  getSubmenuHeaderClasses,
}: PublicPOSPaycodeOverlayProps) {
  // Generate LNURL for the paycode
  const hasFixedAmount = paycodeAmount && parseInt(paycodeAmount) > 0
  const payUrlBase = getPayUrl()
  const lnAddressDomain = getLnAddressDomain()

  // Use our custom LNURL-pay endpoint for fixed amounts (sets min=max)
  // Use Blink's endpoint for variable amounts
  const lnurlPayEndpoint = hasFixedAmount
    ? `https://track.twentyone.ist/api/paycode/lnurlp/${username}?amount=${paycodeAmount}`
    : `${payUrlBase}/.well-known/lnurlp/${username}`

  // Encode to LNURL using bech32
  const words = bech32.toWords(Buffer.from(lnurlPayEndpoint, "utf8"))
  const lnurl = bech32.encode("lnurl", words, 1500)

  // Web fallback URL - for wallets that don't support LNURL, camera apps open this page
  const webURL = `${payUrlBase}/${username}`

  // Use raw LNURL for Blink mobile compatibility
  const paycodeURL = lnurl.toUpperCase()
  const lightningAddress = `${username}@${lnAddressDomain}`

  // Generate PDF function
  const generatePaycodePdf = async (): Promise<void> => {
    setPaycodeGeneratingPdf(true)
    try {
      // Create a canvas from the QR code to get data URL
      const qrCanvas = document.createElement("canvas")
      const QRCodeLib = await import("qrcode")
      await QRCodeLib.toCanvas(qrCanvas, paycodeURL, {
        width: 400,
        margin: 2,
        errorCorrectionLevel: "H",
      })
      const qrDataUrl = qrCanvas.toDataURL("image/png")

      // Call the PDF API
      const response = await fetch("/api/paycode/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lightningAddress,
          qrDataUrl,
          amount: paycodeAmount ? parseInt(paycodeAmount) : null,
          displayAmount: paycodeAmount
            ? `${parseInt(paycodeAmount).toLocaleString()} sats`
            : null,
          webUrl: webURL,
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to generate PDF")
      }

      const { pdf } = await response.json()

      // Download the PDF
      const link = document.createElement("a")
      link.href = `data:application/pdf;base64,${pdf}`
      link.download = `paycode-${username}${paycodeAmount ? `-${paycodeAmount}sats` : ""}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (error: unknown) {
      console.error("Error generating PDF:", error)
      alert("Failed to generate PDF. Please try again.")
    } finally {
      setPaycodeGeneratingPdf(false)
    }
  }

  return (
    <div className={`fixed inset-0 ${getSubmenuBgClasses()} z-50 overflow-y-auto`}>
      <div
        className="min-h-screen"
        style={{ fontFamily: "'Source Sans Pro', sans-serif" }}
      >
        {/* Header */}
        <div className={`${getSubmenuHeaderClasses()} sticky top-0 z-10`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <button
                onClick={() => {
                  onClose()
                  setPaycodeAmount("")
                }}
                className="flex items-center text-gray-700 dark:text-white hover:text-blink-accent dark:hover:text-blink-accent"
              >
                <span className="text-2xl mr-2">‹</span>
                <span className="text-lg">Back</span>
              </button>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                Paycodes
              </h1>
              <div className="w-16"></div>
            </div>
          </div>
        </div>

        {/* Paycode Content */}
        <div className="max-w-md mx-auto px-4 py-6">
          <div className="text-center space-y-6">
            {/* Lightning Address Header */}
            <div>
              <p className="text-lg font-semibold text-blink-accent">
                Pay {lightningAddress}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                Display this static QR code to accept Lightning payments.
              </p>
            </div>

            {/* Amount Configuration */}
            <div className={`p-4 rounded-lg ${darkMode ? "bg-gray-900" : "bg-gray-100"}`}>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Fixed Amount (optional)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={paycodeAmount}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setPaycodeAmount(e.target.value)
                  }
                  placeholder="Any amount"
                  min="1"
                  className={`flex-1 px-3 py-2 rounded-lg border text-center ${
                    darkMode
                      ? "bg-gray-800 border-gray-700 text-white placeholder-gray-500"
                      : "bg-white border-gray-300 text-gray-900 placeholder-gray-400"
                  } focus:outline-none focus:ring-2 focus:ring-purple-500`}
                />
                <span className="text-sm text-gray-500 dark:text-gray-400">sats</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                {paycodeAmount && parseInt(paycodeAmount) > 0
                  ? `QR will request exactly ${parseInt(paycodeAmount).toLocaleString()} sats`
                  : "Leave empty to allow payer to choose any amount"}
              </p>
            </div>

            {/* QR Code */}
            <div className="flex justify-center">
              <div className="bg-white p-4 rounded-lg shadow-lg border-2 border-gray-200 dark:border-gray-600">
                <QRCode
                  value={paycodeURL}
                  size={256}
                  bgColor="#ffffff"
                  fgColor="#000000"
                  level="H"
                />
              </div>
            </div>

            {/* Amount Display (if set) */}
            {paycodeAmount && parseInt(paycodeAmount) > 0 && (
              <div className="bg-purple-100 dark:bg-purple-900/30 px-4 py-2 rounded-lg">
                <p className="text-lg font-bold text-purple-700 dark:text-purple-300">
                  {parseInt(paycodeAmount).toLocaleString()} sats
                </p>
              </div>
            )}

            {/* Troubleshooting Note */}
            <div
              className={`p-4 rounded-lg ${darkMode ? "bg-yellow-900/30" : "bg-yellow-50"}`}
            >
              <p className="text-sm text-yellow-700 dark:text-yellow-300">
                <strong>Having trouble scanning?</strong> Some wallets don&apos;t support
                static QR codes. Scan with your phone&apos;s camera app to open a webpage
                for creating a fresh invoice.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              {/* Download PDF Button */}
              <button
                onClick={generatePaycodePdf}
                disabled={paycodeGeneratingPdf}
                className="w-full py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white rounded-lg text-base font-medium transition-colors flex items-center justify-center gap-2"
              >
                {paycodeGeneratingPdf ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                    Generating PDF...
                  </>
                ) : (
                  <>
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
                        d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    Download PDF
                  </>
                )}
              </button>

              {/* Copy Lightning Address */}
              <button
                onClick={() => {
                  navigator.clipboard.writeText(lightningAddress)
                }}
                className="w-full py-3 bg-blink-accent hover:bg-blue-600 text-white rounded-lg text-base font-medium transition-colors flex items-center justify-center gap-2"
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
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
                Copy Lightning Address
              </button>

              {/* Copy Paycode LNURL */}
              <button
                onClick={() => {
                  navigator.clipboard.writeText(paycodeURL)
                }}
                className={`w-full py-3 rounded-lg text-base font-medium transition-colors flex items-center justify-center gap-2 ${
                  darkMode
                    ? "bg-gray-800 hover:bg-gray-700 text-white"
                    : "bg-gray-200 hover:bg-gray-300 text-gray-900"
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
                    d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                  />
                </svg>
                Copy Paycode LNURL
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
