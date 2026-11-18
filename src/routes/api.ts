import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import QRCode from 'qrcode';
import { and, desc, eq, gte, ilike, lte, or, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { ensureSeeded } from '../db/seed.ts';
import {
  auditLogs,
  companySettings,
  customers,
  documents,
  loginHistory,
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
} from '../db/schema.ts';
import { AuthRequest, requireAuth, requirePermission } from '../middleware/auth.ts';
import {
  amountToIndianWords,
  calculateOrderFinancials,
  formatReceiptNumber,
  isValidGstin,
  isValidIndianMobile,
  isValidPan,
  maskMobileForVerification,
  maskNameForVerification,
  roundInr,
} from '../utils/finance.ts';
import {
  generateVerificationToken,
  hashPassword,
  signStaffToken,
  verifyPassword,
} from '../utils/security.ts';

export const apiRouter = express.Router();

const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.docx']);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const safeName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
      cb(null, safeName);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext) || !ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error('Only PDF, JPG, JPEG, PNG, and DOCX files up to 10MB are allowed.'));
    }
    cb(null, true);
  },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many authentication attempts. Please try again later.' },
});

async function logAudit(
  req: AuthRequest,
  action: string,
  entityType: string,
  entityId: string | number,
  summary: string,
  oldValues: Record<string, unknown> | null = null,
  newValues: Record<string, unknown> | null = null
) {
  try {
    await db.insert(auditLogs).values({
      actorId: req.authUser?.id ?? null,
      actorName: req.authUser?.fullName ?? 'System',
      actorEmail: req.authUser?.email ?? '',
      action,
      entityType,
      entityId: String(entityId),
      summary,
      oldValues,
      newValues,
      ipAddress: req.ip || '',
    });
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}

async function generateNextReceiptNumber(): Promise<string> {
  const [settings] = await db.select().from(companySettings).limit(1);
  const prefix = settings?.receiptPrefix || 'EDR/PR';
  const fy = settings?.financialYear || '2026-27';
  const existing = await db.select({ receiptNumber: receipts.receiptNumber }).from(receipts);
  let maxSeq = 0;
  for (const row of existing) {
    const parts = row.receiptNumber.split('/');
    const tail = parseInt(parts[parts.length - 1], 10);
    if (Number.isFinite(tail) && tail > maxSeq) maxSeq = tail;
  }
  return formatReceiptNumber(prefix, fy, maxSeq + 1);
}

async function generateNextCode(prefix: string, table: 'customer' | 'order' | 'payment' | 'refund'): Promise<string> {
  const year = new Date().getFullYear();
  let countVal = 0;
  if (table === 'customer') {
    const rows = await db.select({ id: customers.id }).from(customers);
    countVal = rows.reduce((m, r) => Math.max(m, r.id), 0);
  } else if (table === 'order') {
    const rows = await db.select({ id: orders.id }).from(orders);
    countVal = rows.reduce((m, r) => Math.max(m, r.id), 0);
  } else if (table === 'payment') {
    const rows = await db.select({ id: payments.id }).from(payments);
    countVal = rows.reduce((m, r) => Math.max(m, r.id), 0);
  } else {
    const rows = await db.select({ id: refunds.id }).from(refunds);
    countVal = rows.reduce((m, r) => Math.max(m, r.id), 0);
  }
  return `${prefix}-${year}-${String(countVal + 1).padStart(4, '0')}`;
}

async function issueReceiptForVerifiedPayment(
  orderRow: typeof orders.$inferSelect,
  paymentRow: typeof payments.$inferSelect,
  previouslyPaidAmount: number,
  issuedBy: string
) {
  const fin = calculateOrderFinancials({
    serviceFee: Number(orderRow.serviceFee),
    governmentFee: Number(orderRow.governmentFee),
    stampDuty: Number(orderRow.stampDuty),
    notaryCharges: Number(orderRow.notaryCharges),
    courierCharges: Number(orderRow.courierCharges),
    otherCharges: Number(orderRow.otherCharges),
    discount: Number(orderRow.discount),
    cgstRate: Number(orderRow.cgstRate),
    sgstRate: Number(orderRow.sgstRate),
    igstRate: Number(orderRow.igstRate),
    previouslyPaid: previouslyPaidAmount,
    currentPayment: Number(paymentRow.amount),
  });

  const receiptNumber = await generateNextReceiptNumber();
  const verificationToken = generateVerificationToken();

  const [createdReceipt] = await db
    .insert(receipts)
    .values({
      receiptNumber,
      receiptDate: paymentRow.paymentDate || new Date().toISOString().slice(0, 10),
      orderId: orderRow.id,
      paymentId: paymentRow.id,
      customerId: orderRow.customerId,
      verificationToken,
      paymentStatus: fin.paymentStatus,
      paymentType: paymentRow.paymentType,
      serviceAmount: orderRow.serviceFee,
      governmentFee: orderRow.governmentFee,
      stampDuty: orderRow.stampDuty,
      notaryFee: orderRow.notaryCharges,
      courierCharge: orderRow.courierCharges,
      otherCharges: orderRow.otherCharges,
      discount: orderRow.discount,
      taxableAmount: fin.taxableAmount.toFixed(2),
      cgstRate: orderRow.cgstRate,
      cgstAmount: fin.cgstAmount.toFixed(2),
      sgstRate: orderRow.sgstRate,
      sgstAmount: fin.sgstAmount.toFixed(2),
      igstRate: orderRow.igstRate,
      igstAmount: fin.igstAmount.toFixed(2),
      totalGst: fin.totalGst.toFixed(2),
      grandTotal: fin.grandTotal.toFixed(2),
      previouslyPaid: fin.previouslyPaid.toFixed(2),
      currentPayment: fin.currentPayment.toFixed(2),
      totalPaid: fin.totalPaid.toFixed(2),
      remainingBalance: fin.remainingBalance.toFixed(2),
      amountInWords: amountToIndianWords(fin.currentPayment),
      status: 'Issued',
      revisionNumber: 1,
      issuedBy,
    })
    .returning();

  const items: Array<{
    receiptId: number;
    sNo: number;
    particulars: string;
    amount: string;
    itemType: string;
  }> = [];
  let sNo = 1;
  const pushItem = (cond: number, label: string, amt: number, type: string) => {
    if (cond > 0) {
      items.push({
        receiptId: createdReceipt.id,
        sNo: sNo++,
        particulars: label,
        amount: amt.toFixed(2),
        itemType: type,
      });
    }
  };
  pushItem(Number(orderRow.serviceFee), 'Professional / Service Fee', Number(orderRow.serviceFee), 'charge');
  pushItem(Number(orderRow.governmentFee), 'Government / Statutory Fee', Number(orderRow.governmentFee), 'charge');
  pushItem(Number(orderRow.stampDuty), 'Non-Judicial e-Stamp Duty', Number(orderRow.stampDuty), 'charge');
  pushItem(Number(orderRow.notaryCharges), 'Notary & Attestation Charges', Number(orderRow.notaryCharges), 'charge');
  pushItem(Number(orderRow.courierCharges), 'Express Courier & Dispatch Charges', Number(orderRow.courierCharges), 'charge');
  pushItem(Number(orderRow.otherCharges), 'Additional Documentation Charges', Number(orderRow.otherCharges), 'charge');
  if (Number(orderRow.discount) > 0) {
    items.push({
      receiptId: createdReceipt.id,
      sNo: sNo++,
      particulars: 'Less: Discount',
      amount: (-Number(orderRow.discount)).toFixed(2),
      itemType: 'discount',
    });
  }
  pushItem(fin.cgstAmount, `CGST @ ${orderRow.cgstRate}%`, fin.cgstAmount, 'tax');
  pushItem(fin.sgstAmount, `SGST @ ${orderRow.sgstRate}%`, fin.sgstAmount, 'tax');
  pushItem(fin.igstAmount, `IGST @ ${orderRow.igstRate}%`, fin.igstAmount, 'tax');

  if (items.length > 0) {
    await db.insert(receiptItems).values(items);
  }

  return { receipt: createdReceipt, financials: fin };
}

// ---------- HEALTH & PUBLIC ROUTES ----------

apiRouter.get('/health', async (_req: Request, res: Response) => {
  res.json({ success: true, status: 'ok', service: 'eDrafter Portal API' });
});

apiRouter.post('/auth/login', authLimiter, async (req: Request, res: Response) => {
  try {
    await ensureSeeded();
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }
    const cleanEmail = String(email).trim().toLowerCase();
    const [userRow] = await db.select().from(users).where(eq(users.email, cleanEmail));

    if (!userRow || !verifyPassword(String(password), userRow.passwordHash)) {
      await db.insert(loginHistory).values({
        userId: userRow?.id ?? null,
        email: cleanEmail,
        authMethod: 'password',
        status: 'failed',
        ipAddress: req.ip || '',
        userAgent: req.get('user-agent') || '',
      });
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    if (!userRow.isActive) {
      return res.status(403).json({ success: false, message: 'Your staff account is currently deactivated.' });
    }

    await db
      .update(users)
      .set({ lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, userRow.id));

    await db.insert(loginHistory).values({
      userId: userRow.id,
      email: userRow.email,
      authMethod: 'password',
      status: 'success',
      ipAddress: req.ip || '',
      userAgent: req.get('user-agent') || '',
    });

    const [roleRow] = userRow.roleId
      ? await db.select().from(roles).where(eq(roles.id, userRow.roleId))
      : await db.select().from(roles).where(eq(roles.slug, userRow.roleSlug));

    const token = signStaffToken({
      uid: userRow.uid,
      email: userRow.email,
      roleSlug: roleRow?.slug || userRow.roleSlug,
    });

    return res.json({
      success: true,
      message: 'Signed in successfully',
      data: {
        token,
        user: {
          id: userRow.id,
          uid: userRow.uid,
          email: userRow.email,
          fullName: userRow.fullName,
          designation: userRow.designation,
          roleSlug: roleRow?.slug || userRow.roleSlug,
          roleName: roleRow?.name || 'Staff Member',
          permissions: Array.isArray(roleRow?.permissions) ? roleRow.permissions : [],
        },
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, message: 'Failed to process login' });
  }
});

apiRouter.post('/auth/forgot-password', authLimiter, async (req: Request, res: Response) => {
  try {
    await ensureSeeded();
    const cleanEmail = String(req.body?.email || '').trim().toLowerCase();
    if (!cleanEmail) {
      return res.status(400).json({ success: false, message: 'Email address is required.' });
    }
    const [userRow] = await db.select().from(users).where(eq(users.email, cleanEmail));
    if (!userRow) {
      return res.json({
        success: true,
        message: 'If the account exists, a password reset code has been generated.',
      });
    }
    const resetCode = String(crypto.randomInt(100000, 999999));
    const expires = new Date(Date.now() + 15 * 60 * 1000);
    await db
      .update(users)
      .set({ resetToken: resetCode, resetTokenExpiresAt: expires, updatedAt: new Date() })
      .where(eq(users.id, userRow.id));

    return res.json({
      success: true,
      message: 'Password reset verification code generated (valid for 15 minutes).',
      data: { demoResetCode: resetCode },
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    return res.status(500).json({ success: false, message: 'Unable to initiate password reset.' });
  }
});

apiRouter.post('/auth/reset-password', authLimiter, async (req: Request, res: Response) => {
  try {
    await ensureSeeded();
    const { email, resetCode, newPassword } = req.body || {};
    if (!email || !resetCode || !newPassword || String(newPassword).length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Email, reset code, and a password of at least 6 characters are required.',
      });
    }
    const cleanEmail = String(email).trim().toLowerCase();
    const [userRow] = await db.select().from(users).where(eq(users.email, cleanEmail));
    if (
      !userRow ||
      !userRow.resetToken ||
      userRow.resetToken !== String(resetCode).trim() ||
      !userRow.resetTokenExpiresAt ||
      userRow.resetTokenExpiresAt.getTime() < Date.now()
    ) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset code.' });
    }

    await db
      .update(users)
      .set({
        passwordHash: hashPassword(String(newPassword)),
        resetToken: null,
        resetTokenExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userRow.id));

    return res.json({ success: true, message: 'Password updated successfully. You may now sign in.' });
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({ success: false, message: 'Unable to reset password.' });
  }
});

// Public Receipt Verification (no auth required, strictly privacy-masked)
apiRouter.get('/public/verify-receipt/:token', async (req: Request, res: Response) => {
  try {
    await ensureSeeded();
    const token = String(req.params.token || '').trim();
    if (!token) {
      return res.status(400).json({ success: false, message: 'Verification token is required.' });
    }

    const [receiptRow] = await db
      .select()
      .from(receipts)
      .where(eq(receipts.verificationToken, token));

    if (!receiptRow) {
      return res.status(404).json({
        success: false,
        verified: false,
        message: 'Receipt not found or invalid verification token.',
      });
    }

    const [customerRow] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, receiptRow.customerId));
    const [orderRow] = await db.select().from(orders).where(eq(orders.id, receiptRow.orderId));
    const [paymentRow] = await db.select().from(payments).where(eq(payments.id, receiptRow.paymentId));
    const [settings] = await db.select().from(companySettings).limit(1);

    return res.json({
      success: true,
      verified: receiptRow.status === 'Issued',
      data: {
        receiptNumber: receiptRow.receiptNumber,
        receiptDate: receiptRow.receiptDate,
        receiptStatus: receiptRow.status,
        revisionNumber: receiptRow.revisionNumber,
        cancellationReason: receiptRow.cancellationReason || undefined,
        customerNameMasked: maskNameForVerification(customerRow?.fullName || ''),
        mobileMasked: maskMobileForVerification(customerRow?.mobileNumber || ''),
        orderCode: orderRow?.orderCode || '',
        serviceName: orderRow?.serviceName || '',
        paymentAmount: Number(receiptRow.currentPayment),
        grandTotal: Number(receiptRow.grandTotal),
        paymentStatus: receiptRow.paymentStatus,
        paymentMode: paymentRow?.paymentMode || '',
        companyName: settings?.companyName || 'eDrafter Legal Solutions',
        logoUrl: settings?.logoUrl || '/assets/aistudio/eDrafter_s_Legal_Solutions_Logo_dcc73c7d.png',
        verifiedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Public verification error:', error);
    return res.status(500).json({ success: false, message: 'Verification lookup failed.' });
  }
});

// ---------- AUTHENTICATED ROUTES ----------

apiRouter.use(requireAuth);

apiRouter.get('/auth/me', async (req: AuthRequest, res: Response) => {
  try {
    const [settings] = await db.select().from(companySettings).limit(1);
    res.json({
      success: true,
      data: {
        user: req.authUser,
        companySettings: settings || null,
      },
    });
  } catch (error) {
    console.error('Auth me error:', error);
    res.status(500).json({ success: false, message: 'Failed to load profile' });
  }
});

apiRouter.get('/auth/login-history', async (_req: AuthRequest, res: Response) => {
  try {
    const rows = await db.select().from(loginHistory).orderBy(desc(loginHistory.createdAt)).limit(50);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Login history error:', error);
    res.status(500).json({ success: false, message: 'Failed to load login history' });
  }
});

// ---------- DASHBOARD KPIs & CHARTS ----------

apiRouter.get('/dashboard', requirePermission('dashboard.view'), async (req: AuthRequest, res: Response) => {
  try {
    const range = String(req.query.range || 'month');
    const customFrom = String(req.query.from || '');
    const customTo = String(req.query.to || '');

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const yesterdayStr = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
    let fromDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    let toDate = todayStr;

    if (range === 'today') {
      fromDate = todayStr;
      toDate = todayStr;
    } else if (range === 'yesterday') {
      fromDate = yesterdayStr;
      toDate = yesterdayStr;
    } else if (range === '7d') {
      fromDate = new Date(now.getTime() - 6 * 86400000).toISOString().slice(0, 10);
    } else if (range === 'prev_month') {
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      fromDate = prev.toISOString().slice(0, 10);
      toDate = prevEnd.toISOString().slice(0, 10);
    } else if (range === 'custom' && customFrom && customTo) {
      fromDate = customFrom;
      toDate = customTo;
    } else if (range === 'all') {
      fromDate = '2020-01-01';
    }

    const allOrders = await db.select().from(orders).orderBy(desc(orders.id));
    const allCustomers = await db.select().from(customers);
    const allPayments = await db.select().from(payments).orderBy(desc(payments.id));
    const allDocuments = await db.select().from(documents);
    const allRefunds = await db.select().from(refunds);
    const allReceipts = await db.select().from(receipts).orderBy(desc(receipts.id));

    const customerMap = new Map(allCustomers.map((c) => [c.id, c]));

    const filteredOrders = allOrders.filter((o) => o.orderDate >= fromDate && o.orderDate <= toDate);
    const filteredPayments = allPayments.filter(
      (p) => p.paymentDate >= fromDate && p.paymentDate <= toDate
    );

    const monthPrefix = todayStr.slice(0, 7);
    const verifiedPayments = allPayments.filter((p) => p.paymentVerified);

    const totalPaymentsReceived = filteredPayments
      .filter((p) => p.paymentVerified)
      .reduce((sum, p) => sum + Number(p.amount), 0);

    const todaysCollections = verifiedPayments
      .filter((p) => p.paymentDate === todayStr)
      .reduce((sum, p) => sum + Number(p.amount), 0);

    const monthlyCollections = verifiedPayments
      .filter((p) => p.paymentDate.startsWith(monthPrefix))
      .reduce((sum, p) => sum + Number(p.amount), 0);

    const pendingPaymentsAmount = allOrders
      .filter((o) => o.orderStatus !== 'Cancelled')
      .reduce((sum, o) => sum + Number(o.remainingBalance), 0);

    const partiallyPaidOrders = allOrders.filter((o) => o.paymentStatus === 'Partially Paid').length;
    const completedOrders = allOrders.filter(
      (o) => o.orderStatus === 'Completed' || o.orderStatus === 'Delivered'
    ).length;
    const pendingDocuments = allDocuments.filter((d) => d.approvalStatus === 'Pending Approval').length;
    const totalRefunds = allRefunds
      .filter((r) => r.status === 'Processed')
      .reduce((sum, r) => sum + Number(r.amount), 0);

    // Chart 1: Daily payment collection (last 10 days or filtered dates)
    const dailyMap = new Map<string, number>();
    for (let i = 9; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000).toISOString().slice(0, 10);
      dailyMap.set(d, 0);
    }
    for (const p of verifiedPayments) {
      if (dailyMap.has(p.paymentDate)) {
        dailyMap.set(p.paymentDate, roundInr((dailyMap.get(p.paymentDate) || 0) + Number(p.amount)));
      }
    }
    const dailyCollectionChart = Array.from(dailyMap.entries()).map(([date, amount]) => ({
      label: date.slice(5),
      date,
      amount: roundInr(amount),
    }));

    // Chart 2: Monthly revenue (by YYYY-MM)
    const monthlyMap = new Map<string, number>();
    for (const p of verifiedPayments) {
      const ym = p.paymentDate.slice(0, 7);
      monthlyMap.set(ym, roundInr((monthlyMap.get(ym) || 0) + Number(p.amount)));
    }
    const monthlyRevenueChart = Array.from(monthlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, amount]) => ({ month, amount }));

    // Chart 3: Payment method distribution
    const modeMap = new Map<string, { count: number; amount: number }>();
    for (const p of verifiedPayments) {
      const prev = modeMap.get(p.paymentMode) || { count: 0, amount: 0 };
      modeMap.set(p.paymentMode, {
        count: prev.count + 1,
        amount: roundInr(prev.amount + Number(p.amount)),
      });
    }
    const paymentMethodChart = Array.from(modeMap.entries()).map(([mode, stats]) => ({
      mode,
      ...stats,
    }));

    // Chart 4: Order status distribution
    const statusMap = new Map<string, number>();
    for (const o of allOrders) {
      statusMap.set(o.orderStatus, (statusMap.get(o.orderStatus) || 0) + 1);
    }
    const orderStatusChart = Array.from(statusMap.entries()).map(([status, count]) => ({
      status,
      count,
    }));

    // Chart 5: Service-wise revenue
    const serviceRevMap = new Map<string, number>();
    for (const o of allOrders) {
      serviceRevMap.set(
        o.serviceCategory,
        roundInr((serviceRevMap.get(o.serviceCategory) || 0) + Number(o.grandTotal))
      );
    }
    const serviceRevenueChart = Array.from(serviceRevMap.entries())
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);

    const recentOrders = filteredOrders.slice(0, 6).map((o) => ({
      ...o,
      customerName: customerMap.get(o.customerId)?.fullName || 'Unknown',
      customerMobile: customerMap.get(o.customerId)?.mobileNumber || '',
    }));

    const orderMap = new Map(allOrders.map((o) => [o.id, o]));
    const receiptByPayment = new Map(
      allReceipts.filter((r) => r.status === 'Issued').map((r) => [r.paymentId, r])
    );

    const recentTransactions = filteredPayments.slice(0, 6).map((p) => ({
      ...p,
      customerName: customerMap.get(p.customerId)?.fullName || 'Unknown',
      orderCode: orderMap.get(p.orderId)?.orderCode || '',
      receiptId: receiptByPayment.get(p.id)?.id || null,
      receiptNumber: receiptByPayment.get(p.id)?.receiptNumber || '',
    }));

    res.json({
      success: true,
      data: {
        range: { fromDate, toDate },
        kpis: {
          totalOrders: filteredOrders.length,
          allTimeOrders: allOrders.length,
          totalCustomers: allCustomers.length,
          totalPaymentsReceived: roundInr(totalPaymentsReceived),
          todaysCollections: roundInr(todaysCollections),
          monthlyCollections: roundInr(monthlyCollections),
          pendingPaymentsAmount: roundInr(pendingPaymentsAmount),
          partiallyPaidOrders,
          completedOrders,
          pendingDocuments,
          totalRefunds: roundInr(totalRefunds),
        },
        charts: {
          dailyCollectionChart,
          monthlyRevenueChart,
          paymentMethodChart,
          orderStatusChart,
          serviceRevenueChart,
        },
        recentOrders,
        recentTransactions,
      },
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ success: false, message: 'Failed to load dashboard metrics' });
  }
});

