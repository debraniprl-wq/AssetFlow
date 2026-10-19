import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Package, GitBranch, Wrench, Clock, CheckCircle,
  Calendar, AlertTriangle, TrendingUp, ArrowRight, Loader2
} from 'lucide-react';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { formatRelative } from '../../lib/utils';
import type { AuditLog, DashboardStats } from '../../types';

const COLORS = ['#10b981', '#6366f1', '#f59e0b', '#ef4444', '#94a3b8'];

export default function DashboardPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [assetByCategory, setAssetByCategory] = useState<{ name: string; value: number }[]>([]);
  const [deptAllocation, setDeptAllocation] = useState<{ dept: string; allocated: number; available: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [greeting] = useState(() => {
    const hour = new Date().getHours();
    return hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  });

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Safe audit logs query that adapts to user role
      let auditLogQuery = supabase
        .from('audit_logs')
        .select('*, actor:profiles(full_name, email)')
        .order('created_at', { ascending: false })
        .limit(8);

      if (profile && !['admin', 'asset_manager', 'department_head'].includes(profile.role)) {
        auditLogQuery = auditLogQuery.eq('actor_id', profile.id);
      }

      // Fetch all stats in parallel
      const [
        { count: totalAssets },
        { count: availableAssets },
        { count: allocatedAssets },
        { count: maintenanceAssets },
        { count: pendingMaintenance },
        { count: activeBookings },
        recentActivityRes,
        { data: categoryData },
        { data: deptData },
      ] = await Promise.all([
        supabase.from('assets').select('*', { count: 'exact', head: true }),
        supabase.from('assets').select('*', { count: 'exact', head: true }).eq('status', 'available'),
        supabase.from('assets').select('*', { count: 'exact', head: true }).eq('status', 'allocated'),
        supabase.from('assets').select('*', { count: 'exact', head: true }).eq('status', 'maintenance'),
        supabase.from('maintenance_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
        auditLogQuery,
        supabase.from('assets').select('category:asset_categories(name)').not('category_id', 'is', null),
        supabase.from('departments').select('name, id').eq('is_active', true).limit(6),
      ]);

      const recentActivity = (recentActivityRes as { data?: unknown[] })?.data ?? [];

      // Overdue allocations
      const { count: overdueAllocations } = await supabase
        .from('allocations')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')
        .lt('expected_return', new Date().toISOString());

      setStats({
        totalAssets: totalAssets ?? 0,
        availableAssets: availableAssets ?? 0,
        allocatedAssets: allocatedAssets ?? 0,
        maintenanceAssets: maintenanceAssets ?? 0,
        pendingRequests: (pendingMaintenance ?? 0),
        activeBookings: activeBookings ?? 0,
        overdueAllocations: overdueAllocations ?? 0,
        recentActivity: (recentActivity as AuditLog[]) ?? [],
      });

      // Category distribution
      if (categoryData) {
        const catCounts: Record<string, number> = {};
        (categoryData as unknown as { category: { name: string } | { name: string }[] | null }[]).forEach(a => {
          const cat = Array.isArray(a.category) ? a.category[0] : a.category;
          const name = cat?.name ?? 'Unknown';
          catCounts[name] = (catCounts[name] ?? 0) + 1;
        });
        setAssetByCategory(Object.entries(catCounts).map(([name, value]) => ({ name, value })));
      }

      // Department-wise allocation: single aggregated query instead of N+1 queries
      if (deptData && deptData.length > 0) {
        const typedDeptData = deptData as { id: string; name: string }[];
        const deptIds = typedDeptData.map(d => d.id);
        const { data: deptAssets } = await supabase
          .from('assets')
          .select('department_id, status')
          .in('department_id', deptIds)
          .in('status', ['allocated', 'available']);

        const deptMap = new Map<string, { dept: string; allocated: number; available: number }>();
        typedDeptData.forEach(d => {
          deptMap.set(d.id, {
            dept: d.name.length > 12 ? d.name.slice(0, 12) + '…' : d.name,
            allocated: 0,
            available: 0,
          });
        });

        (deptAssets || []).forEach(a => {
          if (a.department_id && deptMap.has(a.department_id)) {
            const entry = deptMap.get(a.department_id)!;
            if (a.status === 'allocated') entry.allocated++;
            if (a.status === 'available') entry.available++;
          }
        });

        setDeptAllocation(Array.from(deptMap.values()).filter(d => d.allocated + d.available > 0));
      }
    } catch (err) {
      setError('Failed to load dashboard data. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
        <div style={{ textAlign: 'center' }}>
          <Loader2 size={32} className="animate-spin" style={{ color: '#6366f1', margin: '0 auto 12px' }} />
          <p style={{ color: '#94a3b8' }}>Loading dashboard…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <div className="alert alert-error">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
        <button className="btn btn-secondary" style={{ marginTop: 12 }} onClick={fetchStats}>Retry</button>
      </div>
    );
  }

  const statCards = [
    { label: 'Total Assets', value: stats?.totalAssets ?? 0, icon: <Package size={20} />, color: '#6366f1', bg: 'rgba(99,102,241,0.1)', filter: '/assets' },
    { label: 'Available', value: stats?.availableAssets ?? 0, icon: <CheckCircle size={20} />, color: '#10b981', bg: 'rgba(16,185,129,0.1)', filter: '/assets?status=available' },
    { label: 'Allocated', value: stats?.allocatedAssets ?? 0, icon: <GitBranch size={20} />, color: '#06b6d4', bg: 'rgba(6,182,212,0.1)', filter: '/allocations' },
    { label: 'Maintenance', value: stats?.maintenanceAssets ?? 0, icon: <Wrench size={20} />, color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', filter: '/maintenance' },
    { label: 'Pending Requests', value: stats?.pendingRequests ?? 0, icon: <Clock size={20} />, color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)', filter: '/maintenance?status=pending' },
    { label: 'Active Bookings', value: stats?.activeBookings ?? 0, icon: <Calendar size={20} />, color: '#06b6d4', bg: 'rgba(6,182,212,0.1)', filter: '/bookings' },
    { label: 'Overdue Returns', value: stats?.overdueAllocations ?? 0, icon: <AlertTriangle size={20} />, color: '#ef4444', bg: 'rgba(239,68,68,0.1)', filter: '/allocations?status=overdue' },
  ];

  const isEmpty = (stats?.totalAssets ?? 0) === 0;

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
          Good {greeting}, {profile?.full_name?.split(' ')[0] || 'there'} 👋
        </h1>
        <p style={{ color: '#94a3b8', fontSize: 14 }}>Here's what's happening with your assets today.</p>
      </div>

      {isEmpty && (
        <div className="card" style={{ marginBottom: 24, textAlign: 'center', padding: '40px 24px', background: 'rgba(99,102,241,0.05)', borderColor: 'rgba(99,102,241,0.2)' }}>
          <Package size={40} style={{ color: '#6366f1', margin: '0 auto 12px', opacity: 0.6 }} />
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No assets yet</h3>
          <p style={{ color: '#94a3b8', fontSize: 14, marginBottom: 16 }}>Get started by registering your first asset in the system.</p>
          <button className="btn btn-primary" onClick={() => navigate('/assets/new')}>Register First Asset</button>
        </div>
      )}

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16, marginBottom: 28 }}>
        {statCards.map(card => (
          <div key={card.label} className="stat-card" onClick={() => navigate(card.filter)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: card.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: card.color }}>
                {card.icon}
              </div>
              <ArrowRight size={14} style={{ color: '#64748b', marginTop: 4 }} />
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: card.color, lineHeight: 1 }}>{card.value}</div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{card.label}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20, marginBottom: 28 }}>
        {/* Asset by category pie chart */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>Asset Distribution</h3>
            <TrendingUp size={16} style={{ color: '#64748b' }} />
          </div>
          {assetByCategory.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={assetByCategory} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={48}>
                  {assetByCategory.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#252637', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 13 }}>No category data available</div>
          )}
        </div>

        {/* Department allocation bar chart */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>Department Allocation</h3>
            <TrendingUp size={16} style={{ color: '#64748b' }} />
          </div>
          {deptAllocation.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={deptAllocation} margin={{ top: 4, right: 4, left: -16, bottom: 4 }}>
                <XAxis dataKey="dept" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#252637', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }} />
                <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                <Bar dataKey="allocated" fill="#6366f1" name="Allocated" radius={[4, 4, 0, 0]} />
                <Bar dataKey="available" fill="#10b981" name="Available" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 13 }}>No department data available</div>
          )}
        </div>
      </div>

      {/* Recent activity */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600 }}>Recent Activity</h3>
          {profile?.role === 'admin' && (
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/audit-logs')} style={{ fontSize: 12 }}>View all</button>
          )}
        </div>
        {stats?.recentActivity && stats.recentActivity.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {stats.recentActivity.map((log, i) => (
              <div key={log.id} style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: i < (stats.recentActivity?.length ?? 0) - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', alignItems: 'flex-start' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366f1', flexShrink: 0, fontSize: 11, fontWeight: 700 }}>
                  {(log.actor_email || 'S').charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: '#f1f5f9', lineHeight: 1.4 }}>{log.description}</div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{formatRelative(log.created_at)}</div>
                </div>
                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999, background: 'rgba(99,102,241,0.1)', color: '#a5b4fc', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 }}>
                  {log.action}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: '24px 0', textAlign: 'center', color: '#64748b', fontSize: 13 }}>No recent activity recorded</div>
        )}
      </div>
    </div>
  );
}
