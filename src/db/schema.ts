import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const roles = pgTable('roles', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  slug: text('slug').notNull().unique(),
  description: text('description').notNull().default(''),
  permissions: jsonb('permissions').$type<string[]>().notNull().default([]),
  isSystem: boolean('is_system').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const permissions = pgTable('permissions', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  module: text('module').notNull(),
  description: text('description').notNull().default(''),
});

export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    uid: text('uid').notNull().unique(),
    email: text('email').notNull().unique(),
    fullName: text('full_name').notNull().default('Team Member'),
    phone: text('phone').notNull().default(''),
    designation: text('designation').notNull().default('Legal Executive'),
    roleId: integer('role_id').references(() => roles.id),
    roleSlug: text('role_slug').notNull().default('staff_member'),
    passwordHash: text('password_hash'),
    isActive: boolean('is_active').notNull().default(true),
    resetToken: text('reset_token'),
    resetTokenExpiresAt: timestamp('reset_token_expires_at'),
    lastLoginAt: timestamp('last_login_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('users_email_idx').on(table.email)]
);

export const loginHistory = pgTable(
  'login_history',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
    email: text('email').notNull(),
    authMethod: text('auth_method').notNull(), // 'google_oauth' | 'password'
    status: text('status').notNull(), // 'success' | 'failed'
    ipAddress: text('ip_address').notNull().default(''),
    userAgent: text('user_agent').notNull().default(''),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('login_history_user_idx').on(table.userId)]
);

export const customers = pgTable(
  'customers',
  {
    id: serial('id').primaryKey(),
    customerCode: text('customer_code').notNull().unique(),
    fullName: text('full_name').notNull(),
    businessName: text('business_name').notNull().default(''),
    mobileNumber: text('mobile_number').notNull(),
    email: text('email').notNull().default(''),
    billingAddress: text('billing_address').notNull().default(''),
    city: text('city').notNull().default(''),
    state: text('state').notNull().default(''),
    pincode: text('pincode').notNull().default(''),
    gstin: text('gstin').notNull().default(''),
    pan: text('pan').notNull().default(''),
    notes: text('notes').notNull().default(''),
    createdBy: text('created_by').notNull().default('system'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('customers_mobile_idx').on(table.mobileNumber),
    index('customers_email_idx').on(table.email),
    index('customers_name_idx').on(table.fullName),
  ]
);

export const services = pgTable(
  'services',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull().unique(),
    category: text('category').notNull(),
    defaultServiceFee: numeric('default_service_fee', { precision: 12, scale: 2 })
      .notNull()
      .default('0.00'),
    defaultGovernmentFee: numeric('default_government_fee', { precision: 12, scale: 2 })
      .notNull()
      .default('0.00'),
    defaultStampDuty: numeric('default_stamp_duty', { precision: 12, scale: 2 })
      .notNull()
      .default('0.00'),
    defaultNotaryFee: numeric('default_notary_fee', { precision: 12, scale: 2 })
      .notNull()
      .default('0.00'),
    defaultCourierCharge: numeric('default_courier_charge', { precision: 12, scale: 2 })
      .notNull()
      .default('0.00'),
    gstApplicable: boolean('gst_applicable').notNull().default(false),
    gstRate: numeric('gst_rate', { precision: 5, scale: 2 }).notNull().default('0.00'),
    hsnSac: text('hsn_sac').notNull().default('998213'),
    description: text('description').notNull().default(''),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('services_category_idx').on(table.category)]
);

