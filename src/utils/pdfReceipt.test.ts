import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import QRCode from 'qrcode';
import type { ReceiptDetailBundle, ReceiptItemRow } from '../types/portal';
import {
  A4_PORTRAIT_MM,
  buildReceiptPdf,
  calculateWatermarkBox,
  computeBreakdownLine,
  formatPdfInr,
  type PdfImageAsset,
} from './pdfReceipt';

function loadPngAssetFromDisk(relativePath: string, width: number, height: number): PdfImageAsset {
  const buf = fs.readFileSync(path.resolve(process.cwd(), relativePath));
  return {
    dataUrl: `data:image/png;base64,${buf.toString('base64')}`,
    width,
    height,
  };
}

const LOGO_ASSET = loadPngAssetFromDisk(
  'public/assets/aistudio/eDrafter_s_Legal_Solutions_Logo_dcc73c7d.png',
  2156,
  729
);
const WATERMARK_ASSET = loadPngAssetFromDisk(
  'public/assets/aistudio/edrafter_logo_watermark_light_841bec48.png',
  2048,
  692
);

function makeSampleBundle(overrides?: {
  items?: ReceiptItemRow[];
  address?: string;
  terms?: string[];
  paymentStatus?: string;
  previouslyPaid?: string;
  currentPayment?: string;
  totalPaid?: string;
  remainingBalance?: string;
  grandTotal?: string;
  amountInWords?: string;
  quantity?: number;
}): ReceiptDetailBundle {
  const items: ReceiptItemRow[] = overrides?.items ?? [
    { id: 1, receiptId: 101, sNo: 1, particulars: 'Trademark Registration Professional Fee', amount: '4500.00', itemType: 'service' },
    { id: 2, receiptId: 101, sNo: 2, particulars: 'Statutory Government Filing Fee', amount: '4500.00', itemType: 'govt_fee' },
    { id: 3, receiptId: 101, sNo: 3, particulars: 'CGST (9%)', amount: '405.00', itemType: 'tax' },
    { id: 4, receiptId: 101, sNo: 4, particulars: 'SGST (9%)', amount: '405.00', itemType: 'tax' },
  ];

  return {
    receipt: {
      id: 101,
      receiptNumber: 'LSI/PR/2026-27/00042',
      receiptDate: '2026-04-15',
      orderId: 55,
      paymentId: 88,
      customerId: 12,
      verificationToken: 'tok_verify_sample_42',
      paymentStatus: overrides?.paymentStatus ?? 'Paid',
      paymentType: overrides?.paymentStatus === 'Partially Paid' ? 'Advance Payment' : 'Full Payment',
      serviceAmount: '4500.00',
      governmentFee: '4500.00',
      stampDuty: '0.00',
      notaryFee: '0.00',
      courierCharge: '0.00',
      otherCharges: '0.00',
      discount: '0.00',
      taxableAmount: '9000.00',
      cgstRate: '9.00',
      cgstAmount: '405.00',
      sgstRate: '9.00',
      sgstAmount: '405.00',
      igstRate: '0.00',
      igstAmount: '0.00',
      totalGst: '810.00',
      grandTotal: overrides?.grandTotal ?? '9810.00',
      previouslyPaid: overrides?.previouslyPaid ?? '0.00',
      currentPayment: overrides?.currentPayment ?? '9810.00',
      totalPaid: overrides?.totalPaid ?? '9810.00',
      remainingBalance: overrides?.remainingBalance ?? '0.00',
      amountInWords: overrides?.amountInWords ?? 'Rupees Nine Thousand Eight Hundred Ten Only',
      status: 'Issued',
      revisionNumber: 1,
      parentReceiptId: null,
      cancellationReason: '',
      reprintCount: 0,
      issuedBy: 'Ananya Verma',
      createdAt: '2026-04-15T10:30:00.000Z',
    },
    items,
    customer: {
      id: 12,
      customerCode: 'CUST-0012',
      fullName: 'Rohan Malhotra',
      businessName: 'Apex Legal Ventures Pvt. Ltd.',
      mobileNumber: '9876543210',
      email: 'rohan@apexlegal.in',
      billingAddress:
        overrides?.address ?? 'Suite 402, DLF Corporate Park, MG Road, Sector 24',
      city: 'Gurugram',
      state: 'Haryana',
      pincode: '122002',
      gstin: '06AABCA1234F1Z5',
      pan: 'AABCA1234F',
      notes: '',
      createdBy: 'Ananya Verma',
      createdAt: '2026-04-01T09:00:00.000Z',
    },
    order: {
      id: 55,
      orderCode: 'EDR-ORD-2026-0055',
      orderDate: '2026-04-15',
      customerId: 12,
      serviceId: 3,
      serviceCategory: 'Trademark Registration',
      serviceName: 'Trademark Registration (Class 35)',
      documentName: 'Form TM-A Application',
      documentReferenceNumber: 'TM-2026-88412',
      state: 'Haryana',
      quantity: overrides?.quantity ?? 1,
      description: 'Brand wordmark filing and advisory services.',
      assignedExecutive: 'Ananya Verma',
      expectedDeliveryDate: '2026-04-20',
      deliveryMethod: 'Email',
      deliveryAddress: '',
      internalNotes: '',
      orderStatus: 'Payment Confirmed',
      serviceFee: '4500.00',
      governmentFee: '4500.00',
      stampDuty: '0.00',
      notaryCharges: '0.00',
      courierCharges: '0.00',
      otherCharges: '0.00',
      discount: '0.00',
      subtotal: '9000.00',
      taxableAmount: '9000.00',
      cgstRate: '9.00',
      sgstRate: '9.00',
      igstRate: '0.00',
      cgstAmount: '405.00',
      sgstAmount: '405.00',
      igstAmount: '0.00',
      totalGst: '810.00',
      grandTotal: overrides?.grandTotal ?? '9810.00',
      totalPaid: overrides?.totalPaid ?? '9810.00',
      remainingBalance: overrides?.remainingBalance ?? '0.00',
      paymentStatus: overrides?.paymentStatus ?? 'Paid',
      createdBy: 'Ananya Verma',
      createdAt: '2026-04-15T10:00:00.000Z',
    },
    payment: {
      id: 88,
      paymentCode: 'PAY-2026-0088',
      orderId: 55,
      customerId: 12,
      paymentDate: '2026-04-15',
      paymentTime: '10:25',
      amount: overrides?.currentPayment ?? '9810.00',
      paymentType: overrides?.paymentStatus === 'Partially Paid' ? 'Advance Payment' : 'Full Payment',
      paymentMode: 'UPI',
      transactionId: 'TXN9988776655',
      upiReference: '410612349876',
      upiId: 'rohan@okaxis',
      bankName: 'HDFC Bank',
      chequeNumber: '',
      chequeDate: '',
      paymentGateway: 'Razorpay',
      gatewayReference: 'pay_Nx8201Abc',
      paymentReceivedBy: 'Ananya Verma',
      paymentVerified: true,
      verificationStatus: 'Verified',
      paymentStatus: 'Completed',
      notes: '',
      verifiedBy: 'Ananya Verma',
      createdAt: '2026-04-15T10:25:00.000Z',
    },
    companySettings: {
      id: 1,
      companyName: 'eDrafter Legal Solutions',
      parentCompany: 'Legal Success India / Khalid Legal Works',
      logoUrl: '/assets/aistudio/eDrafter_s_Legal_Solutions_Logo_dcc73c7d.png',
      registeredAddress: 'Plot 14, Institutional Area, Sector 32, Gurugram, Haryana 122001',
      officeAddress: 'Tower B, 5th Floor, DLF Cyber Hub, Gurugram, Haryana 122002',
      phone: '+91-124-4001234',
      email: 'support@edrafter.in',
      website: 'https://www.edrafter.in',
      gstin: '06AABCE1234D1Z2',
      pan: 'AABCE1234D',
      receiptPrefix: 'LSI/PR',
      financialYear: '2026-27',
      currency: 'INR',
      defaultCgstRate: '9.00',
      defaultSgstRate: '9.00',
      defaultIgstRate: '0.00',
      authorizedSignatory: 'Authorized Signatory',
      footerText: 'Thank you for choosing eDrafter.',
      termsAndConditions: overrides?.terms ?? [
        'This receipt is subject to realization of payment instruments.',
        'Government fees and stamp duty once paid are non-refundable.',
        'Verify authenticity anytime by scanning the QR code.',
      ],
      serviceCategories: ['Trademark Registration'],
      showWatermark: false,
    },
    verificationUrl: 'https://www.edrafter.in/verify-receipt/tok_verify_sample_42',
    qrCodeDataUrl: '',
    history: [],
  };
}

