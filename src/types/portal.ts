export interface AuthUser {
  id: number;
  uid: string;
  email: string;
  fullName: string;
  designation: string;
  roleSlug: string;
  roleName: string;
  permissions: string[];
}

export interface CompanySettings {
  id: number;
  companyName: string;
  parentCompany: string;
  logoUrl: string;
  registeredAddress: string;
  officeAddress: string;
  phone: string;
  email: string;
  website: string;
  gstin: string;
  pan: string;
  receiptPrefix: string;
  financialYear: string;
  currency: string;
  defaultCgstRate: string;
  defaultSgstRate: string;
  defaultIgstRate: string;
  authorizedSignatory: string;
  footerText: string;
  termsAndConditions: string[];
  serviceCategories: string[];
  showWatermark: boolean;
}

export interface Customer {
  id: number;
  customerCode: string;
  fullName: string;
  businessName: string;
  mobileNumber: string;
  email: string;
  billingAddress: string;
  city: string;
  state: string;
  pincode: string;
  gstin: string;
  pan: string;
  notes: string;
  createdBy: string;
  createdAt: string;
  orderCount?: number;
  totalBilled?: number;
  totalPaid?: number;
  outstandingBalance?: number;
}

export interface ServiceItem {
  id: number;
  name: string;
  category: string;
  defaultServiceFee: string;
  defaultGovernmentFee: string;
  defaultStampDuty: string;
  defaultNotaryFee: string;
  defaultCourierCharge: string;
  gstApplicable: boolean;
  gstRate: string;
  hsnSac: string;
  description: string;
  isActive: boolean;
}

export interface OrderRecord {
  id: number;
  orderCode: string;
  orderDate: string;
  customerId: number;
  customerName?: string;
  customerMobile?: string;
  customerCode?: string;
  serviceId: number | null;
  serviceCategory: string;
  serviceName: string;
  documentName: string;
  documentReferenceNumber: string;
  state: string;
  quantity: number;
  description: string;
  assignedExecutive: string;
  expectedDeliveryDate: string;
  deliveryMethod: string;
  deliveryAddress: string;
  internalNotes: string;
  orderStatus: string;
  serviceFee: string;
  governmentFee: string;
  stampDuty: string;
  notaryCharges: string;
  courierCharges: string;
  otherCharges: string;
  discount: string;
  subtotal: string;
  taxableAmount: string;
  cgstRate: string;
  sgstRate: string;
  igstRate: string;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
  totalGst: string;
  grandTotal: string;
  totalPaid: string;
  remainingBalance: string;
  paymentStatus: string;
  createdBy: string;
  createdAt: string;
}

export interface PaymentRecord {
  id: number;
  paymentCode: string;
  orderId: number;
  orderCode?: string;
  serviceName?: string;
  customerId: number;
  customerName?: string;
  paymentDate: string;
  paymentTime: string;
  amount: string;
  paymentType: string;
  paymentMode: string;
  transactionId: string;
  upiReference: string;
  upiId: string;
  bankName: string;
  chequeNumber: string;
  chequeDate: string;
  paymentGateway: string;
  gatewayReference: string;
  paymentReceivedBy: string;
  paymentVerified: boolean;
  verificationStatus: string;
  paymentStatus: string;
  notes: string;
  verifiedBy: string;
  receiptId?: number | null;
  receiptNumber?: string;
  createdAt: string;
}

export interface ReceiptRecord {
  id: number;
  receiptNumber: string;
  receiptDate: string;
  orderId: number;
  paymentId: number;
  customerId: number;
  customerName?: string;
  businessName?: string;
  customerMobile?: string;
  orderCode?: string;
  serviceName?: string;
  paymentMode?: string;
  transactionId?: string;
  verificationToken: string;
  paymentStatus: string;
  paymentType: string;
  serviceAmount: string;
  governmentFee: string;
  stampDuty: string;
  notaryFee: string;
  courierCharge: string;
  otherCharges: string;
  discount: string;
  taxableAmount: string;
  cgstRate: string;
  cgstAmount: string;
  sgstRate: string;
  sgstAmount: string;
  igstRate: string;
  igstAmount: string;
  totalGst: string;
  grandTotal: string;
  previouslyPaid: string;
  currentPayment: string;
  totalPaid: string;
  remainingBalance: string;
  amountInWords: string;
  status: string;
  revisionNumber: number;
  parentReceiptId: number | null;
  cancellationReason: string;
  reprintCount: number;
  issuedBy: string;
  createdAt: string;
}

export interface ReceiptItemRow {
  id: number;
  receiptId: number;
  sNo: number;
  particulars: string;
  amount: string;
  itemType: string;
}

export interface ReceiptDetailBundle {
  receipt: ReceiptRecord;
  items: ReceiptItemRow[];
  customer: Customer;
  order: OrderRecord;
  payment: PaymentRecord;
  companySettings: CompanySettings;
  verificationUrl: string;
  qrCodeDataUrl: string;
  history: AuditLogEntry[];
}

export interface DocumentRecord {
  id: number;
  orderId: number;
  orderCode?: string;
  serviceName?: string;
  customerId: number;
  customerName?: string;
  title: string;
  category: string;
  versionType: string;
  versionNumber: number;
  approvalStatus: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  uploadedBy: string;
  createdAt: string;
}

export interface RefundRecord {
  id: number;
  refundCode: string;
  orderId: number;
  paymentId: number;
  customerId: number;
  amount: string;
  reason: string;
  refundMode: string;
  referenceNumber: string;
  status: string;
  processedBy: string;
  processedAt: string;
}

export interface AuditLogEntry {
  id: number;
  actorId: number | null;
  actorName: string;
  actorEmail: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  ipAddress: string;
  createdAt: string;
}

export type PortalTab =
  | 'dashboard'
  | 'customers'
  | 'orders'
  | 'payments'
  | 'receipts'
  | 'documents'
  | 'reports'
  | 'users'
  | 'services'
  | 'settings'
  | 'audit';
