import test from 'node:test';
import assert from 'node:assert/strict';
import {
  amountToIndianWords,
  calculateOrderFinancials,
  formatReceiptNumber,
  isValidGstin,
  isValidIndianMobile,
  isValidPan,
  maskMobileForVerification,
  maskNameForVerification,
} from './finance';

test('calculateOrderFinancials computes subtotal, discount, GST, grand total and balance accurately in paise', () => {
  const res = calculateOrderFinancials({
    serviceFee: 1500,
    governmentFee: 500,
    stampDuty: 100,
    notaryCharges: 250,
    courierCharges: 150,
    otherCharges: 0,
    discount: 100,
    cgstRate: 9,
    sgstRate: 9,
    igstRate: 0,
    previouslyPaid: 1000,
    currentPayment: 1832,
  });

  // Subtotal = 1500 + 500 + 100 + 250 + 150 = 2500
  // Taxable = 2500 - 100 = 2400
  // CGST = 9% of 2400 = 216, SGST = 216, Total GST = 432
  // Grand Total = 2832
  // Total Paid = 1000 + 1832 = 2832 -> Paid, remaining 0
  assert.equal(res.subtotal, 2500);
  assert.equal(res.taxableAmount, 2400);
  assert.equal(res.cgstAmount, 216);
  assert.equal(res.sgstAmount, 216);
  assert.equal(res.totalGst, 432);
  assert.equal(res.grandTotal, 2832);
  assert.equal(res.totalPaid, 2832);
  assert.equal(res.remainingBalance, 0);
  assert.equal(res.paymentStatus, 'Paid');
});

test('calculateOrderFinancials handles partial payments and floating point paise precision', () => {
  const res = calculateOrderFinancials({
    serviceFee: 999.99,
    governmentFee: 0.01,
    stampDuty: 0,
    notaryCharges: 0,
    courierCharges: 0,
    otherCharges: 0,
    discount: 0,
    cgstRate: 0,
    sgstRate: 0,
    igstRate: 0,
    previouslyPaid: 0,
    currentPayment: 400.5,
  });

  assert.equal(res.subtotal, 1000);
  assert.equal(res.grandTotal, 1000);
  assert.equal(res.totalPaid, 400.5);
  assert.equal(res.remainingBalance, 599.5);
  assert.equal(res.paymentStatus, 'Partially Paid');
});

test('amountToIndianWords formats Indian Rupees with Lakh, Crore, and Paise', () => {
  assert.equal(amountToIndianWords(0), 'Rupees Zero Only');
  assert.equal(amountToIndianWords(2832), 'Rupees Two Thousand Eight Hundred Thirty Two Only');
  assert.equal(
    amountToIndianWords(125450.75),
    'Rupees One Lakh Twenty Five Thousand Four Hundred Fifty and Seventy Five Paise Only'
  );
  assert.equal(amountToIndianWords(10000000), 'Rupees One Crore Only');
});

test('formatReceiptNumber follows EDR/PR/2026-27/00001 pattern', () => {
  assert.equal(formatReceiptNumber('EDR/PR', '2026-27', 1), 'EDR/PR/2026-27/00001');
  assert.equal(formatReceiptNumber('LSI/PR/', '2026-27', 42), 'LSI/PR/2026-27/00042');
});

test('privacy masking hides sensitive characters on public verification', () => {
  assert.equal(maskNameForVerification('Rajesh Kumar Sharma'), 'Ra****h Ku***r Sh****a');
  assert.equal(maskMobileForVerification('9876543210'), '******3210');
});

test('Indian mobile, GSTIN, and PAN validators accept valid and reject invalid formats', () => {
  assert.equal(isValidIndianMobile('9876543210'), true);
  assert.equal(isValidIndianMobile('+91 9876543210'), true);
  assert.equal(isValidIndianMobile('12345'), false);
  assert.equal(isValidGstin('07AABCU9603R1ZM'), true);
  assert.equal(isValidGstin('INVALID'), false);
  assert.equal(isValidPan('ABCDE1234F'), true);
  assert.equal(isValidPan('12345'), false);
});
