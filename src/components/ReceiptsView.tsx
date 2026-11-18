import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, Plus, ReceiptText, Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { Customer, OrderRecord, ReceiptRecord, ServiceItem } from '../types/portal';
import { calculateOrderFinancials, formatInr } from '../utils/finance';
import { EmptyState, ErrorBanner, ModalShell, StatusTag, TableSkeleton } from './UiPrimitives';

const PAYMENT_MODES = [
  'UPI',
  'Bank Transfer',
  'NEFT',
  'RTGS',
  'IMPS',
  'Debit Card',
  'Credit Card',
  'Payment Gateway',
  'Cash',
  'Cheque',
];

const PAYMENT_TYPES = ['Full Payment', 'Advance Payment', 'Part Payment', 'Final Instalment'];

const SERVICE_CATEGORIES = [
  'E-Stamp Paper',
  'Rent Agreement',
  'Affidavit',
  'Notary',
  'Legal Agreement',
  'Trademark Registration',
  'Copyright Registration',
  'FSSAI License',
  'Partnership Deed',
  'Other',
];

export function ReceiptsView({
  onPreviewReceipt,
}: {
  onPreviewReceipt: (receiptId: number) => void;
}) {
  const { apiFetch, hasPermission, companySettings } = useAuth();
  const [receipts, setReceipts] = useState<ReceiptRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('All');

  // Create Receipt Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createMode, setCreateMode] = useState<'existing_order' | 'direct'>('existing_order');
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [customersList, setCustomersList] = useState<Customer[]>([]);
  const [servicesList, setServicesList] = useState<ServiceItem[]>([]);
  const [lookupsLoading, setLookupsLoading] = useState(false);
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  // Existing Order Receipt state
  const [selectedOrderId, setSelectedOrderId] = useState('');

  // Direct Receipt state
  const [customerMode, setCustomerMode] = useState<'existing' | 'new'>('new');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [newCustomer, setNewCustomer] = useState({
    fullName: '',
    businessName: '',
    mobileNumber: '',
    email: '',
    billingAddress: '',
    city: '',
    state: '',
    pincode: '',
    gstin: '',
  });
  const [directOrder, setDirectOrder] = useState({
    serviceId: '',
    serviceCategory: 'Rent Agreement',
    serviceName: '',
    documentName: '',
    documentReferenceNumber: '',
    deliveryMethod: 'Email',
    quantity: 1,
    description: '',
    serviceFee: 0,
    governmentFee: 0,
    stampDuty: 0,
    notaryCharges: 0,
    courierCharges: 0,
    otherCharges: 0,
    discount: 0,
    cgstRate: Number(companySettings?.defaultCgstRate ?? 9),
    sgstRate: Number(companySettings?.defaultSgstRate ?? 9),
    igstRate: Number(companySettings?.defaultIgstRate ?? 0),
  });

  // Payment fields (shared across both modes)
  const [paymentInfo, setPaymentInfo] = useState({
    amount: 0,
    paymentDate: new Date().toISOString().slice(0, 10),
    paymentTime: new Date().toTimeString().slice(0, 5),
    paymentType: 'Full Payment',
    paymentMode: 'UPI',
    transactionId: '',
    upiReference: '',
    bankName: '',
    notes: '',
  });

  const loadReceipts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (status !== 'All') params.set('status', status);
      const res = await apiFetch<{ data: ReceiptRecord[] }>(`/api/receipts?${params.toString()}`);
      setReceipts(res.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load receipts');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, q, status]);

  useEffect(() => {
    const t = setTimeout(() => {
      void loadReceipts();
    }, 150);
    return () => clearTimeout(t);
  }, [loadReceipts]);

  const openCreateReceiptModal = async () => {
    setCreateError('');
    setCreateMode('existing_order');
    setShowCreateModal(true);
    setLookupsLoading(true);
    try {
      const [ordRes, custRes, srvRes] = await Promise.all([
        apiFetch<{ data: OrderRecord[] }>('/api/orders'),
        apiFetch<{ data: Customer[] }>('/api/customers'),
        apiFetch<{ data: ServiceItem[] }>('/api/services'),
      ]);
      setOrders(ordRes.data);
      setCustomersList(custRes.data);
      setServicesList(srvRes.data.filter((s) => s.isActive));

      // Pre-select first order with pending balance if available
      const openOrder = ordRes.data.find((o) => Number(o.remainingBalance) > 0) || ordRes.data[0];
      if (openOrder) {
        setSelectedOrderId(String(openOrder.id));
        const bal = Number(openOrder.remainingBalance);
        setPaymentInfo((p) => ({
          ...p,
          amount: bal > 0 ? bal : Number(openOrder.grandTotal),
          paymentType: Number(openOrder.totalPaid) > 0 ? 'Final Instalment' : 'Full Payment',
          paymentDate: new Date().toISOString().slice(0, 10),
          paymentTime: new Date().toTimeString().slice(0, 5),
        }));
      } else {
        setCreateMode('direct');
      }
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'Unable to load orders and customers');
    } finally {
      setLookupsLoading(false);
    }
  };

  const selectedOrder = useMemo(
    () => orders.find((o) => String(o.id) === selectedOrderId) || null,
    [orders, selectedOrderId]
  );

  const existingOrderCalc = useMemo(() => {
    if (!selectedOrder) return null;
    return calculateOrderFinancials({
      serviceFee: Number(selectedOrder.serviceFee),
      governmentFee: Number(selectedOrder.governmentFee),
      stampDuty: Number(selectedOrder.stampDuty),
      notaryCharges: Number(selectedOrder.notaryCharges),
      courierCharges: Number(selectedOrder.courierCharges),
      otherCharges: Number(selectedOrder.otherCharges),
      discount: Number(selectedOrder.discount),
      cgstRate: Number(selectedOrder.cgstRate),
      sgstRate: Number(selectedOrder.sgstRate),
      igstRate: Number(selectedOrder.igstRate),
      previouslyPaid: Number(selectedOrder.totalPaid),
      currentPayment: paymentInfo.amount,
    });
  }, [selectedOrder, paymentInfo.amount]);

  const directFinCalc = useMemo(
    () =>
      calculateOrderFinancials({
        serviceFee: directOrder.serviceFee,
        governmentFee: directOrder.governmentFee,
        stampDuty: directOrder.stampDuty,
        notaryCharges: directOrder.notaryCharges,
        courierCharges: directOrder.courierCharges,
        otherCharges: directOrder.otherCharges,
        discount: directOrder.discount,
        cgstRate: directOrder.cgstRate,
        sgstRate: directOrder.sgstRate,
        igstRate: directOrder.igstRate,
        previouslyPaid: 0,
        currentPayment: paymentInfo.amount,
      }),
    [directOrder, paymentInfo.amount]
  );

  const applyServicePreset = (serviceId: string) => {
    const srv = servicesList.find((s) => String(s.id) === serviceId);
    if (!srv) {
      setDirectOrder((d) => ({ ...d, serviceId }));
      return;
    }
    const gstHalf = srv.gstApplicable ? Number(srv.gstRate) / 2 : 0;
    const calc = calculateOrderFinancials({
      serviceFee: Number(srv.defaultServiceFee),
      governmentFee: Number(srv.defaultGovernmentFee),
      stampDuty: Number(srv.defaultStampDuty),
      notaryCharges: Number(srv.defaultNotaryFee),
      courierCharges: Number(srv.defaultCourierCharge),
      otherCharges: 0,
      discount: 0,
      cgstRate: gstHalf,
      sgstRate: gstHalf,
      igstRate: 0,
    });
    setDirectOrder((d) => ({
      ...d,
      serviceId,
      serviceCategory: srv.category,
      serviceName: srv.name,
      documentName: d.documentName || srv.name,
      description: srv.description,
      serviceFee: Number(srv.defaultServiceFee),
      governmentFee: Number(srv.defaultGovernmentFee),
      stampDuty: Number(srv.defaultStampDuty),
      notaryCharges: Number(srv.defaultNotaryFee),
      courierCharges: Number(srv.defaultCourierCharge),
      cgstRate: gstHalf,
      sgstRate: gstHalf,
      igstRate: 0,
    }));
    setPaymentInfo((p) => ({ ...p, amount: calc.grandTotal, paymentType: 'Full Payment' }));
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');

    if (paymentInfo.amount <= 0) {
      setCreateError('Please enter a valid positive payment amount.');
      return;
    }

    if (createMode === 'existing_order' && !selectedOrderId) {
      setCreateError('Please select an order to issue a receipt against.');
      return;
    }

    if (createMode === 'direct') {
      if (customerMode === 'existing' && !selectedCustomerId) {
        setCreateError('Please select a customer.');
        return;
      }
      if (customerMode === 'new' && (!newCustomer.fullName.trim() || !newCustomer.mobileNumber.trim())) {
        setCreateError('Customer full name and 10-digit mobile number are required.');
        return;
      }
      if (!directOrder.serviceCategory.trim() || !directOrder.serviceName.trim()) {
        setCreateError('Service category and service name are required.');
        return;
      }
    }

    setCreating(true);
    try {
      const payload =
        createMode === 'existing_order'
          ? {
              mode: 'existing_order',
              orderId: Number(selectedOrderId),
              ...paymentInfo,
            }
          : {
              mode: 'direct',
              ...(customerMode === 'existing'
                ? { customerId: Number(selectedCustomerId) }
                : { customer: newCustomer }),
              ...directOrder,
              serviceId: directOrder.serviceId ? Number(directOrder.serviceId) : null,
              ...paymentInfo,
            };

      const res = await apiFetch<{ data: { receipt: { id: number; receiptNumber: string } } }>(
        '/api/receipts',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      );

      setShowCreateModal(false);
      await loadReceipts();
      if (res.data.receipt?.id) {
        onPreviewReceipt(res.data.receipt.id);
      }
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create receipt');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#25212B]">Payment Receipts Register</h1>
          <p className="text-xs text-[#777481] mt-0.5">
            Immutable A4 payment receipts with QR verification tokens, PDF downloads, and revision history
          </p>
        </div>
        {hasPermission('receipts.manage') && (
          <button
            type="button"
            onClick={openCreateReceiptModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#310D35] rounded-lg hover:bg-[#46164C] whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Create Receipt</span>
          </button>
        )}
      </div>

      <div className="bg-white border border-[#E8E6EC] rounded-lg p-3 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[220px] flex items-center gap-2">
          <Search className="w-4 h-4 text-[#777481] shrink-0" />
          <input
            type="search"
            aria-label="Search receipts"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by receipt number, customer, order ID, or transaction ref..."
            className="w-full text-sm bg-transparent focus:outline-none"
          />
        </div>
        <select
          aria-label="Filter by receipt status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="px-3 py-1.5 text-xs border border-[#E8E6EC] rounded-lg bg-[#F7F8FA]"
        >
          <option value="All">All Receipts</option>
          <option value="Issued">Issued</option>
          <option value="Superseded">Superseded</option>
          <option value="Cancelled">Cancelled</option>
        </select>
      </div>

      {error && <ErrorBanner message={error} onRetry={loadReceipts} />}

      {loading ? (
        <TableSkeleton rows={6} cols={7} />
      ) : receipts.length === 0 ? (
        <EmptyState
          title="No receipts found"
          description="Create a new payment receipt directly or record a verified payment on an order."
          actionLabel={hasPermission('receipts.manage') ? 'Create Receipt' : undefined}
          onAction={hasPermission('receipts.manage') ? openCreateReceiptModal : undefined}
        />
      ) : (
        <div className="bg-white border border-[#E8E6EC] rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#F7F8FA] text-[#777481] border-b border-[#E8E6EC]">
                <tr>
                  <th className="py-3 px-4 text-left font-medium">Receipt Number</th>
                  <th className="py-3 px-4 text-left font-medium">Customer</th>
                  <th className="py-3 px-4 text-left font-medium">Order / Service</th>
                  <th className="py-3 px-4 text-left font-medium">Mode</th>
                  <th className="py-3 px-4 text-left font-medium">Receipt Status</th>
                  <th className="py-3 px-4 text-right font-medium">Amount</th>
                  <th className="py-3 px-4 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E6EC]">
                {receipts.map((r) => (
                  <tr key={r.id} className="hover:bg-[#F7F8FA]/80">
                    <td className="py-3 px-4 font-mono whitespace-nowrap">
                      <div className="font-semibold text-[#310D35]">{r.receiptNumber}</div>
                      <div className="text-[11px] text-[#777481]">
                        {r.receiptDate} · Rev {r.revisionNumber}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-[#25212B]">{r.customerName}</div>
                      {r.businessName && <div className="text-[11px] text-[#777481]">{r.businessName}</div>}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-mono text-[#008C98]">{r.orderCode}</div>
                      <div className="text-[11px] text-[#777481]">{r.serviceName}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div>{r.paymentMode}</div>
                      <div className="text-[11px] text-[#777481]">{r.paymentType}</div>
                    </td>
                    <td className="py-3 px-4">
                      <StatusTag status={r.status} />
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-bold">
                      {formatInr(r.currentPayment)}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => onPreviewReceipt(r.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-[#310D35] rounded hover:bg-[#46164C]"
                        >
                          <ReceiptText className="w-3.5 h-3.5" />
                          <span>Preview / PDF</span>
                        </button>
                        <a
                          href={`/verify-receipt/${r.verificationToken}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Public verify page for ${r.receiptNumber}`}
                          className="inline-flex items-center gap-1 text-[#008C98] hover:underline"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Verify</span>
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Receipt Modal */}
      {showCreateModal && (
        <ModalShell
          title="Create Payment Receipt"
          subtitle="Issue an immutable A4 payment receipt with QR verification directly from an existing order or new service."
          onClose={() => setShowCreateModal(false)}
          maxWidth="max-w-4xl"
        >
          <form onSubmit={handleCreateSubmit} className="space-y-5">
            {createError && <ErrorBanner message={createError} />}

            {/* Mode Switcher */}
            <div className="flex flex-wrap items-center gap-2 p-1 bg-[#F7F8FA] border border-[#E8E6EC] rounded-lg w-fit">
              <button
                type="button"
                onClick={() => setCreateMode('existing_order')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  createMode === 'existing_order'
                    ? 'bg-[#310D35] text-white'
                    : 'text-[#777481] hover:text-[#25212B]'
                }`}
              >
                From Existing Order
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreateMode('direct');
                  if (directFinCalc.grandTotal > 0) {
                    setPaymentInfo((p) => ({ ...p, amount: directFinCalc.grandTotal }));
                  }
                }}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  createMode === 'direct'
                    ? 'bg-[#310D35] text-white'
                    : 'text-[#777481] hover:text-[#25212B]'
                }`}
              >
                Quick Direct Receipt (New Order)
              </button>
            </div>

            {lookupsLoading ? (
              <div className="py-8 text-center text-xs text-[#777481]">Loading orders, customers &amp; services...</div>
            ) : createMode === 'existing_order' ? (
              <div className="space-y-4">
                <div>
                  <label htmlFor="cr-order" className="block text-xs font-medium text-[#25212B] mb-1">
                    Select Order *
                  </label>
                  <select
                    id="cr-order"
                    required
                    value={selectedOrderId}
                    onChange={(e) => {
                      const ord = orders.find((o) => String(o.id) === e.target.value);
                      setSelectedOrderId(e.target.value);
                      if (ord) {
                        const bal = Number(ord.remainingBalance);
                        setPaymentInfo((p) => ({
                          ...p,
                          amount: bal > 0 ? bal : Number(ord.grandTotal),
                          paymentType: Number(ord.totalPaid) > 0 ? 'Final Instalment' : 'Full Payment',
                        }));
                      }
                    }}
                    className="w-full px-3 py-2 text-sm border border-[#E8E6EC] rounded-lg"
                  >
                    <option value="">Choose an order...</option>
                    {orders.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.orderCode} — {o.customerName} ({o.serviceName}) · Total: {formatInr(o.grandTotal)} · Balance:{' '}
                        {formatInr(o.remainingBalance)}
                      </option>
                    ))}
                  </select>
                </div>

                {existingOrderCalc && selectedOrder && (
                  <div className="p-3.5 bg-[#F7F8FA] border border-[#E8E6EC] rounded-lg grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div>
                      <span className="text-[#777481] block">Order Grand Total</span>
                      <strong className="font-mono tabular-nums">{formatInr(existingOrderCalc.grandTotal)}</strong>
                    </div>
                    <div>
                      <span className="text-[#777481] block">Previously Paid</span>
                      <strong className="font-mono tabular-nums">{formatInr(existingOrderCalc.previouslyPaid)}</strong>
                    </div>
                    <div>
                      <span className="text-[#777481] block">Total Paid After Receipt</span>
                      <strong className="font-mono tabular-nums text-[#008C98]">
                        {formatInr(existingOrderCalc.totalPaid)}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[#777481] block">Remaining Balance</span>
                      <strong className="font-mono tabular-nums text-[#310D35]">
                        {formatInr(existingOrderCalc.remainingBalance)}
                      </strong>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {/* Customer Section */}
                <div className="p-3.5 border border-[#E8E6EC] rounded-lg space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-xs font-bold text-[#310D35]">1. Customer Details</h3>
                    <div className="flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setCustomerMode('new')}
                        className={`px-2.5 py-1 rounded border ${
                          customerMode === 'new'
                            ? 'bg-[#310D35] text-white border-[#310D35]'
                            : 'bg-white text-[#777481] border-[#E8E6EC]'
                        }`}
                      >
                        New Customer
                      </button>
                      <button
                        type="button"
                        onClick={() => setCustomerMode('existing')}
                        className={`px-2.5 py-1 rounded border ${
                          customerMode === 'existing'
                            ? 'bg-[#310D35] text-white border-[#310D35]'
                            : 'bg-white text-[#777481] border-[#E8E6EC]'
                        }`}
                      >
                        Existing Customer
                      </button>
                    </div>
                  </div>

                  {customerMode === 'existing' ? (
                    <div>
                      <label htmlFor="cr-cust" className="block text-xs font-medium text-[#25212B] mb-1">
                        Select Customer *
                      </label>
                      <select
                        id="cr-cust"
                        required
                        value={selectedCustomerId}
                        onChange={(e) => setSelectedCustomerId(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-[#E8E6EC] rounded-lg"
                      >
                        <option value="">Choose a customer...</option>
                        {customersList.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.customerCode} — {c.fullName} ({c.mobileNumber})
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label htmlFor="cr-c-name" className="block text-xs font-medium text-[#25212B] mb-1">
                          Full Name *
                        </label>
                        <input
                          id="cr-c-name"
                          type="text"
                          required
                          value={newCustomer.fullName}
                          onChange={(e) => setNewCustomer((c) => ({ ...c, fullName: e.target.value }))}
                          placeholder="e.g., Priya Sharma"
                          className="w-full px-3 py-1.5 text-sm border border-[#E8E6EC] rounded-lg"
                        />
                      </div>
                      <div>
                        <label htmlFor="cr-c-mob" className="block text-xs font-medium text-[#25212B] mb-1">
                          Mobile Number *
                        </label>
                        <input
                          id="cr-c-mob"
                          type="tel"
                          required
                          value={newCustomer.mobileNumber}
                          onChange={(e) => setNewCustomer((c) => ({ ...c, mobileNumber: e.target.value }))}
                          placeholder="10-digit mobile"
                          className="w-full px-3 py-1.5 text-sm font-mono border border-[#E8E6EC] rounded-lg"
                        />
                      </div>
                      <div>
                        <label htmlFor="cr-c-email" className="block text-xs font-medium text-[#25212B] mb-1">
                          Email
                        </label>
                        <input
                          id="cr-c-email"
                          type="email"
                          value={newCustomer.email}
                          onChange={(e) => setNewCustomer((c) => ({ ...c, email: e.target.value }))}
                          placeholder="client@example.com"
                          className="w-full px-3 py-1.5 text-sm border border-[#E8E6EC] rounded-lg"
                        />
                      </div>
                      <div>
                        <label htmlFor="cr-c-biz" className="block text-xs font-medium text-[#25212B] mb-1">
                          Business Name
                        </label>
                        <input
                          id="cr-c-biz"
                          type="text"
                          value={newCustomer.businessName}
                          onChange={(e) => setNewCustomer((c) => ({ ...c, businessName: e.target.value }))}
                          className="w-full px-3 py-1.5 text-sm border border-[#E8E6EC] rounded-lg"
                        />
                      </div>
                      <div>
                        <label htmlFor="cr-c-addr" className="block text-xs font-medium text-[#25212B] mb-1">
                          Billing Address
                        </label>
                        <input
                          id="cr-c-addr"
                          type="text"
                          value={newCustomer.billingAddress}
                          onChange={(e) => setNewCustomer((c) => ({ ...c, billingAddress: e.target.value }))}
                          className="w-full px-3 py-1.5 text-sm border border-[#E8E6EC] rounded-lg"
                        />
                      </div>
                      <div>
                        <label htmlFor="cr-c-gst" className="block text-xs font-medium text-[#25212B] mb-1">
                          GSTIN (Optional)
                        </label>
                        <input
                          id="cr-c-gst"
                          type="text"
                          value={newCustomer.gstin}
                          onChange={(e) => setNewCustomer((c) => ({ ...c, gstin: e.target.value.toUpperCase() }))}
                          placeholder="15-char GSTIN"
                          className="w-full px-3 py-1.5 text-sm font-mono uppercase border border-[#E8E6EC] rounded-lg"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Service & Fee Breakdown */}
                <div className="p-3.5 border border-[#E8E6EC] rounded-lg space-y-3">
                  <h3 className="text-xs font-bold text-[#310D35]">2. Service &amp; Fee Breakdown</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label htmlFor="cr-srv-preset" className="block text-xs font-medium text-[#25212B] mb-1">
                        Service Preset
                      </label>
                      <select
                        id="cr-srv-preset"
                        value={directOrder.serviceId}
                        onChange={(e) => applyServicePreset(e.target.value)}
                        className="w-full px-3 py-1.5 text-sm border border-[#E8E6EC] rounded-lg"
                      >
                        <option value="">Custom service...</option>
                        {servicesList.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.category})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="cr-srv-cat" className="block text-xs font-medium text-[#25212B] mb-1">
                        Service Category *
                      </label>
                      <select
                        id="cr-srv-cat"
                        value={directOrder.serviceCategory}
                        onChange={(e) => setDirectOrder((d) => ({ ...d, serviceCategory: e.target.value }))}
                        className="w-full px-3 py-1.5 text-sm border border-[#E8E6EC] rounded-lg"
                      >
                        {SERVICE_CATEGORIES.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="cr-srv-name" className="block text-xs font-medium text-[#25212B] mb-1">
                        Service Name *
                      </label>
                      <input
                        id="cr-srv-name"
                        type="text"
                        required
                        value={directOrder.serviceName}
                        onChange={(e) => setDirectOrder((d) => ({ ...d, serviceName: e.target.value }))}
                        placeholder="e.g., Residential Rent Agreement"
                        className="w-full px-3 py-1.5 text-sm border border-[#E8E6EC] rounded-lg"
                      />
                    </div>
                    <div>
                      <label htmlFor="cr-doc-name" className="block text-xs font-medium text-[#25212B] mb-1">
                        Document Name
                      </label>
                      <input
                        id="cr-doc-name"
                        type="text"
                        value={directOrder.documentName}
                        onChange={(e) => setDirectOrder((d) => ({ ...d, documentName: e.target.value }))}
                        placeholder="e.g., 11-Month Rent Agreement"
                        className="w-full px-3 py-1.5 text-sm border border-[#E8E6EC] rounded-lg"
                      />
                    </div>
                    <div>
                      <label htmlFor="cr-doc-ref" className="block text-xs font-medium text-[#25212B] mb-1">
                        Document Reference No.
                      </label>
                      <input
                        id="cr-doc-ref"
                        type="text"
                        value={directOrder.documentReferenceNumber}
                        onChange={(e) => setDirectOrder((d) => ({ ...d, documentReferenceNumber: e.target.value }))}
                        className="w-full px-3 py-1.5 text-sm font-mono border border-[#E8E6EC] rounded-lg"
                      />
                    </div>
                    <div>
                      <label htmlFor="cr-qty" className="block text-xs font-medium text-[#25212B] mb-1">
                        Quantity
                      </label>
                      <input
                        id="cr-qty"
                        type="number"
                        min={1}
                        value={directOrder.quantity}
                        onChange={(e) =>
                          setDirectOrder((d) => ({ ...d, quantity: Math.max(1, parseInt(e.target.value, 10) || 1) }))
                        }
                        className="w-full px-3 py-1.5 text-sm font-mono border border-[#E8E6EC] rounded-lg"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-1">
                    <div>
                      <label htmlFor="cr-fee-srv" className="block text-[11px] text-[#777481] mb-1">Service Fee (₹)</label>
                      <input
                        id="cr-fee-srv"
                        type="number"
                        min="0"
                        step="0.01"
                        value={directOrder.serviceFee}
                        onChange={(e) => setDirectOrder((d) => ({ ...d, serviceFee: parseFloat(e.target.value) || 0 }))}
                        className="w-full px-2.5 py-1.5 text-xs font-mono border border-[#E8E6EC] rounded"
                      />
                    </div>
                    <div>
                      <label htmlFor="cr-fee-govt" className="block text-[11px] text-[#777481] mb-1">Govt Fee (₹)</label>
                      <input
                        id="cr-fee-govt"
                        type="number"
                        min="0"
                        step="0.01"
                        value={directOrder.governmentFee}
                        onChange={(e) => setDirectOrder((d) => ({ ...d, governmentFee: parseFloat(e.target.value) || 0 }))}
                        className="w-full px-2.5 py-1.5 text-xs font-mono border border-[#E8E6EC] rounded"
                      />
                    </div>
                    <div>
                      <label htmlFor="cr-fee-stamp" className="block text-[11px] text-[#777481] mb-1">Stamp Duty (₹)</label>
                      <input
                        id="cr-fee-stamp"
                        type="number"
                        min="0"
                        step="0.01"
                        value={directOrder.stampDuty}
                        onChange={(e) => setDirectOrder((d) => ({ ...d, stampDuty: parseFloat(e.target.value) || 0 }))}
                        className="w-full px-2.5 py-1.5 text-xs font-mono border border-[#E8E6EC] rounded"
                      />
                    </div>
                    <div>
                      <label htmlFor="cr-fee-notary" className="block text-[11px] text-[#777481] mb-1">Notary / Courier (₹)</label>
                      <input
                        id="cr-fee-notary"
                        type="number"
                        min="0"
                        step="0.01"
                        value={directOrder.notaryCharges}
                        onChange={(e) => setDirectOrder((d) => ({ ...d, notaryCharges: parseFloat(e.target.value) || 0 }))}
                        className="w-full px-2.5 py-1.5 text-xs font-mono border border-[#E8E6EC] rounded"
                      />
                    </div>
                    <div>
                      <label htmlFor="cr-fee-disc" className="block text-[11px] text-[#777481] mb-1">Discount (₹)</label>
                      <input
                        id="cr-fee-disc"
                        type="number"
                        min="0"
                        step="0.01"
                        value={directOrder.discount}
                        onChange={(e) => setDirectOrder((d) => ({ ...d, discount: parseFloat(e.target.value) || 0 }))}
                        className="w-full px-2.5 py-1.5 text-xs font-mono border border-[#E8E6EC] rounded"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#E8E6EC] text-xs">
                    <div className="flex items-center gap-3">
                      <label className="inline-flex items-center gap-1.5">
                        <span className="text-[#777481]">CGST %</span>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={directOrder.cgstRate}
                          onChange={(e) => setDirectOrder((d) => ({ ...d, cgstRate: parseFloat(e.target.value) || 0 }))}
                          className="w-14 px-2 py-1 text-xs font-mono border border-[#E8E6EC] rounded"
                        />
                      </label>
                      <label className="inline-flex items-center gap-1.5">
                        <span className="text-[#777481]">SGST %</span>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={directOrder.sgstRate}
                          onChange={(e) => setDirectOrder((d) => ({ ...d, sgstRate: parseFloat(e.target.value) || 0 }))}
                          className="w-14 px-2 py-1 text-xs font-mono border border-[#E8E6EC] rounded"
                        />
                      </label>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-[#777481]">
                        GST: <strong className="font-mono">{formatInr(directFinCalc.totalGst)}</strong>
                      </span>
                      <span className="text-[#310D35]">
                        Grand Total: <strong className="font-mono text-sm">{formatInr(directFinCalc.grandTotal)}</strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => setPaymentInfo((p) => ({ ...p, amount: directFinCalc.grandTotal }))}
                        className="text-[#008C98] underline font-medium"
                      >
                        Match Amount
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Payment Details Section (Shared) */}
            <div className="p-3.5 border border-[#E8E6EC] rounded-lg space-y-3">
              <h3 className="text-xs font-bold text-[#310D35]">
                {createMode === 'direct' ? '3. Payment & Receipt Details' : 'Payment & Receipt Details'}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="cr-amount" className="block text-xs font-medium text-[#25212B] mb-1">
                    Amount Received (INR) *
                  </label>
                  <input
                    id="cr-amount"
                    type="number"
                    required
                    min="1"
                    step="0.01"
                    value={paymentInfo.amount}
                    onChange={(e) => setPaymentInfo((p) => ({ ...p, amount: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-3 py-1.5 text-sm font-mono tabular-nums border border-[#E8E6EC] rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="cr-mode" className="block text-xs font-medium text-[#25212B] mb-1">
                    Payment Mode *
                  </label>
                  <select
                    id="cr-mode"
                    value={paymentInfo.paymentMode}
                    onChange={(e) => setPaymentInfo((p) => ({ ...p, paymentMode: e.target.value }))}
                    className="w-full px-3 py-1.5 text-sm border border-[#E8E6EC] rounded-lg"
                  >
                    {PAYMENT_MODES.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="cr-type" className="block text-xs font-medium text-[#25212B] mb-1">
                    Payment Type
                  </label>
                  <select
                    id="cr-type"
                    value={paymentInfo.paymentType}
                    onChange={(e) => setPaymentInfo((p) => ({ ...p, paymentType: e.target.value }))}
                    className="w-full px-3 py-1.5 text-sm border border-[#E8E6EC] rounded-lg"
                  >
                    {PAYMENT_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="cr-tx" className="block text-xs font-medium text-[#25212B] mb-1">
                    Transaction / UTR ID
                  </label>
                  <input
                    id="cr-tx"
                    type="text"
                    value={paymentInfo.transactionId}
                    onChange={(e) => setPaymentInfo((p) => ({ ...p, transactionId: e.target.value }))}
                    placeholder="e.g., UTR9021847712"
                    className="w-full px-3 py-1.5 text-sm font-mono border border-[#E8E6EC] rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="cr-ref" className="block text-xs font-medium text-[#25212B] mb-1">
                    UPI Ref / Bank Name
                  </label>
                  <input
                    id="cr-ref"
                    type="text"
                    value={paymentInfo.upiReference || paymentInfo.bankName}
                    onChange={(e) =>
                      setPaymentInfo((p) => ({
                        ...p,
                        upiReference: p.paymentMode === 'UPI' ? e.target.value : '',
                        bankName: p.paymentMode !== 'UPI' ? e.target.value : '',
                      }))
                    }
                    placeholder="UPI Ref or Bank Name"
                    className="w-full px-3 py-1.5 text-sm border border-[#E8E6EC] rounded-lg"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="cr-date" className="block text-xs font-medium text-[#25212B] mb-1">
                      Receipt Date
                    </label>
                    <input
                      id="cr-date"
                      type="date"
                      value={paymentInfo.paymentDate}
                      onChange={(e) => setPaymentInfo((p) => ({ ...p, paymentDate: e.target.value }))}
                      className="w-full px-2 py-1.5 text-xs font-mono border border-[#E8E6EC] rounded-lg"
                    />
                  </div>
                  <div>
                    <label htmlFor="cr-time" className="block text-xs font-medium text-[#25212B] mb-1">
                      Time
                    </label>
                    <input
                      id="cr-time"
                      type="time"
                      value={paymentInfo.paymentTime}
                      onChange={(e) => setPaymentInfo((p) => ({ ...p, paymentTime: e.target.value }))}
                      className="w-full px-2 py-1.5 text-xs font-mono border border-[#E8E6EC] rounded-lg"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[#E8E6EC]">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-xs font-medium text-[#25212B] border border-[#E8E6EC] rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating || lookupsLoading}
                className="px-5 py-2 text-xs font-semibold text-white bg-[#310D35] rounded-lg hover:bg-[#46164C] disabled:opacity-60"
              >
                {creating ? 'Generating Receipt...' : 'Issue Official Receipt'}
              </button>
            </div>
          </form>
        </ModalShell>
      )}
    </div>
  );
}
