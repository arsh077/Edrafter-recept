export interface OrderFinancialInput {
  serviceFee: number;
  governmentFee: number;
  stampDuty: number;
  notaryCharges: number;
  courierCharges: number;
  otherCharges: number;
  discount: number;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  previouslyPaid?: number;
  currentPayment?: number;
}

export interface OrderFinancialResult {
  subtotal: number;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalGst: number;
  grandTotal: number;
  previouslyPaid: number;
  currentPayment: number;
  totalPaid: number;
  remainingBalance: number;
  overpaymentAmount: number;
  paymentStatus: 'Paid' | 'Partially Paid' | 'Pending';
}

export function toPaise(amount: number | string | null | undefined): number {
  const num = typeof amount === 'string' ? parseFloat(amount) : Number(amount ?? 0);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100);
}

export function fromPaise(paise: number): number {
  return Math.round(paise) / 100;
}

export function roundInr(amount: number | string | null | undefined): number {
  return fromPaise(toPaise(amount));
}

export function formatInr(amount: number | string | null | undefined): string {
  const val = roundInr(amount);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val);
}

export function calculateOrderFinancials(input: OrderFinancialInput): OrderFinancialResult {
  const serviceP = Math.max(0, toPaise(input.serviceFee));
  const govtP = Math.max(0, toPaise(input.governmentFee));
  const stampP = Math.max(0, toPaise(input.stampDuty));
  const notaryP = Math.max(0, toPaise(input.notaryCharges));
  const courierP = Math.max(0, toPaise(input.courierCharges));
  const otherP = Math.max(0, toPaise(input.otherCharges));

  const subtotalP = serviceP + govtP + stampP + notaryP + courierP + otherP;
  const discountP = Math.min(subtotalP, Math.max(0, toPaise(input.discount)));
  const taxableP = Math.max(0, subtotalP - discountP);

  // Tax rates applied to taxable amount (only when explicitly configured > 0)
  const cgstRate = Math.max(0, Number(input.cgstRate) || 0);
  const sgstRate = Math.max(0, Number(input.sgstRate) || 0);
  const igstRate = Math.max(0, Number(input.igstRate) || 0);

  const cgstP = Math.round((taxableP * cgstRate) / 100);
  const sgstP = Math.round((taxableP * sgstRate) / 100);
  const igstP = Math.round((taxableP * igstRate) / 100);
  const totalGstP = cgstP + sgstP + igstP;
  const grandTotalP = taxableP + totalGstP;

  const prevP = Math.max(0, toPaise(input.previouslyPaid ?? 0));
  const currP = Math.max(0, toPaise(input.currentPayment ?? 0));
  const totalPaidP = prevP + currP;

  const remainingP = Math.max(0, grandTotalP - totalPaidP);
  const overpaymentP = totalPaidP > grandTotalP ? totalPaidP - grandTotalP : 0;

  let paymentStatus: 'Paid' | 'Partially Paid' | 'Pending' = 'Pending';
  if (totalPaidP === 0) {
    paymentStatus = grandTotalP === 0 ? 'Paid' : 'Pending';
  } else if (remainingP === 0) {
    paymentStatus = 'Paid';
  } else {
    paymentStatus = 'Partially Paid';
  }

  return {
    subtotal: fromPaise(subtotalP),
    taxableAmount: fromPaise(taxableP),
    cgstAmount: fromPaise(cgstP),
    sgstAmount: fromPaise(sgstP),
    igstAmount: fromPaise(igstP),
    totalGst: fromPaise(totalGstP),
    grandTotal: fromPaise(grandTotalP),
    previouslyPaid: fromPaise(prevP),
    currentPayment: fromPaise(currP),
    totalPaid: fromPaise(totalPaidP),
    remainingBalance: fromPaise(remainingP),
    overpaymentAmount: fromPaise(overpaymentP),
    paymentStatus,
  };
}

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];

const TENS = [
  '',
  '',
  'Twenty',
  'Thirty',
  'Forty',
  'Fifty',
  'Sixty',
  'Seventy',
  'Eighty',
  'Ninety',
];

function twoDigitsToWords(num: number): string {
  if (num < 20) return ONES[num];
  const ten = Math.floor(num / 10);
  const one = num % 10;
  return `${TENS[ten]}${one ? ` ${ONES[one]}` : ''}`.trim();
}

function integerToIndianWords(num: number): string {
  if (num === 0) return 'Zero';
  const parts: string[] = [];

  const crore = Math.floor(num / 10000000);
  let remainder = num % 10000000;
  if (crore > 0) {
    parts.push(`${integerToIndianWords(crore)} Crore`);
  }

  const lakh = Math.floor(remainder / 100000);
  remainder %= 100000;
  if (lakh > 0) {
    parts.push(`${twoDigitsToWords(lakh)} Lakh`);
  }

  const thousand = Math.floor(remainder / 1000);
  remainder %= 1000;
  if (thousand > 0) {
    parts.push(`${twoDigitsToWords(thousand)} Thousand`);
  }

  const hundred = Math.floor(remainder / 100);
  remainder %= 100;
  if (hundred > 0) {
    parts.push(`${ONES[hundred]} Hundred`);
  }

  if (remainder > 0) {
    parts.push(twoDigitsToWords(remainder));
  }

  return parts.join(' ').trim();
}

export function amountToIndianWords(amount: number | string | null | undefined): string {
  const totalPaise = Math.max(0, toPaise(amount));
  const rupees = Math.floor(totalPaise / 100);
  const paise = totalPaise % 100;

  if (rupees === 0 && paise === 0) {
    return 'Rupees Zero Only';
  }

  const rupeeWords = `Rupees ${integerToIndianWords(rupees)}`;
  if (paise > 0) {
    return `${rupeeWords} and ${twoDigitsToWords(paise)} Paise Only`;
  }
  return `${rupeeWords} Only`;
}

export function formatReceiptNumber(prefix: string, financialYear: string, sequence: number): string {
  const cleanPrefix = (prefix || 'EDR/PR').replace(/\/+$/, '');
  const fy = financialYear || '2026-27';
  const seq = String(Math.max(1, Math.floor(sequence))).padStart(5, '0');
  return `${cleanPrefix}/${fy}/${seq}`;
}

export function maskNameForVerification(fullName: string): string {
  const clean = (fullName || '').trim();
  if (!clean) return 'Verified Customer';
  return clean
    .split(/\s+/)
    .map((part) => {
      if (part.length <= 2) return `${part[0]}*`;
      return `${part.slice(0, 2)}${'*'.repeat(Math.min(5, part.length - 2))}${part.slice(-1)}`;
    })
    .join(' ');
}

export function maskMobileForVerification(mobile: string): string {
  const digits = (mobile || '').replace(/\D/g, '');
  if (digits.length < 4) return '******';
  return `${'*'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

export function isValidIndianMobile(mobile: string): boolean {
  const digits = (mobile || '').replace(/[\s+-]/g, '');
  return /^(?:91)?[6-9]\d{9}$/.test(digits);
}

export function isValidGstin(gstin: string): boolean {
  const clean = (gstin || '').trim().toUpperCase();
  if (!clean) return true; // optional field
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(clean);
}

export function isValidPan(pan: string): boolean {
  const clean = (pan || '').trim().toUpperCase();
  if (!clean) return true; // optional field
  return /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(clean);
}
