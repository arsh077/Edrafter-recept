import React, { useCallback, useEffect, useState } from 'react';
import { Calendar, Eye, Plus, ReceiptText } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { OrderRecord, PaymentRecord, PortalTab } from '../types/portal';
import { formatInr } from '../utils/finance';
import { ErrorBanner, StatusTag, TableSkeleton } from './UiPrimitives';

interface DashboardPayload {
  range: { fromDate: string; toDate: string };
  kpis: {
    totalOrders: number;
    allTimeOrders: number;
    totalCustomers: number;
    totalPaymentsReceived: number;
    todaysCollections: number;
    monthlyCollections: number;
    pendingPaymentsAmount: number;
    partiallyPaidOrders: number;
    completedOrders: number;
    pendingDocuments: number;
    totalRefunds: number;
  };
  charts: {
    dailyCollectionChart: Array<{ label: string; date: string; amount: number }>;
    monthlyRevenueChart: Array<{ month: string; amount: number }>;
    paymentMethodChart: Array<{ mode: string; count: number; amount: number }>;
    orderStatusChart: Array<{ status: string; count: number }>;
    serviceRevenueChart: Array<{ category: string; amount: number }>;
  };
  recentOrders: OrderRecord[];
  recentTransactions: PaymentRecord[];
}

const DATE_PRESETS = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '7d', label: 'Last 7 Days' },
  { id: 'month', label: 'This Month' },
  { id: 'prev_month', label: 'Previous Month' },
  { id: 'all', label: 'All Time' },
  { id: 'custom', label: 'Custom Range' },
];

