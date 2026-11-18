import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CreditCard,
  Download,
  Eye,
  FileUp,
  Plus,
  ReceiptText,
  Search,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type {
  AuditLogEntry,
  Customer,
  DocumentRecord,
  OrderRecord,
  PaymentRecord,
  ReceiptRecord,
  RefundRecord,
  ServiceItem,
} from '../types/portal';
import { calculateOrderFinancials, formatInr } from '../utils/finance';
import { EmptyState, ErrorBanner, ModalShell, StatusTag, TableSkeleton } from './UiPrimitives';

const SERVICE_CATEGORIES = [
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
];

const ORDER_STATUSES = [
  'New Order',
  'Order Received',
  'Awaiting Payment',
  'Payment Confirmed',
  'Draft Preparation',
  'Awaiting Customer Approval',
  'Approved',
  'Processing',
  'Completed',
  'Dispatched',
  'Delivered',
  'Cancelled',
];

interface OrderDetailBundle {
  order: OrderRecord;
  customer: Customer;
  payments: PaymentRecord[];
  receipts: ReceiptRecord[];
  documents: DocumentRecord[];
  refunds: RefundRecord[];
  auditLogs: AuditLogEntry[];
}

export function OrdersView({
  initialOrderId,
  initialCreateCustomerId,
  openCreateInitially,
  onClearInitialTriggers,
  onPreviewReceipt,
  onRecordPaymentForOrder,
}: {
  initialOrderId?: number | null;
  initialCreateCustomerId?: number | null;
  openCreateInitially?: boolean;
  onClearInitialTriggers?: () => void;
  onPreviewReceipt: (receiptId: number) => void;
  onRecordPaymentForOrder: (orderId: number) => void;
}) {
  const { apiFetch, hasPermission, user, token } = useAuth();
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');

  // Detail View
  const [selectedDetail, setSelectedDetail] = useState<OrderDetailBundle | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);

  // Document Upload inside Order Detail
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docTitle, setDocTitle] = useState('');
  const [docVersionType, setDocVersionType] = useState('Draft');
  const [docUploading, setDocUploading] = useState(false);

  // Create Order Modal
  const [showCreate, setShowCreate] = useState(false);
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    customerId: '',
    serviceId: '',
    serviceCategory: 'Rent Agreement',
    serviceName: '',
    documentName: '',
    documentReferenceNumber: '',
    state: 'Delhi',
    quantity: 1,
    description: '',
    assignedExecutive: user?.fullName || '',
    expectedDeliveryDate: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
    deliveryMethod: 'Email',
    deliveryAddress: '',
    internalNotes: '',
    serviceFee: 0,
    governmentFee: 0,
    stampDuty: 0,
    notaryCharges: 0,
    courierCharges: 0,
    otherCharges: 0,
    discount: 0,
    cgstRate: 0,
    sgstRate: 0,
    igstRate: 0,
  });

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (statusFilter !== 'All') params.set('status', statusFilter);
      if (categoryFilter !== 'All') params.set('category', categoryFilter);
      const [ordRes, custRes, svcRes] = await Promise.all([
        apiFetch<{ data: OrderRecord[] }>(`/api/orders?${params.toString()}`),
        apiFetch<{ data: Customer[] }>('/api/customers'),
        apiFetch<{ data: ServiceItem[] }>('/api/services'),
      ]);
      setOrders(ordRes.data);
      setCustomers(custRes.data);
      setServices(svcRes.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load orders');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, q, statusFilter, categoryFilter]);

  useEffect(() => {
    const t = setTimeout(() => {
      void loadOrders();
    }, 150);
    return () => clearTimeout(t);
  }, [loadOrders]);

  const openDetail = useCallback(
    async (orderId: number) => {
      try {
        const res = await apiFetch<{ data: OrderDetailBundle }>(`/api/orders/${orderId}`);
        setSelectedDetail(res.data);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Unable to load order details');
      }
    },
    [apiFetch]
  );

  useEffect(() => {
    if (initialOrderId) {
      void openDetail(initialOrderId);
      onClearInitialTriggers?.();
    } else if (openCreateInitially || initialCreateCustomerId) {
      if (initialCreateCustomerId) {
        setForm((f) => ({ ...f, customerId: String(initialCreateCustomerId) }));
      }
      setShowCreate(true);
      onClearInitialTriggers?.();
    }
  }, [initialOrderId, initialCreateCustomerId, openCreateInitially, openDetail, onClearInitialTriggers]);

  const applyServiceTemplate = (serviceIdStr: string) => {
    const svc = services.find((s) => String(s.id) === serviceIdStr);
    if (!svc) {
      setForm((f) => ({ ...f, serviceId: serviceIdStr }));
      return;
    }
    const gstHalf = svc.gstApplicable ? Number(svc.gstRate) / 2 : 0;
    setForm((f) => ({
      ...f,
      serviceId: String(svc.id),
      serviceCategory: svc.category,
      serviceName: svc.name,
      documentName: f.documentName || svc.name,
      description: svc.description,
      serviceFee: Number(svc.defaultServiceFee),
      governmentFee: Number(svc.defaultGovernmentFee),
      stampDuty: Number(svc.defaultStampDuty),
      notaryCharges: Number(svc.defaultNotaryFee),
      courierCharges: Number(svc.defaultCourierCharge),
      cgstRate: gstHalf,
      sgstRate: gstHalf,
      igstRate: 0,
    }));
  };

  const liveCalc = useMemo(() => calculateOrderFinancials(form), [form]);

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    if (!form.customerId || !form.serviceName.trim() || !form.documentName.trim()) {
      setCreateError('Please select a customer and enter service & document names.');
      return;
    }
    setCreating(true);
    try {
      const res = await apiFetch<{ data: OrderRecord }>('/api/orders', {
        method: 'POST',
        body: JSON.stringify({ ...form, customerId: Number(form.customerId) }),
      });
      setShowCreate(false);
      await loadOrders();
      await openDetail(res.data.id);
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create order');
    } finally {
      setCreating(false);
    }
  };

  const handleStatusUpdate = async (newStatus: string) => {
    if (!selectedDetail) return;
    setStatusSaving(true);
    try {
      await apiFetch(`/api/orders/${selectedDetail.order.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ orderStatus: newStatus }),
      });
      await openDetail(selectedDetail.order.id);
      void loadOrders();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setStatusSaving(false);
    }
  };

  const handleUploadDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDetail || !docFile) return;
    setDocUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', docFile);
      fd.append('orderId', String(selectedDetail.order.id));
      fd.append('title', docTitle.trim() || docFile.name);
      fd.append('versionType', docVersionType);
      await apiFetch('/api/documents', { method: 'POST', body: fd });
      setDocFile(null);
      setDocTitle('');
      await openDetail(selectedDetail.order.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setDocUploading(false);
    }
  };

  if (selectedDetail) {
    const { order, customer, payments, receipts, documents, auditLogs } = selectedDetail;
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSelectedDetail(null)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-[#E8E6EC] rounded-lg hover:bg-[#F7F8FA]"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>All Orders</span>
            </button>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold font-mono text-[#310D35]">{order.orderCode}</h1>
                <StatusTag status={order.orderStatus} />
                <StatusTag status={order.paymentStatus} />
              </div>
              <p className="text-xs text-[#777481] mt-0.5">
                {order.serviceName} · {customer.fullName} ({customer.mobileNumber})
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {hasPermission('orders.manage') && (
              <select
                aria-label="Update order status"
                disabled={statusSaving}
                value={order.orderStatus}
                onChange={(e) => handleStatusUpdate(e.target.value)}
                className="px-3 py-2 text-xs font-medium bg-white border border-[#E8E6EC] rounded-lg"
              >
                {ORDER_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    Status: {st}
                  </option>
                ))}
              </select>
            )}
            {hasPermission('payments.collect') && Number(order.remainingBalance) > 0 && (
              <button
                type="button"
                onClick={() => onRecordPaymentForOrder(order.id)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#008C98] rounded-lg hover:bg-[#00747E]"
              >
                <CreditCard className="w-4 h-4" />
                <span>Record Payment</span>
              </button>
            )}
          </div>
        </div>

        {/* Financial Summary Strip */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
          <div className="bg-white border border-[#E8E6EC] rounded-lg p-4">
            <p className="text-xs text-[#777481]">Taxable Value</p>
            <p className="text-base font-bold font-mono tabular-nums mt-1">{formatInr(order.taxableAmount)}</p>
          </div>
          <div className="bg-white border border-[#E8E6EC] rounded-lg p-4">
            <p className="text-xs text-[#777481]">Total GST</p>
            <p className="text-base font-bold font-mono tabular-nums mt-1">{formatInr(order.totalGst)}</p>
          </div>
          <div className="bg-white border border-[#E8E6EC] rounded-lg p-4">
            <p className="text-xs text-[#777481]">Grand Total</p>
            <p className="text-base font-bold font-mono tabular-nums text-[#310D35] mt-1">
              {formatInr(order.grandTotal)}
            </p>
          </div>
          <div className="bg-white border border-[#E8E6EC] rounded-lg p-4">
            <p className="text-xs text-[#777481]">Total Paid (Verified)</p>
            <p className="text-base font-bold font-mono tabular-nums text-[#008C98] mt-1">
              {formatInr(order.totalPaid)}
            </p>
          </div>
          <div className="bg-white border border-[#E8E6EC] rounded-lg p-4">
            <p className="text-xs text-[#777481]">Remaining Balance</p>
            <p className="text-base font-bold font-mono tabular-nums text-[#8A5300] mt-1">
              {formatInr(order.remainingBalance)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Order Specification & Breakdown */}
          <div className="bg-white border border-[#E8E6EC] rounded-lg p-5 space-y-3 text-xs">
            <h2 className="text-sm font-semibold text-[#25212B] pb-2 border-b border-[#E8E6EC]">
              Order &amp; Fee Breakdown
            </h2>
            <p><span className="text-[#777481]">Document:</span> {order.documentName}</p>
            <p><span className="text-[#777481]">Reference:</span> <span className="font-mono">{order.documentReferenceNumber || '—'}</span></p>
            <p><span className="text-[#777481]">Executive:</span> {order.assignedExecutive || 'Unassigned'}</p>
            <p><span className="text-[#777481]">Delivery:</span> {order.deliveryMethod} · {order.state}</p>
            <div className="pt-2 border-t border-[#E8E6EC] space-y-1.5">
              <div className="flex justify-between"><span>Service Fee</span><span className="font-mono tabular-nums">{formatInr(order.serviceFee)}</span></div>
              <div className="flex justify-between"><span>Government Fee</span><span className="font-mono tabular-nums">{formatInr(order.governmentFee)}</span></div>
              <div className="flex justify-between"><span>Stamp Duty</span><span className="font-mono tabular-nums">{formatInr(order.stampDuty)}</span></div>
              <div className="flex justify-between"><span>Notary Charges</span><span className="font-mono tabular-nums">{formatInr(order.notaryCharges)}</span></div>
              <div className="flex justify-between"><span>Courier &amp; Other</span><span className="font-mono tabular-nums">{formatInr(Number(order.courierCharges) + Number(order.otherCharges))}</span></div>
              <div className="flex justify-between text-[#991B1B]"><span>Discount</span><span className="font-mono tabular-nums">-{formatInr(order.discount)}</span></div>
              <div className="flex justify-between font-semibold pt-1.5 border-t border-[#E8E6EC]">
                <span>Grand Total</span>
                <span className="font-mono tabular-nums">{formatInr(order.grandTotal)}</span>
              </div>
            </div>
          </div>

          {/* Payments & Receipts for this Order */}
          <div className="lg:col-span-2 space-y-5">
            <div className="bg-white border border-[#E8E6EC] rounded-lg overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[#E8E6EC] flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[#25212B]">Payments &amp; Receipts</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-[#F7F8FA] text-[#777481] border-b border-[#E8E6EC]">
                    <tr>
                      <th className="py-2.5 px-4 text-left font-medium">Payment</th>
                      <th className="py-2.5 px-4 text-left font-medium">Mode / Ref</th>
                      <th className="py-2.5 px-4 text-left font-medium">Verification</th>
                      <th className="py-2.5 px-4 text-right font-medium">Amount</th>
                      <th className="py-2.5 px-4 text-right font-medium">Receipt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8E6EC]">
                    {payments.map((p) => {
                      const rec = receipts.find((r) => r.paymentId === p.id && r.status === 'Issued') || receipts.find((r) => r.paymentId === p.id);
                      return (
                        <tr key={p.id}>
                          <td className="py-2.5 px-4 font-mono">
                            {p.paymentCode}
                            <div className="text-[11px] text-[#777481]">{p.paymentDate} · {p.paymentType}</div>
                          </td>
                          <td className="py-2.5 px-4">
                            {p.paymentMode}
                            <div className="text-[11px] font-mono text-[#777481]">{p.transactionId || p.upiReference || '—'}</div>
                          </td>
                          <td className="py-2.5 px-4"><StatusTag status={p.verificationStatus} /></td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold">
                            {formatInr(p.amount)}
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            {rec ? (
                              <button
                                type="button"
                                onClick={() => onPreviewReceipt(rec.id)}
                                className="inline-flex items-center gap-1 text-[#310D35] font-medium hover:underline"
                              >
                                <ReceiptText className="w-3.5 h-3.5" />
                                <span>{rec.receiptNumber}</span>
                              </button>
                            ) : (
                              <span className="text-[#777481]">Pending verification</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {payments.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-5 text-center text-[#777481]">
                          No payment transactions recorded yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Order Documents */}
            <div className="bg-white border border-[#E8E6EC] rounded-lg p-5 space-y-4">
              <h2 className="text-sm font-semibold text-[#25212B]">Order Documents</h2>
              {hasPermission('documents.manage') && (
                <form onSubmit={handleUploadDoc} className="flex flex-wrap items-end gap-3 p-3 bg-[#F7F8FA] border border-[#E8E6EC] rounded-lg">
                  <div className="flex-1 min-w-[160px]">
                    <label htmlFor="ord-doc-title" className="block text-[11px] font-medium text-[#777481] mb-1">
                      Document Title
                    </label>
                    <input
                      id="ord-doc-title"
                      type="text"
                      value={docTitle}
                      onChange={(e) => setDocTitle(e.target.value)}
                      placeholder="e.g., Draft Lease Agreement"
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#E8E6EC] rounded"
                    />
                  </div>
                  <div>
                    <label htmlFor="ord-doc-ver" className="block text-[11px] font-medium text-[#777481] mb-1">
                      Version
                    </label>
                    <select
                      id="ord-doc-ver"
                      value={docVersionType}
                      onChange={(e) => setDocVersionType(e.target.value)}
                      className="px-2.5 py-1.5 text-xs bg-white border border-[#E8E6EC] rounded"
                    >
                      <option value="Draft">Draft</option>
                      <option value="Final">Final</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="ord-doc-file" className="block text-[11px] font-medium text-[#777481] mb-1">
                      File (PDF, JPG, PNG, DOCX)
                    </label>
                    <input
                      id="ord-doc-file"
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.docx"
                      onChange={(e) => setDocFile(e.target.files?.[0] || null)}
                      className="text-xs"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={!docFile || docUploading}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#310D35] rounded hover:bg-[#46164C] disabled:opacity-50"
                  >
                    <FileUp className="w-3.5 h-3.5" />
                    <span>{docUploading ? 'Uploading...' : 'Upload'}</span>
                  </button>
                </form>
              )}

              <div className="divide-y divide-[#E8E6EC] text-xs">
                {documents.map((d) => (
                  <div key={d.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-[#25212B]">
                        {d.title} <span className="text-[#777481]">(v{d.versionNumber} · {d.versionType})</span>
                      </p>
                      <p className="text-[11px] text-[#777481]">
                        {d.originalName} · {(d.fileSize / 1024).toFixed(1)} KB
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusTag status={d.approvalStatus} />
                      <a
                        href={`/api/documents/${d.id}/download?token=${encodeURIComponent(token || '')}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#008C98] border border-[#E8E6EC] rounded hover:bg-[#F7F8FA]"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download</span>
                      </a>
                    </div>
                  </div>
                ))}
                {documents.length === 0 && (
                  <p className="text-xs text-[#777481] py-2">No documents uploaded for this order yet.</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Audit Timeline */}
        {auditLogs.length > 0 && (
          <div className="bg-white border border-[#E8E6EC] rounded-lg p-5">
            <h2 className="text-sm font-semibold text-[#25212B] mb-3">Order Activity Timeline</h2>
            <div className="divide-y divide-[#E8E6EC] text-xs">
              {auditLogs.map((l) => (
                <div key={l.id} className="py-2 flex justify-between gap-4">
                  <span>{l.summary}</span>
                  <span className="text-[#777481] font-mono whitespace-nowrap">
                    {l.actorName} · {new Date(l.createdAt).toLocaleString('en-IN')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#25212B]">Legal Documentation Orders</h1>
          <p className="text-xs text-[#777481] mt-0.5">
            Manage drafting workflow, stamp duty breakdowns, GST rules, and execution status
          </p>
        </div>
        {hasPermission('orders.manage') && (
          <button
            type="button"
            onClick={() => {
              setCreateError('');
              setShowCreate(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#310D35] rounded-lg hover:bg-[#46164C] whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Create Order</span>
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white border border-[#E8E6EC] rounded-lg p-3 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[220px] flex items-center gap-2">
          <Search className="w-4 h-4 text-[#777481] shrink-0" />
          <input
            type="search"
            aria-label="Search orders"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search order ID, customer, service, or document reference..."
            className="w-full text-sm bg-transparent focus:outline-none"
          />
        </div>
        <select
          aria-label="Filter by service category"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-1.5 text-xs border border-[#E8E6EC] rounded-lg bg-[#F7F8FA]"
        >
          <option value="All">All Categories</option>
          {SERVICE_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          aria-label="Filter by order status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 text-xs border border-[#E8E6EC] rounded-lg bg-[#F7F8FA]"
        >
          <option value="All">All Statuses</option>
          {ORDER_STATUSES.map((st) => (
            <option key={st} value={st}>{st}</option>
          ))}
        </select>
      </div>

      {error && <ErrorBanner message={error} onRetry={loadOrders} />}

      {loading ? (
        <TableSkeleton rows={6} cols={7} />
      ) : orders.length === 0 ? (
        <EmptyState
          title="No orders match your filters"
          description="Create a new legal documentation order to calculate fees and collect payments."
          actionLabel={hasPermission('orders.manage') ? 'Create Order' : undefined}
          onAction={hasPermission('orders.manage') ? () => setShowCreate(true) : undefined}
        />
      ) : (
        <div className="bg-white border border-[#E8E6EC] rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#F7F8FA] text-[#777481] border-b border-[#E8E6EC]">
                <tr>
                  <th className="py-3 px-4 text-left font-medium">Order ID</th>
                  <th className="py-3 px-4 text-left font-medium">Customer</th>
                  <th className="py-3 px-4 text-left font-medium">Service &amp; Document</th>
                  <th className="py-3 px-4 text-left font-medium">Order Status</th>
                  <th className="py-3 px-4 text-left font-medium">Payment</th>
                  <th className="py-3 px-4 text-right font-medium">Grand Total</th>
                  <th className="py-3 px-4 text-right font-medium">Balance</th>
                  <th className="py-3 px-4 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E6EC]">
                {orders.map((o) => (
                  <tr key={o.id} className="hover:bg-[#F7F8FA]/80">
                    <td className="py-3 px-4 font-mono font-medium text-[#310D35] whitespace-nowrap">
                      {o.orderCode}
                      <div className="text-[11px] text-[#777481]">{o.orderDate}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-[#25212B]">{o.customerName}</div>
                      <div className="text-[11px] font-mono text-[#777481]">{o.customerMobile}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-[#25212B]">{o.serviceName}</div>
                      <div className="text-[11px] text-[#777481]">{o.serviceCategory} · {o.documentName}</div>
                    </td>
                    <td className="py-3 px-4"><StatusTag status={o.orderStatus} /></td>
                    <td className="py-3 px-4"><StatusTag status={o.paymentStatus} /></td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">
                      {formatInr(o.grandTotal)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-[#8A5300] font-medium">
                      {formatInr(o.remainingBalance)}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => openDetail(o.id)}
                          className="inline-flex items-center gap-1 text-[#310D35] font-medium hover:underline"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Details</span>
                        </button>
                        {hasPermission('payments.collect') && Number(o.remainingBalance) > 0 && (
                          <button
                            type="button"
                            onClick={() => onRecordPaymentForOrder(o.id)}
                            className="text-[#008C98] font-medium hover:underline"
                          >
                            Collect
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

      {/* Create Order Modal with Financial Calculator */}
      {showCreate && (
        <ModalShell
          title="Create Legal Documentation Order"
          subtitle="Select a service template or customize fees and GST rules. Totals calculate automatically in INR."
          onClose={() => setShowCreate(false)}
          maxWidth="max-w-4xl"
        >
          <form onSubmit={handleCreateOrder} className="space-y-5">
            {createError && <ErrorBanner message={createError} />}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="ord-customer" className="block text-xs font-medium text-[#25212B] mb-1">
                  Customer *
                </label>
                <select
                  id="ord-customer"
                  required
                  value={form.customerId}
                  onChange={(e) => {
                    const cust = customers.find((c) => String(c.id) === e.target.value);
                    setForm((f) => ({
                      ...f,
                      customerId: e.target.value,
                      state: cust?.state || f.state,
                      deliveryAddress: cust?.billingAddress || f.deliveryAddress,
                    }));
                  }}
                  className="w-full px-3 py-2 text-sm border border-[#E8E6EC] rounded-lg"
                >
                  <option value="">Select customer...</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName} ({c.customerCode} · {c.mobileNumber})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="ord-template" className="block text-xs font-medium text-[#25212B] mb-1">
                  Service Template (Autofills Fees)
                </label>
                <select
                  id="ord-template"
                  value={form.serviceId}
                  onChange={(e) => applyServiceTemplate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#E8E6EC] rounded-lg"
                >
                  <option value="">Custom / Manual Entry</option>
                  {services.filter((s) => s.isActive).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.category})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="ord-cat" className="block text-xs font-medium text-[#25212B] mb-1">
                  Service Category *
                </label>
                <select
                  id="ord-cat"
                  value={form.serviceCategory}
                  onChange={(e) => setForm((f) => ({ ...f, serviceCategory: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-[#E8E6EC] rounded-lg"
                >
                  {SERVICE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="ord-svc-name" className="block text-xs font-medium text-[#25212B] mb-1">
                  Service Name *
                </label>
                <input
                  id="ord-svc-name"
                  type="text"
                  required
                  value={form.serviceName}
                  onChange={(e) => setForm((f) => ({ ...f, serviceName: e.target.value }))}
                  placeholder="e.g., Commercial Lease Agreement"
                  className="w-full px-3 py-2 text-sm border border-[#E8E6EC] rounded-lg"
                />
              </div>

              <div>
                <label htmlFor="ord-doc-name" className="block text-xs font-medium text-[#25212B] mb-1">
                  Document Name *
                </label>
                <input
                  id="ord-doc-name"
                  type="text"
                  required
                  value={form.documentName}
                  onChange={(e) => setForm((f) => ({ ...f, documentName: e.target.value }))}
                  placeholder="e.g., Office Lease Deed — Connaught Place"
                  className="w-full px-3 py-2 text-sm border border-[#E8E6EC] rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="ord-ref" className="block text-xs font-medium text-[#25212B] mb-1">
                    Document Ref No.
                  </label>
                  <input
                    id="ord-ref"
                    type="text"
                    value={form.documentReferenceNumber}
                    onChange={(e) => setForm((f) => ({ ...f, documentReferenceNumber: e.target.value }))}
                    className="w-full px-3 py-2 text-sm font-mono border border-[#E8E6EC] rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="ord-state" className="block text-xs font-medium text-[#25212B] mb-1">
                    State of Document
                  </label>
                  <input
                    id="ord-state"
                    type="text"
                    value={form.state}
                    onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-[#E8E6EC] rounded-lg"
                  />
                </div>
              </div>
            </div>

            {/* Financial Engine Inputs */}
            <div className="p-4 bg-[#F7F8FA] border border-[#E8E6EC] rounded-lg space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wide text-[#310D35]">
                Financial Fee &amp; Tax Breakdown (INR)
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { id: 'serviceFee', label: 'Service Fee' },
                  { id: 'governmentFee', label: 'Government Fee' },
                  { id: 'stampDuty', label: 'Stamp Duty' },
                  { id: 'notaryCharges', label: 'Notary Charges' },
                  { id: 'courierCharges', label: 'Courier Charges' },
                  { id: 'otherCharges', label: 'Other Charges' },
                  { id: 'discount', label: 'Discount' },
                ].map((fld) => (
                  <div key={fld.id}>
                    <label htmlFor={`fee-${fld.id}`} className="block text-[11px] font-medium text-[#777481] mb-1">
                      {fld.label}
                    </label>
                    <input
                      id={`fee-${fld.id}`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={(form as Record<string, unknown>)[fld.id] as number}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, [fld.id]: parseFloat(e.target.value) || 0 }))
                      }
                      className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums bg-white border border-[#E8E6EC] rounded"
                    />
                  </div>
                ))}

                <div className="grid grid-cols-3 gap-1.5">
                  <div>
                    <label htmlFor="fee-cgst" className="block text-[11px] font-medium text-[#777481] mb-1">
                      CGST%
                    </label>
                    <input
                      id="fee-cgst"
                      type="number"
                      min="0"
                      step="0.5"
                      value={form.cgstRate}
                      onChange={(e) => setForm((f) => ({ ...f, cgstRate: parseFloat(e.target.value) || 0 }))}
                      className="w-full px-2 py-1.5 text-xs font-mono bg-white border border-[#E8E6EC] rounded"
                    />
                  </div>
                  <div>
                    <label htmlFor="fee-sgst" className="block text-[11px] font-medium text-[#777481] mb-1">
                      SGST%
                    </label>
                    <input
                      id="fee-sgst"
                      type="number"
                      min="0"
                      step="0.5"
                      value={form.sgstRate}
                      onChange={(e) => setForm((f) => ({ ...f, sgstRate: parseFloat(e.target.value) || 0 }))}
                      className="w-full px-2 py-1.5 text-xs font-mono bg-white border border-[#E8E6EC] rounded"
                    />
                  </div>
                  <div>
                    <label htmlFor="fee-igst" className="block text-[11px] font-medium text-[#777481] mb-1">
                      IGST%
                    </label>
                    <input
                      id="fee-igst"
                      type="number"
                      min="0"
                      step="0.5"
                      value={form.igstRate}
                      onChange={(e) => setForm((f) => ({ ...f, igstRate: parseFloat(e.target.value) || 0 }))}
                      className="w-full px-2 py-1.5 text-xs font-mono bg-white border border-[#E8E6EC] rounded"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-[#E8E6EC] flex flex-wrap items-center justify-between gap-4 text-xs">
                <div className="flex flex-wrap gap-4 text-[#777481]">
                  <span>Subtotal: <strong className="font-mono text-[#25212B]">{formatInr(liveCalc.subtotal)}</strong></span>
                  <span>Taxable: <strong className="font-mono text-[#25212B]">{formatInr(liveCalc.taxableAmount)}</strong></span>
                  <span>Total GST: <strong className="font-mono text-[#25212B]">{formatInr(liveCalc.totalGst)}</strong></span>
                </div>
                <div className="text-sm font-bold text-[#310D35]">
                  Grand Total: <span className="font-mono tabular-nums">{formatInr(liveCalc.grandTotal)}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="ord-exec" className="block text-xs font-medium text-[#25212B] mb-1">
                  Assigned Executive
                </label>
                <input
                  id="ord-exec"
                  type="text"
                  value={form.assignedExecutive}
                  onChange={(e) => setForm((f) => ({ ...f, assignedExecutive: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-[#E8E6EC] rounded-lg"
                />
              </div>
              <div>
                <label htmlFor="ord-deliv" className="block text-xs font-medium text-[#25212B] mb-1">
                  Delivery Method
                </label>
                <select
                  id="ord-deliv"
                  value={form.deliveryMethod}
                  onChange={(e) => setForm((f) => ({ ...f, deliveryMethod: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-[#E8E6EC] rounded-lg"
                >
                  <option value="Email">Email</option>
                  <option value="WhatsApp">WhatsApp</option>
                  <option value="Courier">Courier</option>
                  <option value="Self Pickup">Self Pickup</option>
                </select>
              </div>
              <div>
                <label htmlFor="ord-due" className="block text-xs font-medium text-[#25212B] mb-1">
                  Expected Delivery
                </label>
                <input
                  id="ord-due"
                  type="date"
                  value={form.expectedDeliveryDate}
                  onChange={(e) => setForm((f) => ({ ...f, expectedDeliveryDate: e.target.value }))}
                  className="w-full px-3 py-2 text-sm font-mono border border-[#E8E6EC] rounded-lg"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[#E8E6EC]">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 text-xs font-medium text-[#25212B] border border-[#E8E6EC] rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating}
                className="px-5 py-2 text-xs font-semibold text-white bg-[#310D35] rounded-lg hover:bg-[#46164C] disabled:opacity-60"
              >
                {creating ? 'Creating Order...' : 'Create Order'}
              </button>
            </div>
          </form>
        </ModalShell>
      )}
    </div>
  );
}
