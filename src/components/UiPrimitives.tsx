import React from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  RefreshCw,
  ShieldAlert,
  X,
} from 'lucide-react';

export const BRAND_LOGO_URL = '/assets/aistudio/eDrafter_s_Legal_Solutions_Logo_dcc73c7d.png';

export function StatusTag({ status }: { status: string }) {
  const s = (status || '').trim();
  let tone = 'bg-[#F7F8FA] text-[#25212B] border-[#E8E6EC]';
  let Icon = Clock;

  if (
    ['Paid', 'Verified', 'Issued', 'Completed', 'Delivered', 'Approved', 'Processed'].includes(s)
  ) {
    tone = 'bg-[#F1F8E9] text-[#2F5E0E] border-[#CBE5AD]';
    Icon = CheckCircle2;
  } else if (
    ['Partially Paid', 'Processing', 'Draft Preparation', 'Awaiting Customer Approval', 'Payment Confirmed'].includes(s)
  ) {
    tone = 'bg-[#E6F6F8] text-[#005F68] border-[#B2E1E6]';
    Icon = Clock;
  } else if (['Pending', 'Awaiting Payment', 'Pending Approval', 'New Order', 'Order Received'].includes(s)) {
    tone = 'bg-[#FFF8EB] text-[#8A5300] border-[#F4DCB0]';
    Icon = Clock;
  } else if (['Failed', 'Cancelled', 'Rejected', 'Superseded', 'Changes Requested'].includes(s)) {
    tone = 'bg-[#FEF2F2] text-[#991B1B] border-[#FECACA]';
    Icon = ShieldAlert;
  } else if (['Refunded', 'Dispatched'].includes(s)) {
    tone = 'bg-[#F5F0F6] text-[#310D35] border-[#DFD1E2]';
    Icon = RefreshCw;
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded border whitespace-nowrap shrink-0 ${tone}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{s}</span>
    </span>
  );
}

export function TableSkeleton({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-white border border-[#E8E6EC] rounded-lg overflow-hidden">
      <div className="divide-y divide-[#E8E6EC]">
        {Array.from({ length: rows }).map((_, rIdx) => (
          <div key={rIdx} className="grid gap-4 px-4 py-3.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {Array.from({ length: cols }).map((__, cIdx) => (
              <div key={cIdx} className="h-4 bg-[#F1EFF4] rounded animate-pulse" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-4 p-4 bg-[#FEF2F2] border border-[#FECACA] rounded-lg text-sm text-[#991B1B]"
    >
      <div className="flex items-center gap-2.5">
        <AlertCircle className="w-4 h-4 shrink-0" />
        <span>{message}</span>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="px-3 py-1.5 text-xs font-medium bg-white border border-[#FECACA] rounded hover:bg-[#FEE2E2] whitespace-nowrap shrink-0"
        >
          Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="bg-white border border-[#E8E6EC] rounded-lg p-10 text-center">
      <h3 className="text-base font-semibold text-[#25212B]">{title}</h3>
      <p className="mt-1.5 text-sm text-[#777481] max-w-md mx-auto">{description}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-5 inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-[#310D35] rounded-lg hover:bg-[#46164C] transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function ModalShell({
  title,
  subtitle,
  onClose,
  children,
  maxWidth = 'max-w-2xl',
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#25212B]/50 p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className={`w-full ${maxWidth} bg-white border border-[#E8E6EC] rounded-xl overflow-hidden my-6`}>
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-[#E8E6EC]">
          <div>
            <h2 className="text-lg font-semibold text-[#25212B]">{title}</h2>
            {subtitle && <p className="text-xs text-[#777481] mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            className="p-1.5 text-[#777481] hover:text-[#25212B] rounded-lg hover:bg-[#F7F8FA]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 max-h-[82vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
