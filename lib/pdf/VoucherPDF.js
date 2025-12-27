import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  Image,
  Font,
  StyleSheet,
  Svg,
  Rect,
  Path,
} from '@react-pdf/renderer';

// Register the pixel font
Font.register({
  family: 'VT323',
  src: '/fonts/VT323-Regular.ttf',
});

// Fallback to Courier if VT323 not available
Font.register({
  family: 'Courier',
  src: 'Courier',
});

// Paper format configurations
export const PAPER_FORMATS = {
  a4: { width: 595, height: 842, vouchersPerPage: 6, columns: 2, rows: 3 },
  letter: { width: 612, height: 792, vouchersPerPage: 6, columns: 2, rows: 3 },
  'thermal-80': { width: 227, height: 425, vouchersPerPage: 1, columns: 1, rows: 1 }, // 80mm
  'thermal-58': { width: 164, height: 283, vouchersPerPage: 1, columns: 1, rows: 1 }, // 58mm
};

// Styles
const createStyles = (format) => {
  const isThermal = format.startsWith('thermal');
  const baseFontSize = isThermal ? 8 : 10;
  
  return StyleSheet.create({
    page: {
      backgroundColor: '#FFFFFF',
      padding: isThermal ? 8 : 20,
      fontFamily: 'Courier',
    },
    
    // Grid layout for batch printing
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-around',
      alignContent: 'flex-start',
    },
    
    // Single voucher card
    voucherCard: {
      width: isThermal ? '100%' : '45%',
      border: '2pt solid black',
      padding: isThermal ? 8 : 12,
      marginBottom: isThermal ? 0 : 15,
      backgroundColor: '#FFFFFF',
    },
    
    // ASCII-style header
    header: {
      textAlign: 'center',
      marginBottom: 8,
    },
    headerText: {
      fontSize: baseFontSize + 2,
      fontWeight: 'bold',
      letterSpacing: 1,
    },
    asciiPattern: {
      fontSize: baseFontSize - 2,
      textAlign: 'center',
      letterSpacing: 0,
    },
    
    // QR container
    qrContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      marginVertical: isThermal ? 8 : 12,
    },
    qrBorder: {
      border: '1pt solid black',
      padding: 4,
    },
    qrImage: {
      width: isThermal ? 120 : 100,
      height: isThermal ? 120 : 100,
    },
    
    // Logo
    logoContainer: {
      alignItems: 'center',
      marginVertical: 6,
    },
    logo: {
      width: isThermal ? 40 : 32,
      height: isThermal ? 40 : 32,
    },
    
    // Value display
    separator: {
      fontSize: baseFontSize - 2,
      textAlign: 'center',
      marginVertical: 4,
    },
    valueContainer: {
      alignItems: 'center',
      marginVertical: 6,
    },
    satsValue: {
      fontSize: baseFontSize + 4,
      fontWeight: 'bold',
      textAlign: 'center',
    },
    fiatValue: {
      fontSize: baseFontSize,
      textAlign: 'center',
      marginTop: 2,
    },
    
    // Footer
    footer: {
      marginTop: 8,
    },
    footerPattern: {
      fontSize: baseFontSize - 2,
      textAlign: 'center',
    },
    
    // Identifier code
    codeText: {
      fontSize: baseFontSize - 1,
      textAlign: 'center',
      marginTop: 4,
    },
  });
};

// ASCII art patterns
const ASCII_PATTERNS = {
  header: '░░░░░░░░░░░░░░░░░░░░░░░░░░░░',
  headerShort: '░░░░░░░░░░░░░░░░',
  separator: '════════════════════════════',
  separatorShort: '══════════════',
  footer: '▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒',
  footerShort: '▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒',
  border: '────────────────────────────',
  borderShort: '────────────────',
};

// Pixelated Bitcoin/Blink logo as SVG paths for @react-pdf/renderer
const PixelBlinkLogo = ({ size = 32 }) => {
  const scale = size / 64;
  
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      {/* Outer circle (pixelated) */}
      <Path
        d="M24 2h16v2h-16v-2z M18 4h6v2h-6v-2z M40 4h6v2h-6v-2z M14 6h4v2h-4v-2z M46 6h4v2h-4v-2z M10 8h4v2h-4v-2z M50 8h4v2h-4v-2z M8 10h2v4h-2v-4z M54 10h2v4h-2v-4z M6 14h2v4h-2v-4z M56 14h2v4h-2v-4z M4 18h2v6h-2v-6z M58 18h2v6h-2v-6z M2 24h2v16h-2v-16z M60 24h2v16h-2v-16z M4 40h2v6h-2v-6z M58 40h2v6h-2v-6z M6 46h2v4h-2v-4z M56 46h2v4h-2v-4z M8 50h2v4h-2v-4z M54 50h2v4h-2v-4z M10 54h4v2h-4v-2z M50 54h4v2h-4v-2z M14 56h4v2h-4v-2z M46 56h4v2h-4v-2z M18 58h6v2h-6v-2z M40 58h6v2h-6v-2z M24 60h16v2h-16v-2z"
        fill="black"
      />
      {/* Bitcoin symbol vertical bars */}
      <Rect x="26" y="14" width="4" height="4" fill="black" />
      <Rect x="34" y="14" width="4" height="4" fill="black" />
      <Rect x="26" y="46" width="4" height="4" fill="black" />
      <Rect x="34" y="46" width="4" height="4" fill="black" />
      {/* Top horizontal */}
      <Rect x="22" y="18" width="20" height="4" fill="black" />
      {/* Upper B curve */}
      <Rect x="22" y="22" width="4" height="8" fill="black" />
      <Rect x="38" y="22" width="4" height="4" fill="black" />
      <Rect x="26" y="26" width="16" height="4" fill="black" />
      {/* Middle horizontal */}
      <Rect x="22" y="30" width="20" height="4" fill="black" />
      {/* Lower B curve */}
      <Rect x="22" y="34" width="4" height="8" fill="black" />
      <Rect x="40" y="34" width="4" height="4" fill="black" />
      <Rect x="26" y="38" width="18" height="4" fill="black" />
      {/* Bottom horizontal */}
      <Rect x="22" y="42" width="20" height="4" fill="black" />
    </Svg>
  );
};