// ---------- CUSTOMERS ----------

apiRouter.get('/customers', requirePermission('customers.view'), async (req: AuthRequest, res: Response) => {
  try {
    const q = String(req.query.q || '').trim();
    const rows = q
      ? await db
          .select()
          .from(customers)
          .where(
            or(
              ilike(customers.fullName, `%${q}%`),
              ilike(customers.businessName, `%${q}%`),
              ilike(customers.mobileNumber, `%${q}%`),
              ilike(customers.email, `%${q}%`),
              ilike(customers.customerCode, `%${q}%`)
            )
          )
          .orderBy(desc(customers.id))
      : await db.select().from(customers).orderBy(desc(customers.id));

    const allOrders = await db.select().from(orders);
    const enriched = rows.map((c) => {
      const custOrders = allOrders.filter((o) => o.customerId === c.id);
      const totalBilled = custOrders.reduce((s, o) => s + Number(o.grandTotal), 0);
      const totalPaid = custOrders.reduce((s, o) => s + Number(o.totalPaid), 0);
      const outstandingBalance = custOrders.reduce((s, o) => s + Number(o.remainingBalance), 0);
      return {
        ...c,
        orderCount: custOrders.length,
        totalBilled: roundInr(totalBilled),
        totalPaid: roundInr(totalPaid),
        outstandingBalance: roundInr(outstandingBalance),
      };
    });

    res.json({ success: true, data: enriched });
  } catch (error) {
    console.error('Customers fetch error:', error);
    res.status(500).json({ success: false, message: 'Failed to load customers' });
  }
});

