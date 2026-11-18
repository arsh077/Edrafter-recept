import { jsPDF } from 'jspdf';
import type { ReceiptDetailBundle, ReceiptItemRow } from '../types/portal';
import { formatInr, roundInr } from './finance';

export const BRAND_LOGO_URL = '/assets/aistudio/eDrafter_s_Legal_Solutions_Logo_dcc73c7d.png';
export const WATERMARK_ASSET_URL = '/assets/aistudio/edrafter_logo_watermark_light_841bec48.png';

// Exact A4 Portrait geometry (210mm x 297mm) with 36pt top/bottom & 42pt left/right margins
const PT_TO_MM = 25.4 / 72;
export const A4_PORTRAIT_MM = {
  width: 210,
  height: 297,
  marginTop: 36 * PT_TO_MM, // 12.7mm
  marginBottom: 36 * PT_TO_MM, // 12.7mm
  marginLeft: 42 * PT_TO_MM, // 14.817mm
  marginRight: 42 * PT_TO_MM, // 14.817mm
  footerBandHeight: 9,
} as const;

export const PDF_PALETTE = {
  primary: [49, 13, 53] as const, // #310D35
  secondary: [0, 140, 152] as const, // #008C98
  accent: [131, 196, 65] as const, // #83C441
  text: [41, 37, 44] as const, // #29252C
  muted: [119, 116, 129] as const, // #777481
  border: [231, 228, 234] as const, // #E7E4EA
  tableHeader: [242, 239, 244] as const, // #F2EFF4
  highlightBg: [230, 246, 248] as const, // #E6F6F8
  white: [255, 255, 255] as const,
};

export interface PdfImageAsset {
  dataUrl: string;
  width: number;
  height: number;
}

export interface PdfRenderOptions {
  logoAsset?: PdfImageAsset | null;
  watermarkAsset?: PdfImageAsset | null;
  qrCodeDataUrl?: string | null;
  save?: boolean;
}

export interface BreakdownLine {
  sNo: number;
  particulars: string;
  quantity: number;
  unitAmount: number;
  totalAmount: number;
  itemType: string;
}

export function formatPdfInr(amount: number | string | null | undefined): string {
  return formatInr(amount).replace('₹', 'Rs. ');
}

export function calculateWatermarkBox(
  pageWidth: number,
  pageHeight: number,
  imgWidth: number,
  imgHeight: number,
  widthRatio = 0.72
): { x: number; y: number; width: number; height: number } {
  const safeW = imgWidth > 0 ? imgWidth : 2048;
  const safeH = imgHeight > 0 ? imgHeight : 692;
  const width = pageWidth * widthRatio;
  const height = width * (safeH / safeW);
  const x = (pageWidth - width) / 2;
  const y = (pageHeight - height) / 2;
  return { x, y, width, height };
}

export function computeBreakdownLine(item: ReceiptItemRow, orderQuantity: number): BreakdownLine {
  const totalAmount = roundInr(item.amount);
  const safeOrderQty = Math.max(1, Math.floor(Number(orderQuantity) || 1));
  const qtyApplies =
    safeOrderQty > 1 && ['service', 'stamp_duty', 'notary', 'item'].includes((item.itemType || '').toLowerCase());
  const quantity = qtyApplies ? safeOrderQty : 1;
  const unitAmount = quantity > 1 ? roundInr(totalAmount / quantity) : totalAmount;
  return {
    sNo: item.sNo,
    particulars: item.particulars,
    quantity,
    unitAmount,
    totalAmount,
    itemType: item.itemType,
  };
}

