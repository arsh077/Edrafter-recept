import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Edit3, Plus, ReceiptText, Search, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { Customer, OrderRecord, PaymentRecord, ReceiptRecord } from '../types/portal';
import { formatInr, isValidGstin, isValidIndianMobile, isValidPan } from '../utils/finance';
import { EmptyState, ErrorBanner, ModalShell, StatusTag, TableSkeleton } from './UiPrimitives';

interface CustomerProfileBundle {
  customer: Customer;
  summary: {
    totalBilled: number;
    totalPaid: number;
    outstandingBalance: number;
    orderCount: number;
    receiptCount: number;
  };
  orders: OrderRecord[];
  payments: PaymentRecord[];
  receipts: ReceiptRecord[];
}

export function CustomersView({
  onOpenOrder,
  onPreviewReceipt,
  onCreateOrderForCustomer,
}: {
  onOpenOrder: (orderId: number) => void;
  onPreviewReceipt: (receiptId: number) => void;
  onCreateOrderForCustomer: (customerId: number) => void;
}) {
  const { apiFetch, hasPermission } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedProfile, setSelectedProfile] = useState<CustomerProfileBundle | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [formState, setFormState] = useState({
    fullName: '',
    businessName: '',
    mobileNumber: '',
    email: '',
    billingAddress: '',
    city: '',
    state: '',
    pincode: '',
    gstin: '',
    pan: '',
    notes: '',
  });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const qs = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : '';
      const res = await apiFetch<{ data: Customer[] }>(`/api/customers${qs}`);
      setCustomers(res.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load customers');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, query]);

  useEffect(() => {
    const t = setTimeout(() => {
      void loadCustomers();
    }, 180);
    return () => clearTimeout(t);
  }, [loadCustomers]);

  const openProfile = async (id: number) => {
    setProfileLoading(true);
    try {
      const res = await apiFetch<{ data: CustomerProfileBundle }>(`/api/customers/${id}`);
      setSelectedProfile(res.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load customer profile');
    } finally {
      setProfileLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditingCustomer(null);
    setFormError('');
    setFormState({
      fullName: '',
      businessName: '',
      mobileNumber: '',
      email: '',
      billingAddress: '',
      city: '',
      state: '',
      pincode: '',
      gstin: '',
      pan: '',
      notes: '',
    });
    setShowForm(true);
  };

  const openEditModal = (c: Customer) => {
    setEditingCustomer(c);
    setFormError('');
    setFormState({
      fullName: c.fullName,
      businessName: c.businessName,
      mobileNumber: c.mobileNumber,
      email: c.email,
      billingAddress: c.billingAddress,
      city: c.city,
      state: c.state,
      pincode: c.pincode,
      gstin: c.gstin,
      pan: c.pan,
      notes: c.notes,
    });
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!formState.fullName.trim()) {
      setFormError('Full name is required.');
      return;
    }
    if (!isValidIndianMobile(formState.mobileNumber)) {
      setFormError('Enter a valid 10-digit Indian mobile number.');
      return;
    }
    if (!isValidGstin(formState.gstin)) {
      setFormError('Invalid GSTIN format (15 alphanumeric characters).');
      return;
    }
    if (!isValidPan(formState.pan)) {
      setFormError('Invalid PAN format (e.g., ABCDE1234F).');
      return;
    }

    setSaving(true);
    try {
      if (editingCustomer) {
        await apiFetch(`/api/customers/${editingCustomer.id}`, {
          method: 'PUT',
          body: JSON.stringify(formState),
        });
      } else {
        await apiFetch('/api/customers', {
          method: 'POST',
          body: JSON.stringify(formState),
        });
      }
      setShowForm(false);
      await loadCustomers();
      if (selectedProfile && editingCustomer?.id === selectedProfile.customer.id) {
        await openProfile(editingCustomer.id);
      }
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to save customer');
    } finally {
      setSaving(false);
    }
  };

  if (selectedProfile) {
    const { customer, summary, orders, payments, receipts } = selectedProfile;
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSelectedProfile(null)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-[#E8E6EC] rounded-lg hover:bg-[#F7F8FA]"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>All Customers</span>
            </button>
            <div>
              <h1 className="text-xl font-bold text-[#25212B]">{customer.fullName}</h1>
              <p className="text-xs text-[#777481]">
                {customer.customerCode} · {customer.businessName || 'Individual Client'} · {customer.mobileNumber}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {hasPermission('customers.manage') && (
              <button
                type="button"
                onClick={() => openEditModal(customer)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#25212B] bg-white border border-[#E8E6EC] rounded-lg hover:bg-[#F7F8FA]"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit Profile</span>
              </button>
            )}
            {hasPermission('orders.manage') && (
              <button
                type="button"
                onClick={() => onCreateOrderForCustomer(customer.id)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#310D35] rounded-lg hover:bg-[#46164C]"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Order</span>
              </button>
            )}
          </div>
        </div>

        {/* Summary KPI Strip */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
          <div className="bg-white border border-[#E8E6EC] rounded-lg p-4">
            <p className="text-xs text-[#777481]">Total Orders</p>
            <p className="text-lg font-bold font-mono tabular-nums mt-1">{summary.orderCount}</p>
          </div>
          <div className="bg-white border border-[#E8E6EC] rounded-lg p-4">
            <p className="text-xs text-[#777481]">Total Billed</p>
            <p className="text-lg font-bold font-mono tabular-nums mt-1">{formatInr(summary.totalBilled)}</p>
          </div>
          <div className="bg-white border border-[#E8E6EC] rounded-lg p-4">
            <p className="text-xs text-[#777481]">Total Paid</p>
            <p className="text-lg font-bold font-mono tabular-nums text-[#008C98] mt-1">
              {formatInr(summary.totalPaid)}
            </p>
          </div>
          <div className="bg-white border border-[#E8E6EC] rounded-lg p-4">
            <p className="text-xs text-[#777481]">Outstanding Balance</p>
            <p className="text-lg font-bold font-mono tabular-nums text-[#8A5300] mt-1">
              {formatInr(summary.outstandingBalance)}
            </p>
          </div>
          <div className="bg-white border border-[#E8E6EC] rounded-lg p-4">
            <p className="text-xs text-[#777481]">Issued Receipts</p>
            <p className="text-lg font-bold font-mono tabular-nums text-[#310D35] mt-1">
              {summary.receiptCount}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="bg-white border border-[#E8E6EC] rounded-lg p-5 space-y-3 text-xs">
            <h2 className="text-sm font-semibold text-[#25212B] pb-2 border-b border-[#E8E6EC]">
              Billing &amp; Tax Profile
            </h2>
            <p><span className="text-[#777481]">Email:</span> {customer.email || '—'}</p>
            <p><span className="text-[#777481]">Mobile:</span> <span className="font-mono">{customer.mobileNumber}</span></p>
            <p>
              <span className="text-[#777481]">Billing Address:</span>{' '}
              {customer.billingAddress
                ? `${customer.billingAddress}, ${customer.city}, ${customer.state} ${customer.pincode}`
                : '—'}
            </p>
            <p><span className="text-[#777481]">GSTIN:</span> <span className="font-mono">{customer.gstin || 'Not provided'}</span></p>
            <p><span className="text-[#777481]">PAN:</span> <span className="font-mono">{customer.pan || 'Not provided'}</span></p>
          </div>

          <div className="lg:col-span-2 bg-white border border-[#E8E6EC] rounded-lg overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#E8E6EC]">
              <h2 className="text-sm font-semibold text-[#25212B]">Customer Orders</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-[#F7F8FA] text-[#777481] border-b border-[#E8E6EC]">
                  <tr>
                    <th className="py-2.5 px-4 text-left font-medium">Order</th>
                    <th className="py-2.5 px-4 text-left font-medium">Service</th>
                    <th className="py-2.5 px-4 text-left font-medium">Status</th>
                    <th className="py-2.5 px-4 text-right font-medium">Total</th>
                    <th className="py-2.5 px-4 text-right font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8E6EC]">
                  {orders.map((o) => (
                    <tr key={o.id} className="hover:bg-[#F7F8FA]">
                      <td className="py-2.5 px-4 font-mono">
                        <button
                          type="button"
                          onClick={() => onOpenOrder(o.id)}
                          className="text-[#008C98] font-medium hover:underline"
                        >
                          {o.orderCode}
                        </button>
                      </td>
                      <td className="py-2.5 px-4">{o.serviceName}</td>
                      <td className="py-2.5 px-4"><StatusTag status={o.orderStatus} /></td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums">{formatInr(o.grandTotal)}</td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums">{formatInr(o.remainingBalance)}</td>
                    </tr>
                  ))}
                  {orders.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-[#777481]">No orders yet for this customer.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Receipts & Payments History */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-white border border-[#E8E6EC] rounded-lg overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#E8E6EC]">
              <h2 className="text-sm font-semibold text-[#25212B]">Payment History</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-[#F7F8FA] text-[#777481] border-b border-[#E8E6EC]">
                  <tr>
                    <th className="py-2.5 px-4 text-left font-medium">Code / Date</th>
                    <th className="py-2.5 px-4 text-left font-medium">Mode</th>
                    <th className="py-2.5 px-4 text-left font-medium">Status</th>
                    <th className="py-2.5 px-4 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8E6EC]">
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td className="py-2.5 px-4 font-mono">{p.paymentCode} · {p.paymentDate}</td>
                      <td className="py-2.5 px-4">{p.paymentMode}</td>
                      <td className="py-2.5 px-4"><StatusTag status={p.verificationStatus} /></td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold">
                        {formatInr(p.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white border border-[#E8E6EC] rounded-lg overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#E8E6EC]">
              <h2 className="text-sm font-semibold text-[#25212B]">Customer Receipts</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-[#F7F8FA] text-[#777481] border-b border-[#E8E6EC]">
                  <tr>
                    <th className="py-2.5 px-4 text-left font-medium">Receipt No</th>
                    <th className="py-2.5 px-4 text-left font-medium">Status</th>
                    <th className="py-2.5 px-4 text-right font-medium">Amount</th>
                    <th className="py-2.5 px-4 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8E6EC]">
                  {receipts.map((r) => (
                    <tr key={r.id}>
                      <td className="py-2.5 px-4 font-mono">{r.receiptNumber}</td>
                      <td className="py-2.5 px-4"><StatusTag status={r.status} /></td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold">
                        {formatInr(r.currentPayment)}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => onPreviewReceipt(r.id)}
                          className="inline-flex items-center gap-1 text-[#310D35] font-medium hover:underline"
                        >
                          <ReceiptText className="w-3.5 h-3.5" />
                          <span>View / PDF</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#25212B]">Customers</h1>
          <p className="text-xs text-[#777481] mt-0.5">
            Client directory, GST profiles, order ledgers, and outstanding balance tracking
          </p>
        </div>
        {hasPermission('customers.manage') && (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#310D35] rounded-lg hover:bg-[#46164C] whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add Customer</span>
          </button>
        )}
      </div>

      {/* Search Bar */}
      <div className="bg-white border border-[#E8E6EC] rounded-lg p-3 flex items-center gap-2.5">
        <Search className="w-4 h-4 text-[#777481] shrink-0" />
        <input
          type="search"
          aria-label="Search customers"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by customer ID, full name, business name, mobile number, or email..."
          className="w-full text-sm bg-transparent focus:outline-none"
        />
      </div>

      {error && <ErrorBanner message={error} onRetry={loadCustomers} />}

      {loading || profileLoading ? (
        <TableSkeleton rows={6} cols={6} />
      ) : customers.length === 0 ? (
        <EmptyState
          title="No matching customers found"
          description="Add a new customer profile to begin creating legal documentation orders and payment receipts."
          actionLabel={hasPermission('customers.manage') ? 'Add Customer' : undefined}
          onAction={hasPermission('customers.manage') ? openCreateModal : undefined}
        />
      ) : (
        <div className="bg-white border border-[#E8E6EC] rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#F7F8FA] text-[#777481] border-b border-[#E8E6EC]">
                <tr>
                  <th className="py-3 px-4 text-left font-medium">Customer ID</th>
                  <th className="py-3 px-4 text-left font-medium">Name &amp; Business</th>
                  <th className="py-3 px-4 text-left font-medium">Contact</th>
                  <th className="py-3 px-4 text-left font-medium">City / State</th>
                  <th className="py-3 px-4 text-right font-medium">Total Paid</th>
                  <th className="py-3 px-4 text-right font-medium">Outstanding</th>
                  <th className="py-3 px-4 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E6EC]">
                {customers.map((c) => (
                  <tr key={c.id} className="hover:bg-[#F7F8FA]/80">
                    <td className="py-3 px-4 font-mono font-medium text-[#310D35] whitespace-nowrap">
                      {c.customerCode}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-[#25212B]">{c.fullName}</div>
                      {c.businessName && (
                        <div className="text-[11px] text-[#777481]">{c.businessName}</div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-mono text-[#25212B]">{c.mobileNumber}</div>
                      {c.email && <div className="text-[11px] text-[#777481]">{c.email}</div>}
                    </td>
                    <td className="py-3 px-4 text-[#777481]">
                      {[c.city, c.state].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-[#008C98] font-medium">
                      {formatInr(c.totalPaid || 0)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">
                      {formatInr(c.outstandingBalance || 0)}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => openProfile(c.id)}
                          aria-label={`View profile for ${c.fullName}`}
                          className="inline-flex items-center gap-1 text-[#310D35] font-medium hover:underline"
                        >
                          <User className="w-3.5 h-3.5" />
                          <span>Profile</span>
                        </button>
                        {hasPermission('customers.manage') && (
                          <button
                            type="button"
                            onClick={() => openEditModal(c)}
                            aria-label={`Edit ${c.fullName}`}
                            className="text-[#008C98] font-medium hover:underline"
                          >
                            Edit
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showForm && (
        <ModalShell
          title={editingCustomer ? `Edit Customer (${editingCustomer.customerCode})` : 'Add New Customer'}
          subtitle="Duplicate mobile numbers or email addresses are automatically prevented."
          onClose={() => setShowForm(false)}
        >
          <form onSubmit={handleSave} className="space-y-4">
            {formError && <ErrorBanner message={formError} />}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="cust-name" className="block text-xs font-medium text-[#25212B] mb-1">
                  Full Name *
                </label>
                <input
                  id="cust-name"
                  type="text"
                  required
                  value={formState.fullName}
                  onChange={(e) => setFormState((s) => ({ ...s, fullName: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-[#E8E6EC] rounded-lg"
                />
              </div>
              <div>
                <label htmlFor="cust-biz" className="block text-xs font-medium text-[#25212B] mb-1">
                  Business Name
                </label>
                <input
                  id="cust-biz"
                  type="text"
                  value={formState.businessName}
                  onChange={(e) => setFormState((s) => ({ ...s, businessName: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-[#E8E6EC] rounded-lg"
                />
              </div>
              <div>
                <label htmlFor="cust-mobile" className="block text-xs font-medium text-[#25212B] mb-1">
                  Mobile Number (10 digits) *
                </label>
                <input
                  id="cust-mobile"
                  type="tel"
                  required
                  value={formState.mobileNumber}
                  onChange={(e) => setFormState((s) => ({ ...s, mobileNumber: e.target.value }))}
                  placeholder="9876543210"
                  className="w-full px-3 py-2 text-sm font-mono border border-[#E8E6EC] rounded-lg"
                />
              </div>
              <div>
                <label htmlFor="cust-email" className="block text-xs font-medium text-[#25212B] mb-1">
                  Email Address
                </label>
                <input
                  id="cust-email"
                  type="email"
                  value={formState.email}
                  onChange={(e) => setFormState((s) => ({ ...s, email: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-[#E8E6EC] rounded-lg"
                />
              </div>
            </div>

            <div>
              <label htmlFor="cust-addr" className="block text-xs font-medium text-[#25212B] mb-1">
                Billing Address
              </label>
              <input
                id="cust-addr"
                type="text"
                value={formState.billingAddress}
                onChange={(e) => setFormState((s) => ({ ...s, billingAddress: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-[#E8E6EC] rounded-lg"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="cust-city" className="block text-xs font-medium text-[#25212B] mb-1">
                  City
                </label>
                <input
                  id="cust-city"
                  type="text"
                  value={formState.city}
                  onChange={(e) => setFormState((s) => ({ ...s, city: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-[#E8E6EC] rounded-lg"
                />
              </div>
              <div>
                <label htmlFor="cust-state" className="block text-xs font-medium text-[#25212B] mb-1">
                  State
                </label>
                <input
                  id="cust-state"
                  type="text"
                  value={formState.state}
                  onChange={(e) => setFormState((s) => ({ ...s, state: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-[#E8E6EC] rounded-lg"
                />
              </div>
              <div>
                <label htmlFor="cust-pin" className="block text-xs font-medium text-[#25212B] mb-1">
                  PIN Code
                </label>
                <input
                  id="cust-pin"
                  type="text"
                  value={formState.pincode}
                  onChange={(e) => setFormState((s) => ({ ...s, pincode: e.target.value }))}
                  className="w-full px-3 py-2 text-sm font-mono border border-[#E8E6EC] rounded-lg"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="cust-gstin" className="block text-xs font-medium text-[#25212B] mb-1">
                  GSTIN (optional)
                </label>
                <input
                  id="cust-gstin"
                  type="text"
                  value={formState.gstin}
                  onChange={(e) => setFormState((s) => ({ ...s, gstin: e.target.value.toUpperCase() }))}
                  placeholder="07AABCE4512F1Z9"
                  className="w-full px-3 py-2 text-sm font-mono border border-[#E8E6EC] rounded-lg"
                />
              </div>
              <div>
                <label htmlFor="cust-pan" className="block text-xs font-medium text-[#25212B] mb-1">
                  PAN (optional)
                </label>
                <input
                  id="cust-pan"
                  type="text"
                  value={formState.pan}
                  onChange={(e) => setFormState((s) => ({ ...s, pan: e.target.value.toUpperCase() }))}
                  placeholder="AABCE4512F"
                  className="w-full px-3 py-2 text-sm font-mono border border-[#E8E6EC] rounded-lg"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[#E8E6EC]">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-xs font-medium text-[#25212B] border border-[#E8E6EC] rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 text-xs font-semibold text-white bg-[#310D35] rounded-lg hover:bg-[#46164C] disabled:opacity-60"
              >
                {saving ? 'Saving...' : editingCustomer ? 'Save Changes' : 'Create Customer'}
              </button>
            </div>
          </form>
        </ModalShell>
      )}
    </div>
  );
}