apiRouter.get('/customers/:id', requirePermission('customers.view'), async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const [customer] = await db.select().from(customers).where(eq(customers.id, id));
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }
    const custOrders = await db.select().from(orders).where(eq(orders.customerId, id)).orderBy(desc(orders.id));
    const custPayments = await db.select().from(payments).where(eq(payments.customerId, id)).orderBy(desc(payments.id));
    const custReceipts = await db.select().from(receipts).where(eq(receipts.customerId, id)).orderBy(desc(receipts.id));

    const totalBilled = custOrders.reduce((s, o) => s + Number(o.grandTotal), 0);
    const totalPaid = custOrders.reduce((s, o) => s + Number(o.totalPaid), 0);
    const outstandingBalance = custOrders.reduce((s, o) => s + Number(o.remainingBalance), 0);

    res.json({
      success: true,
      data: {
        customer,
        summary: {
          totalBilled: roundInr(totalBilled),
          totalPaid: roundInr(totalPaid),
          outstandingBalance: roundInr(outstandingBalance),
          orderCount: custOrders.length,
          receiptCount: custReceipts.length,
        },
        orders: custOrders,
        payments: custPayments,
        receipts: custReceipts,
      },
    });
  } catch (error) {
    console.error('Customer profile error:', error);
    res.status(500).json({ success: false, message: 'Failed to load customer profile' });
  }
});

apiRouter.post('/customers', requirePermission('customers.manage'), async (req: AuthRequest, res: Response) => {
  try {
    const body = req.body || {};
    const fullName = String(body.fullName || '').trim();
    const mobileNumber = String(body.mobileNumber || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const gstin = String(body.gstin || '').trim().toUpperCase();
    const pan = String(body.pan || '').trim().toUpperCase();

    if (!fullName) {
      return res.status(400).json({ success: false, message: 'Customer full name is required.' });
    }
    if (!isValidIndianMobile(mobileNumber)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid 10-digit Indian mobile number.' });
    }
    if (!isValidGstin(gstin)) {
      return res.status(400).json({ success: false, message: 'Invalid GSTIN format (15 alphanumeric characters).' });
    }
    if (!isValidPan(pan)) {
      return res.status(400).json({ success: false, message: 'Invalid PAN format (e.g., ABCDE1234F).' });
    }

    // Prevent accidental duplicate customer records by mobile or email
    const normalizedDigits = mobileNumber.replace(/\D/g, '').slice(-10);
    const existing = await db.select().from(customers);
    const duplicate = existing.find(
      (c) =>
        c.mobileNumber.replace(/\D/g, '').slice(-10) === normalizedDigits ||
        (email && c.email.toLowerCase() === email)
    );
    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: `A customer record already exists (${duplicate.customerCode} — ${duplicate.fullName}).`,
      });
    }

    const customerCode = await generateNextCode('CUST', 'customer');
    const [created] = await db
      .insert(customers)
      .values({
        customerCode,
        fullName,
        businessName: String(body.businessName || '').trim(),
        mobileNumber: normalizedDigits,
        email,
        billingAddress: String(body.billingAddress || '').trim(),
        city: String(body.city || '').trim(),
        state: String(body.state || '').trim(),
        pincode: String(body.pincode || '').trim(),
        gstin,
        pan,
        notes: String(body.notes || '').trim(),
        createdBy: req.authUser?.fullName || 'System',
      })
      .returning();

    await logAudit(
      req,
      'CUSTOMER_CREATED',
      'customer',
      created.customerCode,
      `Created customer ${created.fullName} (${created.customerCode})`,
      null,
      created as unknown as Record<string, unknown>
    );

    res.status(201).json({ success: true, message: 'Customer created successfully', data: created });
  } catch (error) {
    console.error('Create customer error:', error);
    res.status(500).json({ success: false, message: 'Failed to create customer' });
  }
});

apiRouter.put('/customers/:id', requirePermission('customers.manage'), async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(customers).where(eq(customers.id, id));
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const body = req.body || {};
    const fullName = String(body.fullName ?? existing.fullName).trim();
    const mobileNumber = String(body.mobileNumber ?? existing.mobileNumber).trim();
    const email = String(body.email ?? existing.email).trim().toLowerCase();
    const gstin = String(body.gstin ?? existing.gstin).trim().toUpperCase();
    const pan = String(body.pan ?? existing.pan).trim().toUpperCase();

    if (!fullName || !isValidIndianMobile(mobileNumber)) {
      return res.status(400).json({ success: false, message: 'Valid customer name and 10-digit mobile are required.' });
    }
    if (!isValidGstin(gstin) || !isValidPan(pan)) {
      return res.status(400).json({ success: false, message: 'Invalid GSTIN or PAN format.' });
    }

    const [updated] = await db
      .update(customers)
      .set({
        fullName,
        businessName: String(body.businessName ?? existing.businessName).trim(),
        mobileNumber: mobileNumber.replace(/\D/g, '').slice(-10),
        email,
        billingAddress: String(body.billingAddress ?? existing.billingAddress).trim(),
        city: String(body.city ?? existing.city).trim(),
        state: String(body.state ?? existing.state).trim(),
        pincode: String(body.pincode ?? existing.pincode).trim(),
        gstin,
        pan,
        notes: String(body.notes ?? existing.notes).trim(),
        updatedAt: new Date(),
      })
      .where(eq(customers.id, id))
      .returning();

    await logAudit(
      req,
      'CUSTOMER_UPDATED',
      'customer',
      updated.customerCode,
      `Updated customer profile ${updated.fullName} (${updated.customerCode})`,
      existing as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>
    );

    res.json({ success: true, message: 'Customer updated successfully', data: updated });
  } catch (error) {
    console.error('Update customer error:', error);
    res.status(500).json({ success: false, message: 'Failed to update customer' });
  }
});

// ---------- ORDERS ----------