function loadImageAsDataUrl(url: string, maxWidth = 1200): Promise<PdfImageAsset | null> {
  if (typeof window === 'undefined' || typeof Image === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const natW = img.naturalWidth || 400;
        const natH = img.naturalHeight || 120;
        const scale = natW > maxWidth ? maxWidth / natW : 1;
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(natW * scale));
        canvas.height = Math.max(1, Math.round(natH * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);
        // Preserve full alpha transparency without painting an opaque background
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve({
          dataUrl: canvas.toDataURL('image/png'),
          width: canvas.width,
          height: canvas.height,
        });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function drawPageWatermark(
  doc: jsPDF,
  watermarkAsset: PdfImageAsset | null | undefined,
  pageWidth: number,
  pageHeight: number
) {
  if (!watermarkAsset?.dataUrl) return;
  const box = calculateWatermarkBox(pageWidth, pageHeight, watermarkAsset.width, watermarkAsset.height, 0.72);
  // PNG asset already contains 5% opacity; render at opacity 1.0 with FAST flate compression
  doc.addImage(watermarkAsset.dataUrl, 'PNG', box.x, box.y, box.width, box.height, 'edrafter-wm', 'FAST');
}

function drawHeaderBlock(
  doc: jsPDF,
  bundle: ReceiptDetailBundle,
  logoAsset: PdfImageAsset | null | undefined,
  isContinuation: boolean
): number {
  const { width: pageWidth, marginTop, marginLeft, marginRight } = A4_PORTRAIT_MM;
  const contentWidth = pageWidth - marginLeft - marginRight;
  const rightX = pageWidth - marginRight;
  const settings = bundle.companySettings;
  let y = marginTop;

  // Thin top dual brand accent bar
  doc.setFillColor(...PDF_PALETTE.primary);
  doc.rect(0, 0, pageWidth * 0.67, 2.2, 'F');
  doc.setFillColor(...PDF_PALETTE.secondary);
  doc.rect(pageWidth * 0.67, 0, pageWidth * 0.33, 2.2, 'F');

  if (isContinuation) {
    if (logoAsset?.dataUrl) {
      const logoH = 8;
      const logoW = Math.min(32, (logoAsset.width / Math.max(1, logoAsset.height)) * logoH);
      doc.addImage(logoAsset.dataUrl, 'PNG', marginLeft, y, logoW, logoH, 'edrafter-logo', 'FAST');
    } else {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...PDF_PALETTE.primary);
      doc.text(settings?.companyName || 'eDrafter Legal Solutions', marginLeft, y + 6);
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...PDF_PALETTE.primary);
    doc.text('PAYMENT RECEIPT - CONTINUED', rightX, y + 3.8, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...PDF_PALETTE.muted);
    doc.text(
      `Receipt No: ${bundle.receipt.receiptNumber}  |  Order ID: ${bundle.order.orderCode}`,
      rightX,
      y + 8,
      { align: 'right' }
    );

    y += 11;
    doc.setDrawColor(...PDF_PALETTE.secondary);
    doc.setLineWidth(0.5);
    doc.line(marginLeft, y, rightX, y);
    doc.setLineWidth(0.2);
    return y + 4.5;
  }

  // Full page-1 header
  if (logoAsset?.dataUrl) {
    const logoH = 12.5;
    const logoW = Math.min(48, (logoAsset.width / Math.max(1, logoAsset.height)) * logoH);
    doc.addImage(logoAsset.dataUrl, 'PNG', marginLeft, y, logoW, logoH, 'edrafter-logo', 'FAST');
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(...PDF_PALETTE.primary);
    doc.text(settings?.companyName || 'eDrafter Legal Solutions', marginLeft, y + 7);
  }

  if (settings?.parentCompany) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(...PDF_PALETTE.muted);
    doc.text(settings.parentCompany, marginLeft, y + 16);
  }

  // Right-aligned company details
  const companyName = settings?.companyName || 'eDrafter Legal Solutions';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...PDF_PALETTE.primary);
  doc.text(companyName, rightX, y + 4, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(...PDF_PALETTE.muted);

  let infoY = y + 8;
  const addr = settings?.officeAddress || settings?.registeredAddress || '';
  if (addr) {
    const wrappedAddr = doc.splitTextToSize(addr, 92) as string[];
    doc.text(wrappedAddr, rightX, infoY, { align: 'right' });
    infoY += wrappedAddr.length * 3.3;
  }

  const contactParts = [
    settings?.phone ? `Ph: ${settings.phone}` : null,
    settings?.email || null,
  ].filter(Boolean);
  if (contactParts.length > 0) {
    doc.text(contactParts.join('  |  '), rightX, infoY, { align: 'right' });
    infoY += 3.3;
  }

  const taxWebParts = [
    settings?.gstin ? `GSTIN: ${settings.gstin}` : null,
    settings?.website ? `Web: ${settings.website}` : null,
  ].filter(Boolean);
  if (taxWebParts.length > 0) {
    doc.text(taxWebParts.join('  |  '), rightX, infoY, { align: 'right' });
    infoY += 3.3;
  }

  y = Math.max(y + 18.5, infoY + 1.5);
  doc.setDrawColor(...PDF_PALETTE.secondary);
  doc.setLineWidth(0.6);
  doc.line(marginLeft, y, marginLeft + contentWidth, y);
  doc.setLineWidth(0.2);

  return y + 4.5;
}

