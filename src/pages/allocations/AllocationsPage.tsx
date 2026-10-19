import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search, GitBranch, AlertTriangle, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { Allocation } from '../../types';
import { formatDate, getAllocationStatusBadge, getStatusLabel, extractErrorMessage, isOverdue } from '../../lib/utils';
import AllocateAssetModal from './AllocateAssetModal';
import ReturnAssetModal from './ReturnAssetModal';

const PAGE_SIZE = 15;

export default function AllocationsPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [showAllocate, setShowAllocate] = useState(false);
  const [returnAlloc, setReturnAlloc] = useState<Allocation | null>(null);

  const canManage = profile && ['admin', 'asset_manager'].includes(profile.role);

  const fetchAllocations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase.from('allocations').select(`
        *,
        asset:assets(id, name, asset_tag),
        assignee:profiles!assigned_to(id, full_name, email),
        assigner:profiles!assigned_by(id, full_name, email),
        department:departments(id, name)
      `, { count: 'exact' });

      if (statusFilter) query = query.eq('status', statusFilter);
      if (!canManage) query = query.eq('assigned_to', profile?.id);

      if (search.trim()) {
        const term = search.trim();
        const [{ data: matchingAssets }, { data: matchingUsers }] = await Promise.all([
          supabase.from('assets').select('id').or(`name.ilike.%${term}%,asset_tag.ilike.%${term}%`),
          supabase.from('profiles').select('id').or(`full_name.ilike.%${term}%,email.ilike.%${term}%`),
        ]);
        const assetIds = (matchingAssets || []).map(a => a.id);
        const userIds = (matchingUsers || []).map(u => u.id);

        const conditions: string[] = [`notes.ilike.%${term}%`];
        if (assetIds.length > 0) conditions.push(`asset_id.in.(${assetIds.join(',')})`);
        if (userIds.length > 0) conditions.push(`assigned_to.in.(${userIds.join(',')})`);
        query = query.or(conditions.join(','));
      }

      const from = (page - 1) * PAGE_SIZE;
      const { data, count, error: err } = await query
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (err) throw err;
      setAllocations((data as Allocation[]) ?? []);
      setTotal(count ?? 0);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page, search, canManage, profile]);

  useEffect(() => { fetchAllocations(); }, [fetchAllocations]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Allocations</h1>
          <p style={{ color: '#94a3b8', fontSize: 13 }}>{total} record{total !== 1 ? 's' : ''}</p>
        </div>
        {canManage && (
          <button id="allocate-asset-btn" className="btn btn-primary btn-sm" onClick={() => setShowAllocate(true)}>
            <Plus size={14} /> Allocate Asset
          </button>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
            <input id="alloc-search" className="input" placeholder="Search asset or person…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} style={{ paddingLeft: 34 }} />
          </div>
          <select id="alloc-status" className="input" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} style={{ width: 'auto', minWidth: 150 }}>
            <option value="">All Statuses</option>
            {['active','returned','overdue','transferred'].map(s => <option key={s} value={s}>{getStatusLabel(s)}</option>)}
          </select>
        </div>
      </div>

      {error ? (
        <div className="alert alert-error"><AlertTriangle size={16} /><span>{error}</span></div>
      ) : loading ? (
        <div style={{ display: 'grid', gap: 8 }}>{Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 52, borderRadius: 8 }} />)}</div>
      ) : allocations.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <GitBranch size={40} style={{ color: '#64748b', margin: '0 auto 12px', opacity: 0.5 }} />
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>No allocations found</h3>
          <p style={{ color: '#94a3b8', fontSize: 13 }}>
            {canManage ? 'Allocate assets to employees to track assignment.' : 'No assets are currently allocated to you.'}
          </p>
        </div>
      ) : (
        <>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Assigned To</th>
                  <th>Department</th>
                  <th>Allocated On</th>
                  <th>Expected Return</th>
                  <th>Status</th>
                  {canManage && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {allocations.map(alloc => (
                  <tr key={alloc.id}>
                    <td>
                      <div style={{ fontWeight: 500, cursor: 'pointer', color: '#a5b4fc' }} onClick={() => navigate(`/assets/${alloc.asset_id}`)}>{alloc.asset?.name ?? alloc.asset_id}</div>
                      <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>{alloc.asset?.asset_tag}</div>
                    </td>
                    <td>
                      <div style={{ fontSize: 13 }}>{alloc.assignee?.full_name ?? '—'}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>{alloc.assignee?.email}</div>
                    </td>
                    <td style={{ color: '#94a3b8', fontSize: 13 }}>{alloc.department?.name ?? '—'}</td>
                    <td style={{ color: '#94a3b8', fontSize: 13 }}>{formatDate(alloc.allocation_date)}</td>
                    <td style={{ color: alloc.status === 'active' && isOverdue(alloc.expected_return) ? '#ef4444' : '#94a3b8', fontSize: 13 }}>
                      {formatDate(alloc.expected_return) || '—'}
                    </td>
                    <td><span className={`badge ${getAllocationStatusBadge(alloc.status)}`}>{getStatusLabel(alloc.status)}</span></td>
                    {canManage && (
                      <td>
                        {(alloc.status === 'active' || alloc.status === 'overdue') && (
                          <button className="btn btn-secondary btn-sm" onClick={() => setReturnAlloc(alloc)}>
                            <RotateCcw size={12} /> Return
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
              <span style={{ fontSize: 13, color: '#94a3b8' }}>Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}</span>
              <div className="pagination">
                <button className="page-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}><ChevronLeft size={14} /></button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
                  return p <= totalPages ? <button key={p} className={`page-btn ${p === page ? 'active' : ''}`} onClick={() => setPage(p)}>{p}</button> : null;
                })}
                <button className="page-btn" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight size={14} /></button>
              </div>
            </div>
          )}
        </>
      )}

      {showAllocate && <AllocateAssetModal onClose={() => setShowAllocate(false)} onSuccess={() => { setShowAllocate(false); fetchAllocations(); }} />}
      {returnAlloc && <ReturnAssetModal allocation={returnAlloc} onClose={() => setReturnAlloc(null)} onSuccess={() => { setReturnAlloc(null); fetchAllocations(); }} />}
    </div>
  );
}