apiRouter.get('/orders', requirePermission('orders.view'), async (req: AuthRequest, res: Response) => {
  try {
    const q = String(req.query.q || '').trim().toLowerCase();
    const status = String(req.query.status || '').trim();
    const category = String(req.query.category || '').trim();
    const customerId = req.query.customerId ? Number(req.query.customerId) : null;
    const from = String(req.query.from || '');
    const to = String(req.query.to || '');

    const allOrders = await db.select().from(orders).orderBy(desc(orders.id));
    const allCustomers = await db.select().from(customers);
    const customerMap = new Map(allCustomers.map((c) => [c.id, c]));

    const filtered = allOrders
      .map((o) => ({
        ...o,
        customerName: customerMap.get(o.customerId)?.fullName || 'Unknown',
        customerMobile: customerMap.get(o.customerId)?.mobileNumber || '',
        customerCode: customerMap.get(o.customerId)?.customerCode || '',
      }))
      .filter((o) => {
        if (status && status !== 'All' && o.orderStatus !== status) return false;
        if (category && category !== 'All' && o.serviceCategory !== category) return false;
        if (customerId && o.customerId !== customerId) return false;
        if (from && o.orderDate < from) return false;
        if (to && o.orderDate > to) return false;
        if (q) {
          const hay = `${o.orderCode} ${o.customerName} ${o.customerMobile} ${o.serviceName} ${o.documentName} ${o.documentReferenceNumber}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });

    res.json({ success: true, data: filtered });
  } catch (error) {
    console.error('Orders fetch error:', error);
    res.status(500).json({ success: false, message: 'Failed to load orders' });
  }
});

apiRouter.get('/orders/:id', requirePermission('orders.view'), async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    const [customer] = await db.select().from(customers).where(eq(customers.id, order.customerId));
    const orderPayments = await db.select().from(payments).where(eq(payments.orderId, id)).orderBy(desc(payments.id));
    const orderReceipts = await db.select().from(receipts).where(eq(receipts.orderId, id)).orderBy(desc(receipts.id));
    const orderDocuments = await db.select().from(documents).where(eq(documents.orderId, id)).orderBy(desc(documents.id));
    const orderRefunds = await db.select().from(refunds).where(eq(refunds.orderId, id)).orderBy(desc(refunds.id));
    const orderLogs = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityType, 'order'), eq(auditLogs.entityId, order.orderCode)))
      .orderBy(desc(auditLogs.id));

    res.json({
      success: true,
      data: {
        order,
        customer,
        payments: orderPayments,
        receipts: orderReceipts,
        documents: orderDocuments,
        refunds: orderRefunds,
        auditLogs: orderLogs,
      },
    });
  } catch (error) {
    console.error('Order details error:', error);
    res.status(500).json({ success: false, message: 'Failed to load order details' });
  }
});

apiRouter.post('/orders', requirePermission('orders.manage'), async (req: AuthRequest, res: Response) => {
  try {
    const body = req.body || {};
    const customerId = Number(body.customerId);
    const serviceCategory = String(body.serviceCategory || '').trim();
    const serviceName = String(body.serviceName || '').trim();
    const documentName = String(body.documentName || '').trim();

    if (!customerId || !serviceCategory || !serviceName || !documentName) {
      return res.status(400).json({
        success: false,
        message: 'Customer, service category, service name, and document name are required.',
      });
    }

    const [cust] = await db.select().from(customers).where(eq(customers.id, customerId));
    if (!cust) {
      return res.status(404).json({ success: false, message: 'Selected customer does not exist.' });
    }

    const fin = calculateOrderFinancials({
      serviceFee: Number(body.serviceFee || 0),
      governmentFee: Number(body.governmentFee || 0),
      stampDuty: Number(body.stampDuty || 0),
      notaryCharges: Number(body.notaryCharges || 0),
      courierCharges: Number(body.courierCharges || 0),
      otherCharges: Number(body.otherCharges || 0),
      discount: Number(body.discount || 0),
      cgstRate: Number(body.cgstRate || 0),
      sgstRate: Number(body.sgstRate || 0),
      igstRate: Number(body.igstRate || 0),
      previouslyPaid: 0,
      currentPayment: 0,
    });

    const orderCode = await generateNextCode('EDR-ORD', 'order');
    const orderDate = String(body.orderDate || new Date().toISOString().slice(0, 10));

    const [created] = await db
      .insert(orders)
      .values({
        orderCode,
        orderDate,
        customerId,
        serviceId: body.serviceId ? Number(body.serviceId) : null,
        serviceCategory,
        serviceName,
        documentName,
        documentReferenceNumber: String(body.documentReferenceNumber || '').trim(),
        state: String(body.state || cust.state || '').trim(),
        quantity: Math.max(1, Number(body.quantity || 1)),
        description: String(body.description || '').trim(),
        assignedExecutive: String(body.assignedExecutive || req.authUser?.fullName || '').trim(),
        expectedDeliveryDate: String(body.expectedDeliveryDate || '').trim(),
        deliveryMethod: String(body.deliveryMethod || 'Email').trim(),
        deliveryAddress: String(body.deliveryAddress || cust.billingAddress || '').trim(),
        internalNotes: String(body.internalNotes || '').trim(),
        orderStatus: String(body.orderStatus || 'New Order'),
        serviceFee: roundInr(body.serviceFee).toFixed(2),
        governmentFee: roundInr(body.governmentFee).toFixed(2),
        stampDuty: roundInr(body.stampDuty).toFixed(2),
        notaryCharges: roundInr(body.notaryCharges).toFixed(2),
        courierCharges: roundInr(body.courierCharges).toFixed(2),
        otherCharges: roundInr(body.otherCharges).toFixed(2),
        discount: roundInr(body.discount).toFixed(2),
        subtotal: fin.subtotal.toFixed(2),
        taxableAmount: fin.taxableAmount.toFixed(2),
        cgstRate: Number(body.cgstRate || 0).toFixed(2),
        sgstRate: Number(body.sgstRate || 0).toFixed(2),
        igstRate: Number(body.igstRate || 0).toFixed(2),
        cgstAmount: fin.cgstAmount.toFixed(2),
        sgstAmount: fin.sgstAmount.toFixed(2),
        igstAmount: fin.igstAmount.toFixed(2),
        totalGst: fin.totalGst.toFixed(2),
        grandTotal: fin.grandTotal.toFixed(2),
        totalPaid: '0.00',
        remainingBalance: fin.grandTotal.toFixed(2),
        paymentStatus: fin.grandTotal === 0 ? 'Paid' : 'Pending',
        createdBy: req.authUser?.fullName || 'System',
      })
      .returning();

    await logAudit(
      req,
      'ORDER_CREATED',
      'order',
      created.orderCode,
      `Created order ${created.orderCode} for ${cust.fullName} — ${created.serviceName} (₹${created.grandTotal})`,
      null,
      created as unknown as Record<string, unknown>
    );

    res.status(201).json({ success: true, message: 'Order created successfully', data: created });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ success: false, message: 'Failed to create order' });
  }
});

apiRouter.patch('/orders/:id/status', requirePermission('orders.manage'), async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { orderStatus, assignedExecutive, internalNotes } = req.body || {};
    const [existing] = await db.select().from(orders).where(eq(orders.id, id));
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    const [updated] = await db
      .update(orders)
      .set({
        orderStatus: orderStatus || existing.orderStatus,
        assignedExecutive: assignedExecutive ?? existing.assignedExecutive,
        internalNotes: internalNotes ?? existing.internalNotes,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, id))
      .returning();

    await logAudit(
      req,
      'ORDER_STATUS_UPDATED',
      'order',
      updated.orderCode,
      `Updated order ${updated.orderCode} status from "${existing.orderStatus}" to "${updated.orderStatus}"`,
      { orderStatus: existing.orderStatus },
      { orderStatus: updated.orderStatus }
    );

    res.json({ success: true, message: 'Order status updated', data: updated });
  } catch (error) {
    console.error('Order status update error:', error);
    res.status(500).json({ success: false, message: 'Failed to update order status' });
  }
});

// ---------- PAYMENTS & REFUNDS ----------

apiRouter.get('/payments', requirePermission('payments.view'), async (req: AuthRequest, res: Response) => {
  try {
    const mode = String(req.query.mode || '');
    const status = String(req.query.status || '');
    const q = String(req.query.q || '').trim().toLowerCase();

    const allPayments = await db.select().from(payments).orderBy(desc(payments.id));
    const allCustomers = await db.select().from(customers);
    const allOrders = await db.select().from(orders);
    const allReceipts = await db.select().from(receipts);

    const custMap = new Map(allCustomers.map((c) => [c.id, c]));
    const orderMap = new Map(allOrders.map((o) => [o.id, o]));
    const receiptMap = new Map(
      allReceipts.filter((r) => r.status === 'Issued').map((r) => [r.paymentId, r])
    );

    const rows = allPayments
      .map((p) => ({
        ...p,
        customerName: custMap.get(p.customerId)?.fullName || 'Unknown',
        orderCode: orderMap.get(p.orderId)?.orderCode || '',
        serviceName: orderMap.get(p.orderId)?.serviceName || '',
        receiptId: receiptMap.get(p.id)?.id || null,
        receiptNumber: receiptMap.get(p.id)?.receiptNumber || '',
      }))
      .filter((p) => {
        if (mode && mode !== 'All' && p.paymentMode !== mode) return false;
        if (status && status !== 'All' && p.verificationStatus !== status && p.paymentStatus !== status) {
          return false;
        }
        if (q) {
          const hay = `${p.paymentCode} ${p.customerName} ${p.orderCode} ${p.transactionId} ${p.upiReference} ${p.receiptNumber}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Payments fetch error:', error);
    res.status(500).json({ success: false, message: 'Failed to load payments' });
  }
});

apiRouter.post('/payments', requirePermission('payments.collect'), async (req: AuthRequest, res: Response) => {
  try {
    const body = req.body || {};
    const orderId = Number(body.orderId);
    const amount = roundInr(body.amount);
    const paymentMode = String(body.paymentMode || 'UPI').trim();
    const paymentType = String(body.paymentType || 'Full Payment').trim();
    const paymentDate = String(body.paymentDate || new Date().toISOString().slice(0, 10));
    const paymentTime = String(body.paymentTime || new Date().toTimeString().slice(0, 5));

    if (!orderId || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Valid order and positive payment amount are required.' });
    }

    const [orderRow] = await db.select().from(orders).where(eq(orders.id, orderId));
    if (!orderRow) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    // Never mark an unverified transaction as successfully paid automatically unless explicitly verified by an authorized user
    const canVerify =
      req.authUser?.roleSlug === 'super_admin' ||
      req.authUser?.permissions.includes('payments.verify');
    const verifyNow = Boolean(body.verifyNow) && Boolean(canVerify);

    const prevPaid = Number(orderRow.totalPaid);
    const finPreview = calculateOrderFinancials({
      serviceFee: Number(orderRow.serviceFee),
      governmentFee: Number(orderRow.governmentFee),
      stampDuty: Number(orderRow.stampDuty),
      notaryCharges: Number(orderRow.notaryCharges),
      courierCharges: Number(orderRow.courierCharges),
      otherCharges: Number(orderRow.otherCharges),
      discount: Number(orderRow.discount),
      cgstRate: Number(orderRow.cgstRate),
      sgstRate: Number(orderRow.sgstRate),
      igstRate: Number(orderRow.igstRate),
      previouslyPaid: prevPaid,
      currentPayment: verifyNow ? amount : 0,
    });

    const paymentCode = await generateNextCode('PAY', 'payment');
    const [createdPayment] = await db
      .insert(payments)
      .values({
        paymentCode,
        orderId: orderRow.id,
        customerId: orderRow.customerId,
        paymentDate,
        paymentTime,
        amount: amount.toFixed(2),
        paymentType,
        paymentMode,
        transactionId: String(body.transactionId || '').trim(),
        upiReference: String(body.upiReference || '').trim(),
        upiId: String(body.upiId || '').trim(),
        bankName: String(body.bankName || '').trim(),
        chequeNumber: String(body.chequeNumber || '').trim(),
        chequeDate: String(body.chequeDate || '').trim(),
        paymentGateway: String(body.paymentGateway || '').trim(),
        gatewayOrderId: String(body.gatewayOrderId || '').trim(),
        gatewayPaymentId: String(body.gatewayPaymentId || '').trim(),
        gatewayReference: String(body.gatewayReference || '').trim(),
        paymentReceivedBy: String(body.paymentReceivedBy || req.authUser?.fullName || '').trim(),
        paymentVerified: verifyNow,
        verificationStatus: verifyNow ? 'Verified' : 'Pending',
        paymentStatus: verifyNow ? finPreview.paymentStatus : 'Pending',
        notes: String(body.notes || '').trim(),
        verifiedBy: verifyNow ? req.authUser?.fullName || '' : '',
        verifiedAt: verifyNow ? new Date() : null,
        createdBy: req.authUser?.fullName || 'System',
      })
      .returning();

    let createdReceipt = null;

    if (verifyNow) {
      await db
        .update(orders)
        .set({
          totalPaid: finPreview.totalPaid.toFixed(2),
          remainingBalance: finPreview.remainingBalance.toFixed(2),
          paymentStatus: finPreview.paymentStatus,
          orderStatus:
            orderRow.orderStatus === 'New Order' || orderRow.orderStatus === 'Awaiting Payment'
              ? 'Payment Confirmed'
              : orderRow.orderStatus,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, orderRow.id));

      const issued = await issueReceiptForVerifiedPayment(
        orderRow,
        createdPayment,
        prevPaid,
        req.authUser?.fullName || 'System'
      );
      createdReceipt = issued.receipt;
    }

    await logAudit(
      req,
      verifyNow ? 'PAYMENT_RECORDED_AND_VERIFIED' : 'PAYMENT_RECORDED_PENDING',
      'payment',
      createdPayment.paymentCode,
      `Recorded ${paymentMode} payment ${createdPayment.paymentCode} of ₹${createdPayment.amount} on ${orderRow.orderCode} (${verifyNow ? `Verified; Receipt ${createdReceipt?.receiptNumber}` : 'Pending Verification'})`,
      null,
      createdPayment as unknown as Record<string, unknown>
    );

    res.status(201).json({
      success: true,
      message: verifyNow
        ? `Payment verified and receipt ${createdReceipt?.receiptNumber} issued.`
        : 'Payment recorded as Pending Verification.',
      data: {
        payment: createdPayment,
        receipt: createdReceipt,
      },
    });
  } catch (error) {
    console.error('Create payment error:', error);
    res.status(500).json({ success: false, message: 'Failed to record payment' });
  }
});

apiRouter.patch('/payments/:id/verify', requirePermission('payments.verify'), async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { action = 'verify', reason = '' } = req.body || {};
    const [paymentRow] = await db.select().from(payments).where(eq(payments.id, id));
    if (!paymentRow) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }
    if (paymentRow.paymentVerified && action === 'verify') {
      return res.status(400).json({ success: false, message: 'Payment is already verified.' });
    }

    const [orderRow] = await db.select().from(orders).where(eq(orders.id, paymentRow.orderId));
    if (!orderRow) {
      return res.status(404).json({ success: false, message: 'Associated order not found.' });
    }

    if (action === 'fail') {
      const [updated] = await db
        .update(payments)
        .set({
          paymentVerified: false,
          verificationStatus: 'Failed',
          paymentStatus: 'Failed',
          notes: reason ? `${paymentRow.notes ? `${paymentRow.notes} | ` : ''}Rejected: ${reason}` : paymentRow.notes,
          updatedAt: new Date(),
        })
        .where(eq(payments.id, id))
        .returning();

      await logAudit(
        req,
        'PAYMENT_MARKED_FAILED',
        'payment',
        updated.paymentCode,
        `Marked payment ${updated.paymentCode} as Failed${reason ? `: ${reason}` : ''}`,
        { verificationStatus: paymentRow.verificationStatus },
        { verificationStatus: 'Failed' }
      );
      return res.json({ success: true, message: 'Payment marked as Failed', data: { payment: updated } });
    }

    const prevPaid = Number(orderRow.totalPaid);
    const fin = calculateOrderFinancials({
      serviceFee: Number(orderRow.serviceFee),
      governmentFee: Number(orderRow.governmentFee),
      stampDuty: Number(orderRow.stampDuty),
      notaryCharges: Number(orderRow.notaryCharges),
      courierCharges: Number(orderRow.courierCharges),
      otherCharges: Number(orderRow.otherCharges),
      discount: Number(orderRow.discount),
      cgstRate: Number(orderRow.cgstRate),
      sgstRate: Number(orderRow.sgstRate),
      igstRate: Number(orderRow.igstRate),
      previouslyPaid: prevPaid,
      currentPayment: Number(paymentRow.amount),
    });

    const [updatedPayment] = await db
      .update(payments)
      .set({
        paymentVerified: true,
        verificationStatus: 'Verified',
        paymentStatus: fin.paymentStatus,
        verifiedBy: req.authUser?.fullName || 'Accounts Manager',
        verifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(payments.id, id))
      .returning();

    await db
      .update(orders)
      .set({
        totalPaid: fin.totalPaid.toFixed(2),
        remainingBalance: fin.remainingBalance.toFixed(2),
        paymentStatus: fin.paymentStatus,
        orderStatus:
          orderRow.orderStatus === 'New Order' || orderRow.orderStatus === 'Awaiting Payment'
            ? 'Payment Confirmed'
            : orderRow.orderStatus,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderRow.id));

    const issued = await issueReceiptForVerifiedPayment(
      orderRow,
      updatedPayment,
      prevPaid,
      req.authUser?.fullName || 'Accounts Manager'
    );

    await logAudit(
      req,
      'PAYMENT_VERIFIED',
      'payment',
      updatedPayment.paymentCode,
      `Verified payment ${updatedPayment.paymentCode} (₹${updatedPayment.amount}) and issued receipt ${issued.receipt.receiptNumber}`,
      { verificationStatus: paymentRow.verificationStatus },
      { verificationStatus: 'Verified', receiptNumber: issued.receipt.receiptNumber }
    );

    res.json({
      success: true,
      message: `Payment verified and receipt ${issued.receipt.receiptNumber} generated.`,
      data: { payment: updatedPayment, receipt: issued.receipt },
    });
  } catch (error) {
    console.error('Verify payment error:', error);
    res.status(500).json({ success: false, message: 'Failed to verify payment' });
  }
});

apiRouter.post('/payments/:id/refund', requirePermission('payments.verify'), async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const amount = roundInr(req.body?.amount);
    const reason = String(req.body?.reason || '').trim();
    const refundMode = String(req.body?.refundMode || 'Bank Transfer').trim();
    const referenceNumber = String(req.body?.referenceNumber || '').trim();

    if (amount <= 0 || !reason) {
      return res.status(400).json({ success: false, message: 'Refund amount and reason are required.' });
    }

    const [paymentRow] = await db.select().from(payments).where(eq(payments.id, id));
    if (!paymentRow || !paymentRow.paymentVerified) {
      return res.status(400).json({ success: false, message: 'Only verified payments can be refunded.' });
    }
    if (amount > Number(paymentRow.amount)) {
      return res.status(400).json({ success: false, message: 'Refund amount cannot exceed payment amount.' });
    }

    const [orderRow] = await db.select().from(orders).where(eq(orders.id, paymentRow.orderId));
    const refundCode = await generateNextCode('REF', 'refund');

    const [createdRefund] = await db
      .insert(refunds)
      .values({
        refundCode,
        orderId: paymentRow.orderId,
        paymentId: paymentRow.id,
        customerId: paymentRow.customerId,
        amount: amount.toFixed(2),
        reason,
        refundMode,
        referenceNumber,
        status: 'Processed',
        processedBy: req.authUser?.fullName || 'Accounts Manager',
      })
      .returning();

    if (amount === Number(paymentRow.amount)) {
      await db
        .update(payments)
        .set({ paymentStatus: 'Refunded', verificationStatus: 'Refunded', updatedAt: new Date() })
        .where(eq(payments.id, paymentRow.id));
    }

    if (orderRow) {
      const newPaid = Math.max(0, roundInr(Number(orderRow.totalPaid) - amount));
      const newBal = Math.max(0, roundInr(Number(orderRow.grandTotal) - newPaid));
      await db
        .update(orders)
        .set({
          totalPaid: newPaid.toFixed(2),
          remainingBalance: newBal.toFixed(2),
          paymentStatus: newPaid === 0 ? 'Pending' : newBal === 0 ? 'Paid' : 'Partially Paid',
          updatedAt: new Date(),
        })
        .where(eq(orders.id, orderRow.id));
    }

    await logAudit(
      req,
      'REFUND_PROCESSED',
      'refund',
      createdRefund.refundCode,
      `Processed refund ${createdRefund.refundCode} of ₹${createdRefund.amount} against ${paymentRow.paymentCode}: ${reason}`,
      null,
      createdRefund as unknown as Record<string, unknown>
    );

    res.status(201).json({ success: true, message: 'Refund recorded successfully', data: createdRefund });
  } catch (error) {
    console.error('Refund error:', error);
    res.status(500).json({ success: false, message: 'Failed to process refund' });
  }
});