function drawSectionHeading(doc: jsPDF, title: string, x: number, y: number, width: number): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...PDF_PALETTE.primary);
  doc.text(title, x, y);
  doc.setDrawColor(...PDF_PALETTE.border);
  doc.line(x, y + 1.5, x + width, y + 1.5);
  return y + 4.2;
}

function drawBreakdownTableHeader(doc: jsPDF, x: number, y: number, contentWidth: number): number {
  const rowH = 6.5;
  doc.setFillColor(...PDF_PALETTE.tableHeader);
  doc.setDrawColor(...PDF_PALETTE.border);
  doc.rect(x, y, contentWidth, rowH, 'FD');

  const colSNo = x + 3;
  const colPart = x + 14;
  const colQty = x + contentWidth - 68;
  const colUnit = x + contentWidth - 35;
  const colTotal = x + contentWidth - 3;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(...PDF_PALETTE.primary);
  doc.text('S.No.', colSNo, y + 4.5);
  doc.text('Particulars', colPart, y + 4.5);
  doc.text('Qty', colQty, y + 4.5, { align: 'right' });
  doc.text('Unit Amount', colUnit, y + 4.5, { align: 'right' });
  doc.text('Total Amount', colTotal, y + 4.5, { align: 'right' });

  return y + rowH;
}

function getStatusBadgeColor(status: string): readonly [number, number, number] {
  const normalized = (status || '').toLowerCase();
  if (normalized === 'paid') return [47, 94, 14]; // dark green complementary to #83C441
  if (normalized === 'partially paid') return PDF_PALETTE.secondary;
  if (normalized === 'refunded' || normalized === 'failed') return [153, 27, 27];
  return PDF_PALETTE.primary;
}

