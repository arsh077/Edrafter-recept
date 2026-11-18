import React, { useCallback, useEffect, useState } from 'react';
import { Download, Plus, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { AuditLogEntry, CompanySettings, ServiceItem } from '../types/portal';
import { formatInr } from '../utils/finance';
import { BRAND_LOGO_URL, ErrorBanner, ModalShell, StatusTag, TableSkeleton } from './UiPrimitives';

interface StaffUser {
  id: number;
  uid: string;
  email: string;
  fullName: string;
  phone: string;
  designation: string;
  roleSlug: string;
  roleName: string;
  isActive: boolean;
  lastLoginAt: string | null;
}

interface RoleDef {
  id: number;
  name: string;
  slug: string;
  description: string;
  permissions: string[];
}

interface PermDef {
  id: number;
  code: string;
  name: string;
  module: string;
}

interface LoginLog {
  id: number;
  email: string;
  authMethod: string;
  status: string;
  ipAddress: string;
  createdAt: string;
}

export function UsersAndRolesView() {
  const { apiFetch } = useAuth();
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [roles, setRoles] = useState<RoleDef[]>([]);
  const [perms, setPerms] = useState<PermDef[]>([]);
  const [loginLogs, setLoginLogs] = useState<LoginLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showAddUser, setShowAddUser] = useState(false);
  const [uForm, setUForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    designation: 'Legal Executive',
    roleSlug: 'staff_member',
    password: '',
  });
  const [saving, setSaving] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [uRes, rRes, lRes] = await Promise.all([
        apiFetch<{ data: StaffUser[] }>('/api/users'),
        apiFetch<{ data: { roles: RoleDef[]; permissions: PermDef[] } }>('/api/roles'),
        apiFetch<{ data: LoginLog[] }>('/api/auth/login-history'),
      ]);
      setUsers(uRes.data);
      setRoles(rRes.data.roles);
      setPerms(rRes.data.permissions);
      setLoginLogs(lRes.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load users and roles');
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiFetch('/api/users', { method: 'POST', body: JSON.stringify(uForm) });
      setShowAddUser(false);
      setUForm({
        fullName: '',
        email: '',
        phone: '',
        designation: 'Legal Executive',
        roleSlug: 'staff_member',
        password: '',
      });
      await loadAll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setSaving(false);
    }
  };

  const toggleRolePermission = async (role: RoleDef, permCode: string) => {
    if (role.slug === 'super_admin') return;
    const next = role.permissions.includes(permCode)
      ? role.permissions.filter((p) => p !== permCode)
      : [...role.permissions, permCode];
    try {
      await apiFetch(`/api/roles/${role.id}`, {
        method: 'PUT',
        body: JSON.stringify({ permissions: next }),
      });
      await loadAll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update role permission');
    }
  };

  const toggleUserStatus = async (u: StaffUser) => {
    try {
      await apiFetch(`/api/users/${u.id}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: !u.isActive }),
      });
      await loadAll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update user status');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#25212B]">User Management &amp; Role Permissions</h1>
          <p className="text-xs text-[#777481] mt-0.5">
            Manage staff credentials, configurable RBAC permission matrices, and login activity history
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddUser(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#310D35] rounded-lg hover:bg-[#46164C]"
        >
          <Plus className="w-4 h-4" />
          <span>Add Staff User</span>
        </button>
      </div>

      {error && <ErrorBanner message={error} onRetry={loadAll} />}

      {loading ? (
        <TableSkeleton rows={4} cols={5} />
      ) : (
        <>
          {/* Staff Table */}
          <div className="bg-white border border-[#E8E6EC] rounded-lg overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#E8E6EC]">
              <h2 className="text-sm font-semibold text-[#25212B]">Staff Accounts</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-[#F7F8FA] text-[#777481] border-b border-[#E8E6EC]">
                  <tr>
                    <th className="py-2.5 px-4 text-left font-medium">Name &amp; Designation</th>
                    <th className="py-2.5 px-4 text-left font-medium">Email</th>
                    <th className="py-2.5 px-4 text-left font-medium">Role</th>
                    <th className="py-2.5 px-4 text-left font-medium">Status</th>
                    <th className="py-2.5 px-4 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8E6EC]">
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td className="py-2.5 px-4">
                        <div className="font-semibold text-[#25212B]">{u.fullName}</div>
                        <div className="text-[11px] text-[#777481]">{u.designation}</div>
                      </td>
                      <td className="py-2.5 px-4 font-mono">{u.email}</td>
                      <td className="py-2.5 px-4 font-medium text-[#310D35]">{u.roleName}</td>
                      <td className="py-2.5 px-4">
                        <StatusTag status={u.isActive ? 'Approved' : 'Cancelled'} />
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => toggleUserStatus(u)}
                          className="text-xs font-medium text-[#008C98] hover:underline"
                        >
                          {u.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Configurable Role Permissions Matrix */}
          <div className="bg-white border border-[#E8E6EC] rounded-lg overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#E8E6EC]">
              <h2 className="text-sm font-semibold text-[#25212B]">Configurable Role Permissions</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-[#F7F8FA] text-[#777481] border-b border-[#E8E6EC]">
                  <tr>
                    <th className="py-2.5 px-4 text-left font-medium">Permission</th>
                    {roles.map((r) => (
                      <th key={r.id} className="py-2.5 px-4 text-center font-medium">
                        {r.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8E6EC]">
                  {perms.map((p) => (
                    <tr key={p.id}>
                      <td className="py-2 px-4">
                        <span className="font-medium text-[#25212B]">{p.name}</span>
                        <span className="ml-2 text-[11px] font-mono text-[#777481]">{p.code}</span>
                      </td>
                      {roles.map((r) => {
                        const checked = r.slug === 'super_admin' || r.permissions.includes(p.code);
                        return (
                          <td key={r.id} className="py-2 px-4 text-center">
                            <input
                              type="checkbox"
                              aria-label={`${r.name} — ${p.name}`}
                              checked={checked}
                              disabled={r.slug === 'super_admin'}
                              onChange={() => toggleRolePermission(r, p.code)}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Login Activity History */}
          <div className="bg-white border border-[#E8E6EC] rounded-lg overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#E8E6EC]">
              <h2 className="text-sm font-semibold text-[#25212B]">Login Activity History</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-[#F7F8FA] text-[#777481] border-b border-[#E8E6EC]">
                  <tr>
                    <th className="py-2.5 px-4 text-left font-medium">Email</th>
                    <th className="py-2.5 px-4 text-left font-medium">Method</th>
                    <th className="py-2.5 px-4 text-left font-medium">Status</th>
                    <th className="py-2.5 px-4 text-right font-medium">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8E6EC]">
                  {loginLogs.slice(0, 12).map((l) => (
                    <tr key={l.id}>
                      <td className="py-2 px-4 font-mono">{l.email}</td>
                      <td className="py-2 px-4">{l.authMethod}</td>
                      <td className="py-2 px-4"><StatusTag status={l.status === 'success' ? 'Verified' : 'Failed'} /></td>
                      <td className="py-2 px-4 text-right font-mono text-[#777481]">
                        {new Date(l.createdAt).toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {showAddUser && (
        <ModalShell title="Add Staff User" onClose={() => setShowAddUser(false)} maxWidth="max-w-lg">
          <form onSubmit={handleAddUser} className="space-y-4">
            <div>
              <label htmlFor="usr-name" className="block text-xs font-medium mb-1">Full Name *</label>
              <input
                id="usr-name"
                type="text"
                required
                value={uForm.fullName}
                onChange={(e) => setUForm((f) => ({ ...f, fullName: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-[#E8E6EC] rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="usr-email" className="block text-xs font-medium mb-1">Email *</label>
              <input
                id="usr-email"
                type="email"
                required
                value={uForm.email}
                onChange={(e) => setUForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-[#E8E6EC] rounded-lg"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="usr-role" className="block text-xs font-medium mb-1">Role</label>
                <select
                  id="usr-role"
                  value={uForm.roleSlug}
                  onChange={(e) => setUForm((f) => ({ ...f, roleSlug: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-[#E8E6EC] rounded-lg"
                >
                  {roles.map((r) => (
                    <option key={r.slug} value={r.slug}>{r.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="usr-pass" className="block text-xs font-medium mb-1">Initial Password *</label>
                <input
                  id="usr-pass"
                  type="password"
                  required
                  minLength={6}
                  value={uForm.password}
                  onChange={(e) => setUForm((f) => ({ ...f, password: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-[#E8E6EC] rounded-lg"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-[#E8E6EC]">
              <button type="button" onClick={() => setShowAddUser(false)} className="px-4 py-2 text-xs border border-[#E8E6EC] rounded-lg">Cancel</button>
              <button type="submit" disabled={saving} className="px-4 py-2 text-xs font-semibold text-white bg-[#310D35] rounded-lg">
                {saving ? 'Creating...' : 'Create Staff Account'}
              </button>
            </div>
          </form>
        </ModalShell>
      )}
    </div>
  );
}

export function ServicesManagementView() {
  const { apiFetch, hasPermission } = useAuth();
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [sForm, setSForm] = useState({
    name: '',
    category: 'Rent Agreement',
    defaultServiceFee: 1500,
    defaultGovernmentFee: 0,
    defaultStampDuty: 100,
    defaultNotaryFee: 200,
    defaultCourierCharge: 100,
    gstApplicable: true,
    gstRate: 18,
    description: '',
  });

  const loadServices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ data: ServiceItem[] }>('/api/services');
      setServices(res.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load services');
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    void loadServices();
  }, [loadServices]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/services', { method: 'POST', body: JSON.stringify(sForm) });
      setShowModal(false);
      await loadServices();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create service');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#25212B]">Legal Services Catalog</h1>
          <p className="text-xs text-[#777481] mt-0.5">
            Configure service templates, default stamp duties, government fees, and GST applicability
          </p>
        </div>
        {hasPermission('settings.manage') && (
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#310D35] rounded-lg hover:bg-[#46164C]"
          >
            <Plus className="w-4 h-4" />
            <span>Add Service</span>
          </button>
        )}
      </div>

      {error && <ErrorBanner message={error} onRetry={loadServices} />}

      {loading ? (
        <TableSkeleton rows={6} cols={6} />
      ) : (
        <div className="bg-white border border-[#E8E6EC] rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#F7F8FA] text-[#777481] border-b border-[#E8E6EC]">
                <tr>
                  <th className="py-3 px-4 text-left font-medium">Service Name</th>
                  <th className="py-3 px-4 text-left font-medium">Category</th>
                  <th className="py-3 px-4 text-right font-medium">Service Fee</th>
                  <th className="py-3 px-4 text-right font-medium">Govt / Stamp</th>
                  <th className="py-3 px-4 text-right font-medium">Notary / Courier</th>
                  <th className="py-3 px-4 text-right font-medium">GST Rule</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E6EC]">
                {services.map((s) => (
                  <tr key={s.id} className="hover:bg-[#F7F8FA]/80">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-[#25212B]">{s.name}</div>
                      <div className="text-[11px] text-[#777481] truncate max-w-md">{s.description}</div>
                    </td>
                    <td className="py-3 px-4 text-[#008C98] font-medium">{s.category}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">{formatInr(s.defaultServiceFee)}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      {formatInr(Number(s.defaultGovernmentFee) + Number(s.defaultStampDuty))}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      {formatInr(Number(s.defaultNotaryFee) + Number(s.defaultCourierCharge))}
                    </td>
                    <td className="py-3 px-4 text-right font-mono">
                      {s.gstApplicable ? `${s.gstRate}%` : 'Exempt'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showModal && (
        <ModalShell title="Add Legal Service Template" onClose={() => setShowModal(false)}>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="svc-name" className="block text-xs font-medium mb-1">Service Name *</label>
                <input
                  id="svc-name"
                  type="text"
                  required
                  value={sForm.name}
                  onChange={(e) => setSForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-[#E8E6EC] rounded-lg"
                />
              </div>
              <div>
                <label htmlFor="svc-cat" className="block text-xs font-medium mb-1">Category</label>
                <input
                  id="svc-cat"
                  type="text"
                  required
                  value={sForm.category}
                  onChange={(e) => setSForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-[#E8E6EC] rounded-lg"
                />
              </div>
              <div>
                <label htmlFor="svc-fee" className="block text-xs font-medium mb-1">Default Service Fee</label>
                <input
                  id="svc-fee"
                  type="number"
                  value={sForm.defaultServiceFee}
                  onChange={(e) => setSForm((f) => ({ ...f, defaultServiceFee: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 text-sm font-mono border border-[#E8E6EC] rounded-lg"
                />
              </div>
              <div>
                <label htmlFor="svc-stamp" className="block text-xs font-medium mb-1">Default Stamp Duty</label>
                <input
                  id="svc-stamp"
                  type="number"
                  value={sForm.defaultStampDuty}
                  onChange={(e) => setSForm((f) => ({ ...f, defaultStampDuty: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 text-sm font-mono border border-[#E8E6EC] rounded-lg"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-[#E8E6EC]">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-xs border border-[#E8E6EC] rounded-lg">Cancel</button>
              <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-[#310D35] rounded-lg">Save Service</button>
            </div>
          </form>
        </ModalShell>
      )}
    </div>
  );
}

export function CompanySettingsView() {
  const { apiFetch, user, refreshProfile, token } = useAuth();
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [methods, setMethods] = useState<Array<{ id: number; name: string; code: string; isActive: boolean }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{
        data: {
          settings: CompanySettings;
          paymentMethods: Array<{ id: number; name: string; code: string; isActive: boolean }>;
        };
      }>('/api/settings');
      setSettings(res.data.settings);
      setMethods(res.data.paymentMethods);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load settings');
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setMessage('');
    setError('');
    try {
      await apiFetch('/api/settings', { method: 'PUT', body: JSON.stringify(settings) });
      setMessage('Company, tax, and receipt configuration saved.');
      await refreshProfile();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const toggleMethod = async (id: number, current: boolean) => {
    try {
      await apiFetch(`/api/payment-methods/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: !current }),
      });
      await loadSettings();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to toggle method');
    }
  };

  if (loading || !settings) {
    return <TableSkeleton rows={6} cols={2} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#25212B]">Company &amp; Receipt Settings</h1>
          <p className="text-xs text-[#777481] mt-0.5">
            Configure corporate details, GSTIN, receipt prefix, terms &amp; conditions, and backups
          </p>
        </div>
        {user?.roleSlug === 'super_admin' && (
          <a
            href={`/api/backup?token=${encodeURIComponent(token || '')}`}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#310D35] bg-white border border-[#E8E6EC] rounded-lg hover:bg-[#F7F8FA]"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export JSON Backup</span>
          </a>
        )}
      </div>

      {error && <ErrorBanner message={error} />}
      {message && (
        <div className="p-3 bg-[#F1F8E9] border border-[#CBE5AD] rounded-lg text-xs text-[#2F5E0E]">
          {message}
        </div>
      )}

      <form onSubmit={handleSave} className="bg-white border border-[#E8E6EC] rounded-lg p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#E8E6EC]">
          <div className="flex items-center gap-4">
            <img
              src={settings.logoUrl || BRAND_LOGO_URL}
              alt="Official eDrafter Logo"
              referrerPolicy="no-referrer"
              className="h-11 w-auto object-contain"
            />
            <div className="text-xs text-[#777481]">
              <p className="font-semibold text-[#25212B]">Official Portal Brand Asset</p>
              <p>Protected: replaceable only by Super Admin.</p>
            </div>
          </div>
          {user?.roleSlug === 'super_admin' && (
            <div className="flex items-center gap-1.5 text-xs text-[#008C98]">
              <ShieldCheck className="w-4 h-4" />
              <span>Super Admin Verified</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label htmlFor="set-cname" className="block text-xs font-medium mb-1">Company Name</label>
            <input
              id="set-cname"
              type="text"
              value={settings.companyName}
              onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-[#E8E6EC] rounded-lg"
            />
          </div>
          <div>
            <label htmlFor="set-pname" className="block text-xs font-medium mb-1">Parent Entity</label>
            <input
              id="set-pname"
              type="text"
              value={settings.parentCompany}
              onChange={(e) => setSettings({ ...settings, parentCompany: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-[#E8E6EC] rounded-lg"
            />
          </div>
          <div>
            <label htmlFor="set-phone" className="block text-xs font-medium mb-1">Phone</label>
            <input
              id="set-phone"
              type="text"
              value={settings.phone}
              onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
              className="w-full px-3 py-2 text-sm font-mono border border-[#E8E6EC] rounded-lg"
            />
          </div>
          <div>
            <label htmlFor="set-email" className="block text-xs font-medium mb-1">Email</label>
            <input
              id="set-email"
              type="email"
              value={settings.email}
              onChange={(e) => setSettings({ ...settings, email: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-[#E8E6EC] rounded-lg"
            />
          </div>
          <div>
            <label htmlFor="set-gstin" className="block text-xs font-medium mb-1">GSTIN</label>
            <input
              id="set-gstin"
              type="text"
              value={settings.gstin}
              onChange={(e) => setSettings({ ...settings, gstin: e.target.value.toUpperCase() })}
              className="w-full px-3 py-2 text-sm font-mono border border-[#E8E6EC] rounded-lg"
            />
          </div>
          <div>
            <label htmlFor="set-pan" className="block text-xs font-medium mb-1">PAN</label>
            <input
              id="set-pan"
              type="text"
              value={settings.pan}
              onChange={(e) => setSettings({ ...settings, pan: e.target.value.toUpperCase() })}
              className="w-full px-3 py-2 text-sm font-mono border border-[#E8E6EC] rounded-lg"
            />
          </div>
          <div>
            <label htmlFor="set-prefix" className="block text-xs font-medium mb-1">Receipt Prefix</label>
            <input
              id="set-prefix"
              type="text"
              value={settings.receiptPrefix}
              onChange={(e) => setSettings({ ...settings, receiptPrefix: e.target.value })}
              className="w-full px-3 py-2 text-sm font-mono border border-[#E8E6EC] rounded-lg"
            />
          </div>
          <div>
            <label htmlFor="set-fy" className="block text-xs font-medium mb-1">Financial Year</label>
            <input
              id="set-fy"
              type="text"
              value={settings.financialYear}
              onChange={(e) => setSettings({ ...settings, financialYear: e.target.value })}
              className="w-full px-3 py-2 text-sm font-mono border border-[#E8E6EC] rounded-lg"
            />
          </div>
          <div>
            <label htmlFor="set-sig" className="block text-xs font-medium mb-1">Authorized Signatory</label>
            <input
              id="set-sig"
              type="text"
              value={settings.authorizedSignatory}
              onChange={(e) => setSettings({ ...settings, authorizedSignatory: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-[#E8E6EC] rounded-lg"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="set-office" className="block text-xs font-medium mb-1">Office Address</label>
            <input
              id="set-office"
              type="text"
              value={settings.officeAddress}
              onChange={(e) => setSettings({ ...settings, officeAddress: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-[#E8E6EC] rounded-lg"
            />
          </div>
          <div>
            <label htmlFor="set-footer" className="block text-xs font-medium mb-1">Receipt Footer Message</label>
            <input
              id="set-footer"
              type="text"
              value={settings.footerText}
              onChange={(e) => setSettings({ ...settings, footerText: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-[#E8E6EC] rounded-lg"
            />
          </div>
        </div>

        <div>
          <label htmlFor="set-terms" className="block text-xs font-medium mb-1">
            Receipt Terms &amp; Conditions (one per line)
          </label>
          <textarea
            id="set-terms"
            rows={4}
            value={(settings.termsAndConditions || []).join('\n')}
            onChange={(e) =>
              setSettings({
                ...settings,
                termsAndConditions: e.target.value.split('\n').filter((line) => line.trim()),
              })
            }
            className="w-full px-3 py-2 text-xs border border-[#E8E6EC] rounded-lg"
          />
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 text-xs font-semibold text-white bg-[#310D35] rounded-lg hover:bg-[#46164C]"
          >
            {saving ? 'Saving...' : 'Save Company Settings'}
          </button>
        </div>
      </form>

      {/* Active Payment Methods */}
      <div className="bg-white border border-[#E8E6EC] rounded-lg p-5">
        <h2 className="text-sm font-semibold text-[#25212B] mb-3">Enabled Payment Modes</h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {methods.map((m) => (
            <label
              key={m.id}
              className="flex items-center gap-2 p-2.5 border border-[#E8E6EC] rounded-lg text-xs cursor-pointer hover:bg-[#F7F8FA]"
            >
              <input
                type="checkbox"
                checked={m.isActive}
                onChange={() => toggleMethod(m.id, m.isActive)}
              />
              <span className="font-medium">{m.name}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AuditLogsView() {
  const { apiFetch } = useAuth();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [entityFilter, setEntityFilter] = useState('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const qs = entityFilter !== 'All' ? `?entityType=${encodeURIComponent(entityFilter)}` : '';
      const res = await apiFetch<{ data: AuditLogEntry[] }>(`/api/audit-logs${qs}`);
      setLogs(res.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load audit logs');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, entityFilter]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#25212B]">Immutable Audit Logs</h1>
          <p className="text-xs text-[#777481] mt-0.5">
            Complete forensic log of customer edits, order transitions, payment verifications, and receipt revisions
          </p>
        </div>
        <select
          aria-label="Filter audit logs by entity"
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
          className="px-3 py-1.5 text-xs bg-white border border-[#E8E6EC] rounded-lg"
        >
          <option value="All">All Entities</option>
          <option value="customer">Customers</option>
          <option value="order">Orders</option>
          <option value="payment">Payments</option>
          <option value="receipt">Receipts</option>
          <option value="refund">Refunds</option>
          <option value="document">Documents</option>
          <option value="settings">Settings</option>
          <option value="user">Users &amp; Roles</option>
        </select>
      </div>

      {error && <ErrorBanner message={error} onRetry={loadLogs} />}

      {loading ? (
        <TableSkeleton rows={6} cols={4} />
      ) : (
        <div className="bg-white border border-[#E8E6EC] rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#F7F8FA] text-[#777481] border-b border-[#E8E6EC]">
                <tr>
                  <th className="py-3 px-4 text-left font-medium">Timestamp</th>
                  <th className="py-3 px-4 text-left font-medium">Actor</th>
                  <th className="py-3 px-4 text-left font-medium">Action</th>
                  <th className="py-3 px-4 text-left font-medium">Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E6EC]">
                {logs.map((l) => (
                  <tr key={l.id} className="hover:bg-[#F7F8FA]/80">
                    <td className="py-2.5 px-4 font-mono tabular-nums text-[#777481] whitespace-nowrap">
                      {new Date(l.createdAt).toLocaleString('en-IN')}
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="font-medium text-[#25212B]">{l.actorName}</div>
                      <div className="text-[11px] font-mono text-[#777481]">{l.actorEmail}</div>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-[#310D35] whitespace-nowrap">
                      {l.action}
                    </td>
                    <td className="py-2.5 px-4 text-[#25212B]">{l.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