// ---------- RECEIPTS ----------

apiRouter.get('/receipts', requirePermission('receipts.view'), async (req: AuthRequest, res: Response) => {
  try {
    const q = String(req.query.q || '').trim().toLowerCase();
    const status = String(req.query.status || '');

    const allReceipts = await db.select().from(receipts).orderBy(desc(receipts.id));
    const allCustomers = await db.select().from(customers);
    const allOrders = await db.select().from(orders);
    const allPayments = await db.select().from(payments);

    const custMap = new Map(allCustomers.map((c) => [c.id, c]));
    const orderMap = new Map(allOrders.map((o) => [o.id, o]));
    const payMap = new Map(allPayments.map((p) => [p.id, p]));

    const rows = allReceipts
      .map((r) => ({
        ...r,
        customerName: custMap.get(r.customerId)?.fullName || 'Unknown',
        businessName: custMap.get(r.customerId)?.businessName || '',
        customerMobile: custMap.get(r.customerId)?.mobileNumber || '',
        orderCode: orderMap.get(r.orderId)?.orderCode || '',
        serviceName: orderMap.get(r.orderId)?.serviceName || '',
        paymentMode: payMap.get(r.paymentId)?.paymentMode || '',
        transactionId: payMap.get(r.paymentId)?.transactionId || '',
      }))
      .filter((r) => {
        if (status && status !== 'All' && r.status !== status) return false;
        if (q) {
          const hay = `${r.receiptNumber} ${r.customerName} ${r.orderCode} ${r.serviceName} ${r.transactionId}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Receipts fetch error:', error);
    res.status(500).json({ success: false, message: 'Failed to load receipts' });
  }
});

apiRouter.post('/receipts', requirePermission('receipts.manage'), async (req: AuthRequest, res: Response) => {
  try {
    const body = req.body || {};
    const mode = body.mode === 'direct' ? 'direct' : 'existing_order';
    const amount = roundInr(body.amount);
    const paymentMode = String(body.paymentMode || 'UPI').trim();
    const paymentType = String(body.paymentType || 'Full Payment').trim();
    const paymentDate = String(body.paymentDate || new Date().toISOString().slice(0, 10));
    const paymentTime = String(body.paymentTime || new Date().toTimeString().slice(0, 5));
    const transactionId = String(body.transactionId || '').trim();
    const upiReference = String(body.upiReference || '').trim();
    const bankName = String(body.bankName || '').trim();
    const notes = String(body.notes || '').trim();

    if (amount <= 0) {
      return res.status(400).json({ success: false, message: 'Payment amount must be greater than zero.' });
    }

    let orderRow: typeof orders.$inferSelect | undefined;
    let prevPaid = 0;

    if (mode === 'existing_order') {
      const orderId = Number(body.orderId);
      if (!orderId) {
        return res.status(400).json({ success: false, message: 'Please select a valid order.' });
      }
      const [foundOrder] = await db.select().from(orders).where(eq(orders.id, orderId));
      if (!foundOrder) {
        return res.status(404).json({ success: false, message: 'Selected order not found.' });
      }
      orderRow = foundOrder;
      prevPaid = Number(foundOrder.totalPaid);
    } else {
      // Direct receipt mode: resolve/create customer + create order + record verified payment + issue receipt
      let customerRow: typeof customers.$inferSelect | undefined;
      if (body.customerId) {
        const [foundCust] = await db.select().from(customers).where(eq(customers.id, Number(body.customerId)));
        if (!foundCust) {
          return res.status(404).json({ success: false, message: 'Selected customer not found.' });
        }
        customerRow = foundCust;
      } else {
        const custInput = body.customer || {};
        const fullName = String(custInput.fullName || '').trim();
        const mobileNumber = String(custInput.mobileNumber || '').trim();
        const email = String(custInput.email || '').trim().toLowerCase();
        const gstin = String(custInput.gstin || '').trim().toUpperCase();

        if (!fullName) {
          return res.status(400).json({ success: false, message: 'Customer full name is required.' });
        }
        if (!isValidIndianMobile(mobileNumber)) {
          return res.status(400).json({ success: false, message: 'Enter a valid 10-digit Indian mobile number.' });
        }
        if (!isValidGstin(gstin)) {
          return res.status(400).json({ success: false, message: 'Invalid GSTIN format.' });
        }

        const normalizedDigits = mobileNumber.replace(/\D/g, '').slice(-10);
        const existingCusts = await db.select().from(customers);
        const matched = existingCusts.find(
          (c) => c.mobileNumber.replace(/\D/g, '').slice(-10) === normalizedDigits
        );

        if (matched) {
          customerRow = matched;
        } else {
          const customerCode = await generateNextCode('CUST', 'customer');
          const [createdCust] = await db
            .insert(customers)
            .values({
              customerCode,
              fullName,
              businessName: String(custInput.businessName || '').trim(),
              mobileNumber: normalizedDigits,
              email,
              billingAddress: String(custInput.billingAddress || '').trim(),
              city: String(custInput.city || '').trim(),
              state: String(custInput.state || '').trim(),
              pincode: String(custInput.pincode || '').trim(),
              gstin,
              pan: '',
              notes: 'Created via Direct Receipt',
              createdBy: req.authUser?.fullName || 'System',
            })
            .returning();
          customerRow = createdCust;
        }
      }

      const serviceCategory = String(body.serviceCategory || '').trim();
      const serviceName = String(body.serviceName || '').trim();
      const documentName = String(body.documentName || serviceName || '').trim();
      if (!serviceCategory || !serviceName) {
        return res.status(400).json({ success: false, message: 'Service category and service name are required.' });
      }

      const orderFin = calculateOrderFinancials({
        serviceFee: Number(body.serviceFee || 0),
        governmentFee: Number(body.governmentFee || 0),
        stampDuty: Number(body.stampDuty || 0),
        notaryCharges: Number(body.notaryCharges || 0),
        courierCharges: Number(body.courierCharges || 0),
        otherCharges: Number(body.otherCharges || 0),
        discount: Number(body.discount || 0),
        cgstRate: Number(body.cgstRate || 0),
        sgstRate: Number(body.sgstRate || 0),
        igstRate: Number(body.igstRate || 0),
        previouslyPaid: 0,
        currentPayment: 0,
      });

      const orderCode = await generateNextCode('EDR-ORD', 'order');
      const [createdOrder] = await db
        .insert(orders)
        .values({
          orderCode,
          orderDate: paymentDate,
          customerId: customerRow.id,
          serviceId: body.serviceId ? Number(body.serviceId) : null,
          serviceCategory,
          serviceName,
          documentName,
          documentReferenceNumber: String(body.documentReferenceNumber || '').trim(),
          state: String(body.state || customerRow.state || '').trim(),
          quantity: Math.max(1, Number(body.quantity || 1)),
          description: String(body.description || '').trim(),
          assignedExecutive: req.authUser?.fullName || 'System',
          expectedDeliveryDate: '',
          deliveryMethod: String(body.deliveryMethod || 'Email').trim(),
          deliveryAddress: customerRow.billingAddress || '',
          internalNotes: 'Created via Create Receipt',
          orderStatus: 'Payment Confirmed',
          serviceFee: roundInr(body.serviceFee).toFixed(2),
          governmentFee: roundInr(body.governmentFee).toFixed(2),
          stampDuty: roundInr(body.stampDuty).toFixed(2),
          notaryCharges: roundInr(body.notaryCharges).toFixed(2),
          courierCharges: roundInr(body.courierCharges).toFixed(2),
          otherCharges: roundInr(body.otherCharges).toFixed(2),
          discount: roundInr(body.discount).toFixed(2),
          subtotal: orderFin.subtotal.toFixed(2),
          taxableAmount: orderFin.taxableAmount.toFixed(2),
          cgstRate: Number(body.cgstRate || 0).toFixed(2),
          sgstRate: Number(body.sgstRate || 0).toFixed(2),
          igstRate: Number(body.igstRate || 0).toFixed(2),
          cgstAmount: orderFin.cgstAmount.toFixed(2),
          sgstAmount: orderFin.sgstAmount.toFixed(2),
          igstAmount: orderFin.igstAmount.toFixed(2),
          totalGst: orderFin.totalGst.toFixed(2),
          grandTotal: orderFin.grandTotal.toFixed(2),
          totalPaid: '0.00',
          remainingBalance: orderFin.grandTotal.toFixed(2),
          paymentStatus: 'Pending',
          createdBy: req.authUser?.fullName || 'System',
        })
        .returning();

      orderRow = createdOrder;
      prevPaid = 0;
    }

    const finPreview = calculateOrderFinancials({
      serviceFee: Number(orderRow.serviceFee),
      governmentFee: Number(orderRow.governmentFee),
      stampDuty: Number(orderRow.stampDuty),
      notaryCharges: Number(orderRow.notaryCharges),
      courierCharges: Number(orderRow.courierCharges),
      otherCharges: Number(orderRow.otherCharges),
      discount: Number(orderRow.discount),
      cgstRate: Number(orderRow.cgstRate),
      sgstRate: Number(orderRow.sgstRate),
      igstRate: Number(orderRow.igstRate),
      previouslyPaid: prevPaid,
      currentPayment: amount,
    });

    const paymentCode = await generateNextCode('PAY', 'payment');
    const [createdPayment] = await db
      .insert(payments)
      .values({
        paymentCode,
        orderId: orderRow.id,
        customerId: orderRow.customerId,
        paymentDate,
        paymentTime,
        amount: amount.toFixed(2),
        paymentType,
        paymentMode,
        transactionId,
        upiReference,
        upiId: '',
        bankName,
        chequeNumber: '',
        chequeDate: '',
        paymentGateway: '',
        gatewayOrderId: '',
        gatewayPaymentId: '',
        gatewayReference: '',
        paymentReceivedBy: req.authUser?.fullName || '',
        paymentVerified: true,
        verificationStatus: 'Verified',
        paymentStatus: finPreview.paymentStatus,
        notes,
        verifiedBy: req.authUser?.fullName || 'Admin',
        verifiedAt: new Date(),
        createdBy: req.authUser?.fullName || 'System',
      })
      .returning();

    await db
      .update(orders)
      .set({
        totalPaid: finPreview.totalPaid.toFixed(2),
        remainingBalance: finPreview.remainingBalance.toFixed(2),
        paymentStatus: finPreview.paymentStatus,
        orderStatus:
          orderRow.orderStatus === 'New Order' || orderRow.orderStatus === 'Awaiting Payment'
            ? 'Payment Confirmed'
            : orderRow.orderStatus,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderRow.id));

    const issued = await issueReceiptForVerifiedPayment(
      orderRow,
      createdPayment,
      prevPaid,
      req.authUser?.fullName || 'System'
    );

    await logAudit(
      req,
      'RECEIPT_CREATED',
      'receipt',
      issued.receipt.receiptNumber,
      `Created receipt ${issued.receipt.receiptNumber} for ${orderRow.orderCode} (₹${amount.toFixed(2)} via ${paymentMode})`,
      null,
      issued.receipt as unknown as Record<string, unknown>
    );

    res.status(201).json({
      success: true,
      message: `Receipt ${issued.receipt.receiptNumber} issued successfully.`,
      data: {
        receipt: issued.receipt,
        payment: createdPayment,
        order: orderRow,
      },
    });
  } catch (error) {
    console.error('Create receipt error:', error);
    res.status(500).json({ success: false, message: 'Failed to create receipt' });
  }
});

apiRouter.get('/receipts/:id', requirePermission('receipts.view'), async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const [receiptRow] = await db.select().from(receipts).where(eq(receipts.id, id));
    if (!receiptRow) {
      return res.status(404).json({ success: false, message: 'Receipt not found' });
    }

    const items = await db
      .select()
      .from(receiptItems)
      .where(eq(receiptItems.receiptId, id))
      .orderBy(receiptItems.sNo);
    const [customer] = await db.select().from(customers).where(eq(customers.id, receiptRow.customerId));
    const [order] = await db.select().from(orders).where(eq(orders.id, receiptRow.orderId));
    const [payment] = await db.select().from(payments).where(eq(payments.id, receiptRow.paymentId));
    const [settings] = await db.select().from(companySettings).limit(1);

    const origin =
      process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL'
        ? process.env.APP_URL.replace(/\/+$/, '')
        : `${req.protocol}://${req.get('host')}`;
    const verificationUrl = `${origin}/verify-receipt/${receiptRow.verificationToken}`;
    const qrCodeDataUrl = await QRCode.toDataURL(verificationUrl, {
      margin: 1,
      width: 180,
      color: { dark: '#310D35', light: '#FFFFFF' },
    });

    const history = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityType, 'receipt'), eq(auditLogs.entityId, receiptRow.receiptNumber)))
      .orderBy(desc(auditLogs.id));

    res.json({
      success: true,
      data: {
        receipt: receiptRow,
        items,
        customer,
        order,
        payment,
        companySettings: settings,
        verificationUrl,
        qrCodeDataUrl,
        history,
      },
    });
  } catch (error) {
    console.error('Receipt detail error:', error);
    res.status(500).json({ success: false, message: 'Failed to load receipt details' });
  }
});

