import React, { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  History,
  Mail,
  MessageSquare,
  Printer,
  RotateCcw,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { ReceiptDetailBundle } from '../types/portal';
import { formatInr } from '../utils/finance';
import { downloadReceiptPdf } from '../utils/pdfReceipt';
import { BRAND_LOGO_URL, ErrorBanner, StatusTag } from './UiPrimitives';

export function ReceiptPreviewModal({
  receiptId,
  onClose,
  onRevised,
}: {
  receiptId: number;
  onClose: () => void;
  onRevised?: (newReceiptId: number) => void;
}) {
  const { apiFetch, hasPermission } = useAuth();
  const [bundle, setBundle] = useState<ReceiptDetailBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [showRevise, setShowRevise] = useState(false);
  const [reviseReason, setReviseReason] = useState('');
  const [reviseSubmitting, setReviseSubmitting] = useState(false);
  const [shareNote, setShareNote] = useState('');

  const loadBundle = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<{ data: ReceiptDetailBundle }>(`/api/receipts/${receiptId}`);
      setBundle(res.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load receipt');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadBundle();
  }, [receiptId]);

  const handleDownloadPdf = async () => {
    if (!bundle) return;
    await downloadReceiptPdf(bundle);
    await apiFetch(`/api/receipts/${bundle.receipt.id}/reprint`, { method: 'POST' }).catch(() => undefined);
    void loadBundle();
  };

  const handlePrint = async () => {
    if (!bundle) return;
    await apiFetch(`/api/receipts/${bundle.receipt.id}/reprint`, { method: 'POST' }).catch(() => undefined);
    window.print();
  };

  const handleCopyVerifyLink = async () => {
    if (!bundle) return;
    try {
      await navigator.clipboard.writeText(bundle.verificationUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setShareNote(`Verification link: ${bundle.verificationUrl}`);
    }
  };

  const handleEmailShare = () => {
    if (!bundle) return;
    const subject = encodeURIComponent(
      `Payment Receipt ${bundle.receipt.receiptNumber} — ${bundle.companySettings?.companyName || 'eDrafter'}`
    );
    const body = encodeURIComponent(
      `Dear ${bundle.customer.fullName},\n\nThank you for your payment of ${formatInr(bundle.receipt.currentPayment)} towards ${bundle.order.serviceName} (Order ${bundle.order.orderCode}).\n\nReceipt Number: ${bundle.receipt.receiptNumber}\nPayment Status: ${bundle.receipt.paymentStatus}\nVerify Receipt Online: ${bundle.verificationUrl}\n\nRegards,\n${bundle.companySettings?.companyName || 'eDrafter Legal Solutions'}`
    );
    window.location.href = `mailto:${bundle.customer.email || ''}?subject=${subject}&body=${body}`;
    setShareNote(`Prepared email draft for ${bundle.customer.email || bundle.customer.fullName}`);
  };

  const handleWhatsAppShare = () => {
    if (!bundle) return;
    const phone = (bundle.customer.mobileNumber || '').replace(/\D/g, '');
    const formattedPhone = phone.length === 10 ? `91${phone}` : phone;
    const text = encodeURIComponent(
      `Dear ${bundle.customer.fullName}, we have received your payment of ${formatInr(bundle.receipt.currentPayment)} for ${bundle.order.serviceName} (${bundle.order.orderCode}).\nReceipt No: ${bundle.receipt.receiptNumber}\nVerify online: ${bundle.verificationUrl}`
    );
    setShareNote(`WhatsApp message prepared for +${formattedPhone}: ${decodeURIComponent(text)}`);
    const a = document.createElement('a');
    a.href = `https://wa.me/${formattedPhone}?text=${text}`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.click();
  };

  const handleReviseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bundle || !reviseReason.trim()) return;
    setReviseSubmitting(true);
    try {
      const res = await apiFetch<{ data: { id: number; receiptNumber: string } }>(
        `/api/receipts/${bundle.receipt.id}/cancel-and-reissue`,
        {
          method: 'POST',
          body: JSON.stringify({ reason: reviseReason.trim() }),
        }
      );
      setShowRevise(false);
      setReviseReason('');
      if (onRevised) {
        onRevised(res.data.id);
      } else {
        void loadBundle();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to revise receipt');
    } finally {
      setReviseSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#25212B]/60 overflow-y-auto p-4 md:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Payment Receipt Preview"
    >
      <div className="max-w-5xl mx-auto">
        {/* Action Bar (hidden during print) */}
        <div className="no-print flex flex-wrap items-center justify-between gap-3 bg-white border border-[#E8E6EC] rounded-t-xl px-5 py-3.5">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-[#25212B]">
              {bundle ? `Receipt ${bundle.receipt.receiptNumber}` : 'Receipt Preview'}
            </h2>
            {bundle && <StatusTag status={bundle.receipt.status} />}
            {bundle && (
              <span className="text-xs text-[#777481] font-mono tabular-nums">
                Rev {bundle.receipt.revisionNumber} · Reprints: {bundle.receipt.reprintCount}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {bundle && (
              <>
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#310D35] rounded-lg hover:bg-[#46164C] whitespace-nowrap shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download PDF</span>
                </button>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#25212B] bg-[#F7F8FA] border border-[#E8E6EC] rounded-lg hover:bg-[#EFECEF] whitespace-nowrap shrink-0"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print A4</span>
                </button>
                <button
                  type="button"
                  onClick={handleEmailShare}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#25212B] bg-white border border-[#E8E6EC] rounded-lg hover:bg-[#F7F8FA] whitespace-nowrap shrink-0"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>Email</span>
                </button>
                <button
                  type="button"
                  onClick={handleWhatsAppShare}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#005F68] bg-[#E6F6F8] border border-[#B2E1E6] rounded-lg hover:bg-[#D5EFF2] whitespace-nowrap shrink-0"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>WhatsApp</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopyVerifyLink}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#25212B] bg-white border border-[#E8E6EC] rounded-lg hover:bg-[#F7F8FA] whitespace-nowrap shrink-0"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-[#2F5E0E]" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied Link' : 'Copy Verify URL'}</span>
                </button>
                {hasPermission('receipts.manage') && bundle.receipt.status === 'Issued' && (
                  <button
                    type="button"
                    onClick={() => setShowRevise((v) => !v)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#991B1B] bg-[#FEF2F2] border border-[#FECACA] rounded-lg hover:bg-[#FEE2E2] whitespace-nowrap shrink-0"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Supersede & Reissue</span>
                  </button>
                )}
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close receipt preview"
              className="p-1.5 text-[#777481] hover:text-[#25212B] rounded-lg hover:bg-[#F7F8FA]"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Share or Revision inline panels */}
        {shareNote && (
          <div className="no-print bg-[#E6F6F8] border-x border-b border-[#B2E1E6] px-5 py-2.5 text-xs text-[#005F68] flex items-center justify-between gap-3">
            <span className="truncate">{shareNote}</span>
            <button type="button" onClick={() => setShareNote('')} className="underline shrink-0">
              Dismiss
            </button>
          </div>
        )}

        {showRevise && bundle && (
          <form
            onSubmit={handleReviseSubmit}
            className="no-print bg-[#FEF2F2] border-x border-b border-[#FECACA] px-5 py-4 flex flex-col sm:flex-row items-start sm:items-end gap-3"
          >
            <div className="flex-1 w-full">
              <label htmlFor="revise-reason" className="block text-xs font-medium text-[#991B1B] mb-1">
                Reason for Superseding {bundle.receipt.receiptNumber} (Audit-logged; original stays immutable)
              </label>
              <input
                id="revise-reason"
                type="text"
                required
                value={reviseReason}
                onChange={(e) => setReviseReason(e.target.value)}
                placeholder="e.g., Customer GSTIN update requested for invoice alignment"
                className="w-full px-3 py-2 text-sm bg-white border border-[#FECACA] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#310D35]"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={reviseSubmitting}
                className="px-4 py-2 text-xs font-medium text-white bg-[#991B1B] rounded-lg hover:bg-[#7F1D1D] disabled:opacity-50 whitespace-nowrap"
              >
                {reviseSubmitting ? 'Issuing Revision...' : 'Confirm & Issue New Revision'}
              </button>
              <button
                type="button"
                onClick={() => setShowRevise(false)}
                className="px-3 py-2 text-xs font-medium text-[#25212B] bg-white border border-[#E8E6EC] rounded-lg"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Body */}
        <div className="bg-[#F7F8FA] p-4 md:p-8 rounded-b-xl border-x border-b border-[#E8E6EC]">
          {loading && (
            <div className="bg-white border border-[#E8E6EC] rounded-lg p-12 text-center text-sm text-[#777481]">
              Generating A4 Payment Receipt...
            </div>
          )}
          {error && <ErrorBanner message={error} onRetry={loadBundle} />}

          {!loading && bundle && (
            <div className="space-y-6">
              {/* A4 Portrait Printable Sheet */}
              <article className="print-only-sheet relative bg-white border border-[#E8E6EC] max-w-[210mm] mx-auto p-7 md:p-10 text-[#25212B]">
                {/* Top Purple + Teal Accent Bar */}
                <div className="flex h-1.5 -mx-7 md:-mx-10 -mt-7 md:-mt-10 mb-6">
                  <div className="w-2/3 bg-[#310D35]" />
                  <div className="w-1/3 bg-[#008C98]" />
                </div>

                {bundle.receipt.status === 'Superseded' && (
                  <div className="mb-5 p-3 bg-[#FEF2F2] border border-[#FECACA] rounded text-xs text-[#991B1B] font-medium">
                    SUPERSEDED RECEIPT — Replaced by newer revision. Reason: {bundle.receipt.cancellationReason}
                  </div>
                )}

                {/* HEADER */}
                <header className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-5 border-b border-[#E8E6EC]">
                  <div>
                    <img
                      src={bundle.companySettings?.logoUrl || BRAND_LOGO_URL}
                      alt="eDrafter Legal Solutions"
                      referrerPolicy="no-referrer"
                      className="h-12 w-auto object-contain"
                    />
                    <p className="mt-2 text-xs text-[#777481]">
                      {bundle.companySettings?.parentCompany}
                    </p>
                  </div>
                  <div className="sm:text-right text-xs text-[#777481] space-y-0.5 max-w-sm">
                    <p className="text-sm font-semibold text-[#25212B]">
                      {bundle.companySettings?.companyName || 'eDrafter Legal Solutions'}
                    </p>
                    <p>{bundle.companySettings?.officeAddress || bundle.companySettings?.registeredAddress}</p>
                    <p>
                      Ph: {bundle.companySettings?.phone} · {bundle.companySettings?.email}
                    </p>
                    <p className="font-mono">
                      GSTIN: {bundle.companySettings?.gstin || 'N/A'} · PAN: {bundle.companySettings?.pan || 'N/A'}
                    </p>
                    <p>{bundle.companySettings?.website}</p>
                  </div>
                </header>

                {/* TITLE STRIP */}
                <div className="my-5 flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-[#F7F8FA] border border-[#310D35]/20 rounded-md">
                  <div>
                    <h1 className="text-base font-bold tracking-wide text-[#310D35]">PAYMENT RECEIPT</h1>
                    <p className="text-xs text-[#777481]">
                      System-generated acknowledgement of payment received
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-xs text-[#777481]">Receipt Number</p>
                      <p className="text-sm font-bold font-mono tabular-nums text-[#310D35]">
                        {bundle.receipt.receiptNumber}
                      </p>
                    </div>
                    <StatusTag status={bundle.receipt.paymentStatus} />
                  </div>
                </div>

                {/* CUSTOMER & RECEIPT/ORDER INFO */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-3 text-xs">
                  <div className="space-y-1.5">
                    <h2 className="text-xs font-bold tracking-wide text-[#310D35] pb-1 border-b border-[#E8E6EC]">
                      CUSTOMER INFORMATION
                    </h2>
                    <p className="text-sm font-semibold text-[#25212B]">{bundle.customer.fullName}</p>
                    {bundle.customer.businessName && (
                      <p className="text-[#25212B] font-medium">{bundle.customer.businessName}</p>
                    )}
                    <p className="text-[#777481]">
                      Mobile: <span className="font-mono text-[#25212B]">{bundle.customer.mobileNumber}</span>
                      {bundle.customer.email ? ` · ${bundle.customer.email}` : ''}
                    </p>
                    {bundle.customer.billingAddress && (
                      <p className="text-[#777481]">
                        {bundle.customer.billingAddress}, {bundle.customer.city}, {bundle.customer.state}{' '}
                        {bundle.customer.pincode}
                      </p>
                    )}
                    {bundle.customer.gstin && (
                      <p className="font-mono text-[#25212B]">Customer GSTIN: {bundle.customer.gstin}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <h2 className="text-xs font-bold tracking-wide text-[#310D35] pb-1 border-b border-[#E8E6EC]">
                      RECEIPT & ORDER DETAILS
                    </h2>
                    <div className="grid grid-cols-2 gap-y-1">
                      <span className="text-[#777481]">Receipt Date:</span>
                      <span className="font-mono tabular-nums text-right">{bundle.receipt.receiptDate}</span>
                      <span className="text-[#777481]">Order ID:</span>
                      <span className="font-mono tabular-nums text-right font-medium text-[#008C98]">
                        {bundle.order.orderCode}
                      </span>
                      <span className="text-[#777481]">Order Date:</span>
                      <span className="font-mono tabular-nums text-right">{bundle.order.orderDate}</span>
                      <span className="text-[#777481]">Service:</span>
                      <span className="text-right font-medium">{bundle.order.serviceName}</span>
                      <span className="text-[#777481]">Document:</span>
                      <span className="text-right">
                        {bundle.order.documentName}
                        {bundle.order.documentReferenceNumber ? ` (${bundle.order.documentReferenceNumber})` : ''}
                      </span>
                    </div>
                  </div>
                </div>

                {/* PAYMENT BREAKDOWN TABLE */}
                <div className="mt-5">
                  <table className="w-full text-xs border border-[#E8E6EC]">
                    <thead>
                      <tr className="bg-[#310D35] text-white">
                        <th className="py-2.5 px-3 text-left font-semibold w-14">S.No.</th>
                        <th className="py-2.5 px-3 text-left font-semibold">Particulars</th>
                        <th className="py-2.5 px-3 text-right font-semibold w-36">Amount (INR)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E8E6EC]">
                      {bundle.items.map((item) => (
                        <tr key={item.id}>
                          <td className="py-2 px-3 font-mono tabular-nums text-[#777481]">{item.sNo}</td>
                          <td className="py-2 px-3 text-[#25212B]">{item.particulars}</td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums font-medium">
                            {formatInr(item.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-[#F7F8FA] border-t border-[#E8E6EC] font-semibold">
                        <td className="py-2 px-3" />
                        <td className="py-2 px-3 text-[#25212B]">Taxable Amount</td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums">
                          {formatInr(bundle.receipt.taxableAmount)}
                        </td>
                      </tr>
                      <tr className="bg-[#F7F8FA] border-t border-[#E8E6EC] font-bold text-sm">
                        <td className="py-2.5 px-3" />
                        <td className="py-2.5 px-3 text-[#310D35]">Grand Total</td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#310D35]">
                          {formatInr(bundle.receipt.grandTotal)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* TRANSACTION & PAYMENT SUMMARY */}
                <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
                  <div className="p-3.5 bg-[#F7F8FA] border border-[#E8E6EC] rounded-md space-y-1.5">
                    <h3 className="font-bold text-[#310D35] mb-2">TRANSACTION INFORMATION</h3>
                    <div className="flex justify-between">
                      <span className="text-[#777481]">Payment Mode:</span>
                      <span className="font-medium">{bundle.payment.paymentMode}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#777481]">Payment Type:</span>
                      <span className="font-medium">{bundle.receipt.paymentType}</span>
                    </div>
                    {bundle.payment.transactionId && (
                      <div className="flex justify-between">
                        <span className="text-[#777481]">Transaction ID:</span>
                        <span className="font-mono">{bundle.payment.transactionId}</span>
                      </div>
                    )}
                    {bundle.payment.upiReference && (
                      <div className="flex justify-between">
                        <span className="text-[#777481]">UPI Reference:</span>
                        <span className="font-mono">{bundle.payment.upiReference}</span>
                      </div>
                    )}
                    {bundle.payment.bankName && (
                      <div className="flex justify-between">
                        <span className="text-[#777481]">Bank / Gateway:</span>
                        <span>{bundle.payment.bankName}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-[#777481]">Payment Date & Time:</span>
                      <span className="font-mono tabular-nums">
                        {bundle.payment.paymentDate} {bundle.payment.paymentTime}
                      </span>
                    </div>
                  </div>

                  <div className="p-3.5 bg-[#F7F8FA] border border-[#E8E6EC] rounded-md space-y-1.5">
                    <h3 className="font-bold text-[#310D35] mb-2">PAYMENT SUMMARY</h3>
                    <div className="flex justify-between">
                      <span className="text-[#777481]">Previously Paid:</span>
                      <span className="font-mono tabular-nums">{formatInr(bundle.receipt.previouslyPaid)}</span>
                    </div>
                    <div className="flex justify-between font-semibold text-[#008C98]">
                      <span>Current Payment Received:</span>
                      <span className="font-mono tabular-nums">{formatInr(bundle.receipt.currentPayment)}</span>
                    </div>
                    <div className="flex justify-between font-semibold">
                      <span>Total Amount Paid:</span>
                      <span className="font-mono tabular-nums">{formatInr(bundle.receipt.totalPaid)}</span>
                    </div>
                    <div className="flex justify-between pt-1.5 border-t border-[#E8E6EC] font-bold">
                      <span>Remaining Balance:</span>
                      <span className="font-mono tabular-nums text-[#310D35]">
                        {formatInr(bundle.receipt.remainingBalance)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* AMOUNT IN WORDS */}
                <div className="mt-4 px-4 py-2.5 bg-[#E6F6F8] border border-[#B2E1E6] rounded text-xs">
                  <span className="font-semibold text-[#005F68]">Amount Received in Words: </span>
                  <span className="font-medium text-[#25212B]">{bundle.receipt.amountInWords}</span>
                </div>

                {/* FOOTER: TERMS + QR CODE + SIGNATORY */}
                <footer className="mt-6 pt-5 border-t border-[#E8E6EC] flex flex-col sm:flex-row justify-between gap-6">
                  <div className="flex-1 space-y-2">
                    <p className="text-xs font-semibold text-[#25212B]">
                      Received with thanks. We acknowledge receipt of the above-mentioned payment.
                    </p>
                    <ul className="text-[11px] text-[#777481] space-y-0.5 list-disc pl-4">
                      {(bundle.companySettings?.termsAndConditions || []).map((term, idx) => (
                        <li key={idx}>{term}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="flex sm:flex-col items-center sm:items-end justify-between gap-4 shrink-0">
                    <div className="text-center border border-[#E8E6EC] p-2 rounded bg-white">
                      {bundle.qrCodeDataUrl && (
                        <img
                          src={bundle.qrCodeDataUrl}
                          alt="QR code for online receipt verification"
                          className="w-24 h-24 mx-auto"
                        />
                      )}
                      <p className="text-[10px] text-[#777481] mt-1">Scan to Verify</p>
                      <a
                        href={`/verify-receipt/${bundle.receipt.verificationToken}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="no-print inline-flex items-center gap-1 text-[10px] text-[#008C98] hover:underline mt-0.5"
                      >
                        <span>Verify Page</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>

                    <div className="text-right">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-[#008C98]/40 rounded text-[10px] font-semibold text-[#008C98] mb-2">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>DIGITALLY VERIFIED RECEIPT</span>
                      </div>
                      <p className="text-xs font-semibold text-[#310D35]">
                        For {bundle.companySettings?.companyName || 'eDrafter Legal Solutions'}
                      </p>
                      <p className="text-[11px] text-[#777481]">
                        {bundle.companySettings?.authorizedSignatory || 'Authorized Signatory'}
                      </p>
                    </div>
                  </div>
                </footer>

                <div className="mt-4 pt-3 border-t border-[#E8E6EC] flex flex-wrap justify-between gap-2 text-[11px] text-[#777481]">
                  <span>{bundle.companySettings?.footerText}</span>
                  <span>
                    Support: {bundle.companySettings?.phone} · {bundle.companySettings?.email}
                  </span>
                </div>
              </article>

              {/* Receipt Audit Trail (non-print) */}
              {bundle.history.length > 0 && (
                <section className="no-print max-w-[210mm] mx-auto bg-white border border-[#E8E6EC] rounded-lg p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#310D35] mb-2">
                    <History className="w-4 h-4" />
                    <span>Receipt Audit & Reprint Trail</span>
                  </div>
                  <div className="divide-y divide-[#E8E6EC] text-xs">
                    {bundle.history.map((log) => (
                      <div key={log.id} className="py-2 flex items-center justify-between gap-4">
                        <span className="text-[#25212B]">{log.summary}</span>
                        <span className="text-[#777481] font-mono tabular-nums whitespace-nowrap shrink-0">
                          {log.actorName} · {new Date(log.createdAt).toLocaleString('en-IN')}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
