import React from "react"
import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer"

// --- Type Definitions ---

interface PaperFormat {
  width: number
  height: number
}

interface PaycodeData {
  lightningAddress: string
  qrDataUrl: string
  amount?: number
  displayAmount?: string
  webUrl?: string
}

interface PaycodeDocumentProps {
  paycode: PaycodeData
}

// --- Constants ---

// Paper format configurations
export const PAPER_FORMATS: Record<string, PaperFormat> = {
  a4: { width: 595, height: 842 },
  letter: { width: 612, height: 792 },
}

// Get available formats for validation
export const getAvailableFormats = (): string[] => Object.keys(PAPER_FORMATS)

// Styles for Paycode PDF
const styles = StyleSheet.create({
  page: {
    backgroundColor: "#FFFFFF",
    padding: 40,
    fontFamily: "Helvetica",
    alignItems: "center",
    justifyContent: "center",
  },
  container: {
    alignItems: "center",
    maxWidth: 400,
  },
  // Header with Lightning bolt
  header: {
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#7C3AED", // Purple color matching Blink
    fontFamily: "Helvetica-Bold",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#666666",
    textAlign: "center",
    marginBottom: 4,
  },
  lightningAddress: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1F2937",
    fontFamily: "Helvetica-Bold",
    marginBottom: 20,
  },
  // Amount display (if fixed amount)
  amountSection: {
    alignItems: "center",
    marginBottom: 20,
    padding: 12,
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
    width: "100%",
  },
  amountLabel: {
    fontSize: 12,
    color: "#666666",
    marginBottom: 4,
  },
  amountValue: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#7C3AED",
    fontFamily: "Helvetica-Bold",
  },
  // QR code section
  qrSection: {
    alignItems: "center",
    marginVertical: 20,
    padding: 20,
    border: "2px solid #E5E7EB",
    borderRadius: 12,
  },
  qrCode: {
    width: 280,
    height: 280,
  },
  // Instructions
  instructions: {
    alignItems: "center",
    marginTop: 20,
    padding: 16,
    backgroundColor: "#FEF3C7",
    borderRadius: 8,
    width: "100%",
  },
  instructionsTitle: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#92400E",
    fontFamily: "Helvetica-Bold",
    marginBottom: 8,
  },
  instructionsText: {
    fontSize: 10,
    color: "#92400E",
    textAlign: "center",
    lineHeight: 1.4,
  },
  // Footer
  footer: {
    alignItems: "center",
    marginTop: 30,
  },
  footerText: {
    fontSize: 10,
    color: "#9CA3AF",
  },
  poweredBy: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 8,
  },
})

/**
 * Paycode PDF Document
 * Generates a printable PDF with a Lightning paycode QR
 */
export const PaycodeDocument: React.FC<PaycodeDocumentProps> = ({ paycode }) => {
  const { lightningAddress, qrDataUrl, amount, displayAmount, webUrl } = paycode

  const hasFixedAmount = amount && amount > 0

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Pay with Lightning</Text>
            <Text style={styles.subtitle}>Scan to send Bitcoin instantly</Text>
          </View>

          {/* Lightning Address */}
          <Text style={styles.lightningAddress}>{lightningAddress}</Text>

          {/* Fixed Amount (if set) */}
          {hasFixedAmount && (
            <View style={styles.amountSection}>
              <Text style={styles.amountLabel}>Amount to Pay</Text>
              <Text style={styles.amountValue}>{displayAmount || `${amount} sats`}</Text>
            </View>
          )}

          {/* QR Code */}
          <View style={styles.qrSection}>
            <Image style={styles.qrCode} src={qrDataUrl} />
          </View>

          {/* Instructions */}
          <View style={styles.instructions}>
            <Text style={styles.instructionsTitle}>Having trouble scanning?</Text>
            <Text style={styles.instructionsText}>
              Some wallets don't support static LNURL QR codes.{"\n"}
              Scan with your phone's camera app to open a webpage{"\n"}
              where you can create a fresh invoice.
            </Text>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>{webUrl}</Text>
            <Text style={styles.poweredBy}>Powered by Blink</Text>
          </View>
        </View>
      </Page>
    </Document>
  )
}

export default PaycodeDocument
