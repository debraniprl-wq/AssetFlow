import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X, FileText, Download, Printer, Copy, Check, Search,
  ChevronLeft, ChevronRight, FileSpreadsheet, Sparkles
} from 'lucide-react';
import { downloadPDF, printReport, type PDFReportOptions } from '../../lib/pdfGenerator';
import { downloadCSV } from '../../lib/utils';
import toast from 'react-hot-toast';

interface Props {
  options: PDFReportOptions;
  onClose: () => void;
  autoDownloadedFormat?: 'pdf' | 'csv' | null;
}

const ROWS_PER_PAGE = 12;

export default function ReportViewerModal({ options, onClose, autoDownloadedFormat }: Props) {
  const { title, subtitle, filename, headers, rows, summary, generatedBy } = options;
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [copied, setCopied] = useState(false);
  const [downloadingPDF, setDownloadingPDF] = useState(false);
  const [downloadingCSV, setDownloadingCSV] = useState(false);

  // Filter rows based on search term
  const filteredRows = useMemo(() => {
    if (!searchTerm.trim()) return rows;
    const term = searchTerm.toLowerCase();
    return rows.filter(row =>
      row.some(cell => String(cell ?? '').toLowerCase().includes(term))
    );
  }, [rows, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / ROWS_PER_PAGE));
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * ROWS_PER_PAGE;
    return filteredRows.slice(start, start + ROWS_PER_PAGE);
  }, [filteredRows, currentPage]);

  const handleDownloadPDF = () => {
    setDownloadingPDF(true);
    try {
      const res = downloadPDF(options);
      toast.success(`PDF downloaded: ${res.filename} (${res.sizeKB} KB)`, {
        style: { background: '#1e293b', color: '#f1f5f9', border: '1px solid rgba(99,102,241,0.4)' }
      });
    } catch (err) {
      toast.error('Failed to generate PDF.');
      console.error(err);
    } finally {
      setDownloadingPDF(false);
    }
  };

  const handleDownloadCSV = () => {
    setDownloadingCSV(true);
    try {
      // Map rows back to object format for downloadCSV
      const objData = rows.map(r => {
        const obj: Record<string, unknown> = {};
        headers.forEach((h, idx) => {
          obj[h] = r[idx];
        });
        return obj;
      });
      const res = downloadCSV(objData, filename.replace(/\.(csv|pdf)$/i, ''));
      if (res) {
        toast.success(`CSV downloaded: ${res.filename} (${res.sizeKB} KB)`, {
          style: { background: '#1e293b', color: '#f1f5f9', border: '1px solid rgba(16,185,129,0.4)' }
        });
      }
    } finally {
      setDownloadingCSV(false);
    }
  };

  const handlePrint = () => {
    printReport(options);
  };

  const handleCopyClipboard = () => {
    const tsv = [
      headers.join('\t'),
      ...rows.map(r => r.map(c => String(c ?? '')).join('\t'))
    ].join('\n');
    navigator.clipboard.writeText(tsv);
    setCopied(true);
    toast.success('Report copied to clipboard (TSV format)');
    setTimeout(() => setCopied(false), 2000);
  };

  return createPortal(
    <div className="modal-overlay" style={{ zIndex: 120 }}>
      <div
        className="modal"
        style={{
          maxWidth: 960,
          width: '95vw',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.7), 0 0 40px rgba(99,102,241,0.2)',
          border: '1px solid rgba(99,102,241,0.3)',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            background: 'linear-gradient(90deg, #18192b 0%, #1c1d33 100%)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 14px rgba(99,102,241,0.4)',
                flexShrink: 0,
              }}
            >
              <FileText size={22} color="white" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9', margin: 0 }}>
                  {title}
                </h2>
                <span
                  style={{
                    background: 'rgba(16,185,129,0.15)',
                    color: '#34d399',
                    border: '1px solid rgba(16,185,129,0.3)',
                    padding: '2px 8px',
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  Report Ready
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>
                {subtitle || 'Full dataset generated and previewable below'}
                {generatedBy ? ` · Generated by ${generatedBy}` : ''}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="btn btn-ghost btn-icon"
            style={{ borderRadius: 8, color: '#94a3b8' }}
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Download notification banner if automatically downloaded */}
        {autoDownloadedFormat && (
          <div
            style={{
              padding: '10px 24px',
              background: 'rgba(16,185,129,0.1)',
              borderBottom: '1px solid rgba(16,185,129,0.2)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: 12,
              color: '#a7f3d0',
            }}
          >
            <Sparkles size={14} style={{ color: '#34d399' }} />
            <span>
              Your <strong>{autoDownloadedFormat.toUpperCase()}</strong> file has started downloading! You can also preview, print, or download other formats right here.
            </span>
          </div>
        )}

        {/* Summary metrics if available */}
        {summary && summary.length > 0 && (
          <div
            style={{
              padding: '14px 24px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              background: 'rgba(255,255,255,0.02)',
              display: 'flex',
              gap: 16,
              flexWrap: 'wrap',
            }}
          >
            {summary.map(s => (
              <div
                key={s.label}
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 8,
                  padding: '8px 14px',
                  minWidth: 120,
                }}
              >
                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {s.label}
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9', marginTop: 2 }}>
                  {s.value}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Toolbar */}
        <div
          style={{
            padding: '12px 24px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
            background: '#141524',
          }}
        >
          {/* Filter in preview */}
          <div style={{ position: 'relative', width: 260 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
            <input
              type="text"
              className="input"
              placeholder={`Search in ${rows.length} rows…`}
              value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              style={{ paddingLeft: 32, height: 34, fontSize: 12 }}
            />
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={handlePrint}
              className="btn btn-secondary btn-sm"
              style={{ gap: 6, fontSize: 12, height: 34 }}
              title="Open printable view or Save as PDF"
            >
              <Printer size={14} /> Print / Save PDF
            </button>

            <button
              id="report-download-pdf-btn"
              onClick={handleDownloadPDF}
              disabled={downloadingPDF}
              className="btn btn-primary btn-sm"
              style={{
                gap: 6,
                fontSize: 12,
                height: 34,
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              }}
              title="Download standard PDF compatible with Adobe Acrobat Reader DC"
            >
              <Download size={14} /> Download PDF
            </button>

            <button
              id="report-download-csv-btn"
              onClick={handleDownloadCSV}
              disabled={downloadingCSV}
              className="btn btn-secondary btn-sm"
              style={{ gap: 6, fontSize: 12, height: 34 }}
              title="Download CSV file for spreadsheets"
            >
              <FileSpreadsheet size={14} /> Download CSV
            </button>

            <button
              onClick={handleCopyClipboard}
              className="btn btn-ghost btn-sm"
              style={{ gap: 6, fontSize: 12, height: 34 }}
              title="Copy table data to clipboard"
            >
              {copied ? <Check size={14} color="#34d399" /> : <Copy size={14} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>

        {/* Scrollable Data Table Container */}
        <div style={{ flex: 1, overflow: 'auto', minHeight: 280, maxHeight: 420, padding: 0 }}>
          {filteredRows.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 24px', color: '#64748b' }}>
              <Search size={32} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
              <p style={{ fontSize: 14 }}>No matching records found for "{searchTerm}"</p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#1c1d30', position: 'sticky', top: 0, zIndex: 10 }}>
                  <th style={{ width: 40, padding: '10px 12px', textAlign: 'center', color: '#64748b', fontSize: 11, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>#</th>
                  {headers.map(h => (
                    <th
                      key={h}
                      style={{
                        padding: '10px 14px',
                        textAlign: 'left',
                        fontWeight: 600,
                        color: '#cbd5e1',
                        fontSize: 11,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        borderBottom: '1px solid rgba(255,255,255,0.08)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginatedRows.map((row, rIdx) => {
                  const globalIdx = (currentPage - 1) * ROWS_PER_PAGE + rIdx + 1;
                  return (
                    <tr
                      key={globalIdx}
                      style={{
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        background: rIdx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.06)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = rIdx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)'; }}
                    >
                      <td style={{ padding: '8px 12px', textAlign: 'center', color: '#64748b', fontSize: 11 }}>
                        {globalIdx}
                      </td>
                      {row.map((cell, cIdx) => {
                        const strVal = cell !== null && cell !== undefined ? String(cell) : '—';
                        const isTag = cIdx === 0 && strVal.startsWith('AST-');
                        const isStatus = ['available', 'allocated', 'maintenance', 'retired', 'lost', 'active', 'returned', 'overdue'].includes(strVal.toLowerCase());
                        
                        return (
                          <td
                            key={cIdx}
                            style={{
                              padding: '8px 14px',
                              color: isTag ? '#a5b4fc' : '#e2e8f0',
                              fontFamily: isTag ? 'monospace' : 'inherit',
                              fontWeight: isTag ? 600 : 400,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {isStatus ? (
                              <span
                                style={{
                                  display: 'inline-block',
                                  padding: '2px 8px',
                                  borderRadius: 999,
                                  fontSize: 10,
                                  fontWeight: 600,
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.03em',
                                  background:
                                    strVal.toLowerCase() === 'available' ? 'rgba(16,185,129,0.15)' :
                                    strVal.toLowerCase() === 'allocated' ? 'rgba(99,102,241,0.15)' :
                                    strVal.toLowerCase() === 'active' ? 'rgba(14,165,233,0.15)' :
                                    strVal.toLowerCase() === 'returned' ? 'rgba(16,185,129,0.15)' :
                                    strVal.toLowerCase() === 'maintenance' ? 'rgba(245,158,11,0.15)' :
                                    strVal.toLowerCase() === 'overdue' ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.08)',
                                  color:
                                    strVal.toLowerCase() === 'available' ? '#34d399' :
                                    strVal.toLowerCase() === 'allocated' ? '#818cf8' :
                                    strVal.toLowerCase() === 'active' ? '#38bdf8' :
                                    strVal.toLowerCase() === 'returned' ? '#34d399' :
                                    strVal.toLowerCase() === 'maintenance' ? '#fbbf24' :
                                    strVal.toLowerCase() === 'overdue' ? '#f87171' : '#94a3b8',
                                }}
                              >
                                {strVal}
                              </span>
                            ) : strVal}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Modal Footer & Pagination */}
        <div
          style={{
            padding: '12px 24px',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            background: '#141524',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ fontSize: 12, color: '#94a3b8' }}>
            Showing {filteredRows.length === 0 ? 0 : (currentPage - 1) * ROWS_PER_PAGE + 1}–{Math.min(currentPage * ROWS_PER_PAGE, filteredRows.length)} of {filteredRows.length} {filteredRows.length !== rows.length ? `(filtered from ${rows.length})` : 'records'}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {totalPages > 1 && (
              <div className="pagination" style={{ display: 'flex', gap: 4 }}>
                <button
                  className="page-btn"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => p - 1)}
                  style={{ width: 28, height: 28, padding: 0 }}
                >
                  <ChevronLeft size={13} />
                </button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  const p = Math.max(1, Math.min(currentPage - 2, totalPages - 4)) + i;
                  return p <= totalPages ? (
                    <button
                      key={p}
                      className={`page-btn ${p === currentPage ? 'active' : ''}`}
                      onClick={() => setCurrentPage(p)}
                      style={{ width: 28, height: 28, padding: 0, fontSize: 11 }}
                    >
                      {p}
                    </button>
                  ) : null;
                })}
                <button
                  className="page-btn"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(p => p + 1)}
                  style={{ width: 28, height: 28, padding: 0 }}
                >
                  <ChevronRight size={13} />
                </button>
              </div>
            )}

            <button
              onClick={onClose}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: 12, padding: '6px 16px' }}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
