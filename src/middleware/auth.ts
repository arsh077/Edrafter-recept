import { NextFunction, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { adminAuth } from '../lib/firebase-admin.ts';
import { db } from '../db/index.ts';
import { ensureSeeded } from '../db/seed.ts';
import { loginHistory, roles, users } from '../db/schema.ts';
import { verifyStaffToken } from '../utils/security.ts';

export interface AuthenticatedUser {
  id: number;
  uid: string;
  email: string;
  fullName: string;
  designation: string;
  roleSlug: string;
  roleName: string;
  permissions: string[];
}

export interface AuthRequest extends Request {
  authUser?: AuthenticatedUser;
}

async function resolveOrSyncUser(
  uid: string,
  email: string,
  displayName?: string,
  authMethod: 'google_oauth' | 'password' = 'google_oauth',
  req?: Request
): Promise<AuthenticatedUser | null> {
  await ensureSeeded();

  const existingByUid = await db.select().from(users).where(eq(users.uid, uid));
  const existingByEmail = existingByUid.length
    ? existingByUid
    : await db.select().from(users).where(eq(users.email, email.toLowerCase()));

  let userRow = existingByEmail[0];

  if (!userRow) {
    // New Firebase Google user: assign Super Admin if no Google user has claimed it or Administrator by default
    const [superAdminRole] = await db.select().from(roles).where(eq(roles.slug, 'super_admin'));
    const [inserted] = await db
      .insert(users)
      .values({
        uid,
        email: email.toLowerCase(),
        fullName: displayName || email.split('@')[0],
        designation: 'Portal Administrator',
        roleId: superAdminRole?.id ?? null,
        roleSlug: superAdminRole?.slug ?? 'super_admin',
        isActive: true,
        lastLoginAt: new Date(),
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email: email.toLowerCase(),
          lastLoginAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning();
    userRow = inserted;

    if (req) {
      await db.insert(loginHistory).values({
        userId: userRow.id,
        email: userRow.email,
        authMethod,
        status: 'success',
        ipAddress: req.ip || '',
        userAgent: req.get('user-agent') || '',
      });
    }
  } else if (existingByUid.length === 0 && userRow.uid !== uid) {
    // Link existing email user to Firebase UID on Google sign-in
    const [updated] = await db
      .update(users)
      .set({ uid, lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, userRow.id))
      .returning();
    userRow = updated;
  }

  if (!userRow.isActive) {
    return null;
  }

  const [roleRow] = userRow.roleId
    ? await db.select().from(roles).where(eq(roles.id, userRow.roleId))
    : await db.select().from(roles).where(eq(roles.slug, userRow.roleSlug));

  return {
    id: userRow.id,
    uid: userRow.uid,
    email: userRow.email,
    fullName: userRow.fullName,
    designation: userRow.designation,
    roleSlug: roleRow?.slug || userRow.roleSlug,
    roleName: roleRow?.name || 'Staff Member',
    permissions: Array.isArray(roleRow?.permissions) ? roleRow.permissions : [],
  };
}

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    const queryToken = typeof req.query.token === 'string' ? req.query.token : '';
    const rawToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : queryToken;

    if (!rawToken) {
      return res.status(401).json({ success: false, message: 'Unauthorized: Missing session token' });
    }

    // 1. Check signed Staff Session Token
    if (rawToken.startsWith('staff.')) {
      const payload = verifyStaffToken(rawToken);
      if (!payload) {
        return res.status(401).json({ success: false, message: 'Unauthorized: Invalid or expired staff token' });
      }
      const user = await resolveOrSyncUser(payload.uid, payload.email, undefined, 'password');
      if (!user) {
        return res.status(403).json({ success: false, message: 'Account disabled or inactive' });
      }
      req.authUser = user;
      return next();
    }

    // 2. Verify Firebase ID Token
    const decoded = await adminAuth.verifyIdToken(rawToken);
    const user = await resolveOrSyncUser(
      decoded.uid,
      decoded.email || `${decoded.uid}@edrafter.in`,
      decoded.name,
      'google_oauth',
      req
    );
    if (!user) {
      return res.status(403).json({ success: false, message: 'Account disabled or inactive' });
    }
    req.authUser = user;
    return next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(401).json({ success: false, message: 'Unauthorized: Invalid token' });
  }
};

export const requirePermission = (permissionCode: string) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const user = req.authUser;
    if (!user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    if (user.roleSlug === 'super_admin' || user.permissions.includes(permissionCode)) {
      return next();
    }
    return res.status(403).json({
      success: false,
      message: `Forbidden: Missing permission (${permissionCode})`,
    });
  };
};
