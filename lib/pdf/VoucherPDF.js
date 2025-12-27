import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from '@react-pdf/renderer';

// Paper format configurations
export const PAPER_FORMATS = {
  a4: { width: 595, height: 842, vouchersPerPage: 4, columns: 2, rows: 2 },
  letter: { width: 612, height: 792, vouchersPerPage: 4, columns: 2, rows: 2 },
  'thermal-80': { width: 227, height: 450, vouchersPerPage: 1, columns: 1, rows: 1 },
  'thermal-58': { width: 164, height: 350, vouchersPerPage: 1, columns: 1, rows: 1 },
};

// Get available formats for validation
export const getAvailableFormats = () => Object.keys(PAPER_FORMATS);

// Styles matching the Blink voucher app printout
const createStyles = (format) => {
  const isThermal = format.startsWith('thermal');
  const is58mm = format === 'thermal-58';
  
  // Scale factors for different formats
  const scale = is58mm ? 0.7 : (isThermal ? 0.85 : 1);
  
  return StyleSheet.create({
    page: {
      backgroundColor: '#FFFFFF',
      padding: isThermal ? 8 : 15,
      fontFamily: 'Helvetica',
    },
    // Grid layout for standard paper
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-around',
      alignItems: 'flex-start',
    },
    // Individual voucher card
    voucherCard: {
      width: isThermal ? '100%' : '46%',
      marginBottom: isThermal ? 0 : 15,
      padding: isThermal ? 5 : 12,
      border: isThermal ? 'none' : '1px dashed #999999',
    },
    // Header with Blink logo
    header: {
      alignItems: 'center',
      marginBottom: 10 * scale,
    },
    logo: {
      width: isThermal ? 120 * scale : 150,
      height: isThermal ? 50 * scale : 62,
    },
    // Info section (Price, Value, Identifier, Commission)
    infoSection: {
      marginBottom: 8 * scale,
      paddingHorizontal: 5,
    },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'flex-start',
      marginBottom: 3 * scale,
    },
    infoLabel: {
      fontSize: isThermal ? 9 * scale : 11,
      color: '#000000',
      width: isThermal ? 70 * scale : 80,
    },
    infoValue: {
      fontSize: isThermal ? 9 * scale : 11,
      fontWeight: 'bold',
      color: '#000000',
      fontFamily: 'Helvetica-Bold',
    },
    // Dashed separator
    dashedLine: {
      borderBottom: '1px dashed #666666',
      marginVertical: 6 * scale,
    },
    // QR code section
    qrSection: {
      alignItems: 'center',
      marginVertical: 8 * scale,
    },
    qrCode: {
      width: isThermal ? 160 * scale : 200,
      height: isThermal ? 160 * scale : 200,
    },
    // Voucher secret section
    secretSection: {
      alignItems: 'center',
      marginVertical: 6 * scale,
      paddingVertical: 6 * scale,
      borderTop: '1px dashed #666666',
      borderBottom: '1px dashed #666666',
    },
    secretLabel: {
      fontSize: isThermal ? 8 * scale : 10,
      color: '#000000',
      marginBottom: 2,
    },
    secretCode: {
      fontSize: isThermal ? 12 * scale : 16,
      fontWeight: 'bold',
      color: '#000000',
      fontFamily: 'Helvetica-Bold',
      letterSpacing: 1,
    },
    // Footer with website
    footer: {
      alignItems: 'center',
      marginTop: 8 * scale,
    },
    footerText: {
      fontSize: isThermal ? 9 * scale : 11,
      color: '#000000',
    },
    // Cut line for thermal
    cutLine: {
      borderTop: '1px dashed #999999',
      marginTop: 10,
      paddingTop: 3,
    },
    cutText: {
      fontSize: 6,
      color: '#999999',
      textAlign: 'center',
    },
  });
};

// Format voucher secret for display (e.g., "q6pv Y79E ftnZ")
const formatVoucherSecret = (secret) => {
  if (!secret) return '';
  // Split into groups of 4 characters
  const cleaned = secret.replace(/[^a-zA-Z0-9]/g, '');
  const groups = [];
  for (let i = 0; i < cleaned.length && groups.length < 3; i += 4) {
    groups.push(cleaned.slice(i, i + 4));
  }
  return groups.join(' ');
};

