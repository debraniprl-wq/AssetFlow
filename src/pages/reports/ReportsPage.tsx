import { useState, useEffect, useCallback, useRef } from 'react';
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid
} from 'recharts';
import { supabase } from '../../lib/supabase';
import { formatCurrency, downloadCSV, extractErrorMessage, getRoleLabel } from '../../lib/utils';
import { useAuth } from '../../contexts/AuthContext';
import { downloadPDF, type PDFReportOptions } from '../../lib/pdfGenerator';
import ReportViewerModal from '../../components/common/ReportViewerModal';
import {
  BarChart3, Loader2, AlertTriangle, Download, FileText,
  FileSpreadsheet, Eye, ChevronDown, Sparkles
} from 'lucide-react';
import toast from 'react-hot-toast';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];

interface CategoryCount { name: string; count: number; value: number; }
interface DeptCount { name: string; allocated: number; available: number; maintenance: number; }
interface StatusCount { name: string; value: number; }
interface MonthlyData { month: string; created: number; retired: number; }

export default function ReportsPage() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryData, setCategoryData] = useState<CategoryCount[]>([]);
  const [deptData, setDeptData] = useState<DeptCount[]>([]);
  const [statusData, setStatusData] = useState<StatusCount[]>([]);
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [totalValue, setTotalValue] = useState(0);
  const [assetCount, setAssetCount] = useState(0);
  const [activeTab, setActiveTab] = useState<'overview' | 'departments' | 'trends'>('overview');

  // Report Modal State
  const [reportModalOptions, setReportModalOptions] = useState<PDFReportOptions | null>(null);
  const [autoDownloadedFormat, setAutoDownloadedFormat] = useState<'pdf' | 'csv' | null>(null);
  const [execMenuOpen, setExecMenuOpen] = useState(false);
  const [catMenuOpen, setCatMenuOpen] = useState(false);
  const [deptMenuOpen, setDeptMenuOpen] = useState(false);

  const execMenuRef = useRef<HTMLDivElement>(null);
  const catMenuRef = useRef<HTMLDivElement>(null);
  const deptMenuRef = useRef<HTMLDivElement>(null);

  // Close menus on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (execMenuRef.current && !execMenuRef.current.contains(e.target as Node)) setExecMenuOpen(false);
      if (catMenuRef.current && !catMenuRef.current.contains(e.target as Node)) setCatMenuOpen(false);
      if (deptMenuRef.current && !deptMenuRef.current.contains(e.target as Node)) setDeptMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        { data: assets },
        { data: categories },
        { data: departments },
      ] = await Promise.all([
        supabase.from('assets').select('status, condition, purchase_cost, category_id, department_id, created_at'),
        supabase.from('asset_categories').select('id, name'),
        supabase.from('departments').select('id, name').eq('is_active', true),
      ]);

      if (!assets) return;

      // Total stats
      const total = assets.reduce((s, a) => s + (a.purchase_cost ?? 0), 0);
      setTotalValue(total);
      setAssetCount(assets.length);

      // Status distribution
      const statusMap: Record<string, number> = {};
      for (const a of assets) {
        statusMap[a.status] = (statusMap[a.status] ?? 0) + 1;
      }
      setStatusData(Object.entries(statusMap).map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value,
      })));

      // Category breakdown
      const catMap: Record<string, { count: number; value: number }> = {};
      const catNames: Record<string, string> = {};
      for (const c of (categories ?? [])) catNames[c.id] = c.name;
      for (const a of assets) {
        const key = a.category_id ? (catNames[a.category_id] ?? 'Unknown') : 'Uncategorized';
        if (!catMap[key]) catMap[key] = { count: 0, value: 0 };
        catMap[key].count += 1;
        catMap[key].value += a.purchase_cost ?? 0;
      }
      setCategoryData(Object.entries(catMap).map(([name, d]) => ({ name, ...d })));

      // Department breakdown
      const deptNames: Record<string, string> = {};
      for (const d of (departments ?? [])) deptNames[d.id] = d.name;
      const deptMap: Record<string, DeptCount> = {};
      for (const a of assets) {
        const key = a.department_id ? (deptNames[a.department_id] ?? 'Unknown') : 'Unassigned';
        if (!deptMap[key]) deptMap[key] = { name: key, allocated: 0, available: 0, maintenance: 0 };
        if (a.status === 'allocated') deptMap[key].allocated += 1;
        else if (a.status === 'available') deptMap[key].available += 1;
        else if (a.status === 'maintenance') deptMap[key].maintenance += 1;
      }
      setDeptData(Object.values(deptMap));

      // Monthly trend (last 6 months)
      const months: MonthlyData[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const label = d.toLocaleString('default', { month: 'short', year: '2-digit' });
        const yr = d.getFullYear();
        const mo = d.getMonth() + 1;
        const created = assets.filter(a => {
          const t = new Date(a.created_at);
          return t.getFullYear() === yr && t.getMonth() + 1 === mo;
        }).length;
        const retired = assets.filter(a => {
          const t = new Date(a.created_at);
          return t.getFullYear() === yr && t.getMonth() + 1 === mo && a.status === 'retired';
        }).length;
        months.push({ month: label, created, retired });
      }
      setMonthlyData(months);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // Executive Summary Report Builder
  const buildExecutiveReportOptions = (): PDFReportOptions => {
    const allocatedAssets = deptData.reduce((acc, d) => acc + d.allocated, 0);
    const availableAssets = deptData.reduce((acc, d) => acc + d.available, 0);
    const maintenanceAssets = deptData.reduce((acc, d) => acc + d.maintenance, 0);

    const headers = [
      'Category Name',
      'Asset Count',
      'Total Valuation',
      '% Portfolio Count',
      '% Portfolio Value',
      'Avg Unit Cost'
    ];

    const rows = categoryData.map(c => {
      const pctCount = assetCount > 0 ? ((c.count / assetCount) * 100).toFixed(1) + '%' : '0%';
      const pctVal = totalValue > 0 ? ((c.value / totalValue) * 100).toFixed(1) + '%' : '0%';
      const avgCost = c.count > 0 ? formatCurrency(c.value / c.count) : '$0';
      return [
        c.name,
        c.count.toString(),
        formatCurrency(c.value),
        pctCount,
        pctVal,
        avgCost
      ];
    });

    return {
      title: 'Executive Asset & Portfolio Analytics',
      subtitle: 'Complete organizational overview, asset health, and department allocations',
      filename: 'executive_asset_report',
      headers,
      rows,
      summary: [
        { label: 'Total Assets', value: `${assetCount}` },
        { label: 'Portfolio Value', value: formatCurrency(totalValue) },
        { label: 'Allocated Assets', value: `${allocatedAssets}` },
        { label: 'Available Assets', value: `${availableAssets}` },
        { label: 'Under Maintenance', value: `${maintenanceAssets}` },
      ],
      generatedBy: profile ? `${profile.full_name} (${getRoleLabel(profile.role)})` : 'Executive Admin',
    };
  };

  // Category Report Builder
  const buildCategoryReportOptions = (): PDFReportOptions => {
    const headers = ['Category', 'Asset Count', 'Total Valuation', '% Portfolio Value', 'Avg Asset Cost'];
    const rows = categoryData.map(c => [
      c.name,
      c.count.toString(),
      formatCurrency(c.value),
      totalValue > 0 ? ((c.value / totalValue) * 100).toFixed(1) + '%' : '0%',
      c.count > 0 ? formatCurrency(c.value / c.count) : '$0',
    ]);

    return {
      title: 'Asset Breakdown by Category',
      subtitle: 'Asset volume and financial investment distribution by asset category',
      filename: 'assets_by_category',
      headers,
      rows,
      summary: [
        { label: 'Total Categories', value: `${categoryData.length}` },
        { label: 'Total Assets', value: `${assetCount}` },
        { label: 'Combined Value', value: formatCurrency(totalValue) },
      ],
      generatedBy: profile ? `${profile.full_name} (${getRoleLabel(profile.role)})` : 'Reports Manager',
    };
  };

  // Department Report Builder
  const buildDepartmentReportOptions = (): PDFReportOptions => {
    const totalAllocated = deptData.reduce((acc, d) => acc + d.allocated, 0);
    const totalAvailable = deptData.reduce((acc, d) => acc + d.available, 0);
    const totalMaint = deptData.reduce((acc, d) => acc + d.maintenance, 0);

    const headers = ['Department', 'Allocated', 'Available', 'Maintenance', 'Total Assets', 'Allocation %'];
    const rows = deptData.map(d => {
      const sum = d.allocated + d.available + d.maintenance;
      const allocPct = sum > 0 ? ((d.allocated / sum) * 100).toFixed(0) + '%' : '0%';
      return [
        d.name,
        d.allocated.toString(),
        d.available.toString(),
        d.maintenance.toString(),
        sum.toString(),
        allocPct,
      ];
    });

    return {
      title: 'Department Asset Allocation Report',
      subtitle: 'Departmental asset distribution, operational availability, and maintenance load',
      filename: 'assets_by_department',
      headers,
      rows,
      summary: [
        { label: 'Departments', value: `${deptData.length}` },
        { label: 'Total Allocated', value: `${totalAllocated}` },
        { label: 'Total Available', value: `${totalAvailable}` },
        { label: 'In Maintenance', value: `${totalMaint}` },
      ],
      generatedBy: profile ? `${profile.full_name} (${getRoleLabel(profile.role)})` : 'Reports Manager',
    };
  };

  // Actions
  const handleOpenReport = (
    reportFn: () => PDFReportOptions,
    downloadFormat?: 'pdf' | 'csv'
  ) => {
    const opts = reportFn();
    setExecMenuOpen(false);
    setCatMenuOpen(false);
    setDeptMenuOpen(false);

    if (downloadFormat === 'pdf') {
      const res = downloadPDF(opts);
      toast.success(`✅ Downloaded PDF: ${res.filename} (${res.sizeKB} KB)`, {
        style: { background: '#1e293b', color: '#f1f5f9', border: '1px solid rgba(99,102,241,0.4)', borderRadius: '10px' }
      });
      setAutoDownloadedFormat('pdf');
    } else if (downloadFormat === 'csv') {
      const csvData = opts.rows.map(row => {
        const obj: Record<string, string> = {};
        opts.headers.forEach((h, i) => { obj[h] = row[i] !== null && row[i] !== undefined ? String(row[i]) : ''; });
        return obj;
      });
      const res = downloadCSV(csvData, opts.filename);
      if (res) {
        toast.success(`✅ Downloaded CSV: ${res.filename} (${res.sizeKB} KB)`, {
          style: { background: '#1e293b', color: '#f1f5f9', border: '1px solid rgba(16,185,129,0.4)', borderRadius: '10px' }
        });
      }
      setAutoDownloadedFormat('csv');
    } else {
      setAutoDownloadedFormat(null);
    }

    setReportModalOptions(opts);
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <Loader2 size={32} className="animate-spin" style={{ color: '#6366f1' }} />
    </div>
  );

  if (error) return (
    <div className="alert alert-error"><AlertTriangle size={16} /><span>{error}</span></div>
  );

  const labelStyle = { fontSize: 12, color: '#94a3b8' };

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Reports & Analytics</h1>
          <p style={{ color: '#94a3b8', fontSize: 13 }}>Enterprise asset analytics, lifecycle trends, and exportable intelligence</p>
        </div>

        {/* Executive Report Button Group */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div ref={execMenuRef} style={{ position: 'relative' }}>
            <button
              id="executive-report-btn"
              className="btn btn-primary btn-sm"
              onClick={() => setExecMenuOpen(v => !v)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}
            >
              <Sparkles size={14} />
              <span>Executive Report</span>
              <ChevronDown size={14} style={{ opacity: 0.8 }} />
            </button>

            {execMenuOpen && (
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
                  Executive Portfolio Report
                </div>

                <button
                  id="exec-preview-btn"
                  onClick={() => handleOpenReport(buildExecutiveReportOptions)}
                  className="btn btn-ghost"
                  style={{ width: '100%', justifyContent: 'flex-start', gap: 8, fontSize: 13, padding: '8px 10px', borderRadius: 6 }}
                >
                  <Eye size={14} style={{ color: '#06b6d4' }} />
                  <span>Preview In-App</span>
                </button>

                <button
                  id="exec-download-pdf-btn"
                  onClick={() => handleOpenReport(buildExecutiveReportOptions, 'pdf')}
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
                  id="exec-download-csv-btn"
                  onClick={() => handleOpenReport(buildExecutiveReportOptions, 'csv')}
                  className="btn btn-ghost"
                  style={{ width: '100%', justifyContent: 'flex-start', gap: 8, fontSize: 13, padding: '8px 10px', borderRadius: 6 }}
                >
                  <FileSpreadsheet size={14} style={{ color: '#10b981' }} />
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontWeight: 500 }}>Download CSV (.csv)</div>
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>Spreadsheet data</div>
                  </div>
                </button>
              </div>
            )}
          </div>
          <BarChart3 size={24} style={{ color: '#6366f1' }} />
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Total Assets', value: assetCount },
          { label: 'Total Portfolio Value', value: formatCurrency(totalValue) },
          { label: 'Avg Value per Asset', value: formatCurrency(assetCount ? totalValue / assetCount : 0) },
          { label: 'Asset Categories', value: categoryData.length },
        ].map(k => (
          <div key={k.label} className="card" style={{ padding: '16px 20px' }}>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#f1f5f9' }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {(['overview', 'departments', 'trends'] as const).map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={activeTab === t ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
            style={{ textTransform: 'capitalize' }}
          >
            {t}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
          {/* Status Pie */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600 }}>Status Distribution</h2>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false}>
                  {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#252637', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8 }} />
                <Legend wrapperStyle={labelStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Category bar with Report Dropdown */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, position: 'relative' }}>
              <h2 style={{ fontSize: 15, fontWeight: 600 }}>Assets by Category</h2>

              <div ref={catMenuRef} style={{ position: 'relative' }}>
                <button
                  id="cat-report-dropdown-btn"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setCatMenuOpen(v => !v)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12 }}
                >
                  <Download size={13} />
                  <span>Report</span>
                  <ChevronDown size={12} />
                </button>

                {catMenuOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 'calc(100% + 4px)',
                      background: '#1e293b',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: 8,
                      boxShadow: '0 10px 24px rgba(0,0,0,0.5)',
                      minWidth: 200,
                      zIndex: 30,
                      padding: 4,
                    }}
                  >
                    <button
                      onClick={() => handleOpenReport(buildCategoryReportOptions)}
                      className="btn btn-ghost"
                      style={{ width: '100%', justifyContent: 'flex-start', gap: 6, fontSize: 12, padding: '6px 8px' }}
                    >
                      <Eye size={13} style={{ color: '#06b6d4' }} />
                      <span>Preview In-App</span>
                    </button>
                    <button
                      onClick={() => handleOpenReport(buildCategoryReportOptions, 'pdf')}
                      className="btn btn-ghost"
                      style={{ width: '100%', justifyContent: 'flex-start', gap: 6, fontSize: 12, padding: '6px 8px' }}
                    >
                      <FileText size={13} style={{ color: '#ef4444' }} />
                      <span>Download PDF</span>
                    </button>
                    <button
                      onClick={() => handleOpenReport(buildCategoryReportOptions, 'csv')}
                      className="btn btn-ghost"
                      style={{ width: '100%', justifyContent: 'flex-start', gap: 6, fontSize: 12, padding: '6px 8px' }}
                    >
                      <FileSpreadsheet size={13} style={{ color: '#10b981' }} />
                      <span>Download CSV</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={categoryData} layout="vertical">
                <XAxis type="number" tick={labelStyle} />
                <YAxis dataKey="name" type="category" tick={{ ...labelStyle, width: 100 }} width={90} />
                <Tooltip contentStyle={{ background: '#252637', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8 }} />
                <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {activeTab === 'departments' && (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600 }}>Asset Distribution by Department</h2>

            <div ref={deptMenuRef} style={{ position: 'relative' }}>
              <button
                id="dept-report-dropdown-btn"
                className="btn btn-ghost btn-sm"
                onClick={() => setDeptMenuOpen(v => !v)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12 }}
              >
                <Download size={13} />
                <span>Report</span>
                <ChevronDown size={12} />
              </button>

              {deptMenuOpen && (
                <div
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: 'calc(100% + 4px)',
                    background: '#1e293b',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 8,
                    boxShadow: '0 10px 24px rgba(0,0,0,0.5)',
                    minWidth: 200,
                    zIndex: 30,
                    padding: 4,
                  }}
                >
                  <button
                    onClick={() => handleOpenReport(buildDepartmentReportOptions)}
                    className="btn btn-ghost"
                    style={{ width: '100%', justifyContent: 'flex-start', gap: 6, fontSize: 12, padding: '6px 8px' }}
                  >
                    <Eye size={13} style={{ color: '#06b6d4' }} />
                    <span>Preview In-App</span>
                  </button>
                  <button
                    onClick={() => handleOpenReport(buildDepartmentReportOptions, 'pdf')}
                    className="btn btn-ghost"
                    style={{ width: '100%', justifyContent: 'flex-start', gap: 6, fontSize: 12, padding: '6px 8px' }}
                  >
                    <FileText size={13} style={{ color: '#ef4444' }} />
                    <span>Download PDF</span>
                  </button>
                  <button
                    onClick={() => handleOpenReport(buildDepartmentReportOptions, 'csv')}
                    className="btn btn-ghost"
                    style={{ width: '100%', justifyContent: 'flex-start', gap: 6, fontSize: 12, padding: '6px 8px' }}
                  >
                    <FileSpreadsheet size={13} style={{ color: '#10b981' }} />
                    <span>Download CSV</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={deptData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" tick={labelStyle} />
              <YAxis tick={labelStyle} />
              <Tooltip contentStyle={{ background: '#252637', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8 }} />
              <Legend wrapperStyle={labelStyle} />
              <Bar dataKey="allocated" fill="#6366f1" name="Allocated" radius={[4, 4, 0, 0]} />
              <Bar dataKey="available" fill="#10b981" name="Available" radius={[4, 4, 0, 0]} />
              <Bar dataKey="maintenance" fill="#f59e0b" name="Maintenance" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {activeTab === 'trends' && (
        <div className="card" style={{ padding: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Asset Lifecycle Trends (Last 6 Months)</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="month" tick={labelStyle} />
              <YAxis tick={labelStyle} />
              <Tooltip contentStyle={{ background: '#252637', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8 }} />
              <Legend wrapperStyle={labelStyle} />
              <Line type="monotone" dataKey="created" stroke="#6366f1" name="Added" strokeWidth={2} dot={{ r: 4, fill: '#6366f1' }} />
              <Line type="monotone" dataKey="retired" stroke="#ef4444" name="Retired" strokeWidth={2} dot={{ r: 4, fill: '#ef4444' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
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