test('watermark box preserves 72% A4 width and exact PNG aspect ratio', () => {
  const box = calculateWatermarkBox(A4_PORTRAIT_MM.width, A4_PORTRAIT_MM.height, 2048, 692, 0.72);
  assert.equal(Number(box.width.toFixed(2)), 151.2);
  assert.equal(Number(box.height.toFixed(2)), 51.09);
  assert.equal(Number(box.x.toFixed(2)), 29.4);
  assert.equal(Number(box.y.toFixed(2)), 122.96);
});

test('computeBreakdownLine splits multi-quantity service items accurately', () => {
  const line = computeBreakdownLine(
    { id: 1, receiptId: 1, sNo: 1, particulars: 'E-Stamp Paper Rs. 100', amount: '600.00', itemType: 'stamp_duty' },
    3
  );
  assert.equal(line.quantity, 3);
  assert.equal(line.unitAmount, 200);
  assert.equal(line.totalAmount, 600);
  assert.equal(formatPdfInr(600), 'Rs. 600.00');
});

test('Scenario 1: standard one-page payment receipt fits on 1 page with watermark & QR', async () => {
  const qrDataUrl = await QRCode.toDataURL('https://www.edrafter.in/verify-receipt/tok_verify_sample_42');
  const bundle = makeSampleBundle();
  const doc = await buildReceiptPdf(bundle, {
    logoAsset: LOGO_ASSET,
    watermarkAsset: WATERMARK_ASSET,
    qrCodeDataUrl: qrDataUrl,
  });

  assert.equal(doc.getNumberOfPages(), 1);
  const rawPdf = doc.output();
  assert.ok(rawPdf.startsWith('%PDF-'));
  assert.ok(rawPdf.includes('PAYMENT RECEIPT'));
  assert.ok(rawPdf.includes('LSI/PR/2026-27/00042'));
  assert.ok(rawPdf.includes('Page 1 of 1'));
  // Ensure watermark alias/XObject image was embedded
  assert.ok(rawPdf.includes('/XObject'));
});

