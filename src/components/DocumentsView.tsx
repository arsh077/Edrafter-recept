import React, { useCallback, useEffect, useState } from 'react';
import { Download, FileUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { DocumentRecord, OrderRecord } from '../types/portal';
import { EmptyState, ErrorBanner, StatusTag, TableSkeleton } from './UiPrimitives';

export function DocumentsView() {
  const { apiFetch, token } = useAuth();
  const [docs, setDocs] = useState<DocumentRecord[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [orderId, setOrderId] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Draft Document');
  const [versionType, setVersionType] = useState('Draft');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const loadDocs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [docRes, ordRes] = await Promise.all([
        apiFetch<{ data: DocumentRecord[] }>('/api/documents'),
        apiFetch<{ data: OrderRecord[] }>('/api/orders'),
      ]);
      setDocs(docRes.data);
      setOrders(ordRes.data);
      if (!orderId && ordRes.data.length > 0) {
        setOrderId(String(ordRes.data[0].id));
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load documents');
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    void loadDocs();
  }, [loadDocs]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !orderId) return;
    setError('');
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('orderId', orderId);
      fd.append('title', title.trim() || file.name);
      fd.append('category', category);
      fd.append('versionType', versionType);
      await apiFetch('/api/documents', { method: 'POST', body: fd });
      setFile(null);
      setTitle('');
      await loadDocs();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Document upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleApprovalChange = async (docId: number, approvalStatus: string) => {
    try {
      await apiFetch(`/api/documents/${docId}/approval`, {
        method: 'PATCH',
        body: JSON.stringify({ approvalStatus }),
      });
      await loadDocs();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update approval');
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-[#25212B]">Document Management Center</h1>
        <p className="text-xs text-[#777481] mt-0.5">
          Upload Draft and Final legal documents (PDF, JPG, PNG, DOCX up to 10MB) and track customer approval
        </p>
      </div>

      {/* Upload Form */}
      <form
        onSubmit={handleUpload}
        className="bg-white border border-[#E8E6EC] rounded-lg p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end"
      >
        <div className="lg:col-span-2">
          <label htmlFor="doc-order" className="block text-xs font-medium text-[#25212B] mb-1">
            Order
          </label>
          <select
            id="doc-order"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            className="w-full px-3 py-2 text-xs border border-[#E8E6EC] rounded-lg"
          >
            {orders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.orderCode} — {o.customerName}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="doc-title" className="block text-xs font-medium text-[#25212B] mb-1">
            Document Title
          </label>
          <input
            id="doc-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Draft Agreement"
            className="w-full px-3 py-2 text-xs border border-[#E8E6EC] rounded-lg"
          />
        </div>

        <div>
          <label htmlFor="doc-version" className="block text-xs font-medium text-[#25212B] mb-1">
            Version Type
          </label>
          <select
            id="doc-version"
            value={versionType}
            onChange={(e) => setVersionType(e.target.value)}
            className="w-full px-3 py-2 text-xs border border-[#E8E6EC] rounded-lg"
          >
            <option value="Draft">Draft Version</option>
            <option value="Final">Final Version</option>
          </select>
        </div>

        <div>
          <label htmlFor="doc-file" className="block text-xs font-medium text-[#25212B] mb-1">
            Select File
          </label>
          <input
            id="doc-file"
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.docx"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="w-full text-xs"
          />
        </div>

        <button
          type="submit"
          disabled={!file || uploading}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#310D35] rounded-lg hover:bg-[#46164C] disabled:opacity-50"
        >
          <FileUp className="w-4 h-4" />
          <span>{uploading ? 'Uploading...' : 'Upload Document'}</span>
        </button>
      </form>

      {error && <ErrorBanner message={error} onRetry={loadDocs} />}

      {loading ? (
        <TableSkeleton rows={5} cols={6} />
      ) : docs.length === 0 ? (
        <EmptyState
          title="No documents uploaded yet"
          description="Upload a Draft or Final PDF/DOCX/image file above to attach it to an active legal order."
        />
      ) : (
        <div className="bg-white border border-[#E8E6EC] rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#F7F8FA] text-[#777481] border-b border-[#E8E6EC]">
                <tr>
                  <th className="py-3 px-4 text-left font-medium">Document</th>
                  <th className="py-3 px-4 text-left font-medium">Order / Customer</th>
                  <th className="py-3 px-4 text-left font-medium">Version</th>
                  <th className="py-3 px-4 text-left font-medium">Approval Status</th>
                  <th className="py-3 px-4 text-right font-medium">Size</th>
                  <th className="py-3 px-4 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E6EC]">
                {docs.map((d) => (
                  <tr key={d.id} className="hover:bg-[#F7F8FA]/80">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-[#25212B]">{d.title}</div>
                      <div className="text-[11px] text-[#777481]">{d.originalName}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-mono text-[#008C98]">{d.orderCode}</div>
                      <div className="text-[11px] text-[#777481]">{d.customerName}</div>
                    </td>
                    <td className="py-3 px-4">
                      <StatusTag status={d.versionType} />
                      <span className="ml-1.5 font-mono text-[#777481]">v{d.versionNumber}</span>
                    </td>
                    <td className="py-3 px-4">
                      <select
                        aria-label={`Approval status for ${d.title}`}
                        value={d.approvalStatus}
                        onChange={(e) => handleApprovalChange(d.id, e.target.value)}
                        className="px-2 py-1 text-xs border border-[#E8E6EC] rounded bg-white"
                      >
                        <option value="Pending Approval">Pending Approval</option>
                        <option value="Approved">Approved</option>
                        <option value="Changes Requested">Changes Requested</option>
                      </select>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-[#777481]">
                      {(d.fileSize / 1024).toFixed(1)} KB
                    </td>
                    <td className="py-3 px-4 text-right">
                      <a
                        href={`/api/documents/${d.id}/download?token=${encodeURIComponent(token || '')}`}
                        className="inline-flex items-center gap-1 text-[#310D35] font-medium hover:underline"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download</span>
                      </a>
                    </td>
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
