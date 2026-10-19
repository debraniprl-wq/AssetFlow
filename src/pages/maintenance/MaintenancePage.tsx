import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { Plus, Wrench, AlertTriangle, ChevronLeft, ChevronRight, X, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { MaintenanceRequest, Asset } from '../../types';
import {
  formatDate, getMaintenanceStatusBadge, getPriorityBadge,
  getStatusLabel, extractErrorMessage
} from '../../lib/utils';
import toast from 'react-hot-toast';

const PAGE_SIZE = 15;

export default function MaintenancePage() {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const canManage = profile && ['admin', 'asset_manager'].includes(profile.role);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase.from('maintenance_requests').select(`
        *,
        asset:assets(id, name, asset_tag),
        reporter:profiles!reported_by(id, full_name),
        assignee:profiles!assigned_to(id, full_name)
      `, { count: 'exact' });

      if (statusFilter) query = query.eq('status', statusFilter);
      if (priorityFilter) query = query.eq('priority', priorityFilter);
      if (!canManage) query = query.eq('reported_by', profile?.id);

      const from = (page - 1) * PAGE_SIZE;
      const { data, count, error: err } = await query
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (err) throw err;
      setRequests((data as MaintenanceRequest[]) ?? []);
      setTotal(count ?? 0);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, priorityFilter, page, canManage, profile]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const updateStatus = useCallback(async (id: string, status: string, extra: Record<string, unknown> = {}) => {
    const { error: err } = await supabase.from('maintenance_requests').update({
      status,
      ...extra,
      ...(status === 'approved' ? { approved_by: profile?.id, approved_at: new Date().toISOString() } : {}),
      ...(status === 'completed' ? { completed_at: new Date().toISOString() } : {}),
    }).eq('id', id);
    if (err) { toast.error(extractErrorMessage(err)); return; }

    // If approved, set asset to maintenance
    if (status === 'approved' || status === 'in_progress') {
      const req = requests.find(r => r.id === id);
      if (req) await supabase.from('assets').update({ status: 'maintenance' }).eq('id', req.asset_id);
    }
    // If completed/rejected, make asset available again
    if (status === 'completed' || status === 'rejected') {
      const req = requests.find(r => r.id === id);
      if (req) await supabase.from('assets').update({ status: 'available' }).eq('id', req.asset_id);
    }

    // Send notification to the reporter
    const req = requests.find(r => r.id === id);
    if (req?.reported_by) {
      await supabase.rpc('create_notification', {
        p_user_id: req.reported_by,
        p_title: `Maintenance Request ${getStatusLabel(status)}`,
        p_message: `Your maintenance request "${req.title}" for ${req.asset?.name ?? 'an asset'} is now ${getStatusLabel(status)}.`,
        p_type: status === 'completed' ? 'success' : status === 'rejected' ? 'warning' : 'info',
        p_entity_type: 'maintenance',
        p_entity_id: id,
      });
    }

    toast.success(`Status updated to ${getStatusLabel(status)}`);
    fetchRequests();
  }, [profile?.id, requests, fetchRequests]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Maintenance</h1>
          <p style={{ color: '#94a3b8', fontSize: 13 }}>{total} request{total !== 1 ? 's' : ''}</p>
        </div>
        <button id="create-maintenance-btn" className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
          <Plus size={14} /> Report Issue
        </button>
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <select id="maint-status-filter" className="input" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} style={{ width: 'auto', minWidth: 160 }}>
          <option value="">All Statuses</option>
          {['pending','approved','in_progress','completed','rejected'].map(s => <option key={s} value={s}>{getStatusLabel(s)}</option>)}
        </select>
        <select id="maint-priority-filter" className="input" value={priorityFilter} onChange={e => { setPriorityFilter(e.target.value); setPage(1); }} style={{ width: 'auto', minWidth: 140 }}>
          <option value="">All Priorities</option>
          {['low','medium','high','critical'].map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
        </select>
      </div>

      {error ? (
        <div className="alert alert-error"><AlertTriangle size={16} /><span>{error}</span></div>
      ) : loading ? (
        <div style={{ display: 'grid', gap: 8 }}>{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 80, borderRadius: 8 }} />)}</div>
      ) : requests.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <Wrench size={40} style={{ color: '#64748b', margin: '0 auto 12px', opacity: 0.5 }} />
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>No maintenance requests</h3>
          <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Report an issue with an asset to start a maintenance request.</p>
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>Report Issue</button>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {requests.map(req => (
              <div key={req.id} className="card" style={{ padding: '14px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{req.title}</span>
                      <span className={`badge ${getMaintenanceStatusBadge(req.status)}`}>{getStatusLabel(req.status)}</span>
                      <span className={`badge ${getPriorityBadge(req.priority)}`}>{req.priority}</span>
                    </div>
                    <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 4 }}>
                      Asset: <span style={{ color: '#a5b4fc', cursor: 'pointer' }}>{req.asset?.name ?? req.asset_id}</span> · Category: {req.issue_category}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                      Reported by {req.reporter?.full_name ?? 'unknown'} · {formatDate(req.created_at)}
                      {req.assignee && ` · Assigned to ${req.assignee.full_name}`}
                    </div>
                    <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 6, lineHeight: 1.4 }}>{req.description}</div>
                  </div>
                  {canManage && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
                      {req.status === 'pending' && (
                        <>
                          <button id={`approve-maint-${req.id}`} className="btn btn-secondary btn-sm" style={{ color: '#10b981', fontSize: 12 }} onClick={() => updateStatus(req.id, 'approved')}>Approve</button>
                          <button id={`reject-maint-${req.id}`} className="btn btn-danger btn-sm" style={{ fontSize: 12 }} onClick={() => updateStatus(req.id, 'rejected')}>Reject</button>
                        </>
                      )}
                      {req.status === 'approved' && (
                        <button className="btn btn-secondary btn-sm" style={{ fontSize: 12 }} onClick={() => updateStatus(req.id, 'in_progress')}>Start Work</button>
                      )}
                      {req.status === 'in_progress' && (
                        <button className="btn btn-secondary btn-sm" style={{ color: '#10b981', fontSize: 12 }} onClick={() => updateStatus(req.id, 'completed')}>Mark Complete</button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <div className="pagination">
                <button className="page-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}><ChevronLeft size={14} /></button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => { const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i; return p <= totalPages ? <button key={p} className={`page-btn ${p === page ? 'active' : ''}`} onClick={() => setPage(p)}>{p}</button> : null; })}
                <button className="page-btn" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight size={14} /></button>
              </div>
            </div>
          )}
        </>
      )}

      {showCreate && <CreateMaintenanceModal onClose={() => setShowCreate(false)} onSuccess={() => { setShowCreate(false); fetchRequests(); }} />}
    </div>
  );
}

