import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus, Search, Filter, Download, RefreshCw, Package, AlertTriangle,
  ChevronLeft, ChevronRight, ChevronDown, FileText, FileSpreadsheet, Eye
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { Asset, AssetCategory, Department, AssetFilters } from '../../types';
import {
  formatDate, formatCurrency, getAssetStatusBadge, getConditionBadge,
  downloadCSV, extractErrorMessage, getStatusLabel, getRoleLabel
} from '../../lib/utils';
import { downloadPDF, type PDFReportOptions } from '../../lib/pdfGenerator';
import ReportViewerModal from '../../components/common/ReportViewerModal';
import toast from 'react-hot-toast';

const PAGE_SIZE = 15;

export default function AssetsPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [assets, setAssets] = useState<Asset[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  // In-app Report Viewer & Export States
  const [reportModalOptions, setReportModalOptions] = useState<PDFReportOptions | null>(null);
  const [autoDownloadedFormat, setAutoDownloadedFormat] = useState<'pdf' | 'csv' | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [filters, setFilters] = useState<AssetFilters>({
    search: searchParams.get('search') || '',
    status: (searchParams.get('status') as AssetFilters['status']) || '',
    department_id: searchParams.get('department_id') || '',
    category_id: searchParams.get('category_id') || '',
    condition: (searchParams.get('condition') as AssetFilters['condition']) || '',
  });

  const canCreate = profile && ['admin', 'asset_manager'].includes(profile.role);

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('assets')
        .select(`
          *,
          category:asset_categories(id, name),
          department:departments(id, name),
          assignee:profiles!assigned_to(id, full_name, email)
        `, { count: 'exact' });

      if (filters.search) {
        query = query.or(`name.ilike.%${filters.search}%,asset_tag.ilike.%${filters.search}%,serial_number.ilike.%${filters.search}%`);
      }
      if (filters.status) query = query.eq('status', filters.status);
      if (filters.department_id) query = query.eq('department_id', filters.department_id);
      if (filters.category_id) query = query.eq('category_id', filters.category_id);
      if (filters.condition) query = query.eq('condition', filters.condition);

      const from = (page - 1) * PAGE_SIZE;
      const { data, count, error: err } = await query
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (err) throw err;
      setAssets((data as Asset[]) ?? []);
      setTotal(count ?? 0);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => { fetchAssets(); }, [fetchAssets]);

  useEffect(() => {
    Promise.all([
      supabase.from('asset_categories').select('*').order('name'),
      supabase.from('departments').select('*').eq('is_active', true).order('name'),
    ]).then(([{ data: cats }, { data: depts }]) => {
      if (cats) setCategories(cats as AssetCategory[]);
      if (depts) setDepartments(depts as Department[]);
    });
  }, []);

  const handleSearch = (value: string) => {
    setFilters(f => ({ ...f, search: value }));
    setPage(1);
  };

  const handleFilterChange = (key: keyof AssetFilters, value: string) => {
    setFilters(f => ({ ...f, [key]: value }));
    setPage(1);
  };

  // Helper to construct PDF & In-App Report Data
  const buildAssetReportOptions = (data: (Asset & { category?: { name: string }; department?: { name: string } })[]): PDFReportOptions => {
    const totalCost = data.reduce((acc, a) => acc + (a.purchase_cost || 0), 0);
    const availableCount = data.filter(a => a.status === 'available').length;
    const allocatedCount = data.filter(a => a.status === 'allocated').length;
    const maintenanceCount = data.filter(a => a.status === 'maintenance').length;

    const filterDescriptions: string[] = [];
    if (filters.search) filterDescriptions.push(`Search: "${filters.search}"`);
    if (filters.status) filterDescriptions.push(`Status: ${getStatusLabel(filters.status)}`);
    if (filters.condition) filterDescriptions.push(`Condition: ${getStatusLabel(filters.condition)}`);
    if (filters.department_id) {
      const d = departments.find(x => x.id === filters.department_id);
      if (d) filterDescriptions.push(`Dept: ${d.name}`);
    }
    if (filters.category_id) {
      const c = categories.find(x => x.id === filters.category_id);
      if (c) filterDescriptions.push(`Category: ${c.name}`);
    }

    const subtitle = filterDescriptions.length > 0
      ? `Active Filters: ${filterDescriptions.join(' · ')}`
      : 'Complete Organization Asset Inventory';

    const headers = [
      'Asset Tag', 'Asset Name', 'Category', 'Department',
      'Status', 'Condition', 'Cost', 'Location', 'Serial Number'
    ];

    const rows = data.map(a => [
      a.asset_tag,
      a.name,
      a.category?.name ?? '—',
      a.department?.name ?? '—',
      getStatusLabel(a.status),
      getStatusLabel(a.condition),
      a.purchase_cost ? formatCurrency(a.purchase_cost) : '—',
      a.location ?? '—',
      a.serial_number ?? '—',
    ]);

    const summary = [
      { label: 'Total Assets', value: `${data.length}` },
      { label: 'Portfolio Value', value: formatCurrency(totalCost) },
      { label: 'Available', value: `${availableCount}` },
      { label: 'Allocated', value: `${allocatedCount}` },
      { label: 'Maintenance', value: `${maintenanceCount}` },
    ];

    return {
      title: 'Asset Inventory Report',
      subtitle,
      filename: 'assets_export',
      headers,
      rows,
      summary,
      generatedBy: profile ? `${profile.full_name} (${getRoleLabel(profile.role)})` : 'Admin',
    };
  };

  const fetchFilteredAssetsForExport = async () => {
    let query = supabase.from('assets').select(`*, category:asset_categories(name), department:departments(name)`);
    if (filters.search) query = query.or(`name.ilike.%${filters.search}%,asset_tag.ilike.%${filters.search}%`);
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.department_id) query = query.eq('department_id', filters.department_id);
    if (filters.category_id) query = query.eq('category_id', filters.category_id);
    if (filters.condition) query = query.eq('condition', filters.condition);
    const { data } = await query.order('created_at', { ascending: false });
    return (data || []) as (Asset & { category?: { name: string }; department?: { name: string } })[];
  };

  // Export as Adobe Acrobat compliant PDF and show report in-app
  const handleExportPDF = async () => {
    setExportMenuOpen(false);
    setExporting(true);
    try {
      const data = await fetchFilteredAssetsForExport();
      if (!data.length) {
        toast.error('No assets to export with current filters.');
        return;
      }
      const reportOpts = buildAssetReportOptions(data);
      const res = downloadPDF(reportOpts);
      toast.success(
        `✅ Downloaded PDF: ${res.filename} (${res.sizeKB} KB)`,
        { style: { background: '#1e293b', color: '#f1f5f9', border: '1px solid rgba(99,102,241,0.4)', borderRadius: '10px' } }
      );
      setAutoDownloadedFormat('pdf');
      setReportModalOptions(reportOpts);
    } finally {
      setExporting(false);
    }
  };

  // Export as CSV and show report in-app
  const handleExportCSV = async () => {
    setExportMenuOpen(false);
    setExporting(true);
    try {
      const data = await fetchFilteredAssetsForExport();
      if (!data.length) {
        toast.error('No assets to export with current filters.');
        return;
      }
      const reportOpts = buildAssetReportOptions(data);
      const result = downloadCSV(data.map(a => ({
        'Asset Tag': a.asset_tag,
        Name: a.name,
        Category: a.category?.name ?? '',
        Department: a.department?.name ?? '',
        Status: a.status,
        Condition: a.condition,
        'Purchase Date': a.purchase_date ?? '',
        'Purchase Cost': a.purchase_cost ?? '',
        Location: a.location ?? '',
        'Serial Number': a.serial_number ?? '',
      })), 'assets_export');

      if (result) {
        toast.success(
          `✅ Downloaded CSV: ${result.filename} (${result.sizeKB} KB)`,
          { style: { background: '#1e293b', color: '#f1f5f9', border: '1px solid rgba(16,185,129,0.4)', borderRadius: '10px' } }
        );
      }
      setAutoDownloadedFormat('csv');
      setReportModalOptions(reportOpts);
    } finally {
      setExporting(false);
    }
  };

  // Preview report directly in app
  const handlePreviewReport = async () => {
    setExportMenuOpen(false);
    setExporting(true);
    try {
      const data = await fetchFilteredAssetsForExport();
      if (!data.length) {
        toast.error('No assets to display with current filters.');
        return;
      }
      const reportOpts = buildAssetReportOptions(data);
      setAutoDownloadedFormat(null);
      setReportModalOptions(reportOpts);
    } finally {
      setExporting(false);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Assets</h1>
          <p style={{ color: '#94a3b8', fontSize: 13 }}>{total} asset{total !== 1 ? 's' : ''} total</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn btn-secondary btn-sm" onClick={fetchAssets} title="Refresh list"><RefreshCw size={14} /></button>

          {/* Export & View Report Dropdown Action */}
          <div style={{ position: 'relative' }}>
            <button
              id="export-report-btn"
              className="btn btn-secondary btn-sm"
              disabled={exporting}
              style={{
                gap: 6,
                background: 'rgba(99,102,241,0.12)',
                border: '1px solid rgba(99,102,241,0.3)',
                color: '#c7d2fe',
                fontWeight: 600,
              }}
              onClick={() => setExportMenuOpen(v => !v)}
            >
              <FileText size={14} style={{ color: '#818cf8' }} />
              <span>{exporting ? 'Generating Report…' : 'Export & View Report'}</span>
              <ChevronDown size={13} style={{ opacity: 0.7 }} />
            </button>

            {exportMenuOpen && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setExportMenuOpen(false)} />
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 6px)',
                    right: 0,
                    background: '#1c1d2e',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 10,
                    padding: 6,
                    minWidth: 230,
                    zIndex: 50,
                    boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
                  }}
                >
                  <div style={{ padding: '6px 10px', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Report & Export
                  </div>

                  <button
                    id="export-pdf-action"
                    onClick={handleExportPDF}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                      padding: '8px 12px', borderRadius: 6, border: 'none', background: 'transparent',
                      color: '#f1f5f9', fontSize: 12, cursor: 'pointer', textAlign: 'left',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.15)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <Download size={14} style={{ color: '#818cf8' }} />
                    <div>
                      <div style={{ fontWeight: 600 }}>Download PDF (.pdf)</div>
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>Acrobat Reader / Print Ready</div>
                    </div>
                  </button>

                  <button
                    id="export-csv-action"
                    onClick={handleExportCSV}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                      padding: '8px 12px', borderRadius: 6, border: 'none', background: 'transparent',
                      color: '#f1f5f9', fontSize: 12, cursor: 'pointer', textAlign: 'left',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.15)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <FileSpreadsheet size={14} style={{ color: '#34d399' }} />
                    <div>
                      <div style={{ fontWeight: 600 }}>Download CSV (.csv)</div>
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>Excel & Spreadsheet format</div>
                    </div>
                  </button>

                  <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '4px 0' }} />

                  <button
                    id="preview-report-action"
                    onClick={handlePreviewReport}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                      padding: '8px 12px', borderRadius: 6, border: 'none', background: 'transparent',
                      color: '#c7d2fe', fontSize: 12, cursor: 'pointer', textAlign: 'left',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.15)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <Eye size={14} style={{ color: '#a5b4fc' }} />
                    <div>
                      <div style={{ fontWeight: 600 }}>Preview Report in App</div>
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>View & print on screen</div>
                    </div>
                  </button>
                </div>
              </>
            )}
          </div>

          {canCreate && (
            <button id="create-asset-btn" className="btn btn-primary btn-sm" onClick={() => navigate('/assets/new')}>
              <Plus size={14} /> New Asset
            </button>
          )}
        </div>
      </div>

      {/* Search + Filters */}
      <div className="card" style={{ marginBottom: 16, padding: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
            <input
              id="assets-search"
              type="text"
              className="input"
              placeholder="Search by name, tag, or serial…"
              value={filters.search}
              onChange={e => handleSearch(e.target.value)}
              style={{ paddingLeft: 34 }}
            />
          </div>
          <button
            id="toggle-filters-btn"
            className={`btn btn-secondary btn-sm ${showFilters ? 'btn-primary' : ''}`}
            onClick={() => setShowFilters(v => !v)}
          >
            <Filter size={14} /> Filters {showFilters ? '▲' : '▼'}
          </button>
        </div>

        {showFilters && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10, marginTop: 12 }}>
            <select id="filter-status" className="input" value={filters.status} onChange={e => handleFilterChange('status', e.target.value)}>
              <option value="">All Statuses</option>
              {(['available','allocated','maintenance','retired','lost'] as const).map(s => <option key={s} value={s}>{getStatusLabel(s)}</option>)}
            </select>
            <select id="filter-department" className="input" value={filters.department_id} onChange={e => handleFilterChange('department_id', e.target.value)}>
              <option value="">All Departments</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <select id="filter-category" className="input" value={filters.category_id} onChange={e => handleFilterChange('category_id', e.target.value)}>
              <option value="">All Categories</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select id="filter-condition" className="input" value={filters.condition} onChange={e => handleFilterChange('condition', e.target.value)}>
              <option value="">All Conditions</option>
              {(['excellent','good','fair','poor','damaged'] as const).map(c => <option key={c} value={c}>{getStatusLabel(c)}</option>)}
            </select>
            <button className="btn btn-ghost btn-sm" onClick={() => { setFilters({ search: '', status: '', department_id: '', category_id: '', condition: '' }); setPage(1); }}>
              Clear Filters
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      {error ? (
        <div className="alert alert-error"><AlertTriangle size={16} /><span>{error}</span></div>
      ) : loading ? (
        <div style={{ display: 'grid', gap: 8 }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 52, borderRadius: 8 }} />
          ))}
        </div>
      ) : assets.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <Package size={40} style={{ color: '#64748b', margin: '0 auto 12px', opacity: 0.5 }} />
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>No assets found</h3>
          <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>
            {Object.values(filters).some(Boolean) ? 'Try adjusting your filters.' : 'Get started by registering your first asset.'}
          </p>
          {canCreate && <button className="btn btn-primary btn-sm" onClick={() => navigate('/assets/new')}>Register Asset</button>}
        </div>
      ) : (
        <>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Asset Tag</th>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Department</th>
                  <th>Status</th>
                  <th>Condition</th>
                  <th>Purchase Cost</th>
                  <th>Purchase Date</th>
                </tr>
              </thead>
              <tbody>
                {assets.map(asset => (
                  <tr key={asset.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/assets/${asset.id}`)}>
                    <td><span style={{ fontFamily: 'monospace', fontSize: 12, color: '#a5b4fc' }}>{asset.asset_tag}</span></td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{asset.name}</div>
                      {asset.model && <div style={{ fontSize: 11, color: '#64748b' }}>{asset.manufacturer} {asset.model}</div>}
                    </td>
                    <td style={{ color: '#94a3b8', fontSize: 13 }}>{asset.category?.name ?? '—'}</td>
                    <td style={{ color: '#94a3b8', fontSize: 13 }}>{asset.department?.name ?? '—'}</td>
                    <td><span className={`badge ${getAssetStatusBadge(asset.status)}`}>{getStatusLabel(asset.status)}</span></td>
                    <td><span className={`badge ${getConditionBadge(asset.condition)}`}>{getStatusLabel(asset.condition)}</span></td>
                    <td style={{ color: '#94a3b8', fontSize: 13 }}>{formatCurrency(asset.purchase_cost)}</td>
                    <td style={{ color: '#94a3b8', fontSize: 13 }}>{formatDate(asset.purchase_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
              <span style={{ fontSize: 13, color: '#94a3b8' }}>
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
              </span>
              <div className="pagination">
                <button className="page-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}><ChevronLeft size={14} /></button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
                  return p <= totalPages ? (
                    <button key={p} className={`page-btn ${p === page ? 'active' : ''}`} onClick={() => setPage(p)}>{p}</button>
                  ) : null;
                })}
                <button className="page-btn" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight size={14} /></button>
              </div>
            </div>
          )}
        </>
      )}

      {/* In-App Report Viewer Modal */}
      {reportModalOptions && (
        <ReportViewerModal
          options={reportModalOptions}
          autoDownloadedFormat={autoDownloadedFormat}
          onClose={() => { setReportModalOptions(null); setAutoDownloadedFormat(null); }}
        />
      )}
    </div>
  );
}