// Voucher Card Component - matching Blink voucher app layout
const VoucherCard = ({ voucher, format, styles }) => {
  const formattedSecret = formatVoucherSecret(voucher.voucherSecret || voucher.identifierCode);
  
  return (
    <View style={styles.voucherCard}>
      {/* Header with Blink Logo */}
      <View style={styles.header}>
        {voucher.logoDataUrl && (
          <Image src={voucher.logoDataUrl} style={styles.logo} />
        )}
      </View>
      
      {/* Info Section */}
      <View style={styles.infoSection}>
        {/* Price (display currency) */}
        {voucher.fiatAmount && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Price:</Text>
            <Text style={styles.infoValue}>{voucher.fiatAmount}</Text>
          </View>
        )}
        
        {/* Value (sats) */}
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Value:</Text>
          <Text style={styles.infoValue}>{voucher.satsAmount} sats</Text>
        </View>
        
        {/* Identifier */}
        {voucher.identifierCode && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Identifier:</Text>
            <Text style={styles.infoValue}>{voucher.identifierCode.toUpperCase()}</Text>
          </View>
        )}
      </View>
      
      {/* Dashed separator */}
      <View style={styles.dashedLine} />
      
      {/* QR Code */}
      <View style={styles.qrSection}>
        {voucher.qrDataUrl && (
          <Image src={voucher.qrDataUrl} style={styles.qrCode} />
        )}
      </View>
      
      {/* Voucher Secret */}
      {formattedSecret && (
        <View style={styles.secretSection}>
          <Text style={styles.secretLabel}>voucher secret</Text>
          <Text style={styles.secretCode}>{formattedSecret}</Text>
        </View>
      )}
      
      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>blink.sv</Text>
      </View>
    </View>
  );
};

// Single Voucher Document (one voucher per page)
export const SingleVoucherDocument = ({ voucher, format = 'a4' }) => {
  const paperConfig = PAPER_FORMATS[format] || PAPER_FORMATS.a4;
  const styles = createStyles(format);
  
  return (
    <Document>
      <Page size={{ width: paperConfig.width, height: paperConfig.height }} style={styles.page}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <VoucherCard voucher={voucher} format={format} styles={styles} />
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
  
  if (isThermal) {
    // For thermal: one voucher per page
    return (
      <Document>
        {vouchers.map((voucher, index) => (
          <Page 
            key={index} 
            size={{ width: paperConfig.width, height: paperConfig.height }} 
            style={styles.page}
          >
            <VoucherCard voucher={voucher} format={format} styles={styles} />
          </Page>
        ))}
      </Document>
    );
  }
  
  // For standard paper: grid layout
  const pages = [];
  for (let i = 0; i < vouchers.length; i += paperConfig.vouchersPerPage) {
    pages.push(vouchers.slice(i, i + paperConfig.vouchersPerPage));
  }
  
  return (
    <Document>
      {pages.map((pageVouchers, pageIndex) => (
        <Page 
          key={pageIndex} 
          size={{ width: paperConfig.width, height: paperConfig.height }} 
          style={styles.page}
        >
          <View style={styles.grid}>
            {pageVouchers.map((voucher, vIndex) => (
              <VoucherCard 
                key={vIndex} 
                voucher={voucher} 
                format={format} 
                styles={styles} 
              />
            ))}
          </View>
        </Page>
      ))}
    </Document>
  );
};

// Thermal Receipt Document
export const ThermalVoucherDocument = ({ voucher, format = 'thermal-80' }) => {
  const paperConfig = PAPER_FORMATS[format] || PAPER_FORMATS['thermal-80'];
  const styles = createStyles(format);
  
  return (
    <Document>
      <Page size={{ width: paperConfig.width, height: paperConfig.height }} style={styles.page}>
        <VoucherCard voucher={voucher} format={format} styles={styles} />
      </Page>
    </Document>
  );
};
