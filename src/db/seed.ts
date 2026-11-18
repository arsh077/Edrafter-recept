import { count, eq } from 'drizzle-orm';
import { db } from './index.ts';
import {
  auditLogs,
  companySettings,
  customers,
  orders,
  paymentMethods,
  payments,
  permissions,
  receiptItems,
  receipts,
  refunds,
  roles,
  services,
  users,
} from './schema.ts';
import { calculateOrderFinancials, amountToIndianWords } from '../utils/finance.ts';
import { generateVerificationToken, hashPassword } from '../utils/security.ts';

export const ALL_PERMISSIONS = [
  { code: 'dashboard.view', name: 'View Dashboard', module: 'Dashboard', description: 'Access executive KPIs and analytics' },
  { code: 'customers.view', name: 'View Customers', module: 'Customers', description: 'Browse customer directory and profiles' },
  { code: 'customers.manage', name: 'Manage Customers', module: 'Customers', description: 'Create and edit customer records' },
  { code: 'orders.view', name: 'View Orders', module: 'Orders', description: 'View legal documentation orders' },
  { code: 'orders.manage', name: 'Manage Orders', module: 'Orders', description: 'Create, edit, and update order status' },
  { code: 'payments.view', name: 'View Payments', module: 'Payments', description: 'View payment transactions and ledgers' },
  { code: 'payments.collect', name: 'Record Payments', module: 'Payments', description: 'Record customer payments' },
  { code: 'payments.verify', name: 'Verify & Refund Payments', module: 'Payments', description: 'Verify transactions and issue refunds' },
  { code: 'receipts.view', name: 'View & Download Receipts', module: 'Receipts', description: 'Preview, print, and download PDF receipts' },
  { code: 'receipts.manage', name: 'Issue & Revise Receipts', module: 'Receipts', description: 'Generate, cancel, and reissue receipts' },
  { code: 'documents.manage', name: 'Manage Documents', module: 'Documents', description: 'Upload, download, and approve order documents' },
  { code: 'reports.view', name: 'View & Export Reports', module: 'Reports', description: 'Access financial reports and CSV/PDF/Excel exports' },
  { code: 'users.manage', name: 'Manage Users & Roles', module: 'Administration', description: 'Manage staff accounts and role permissions' },
  { code: 'settings.manage', name: 'Company & Service Settings', module: 'Administration', description: 'Configure company, tax, and service settings' },
  { code: 'audit.view', name: 'View Audit Logs', module: 'Security', description: 'Inspect immutable system audit trail' },
];

let seedPromise: Promise<void> | null = null;

export async function ensureSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = runSeed().catch((err) => {
      seedPromise = null;
      throw err;
    });
  }
  return seedPromise;
}

