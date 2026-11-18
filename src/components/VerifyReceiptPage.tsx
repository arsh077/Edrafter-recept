import React, { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { formatInr } from '../utils/finance';
import { BRAND_LOGO_URL, StatusTag } from './UiPrimitives';

interface VerificationResult {
  verified: boolean;
  data?: {
    receiptNumber: string;
    receiptDate: string;
    receiptStatus: string;
    revisionNumber: number;
    cancellationReason?: string;
    customerNameMasked: string;
    mobileMasked: string;
    orderCode: string;
    serviceName: string;
    paymentAmount: number;
    grandTotal: number;
    paymentStatus: string;
    paymentMode: string;
    companyName: string;
    logoUrl: string;
    verifiedAt: string;
  };
  message?: string;
}

export function VerifyReceiptPage({
  token,
  onBackToPortal,
}: {
  token: string;
  onBackToPortal: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<VerificationResult | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/public/verify-receipt/${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((json) => {
        if (active) setResult(json);
      })
      .catch(() => {
        if (active) setResult({ verified: false, message: 'Unable to reach verification service.' });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  return (
    <div className="min-h-screen bg-[#F7F8FA] flex flex-col justify-between p-4 md:p-8">
      <div className="max-w-xl w-full mx-auto my-auto bg-white border border-[#E8E6EC] rounded-xl overflow-hidden">
        <div className="flex h-1.5">
          <div className="w-2/3 bg-[#310D35]" />
          <div className="w-1/3 bg-[#008C98]" />
        </div>
        <div className="p-6 md:p-8">
          <div className="flex items-center justify-between gap-4 pb-5 border-b border-[#E8E6EC]">
            <img
              src={result?.data?.logoUrl || BRAND_LOGO_URL}
              alt="eDrafter Legal Solutions"
              referrerPolicy="no-referrer"
              className="h-10 w-auto object-contain"
            />
            <span className="text-xs font-medium text-[#777481]">Online Receipt Verification</span>
          </div>

          {loading ? (
            <div className="py-12 text-center text-sm text-[#777481]">
              Verifying cryptographic receipt token...
            </div>
          ) : result?.data ? (
            <div className="mt-6 space-y-5">
              <div
                className={`p-4 rounded-lg border flex items-start gap-3 ${
                  result.verified
                    ? 'bg-[#F1F8E9] border-[#CBE5AD] text-[#2F5E0E]'
                    : 'bg-[#FEF2F2] border-[#FECACA] text-[#991B1B]'
                }`}
              >
                {result.verified ? (
                  <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
                ) : (
                  <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
                )}
                <div>
                  <h1 className="text-sm font-bold">
                    {result.verified
                      ? 'Authentic Payment Receipt Verified'
                      : `Receipt ${result.data.receiptStatus}`}
                  </h1>
                  <p className="text-xs mt-0.5">
                    {result.verified
                      ? `Issued officially by ${result.data.companyName}.`
                      : result.data.cancellationReason || 'This receipt has been superseded or cancelled.'}
                  </p>
                </div>
              </div>

              <dl className="divide-y divide-[#E8E6EC] text-sm border border-[#E8E6EC] rounded-lg">
                <div className="flex justify-between px-4 py-3">
                  <dt className="text-[#777481]">Receipt Number</dt>
                  <dd className="font-mono font-semibold text-[#310D35] tabular-nums">
                    {result.data.receiptNumber}
                  </dd>
                </div>
                <div className="flex justify-between px-4 py-3">
                  <dt className="text-[#777481]">Issue Date</dt>
                  <dd className="font-mono tabular-nums">{result.data.receiptDate}</dd>
                </div>
                <div className="flex justify-between px-4 py-3">
                  <dt className="text-[#777481]">Customer (Privacy Masked)</dt>
                  <dd className="font-medium text-right">
                    {result.data.customerNameMasked} · {result.data.mobileMasked}
                  </dd>
                </div>
                <div className="flex justify-between px-4 py-3">
                  <dt className="text-[#777481]">Order Reference</dt>
                  <dd className="font-mono text-[#008C98]">{result.data.orderCode}</dd>
                </div>
                <div className="flex justify-between px-4 py-3">
                  <dt className="text-[#777481]">Service</dt>
                  <dd className="text-right">{result.data.serviceName}</dd>
                </div>
                <div className="flex justify-between px-4 py-3">
                  <dt className="text-[#777481]">Receipt Amount</dt>
                  <dd className="font-mono font-bold tabular-nums text-[#25212B]">
                    {formatInr(result.data.paymentAmount)}
                  </dd>
                </div>
                <div className="flex justify-between items-center px-4 py-3">
                  <dt className="text-[#777481]">Payment Status</dt>
                  <dd>
                    <StatusTag status={result.data.paymentStatus} />
                  </dd>
                </div>
              </dl>

              <p className="text-[11px] text-[#777481] flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-[#008C98]" />
                <span>Sensitive customer details are masked for privacy compliance.</span>
              </p>
            </div>
          ) : (
            <div className="mt-6 p-5 bg-[#FEF2F2] border border-[#FECACA] rounded-lg text-sm text-[#991B1B]">
              <p className="font-semibold">Verification Failed</p>
              <p className="text-xs mt-1">{result?.message || 'No matching receipt found for this token.'}</p>
            </div>
          )}

          <div className="mt-6 pt-4 border-t border-[#E8E6EC]">
            <button
              type="button"
              onClick={onBackToPortal}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#310D35] hover:underline"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Return to eDrafter Portal</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