apiRouter.post('/receipts/:id/reprint', requirePermission('receipts.view'), async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const [receiptRow] = await db.select().from(receipts).where(eq(receipts.id, id));
    if (!receiptRow) {
      return res.status(404).json({ success: false, message: 'Receipt not found' });
    }
    const [updated] = await db
      .update(receipts)
      .set({ reprintCount: receiptRow.reprintCount + 1, updatedAt: new Date() })
      .where(eq(receipts.id, id))
      .returning();

    await logAudit(
      req,
      'RECEIPT_REPRINTED',
      'receipt',
      updated.receiptNumber,
      `Receipt ${updated.receiptNumber} reprinted/downloaded (reprint count: ${updated.reprintCount})`
    );

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Reprint error:', error);
    res.status(500).json({ success: false, message: 'Failed to log reprint' });
  }
});

apiRouter.post('/receipts/:id/cancel-and-reissue', requirePermission('receipts.manage'), async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const reason = String(req.body?.reason || '').trim();
    if (!reason) {
      return res.status(400).json({ success: false, message: 'A reason is required to revise or cancel an issued receipt.' });
    }

    const [oldReceipt] = await db.select().from(receipts).where(eq(receipts.id, id));
    if (!oldReceipt) {
      return res.status(404).json({ success: false, message: 'Receipt not found.' });
    }
    if (oldReceipt.status !== 'Issued') {
      return res.status(400).json({ success: false, message: 'Only active Issued receipts can be superseded.' });
    }

    // Immutability: never overwrite old receipt silently; mark Superseded & issue new revision
    await db
      .update(receipts)
      .set({
        status: 'Superseded',
        cancellationReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(receipts.id, id));

    const newReceiptNumber = await generateNextReceiptNumber();
    const newToken = generateVerificationToken();

    const [reissued] = await db
      .insert(receipts)
      .values({
        receiptNumber: newReceiptNumber,
        receiptDate: new Date().toISOString().slice(0, 10),
        orderId: oldReceipt.orderId,
        paymentId: oldReceipt.paymentId,
        customerId: oldReceipt.customerId,
        verificationToken: newToken,
        paymentStatus: oldReceipt.paymentStatus,
        paymentType: oldReceipt.paymentType,
        serviceAmount: oldReceipt.serviceAmount,
        governmentFee: oldReceipt.governmentFee,
        stampDuty: oldReceipt.stampDuty,
        notaryFee: oldReceipt.notaryFee,
        courierCharge: oldReceipt.courierCharge,
        otherCharges: oldReceipt.otherCharges,
        discount: oldReceipt.discount,
        taxableAmount: oldReceipt.taxableAmount,
        cgstRate: oldReceipt.cgstRate,
        cgstAmount: oldReceipt.cgstAmount,
        sgstRate: oldReceipt.sgstRate,
        sgstAmount: oldReceipt.sgstAmount,
        igstRate: oldReceipt.igstRate,
        igstAmount: oldReceipt.igstAmount,
        totalGst: oldReceipt.totalGst,
        grandTotal: oldReceipt.grandTotal,
        previouslyPaid: oldReceipt.previouslyPaid,
        currentPayment: oldReceipt.currentPayment,
        totalPaid: oldReceipt.totalPaid,
        remainingBalance: oldReceipt.remainingBalance,
        amountInWords: oldReceipt.amountInWords,
        status: 'Issued',
        revisionNumber: oldReceipt.revisionNumber + 1,
        parentReceiptId: oldReceipt.id,
        issuedBy: req.authUser?.fullName || 'System',
      })
      .returning();

    const oldItems = await db
      .select()
      .from(receiptItems)
      .where(eq(receiptItems.receiptId, oldReceipt.id));

    if (oldItems.length > 0) {
      await db.insert(receiptItems).values(
        oldItems.map((it) => ({
          receiptId: reissued.id,
          sNo: it.sNo,
          particulars: it.particulars,
          amount: it.amount,
          itemType: it.itemType,
        }))
      );
    }

    await logAudit(
      req,
      'RECEIPT_REVISED',
      'receipt',
      reissued.receiptNumber,
      `Superseded ${oldReceipt.receiptNumber} (Rev ${oldReceipt.revisionNumber}) with ${reissued.receiptNumber} (Rev ${reissued.revisionNumber}). Reason: ${reason}`,
      { previousReceipt: oldReceipt.receiptNumber, status: 'Superseded' },
      { newReceipt: reissued.receiptNumber, revisionNumber: reissued.revisionNumber }
    );

    res.json({
      success: true,
      message: `Receipt ${oldReceipt.receiptNumber} superseded. Issued ${reissued.receiptNumber}.`,
      data: reissued,
    });
  } catch (error) {
    console.error('Receipt revise error:', error);
    res.status(500).json({ success: false, message: 'Failed to revise receipt' });
  }
});

// ---------- DOCUMENTS ----------

apiRouter.get('/documents', requirePermission('documents.manage'), async (req: AuthRequest, res: Response) => {
  try {
    const orderId = req.query.orderId ? Number(req.query.orderId) : null;
    const allDocs = orderId
      ? await db.select().from(documents).where(eq(documents.orderId, orderId)).orderBy(desc(documents.id))
      : await db.select().from(documents).orderBy(desc(documents.id));

    const allOrders = await db.select().from(orders);
    const allCustomers = await db.select().from(customers);
    const orderMap = new Map(allOrders.map((o) => [o.id, o]));
    const custMap = new Map(allCustomers.map((c) => [c.id, c]));

    const rows = allDocs.map((d) => ({
      ...d,
      orderCode: orderMap.get(d.orderId)?.orderCode || '',
      serviceName: orderMap.get(d.orderId)?.serviceName || '',
      customerName: custMap.get(d.customerId)?.fullName || '',
    }));

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Documents fetch error:', error);
    res.status(500).json({ success: false, message: 'Failed to load documents' });
  }
});