export async function buildReceiptPdf(
  bundle: ReceiptDetailBundle,
  options: PdfRenderOptions = {}
): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const { width: pageWidth, height: pageHeight, marginBottom, marginLeft, marginRight, footerBandHeight } =
    A4_PORTRAIT_MM;
  const contentWidth = pageWidth - marginLeft - marginRight;
  const rightX = pageWidth - marginRight;
  const maxContentY = pageHeight - marginBottom - footerBandHeight;

  const { receipt, items, customer, order, payment, companySettings } = bundle;

  // Load assets (if not explicitly injected)
  const [logoAsset, watermarkAsset] = await Promise.all([
    options.logoAsset !== undefined
      ? Promise.resolve(options.logoAsset)
      : loadImageAsDataUrl(companySettings?.logoUrl || BRAND_LOGO_URL, 720),
    options.watermarkAsset !== undefined
      ? Promise.resolve(options.watermarkAsset)
      : loadImageAsDataUrl(WATERMARK_ASSET_URL, 1100),
  ]);
  const qrDataUrl = options.qrCodeDataUrl !== undefined ? options.qrCodeDataUrl : bundle.qrCodeDataUrl;

  const addNewPage = (): number => {
    doc.addPage('a4', 'portrait');
    drawPageWatermark(doc, watermarkAsset, pageWidth, pageHeight);
    return drawHeaderBlock(doc, bundle, logoAsset, true);
  };

  // Page 1: draw watermark behind all content BEFORE rendering anything
  drawPageWatermark(doc, watermarkAsset, pageWidth, pageHeight);
  let y = drawHeaderBlock(doc, bundle, logoAsset, false);

  // Superseded notice if applicable
  if (receipt.status === 'Superseded') {
    doc.setDrawColor(185, 28, 28);
    doc.rect(marginLeft, y, contentWidth, 7.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(153, 27, 27);
    doc.text(
      `SUPERSEDED RECEIPT — Replaced by newer revision. Reason: ${receipt.cancellationReason || 'Revised'}`,
      marginLeft + 3,
      y + 5
    );
    y += 10;
  }

  // TITLE SECTION (Centered)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...PDF_PALETTE.primary);
  doc.text('PAYMENT RECEIPT', pageWidth / 2, y + 4, { align: 'center' });
  y += 6.5;

  // Centered metadata strip (Receipt No, Receipt Date, Order ID, Payment Status)
  const metaBoxH = 10.5;
  doc.setDrawColor(...PDF_PALETTE.border);
  doc.rect(marginLeft, y, contentWidth, metaBoxH);

  const cellW = contentWidth / 4;
  for (let i = 1; i < 4; i++) {
    doc.line(marginLeft + cellW * i, y, marginLeft + cellW * i, y + metaBoxH);
  }

  const metaCols = [
    { label: 'RECEIPT NUMBER', value: receipt.receiptNumber, color: PDF_PALETTE.primary },
    { label: 'RECEIPT DATE', value: receipt.receiptDate, color: PDF_PALETTE.text },
    { label: 'ORDER ID', value: order.orderCode, color: PDF_PALETTE.secondary },
    {
      label: 'PAYMENT STATUS',
      value: receipt.paymentStatus.toUpperCase(),
      color: getStatusBadgeColor(receipt.paymentStatus),
    },
  ];

  metaCols.forEach((col, idx) => {
    const cx = marginLeft + cellW * idx + cellW / 2;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...PDF_PALETTE.muted);
    doc.text(col.label, cx, y + 3.8, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.2);
    doc.setTextColor(...col.color);
    doc.text(col.value, cx, y + 8.2, { align: 'center' });
  });
  y += metaBoxH + 4.5;

  // CUSTOMER DETAILS (2-column grid, auto-height for long addresses, keep together)
  const colGap = 5;
  const colW = (contentWidth - colGap) / 2;
  const addressParts = [
    customer.billingAddress,
    [customer.city, customer.state, customer.pincode].filter(Boolean).join(', '),
  ]
    .filter(Boolean)
    .join(', ');

  const custLeftPairs: Array<[string, string]> = [
    ['Customer Name', customer.fullName || '—'],
    ...(customer.businessName ? ([['Business Name', customer.businessName]] as Array<[string, string]>) : []),
    ['Mobile Number', customer.mobileNumber || '—'],
    ['Email', customer.email || '—'],
  ];

  const custRightPairs: Array<[string, string]> = [
    ['Billing Address', addressParts || '—'],
    ...(customer.gstin ? ([['GSTIN', customer.gstin]] as Array<[string, string]>) : []),
  ];

  const measurePairs = (pairs: Array<[string, string]>, boxWidth: number) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    let h = 0;
    const measured = pairs.map(([label, value]) => {
      const wrapped = doc.splitTextToSize(`${label}: ${value}`, boxWidth - 6) as string[];
      h += wrapped.length * 3.6;
      return { label, value, wrapped };
    });
    return { measured, height: h };
  };

  const custLeft = measurePairs(custLeftPairs, colW);
  const custRight = measurePairs(custRightPairs, colW);
  const custSectionH = 5 + Math.max(custLeft.height, custRight.height) + 3.5;

  if (y + custSectionH > maxContentY) {
    y = addNewPage();
  }

  y = drawSectionHeading(doc, 'CUSTOMER DETAILS', marginLeft, y, contentWidth);
  const custBoxTop = y;
  const custBoxH = Math.max(custLeft.height, custRight.height) + 3.8;
  doc.setDrawColor(...PDF_PALETTE.border);
  doc.rect(marginLeft, custBoxTop, colW, custBoxH);
  doc.rect(marginLeft + colW + colGap, custBoxTop, colW, custBoxH);

  let cyLeft = custBoxTop + 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.setTextColor(...PDF_PALETTE.text);
  for (const row of custLeft.measured) {
    doc.text(row.wrapped, marginLeft + 3, cyLeft);
    cyLeft += row.wrapped.length * 3.6;
  }

  let cyRight = custBoxTop + 4;
  for (const row of custRight.measured) {
    doc.text(row.wrapped, marginLeft + colW + colGap + 3, cyRight);
    cyRight += row.wrapped.length * 3.6;
  }
  y = custBoxTop + custBoxH + 4;

  // ORDER & SERVICE DETAILS (keep together)
  const ordLeftPairs: Array<[string, string]> = [
    ['Order ID', order.orderCode],
    ['Order Date', order.orderDate],
    ['Service Category', order.serviceCategory],
    ['Service Name', order.serviceName],
  ];
  const ordRightPairs: Array<[string, string]> = [
    ['Document Name', order.documentName || '—'],
    ['Document Ref. No.', order.documentReferenceNumber || '—'],
    ['Delivery Method', order.deliveryMethod || 'Email'],
    ...(order.description ? ([['Description', order.description]] as Array<[string, string]>) : []),
  ];

  const ordLeft = measurePairs(ordLeftPairs, colW);
  const ordRight = measurePairs(ordRightPairs, colW);
  const ordSectionH = 5 + Math.max(ordLeft.height, ordRight.height) + 3.5;

  if (y + ordSectionH > maxContentY) {
    y = addNewPage();
  }

  y = drawSectionHeading(doc, 'ORDER & SERVICE DETAILS', marginLeft, y, contentWidth);
  const ordBoxTop = y;
  const ordBoxH = Math.max(ordLeft.height, ordRight.height) + 3.8;
  doc.setDrawColor(...PDF_PALETTE.border);
  doc.rect(marginLeft, ordBoxTop, colW, ordBoxH);
  doc.rect(marginLeft + colW + colGap, ordBoxTop, colW, ordBoxH);

  let oyLeft = ordBoxTop + 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.setTextColor(...PDF_PALETTE.text);
  for (const row of ordLeft.measured) {
    doc.text(row.wrapped, marginLeft + 3, oyLeft);
    oyLeft += row.wrapped.length * 3.6;
  }

  let oyRight = ordBoxTop + 4;
  for (const row of ordRight.measured) {
    doc.text(row.wrapped, marginLeft + colW + colGap + 3, oyRight);
    oyRight += row.wrapped.length * 3.6;
  }
  y = ordBoxTop + ordBoxH + 4.5;

  // PAYMENT BREAKDOWN TABLE (automatic multi-page splitting + repeated header)
  const breakdownLines = items.map((item) => computeBreakdownLine(item, order.quantity));
  if (y + 18 > maxContentY) {
    y = addNewPage();
  }
  y = drawSectionHeading(doc, 'PAYMENT BREAKDOWN', marginLeft, y, contentWidth);
  y = drawBreakdownTableHeader(doc, marginLeft, y, contentWidth);

  const particularsMaxW = contentWidth - 14 - 72; // leaves clean room for Qty / Unit / Total columns
  const colSNo = marginLeft + 3;
  const colPart = marginLeft + 14;
  const colQty = marginLeft + contentWidth - 68;
  const colUnit = marginLeft + contentWidth - 35;
  const colTotal = marginLeft + contentWidth - 3;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);

  for (const line of breakdownLines) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    const wrappedPart = doc.splitTextToSize(line.particulars, particularsMaxW) as string[];
    const rowH = Math.max(6, wrappedPart.length * 3.5 + 2.4);

    if (y + rowH > maxContentY) {
      y = addNewPage();
      y = drawSectionHeading(doc, 'PAYMENT BREAKDOWN - CONTINUED', marginLeft, y, contentWidth);
      y = drawBreakdownTableHeader(doc, marginLeft, y, contentWidth);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.2);
    }

    doc.setDrawColor(...PDF_PALETTE.border);
    doc.rect(marginLeft, y, contentWidth, rowH);

    doc.setTextColor(...PDF_PALETTE.muted);
    doc.text(String(line.sNo), colSNo, y + 4.1);

    doc.setTextColor(...PDF_PALETTE.text);
    doc.text(wrappedPart, colPart, y + 4.1);

    doc.text(String(line.quantity), colQty, y + 4.1, { align: 'right' });
    doc.text(formatPdfInr(line.unitAmount), colUnit, y + 4.1, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.text(formatPdfInr(line.totalAmount), colTotal, y + 4.1, { align: 'right' });
    doc.setFont('helvetica', 'normal');

    y += rowH;
  }

  // Grand Total footer row in table
  if (y + 7 > maxContentY) {
    y = addNewPage();
    y = drawBreakdownTableHeader(doc, marginLeft, y, contentWidth);
  }
  doc.setFillColor(...PDF_PALETTE.tableHeader);
  doc.setDrawColor(...PDF_PALETTE.border);
  doc.rect(marginLeft, y, contentWidth, 6.8, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_PALETTE.primary);
  doc.text('Grand Total', colPart, y + 4.6);
  doc.text(formatPdfInr(receipt.grandTotal), colTotal, y + 4.6, { align: 'right' });
  y += 10.5;

  // TRANSACTION DETAILS & PAYMENT SUMMARY (keep block together; never split mid-card)
  const txRows: Array<[string, string]> = [
    ['Payment Mode', payment.paymentMode || '—'],
    ['Payment Type', receipt.paymentType || '—'],
    ...(payment.transactionId ? ([['Transaction ID', payment.transactionId]] as Array<[string, string]>) : []),
    ...(payment.upiReference ? ([['UPI Reference', payment.upiReference]] as Array<[string, string]>) : []),
    ...(payment.bankName ? ([['Bank / Gateway', payment.bankName]] as Array<[string, string]>) : []),
    ['Payment Date', payment.paymentDate || '—'],
    ['Payment Time', payment.paymentTime || '—'],
  ];

  const subtotalVal =
    roundInr(receipt.serviceAmount) +
    roundInr(receipt.governmentFee) +
    roundInr(receipt.stampDuty) +
    roundInr(receipt.notaryFee) +
    roundInr(receipt.courierCharge) +
    roundInr(receipt.otherCharges);

  const summaryRows: Array<{ label: string; value: string; style?: 'normal' | 'teal' | 'bold' | 'balance' }> = [
    { label: 'Subtotal', value: formatPdfInr(subtotalVal) },
    ...(roundInr(receipt.discount) > 0
      ? [{ label: 'Discount', value: `- ${formatPdfInr(receipt.discount)}` }]
      : []),
    { label: 'Taxable Amount', value: formatPdfInr(receipt.taxableAmount) },
    ...(roundInr(receipt.cgstAmount) > 0
      ? [{ label: `CGST (${receipt.cgstRate}%)`, value: formatPdfInr(receipt.cgstAmount) }]
      : []),
    ...(roundInr(receipt.sgstAmount) > 0
      ? [{ label: `SGST (${receipt.sgstRate}%)`, value: formatPdfInr(receipt.sgstAmount) }]
      : []),
    ...(roundInr(receipt.igstAmount) > 0
      ? [{ label: `IGST (${receipt.igstRate}%)`, value: formatPdfInr(receipt.igstAmount) }]
      : []),
    ...(roundInr(receipt.totalGst) === 0 ? [{ label: 'Total GST', value: formatPdfInr(0) }] : []),
    { label: 'Grand Total', value: formatPdfInr(receipt.grandTotal), style: 'bold' },
    { label: 'Previously Paid', value: formatPdfInr(receipt.previouslyPaid) },
    { label: 'Current Payment', value: formatPdfInr(receipt.currentPayment), style: 'teal' },
    { label: 'Total Amount Paid', value: formatPdfInr(receipt.totalPaid), style: 'bold' },
    { label: 'Remaining Balance', value: formatPdfInr(receipt.remainingBalance), style: 'balance' },
  ];

  const txCardH = 6 + txRows.length * 4 + 2.5;
  const sumCardH = 6 + summaryRows.length * 4 + 2.5;
  const cardsBlockH = Math.max(txCardH, sumCardH);

  // Measure Amount in Words banner
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  const wordsLines = doc.splitTextToSize(`Amount in Words: ${receipt.amountInWords}`, contentWidth - 6) as string[];
  const wordsBoxH = Math.max(7.2, wordsLines.length * 3.6 + 3.4);

  // Keep Transaction + Summary + Amount in Words together
  if (y + cardsBlockH + 3 + wordsBoxH > maxContentY) {
    y = addNewPage();
  }

  const cardTop = y;
  doc.setDrawColor(...PDF_PALETTE.border);
  doc.rect(marginLeft, cardTop, colW, cardsBlockH);
  doc.rect(marginLeft + colW + colGap, cardTop, colW, cardsBlockH);

  // Left: Transaction Details
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(...PDF_PALETTE.primary);
  doc.text('TRANSACTION DETAILS', marginLeft + 3, cardTop + 4.5);
  doc.line(marginLeft + 3, cardTop + 5.8, marginLeft + colW - 3, cardTop + 5.8);

  let ty = cardTop + 9.8;
  doc.setFontSize(7.8);
  for (const [k, v] of txRows) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...PDF_PALETTE.muted);
    doc.text(`${k}:`, marginLeft + 3, ty);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...PDF_PALETTE.text);
    doc.text(v, marginLeft + colW - 3, ty, { align: 'right' });
    ty += 4;
  }

  // Right: Payment Summary
  const sumX = marginLeft + colW + colGap;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(...PDF_PALETTE.primary);
  doc.text('PAYMENT SUMMARY', sumX + 3, cardTop + 4.5);
  doc.line(sumX + 3, cardTop + 5.8, sumX + colW - 3, cardTop + 5.8);

  let sy = cardTop + 9.8;
  doc.setFontSize(7.8);
  const hasBalance = roundInr(receipt.remainingBalance) > 0;
  for (const row of summaryRows) {
    if (row.style === 'teal') {
      doc.setFillColor(...PDF_PALETTE.highlightBg);
      doc.rect(sumX + 1.5, sy - 2.9, colW - 3, 4, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...PDF_PALETTE.secondary);
    } else if (row.style === 'balance') {
      doc.setFont('helvetica', 'bold');
      if (hasBalance) {
        doc.setTextColor(180, 83, 9);
      } else {
        doc.setTextColor(47, 94, 14);
      }
    } else if (row.style === 'bold') {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...PDF_PALETTE.primary);
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...PDF_PALETTE.text);
    }
    doc.text(row.label, sumX + 3, sy);
    doc.text(row.value, sumX + colW - 3, sy, { align: 'right' });
    sy += 4;
  }

  y = cardTop + cardsBlockH + 3;

  // Amount in Words strip (left teal accent bar + border)
  doc.setDrawColor(...PDF_PALETTE.border);
  doc.rect(marginLeft, y, contentWidth, wordsBoxH);
  doc.setFillColor(...PDF_PALETTE.secondary);
  doc.rect(marginLeft, y, 1.8, wordsBoxH, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(...PDF_PALETTE.primary);
  doc.text(wordsLines, marginLeft + 4.5, y + 4.6);
  y += wordsBoxH + 4.5;

  // ACKNOWLEDGEMENT & TERMS
  const terms = companySettings?.termsAndConditions?.length
    ? companySettings.termsAndConditions
    : ['This is a system-generated legal payment receipt issued upon verified realization of funds.'];

  if (y + 12 > maxContentY) {
    y = addNewPage();
  }

  y = drawSectionHeading(doc, 'ACKNOWLEDGEMENT & TERMS', marginLeft, y, contentWidth);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  doc.setTextColor(...PDF_PALETTE.text);
  doc.text('Received with thanks. We acknowledge receipt of the above-mentioned payment.', marginLeft, y);
  y += 3.8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(...PDF_PALETTE.muted);

  for (let i = 0; i < terms.length; i++) {
    const wrapped = doc.splitTextToSize(`${i + 1}. ${terms[i]}`, contentWidth) as string[];
    const termH = wrapped.length * 3.1 + 0.6;
    if (y + termH > maxContentY) {
      y = addNewPage();
      y = drawSectionHeading(doc, 'TERMS & CONDITIONS - CONTINUED', marginLeft, y, contentWidth);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.2);
      doc.setTextColor(...PDF_PALETTE.muted);
    }
    doc.text(wrapped, marginLeft, y);
    y += termH;
  }

  y += 2;

  // SIGNATORY, STAMP, QR CODE & SUPPORT BLOCK (keep together on page!)
  const closingBlockH = 31;
  if (y + closingBlockH > maxContentY) {
    y = addNewPage();
  }

  doc.setDrawColor(...PDF_PALETTE.border);
  doc.rect(marginLeft, y, contentWidth, closingBlockH);

  // Left: Company Stamp Box + Support Info + Thank You
  doc.setDrawColor(...PDF_PALETTE.secondary);
  doc.rect(marginLeft + 3.5, y + 3, 50, 14);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(...PDF_PALETTE.secondary);
  doc.text('DIGITALLY VERIFIED RECEIPT', marginLeft + 28.5, y + 7.5, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.3);
  doc.setTextColor(...PDF_PALETTE.primary);
  doc.text(companySettings?.companyName || 'eDrafter Legal Solutions', marginLeft + 28.5, y + 11.2, {
    align: 'center',
  });
  doc.text(`Ref: ${receipt.receiptNumber}`, marginLeft + 28.5, y + 14.8, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  doc.setTextColor(...PDF_PALETTE.primary);
  doc.text(
    companySettings?.footerText || 'Thank you for choosing eDrafter.',
    marginLeft + 3.5,
    y + 22.5
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(...PDF_PALETTE.muted);
  const supportLine = [
    companySettings?.phone ? `Support: ${companySettings.phone}` : null,
    companySettings?.email || null,
    companySettings?.website || null,
  ]
    .filter(Boolean)
    .join('  |  ');
  if (supportLine) {
    doc.text(supportLine, marginLeft + 3.5, y + 27);
  }

  // Center: Authorized Signatory
  const sigCenterX = marginLeft + contentWidth - 54;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  doc.setTextColor(...PDF_PALETTE.primary);
  doc.text(`For ${companySettings?.companyName || 'eDrafter Legal Solutions'}`, sigCenterX, y + 7, {
    align: 'center',
  });
  doc.setDrawColor(...PDF_PALETTE.border);
  doc.line(sigCenterX - 20, y + 19, sigCenterX + 20, y + 19);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(...PDF_PALETTE.muted);
  doc.text(
    companySettings?.authorizedSignatory || 'Authorized Signatory',
    sigCenterX,
    y + 23.5,
    { align: 'center' }
  );

  // Right: QR Code
  const qrBoxSize = 21.5;
  const qrX = rightX - qrBoxSize - 3.5;
  const qrY = y + 2.8;
  if (qrDataUrl) {
    doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrBoxSize, qrBoxSize);
  } else {
    doc.setDrawColor(...PDF_PALETTE.border);
    doc.rect(qrX, qrY, qrBoxSize, qrBoxSize);
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.2);
  doc.setTextColor(...PDF_PALETTE.muted);
  doc.text('Scan to Verify Online', qrX + qrBoxSize / 2, y + 28.2, { align: 'center' });

  // Page numbering pass across all pages
  const totalPages = doc.getNumberOfPages();
  const footerLineY = pageHeight - marginBottom + 2;
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...PDF_PALETTE.border);
    doc.line(marginLeft, footerLineY - 4, rightX, footerLineY - 4);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...PDF_PALETTE.muted);
    doc.text(
      `${companySettings?.companyName || 'eDrafter Legal Solutions'}  |  ${receipt.receiptNumber}  |  System-Generated Receipt`,
      marginLeft,
      footerLineY
    );
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...PDF_PALETTE.primary);
    doc.text(`Page ${p} of ${totalPages}`, rightX, footerLineY, { align: 'right' });
  }

  if (options.save) {
    const safeFilename = `${receipt.receiptNumber.replaceAll('/', '_')}.pdf`;
    doc.save(safeFilename);
  }

  return doc;
}

