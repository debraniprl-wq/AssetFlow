import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { formatDateTime, downloadCSV, getRoleLabel } from '../../lib/utils';
import { useAuth } from '../../contexts/AuthContext';
import { downloadPDF, type PDFReportOptions } from '../../lib/pdfGenerator';
import ReportViewerModal from '../../components/common/ReportViewerModal';
import {
  ClipboardList, Search, ChevronLeft, ChevronRight, Loader2,
  AlertTriangle, Download, ChevronDown, FileText, FileSpreadsheet, Eye
} from 'lucide-react';
import type { AuditLog } from '../../types';
import toast from 'react-hot-toast';

const PAGE_SIZE = 25;

const ACTION_COLORS: Record<string, string> = {
  create: '#10b981', update: '#6366f1', delete: '#ef4444',
  login: '#06b6d4', logout: '#94a3b8', approve: '#10b981',
  reject: '#ef4444', allocate: '#8b5cf6', return: '#f59e0b', transfer: '#f59e0b',
};

export default function AuditLogsPage() {
  const { profile } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Report Modal & Export State
  const [reportModalOptions, setReportModalOptions] = useState<PDFReportOptions | null>(null);
  const [autoDownloadedFormat, setAutoDownloadedFormat] = useState<'pdf' | 'csv' | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let q = supabase
        .from('audit_logs')
        .select('*, actor:profiles(full_name, email)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

      if (search) q = q.or(`description.ilike.%${search}%,actor_email.ilike.%${search}%`);
      if (actionFilter) q = q.eq('action', actionFilter);
      if (entityFilter) q = q.eq('entity_type', entityFilter);

      const { data, count, error: err } = await q;
      if (err) throw err;
      setLogs((data ?? []) as AuditLog[]);
      setTotal(count ?? 0);
    } catch {
      setError('Failed to load audit logs.');
    } finally {
      setLoading(false);
    }
  }, [page, search, actionFilter, entityFilter]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Fetch full records for export (up to 500)
  const fetchLogsForExport = async () => {
    let q = supabase
      .from('audit_logs')
      .select('*, actor:profiles(full_name, email)')
      .order('created_at', { ascending: false })
      .limit(500);

    if (search) q = q.or(`description.ilike.%${search}%,actor_email.ilike.%${search}%`);
    if (actionFilter) q = q.eq('action', actionFilter);
    if (entityFilter) q = q.eq('entity_type', entityFilter);

    const { data } = await q;
    return (data || []) as AuditLog[];
  };

  const buildAuditReportOptions = (data: AuditLog[]): PDFReportOptions => {
    const headers = ['Timestamp', 'Actor', 'Action', 'Entity Type', 'Description'];
    const rows = data.map(l => [
      formatDateTime(l.created_at),
      l.actor_email || (l.actor as { full_name?: string })?.full_name || 'System',
      l.action.toUpperCase(),
      l.entity_type.replace(/_/g, ' '),
      l.description,
    ]);

    const filterInfo = [];
    if (search) filterInfo.push(`Search: "${search}"`);
    if (actionFilter) filterInfo.push(`Action: ${actionFilter.toUpperCase()}`);
    if (entityFilter) filterInfo.push(`Entity: ${entityFilter}`);

    return {
      title: 'Audit & Compliance Trail Report',
      subtitle: filterInfo.length > 0 ? `Filters: ${filterInfo.join(' · ')}` : 'System Activity and Security Audit Log',
      filename: 'audit_logs_report',
      headers,
      rows,
      summary: [
        { label: 'Events Exported', value: `${data.length}` },
        { label: 'Total in System', value: `${total}` },
        { label: 'Filter Action', value: actionFilter ? actionFilter.toUpperCase() : 'All Actions' },
        { label: 'Filter Entity', value: entityFilter ? entityFilter.toUpperCase() : 'All Entities' },
      ],
      generatedBy: profile ? `${profile.full_name} (${getRoleLabel(profile.role)})` : 'Security Administrator',
    };
  };

  const handleExportPDF = async () => {
    setExportMenuOpen(false);
    setExporting(true);
    try {
      const data = await fetchLogsForExport();
      if (!data.length) {
        toast.error('No audit records to export.');
        return;
      }
      const opts = buildAuditReportOptions(data);
      const res = downloadPDF(opts);
      toast.success(
        `✅ Downloaded PDF: ${res.filename} (${res.sizeKB} KB)`,
        { style: { background: '#1e293b', color: '#f1f5f9', border: '1px solid rgba(99,102,241,0.4)', borderRadius: '10px' } }
      );
      setAutoDownloadedFormat('pdf');
      setReportModalOptions(opts);
    } finally {
      setExporting(false);
    }
  };

  const handleExportCSV = async () => {
    setExportMenuOpen(false);
    setExporting(true);
    try {
      const data = await fetchLogsForExport();
      if (!data.length) {
        toast.error('No audit records to export.');
        return;
      }
      const opts = buildAuditReportOptions(data);
      const result = downloadCSV(
        data.map(l => ({
          Time: formatDateTime(l.created_at),
          Actor: l.actor_email ?? '',
          Action: l.action,
          'Entity Type': l.entity_type,
          Description: l.description,
        })),
        'audit_logs_export'
      );
      if (result) {
        toast.success(
          `✅ Downloaded CSV: ${result.filename} (${result.sizeKB} KB)`,
          { style: { background: '#1e293b', color: '#f1f5f9', border: '1px solid rgba(16,185,129,0.4)', borderRadius: '10px' } }
        );
      }
      setAutoDownloadedFormat('csv');
      setReportModalOptions(opts);
    } finally {
      setExporting(false);
    }
  };

  const handlePreviewReport = async () => {
    setExportMenuOpen(false);
    setExporting(true);
    try {
      const data = await fetchLogsForExport();
      if (!data.length) {
        toast.error('No audit records to preview.');
        return;
      }
      setAutoDownloadedFormat(null);
      setReportModalOptions(buildAuditReportOptions(data));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Audit Logs</h1>
          <p style={{ color: '#94a3b8', fontSize: 13 }}>{total} events recorded in audit trail</p>
        </div>

        {/* Export & View Report Dropdown */}
        <div ref={exportMenuRef} style={{ position: 'relative' }}>
          <button
            id="audit-export-dropdown-btn"
            className="btn btn-primary btn-sm"
            onClick={() => setExportMenuOpen(v => !v)}
            disabled={exporting}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}
          >
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            <span>Export & View Report</span>
            <ChevronDown size={14} style={{ opacity: 0.8 }} />
          </button>

          {exportMenuOpen && (
            <div
              style={{
                position: 'absolute',
                right: 0,
                top: 'calc(100% + 6px)',
                background: '#1e293b',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 10,
                boxShadow: '0 12px 30px rgba(0,0,0,0.5)',
                minWidth: 240,
                zIndex: 50,
                padding: 6,
              }}
            >
              <div style={{ padding: '6px 10px', fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Audit Log Exports
              </div>

              <button
                id="audit-preview-report-btn"
                onClick={handlePreviewReport}
                className="btn btn-ghost"
                style={{ width: '100%', justifyContent: 'flex-start', gap: 8, fontSize: 13, padding: '8px 10px', borderRadius: 6 }}
              >
                <Eye size={14} style={{ color: '#06b6d4' }} />
                <span>Preview Report in App</span>
              </button>

              <button
                id="audit-download-pdf-btn"
                onClick={handleExportPDF}
                className="btn btn-ghost"
                style={{ width: '100%', justifyContent: 'flex-start', gap: 8, fontSize: 13, padding: '8px 10px', borderRadius: 6 }}
              >
                <FileText size={14} style={{ color: '#ef4444' }} />
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 500 }}>Download PDF (.pdf)</div>
                  <div style={{ fontSize: 10, color: '#94a3b8' }}>Adobe Acrobat compatible</div>
                </div>
              </button>

              <button
                id="audit-download-csv-btn"
                onClick={handleExportCSV}
                className="btn btn-ghost"
                style={{ width: '100%', justifyContent: 'flex-start', gap: 8, fontSize: 13, padding: '8px 10px', borderRadius: 6 }}
              >
                <FileSpreadsheet size={14} style={{ color: '#10b981' }} />
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 500 }}>Download CSV (.csv)</div>
                  <div style={{ fontSize: 10, color: '#94a3b8' }}>Spreadsheet format</div>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: 16, marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
          <input
            id="audit-search"
            className="input"
            placeholder="Search description or actor…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            style={{ paddingLeft: 32 }}
          />
        </div>
        <select id="audit-action-filter" className="input" value={actionFilter} onChange={e => { setActionFilter(e.target.value); setPage(1); }} style={{ width: 'auto', minWidth: 140 }}>
          <option value="">All Actions</option>
          {['create','update','delete','login','logout','approve','reject','allocate','return','transfer'].map(a => (
            <option key={a} value={a}>{a.charAt(0).toUpperCase() + a.slice(1)}</option>
          ))}
        </select>
        <select id="audit-entity-filter" className="input" value={entityFilter} onChange={e => { setEntityFilter(e.target.value); setPage(1); }} style={{ width: 'auto', minWidth: 140 }}>
          <option value="">All Entities</option>
          {['asset','allocation','booking','maintenance_request','user','department'].map(e => (
            <option key={e} value={e}>{e.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
          ))}
        </select>
      </div>

      {error ? (
        <div className="alert alert-error"><AlertTriangle size={16} /><span>{error}</span></div>
      ) : loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <Loader2 size={28} className="animate-spin" style={{ color: '#6366f1' }} />
        </div>
      ) : logs.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center' }}>
          <ClipboardList size={36} style={{ color: '#64748b', margin: '0 auto 12px' }} />
          <p style={{ color: '#64748b' }}>No audit logs found</p>
        </div>
      ) : (
        <>
          <div className="card" style={{ overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  {['Time', 'Actor', 'Action', 'Entity', 'Description'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => (
                  <tr key={log.id} style={{ borderBottom: i < logs.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                    <td style={{ padding: '10px 16px', fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>{formatDateTime(log.created_at)}</td>
                    <td style={{ padding: '10px 16px', fontSize: 13 }}>
                      <div style={{ fontWeight: 500 }}>{(log.actor as { full_name?: string } | undefined)?.full_name ?? '—'}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>{log.actor_email}</div>
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: `${ACTION_COLORS[log.action] ?? '#94a3b8'}20`, color: ACTION_COLORS[log.action] ?? '#94a3b8' }}>
                        {log.action.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: 12, color: '#94a3b8' }}>
                      {log.entity_type.replace(/_/g, ' ')}
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: 13, color: '#cbd5e1', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {log.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <div className="pagination">
                <button className="page-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}><ChevronLeft size={14} /></button>
                <span style={{ padding: '0 12px', fontSize: 13, color: '#94a3b8' }}>Page {page} of {totalPages}</span>
                <button className="page-btn" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight size={14} /></button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Interactive Report Viewer Modal */}
      {reportModalOptions && (
        <ReportViewerModal
          options={reportModalOptions}
          onClose={() => {
            setReportModalOptions(null);
            setAutoDownloadedFormat(null);
          }}
          autoDownloadedFormat={autoDownloadedFormat}
        />
      )}
    </div>
  );
}