export function DashboardView({
  onNavigate,
  onOpenOrder,
  onPreviewReceipt,
  onNewOrder,
}: {
  onNavigate: (tab: PortalTab) => void;
  onOpenOrder: (orderId: number) => void;
  onPreviewReceipt: (receiptId: number) => void;
  onNewOrder: () => void;
}) {
  const { apiFetch, hasPermission } = useAuth();
  const [range, setRange] = useState('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ range });
      if (range === 'custom' && customFrom && customTo) {
        params.set('from', customFrom);
        params.set('to', customTo);
      }
      const res = await apiFetch<{ data: DashboardPayload }>(`/api/dashboard?${params.toString()}`);
      setData(res.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, range, customFrom, customTo]);

  useEffect(() => {
    if (range === 'custom' && (!customFrom || !customTo)) return;
    void loadDashboard();
  }, [loadDashboard, range, customFrom, customTo]);

  const kpis = data?.kpis;
  const maxDaily = Math.max(1, ...(data?.charts.dailyCollectionChart.map((d) => d.amount) || [1]));
  const maxMonthly = Math.max(1, ...(data?.charts.monthlyRevenueChart.map((d) => d.amount) || [1]));
  const maxService = Math.max(1, ...(data?.charts.serviceRevenueChart.map((d) => d.amount) || [1]));
  const totalModeAmt = Math.max(
    1,
    data?.charts.paymentMethodChart.reduce((s, m) => s + m.amount, 0) || 1
  );

  return (
    <div className="space-y-6">
      {/* Header + Date Filter Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#25212B]">Operations &amp; Collections Overview</h1>
          <p className="text-xs text-[#777481] mt-0.5">
            Verified figures · Period: {data?.range.fromDate || '—'} to {data?.range.toDate || '—'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-white border border-[#E8E6EC] rounded-lg">
            {DATE_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setRange(p.id)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                  range === p.id
                    ? 'bg-[#310D35] text-white'
                    : 'text-[#777481] hover:text-[#25212B] hover:bg-[#F7F8FA]'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {hasPermission('orders.manage') && (
            <button
              type="button"
              onClick={onNewOrder}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#008C98] rounded-lg hover:bg-[#00747E] whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Create Order</span>
            </button>
          )}
        </div>
      </div>

      {range === 'custom' && (
        <div className="bg-white border border-[#E8E6EC] rounded-lg p-3.5 flex flex-wrap items-center gap-3">
          <Calendar className="w-4 h-4 text-[#777481]" />
          <label className="text-xs text-[#777481]" htmlFor="dash-from">
            From
          </label>
          <input
            id="dash-from"
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-[#E8E6EC] rounded"
          />
          <label className="text-xs text-[#777481]" htmlFor="dash-to">
            To
          </label>
          <input
            id="dash-to"
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-[#E8E6EC] rounded"
          />
        </div>
      )}

      {error && <ErrorBanner message={error} onRetry={loadDashboard} />}

      {/* 10 KPI Cards in clean 5x2 grid */}
      <section aria-label="Key Performance Indicators" className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3.5">
        {[
          { label: 'Total Orders', value: kpis ? String(kpis.totalOrders) : '—', sub: `${kpis?.allTimeOrders ?? 0} all-time`, accent: 'text-[#310D35]' },
          { label: 'Total Customers', value: kpis ? String(kpis.totalCustomers) : '—', sub: 'Registered clients', accent: 'text-[#25212B]' },
          { label: 'Total Payments Received', value: kpis ? formatInr(kpis.totalPaymentsReceived) : '—', sub: 'Verified in period', accent: 'text-[#008C98]' },
          { label: "Today's Collections", value: kpis ? formatInr(kpis.todaysCollections) : '—', sub: 'Verified today', accent: 'text-[#2F5E0E]' },
          { label: 'Monthly Collections', value: kpis ? formatInr(kpis.monthlyCollections) : '—', sub: 'Current month', accent: 'text-[#310D35]' },
          { label: 'Pending Payments', value: kpis ? formatInr(kpis.pendingPaymentsAmount) : '—', sub: 'Receivable balance', accent: 'text-[#8A5300]' },
          { label: 'Partially Paid Orders', value: kpis ? String(kpis.partiallyPaidOrders) : '—', sub: 'Instalments open', accent: 'text-[#005F68]' },
          { label: 'Completed Orders', value: kpis ? String(kpis.completedOrders) : '—', sub: 'Completed / Delivered', accent: 'text-[#2F5E0E]' },
          { label: 'Pending Documents', value: kpis ? String(kpis.pendingDocuments) : '—', sub: 'Awaiting approval', accent: 'text-[#8A5300]' },
          { label: 'Total Refunds', value: kpis ? formatInr(kpis.totalRefunds) : '—', sub: 'Processed refunds', accent: 'text-[#991B1B]' },
        ].map((card) => (
          <div key={card.label} className="bg-white border border-[#E8E6EC] rounded-lg p-4">
            <p className="text-xs text-[#777481] truncate">{card.label}</p>
            <p className={`mt-1.5 text-lg font-bold font-mono tabular-nums ${card.accent}`}>
              {card.value}
            </p>
            <p className="mt-1 text-[11px] text-[#777481]">{card.sub}</p>
          </div>
        ))}
      </section>

      {/* Charts Row 1: Daily Payment Collection + Monthly Revenue */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white border border-[#E8E6EC] rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-[#25212B]">Daily Payment Collection</h2>
              <p className="text-xs text-[#777481]">Verified INR collections over last 10 days</p>
            </div>
          </div>
          <div className="h-48 flex items-end gap-2 pt-4 border-b border-[#E8E6EC]">
            {(data?.charts.dailyCollectionChart || []).map((d) => {
              const heightPct = d.amount > 0 ? Math.max(8, Math.round((d.amount / maxDaily) * 100)) : 0;
              return (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group">
                  <span className="text-[10px] font-mono tabular-nums text-[#777481] opacity-0 group-hover:opacity-100 transition-opacity">
                    {d.amount > 0 ? `₹${Math.round(d.amount)}` : ''}
                  </span>
                  <div
                    className={`w-full max-w-[32px] rounded-t transition-all ${
                      d.amount > 0 ? 'bg-[#008C98]' : 'bg-[#E8E6EC]'
                    }`}
                    style={{ height: d.amount > 0 ? `${heightPct}%` : '2px' }}
                    title={`${d.date}: ${formatInr(d.amount)}`}
                  />
                  <span className="text-[10px] font-mono text-[#777481] pb-1">{d.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white border border-[#E8E6EC] rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-[#25212B]">Monthly Revenue</h2>
              <p className="text-xs text-[#777481]">Verified collections grouped by calendar month</p>
            </div>
          </div>
          <div className="space-y-3 pt-2">
            {(data?.charts.monthlyRevenueChart || []).map((m) => (
              <div key={m.month} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="font-mono text-[#25212B]">{m.month}</span>
                  <span className="font-mono font-semibold tabular-nums text-[#310D35]">
                    {formatInr(m.amount)}
                  </span>
                </div>
                <div className="h-2.5 bg-[#F7F8FA] rounded overflow-hidden">
                  <div
                    className="h-full bg-[#310D35] rounded"
                    style={{ width: `${Math.max(5, Math.round((m.amount / maxMonthly) * 100))}%` }}
                  />
                </div>
              </div>
            ))}
            {(!data?.charts.monthlyRevenueChart || data.charts.monthlyRevenueChart.length === 0) && (
              <p className="text-xs text-[#777481] py-8 text-center">No verified monthly collections yet.</p>
            )}
          </div>
        </div>
      </div>

      {/* Charts Row 2: Payment Method Distribution + Order Status + Service-wise Revenue */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="bg-white border border-[#E8E6EC] rounded-lg p-5">
          <h2 className="text-sm font-semibold text-[#25212B] mb-1">Payment Method Distribution</h2>
          <p className="text-xs text-[#777481] mb-4">Share of verified inflows by mode</p>
          <div className="space-y-3">
            {(data?.charts.paymentMethodChart || []).map((m) => {
              const pct = Math.round((m.amount / totalModeAmt) * 100);
              return (
                <div key={m.mode} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium text-[#25212B]">
                      {m.mode} <span className="text-[#777481]">({m.count})</span>
                    </span>
                    <span className="font-mono tabular-nums text-[#25212B]">
                      {formatInr(m.amount)} · {pct}%
                    </span>
                  </div>
                  <div className="h-2 bg-[#F7F8FA] rounded overflow-hidden">
                    <div className="h-full bg-[#83C441] rounded" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white border border-[#E8E6EC] rounded-lg p-5">
          <h2 className="text-sm font-semibold text-[#25212B] mb-1">Order Status Distribution</h2>
          <p className="text-xs text-[#777481] mb-4">Current operational pipeline</p>
          <div className="divide-y divide-[#E8E6EC] text-xs">
            {(data?.charts.orderStatusChart || []).map((s) => (
              <div key={s.status} className="py-2 flex items-center justify-between">
                <StatusTag status={s.status} />
                <span className="font-mono font-semibold tabular-nums text-[#25212B]">
                  {s.count} orders
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-[#E8E6EC] rounded-lg p-5">
          <h2 className="text-sm font-semibold text-[#25212B] mb-1">Service-wise Revenue</h2>
          <p className="text-xs text-[#777481] mb-4">Order value across legal categories</p>
          <div className="space-y-3">
            {(data?.charts.serviceRevenueChart || []).slice(0, 6).map((s) => (
              <div key={s.category} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-[#25212B] truncate pr-2">{s.category}</span>
                  <span className="font-mono tabular-nums text-[#008C98] shrink-0">
                    {formatInr(s.amount)}
                  </span>
                </div>
                <div className="h-2 bg-[#F7F8FA] rounded overflow-hidden">
                  <div
                    className="h-full bg-[#008C98] rounded"
                    style={{ width: `${Math.max(6, Math.round((s.amount / maxService) * 100))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Orders & Recent Transactions */}
      {loading ? (
        <TableSkeleton rows={5} cols={5} />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <section className="bg-white border border-[#E8E6EC] rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#E8E6EC]">
              <h2 className="text-sm font-semibold text-[#25212B]">Recent Orders</h2>
              <button
                type="button"
                onClick={() => onNavigate('orders')}
                className="text-xs font-medium text-[#008C98] hover:underline"
              >
                View all orders
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-[#F7F8FA] text-[#777481] border-b border-[#E8E6EC]">
                  <tr>
                    <th className="py-2.5 px-4 text-left font-medium">Order ID</th>
                    <th className="py-2.5 px-4 text-left font-medium">Customer</th>
                    <th className="py-2.5 px-4 text-left font-medium">Status</th>
                    <th className="py-2.5 px-4 text-right font-medium">Grand Total</th>
                    <th className="py-2.5 px-4 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8E6EC]">
                  {(data?.recentOrders || []).map((o) => (
                    <tr key={o.id} className="hover:bg-[#F7F8FA]/70">
                      <td className="py-2.5 px-4 font-mono font-medium text-[#310D35] whitespace-nowrap">
                        {o.orderCode}
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="font-medium text-[#25212B]">{o.customerName}</div>
                        <div className="text-[11px] text-[#777481] truncate max-w-[160px]">{o.serviceName}</div>
                      </td>
                      <td className="py-2.5 px-4">
                        <StatusTag status={o.orderStatus} />
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold">
                        {formatInr(o.grandTotal)}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => onOpenOrder(o.id)}
                          aria-label={`View order ${o.orderCode}`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-[#008C98] hover:underline"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Open</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="bg-white border border-[#E8E6EC] rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#E8E6EC]">
              <h2 className="text-sm font-semibold text-[#25212B]">Recent Transactions</h2>
              <button
                type="button"
                onClick={() => onNavigate('payments')}
                className="text-xs font-medium text-[#008C98] hover:underline"
              >
                View all payments
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-[#F7F8FA] text-[#777481] border-b border-[#E8E6EC]">
                  <tr>
                    <th className="py-2.5 px-4 text-left font-medium">Payment</th>
                    <th className="py-2.5 px-4 text-left font-medium">Customer</th>
                    <th className="py-2.5 px-4 text-left font-medium">Verification</th>
                    <th className="py-2.5 px-4 text-right font-medium">Amount</th>
                    <th className="py-2.5 px-4 text-right font-medium">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8E6EC]">
                  {(data?.recentTransactions || []).map((p) => (
                    <tr key={p.id} className="hover:bg-[#F7F8FA]/70">
                      <td className="py-2.5 px-4">
                        <div className="font-mono font-medium text-[#25212B]">{p.paymentCode}</div>
                        <div className="text-[11px] text-[#777481]">
                          {p.paymentMode} · {p.paymentDate}
                        </div>
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="font-medium text-[#25212B]">{p.customerName}</div>
                        <div className="text-[11px] font-mono text-[#777481]">{p.orderCode}</div>
                      </td>
                      <td className="py-2.5 px-4">
                        <StatusTag status={p.verificationStatus} />
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold">
                        {formatInr(p.amount)}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        {p.receiptId ? (
                          <button
                            type="button"
                            onClick={() => onPreviewReceipt(p.receiptId!)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-[#310D35] hover:underline"
                          >
                            <ReceiptText className="w-3.5 h-3.5" />
                            <span>Receipt</span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-[#777481]">Pending</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