export async function downloadReceiptPdf(bundle: ReceiptDetailBundle): Promise<void> {
  await buildReceiptPdf(bundle, { save: true });
}

export function exportRowsToCsv(filename: string, rows: Array<Record<string, string | number>>) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csvLines = [
    headers.join(','),
    ...rows.map((r) =>
      headers
        .map((h) => {
          const v = String(r[h] ?? '').replaceAll('"', '""');
          return `"${v}"`;
        })
        .join(',')
    ),
  ];
  const blob = new Blob(['\uFEFF' + csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function exportRowsToExcel(filename: string, title: string, rows: Array<Record<string, string | number>>) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const tableRows = rows
    .map(
      (r) =>
        `<tr>${headers.map((h) => `<td>${String(r[h] ?? '').replaceAll('<', '&lt;')}</td>`).join('')}</tr>`
    )
    .join('');

  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
      <head><meta charset="utf-8" /><title>${title}</title></head>
      <body>
        <table border="1">
          <thead><tr>${headers.map((h) => `<th style="background:#310D35;color:#fff;">${h}</th>`).join('')}</tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </body>
    </html>
  `;
  const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename.endsWith('.xls') ? filename : `${filename}.xls`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export async function exportRowsToPdf(
  filename: string,
  title: string,
  rows: Array<Record<string, string | number>>,
  options?: { watermarkAsset?: PdfImageAsset | null }
): Promise<void> {
  if (!rows.length) return;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = 297;
  const pageHeight = 210;
  const watermarkAsset =
    options?.watermarkAsset !== undefined ? options.watermarkAsset : await loadImageAsDataUrl(WATERMARK_ASSET_URL);

  const headers = Object.keys(rows[0]);
  const colWidth = Math.min(48, 268 / headers.length);

  const drawReportHeader = (cont: boolean) => {
    drawPageWatermark(doc, watermarkAsset, pageWidth, pageHeight);
    doc.setFillColor(...PDF_PALETTE.primary);
    doc.rect(0, 0, pageWidth * 0.67, 3.2, 'F');
    doc.setFillColor(...PDF_PALETTE.secondary);
    doc.rect(pageWidth * 0.67, 0, pageWidth * 0.33, 3.2, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...PDF_PALETTE.primary);
    doc.text(`eDrafter — ${title}${cont ? ' (Continued)' : ''}`, 14, 15);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...PDF_PALETTE.muted);
    doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, 283, 15, { align: 'right' });

    doc.setFillColor(...PDF_PALETTE.tableHeader);
    doc.setDrawColor(...PDF_PALETTE.border);
    doc.rect(14, 22, 269, 8, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...PDF_PALETTE.primary);
    headers.forEach((h, i) => {
      doc.text(h.slice(0, 20), 16 + i * colWidth, 27.5);
    });
    return 30;
  };

  let y = drawReportHeader(false);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...PDF_PALETTE.text);
  rows.forEach((row) => {
    if (y > 190) {
      doc.addPage('a4', 'landscape');
      y = drawReportHeader(true);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...PDF_PALETTE.text);
    }
    doc.setDrawColor(...PDF_PALETTE.border);
    doc.rect(14, y, 269, 7);
    headers.forEach((h, i) => {
      doc.text(String(row[h] ?? '').slice(0, 24), 16 + i * colWidth, y + 4.8);
    });
    y += 7;
  });

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...PDF_PALETTE.muted);
    doc.text(`Page ${p} of ${totalPages}`, 283, 202, { align: 'right' });
  }

  doc.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
}
