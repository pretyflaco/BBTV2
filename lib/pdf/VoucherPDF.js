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

// Grid configurations for multi-voucher printing
export const GRID_CONFIGS = {
  '2x2': { columns: 2, rows: 2, vouchersPerPage: 4, qrSize: 180, label: '2×2 (4 per page)' },
  '2x3': { columns: 2, rows: 3, vouchersPerPage: 6, qrSize: 140, label: '2×3 (6 per page)' },
  '3x3': { columns: 3, rows: 3, vouchersPerPage: 9, qrSize: 110, label: '3×3 (9 per page)' },
  '3x4': { columns: 3, rows: 4, vouchersPerPage: 12, qrSize: 90, label: '3×4 (12 per page)' },
};

// Get available grid configurations
export const getAvailableGrids = () => Object.keys(GRID_CONFIGS);

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

// Create styles for grid-based multi-voucher layouts
const createGridStyles = (gridConfig, paperFormat = 'a4') => {
  const { columns, rows, qrSize } = gridConfig;
  const paper = PAPER_FORMATS[paperFormat] || PAPER_FORMATS.a4;
  
  // Calculate available space
  const pagePadding = 15;
  const availableWidth = paper.width - (pagePadding * 2);
  const availableHeight = paper.height - (pagePadding * 2);
  
  // Calculate card dimensions based on grid
  const cardWidth = Math.floor(availableWidth / columns) - 8;
  const cardHeight = Math.floor(availableHeight / rows) - 8;
  
  // Scale factor based on grid density
  const densityScale = columns === 2 ? 1 : (columns === 3 ? 0.75 : 0.6);
  
  return StyleSheet.create({
    page: {
      backgroundColor: '#FFFFFF',
      padding: pagePadding,
      fontFamily: 'Helvetica',
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      alignContent: 'flex-start',
    },
    voucherCard: {
      width: cardWidth,
      height: cardHeight,
      marginBottom: 4,
      padding: 6 * densityScale,
      border: '1px dashed #999999',
    },
    header: {
      alignItems: 'center',
      marginBottom: 4 * densityScale,
    },
    logo: {
      width: 100 * densityScale,
      height: 41 * densityScale,
    },
    infoSection: {
      marginBottom: 4 * densityScale,
      paddingHorizontal: 2,
    },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'flex-start',
      marginBottom: 1,
    },
    infoLabel: {
      fontSize: 8 * densityScale,
      color: '#000000',
      width: 50 * densityScale,
    },
    infoValue: {
      fontSize: 8 * densityScale,
      fontWeight: 'bold',
      color: '#000000',
      fontFamily: 'Helvetica-Bold',
    },
    dashedLine: {
      borderBottom: '1px dashed #666666',
      marginVertical: 3 * densityScale,
    },
    qrSection: {
      alignItems: 'center',
      marginVertical: 4 * densityScale,
    },
    qrCode: {
      width: qrSize,
      height: qrSize,
    },
    secretSection: {
      alignItems: 'center',
      marginVertical: 3 * densityScale,
      paddingVertical: 3 * densityScale,
      borderTop: '1px dashed #666666',
      borderBottom: '1px dashed #666666',
    },
    secretLabel: {
      fontSize: 6 * densityScale,
      color: '#000000',
      marginBottom: 1,
    },
    secretCode: {
      fontSize: 10 * densityScale,
      fontWeight: 'bold',
      color: '#000000',
      fontFamily: 'Helvetica-Bold',
      letterSpacing: 0.5,
    },
    footer: {
      alignItems: 'center',
      marginTop: 4 * densityScale,
    },
    footerText: {
      fontSize: 7 * densityScale,
      color: '#000000',
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
        
        {/* Commission (if applicable) */}
        {voucher.commissionPercent > 0 && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Commission:</Text>
            <Text style={styles.infoValue}>{voucher.commissionPercent}%</Text>
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

// Grid-based Multi-Voucher Document (configurable grid layout)
export const GridVoucherDocument = ({ vouchers, gridSize = '2x2', paperFormat = 'a4' }) => {
  const gridConfig = GRID_CONFIGS[gridSize] || GRID_CONFIGS['2x2'];
  const paperConfig = PAPER_FORMATS[paperFormat] || PAPER_FORMATS.a4;
  const styles = createGridStyles(gridConfig, paperFormat);
  
  // Split vouchers into pages based on grid configuration
  const pages = [];
  for (let i = 0; i < vouchers.length; i += gridConfig.vouchersPerPage) {
    pages.push(vouchers.slice(i, i + gridConfig.vouchersPerPage));
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
                format={paperFormat} 
                styles={styles} 
              />
            ))}
          </View>
        </Page>
      ))}
    </Document>
  );
};
