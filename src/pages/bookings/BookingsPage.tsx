import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { Plus, Calendar, AlertTriangle, ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { Booking, Resource, Department } from '../../types';
import { formatDateTime, getBookingStatusBadge, getStatusLabel, extractErrorMessage } from '../../lib/utils';
import toast from 'react-hot-toast';

const PAGE_SIZE = 15;

export default function BookingsPage() {
  const { profile } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const canManage = profile && ['admin', 'asset_manager', 'department_head'].includes(profile.role);

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase.from('bookings').select(`
        *,
        resource:resources(id, name, type, location),
        booker:profiles!booked_by(id, full_name, email)
      `, { count: 'exact' });

      if (statusFilter) query = query.eq('status', statusFilter);
      if (!canManage) query = query.eq('booked_by', profile?.id);

      const from = (page - 1) * PAGE_SIZE;
      const { data, count, error: err } = await query
        .order('start_time', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (err) throw err;
      setBookings((data as Booking[]) ?? []);
      setTotal(count ?? 0);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page, canManage, profile]);

  useEffect(() => { fetchBookings(); }, [fetchBookings]);

  const handleApprove = useCallback(async (id: string, action: 'approved' | 'rejected') => {
    const { error: err } = await supabase.from('bookings').update({
      status: action,
      approved_by: profile?.id,
      approved_at: new Date().toISOString(),
    }).eq('id', id);
    if (err) { toast.error(extractErrorMessage(err)); return; }
    toast.success(`Booking ${action}`);
    fetchBookings();
  }, [profile?.id, fetchBookings]);

  const handleCancel = useCallback(async (id: string) => {
    const { error: err } = await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', id);
    if (err) { toast.error(extractErrorMessage(err)); return; }
    toast.success('Booking cancelled');
    fetchBookings();
  }, [fetchBookings]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Resource Bookings</h1>
          <p style={{ color: '#94a3b8', fontSize: 13 }}>{total} booking{total !== 1 ? 's' : ''}</p>
        </div>
        <button id="create-booking-btn" className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
          <Plus size={14} /> New Booking
        </button>
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 16 }}>
        <select id="booking-status-filter" className="input" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} style={{ width: 'auto', minWidth: 180 }}>
          <option value="">All Statuses</option>
          {['pending','approved','rejected','cancelled','completed'].map(s => <option key={s} value={s}>{getStatusLabel(s)}</option>)}
        </select>
      </div>

      {error ? (
        <div className="alert alert-error"><AlertTriangle size={16} /><span>{error}</span></div>
      ) : loading ? (
        <div style={{ display: 'grid', gap: 8 }}>{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 72, borderRadius: 8 }} />)}</div>
      ) : bookings.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <Calendar size={40} style={{ color: '#64748b', margin: '0 auto 12px', opacity: 0.5 }} />
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>No bookings found</h3>
          <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Book a meeting room, projector, or shared resource.</p>
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>Create Booking</button>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {bookings.map(b => (
              <div key={b.id} className="card" style={{ padding: '14px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{b.title}</span>
                      <span className={`badge ${getBookingStatusBadge(b.status)}`}>{getStatusLabel(b.status)}</span>
                    </div>
                    <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 2 }}>
                      {b.resource?.name} {b.resource?.location && `· ${b.resource.location}`}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                      {formatDateTime(b.start_time)} → {formatDateTime(b.end_time)}
                    </div>
                    {canManage && <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>by {b.booker?.full_name}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {canManage && b.status === 'pending' && (
                      <>
                        <button id={`approve-booking-${b.id}`} className="btn btn-secondary btn-sm" style={{ color: '#10b981', fontSize: 12 }} onClick={() => handleApprove(b.id, 'approved')}>Approve</button>
                        <button id={`reject-booking-${b.id}`} className="btn btn-danger btn-sm" style={{ fontSize: 12 }} onClick={() => handleApprove(b.id, 'rejected')}>Reject</button>
                      </>
                    )}
                    {(b.booked_by === profile?.id || canManage) && b.status === 'pending' && (
                      <button className="btn btn-ghost btn-sm" style={{ fontSize: 12 }} onClick={() => handleCancel(b.id)}><X size={12} /> Cancel</button>
                    )}
                  </div>
                </div>
                {b.purpose && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)' }}>{b.purpose}</div>}
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

      {showCreate && <CreateBookingModal onClose={() => setShowCreate(false)} onSuccess={() => { setShowCreate(false); fetchBookings(); }} />}
    </div>
  );
}

// ── Create Booking Modal ──────────────────────────────────────────────────────
function CreateBookingModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { profile } = useAuth();
  const [resources, setResources] = useState<Resource[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [resourceId, setResourceId] = useState('');
  const [deptId, setDeptId] = useState(profile?.department_id ?? '');
  const [title, setTitle] = useState('');
  const [purpose, setPurpose] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [minDateTime] = useState(() => new Date().toISOString().slice(0, 16));

  useEffect(() => {
    supabase.from('resources').select('*').eq('is_active', true).order('name').then(({ data }) => { if (data) setResources(data as Resource[]); });
    supabase.from('departments').select('id, name').eq('is_active', true).order('name').then(({ data }) => { if (data) setDepartments(data as Department[]); });
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!resourceId) { setError('Please select a resource.'); return; }
    if (!title.trim()) { setError('Title is required.'); return; }
    if (!startTime || !endTime) { setError('Start and end time are required.'); return; }
    if (new Date(endTime) <= new Date(startTime)) { setError('End time must be after start time.'); return; }

    setLoading(true);
    const { data: bookingId, error: err } = await supabase.rpc('create_booking_safe', {
      p_resource_id: resourceId,
      p_booked_by: profile!.id,
      p_department_id: deptId || null,
      p_title: title.trim(),
      p_purpose: purpose.trim() || null,
      p_start_time: new Date(startTime).toISOString(),
      p_end_time: new Date(endTime).toISOString(),
      p_notes: notes.trim() || null,
    });
    setLoading(false);

    if (err) { setError(extractErrorMessage(err)); return; }

    await supabase.from('audit_logs').insert({
      actor_id: profile?.id, actor_email: profile?.email,
      action: 'create', entity_type: 'booking', entity_id: bookingId,
      description: `Created booking "${title}" for resource`,
    });

    toast.success('Booking created');
    onSuccess();
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 500 }}>
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>New Booking</h2>
          <button onClick={onClose} className="btn btn-ghost btn-icon"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && <div className="alert alert-error"><AlertTriangle size={14} /><span>{error}</span></div>}
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#94a3b8', marginBottom: 6 }}>Resource <span style={{ color: '#ef4444' }}>*</span></label>
            <select id="booking-resource" className="input" value={resourceId} onChange={e => setResourceId(e.target.value)} required>
              <option value="">Select resource…</option>
              {resources.map(r => <option key={r.id} value={r.id}>{r.name} ({r.type}){r.location ? ` — ${r.location}` : ''}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#94a3b8', marginBottom: 6 }}>Department</label>
            <select id="booking-department" className="input" value={deptId} onChange={e => setDeptId(e.target.value)}>
              <option value="">None (Personal / General)</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#94a3b8', marginBottom: 6 }}>Title <span style={{ color: '#ef4444' }}>*</span></label>
            <input id="booking-title" className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Weekly Team Meeting" required />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#94a3b8', marginBottom: 6 }}>Start Time <span style={{ color: '#ef4444' }}>*</span></label>
              <input id="booking-start" type="datetime-local" className="input" value={startTime} onChange={e => setStartTime(e.target.value)} min={minDateTime} required />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#94a3b8', marginBottom: 6 }}>End Time <span style={{ color: '#ef4444' }}>*</span></label>
              <input id="booking-end" type="datetime-local" className="input" value={endTime} onChange={e => setEndTime(e.target.value)} min={startTime || minDateTime} required />
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#94a3b8', marginBottom: 6 }}>Purpose</label>
            <textarea id="booking-purpose" className="input" rows={2} value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="Purpose of booking…" style={{ resize: 'vertical' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#94a3b8', marginBottom: 6 }}>Notes</label>
            <input id="booking-notes" className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional special notes…" />
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button id="confirm-booking-btn" type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <Loader2 size={14} className="animate-spin" /> : null}
              {loading ? 'Creating…' : 'Create Booking'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