test('Scenario 2: two-page payment receipt cleanly overflows terms/items onto Page 2 with Page 1 of 2 / Page 2 of 2', async () => {
  const qrDataUrl = await QRCode.toDataURL('https://www.edrafter.in/verify-receipt/tok_verify_sample_42');
  const longTerms = Array.from({ length: 16 }, (_, i) =>
    `Clause ${i + 1}: Legal documentation processing timeline, statutory authority rules, client verification obligations, and dispatch SLA under jurisdiction of New Delhi courts.`
  );
  const bundle = makeSampleBundle({ terms: longTerms });
  const doc = await buildReceiptPdf(bundle, {
    logoAsset: LOGO_ASSET,
    watermarkAsset: WATERMARK_ASSET,
    qrCodeDataUrl: qrDataUrl,
  });

  assert.equal(doc.getNumberOfPages(), 2);
  const rawPdf = doc.output();
  assert.ok(rawPdf.includes('Page 1 of 2'));
  assert.ok(rawPdf.includes('Page 2 of 2'));
  assert.ok(rawPdf.includes('PAYMENT RECEIPT - CONTINUED'));
});

test('Scenario 3: receipt with very long customer address wraps cleanly without extra broken pages', async () => {
  const qrDataUrl = await QRCode.toDataURL('https://www.edrafter.in/verify-receipt/tok_verify_sample_42');
  const bundle = makeSampleBundle({
    address:
      'Penthouse 18B, North Commercial Wing, Tower 4, Prestige Tech Park & Legal Chambers, Outer Ring Road, Bellandur Ward, Near EcoSpace Junction, Opposite Central Excise Office',
  });
  const doc = await buildReceiptPdf(bundle, {
    logoAsset: LOGO_ASSET,
    watermarkAsset: WATERMARK_ASSET,
    qrCodeDataUrl: qrDataUrl,
  });

  assert.equal(doc.getNumberOfPages(), 1);
  const rawPdf = doc.output();
  assert.ok(rawPdf.includes('Penthouse 18B'));
});

test('Scenario 4: receipt with 32 charge items repeats breakdown header across pages cleanly', async () => {
  const qrDataUrl = await QRCode.toDataURL('https://www.edrafter.in/verify-receipt/tok_verify_sample_42');
  const manyItems: ReceiptItemRow[] = Array.from({ length: 32 }, (_, idx) => ({
    id: idx + 1,
    receiptId: 101,
    sNo: idx + 1,
    particulars: `Legal Drafting & E-Stamp Schedule Item #${idx + 1} (Jurisdiction Verification)`,
    amount: '500.00',
    itemType: 'service',
  }));
  const bundle = makeSampleBundle({ items: manyItems, grandTotal: '16000.00', currentPayment: '16000.00', totalPaid: '16000.00' });
  const doc = await buildReceiptPdf(bundle, {
    logoAsset: LOGO_ASSET,
    watermarkAsset: WATERMARK_ASSET,
    qrCodeDataUrl: qrDataUrl,
  });

  assert.ok(doc.getNumberOfPages() >= 2, `Expected >= 2 pages, got ${doc.getNumberOfPages()}`);
  const rawPdf = doc.output();
  assert.ok(rawPdf.includes('PAYMENT BREAKDOWN - CONTINUED'));
});

test('Scenario 5: partially paid receipt renders remaining balance, previously paid, and advance amount in words', async () => {
  const qrDataUrl = await QRCode.toDataURL('https://www.edrafter.in/verify-receipt/tok_verify_sample_42');
  const bundle = makeSampleBundle({
    paymentStatus: 'Partially Paid',
    grandTotal: '9810.00',
    previouslyPaid: '2000.00',
    currentPayment: '3000.00',
    totalPaid: '5000.00',
    remainingBalance: '4810.00',
    amountInWords: 'Rupees Three Thousand Only',
  });
  const doc = await buildReceiptPdf(bundle, {
    logoAsset: LOGO_ASSET,
    watermarkAsset: WATERMARK_ASSET,
    qrCodeDataUrl: qrDataUrl,
  });

  assert.equal(doc.getNumberOfPages(), 1);
  const rawPdf = doc.output();
  assert.ok(rawPdf.includes('PARTIALLY PAID'));
  assert.ok(rawPdf.includes('Rs. 4,810.00'));
  assert.ok(rawPdf.includes('Rupees Three Thousand Only'));
});