apiRouter.post(
  '/documents',
  requirePermission('documents.manage'),
  (req: Request, res: Response, next) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        return res.status(400).json({ success: false, message: err.message || 'File upload failed.' });
      }
      next();
    });
  },
  async (req: AuthRequest, res: Response) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ success: false, message: 'Please select a valid document file to upload.' });
      }

      const orderId = Number(req.body?.orderId);
      const title = String(req.body?.title || file.originalname).trim();
      const category = String(req.body?.category || 'Supporting Document').trim();
      const versionType = String(req.body?.versionType || 'Draft').trim();

      const [orderRow] = await db.select().from(orders).where(eq(orders.id, orderId));
      if (!orderRow) {
        fs.unlinkSync(file.path);
        return res.status(404).json({ success: false, message: 'Order not found for document upload.' });
      }

      const existingDocs = await db.select().from(documents).where(eq(documents.orderId, orderId));
      const versionNumber = existingDocs.length + 1;

      const [created] = await db
        .insert(documents)
        .values({
          orderId,
          customerId: orderRow.customerId,
          title,
          category,
          versionType: versionType === 'Final' ? 'Final' : 'Draft',
          versionNumber,
          approvalStatus: 'Pending Approval',
          fileName: file.filename,
          originalName: file.originalname,
          mimeType: file.mimetype,
          fileSize: file.size,
          storagePath: file.path,
          uploadedBy: req.authUser?.fullName || 'System',
        })
        .returning();

      await logAudit(
        req,
        'DOCUMENT_UPLOADED',
        'document',
        created.id,
        `Uploaded ${created.versionType} document "${created.title}" (${created.originalName}) to order ${orderRow.orderCode}`
      );

      res.status(201).json({ success: true, message: 'Document uploaded successfully', data: created });
    } catch (error) {
      console.error('Upload document error:', error);
      res.status(500).json({ success: false, message: 'Failed to save uploaded document' });
    }
  }
);

apiRouter.patch('/documents/:id/approval', requirePermission('documents.manage'), async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { approvalStatus, versionType } = req.body || {};
    const [existing] = await db.select().from(documents).where(eq(documents.id, id));
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }
    const [updated] = await db
      .update(documents)
      .set({
        approvalStatus: approvalStatus || existing.approvalStatus,
        versionType: versionType || existing.versionType,
        updatedAt: new Date(),
      })
      .where(eq(documents.id, id))
      .returning();

    await logAudit(
      req,
      'DOCUMENT_STATUS_UPDATED',
      'document',
      updated.id,
      `Updated document "${updated.title}" approval to ${updated.approvalStatus} (${updated.versionType})`
    );

    res.json({ success: true, message: 'Document status updated', data: updated });
  } catch (error) {
    console.error('Document approval error:', error);
    res.status(500).json({ success: false, message: 'Failed to update document status' });
  }
});

apiRouter.get('/documents/:id/download', requirePermission('documents.manage'), async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const [doc] = await db.select().from(documents).where(eq(documents.id, id));
    if (!doc || !fs.existsSync(doc.storagePath)) {
      return res.status(404).json({ success: false, message: 'Document file not found on storage.' });
    }
    res.download(doc.storagePath, doc.originalName);
  } catch (error) {
    console.error('Download document error:', error);
    res.status(500).json({ success: false, message: 'Failed to download document' });
  }
});

// ---------- REPORTS ----------

apiRouter.get('/reports', requirePermission('reports.view'), async (req: AuthRequest, res: Response) => {
  try {
    const type = String(req.query.type || 'daily');
    const from = String(req.query.from || '');
    const to = String(req.query.to || '');

    const allOrders = await db.select().from(orders);
    const allPayments = await db.select().from(payments);
    const allCustomers = await db.select().from(customers);
    const allRefunds = await db.select().from(refunds);

    const custMap = new Map(allCustomers.map((c) => [c.id, c]));
    const orderMap = new Map(allOrders.map((o) => [o.id, o]));

    const inRange = (d: string) => (!from || d >= from) && (!to || d <= to);
    const verifiedPayments = allPayments.filter((p) => p.paymentVerified && inRange(p.paymentDate));

    let rows: Array<Record<string, string | number>> = [];

    if (type === 'daily' || type === 'weekly' || type === 'monthly' || type === 'annual') {
      const grouped = new Map<string, { transactions: number; collected: number }>();
      for (const p of verifiedPayments) {
        let bucket = p.paymentDate;
        if (type === 'monthly') bucket = p.paymentDate.slice(0, 7);
        if (type === 'annual') bucket = p.paymentDate.slice(0, 4);
        if (type === 'weekly') {
          const dt = new Date(`${p.paymentDate}T00:00:00Z`);
          const day = dt.getUTCDay();
          const monday = new Date(dt.getTime() - ((day + 6) % 7) * 86400000);
          bucket = `Week of ${monday.toISOString().slice(0, 10)}`;
        }
        const cur = grouped.get(bucket) || { transactions: 0, collected: 0 };
        grouped.set(bucket, {
          transactions: cur.transactions + 1,
          collected: roundInr(cur.collected + Number(p.amount)),
        });
      }
      rows = Array.from(grouped.entries())
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([period, stats]) => ({
          Period: period,
          Transactions: stats.transactions,
          CollectedAmount: stats.collected,
        }));
    } else if (type === 'service_revenue') {
      const grouped = new Map<string, { orders: number; billed: number; collected: number }>();
      for (const o of allOrders.filter((o) => inRange(o.orderDate))) {
        const cur = grouped.get(o.serviceCategory) || { orders: 0, billed: 0, collected: 0 };
        grouped.set(o.serviceCategory, {
          orders: cur.orders + 1,
          billed: roundInr(cur.billed + Number(o.grandTotal)),
          collected: roundInr(cur.collected + Number(o.totalPaid)),
        });
      }
      rows = Array.from(grouped.entries()).map(([category, stats]) => ({
        ServiceCategory: category,
        Orders: stats.orders,
        TotalBilled: stats.billed,
        TotalCollected: stats.collected,
      }));
    } else if (type === 'customer_payments') {
      const grouped = new Map<number, { orders: number; paid: number; outstanding: number }>();
      for (const o of allOrders) {
        const cur = grouped.get(o.customerId) || { orders: 0, paid: 0, outstanding: 0 };
        grouped.set(o.customerId, {
          orders: cur.orders + 1,
          paid: roundInr(cur.paid + Number(o.totalPaid)),
          outstanding: roundInr(cur.outstanding + Number(o.remainingBalance)),
        });
      }
      rows = Array.from(grouped.entries()).map(([cid, stats]) => ({
        CustomerCode: custMap.get(cid)?.customerCode || '',
        CustomerName: custMap.get(cid)?.fullName || '',
        Mobile: custMap.get(cid)?.mobileNumber || '',
        Orders: stats.orders,
        TotalPaid: stats.paid,
        OutstandingBalance: stats.outstanding,
      }));
    } else if (type === 'pending_payments') {
      rows = allPayments
        .filter((p) => !p.paymentVerified && p.verificationStatus === 'Pending')
        .map((p) => ({
          PaymentCode: p.paymentCode,
          OrderCode: orderMap.get(p.orderId)?.orderCode || '',
          CustomerName: custMap.get(p.customerId)?.fullName || '',
          Date: p.paymentDate,
          Mode: p.paymentMode,
          Amount: roundInr(p.amount),
          Status: p.verificationStatus,
        }));
    } else if (type === 'outstanding_balances') {
      rows = allOrders
        .filter((o) => Number(o.remainingBalance) > 0 && o.orderStatus !== 'Cancelled')
        .map((o) => ({
          OrderCode: o.orderCode,
          CustomerName: custMap.get(o.customerId)?.fullName || '',
          ServiceName: o.serviceName,
          GrandTotal: roundInr(o.grandTotal),
          TotalPaid: roundInr(o.totalPaid),
          RemainingBalance: roundInr(o.remainingBalance),
          PaymentStatus: o.paymentStatus,
        }));
    } else if (type === 'refunds') {
      rows = allRefunds.map((r) => ({
        RefundCode: r.refundCode,
        OrderCode: orderMap.get(r.orderId)?.orderCode || '',
        CustomerName: custMap.get(r.customerId)?.fullName || '',
        Amount: roundInr(r.amount),
        Mode: r.refundMode,
        Reason: r.reason,
        ProcessedBy: r.processedBy,
        Status: r.status,
      }));
    } else if (type === 'payment_modes') {
      const grouped = new Map<string, { count: number; total: number }>();
      for (const p of verifiedPayments) {
        const cur = grouped.get(p.paymentMode) || { count: 0, total: 0 };
        grouped.set(p.paymentMode, {
          count: cur.count + 1,
          total: roundInr(cur.total + Number(p.amount)),
        });
      }
      rows = Array.from(grouped.entries()).map(([mode, stats]) => ({
        PaymentMode: mode,
        Transactions: stats.count,
        TotalAmount: stats.total,
      }));
    } else if (type === 'staff_collections') {
      const grouped = new Map<string, { count: number; total: number }>();
      for (const p of verifiedPayments) {
        const staff = p.paymentReceivedBy || p.createdBy || 'Unassigned';
        const cur = grouped.get(staff) || { count: 0, total: 0 };
        grouped.set(staff, {
          count: cur.count + 1,
          total: roundInr(cur.total + Number(p.amount)),
        });
      }
      rows = Array.from(grouped.entries()).map(([staff, stats]) => ({
        StaffMember: staff,
        VerifiedTransactions: stats.count,
        CollectedAmount: stats.total,
      }));
    }

    res.json({ success: true, data: { type, rows } });
  } catch (error) {
    console.error('Reports error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate report' });
  }
});

// ---------- SERVICES ----------

apiRouter.get('/services', async (_req: AuthRequest, res: Response) => {
  try {
    const rows = await db.select().from(services).orderBy(services.category, services.name);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Services fetch error:', error);
    res.status(500).json({ success: false, message: 'Failed to load services' });
  }
});

apiRouter.post('/services', requirePermission('settings.manage'), async (req: AuthRequest, res: Response) => {
  try {
    const body = req.body || {};
    if (!body.name || !body.category) {
      return res.status(400).json({ success: false, message: 'Service name and category are required.' });
    }
    const [created] = await db
      .insert(services)
      .values({
        name: String(body.name).trim(),
        category: String(body.category).trim(),
        defaultServiceFee: roundInr(body.defaultServiceFee).toFixed(2),
        defaultGovernmentFee: roundInr(body.defaultGovernmentFee).toFixed(2),
        defaultStampDuty: roundInr(body.defaultStampDuty).toFixed(2),
        defaultNotaryFee: roundInr(body.defaultNotaryFee).toFixed(2),
        defaultCourierCharge: roundInr(body.defaultCourierCharge).toFixed(2),
        gstApplicable: Boolean(body.gstApplicable),
        gstRate: Number(body.gstRate || 0).toFixed(2),
        hsnSac: String(body.hsnSac || '998213').trim(),
        description: String(body.description || '').trim(),
        isActive: body.isActive !== false,
      })
      .returning();

    await logAudit(req, 'SERVICE_CREATED', 'service', created.id, `Added legal service "${created.name}"`);
    res.status(201).json({ success: true, message: 'Service added', data: created });
  } catch (error) {
    console.error('Create service error:', error);
    res.status(500).json({ success: false, message: 'Failed to create service' });
  }
});