export const orders = pgTable(
  'orders',
  {
    id: serial('id').primaryKey(),
    orderCode: text('order_code').notNull().unique(),
    orderDate: text('order_date').notNull(),
    customerId: integer('customer_id')
      .references(() => customers.id, { onDelete: 'restrict' })
      .notNull(),
    serviceId: integer('service_id').references(() => services.id, { onDelete: 'set null' }),
    serviceCategory: text('service_category').notNull(),
    serviceName: text('service_name').notNull(),
    documentName: text('document_name').notNull(),
    documentReferenceNumber: text('document_reference_number').notNull().default(''),
    state: text('state').notNull().default(''),
    quantity: integer('quantity').notNull().default(1),
    description: text('description').notNull().default(''),
    assignedExecutive: text('assigned_executive').notNull().default(''),
    expectedDeliveryDate: text('expected_delivery_date').notNull().default(''),
    deliveryMethod: text('delivery_method').notNull().default('Email'),
    deliveryAddress: text('delivery_address').notNull().default(''),
    internalNotes: text('internal_notes').notNull().default(''),
    orderStatus: text('order_status').notNull().default('New Order'),
    serviceFee: numeric('service_fee', { precision: 12, scale: 2 }).notNull().default('0.00'),
    governmentFee: numeric('government_fee', { precision: 12, scale: 2 }).notNull().default('0.00'),
    stampDuty: numeric('stamp_duty', { precision: 12, scale: 2 }).notNull().default('0.00'),
    notaryCharges: numeric('notary_charges', { precision: 12, scale: 2 }).notNull().default('0.00'),
    courierCharges: numeric('courier_charges', { precision: 12, scale: 2 }).notNull().default('0.00'),
    otherCharges: numeric('other_charges', { precision: 12, scale: 2 }).notNull().default('0.00'),
    discount: numeric('discount', { precision: 12, scale: 2 }).notNull().default('0.00'),
    subtotal: numeric('subtotal', { precision: 12, scale: 2 }).notNull().default('0.00'),
    taxableAmount: numeric('taxable_amount', { precision: 12, scale: 2 }).notNull().default('0.00'),
    cgstRate: numeric('cgst_rate', { precision: 5, scale: 2 }).notNull().default('0.00'),
    sgstRate: numeric('sgst_rate', { precision: 5, scale: 2 }).notNull().default('0.00'),
    igstRate: numeric('igst_rate', { precision: 5, scale: 2 }).notNull().default('0.00'),
    cgstAmount: numeric('cgst_amount', { precision: 12, scale: 2 }).notNull().default('0.00'),
    sgstAmount: numeric('sgst_amount', { precision: 12, scale: 2 }).notNull().default('0.00'),
    igstAmount: numeric('igst_amount', { precision: 12, scale: 2 }).notNull().default('0.00'),
    totalGst: numeric('total_gst', { precision: 12, scale: 2 }).notNull().default('0.00'),
    grandTotal: numeric('grand_total', { precision: 12, scale: 2 }).notNull().default('0.00'),
    totalPaid: numeric('total_paid', { precision: 12, scale: 2 }).notNull().default('0.00'),
    remainingBalance: numeric('remaining_balance', { precision: 12, scale: 2 })
      .notNull()
      .default('0.00'),
    paymentStatus: text('payment_status').notNull().default('Pending'),
    createdBy: text('created_by').notNull().default('system'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('orders_customer_idx').on(table.customerId),
    index('orders_status_idx').on(table.orderStatus),
    index('orders_date_idx').on(table.orderDate),
  ]
);

export const payments = pgTable(
  'payments',
  {
    id: serial('id').primaryKey(),
    paymentCode: text('payment_code').notNull().unique(),
    orderId: integer('order_id')
      .references(() => orders.id, { onDelete: 'restrict' })
      .notNull(),
    customerId: integer('customer_id')
      .references(() => customers.id, { onDelete: 'restrict' })
      .notNull(),
    paymentDate: text('payment_date').notNull(),
    paymentTime: text('payment_time').notNull().default('12:00'),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    paymentType: text('payment_type').notNull().default('Full Payment'),
    paymentMode: text('payment_mode').notNull().default('UPI'),
    transactionId: text('transaction_id').notNull().default(''),
    upiReference: text('upi_reference').notNull().default(''),
    upiId: text('upi_id').notNull().default(''),
    bankName: text('bank_name').notNull().default(''),
    chequeNumber: text('cheque_number').notNull().default(''),
    chequeDate: text('cheque_date').notNull().default(''),
    paymentGateway: text('payment_gateway').notNull().default(''),
    gatewayOrderId: text('gateway_order_id').notNull().default(''),
    gatewayPaymentId: text('gateway_payment_id').notNull().default(''),
    gatewayReference: text('gateway_reference').notNull().default(''),
    paymentReceivedBy: text('payment_received_by').notNull().default(''),
    paymentVerified: boolean('payment_verified').notNull().default(false),
    verificationStatus: text('verification_status').notNull().default('Pending'), // Verified | Pending | Failed | Refunded
    paymentStatus: text('payment_status').notNull().default('Pending'), // Paid | Partially Paid | Pending | Failed | Refunded
    notes: text('notes').notNull().default(''),
    verifiedBy: text('verified_by').notNull().default(''),
    verifiedAt: timestamp('verified_at'),
    createdBy: text('created_by').notNull().default('system'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('payments_order_idx').on(table.orderId),
    index('payments_customer_idx').on(table.customerId),
    index('payments_date_idx').on(table.paymentDate),
  ]
);

export const receipts = pgTable(
  'receipts',
  {
    id: serial('id').primaryKey(),
    receiptNumber: text('receipt_number').notNull().unique(),
    receiptDate: text('receipt_date').notNull(),
    orderId: integer('order_id')
      .references(() => orders.id, { onDelete: 'restrict' })
      .notNull(),
    paymentId: integer('payment_id')
      .references(() => payments.id, { onDelete: 'restrict' })
      .notNull(),
    customerId: integer('customer_id')
      .references(() => customers.id, { onDelete: 'restrict' })
      .notNull(),
    verificationToken: text('verification_token').notNull().unique(),
    paymentStatus: text('payment_status').notNull(),
    paymentType: text('payment_type').notNull(),
    serviceAmount: numeric('service_amount', { precision: 12, scale: 2 }).notNull().default('0.00'),
    governmentFee: numeric('government_fee', { precision: 12, scale: 2 }).notNull().default('0.00'),
    stampDuty: numeric('stamp_duty', { precision: 12, scale: 2 }).notNull().default('0.00'),
    notaryFee: numeric('notary_fee', { precision: 12, scale: 2 }).notNull().default('0.00'),
    courierCharge: numeric('courier_charge', { precision: 12, scale: 2 }).notNull().default('0.00'),
    otherCharges: numeric('other_charges', { precision: 12, scale: 2 }).notNull().default('0.00'),
    discount: numeric('discount', { precision: 12, scale: 2 }).notNull().default('0.00'),
    taxableAmount: numeric('taxable_amount', { precision: 12, scale: 2 }).notNull().default('0.00'),
    cgstRate: numeric('cgst_rate', { precision: 5, scale: 2 }).notNull().default('0.00'),
    cgstAmount: numeric('cgst_amount', { precision: 12, scale: 2 }).notNull().default('0.00'),
    sgstRate: numeric('sgst_rate', { precision: 5, scale: 2 }).notNull().default('0.00'),
    sgstAmount: numeric('sgst_amount', { precision: 12, scale: 2 }).notNull().default('0.00'),
    igstRate: numeric('igst_rate', { precision: 5, scale: 2 }).notNull().default('0.00'),
    igstAmount: numeric('igst_amount', { precision: 12, scale: 2 }).notNull().default('0.00'),
    totalGst: numeric('total_gst', { precision: 12, scale: 2 }).notNull().default('0.00'),
    grandTotal: numeric('grand_total', { precision: 12, scale: 2 }).notNull().default('0.00'),
    previouslyPaid: numeric('previously_paid', { precision: 12, scale: 2 }).notNull().default('0.00'),
    currentPayment: numeric('current_payment', { precision: 12, scale: 2 }).notNull().default('0.00'),
    totalPaid: numeric('total_paid', { precision: 12, scale: 2 }).notNull().default('0.00'),
    remainingBalance: numeric('remaining_balance', { precision: 12, scale: 2 })
      .notNull()
      .default('0.00'),
    amountInWords: text('amount_in_words').notNull().default(''),
    status: text('status').notNull().default('Issued'), // Issued | Cancelled | Superseded
    revisionNumber: integer('revision_number').notNull().default(1),
    parentReceiptId: integer('parent_receipt_id'),
    cancellationReason: text('cancellation_reason').notNull().default(''),
    reprintCount: integer('reprint_count').notNull().default(0),
    issuedBy: text('issued_by').notNull().default('system'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('receipts_order_idx').on(table.orderId),
    index('receipts_customer_idx').on(table.customerId),
    index('receipts_token_idx').on(table.verificationToken),
  ]
);

export const receiptItems = pgTable(
  'receipt_items',
  {
    id: serial('id').primaryKey(),
    receiptId: integer('receipt_id')
      .references(() => receipts.id, { onDelete: 'cascade' })
      .notNull(),
    sNo: integer('s_no').notNull(),
    particulars: text('particulars').notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    itemType: text('item_type').notNull().default('charge'), // charge | discount | tax | total
  },
  (table) => [index('receipt_items_receipt_idx').on(table.receiptId)]
);

export const refunds = pgTable(
  'refunds',
  {
    id: serial('id').primaryKey(),
    refundCode: text('refund_code').notNull().unique(),
    orderId: integer('order_id')
      .references(() => orders.id, { onDelete: 'restrict' })
      .notNull(),
    paymentId: integer('payment_id')
      .references(() => payments.id, { onDelete: 'restrict' })
      .notNull(),
    customerId: integer('customer_id')
      .references(() => customers.id, { onDelete: 'restrict' })
      .notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    reason: text('reason').notNull(),
    refundMode: text('refund_mode').notNull().default('Bank Transfer'),
    referenceNumber: text('reference_number').notNull().default(''),
    status: text('status').notNull().default('Processed'), // Processed | Pending | Rejected
    processedBy: text('processed_by').notNull().default(''),
    processedAt: timestamp('processed_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('refunds_order_idx').on(table.orderId)]
);

export const documents = pgTable(
  'documents',
  {
    id: serial('id').primaryKey(),
    orderId: integer('order_id')
      .references(() => orders.id, { onDelete: 'cascade' })
      .notNull(),
    customerId: integer('customer_id')
      .references(() => customers.id, { onDelete: 'cascade' })
      .notNull(),
    title: text('title').notNull(),
    category: text('category').notNull().default('Supporting Document'),
    versionType: text('version_type').notNull().default('Draft'), // Draft | Final
    versionNumber: integer('version_number').notNull().default(1),
    approvalStatus: text('approval_status').notNull().default('Pending Approval'), // Pending Approval | Approved | Changes Requested
    fileName: text('file_name').notNull(),
    originalName: text('original_name').notNull(),
    mimeType: text('mime_type').notNull(),
    fileSize: integer('file_size').notNull(),
    storagePath: text('storage_path').notNull(),
    uploadedBy: text('uploaded_by').notNull().default('system'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('documents_order_idx').on(table.orderId)]
);

export const paymentMethods = pgTable('payment_methods', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  code: text('code').notNull().unique(),
  requiresReference: boolean('requires_reference').notNull().default(true),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const companySettings = pgTable('company_settings', {
  id: serial('id').primaryKey(),
  companyName: text('company_name').notNull().default('eDrafter Legal Solutions'),
  parentCompany: text('parent_company').notNull().default('eDrafter Services Pvt. Ltd.'),
  logoUrl: text('logo_url')
    .notNull()
    .default('/assets/aistudio/eDrafter_s_Legal_Solutions_Logo_dcc73c7d.png'),
  registeredAddress: text('registered_address').notNull().default(''),
  officeAddress: text('office_address').notNull().default(''),
  phone: text('phone').notNull().default(''),
  email: text('email').notNull().default(''),
  website: text('website').notNull().default(''),
  gstin: text('gstin').notNull().default(''),
  pan: text('pan').notNull().default(''),
  receiptPrefix: text('receipt_prefix').notNull().default('EDR/PR'),
  financialYear: text('financial_year').notNull().default('2026-27'),
  currency: text('currency').notNull().default('INR'),
  defaultCgstRate: numeric('default_cgst_rate', { precision: 5, scale: 2 }).notNull().default('0.00'),
  defaultSgstRate: numeric('default_sgst_rate', { precision: 5, scale: 2 }).notNull().default('0.00'),
  defaultIgstRate: numeric('default_igst_rate', { precision: 5, scale: 2 }).notNull().default('0.00'),
  authorizedSignatory: text('authorized_signatory').notNull().default('Authorized Signatory'),
  footerText: text('footer_text')
    .notNull()
    .default('Thank you for choosing eDrafter — Crafting Legal Solutions.'),
  termsAndConditions: jsonb('terms_and_conditions').$type<string[]>().notNull().default([]),
  serviceCategories: jsonb('service_categories').$type<string[]>().notNull().default([]),
  showWatermark: boolean('show_watermark').notNull().default(false),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: serial('id').primaryKey(),
    actorId: integer('actor_id'),
    actorName: text('actor_name').notNull().default('System'),
    actorEmail: text('actor_email').notNull().default(''),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    summary: text('summary').notNull(),
    oldValues: jsonb('old_values').$type<Record<string, unknown> | null>(),
    newValues: jsonb('new_values').$type<Record<string, unknown> | null>(),
    ipAddress: text('ip_address').notNull().default(''),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('audit_logs_entity_idx').on(table.entityType, table.entityId),
    index('audit_logs_created_idx').on(table.createdAt),
  ]
);

// Relations
export const rolesRelations = relations(roles, ({ many }) => ({
  users: many(users),
}));

export const usersRelations = relations(users, ({ one }) => ({
  role: one(roles, {
    fields: [users.roleId],
    references: [roles.id],
  }),
}));

export const customersRelations = relations(customers, ({ many }) => ({
  orders: many(orders),
  payments: many(payments),
  receipts: many(receipts),
  documents: many(documents),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  customer: one(customers, {
    fields: [orders.customerId],
    references: [customers.id],
  }),
  service: one(services, {
    fields: [orders.serviceId],
    references: [services.id],
  }),
  payments: many(payments),
  receipts: many(receipts),
  documents: many(documents),
  refunds: many(refunds),
}));

export const paymentsRelations = relations(payments, ({ one, many }) => ({
  order: one(orders, {
    fields: [payments.orderId],
    references: [orders.id],
  }),
  customer: one(customers, {
    fields: [payments.customerId],
    references: [customers.id],
  }),
  receipts: many(receipts),
  refunds: many(refunds),
}));

export const receiptsRelations = relations(receipts, ({ one, many }) => ({
  order: one(orders, {
    fields: [receipts.orderId],
    references: [orders.id],
  }),
  payment: one(payments, {
    fields: [receipts.paymentId],
    references: [payments.id],
  }),
  customer: one(customers, {
    fields: [receipts.customerId],
    references: [customers.id],
  }),
  items: many(receiptItems),
}));

export const receiptItemsRelations = relations(receiptItems, ({ one }) => ({
  receipt: one(receipts, {
    fields: [receiptItems.receiptId],
    references: [receipts.id],
  }),
}));