// Single Voucher Card Component
const VoucherCard = ({ voucher, styles, isThermal }) => {
  const pattern = isThermal ? ASCII_PATTERNS.headerShort : ASCII_PATTERNS.header;
  const separator = isThermal ? ASCII_PATTERNS.separatorShort : ASCII_PATTERNS.separator;
  const footerPattern = isThermal ? ASCII_PATTERNS.footerShort : ASCII_PATTERNS.footer;
  
  return (
    <View style={styles.voucherCard}>
      {/* ASCII Header */}
      <View style={styles.header}>
        <Text style={styles.asciiPattern}>{pattern}</Text>
        <Text style={styles.headerText}>BLINK VOUCHER</Text>
        <Text style={styles.asciiPattern}>{pattern}</Text>
      </View>
      
      {/* QR Code */}
      <View style={styles.qrContainer}>
        <View style={styles.qrBorder}>
          {voucher.qrDataUrl ? (
            <Image style={styles.qrImage} src={voucher.qrDataUrl} />
          ) : (
            <View style={[styles.qrImage, { backgroundColor: '#EEE' }]} />
          )}
        </View>
      </View>
      
      {/* Pixel Blink Logo */}
      <View style={styles.logoContainer}>
        <PixelBlinkLogo size={isThermal ? 40 : 32} />
      </View>
      
      {/* Value Display */}
      <Text style={styles.separator}>{separator}</Text>
      <View style={styles.valueContainer}>
        <Text style={styles.satsValue}>{voucher.satsAmount} SATS</Text>
        {voucher.fiatAmount && (
          <Text style={styles.fiatValue}>({voucher.fiatAmount})</Text>
        )}
      </View>
      <Text style={styles.separator}>{separator}</Text>
      
      {/* Identifier Code */}
      {voucher.identifierCode && (
        <Text style={styles.codeText}>#{voucher.identifierCode}</Text>
      )}
      
      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerPattern}>{footerPattern}</Text>
      </View>
    </View>
  );
};

// Single Voucher Document (one voucher per page)
export const SingleVoucherDocument = ({ voucher, format = 'a4' }) => {
  const paperConfig = PAPER_FORMATS[format] || PAPER_FORMATS.a4;
  const styles = createStyles(format);
  const isThermal = format.startsWith('thermal');
  
  return (
    <Document>
      <Page size={[paperConfig.width, paperConfig.height]} style={styles.page}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <VoucherCard voucher={voucher} styles={styles} isThermal={isThermal} />
        </View>
      </Page>
    </Document>
  );
};

// Batch Voucher Document (multiple vouchers per page)
export const BatchVoucherDocument = ({ vouchers, format = 'a4' }) => {
  const paperConfig = PAPER_FORMATS[format] || PAPER_FORMATS.a4;
  const styles = createStyles(format);
  const isThermal = format.startsWith('thermal');
  const vouchersPerPage = paperConfig.vouchersPerPage;
  
  // Split vouchers into pages
  const pages = [];
  for (let i = 0; i < vouchers.length; i += vouchersPerPage) {
    pages.push(vouchers.slice(i, i + vouchersPerPage));
  }
  
  return (
    <Document>
      {pages.map((pageVouchers, pageIndex) => (
        <Page 
          key={pageIndex} 
          size={[paperConfig.width, paperConfig.height]} 
          style={styles.page}
        >
          <View style={styles.grid}>
            {pageVouchers.map((voucher, voucherIndex) => (
              <VoucherCard 
                key={voucherIndex} 
                voucher={voucher} 
                styles={styles} 
                isThermal={isThermal}
              />
            ))}
          </View>
        </Page>
      ))}
    </Document>
  );
};

// Thermal Receipt Document (optimized for thermal printers)
export const ThermalVoucherDocument = ({ voucher, format = 'thermal-80' }) => {
  const paperConfig = PAPER_FORMATS[format] || PAPER_FORMATS['thermal-80'];
  const styles = createStyles(format);
  
  return (
    <Document>
      <Page size={[paperConfig.width, paperConfig.height]} style={styles.page}>
        <VoucherCard voucher={voucher} styles={styles} isThermal={true} />
      </Page>
    </Document>
  );
};

// Export utility functions
export const getAvailableFormats = () => Object.keys(PAPER_FORMATS);

export const getFormatInfo = (format) => PAPER_FORMATS[format] || null;