apiRouter.put('/services/:id', requirePermission('settings.manage'), async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const body = req.body || {};
    const [existing] = await db.select().from(services).where(eq(services.id, id));
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }
    const [updated] = await db
      .update(services)
      .set({
        name: String(body.name ?? existing.name).trim(),
        category: String(body.category ?? existing.category).trim(),
        defaultServiceFee: roundInr(body.defaultServiceFee ?? existing.defaultServiceFee).toFixed(2),
        defaultGovernmentFee: roundInr(body.defaultGovernmentFee ?? existing.defaultGovernmentFee).toFixed(2),
        defaultStampDuty: roundInr(body.defaultStampDuty ?? existing.defaultStampDuty).toFixed(2),
        defaultNotaryFee: roundInr(body.defaultNotaryFee ?? existing.defaultNotaryFee).toFixed(2),
        defaultCourierCharge: roundInr(body.defaultCourierCharge ?? existing.defaultCourierCharge).toFixed(2),
        gstApplicable: body.gstApplicable ?? existing.gstApplicable,
        gstRate: Number(body.gstRate ?? existing.gstRate).toFixed(2),
        hsnSac: String(body.hsnSac ?? existing.hsnSac).trim(),
        description: String(body.description ?? existing.description).trim(),
        isActive: body.isActive ?? existing.isActive,
        updatedAt: new Date(),
      })
      .where(eq(services.id, id))
      .returning();

    await logAudit(req, 'SERVICE_UPDATED', 'service', updated.id, `Updated legal service "${updated.name}"`);
    res.json({ success: true, message: 'Service updated', data: updated });
  } catch (error) {
    console.error('Update service error:', error);
    res.status(500).json({ success: false, message: 'Failed to update service' });
  }
});

// ---------- USERS & ROLES ----------

apiRouter.get('/users', requirePermission('users.manage'), async (_req: AuthRequest, res: Response) => {
  try {
    const allUsers = await db.select().from(users).orderBy(users.id);
    const allRoles = await db.select().from(roles);
    const roleMap = new Map(allRoles.map((r) => [r.slug, r.name]));

    const sanitized = allUsers.map(({ passwordHash: _pw, resetToken: _rt, ...u }) => ({
      ...u,
      roleName: roleMap.get(u.roleSlug) || u.roleSlug,
    }));
    res.json({ success: true, data: sanitized });
  } catch (error) {
    console.error('Users fetch error:', error);
    res.status(500).json({ success: false, message: 'Failed to load staff users' });
  }
});

apiRouter.post('/users', requirePermission('users.manage'), async (req: AuthRequest, res: Response) => {
  try {
    const body = req.body || {};
    const email = String(body.email || '').trim().toLowerCase();
    const fullName = String(body.fullName || '').trim();
    const password = String(body.password || '');
    const roleSlug = String(body.roleSlug || 'staff_member');

    if (!email || !fullName || password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Full name, valid email, and password (min 6 characters) are required.',
      });
    }

    const [roleRow] = await db.select().from(roles).where(eq(roles.slug, roleSlug));
    if (!roleRow) {
      return res.status(400).json({ success: false, message: 'Selected role does not exist.' });
    }

    const [created] = await db
      .insert(users)
      .values({
        uid: `staff-${crypto.randomBytes(6).toString('hex')}`,
        email,
        fullName,
        phone: String(body.phone || '').trim(),
        designation: String(body.designation || 'Legal Executive').trim(),
        roleId: roleRow.id,
        roleSlug: roleRow.slug,
        passwordHash: hashPassword(password),
        isActive: body.isActive !== false,
      })
      .returning();

    await logAudit(req, 'USER_CREATED', 'user', created.id, `Added staff account ${created.fullName} (${created.email}) as ${roleRow.name}`);
    const { passwordHash: _pw, resetToken: _rt, ...safe } = created;
    res.status(201).json({ success: true, message: 'Staff user created', data: safe });
  } catch (error: unknown) {
    console.error('Create user error:', error);
    res.status(500).json({ success: false, message: 'Failed to create staff user (email may already exist).' });
  }
});

apiRouter.put('/users/:id', requirePermission('users.manage'), async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const body = req.body || {};
    const [existing] = await db.select().from(users).where(eq(users.id, id));
    if (!existing) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const roleSlug = String(body.roleSlug ?? existing.roleSlug);
    const [roleRow] = await db.select().from(roles).where(eq(roles.slug, roleSlug));

    const [updated] = await db
      .update(users)
      .set({
        fullName: String(body.fullName ?? existing.fullName).trim(),
        phone: String(body.phone ?? existing.phone).trim(),
        designation: String(body.designation ?? existing.designation).trim(),
        roleId: roleRow?.id ?? existing.roleId,
        roleSlug: roleRow?.slug ?? existing.roleSlug,
        isActive: body.isActive ?? existing.isActive,
        passwordHash:
          body.password && String(body.password).length >= 6
            ? hashPassword(String(body.password))
            : existing.passwordHash,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();

    await logAudit(req, 'USER_UPDATED', 'user', updated.id, `Updated staff user ${updated.fullName} (${updated.roleSlug})`);
    const { passwordHash: _pw, resetToken: _rt, ...safe } = updated;
    res.json({ success: true, message: 'User updated', data: safe });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ success: false, message: 'Failed to update user' });
  }
});

apiRouter.get('/roles', requirePermission('users.manage'), async (_req: AuthRequest, res: Response) => {
  try {
    const allRoles = await db.select().from(roles).orderBy(roles.id);
    const allPerms = await db.select().from(permissions).orderBy(permissions.id);
    res.json({ success: true, data: { roles: allRoles, permissions: allPerms } });
  } catch (error) {
    console.error('Roles error:', error);
    res.status(500).json({ success: false, message: 'Failed to load roles' });
  }
});

apiRouter.put('/roles/:id', requirePermission('users.manage'), async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const perms = Array.isArray(req.body?.permissions) ? req.body.permissions : [];
    const [updated] = await db
      .update(roles)
      .set({ permissions: perms, updatedAt: new Date() })
      .where(eq(roles.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Role not found' });
    }
    await logAudit(req, 'ROLE_PERMISSIONS_UPDATED', 'role', updated.slug, `Updated permissions for role ${updated.name}`);
    res.json({ success: true, message: 'Role permissions updated', data: updated });
  } catch (error) {
    console.error('Update role error:', error);
    res.status(500).json({ success: false, message: 'Failed to update role permissions' });
  }
});

// ---------- COMPANY SETTINGS & PAYMENT METHODS ----------

apiRouter.get('/settings', async (_req: AuthRequest, res: Response) => {
  try {
    const [settings] = await db.select().from(companySettings).limit(1);
    const methods = await db.select().from(paymentMethods).orderBy(paymentMethods.sortOrder);
    res.json({ success: true, data: { settings, paymentMethods: methods } });
  } catch (error) {
    console.error('Settings error:', error);
    res.status(500).json({ success: false, message: 'Failed to load company settings' });
  }
});

apiRouter.put('/settings', requirePermission('settings.manage'), async (req: AuthRequest, res: Response) => {
  try {
    const body = req.body || {};
    const [existing] = await db.select().from(companySettings).limit(1);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Company settings record not found' });
    }

    // Only Super Admin can replace the official eDrafter logo
    let logoUrl = existing.logoUrl;
    if (body.logoUrl && body.logoUrl !== existing.logoUrl) {
      if (req.authUser?.roleSlug === 'super_admin') {
        logoUrl = String(body.logoUrl).trim();
      } else {
        return res.status(403).json({
          success: false,
          message: 'Only Super Admin can change the official company logo.',
        });
      }
    }

    const [updated] = await db
      .update(companySettings)
      .set({
        companyName: String(body.companyName ?? existing.companyName).trim(),
        parentCompany: String(body.parentCompany ?? existing.parentCompany).trim(),
        logoUrl,
        registeredAddress: String(body.registeredAddress ?? existing.registeredAddress).trim(),
        officeAddress: String(body.officeAddress ?? existing.officeAddress).trim(),
        phone: String(body.phone ?? existing.phone).trim(),
        email: String(body.email ?? existing.email).trim(),
        website: String(body.website ?? existing.website).trim(),
        gstin: String(body.gstin ?? existing.gstin).trim().toUpperCase(),
        pan: String(body.pan ?? existing.pan).trim().toUpperCase(),
        receiptPrefix: String(body.receiptPrefix ?? existing.receiptPrefix).trim(),
        financialYear: String(body.financialYear ?? existing.financialYear).trim(),
        currency: String(body.currency ?? existing.currency).trim(),
        defaultCgstRate: Number(body.defaultCgstRate ?? existing.defaultCgstRate).toFixed(2),
        defaultSgstRate: Number(body.defaultSgstRate ?? existing.defaultSgstRate).toFixed(2),
        defaultIgstRate: Number(body.defaultIgstRate ?? existing.defaultIgstRate).toFixed(2),
        authorizedSignatory: String(body.authorizedSignatory ?? existing.authorizedSignatory).trim(),
        footerText: String(body.footerText ?? existing.footerText).trim(),
        termsAndConditions: Array.isArray(body.termsAndConditions)
          ? body.termsAndConditions
          : existing.termsAndConditions,
        serviceCategories: Array.isArray(body.serviceCategories)
          ? body.serviceCategories
          : existing.serviceCategories,
        showWatermark: body.showWatermark ?? existing.showWatermark,
        updatedAt: new Date(),
      })
      .where(eq(companySettings.id, existing.id))
      .returning();

    await logAudit(req, 'COMPANY_SETTINGS_UPDATED', 'settings', existing.id, 'Updated company, tax, and receipt settings');
    res.json({ success: true, message: 'Company settings saved', data: updated });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ success: false, message: 'Failed to save company settings' });
  }
});

apiRouter.put('/payment-methods/:id', requirePermission('settings.manage'), async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const [updated] = await db
      .update(paymentMethods)
      .set({ isActive: Boolean(req.body?.isActive), updatedAt: new Date() })
      .where(eq(paymentMethods.id, id))
      .returning();
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Payment method not found' });
    }
    await logAudit(req, 'PAYMENT_METHOD_TOGGLED', 'payment_method', updated.code, `${updated.isActive ? 'Enabled' : 'Disabled'} payment mode ${updated.name}`);
    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Toggle payment method error:', error);
    res.status(500).json({ success: false, message: 'Failed to update payment method' });
  }
});

// ---------- AUDIT LOGS & BACKUP ----------

apiRouter.get('/audit-logs', requirePermission('audit.view'), async (req: AuthRequest, res: Response) => {
  try {
    const entityType = String(req.query.entityType || '');
    const rows = entityType && entityType !== 'All'
      ? await db
          .select()
          .from(auditLogs)
          .where(eq(auditLogs.entityType, entityType))
          .orderBy(desc(auditLogs.id))
          .limit(150)
      : await db.select().from(auditLogs).orderBy(desc(auditLogs.id)).limit(150);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Audit logs error:', error);
    res.status(500).json({ success: false, message: 'Failed to load audit logs' });
  }
});

apiRouter.get('/backup', requirePermission('users.manage'), async (req: AuthRequest, res: Response) => {
  try {
    const snapshot = {
      exportedAt: new Date().toISOString(),
      exportedBy: req.authUser?.email,
      customers: await db.select().from(customers),
      orders: await db.select().from(orders),
      payments: await db.select().from(payments),
      receipts: await db.select().from(receipts),
      receiptItems: await db.select().from(receiptItems),
      refunds: await db.select().from(refunds),
      services: await db.select().from(services),
      companySettings: await db.select().from(companySettings),
    };
    await logAudit(req, 'DATABASE_BACKUP_EXPORTED', 'system', 'backup', 'Exported relational database backup snapshot');
    res.setHeader('Content-Disposition', `attachment; filename="edrafter-backup-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json(snapshot);
  } catch (error) {
    console.error('Backup error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate backup' });
  }
});