// ── Create Maintenance Modal ──────────────────────────────────────────────────
function CreateMaintenanceModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { profile } = useAuth();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetId, setAssetId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Hardware Failure');
  const [priority, setPriority] = useState('medium');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('assets').select('id, asset_tag, name').not('status', 'eq', 'retired').order('name').limit(200).then(({ data }) => { if (data) setAssets(data as Asset[]); });
  }, []);

  const CATEGORIES = ['Hardware Failure', 'Software Issue', 'Physical Damage', 'Preventive Maintenance', 'Performance Issue', 'Network/Connectivity', 'Other'];

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!assetId) { setError('Please select an asset.'); return; }
    if (!title.trim()) { setError('Title is required.'); return; }
    if (!description.trim()) { setError('Description is required.'); return; }

    setLoading(true);
    const { data: req, error: err } = await supabase.from('maintenance_requests').insert({
      asset_id: assetId,
      reported_by: profile!.id,
      title: title.trim(),
      description: description.trim(),
      issue_category: category,
      priority,
      status: 'pending',
    }).select().single();
    setLoading(false);

    if (err) { setError(extractErrorMessage(err)); return; }

    await supabase.from('audit_logs').insert({
      actor_id: profile?.id, actor_email: profile?.email,
      action: 'create', entity_type: 'maintenance', entity_id: req?.id,
      description: `Reported maintenance issue: ${title} for asset ${assetId}`,
    });

    toast.success('Maintenance request submitted');
    onSuccess();
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 500 }}>
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>Report Maintenance Issue</h2>
          <button onClick={onClose} className="btn btn-ghost btn-icon"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && <div className="alert alert-error"><AlertTriangle size={14} /><span>{error}</span></div>}
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#94a3b8', marginBottom: 6 }}>Asset <span style={{ color: '#ef4444' }}>*</span></label>
            <select id="maint-asset-select" className="input" value={assetId} onChange={e => setAssetId(e.target.value)} required>
              <option value="">Select asset…</option>
              {assets.map(a => <option key={a.id} value={a.id}>{a.asset_tag} — {a.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#94a3b8', marginBottom: 6 }}>Issue Title <span style={{ color: '#ef4444' }}>*</span></label>
            <input id="maint-title" className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Brief summary of the issue" required />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#94a3b8', marginBottom: 6 }}>Category</label>
              <select id="maint-category" className="input" value={category} onChange={e => setCategory(e.target.value)}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#94a3b8', marginBottom: 6 }}>Priority</label>
              <select id="maint-priority" className="input" value={priority} onChange={e => setPriority(e.target.value)}>
                {['low','medium','high','critical'].map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#94a3b8', marginBottom: 6 }}>Description <span style={{ color: '#ef4444' }}>*</span></label>
            <textarea id="maint-description" className="input" rows={4} value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe the issue in detail…" style={{ resize: 'vertical' }} required />
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button id="submit-maintenance-btn" type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Wrench size={14} />}
              {loading ? 'Submitting…' : 'Submit Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
