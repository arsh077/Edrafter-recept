import React, { useCallback, useEffect, useState } from 'react';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { exportRowsToCsv, exportRowsToExcel, exportRowsToPdf } from '../utils/pdfReceipt';
import { EmptyState, ErrorBanner, TableSkeleton } from './UiPrimitives';

const REPORT_TYPES = [
  { id: 'daily', label: 'Daily Collection' },
  { id: 'weekly', label: 'Weekly Collection' },
  { id: 'monthly', label: 'Monthly Collection' },
  { id: 'annual', label: 'Annual Collection' },
  { id: 'service_revenue', label: 'Service-wise Revenue' },
  { id: 'customer_payments', label: 'Customer-wise Payments' },
  { id: 'pending_payments', label: 'Pending Payments' },
  { id: 'outstanding_balances', label: 'Outstanding Balances' },
  { id: 'refunds', label: 'Refund Reports' },
  { id: 'payment_modes', label: 'Payment Mode Reports' },
  { id: 'staff_collections', label: 'Staff Collection Reports' },
];

export function ReportsView() {
  const { apiFetch } = useAuth();
  const [reportType, setReportType] = useState('service_revenue');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rows, setRows] = useState<Array<Record<string, string | number>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ type: reportType });
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const res = await apiFetch<{ data: { rows: Array<Record<string, string | number>> } }>(
        `/api/reports?${params.toString()}`
      );
      setRows(res.data.rows);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load report');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, reportType, from, to]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const activeLabel = REPORT_TYPES.find((r) => r.id === reportType)?.label || 'Report';
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#25212B]">Financial &amp; Operations Reports</h1>
          <p className="text-xs text-[#777481] mt-0.5">
            Live database aggregations exportable to PDF, Excel, and CSV
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={rows.length === 0}
            onClick={() => exportRowsToPdf(`edrafter-${reportType}.pdf`, activeLabel, rows)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-[#310D35] rounded-lg hover:bg-[#46164C] disabled:opacity-50"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Export PDF</span>
          </button>
          <button
            type="button"
            disabled={rows.length === 0}
            onClick={() => exportRowsToExcel(`edrafter-${reportType}.xls`, activeLabel, rows)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#005F68] bg-[#E6F6F8] border border-[#B2E1E6] rounded-lg disabled:opacity-50"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Export Excel</span>
          </button>
          <button
            type="button"
            disabled={rows.length === 0}
            onClick={() => exportRowsToCsv(`edrafter-${reportType}.csv`, rows)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#25212B] bg-white border border-[#E8E6EC] rounded-lg hover:bg-[#F7F8FA] disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Report Selector & Date Filter */}
      <div className="bg-white border border-[#E8E6EC] rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {REPORT_TYPES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setReportType(r.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                reportType === r.id
                  ? 'bg-[#310D35] text-white'
                  : 'bg-[#F7F8FA] text-[#777481] hover:text-[#25212B]'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-[#E8E6EC] text-xs">
          <label htmlFor="rep-from" className="text-[#777481]">
            From Date:
          </label>
          <input
            id="rep-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="px-2.5 py-1.5 border border-[#E8E6EC] rounded"
          />
          <label htmlFor="rep-to" className="text-[#777481]">
            To Date:
          </label>
          <input
            id="rep-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="px-2.5 py-1.5 border border-[#E8E6EC] rounded"
          />
          {(from || to) && (
            <button
              type="button"
              onClick={() => {
                setFrom('');
                setTo('');
              }}
              className="text-[#008C98] underline"
            >
              Clear dates
            </button>
          )}
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={loadReport} />}

      {loading ? (
        <TableSkeleton rows={5} cols={4} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={`No records in ${activeLabel}`}
          description="Try clearing the date range filter or recording verified transactions."
        />
      ) : (
        <div className="bg-white border border-[#E8E6EC] rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#F7F8FA] text-[#777481] border-b border-[#E8E6EC]">
                <tr>
                  {headers.map((h) => (
                    <th key={h} className="py-3 px-4 text-left font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E6EC]">
                {rows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-[#F7F8FA]/80">
                    {headers.map((h) => {
                      const val = row[h];
                      const isNumeric = typeof val === 'number';
                      return (
                        <td
                          key={h}
                          className={`py-3 px-4 ${isNumeric ? 'font-mono tabular-nums font-semibold' : ''}`}
                        >
                          {isNumeric && !['Orders', 'Transactions', 'VerifiedTransactions'].includes(h)
                            ? `₹${val.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                            : String(val)}
                        </td>
                      );
                    })}
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
