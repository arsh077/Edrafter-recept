import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Plus, ReceiptText, RefreshCw, Search, XCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { OrderRecord, PaymentRecord } from '../types/portal';
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

export function PaymentsView({
  initialOrderId,
  onClearInitialOrder,
  onPreviewReceipt,
  onOpenOrder,
}: {
  initialOrderId?: number | null;
  onClearInitialOrder?: () => void;
  onPreviewReceipt: (receiptId: number) => void;
  onOpenOrder: (orderId: number) => void;
}) {
  const { apiFetch, hasPermission, user } = useAuth();
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [q, setQ] = useState('');
  const [modeFilter, setModeFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');

  // Record Payment Modal
  const [showRecord, setShowRecord] = useState(false);
  const [recordError, setRecordError] = useState('');
  const [recording, setRecording] = useState(false);
  const [payForm, setPayForm] = useState({
    orderId: '',
    amount: 0,
    paymentDate: new Date().toISOString().slice(0, 10),
    paymentTime: new Date().toTimeString().slice(0, 5),
    paymentType: 'Full Payment',
    paymentMode: 'UPI',
    transactionId: '',
    upiReference: '',
    upiId: '',
    bankName: '',
    chequeNumber: '',
    chequeDate: '',
    paymentGateway: '',
    gatewayReference: '',
    paymentReceivedBy: user?.fullName || '',
    verifyNow: hasPermission('payments.verify'),
    notes: '',
  });

  // Refund Modal
  const [refundTarget, setRefundTarget] = useState<PaymentRecord | null>(null);
  const [refundAmount, setRefundAmount] = useState(0);
  const [refundReason, setRefundReason] = useState('');
  const [refundMode, setRefundMode] = useState('Bank Transfer');
  const [refundRef, setRefundRef] = useState('');
  const [refundError, setRefundError] = useState('');
  const [refunding, setRefunding] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (modeFilter !== 'All') params.set('mode', modeFilter);
      if (statusFilter !== 'All') params.set('status', statusFilter);
      const [payRes, ordRes] = await Promise.all([
        apiFetch<{ data: PaymentRecord[] }>(`/api/payments?${params.toString()}`),
        apiFetch<{ data: OrderRecord[] }>('/api/orders'),
      ]);
      setPayments(payRes.data);
      setOrders(ordRes.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load payments');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, q, modeFilter, statusFilter]);

  useEffect(() => {
    const t = setTimeout(() => {
      void loadData();
    }, 150);
    return () => clearTimeout(t);
  }, [loadData]);

  useEffect(() => {
    if (initialOrderId && orders.length > 0) {
      const ord = orders.find((o) => o.id === initialOrderId);
      if (ord) {
        const bal = Number(ord.remainingBalance);
        setPayForm((f) => ({
          ...f,
          orderId: String(ord.id),
          amount: bal > 0 ? bal : Number(ord.grandTotal),
          paymentType: Number(ord.totalPaid) > 0 ? 'Final Instalment' : 'Full Payment',
          verifyNow: hasPermission('payments.verify'),
        }));
        setShowRecord(true);
        onClearInitialOrder?.();
      }
    }
  }, [initialOrderId, orders, hasPermission, onClearInitialOrder]);

  const selectedOrder = useMemo(
    () => orders.find((o) => String(o.id) === payForm.orderId) || null,
    [orders, payForm.orderId]
  );

  const previewCalc = useMemo(() => {
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
      currentPayment: payForm.amount,
    });
  }, [selectedOrder, payForm.amount]);

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecordError('');
    if (!payForm.orderId || payForm.amount <= 0) {
      setRecordError('Select an order and enter a positive payment amount.');
      return;
    }
    setRecording(true);
    try {
      const res = await apiFetch<{
        data: { payment: PaymentRecord; receipt: { id: number } | null };
      }>('/api/payments', {
        method: 'POST',
        body: JSON.stringify({ ...payForm, orderId: Number(payForm.orderId) }),
      });
      setShowRecord(false);
      await loadData();
      if (res.data.receipt?.id) {
        onPreviewReceipt(res.data.receipt.id);
      }
    } catch (err: unknown) {
      setRecordError(err instanceof Error ? err.message : 'Failed to record payment');
    } finally {
      setRecording(false);
    }
  };

  const handleVerify = async (paymentId: number, action: 'verify' | 'fail') => {
    try {
      const res = await apiFetch<{ data: { receipt?: { id: number } } }>(
        `/api/payments/${paymentId}/verify`,
        {
          method: 'PATCH',
          body: JSON.stringify({ action }),
        }
      );
      await loadData();
      if (action === 'verify' && res.data.receipt?.id) {
        onPreviewReceipt(res.data.receipt.id);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    }
  };

  const handleRefundSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refundTarget) return;
    setRefundError('');
    if (refundAmount <= 0 || !refundReason.trim()) {
      setRefundError('Refund amount and reason are required.');
      return;
    }
    setRefunding(true);
    try {
      await apiFetch(`/api/payments/${refundTarget.id}/refund`, {
        method: 'POST',
        body: JSON.stringify({
          amount: refundAmount,
          reason: refundReason.trim(),
          refundMode,
          referenceNumber: refundRef.trim(),
        }),
      });
      setRefundTarget(null);
      await loadData();
    } catch (err: unknown) {
      setRefundError(err instanceof Error ? err.message : 'Refund failed');
    } finally {
      setRefunding(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#25212B]">Payments &amp; Collections</h1>
          <p className="text-xs text-[#777481] mt-0.5">
            Track instalments, verify bank/UPI references, issue receipts, and process refunds
          </p>
        </div>
        {hasPermission('payments.collect') && (
          <button
            type="button"
            onClick={() => {
              setRecordError('');
              setShowRecord(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#310D35] rounded-lg hover:bg-[#46164C] whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Record Payment</span>
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white border border-[#E8E6EC] rounded-lg p-3 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[220px] flex items-center gap-2">
          <Search className="w-4 h-4 text-[#777481] shrink-0" />
          <input
            type="search"
            aria-label="Search payments"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search payment ID, order code, customer, UTR, or receipt number..."
            className="w-full text-sm bg-transparent focus:outline-none"
          />
        </div>
        <select
          aria-label="Filter by payment mode"
          value={modeFilter}
          onChange={(e) => setModeFilter(e.target.value)}
          className="px-3 py-1.5 text-xs border border-[#E8E6EC] rounded-lg bg-[#F7F8FA]"
        >
          <option value="All">All Modes</option>
          {PAYMENT_MODES.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <select
          aria-label="Filter by verification status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 text-xs border border-[#E8E6EC] rounded-lg bg-[#F7F8FA]"
        >
          <option value="All">All Statuses</option>
          <option value="Verified">Verified</option>
          <option value="Pending">Pending Verification</option>
          <option value="Failed">Failed</option>
          <option value="Refunded">Refunded</option>
        </select>
      </div>

      {error && <ErrorBanner message={error} onRetry={loadData} />}

      {loading ? (
        <TableSkeleton rows={6} cols={7} />
      ) : payments.length === 0 ? (
        <EmptyState
          title="No payment transactions found"
          description="Record a customer payment against an open order to verify and generate an official receipt."
          actionLabel={hasPermission('payments.collect') ? 'Record Payment' : undefined}
          onAction={hasPermission('payments.collect') ? () => setShowRecord(true) : undefined}
        />
      ) : (
        <div className="bg-white border border-[#E8E6EC] rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#F7F8FA] text-[#777481] border-b border-[#E8E6EC]">
                <tr>
                  <th className="py-3 px-4 text-left font-medium">Payment ID</th>
                  <th className="py-3 px-4 text-left font-medium">Order &amp; Customer</th>
                  <th className="py-3 px-4 text-left font-medium">Mode / Reference</th>
                  <th className="py-3 px-4 text-left font-medium">Type</th>
                  <th className="py-3 px-4 text-left font-medium">Verification</th>
                  <th className="py-3 px-4 text-right font-medium">Amount</th>
                  <th className="py-3 px-4 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E6EC]">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-[#F7F8FA]/80">
                    <td className="py-3 px-4 font-mono whitespace-nowrap">
                      <div className="font-medium text-[#25212B]">{p.paymentCode}</div>
                      <div className="text-[11px] text-[#777481]">{p.paymentDate} {p.paymentTime}</div>
                    </td>
                    <td className="py-3 px-4">
                      <button
                        type="button"
                        onClick={() => onOpenOrder(p.orderId)}
                        className="font-mono font-medium text-[#008C98] hover:underline"
                      >
                        {p.orderCode}
                      </button>
                      <div className="font-medium text-[#25212B]">{p.customerName}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium">{p.paymentMode}</div>
                      <div className="text-[11px] font-mono text-[#777481]">
                        {p.transactionId || p.upiReference || p.bankName || '—'}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-[#777481]">{p.paymentType}</td>
                    <td className="py-3 px-4"><StatusTag status={p.verificationStatus} /></td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-bold">
                      {formatInr(p.amount)}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-2.5">
                        {p.receiptId && (
                          <button
                            type="button"
                            onClick={() => onPreviewReceipt(p.receiptId!)}
                            className="inline-flex items-center gap-1 text-[#310D35] font-medium hover:underline"
                          >
                            <ReceiptText className="w-3.5 h-3.5" />
                            <span>{p.receiptNumber || 'Receipt'}</span>
                          </button>
                        )}
                        {!p.paymentVerified && p.verificationStatus === 'Pending' && hasPermission('payments.verify') && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleVerify(p.id, 'verify')}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-[#2F5E0E] bg-[#F1F8E9] border border-[#CBE5AD] rounded hover:bg-[#E4F2D3]"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Verify &amp; Issue</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleVerify(p.id, 'fail')}
                              aria-label={`Reject ${p.paymentCode}`}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-[#991B1B] bg-[#FEF2F2] border border-[#FECACA] rounded"
                            >
                              <XCircle className="w-3 h-3" />
                              <span>Fail</span>
                            </button>
                          </>
                        )}
                        {p.paymentVerified && p.verificationStatus === 'Verified' && hasPermission('payments.verify') && (
                          <button
                            type="button"
                            onClick={() => {
                              setRefundTarget(p);
                              setRefundAmount(Number(p.amount));
                              setRefundReason('');
                              setRefundError('');
                            }}
                            className="inline-flex items-center gap-1 text-[#991B1B] hover:underline"
                          >
                            <RefreshCw className="w-3 h-3" />
                            <span>Refund</span>
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

      {/* Record Payment Modal */}
      {showRecord && (
        <ModalShell
          title="Record Customer Payment"
          subtitle="Unverified payments remain Pending until verified by an authorized Accounts Manager or Admin."
          onClose={() => setShowRecord(false)}
          maxWidth="max-w-3xl"
        >
          <form onSubmit={handleRecordPayment} className="space-y-4">
            {recordError && <ErrorBanner message={recordError} />}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label htmlFor="pay-order" className="block text-xs font-medium text-[#25212B] mb-1">
                  Select Order *
                </label>
                <select
                  id="pay-order"
                  required
                  value={payForm.orderId}
                  onChange={(e) => {
                    const ord = orders.find((o) => String(o.id) === e.target.value);
                    setPayForm((f) => ({
                      ...f,
                      orderId: e.target.value,
                      amount: ord ? Number(ord.remainingBalance) || Number(ord.grandTotal) : 0,
                      paymentType: ord && Number(ord.totalPaid) > 0 ? 'Final Instalment' : 'Full Payment',
                    }));
                  }}
                  className="w-full px-3 py-2 text-sm border border-[#E8E6EC] rounded-lg"
                >
                  <option value="">Choose an order...</option>
                  {orders.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.orderCode} — {o.customerName} ({o.serviceName}) · Balance: {formatInr(o.remainingBalance)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="pay-amount" className="block text-xs font-medium text-[#25212B] mb-1">
                  Payment Amount (INR) *
                </label>
                <input
                  id="pay-amount"
                  type="number"
                  required
                  min="1"
                  step="0.01"
                  value={payForm.amount}
                  onChange={(e) => setPayForm((f) => ({ ...f, amount: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-[#E8E6EC] rounded-lg"
                />
              </div>

              <div>
                <label htmlFor="pay-type" className="block text-xs font-medium text-[#25212B] mb-1">
                  Payment Type
                </label>
                <select
                  id="pay-type"
                  value={payForm.paymentType}
                  onChange={(e) => setPayForm((f) => ({ ...f, paymentType: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-[#E8E6EC] rounded-lg"
                >
                  {PAYMENT_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="pay-mode" className="block text-xs font-medium text-[#25212B] mb-1">
                  Payment Mode *
                </label>
                <select
                  id="pay-mode"
                  value={payForm.paymentMode}
                  onChange={(e) => setPayForm((f) => ({ ...f, paymentMode: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-[#E8E6EC] rounded-lg"
                >
                  {PAYMENT_MODES.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="pay-date" className="block text-xs font-medium text-[#25212B] mb-1">
                    Date
                  </label>
                  <input
                    id="pay-date"
                    type="date"
                    value={payForm.paymentDate}
                    onChange={(e) => setPayForm((f) => ({ ...f, paymentDate: e.target.value }))}
                    className="w-full px-2.5 py-2 text-xs font-mono border border-[#E8E6EC] rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="pay-time" className="block text-xs font-medium text-[#25212B] mb-1">
                    Time
                  </label>
                  <input
                    id="pay-time"
                    type="time"
                    value={payForm.paymentTime}
                    onChange={(e) => setPayForm((f) => ({ ...f, paymentTime: e.target.value }))}
                    className="w-full px-2.5 py-2 text-xs font-mono border border-[#E8E6EC] rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="pay-tx" className="block text-xs font-medium text-[#25212B] mb-1">
                  Transaction / UTR ID
                </label>
                <input
                  id="pay-tx"
                  type="text"
                  value={payForm.transactionId}
                  onChange={(e) => setPayForm((f) => ({ ...f, transactionId: e.target.value }))}
                  placeholder="e.g., UTR632219847102"
                  className="w-full px-3 py-2 text-sm font-mono border border-[#E8E6EC] rounded-lg"
                />
              </div>

              <div>
                <label htmlFor="pay-upi" className="block text-xs font-medium text-[#25212B] mb-1">
                  UPI Reference / Bank Name
                </label>
                <input
                  id="pay-upi"
                  type="text"
                  value={payForm.upiReference || payForm.bankName}
                  onChange={(e) =>
                    setPayForm((f) => ({
                      ...f,
                      upiReference: f.paymentMode === 'UPI' ? e.target.value : f.upiReference,
                      bankName: f.paymentMode !== 'UPI' ? e.target.value : f.bankName,
                    }))
                  }
                  placeholder="UPI Ref No or Bank Name"
                  className="w-full px-3 py-2 text-sm border border-[#E8E6EC] rounded-lg"
                />
              </div>
            </div>

            {previewCalc && selectedOrder && (
              <div className="p-3.5 bg-[#F7F8FA] border border-[#E8E6EC] rounded-lg grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-[#777481] block">Order Grand Total</span>
                  <strong className="font-mono tabular-nums">{formatInr(previewCalc.grandTotal)}</strong>
                </div>
                <div>
                  <span className="text-[#777481] block">Previously Paid</span>
                  <strong className="font-mono tabular-nums">{formatInr(previewCalc.previouslyPaid)}</strong>
                </div>
                <div>
                  <span className="text-[#777481] block">After This Payment</span>
                  <strong className="font-mono tabular-nums text-[#008C98]">{formatInr(previewCalc.totalPaid)}</strong>
                </div>
                <div>
                  <span className="text-[#777481] block">Remaining Balance</span>
                  <strong className="font-mono tabular-nums text-[#310D35]">
                    {formatInr(previewCalc.remainingBalance)}
                  </strong>
                </div>
              </div>
            )}

            {hasPermission('payments.verify') && (
              <label className="flex items-center gap-2.5 p-3 bg-[#F1F8E9] border border-[#CBE5AD] rounded-lg text-xs text-[#2F5E0E] cursor-pointer">
                <input
                  type="checkbox"
                  checked={payForm.verifyNow}
                  onChange={(e) => setPayForm((f) => ({ ...f, verifyNow: e.target.checked }))}
                  className="rounded border-[#CBE5AD]"
                />
                <span>
                  I confirm bank/gateway settlement is verified — mark payment Verified &amp; issue Receipt immediately.
                </span>
              </label>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-[#E8E6EC]">
              <button
                type="button"
                onClick={() => setShowRecord(false)}
                className="px-4 py-2 text-xs font-medium text-[#25212B] border border-[#E8E6EC] rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={recording}
                className="px-5 py-2 text-xs font-semibold text-white bg-[#310D35] rounded-lg hover:bg-[#46164C] disabled:opacity-60"
              >
                {recording ? 'Saving...' : payForm.verifyNow ? 'Verify & Issue Receipt' : 'Save as Pending Verification'}
              </button>
            </div>
          </form>
        </ModalShell>
      )}

      {/* Refund Modal */}
      {refundTarget && (
        <ModalShell
          title={`Process Refund (${refundTarget.paymentCode})`}
          subtitle={`Original verified amount: ${formatInr(refundTarget.amount)}`}
          onClose={() => setRefundTarget(null)}
          maxWidth="max-w-lg"
        >
          <form onSubmit={handleRefundSubmit} className="space-y-4">
            {refundError && <ErrorBanner message={refundError} />}
            <div>
              <label htmlFor="ref-amt" className="block text-xs font-medium text-[#25212B] mb-1">
                Refund Amount (INR) *
              </label>
              <input
                id="ref-amt"
                type="number"
                required
                min="1"
                max={Number(refundTarget.amount)}
                step="0.01"
                value={refundAmount}
                onChange={(e) => setRefundAmount(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 text-sm font-mono border border-[#E8E6EC] rounded-lg"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="ref-mode" className="block text-xs font-medium text-[#25212B] mb-1">
                  Refund Mode
                </label>
                <select
                  id="ref-mode"
                  value={refundMode}
                  onChange={(e) => setRefundMode(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#E8E6EC] rounded-lg"
                >
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="UPI">UPI</option>
                  <option value="Payment Gateway">Payment Gateway</option>
                </select>
              </div>
              <div>
                <label htmlFor="ref-utr" className="block text-xs font-medium text-[#25212B] mb-1">
                  Refund Reference
                </label>
                <input
                  id="ref-utr"
                  type="text"
                  value={refundRef}
                  onChange={(e) => setRefundRef(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-[#E8E6EC] rounded-lg"
                />
              </div>
            </div>
            <div>
              <label htmlFor="ref-reason" className="block text-xs font-medium text-[#25212B] mb-1">
                Reason for Refund *
              </label>
              <textarea
                id="ref-reason"
                rows={2}
                required
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-[#E8E6EC] rounded-lg"
              />
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-[#E8E6EC]">
              <button
                type="button"
                onClick={() => setRefundTarget(null)}
                className="px-4 py-2 text-xs font-medium border border-[#E8E6EC] rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={refunding}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#991B1B] rounded-lg"
              >
                {refunding ? 'Processing...' : 'Confirm Refund'}
              </button>
            </div>
          </form>
        </ModalShell>
      )}
    </div>
  );
}