async function runSeed(): Promise<void> {
  const [{ value: roleCount }] = await db.select({ value: count() }).from(roles);
  if (roleCount > 0) {
    return;
  }

  // 1. Seed Permissions
  for (const perm of ALL_PERMISSIONS) {
    await db.insert(permissions).values(perm).onConflictDoNothing();
  }

  // 2. Seed Roles
  const allCodes = ALL_PERMISSIONS.map((p) => p.code);
  const adminCodes = allCodes.filter((c) => c !== 'users.manage');
  const accountsCodes = [
    'dashboard.view',
    'customers.view',
    'orders.view',
    'payments.view',
    'payments.collect',
    'payments.verify',
    'receipts.view',
    'receipts.manage',
    'reports.view',
    'audit.view',
  ];
  const staffCodes = [
    'dashboard.view',
    'customers.view',
    'customers.manage',
    'orders.view',
    'orders.manage',
    'payments.view',
    'payments.collect',
    'receipts.view',
    'documents.manage',
  ];

  const insertedRoles = await db
    .insert(roles)
    .values([
      {
        name: 'Super Admin',
        slug: 'super_admin',
        description: 'Full unrestricted access across all modules, settings, backups, and role permissions.',
        permissions: allCodes,
        isSystem: true,
      },
      {
        name: 'Administrator',
        slug: 'administrator',
        description: 'Manage customers, legal orders, payments, receipts, documents, reports, and company settings.',
        permissions: adminCodes,
        isSystem: true,
      },
      {
        name: 'Accounts Manager',
        slug: 'accounts_manager',
        description: 'Verify transactions, issue/revise receipts, process refunds, and export financial reports.',
        permissions: accountsCodes,
        isSystem: true,
      },
      {
        name: 'Staff Member',
        slug: 'staff_member',
        description: 'Create orders, manage assigned client documents, record collections, and preview receipts.',
        permissions: staffCodes,
        isSystem: true,
      },
    ])
    .returning();

  const roleMap = new Map(insertedRoles.map((r) => [r.slug, r.id]));

  // 3. Seed Users (Staff accounts with scrypt hashes)
  await db.insert(users).values([
    {
      uid: 'staff-super-admin',
      email: 'admin@edrafter.in',
      fullName: 'Arjun Malhotra',
      phone: '+91 9811044210',
      designation: 'Managing Director',
      roleId: roleMap.get('super_admin')!,
      roleSlug: 'super_admin',
      passwordHash: hashPassword('Admin@123'),
      isActive: true,
    },
    {
      uid: 'staff-administrator',
      email: 'manager@edrafter.in',
      fullName: 'Priya Nair',
      phone: '+91 9811044211',
      designation: 'Operations Administrator',
      roleId: roleMap.get('administrator')!,
      roleSlug: 'administrator',
      passwordHash: hashPassword('Manager@123'),
      isActive: true,
    },
    {
      uid: 'staff-accounts',
      email: 'accounts@edrafter.in',
      fullName: 'Vikramjit Singh',
      phone: '+91 9811044212',
      designation: 'Senior Accounts Manager',
      roleId: roleMap.get('accounts_manager')!,
      roleSlug: 'accounts_manager',
      passwordHash: hashPassword('Accounts@123'),
      isActive: true,
    },
    {
      uid: 'staff-member',
      email: 'staff@edrafter.in',
      fullName: 'Sneha Kulkarni',
      phone: '+91 9811044213',
      designation: 'Legal Documentation Executive',
      roleId: roleMap.get('staff_member')!,
      roleSlug: 'staff_member',
      passwordHash: hashPassword('Staff@123'),
      isActive: true,
    },
  ]);

  // 4. Seed Company Settings
  await db.insert(companySettings).values({
    companyName: 'eDrafter Legal Solutions',
    parentCompany: 'eDrafter Services Pvt. Ltd.',
    logoUrl: '/assets/aistudio/eDrafter_s_Legal_Solutions_Logo_dcc73c7d.png',
    registeredAddress: 'Plot 42, Sector 18, Institutional Area, Gurugram, Haryana - 122015',
    officeAddress: '304, Barakhamba Road, Connaught Place, New Delhi - 110001',
    phone: '+91 11 4089 2200',
    email: 'accounts@edrafter.in',
    website: 'https://www.edrafter.in',
    gstin: '07AABCE4512F1Z9',
    pan: 'AABCE4512F',
    receiptPrefix: 'EDR/PR',
    financialYear: '2026-27',
    currency: 'INR',
    defaultCgstRate: '9.00',
    defaultSgstRate: '9.00',
    defaultIgstRate: '0.00',
    authorizedSignatory: 'Arjun Malhotra (Authorized Signatory)',
    footerText: 'Thank you for choosing eDrafter — Crafting Legal Solutions.',
    termsAndConditions: [
      'This receipt acknowledges payment received against the mentioned legal documentation order.',
      'Government fees, stamp duty, and statutory charges are subject to applicable authority requirements.',
      'Document preparation and delivery timelines depend on the selected service and receipt of complete information.',
      'Draft documents are shared for customer review and approval prior to final execution or dispatch.',
      'Any refund will be governed by the applicable service-specific refund policy and Indian law.',
      'This payment receipt is system-generated and verifiable online via the embedded QR code.',
    ],
    serviceCategories: [
      'E-Stamp Paper',
      'Rent Agreement',
      'Affidavit',
      'Notary',
      'Legal Agreement',
      'Partnership Deed',
      'Power of Attorney',
      'Trademark Registration',
      'Copyright Registration',
      'FSSAI License',
      'Other Legal Services',
    ],
    showWatermark: false,
  });

  // 5. Seed Payment Methods
  await db.insert(paymentMethods).values([
    { name: 'UPI', code: 'UPI', requiresReference: true, isActive: true, sortOrder: 1 },
    { name: 'Bank Transfer', code: 'BANK_TRANSFER', requiresReference: true, isActive: true, sortOrder: 2 },
    { name: 'NEFT', code: 'NEFT', requiresReference: true, isActive: true, sortOrder: 3 },
    { name: 'RTGS', code: 'RTGS', requiresReference: true, isActive: true, sortOrder: 4 },
    { name: 'IMPS', code: 'IMPS', requiresReference: true, isActive: true, sortOrder: 5 },
    { name: 'Debit Card', code: 'DEBIT_CARD', requiresReference: true, isActive: true, sortOrder: 6 },
    { name: 'Credit Card', code: 'CREDIT_CARD', requiresReference: true, isActive: true, sortOrder: 7 },
    { name: 'Payment Gateway', code: 'GATEWAY', requiresReference: true, isActive: true, sortOrder: 8 },
    { name: 'Cash', code: 'CASH', requiresReference: false, isActive: true, sortOrder: 9 },
    { name: 'Cheque', code: 'CHEQUE', requiresReference: true, isActive: true, sortOrder: 10 },
  ]);

  // 6. Seed Legal Services
  const seededServices = await db
    .insert(services)
    .values([
      {
        name: 'Residential Rent Agreement (11 Months)',
        category: 'Rent Agreement',
        defaultServiceFee: '1499.00',
        defaultGovernmentFee: '0.00',
        defaultStampDuty: '100.00',
        defaultNotaryFee: '250.00',
        defaultCourierCharge: '120.00',
        gstApplicable: true,
        gstRate: '18.00',
        hsnSac: '998213',
        description: 'Custom-drafted 11-month residential leave and license agreement with e-Stamp and notarization.',
      },
      {
        name: 'Commercial Lease Agreement',
        category: 'Rent Agreement',
        defaultServiceFee: '3500.00',
        defaultGovernmentFee: '0.00',
        defaultStampDuty: '500.00',
        defaultNotaryFee: '400.00',
        defaultCourierCharge: '150.00',
        gstApplicable: true,
        gstRate: '18.00',
        hsnSac: '998213',
        description: 'Comprehensive commercial property lease deed drafted by corporate legal counsel.',
      },
      {
        name: 'Name Change / Gap Affidavit',
        category: 'Affidavit',
        defaultServiceFee: '799.00',
        defaultGovernmentFee: '0.00',
        defaultStampDuty: '100.00',
        defaultNotaryFee: '200.00',
        defaultCourierCharge: '99.00',
        gstApplicable: false,
        gstRate: '0.00',
        hsnSac: '998213',
        description: 'Notarized affidavit on non-judicial e-Stamp paper with express courier dispatch.',
      },
      {
        name: 'Delhi / Haryana e-Stamp Paper Procurement',
        category: 'E-Stamp Paper',
        defaultServiceFee: '350.00',
        defaultGovernmentFee: '0.00',
        defaultStampDuty: '500.00',
        defaultNotaryFee: '0.00',
        defaultCourierCharge: '100.00',
        gstApplicable: false,
        gstRate: '0.00',
        hsnSac: '998213',
        description: 'SHCIL authorized non-judicial e-Stamp certificate procurement and scan + hard copy delivery.',
      },
      {
        name: 'General Power of Attorney (GPA)',
        category: 'Power of Attorney',
        defaultServiceFee: '2499.00',
        defaultGovernmentFee: '0.00',
        defaultStampDuty: '500.00',
        defaultNotaryFee: '350.00',
        defaultCourierCharge: '150.00',
        gstApplicable: true,
        gstRate: '18.00',
        hsnSac: '998213',
        description: 'Legal drafting and notarization of General or Special Power of Attorney.',
      },
      {
        name: 'Partnership Deed Drafting',
        category: 'Partnership Deed',
        defaultServiceFee: '2999.00',
        defaultGovernmentFee: '0.00',
        defaultStampDuty: '1000.00',
        defaultNotaryFee: '300.00',
        defaultCourierCharge: '150.00',
        gstApplicable: true,
        gstRate: '18.00',
        hsnSac: '998213',
        description: 'Custom partnership deed compliant with Indian Partnership Act, 1932.',
      },
      {
        name: 'Trademark Registration (Individual / MSME)',
        category: 'Trademark Registration',
        defaultServiceFee: '2500.00',
        defaultGovernmentFee: '4500.00',
        defaultStampDuty: '0.00',
        defaultNotaryFee: '0.00',
        defaultCourierCharge: '0.00',
        gstApplicable: true,
        gstRate: '18.00',
        hsnSac: '998213',
        description: 'TM-A filing with comprehensive class search, drafting, and TM application receipt.',
      },
      {
        name: 'Copyright Registration (Literary / Software)',
        category: 'Copyright Registration',
        defaultServiceFee: '3200.00',
        defaultGovernmentFee: '500.00',
        defaultStampDuty: '0.00',
        defaultNotaryFee: '0.00',
        defaultCourierCharge: '0.00',
        gstApplicable: true,
        gstRate: '18.00',
        hsnSac: '998213',
        description: 'End-to-end copyright diary filing with NOC and Statement of Particulars.',
      },
      {
        name: 'FSSAI Basic / State License',
        category: 'FSSAI License',
        defaultServiceFee: '1999.00',
        defaultGovernmentFee: '2000.00',
        defaultStampDuty: '0.00',
        defaultNotaryFee: '0.00',
        defaultCourierCharge: '0.00',
        gstApplicable: true,
        gstRate: '18.00',
        hsnSac: '998213',
        description: 'FoSCoS FSSAI registration & compliance filing.',
      },
      {
        name: 'Service & NDA Legal Agreement',
        category: 'Legal Agreement',
        defaultServiceFee: '2800.00',
        defaultGovernmentFee: '0.00',
        defaultStampDuty: '100.00',
        defaultNotaryFee: '0.00',
        defaultCourierCharge: '0.00',
        gstApplicable: true,
        gstRate: '18.00',
        hsnSac: '998213',
        description: 'Bespoke Master Service Agreement & Non-Disclosure Agreement.',
      },
    ])
    .returning();

  // 7. Seed Customers
  const seededCustomers = await db
    .insert(customers)
    .values([
      {
        customerCode: 'CUST-2026-0001',
        fullName: 'Rohan Deshmukh',
        businessName: 'Veridian CloudTech Pvt. Ltd.',
        mobileNumber: '9820411890',
        email: 'rohan.deshmukh@veridiancloud.in',
        billingAddress: 'Unit 402, Pinnacle Corporate Park, BKC',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400051',
        gstin: '27AABCV7812M1Z4',
        pan: 'AABCV7812M',
        createdBy: 'Arjun Malhotra',
      },
      {
        customerCode: 'CUST-2026-0002',
        fullName: 'Ananya Verma',
        businessName: 'Veda Botanicals Studio',
        mobileNumber: '9811523401',
        email: 'ananya@vedabotanicals.co.in',
        billingAddress: 'B-18, Greater Kailash Part I',
        city: 'New Delhi',
        state: 'Delhi',
        pincode: '110048',
        gstin: '07AAECV3210B1Z1',
        pan: 'AAECV3210B',
        createdBy: 'Priya Nair',
      },
      {
        customerCode: 'CUST-2026-0003',
        fullName: 'Siddharth Kapoor',
        businessName: '',
        mobileNumber: '9910487722',
        email: 'siddharth.kapoor@gmail.com',
        billingAddress: 'Flat 903, Lotus Boulevard, Sector 100',
        city: 'Noida',
        state: 'Uttar Pradesh',
        pincode: '201304',
        gstin: '',
        pan: 'ABCPK6541L',
        createdBy: 'Sneha Kulkarni',
      },
      {
        customerCode: 'CUST-2026-0004',
        fullName: 'Meera Krishnan',
        businessName: 'Kaveri Foods & Spices LLP',
        mobileNumber: '9845098312',
        email: 'accounts@kaverifoods.in',
        billingAddress: '74, 100 Feet Road, Indiranagar',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560038',
        gstin: '29AAKFK1290D1Z8',
        pan: 'AAKFK1290D',
        createdBy: 'Priya Nair',
      },
      {
        customerCode: 'CUST-2026-0005',
        fullName: 'Devendra Chauhan',
        businessName: 'Chauhan Infrastructure Associates',
        mobileNumber: '9717234509',
        email: 'd.chauhan@chauhaninfra.com',
        billingAddress: 'SCO 19, Sector 29 Market',
        city: 'Gurugram',
        state: 'Haryana',
        pincode: '122001',
        gstin: '06AAFCC8910N1Z3',
        pan: 'AAFCC8910N',
        createdBy: 'Vikramjit Singh',
      },
    ])
    .returning();

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
  const sixDaysAgo = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
  const twelveDaysAgo = new Date(Date.now() - 12 * 86400000).toISOString().slice(0, 10);

  // Helper to seed orders + payments + receipts consistently
  const orderConfigs = [
    {
      code: 'EDR-ORD-2026-0001',
      date: twelveDaysAgo,
      customer: seededCustomers[0],
      service: seededServices[6], // Trademark
      docName: 'Veridian CloudTech Wordmark TM-A',
      docRef: 'TM-CLASS-42-8812',
      state: 'Maharashtra',
      status: 'Delivered',
      exec: 'Priya Nair',
      deliveryMethod: 'Email',
      serviceFee: 2500,
      governmentFee: 4500,
      stampDuty: 0,
      notaryCharges: 0,
      courierCharges: 0,
      otherCharges: 0,
      discount: 500,
      cgstRate: 0,
      sgstRate: 0,
      igstRate: 18,
      payments: [
        {
          code: 'PAY-2026-0001',
          date: twelveDaysAgo,
          time: '11:24',
          amount: 7670,
          type: 'Full Payment',
          mode: 'UPI',
          txId: 'UPI632219847102',
          upiRef: '632219847102',
          upiId: 'rohan@okicici',
          bank: 'ICICI Bank',
          verified: true,
          receiptNo: 'EDR/PR/2026-27/00001',
        },
      ],
    },
    {
      code: 'EDR-ORD-2026-0002',
      date: sixDaysAgo,
      customer: seededCustomers[1],
      service: seededServices[0], // Rent Agreement
      docName: 'GK-1 Studio Residential Leave & License',
      docRef: 'DL-RENT-2026-412',
      state: 'Delhi',
      status: 'Completed',
      exec: 'Sneha Kulkarni',
      deliveryMethod: 'Courier',
      serviceFee: 1499,
      governmentFee: 0,
      stampDuty: 100,
      notaryCharges: 250,
      courierCharges: 120,
      otherCharges: 0,
      discount: 0,
      cgstRate: 9,
      sgstRate: 9,
      igstRate: 0,
      payments: [
        {
          code: 'PAY-2026-0002',
          date: sixDaysAgo,
          time: '15:10',
          amount: 1000,
          type: 'Advance Payment',
          mode: 'UPI',
          txId: 'UPI631884120091',
          upiRef: '631884120091',
          upiId: 'ananya@okhdfcbank',
          bank: 'HDFC Bank',
          verified: true,
          receiptNo: 'EDR/PR/2026-27/00002',
        },
        {
          code: 'PAY-2026-0003',
          date: threeDaysAgo,
          time: '17:45',
          amount: 1323.42,
          type: 'Final Instalment',
          mode: 'NEFT',
          txId: 'NEFT00921847712',
          upiRef: '',
          upiId: '',
          bank: 'HDFC Bank',
          verified: true,
          receiptNo: 'EDR/PR/2026-27/00003',
        },
      ],
    },
    {
      code: 'EDR-ORD-2026-0003',
      date: threeDaysAgo,
      customer: seededCustomers[3],
      service: seededServices[8], // FSSAI License
      docName: 'Kaveri Foods State FSSAI Renewal',
      docRef: 'KA-FSSAI-2026-091',
      state: 'Karnataka',
      status: 'Processing',
      exec: 'Arjun Malhotra',
      deliveryMethod: 'WhatsApp',
      serviceFee: 1999,
      governmentFee: 2000,
      stampDuty: 0,
      notaryCharges: 0,
      courierCharges: 0,
      otherCharges: 0,
      discount: 0,
      cgstRate: 0,
      sgstRate: 0,
      igstRate: 18,
      payments: [
        {
          code: 'PAY-2026-0004',
          date: threeDaysAgo,
          time: '12:05',
          amount: 2500,
          type: 'Part Payment',
          mode: 'Bank Transfer',
          txId: 'IMPS9928174612',
          upiRef: '',
          upiId: '',
          bank: 'Axis Bank',
          verified: true,
          receiptNo: 'EDR/PR/2026-27/00004',
        },
      ],
    },
    {
      code: 'EDR-ORD-2026-0004',
      date: yesterday,
      customer: seededCustomers[2],
      service: seededServices[2], // Affidavit
      docName: 'Name Correction Gazette Affidavit',
      docRef: 'UP-AFF-2026-773',
      state: 'Uttar Pradesh',
      status: 'Draft Preparation',
      exec: 'Sneha Kulkarni',
      deliveryMethod: 'Courier',
      serviceFee: 799,
      governmentFee: 0,
      stampDuty: 100,
      notaryCharges: 200,
      courierCharges: 99,
      otherCharges: 0,
      discount: 0,
      cgstRate: 0,
      sgstRate: 0,
      igstRate: 0,
      payments: [
        {
          code: 'PAY-2026-0005',
          date: today,
          time: '10:15',
          amount: 1198,
          type: 'Full Payment',
          mode: 'Payment Gateway',
          txId: 'RZP_PAY_89127491',
          upiRef: '',
          upiId: '',
          bank: 'Razorpay',
          verified: true,
          receiptNo: 'EDR/PR/2026-27/00005',
        },
      ],
    },
    {
      code: 'EDR-ORD-2026-0005',
      date: today,
      customer: seededCustomers[4],
      service: seededServices[5], // Partnership Deed
      docName: 'Chauhan Infra Amended Partnership Deed',
      docRef: 'HR-PART-2026-109',
      state: 'Haryana',
      status: 'Awaiting Payment',
      exec: 'Vikramjit Singh',
      deliveryMethod: 'Self Pickup',
      serviceFee: 2999,
      governmentFee: 0,
      stampDuty: 1000,
      notaryCharges: 300,
      courierCharges: 0,
      otherCharges: 201,
      discount: 0,
      cgstRate: 9,
      sgstRate: 9,
      igstRate: 0,
      payments: [
        {
          code: 'PAY-2026-0006',
          date: today,
          time: '14:20',
          amount: 2000,
          type: 'Advance Payment',
          mode: 'Cheque',
          txId: 'CHQ-441892',
          upiRef: '',
          upiId: '',
          bank: 'State Bank of India',
          verified: false, // Pending verification!
          receiptNo: '',
        },
      ],
    },
  ];

  for (const cfg of orderConfigs) {
    let runningPaid = 0;
    const baseFin = calculateOrderFinancials({
      serviceFee: cfg.serviceFee,
      governmentFee: cfg.governmentFee,
      stampDuty: cfg.stampDuty,
      notaryCharges: cfg.notaryCharges,
      courierCharges: cfg.courierCharges,
      otherCharges: cfg.otherCharges,
      discount: cfg.discount,
      cgstRate: cfg.cgstRate,
      sgstRate: cfg.sgstRate,
      igstRate: cfg.igstRate,
      previouslyPaid: 0,
      currentPayment: 0,
    });

    const verifiedTotal = cfg.payments
      .filter((p) => p.verified)
      .reduce((acc, p) => acc + p.amount, 0);

    const finalFin = calculateOrderFinancials({
      serviceFee: cfg.serviceFee,
      governmentFee: cfg.governmentFee,
      stampDuty: cfg.stampDuty,
      notaryCharges: cfg.notaryCharges,
      courierCharges: cfg.courierCharges,
      otherCharges: cfg.otherCharges,
      discount: cfg.discount,
      cgstRate: cfg.cgstRate,
      sgstRate: cfg.sgstRate,
      igstRate: cfg.igstRate,
      previouslyPaid: verifiedTotal,
      currentPayment: 0,
    });

    const [insertedOrder] = await db
      .insert(orders)
      .values({
        orderCode: cfg.code,
        orderDate: cfg.date,
        customerId: cfg.customer.id,
        serviceId: cfg.service.id,
        serviceCategory: cfg.service.category,
        serviceName: cfg.service.name,
        documentName: cfg.docName,
        documentReferenceNumber: cfg.docRef,
        state: cfg.state,
        quantity: 1,
        description: cfg.service.description,
        assignedExecutive: cfg.exec,
        expectedDeliveryDate: today,
        deliveryMethod: cfg.deliveryMethod,
        deliveryAddress: `${cfg.customer.billingAddress}, ${cfg.customer.city}, ${cfg.customer.state} - ${cfg.customer.pincode}`,
        orderStatus: cfg.status,
        serviceFee: cfg.serviceFee.toFixed(2),
        governmentFee: cfg.governmentFee.toFixed(2),
        stampDuty: cfg.stampDuty.toFixed(2),
        notaryCharges: cfg.notaryCharges.toFixed(2),
        courierCharges: cfg.courierCharges.toFixed(2),
        otherCharges: cfg.otherCharges.toFixed(2),
        discount: cfg.discount.toFixed(2),
        subtotal: baseFin.subtotal.toFixed(2),
        taxableAmount: baseFin.taxableAmount.toFixed(2),
        cgstRate: cfg.cgstRate.toFixed(2),
        sgstRate: cfg.sgstRate.toFixed(2),
        igstRate: cfg.igstRate.toFixed(2),
        cgstAmount: baseFin.cgstAmount.toFixed(2),
        sgstAmount: baseFin.sgstAmount.toFixed(2),
        igstAmount: baseFin.igstAmount.toFixed(2),
        totalGst: baseFin.totalGst.toFixed(2),
        grandTotal: baseFin.grandTotal.toFixed(2),
        totalPaid: finalFin.totalPaid.toFixed(2),
        remainingBalance: finalFin.remainingBalance.toFixed(2),
        paymentStatus: finalFin.paymentStatus,
        createdBy: cfg.exec,
      })
      .returning();

    for (const p of cfg.payments) {
      const stepFin = calculateOrderFinancials({
        serviceFee: cfg.serviceFee,
        governmentFee: cfg.governmentFee,
        stampDuty: cfg.stampDuty,
        notaryCharges: cfg.notaryCharges,
        courierCharges: cfg.courierCharges,
        otherCharges: cfg.otherCharges,
        discount: cfg.discount,
        cgstRate: cfg.cgstRate,
        sgstRate: cfg.sgstRate,
        igstRate: cfg.igstRate,
        previouslyPaid: runningPaid,
        currentPayment: p.verified ? p.amount : 0,
      });

      const [insertedPayment] = await db
        .insert(payments)
        .values({
          paymentCode: p.code,
          orderId: insertedOrder.id,
          customerId: cfg.customer.id,
          paymentDate: p.date,
          paymentTime: p.time,
          amount: p.amount.toFixed(2),
          paymentType: p.type,
          paymentMode: p.mode,
          transactionId: p.txId,
          upiReference: p.upiRef,
          upiId: p.upiId,
          bankName: p.bank,
          chequeNumber: p.mode === 'Cheque' ? p.txId : '',
          chequeDate: p.mode === 'Cheque' ? p.date : '',
          paymentGateway: p.mode === 'Payment Gateway' ? 'Razorpay' : '',
          gatewayPaymentId: p.mode === 'Payment Gateway' ? p.txId : '',
          paymentReceivedBy: cfg.exec,
          paymentVerified: p.verified,
          verificationStatus: p.verified ? 'Verified' : 'Pending',
          paymentStatus: p.verified ? stepFin.paymentStatus : 'Pending',
          verifiedBy: p.verified ? 'Vikramjit Singh' : '',
          verifiedAt: p.verified ? new Date() : null,
          createdBy: cfg.exec,
        })
        .returning();

      if (p.verified && p.receiptNo) {
        runningPaid = stepFin.totalPaid;
        const [insertedReceipt] = await db
          .insert(receipts)
          .values({
            receiptNumber: p.receiptNo,
            receiptDate: p.date,
            orderId: insertedOrder.id,
            paymentId: insertedPayment.id,
            customerId: cfg.customer.id,
            verificationToken: generateVerificationToken(),
            paymentStatus: stepFin.paymentStatus,
            paymentType: p.type,
            serviceAmount: cfg.serviceFee.toFixed(2),
            governmentFee: cfg.governmentFee.toFixed(2),
            stampDuty: cfg.stampDuty.toFixed(2),
            notaryFee: cfg.notaryCharges.toFixed(2),
            courierCharge: cfg.courierCharges.toFixed(2),
            otherCharges: cfg.otherCharges.toFixed(2),
            discount: cfg.discount.toFixed(2),
            taxableAmount: stepFin.taxableAmount.toFixed(2),
            cgstRate: cfg.cgstRate.toFixed(2),
            cgstAmount: stepFin.cgstAmount.toFixed(2),
            sgstRate: cfg.sgstRate.toFixed(2),
            sgstAmount: stepFin.sgstAmount.toFixed(2),
            igstRate: cfg.igstRate.toFixed(2),
            igstAmount: stepFin.igstAmount.toFixed(2),
            totalGst: stepFin.totalGst.toFixed(2),
            grandTotal: stepFin.grandTotal.toFixed(2),
            previouslyPaid: stepFin.previouslyPaid.toFixed(2),
            currentPayment: stepFin.currentPayment.toFixed(2),
            totalPaid: stepFin.totalPaid.toFixed(2),
            remainingBalance: stepFin.remainingBalance.toFixed(2),
            amountInWords: amountToIndianWords(p.amount),
            status: 'Issued',
            revisionNumber: 1,
            issuedBy: 'Vikramjit Singh',
          })
          .returning();

        const itemsToInsert: Array<{
          receiptId: number;
          sNo: number;
          particulars: string;
          amount: string;
          itemType: string;
        }> = [];
        let sNo = 1;
        if (cfg.serviceFee > 0) itemsToInsert.push({ receiptId: insertedReceipt.id, sNo: sNo++, particulars: 'Professional / Service Fee', amount: cfg.serviceFee.toFixed(2), itemType: 'charge' });
        if (cfg.governmentFee > 0) itemsToInsert.push({ receiptId: insertedReceipt.id, sNo: sNo++, particulars: 'Government / Statutory Fee', amount: cfg.governmentFee.toFixed(2), itemType: 'charge' });
        if (cfg.stampDuty > 0) itemsToInsert.push({ receiptId: insertedReceipt.id, sNo: sNo++, particulars: 'Non-Judicial e-Stamp Duty', amount: cfg.stampDuty.toFixed(2), itemType: 'charge' });
        if (cfg.notaryCharges > 0) itemsToInsert.push({ receiptId: insertedReceipt.id, sNo: sNo++, particulars: 'Notary & Attestation Charges', amount: cfg.notaryCharges.toFixed(2), itemType: 'charge' });
        if (cfg.courierCharges > 0) itemsToInsert.push({ receiptId: insertedReceipt.id, sNo: sNo++, particulars: 'Express Courier & Dispatch Charges', amount: cfg.courierCharges.toFixed(2), itemType: 'charge' });
        if (cfg.otherCharges > 0) itemsToInsert.push({ receiptId: insertedReceipt.id, sNo: sNo++, particulars: 'Additional Documentation Charges', amount: cfg.otherCharges.toFixed(2), itemType: 'charge' });
        if (cfg.discount > 0) itemsToInsert.push({ receiptId: insertedReceipt.id, sNo: sNo++, particulars: 'Less: Discount', amount: (-cfg.discount).toFixed(2), itemType: 'discount' });
        if (stepFin.cgstAmount > 0) itemsToInsert.push({ receiptId: insertedReceipt.id, sNo: sNo++, particulars: `CGST @ ${cfg.cgstRate}%`, amount: stepFin.cgstAmount.toFixed(2), itemType: 'tax' });
        if (stepFin.sgstAmount > 0) itemsToInsert.push({ receiptId: insertedReceipt.id, sNo: sNo++, particulars: `SGST @ ${cfg.sgstRate}%`, amount: stepFin.sgstAmount.toFixed(2), itemType: 'tax' });
        if (stepFin.igstAmount > 0) itemsToInsert.push({ receiptId: insertedReceipt.id, sNo: sNo++, particulars: `IGST @ ${cfg.igstRate}%`, amount: stepFin.igstAmount.toFixed(2), itemType: 'tax' });

        if (itemsToInsert.length > 0) {
          await db.insert(receiptItems).values(itemsToInsert);
        }
      }
    }
  }

  // Seed 1 sample refund record on first order (goodwill discount adjustment) so refund report/KPI has real data
  const [firstOrder] = await db.select().from(orders).where(eq(orders.orderCode, 'EDR-ORD-2026-0001'));
  const [firstPayment] = await db.select().from(payments).where(eq(payments.paymentCode, 'PAY-2026-0001'));
  if (firstOrder && firstPayment) {
    await db.insert(refunds).values({
      refundCode: 'REF-2026-0001',
      orderId: firstOrder.id,
      paymentId: firstPayment.id,
      customerId: firstOrder.customerId,
      amount: '250.00',
      reason: 'MSME fee rebate credit adjustment',
      refundMode: 'UPI',
      referenceNumber: 'REFUPI901284',
      status: 'Processed',
      processedBy: 'Vikramjit Singh',
    });
  }

  // Seed Initial Audit Logs
  await db.insert(auditLogs).values([
    {
      actorName: 'Arjun Malhotra',
      actorEmail: 'admin@edrafter.in',
      action: 'SYSTEM_INITIALIZED',
      entityType: 'system',
      entityId: '1',
      summary: 'Initialized eDrafter Payment Receipt & Order Management Portal with default roles, services, and tax configuration.',
    },
    {
      actorName: 'Vikramjit Singh',
      actorEmail: 'accounts@edrafter.in',
      action: 'RECEIPT_ISSUED',
      entityType: 'receipt',
      entityId: 'EDR/PR/2026-27/00001',
      summary: 'Verified UPI payment PAY-2026-0001 (₹7,670.00) and issued receipt EDR/PR/2026-27/00001.',
    },
    {
      actorName: 'Vikramjit Singh',
      actorEmail: 'accounts@edrafter.in',
      action: 'RECEIPT_ISSUED',
      entityType: 'receipt',
      entityId: 'EDR/PR/2026-27/00005',
      summary: 'Verified Razorpay payment PAY-2026-0005 (₹1,198.00) and issued receipt EDR/PR/2026-27/00005.',
    },
  ]);
}
