import React from 'react';
import ReactPDF from '@react-pdf/renderer';
import { 
  SingleVoucherDocument, 
  BatchVoucherDocument, 
  ThermalVoucherDocument,
  PAPER_FORMATS,
  getAvailableFormats 
} from '../../../lib/pdf/VoucherPDF';

/**
 * Voucher PDF Generation API
 * 
 * POST /api/voucher/pdf
 * Body: {
 *   vouchers: [{
 *     satsAmount: number,
 *     fiatAmount: string (optional, e.g. "$25.00 ARS"),
 *     qrDataUrl: string (base64 data URL of QR code),
 *     identifierCode: string (optional)
 *   }],
 *   format: 'a4' | 'letter' | 'thermal-80' | 'thermal-58'
 * }
 * 
 * Returns: PDF as base64 string
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      error: 'Method not allowed',
      allowedMethods: ['POST']
    });
  }

  try {
    const { vouchers, format = 'a4' } = req.body;

    // Validate input
    if (!vouchers || !Array.isArray(vouchers) || vouchers.length === 0) {
      return res.status(400).json({ 
        error: 'Missing or invalid vouchers array',
        hint: 'Provide an array of voucher objects with satsAmount and qrDataUrl'
      });
    }

    // Validate format
    const validFormats = getAvailableFormats();
    if (!validFormats.includes(format)) {
      return res.status(400).json({ 
        error: 'Invalid format',
        validFormats,
        hint: 'Choose from: a4, letter, thermal-80, thermal-58'
      });
    }

    // Validate each voucher
    for (let i = 0; i < vouchers.length; i++) {
      const v = vouchers[i];
      if (typeof v.satsAmount !== 'number' || v.satsAmount <= 0) {
        return res.status(400).json({ 
          error: `Invalid voucher at index ${i}`,
          hint: 'satsAmount must be a positive number'
        });
      }
      if (!v.qrDataUrl || typeof v.qrDataUrl !== 'string') {
        return res.status(400).json({ 
          error: `Invalid voucher at index ${i}`,
          hint: 'qrDataUrl must be a valid data URL string'
        });
      }
    }

    console.log(`📄 Generating PDF: ${vouchers.length} voucher(s), format: ${format}`);

    // Determine which document type to use
    const isThermal = format.startsWith('thermal');
    const isSingle = vouchers.length === 1;

    let documentElement;
    
    if (isThermal) {
      // Thermal format always generates one voucher per page
      if (isSingle) {
        documentElement = React.createElement(ThermalVoucherDocument, {
          voucher: vouchers[0],
          format
        });
      } else {
        // For multiple vouchers on thermal, we generate multiple pages
        documentElement = React.createElement(BatchVoucherDocument, {
          vouchers,
          format
        });
      }
    } else if (isSingle) {
      // Single voucher on standard paper
      documentElement = React.createElement(SingleVoucherDocument, {
        voucher: vouchers[0],
        format
      });
    } else {
      // Multiple vouchers on standard paper (batch)
      documentElement = React.createElement(BatchVoucherDocument, {
        vouchers,
        format
      });
    }

    // Render to buffer
    const pdfBuffer = await ReactPDF.renderToBuffer(documentElement);
    
    // Convert to base64
    const pdfBase64 = pdfBuffer.toString('base64');

    console.log(`✅ PDF generated: ${Math.round(pdfBuffer.length / 1024)}KB`);

    return res.status(200).json({
      success: true,
      pdf: pdfBase64,
      format,
      pageInfo: PAPER_FORMATS[format],
      voucherCount: vouchers.length
    });

  } catch (error) {
    console.error('❌ PDF generation error:', error);
    
    return res.status(500).json({ 
      error: 'Failed to generate PDF',
      message: error.message
    });
  }
}

// Disable body parser limit for large QR data URLs
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

