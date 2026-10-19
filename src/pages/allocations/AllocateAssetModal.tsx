import React, { useState, useEffect } from 'react';
import { X, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { Asset, Profile, Department } from '../../types';
import { extractErrorMessage } from '../../lib/utils';
import toast from 'react-hot-toast';

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

export default function AllocateAssetModal({ onClose, onSuccess }: Props) {
  const { profile } = useAuth();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [assetId, setAssetId] = useState('');
  const [userId, setUserId] = useState('');
  const [deptId, setDeptId] = useState('');
  const [expectedReturn, setExpectedReturn] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      supabase.from('assets').select('id, asset_tag, name').eq('status', 'available').order('name').limit(100),
      supabase.from('profiles').select('id, full_name, email, department_id').eq('is_active', true).order('full_name').limit(200),
      supabase.from('departments').select('id, name').eq('is_active', true).order('name'),
    ]).then(([{ data: a }, { data: u }, { data: d }]) => {
      if (a) setAssets(a as Asset[]);
      if (u) setUsers(u as Profile[]);
      if (d) setDepartments(d as Department[]);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!assetId) { setError('Please select an asset.'); return; }
    if (!userId) { setError('Please select an employee.'); return; }

    setLoading(true);
    const { data, error: err } = await supabase.rpc('allocate_asset', {
      p_asset_id: assetId,
      p_assigned_to: userId,
      p_assigned_by: profile!.id,
      p_department_id: deptId || null,
      p_expected_return: expectedReturn ? new Date(expectedReturn).toISOString() : null,
      p_notes: notes.trim() || null,
    });
    setLoading(false);

    if (err) { setError(extractErrorMessage(err)); return; }

    const selectedAsset = assets.find(a => a.id === assetId);
    const selectedUser = users.find(u => u.id === userId);

    // Create notification for assignee
    await supabase.rpc('create_notification', {
      p_user_id: userId,
      p_title: 'Asset Allocated',
      p_message: `${selectedAsset?.name} (${selectedAsset?.asset_tag}) has been allocated to you by ${profile?.full_name}.`,
      p_type: 'success',
      p_entity_type: 'allocation',
      p_entity_id: data,
    });

    // Audit log
    await supabase.from('audit_logs').insert({
      actor_id: profile?.id, actor_email: profile?.email,
      action: 'allocate', entity_type: 'allocation', entity_id: data,
      description: `Allocated ${selectedAsset?.name} (${selectedAsset?.asset_tag}) to ${selectedUser?.full_name}`,
    });

    toast.success('Asset allocated successfully');
    onSuccess();
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 480 }}>
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>Allocate Asset</h2>
          <button onClick={onClose} className="btn btn-ghost btn-icon"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {error && <div className="alert alert-error"><AlertCircle size={14} /><span>{error}</span></div>}

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#94a3b8', marginBottom: 6 }}>Available Asset <span style={{ color: '#ef4444' }}>*</span></label>
            <select id="alloc-asset-select" className="input" value={assetId} onChange={e => setAssetId(e.target.value)} required>
              <option value="">Select an available asset…</option>
              {assets.map(a => <option key={a.id} value={a.id}>{a.asset_tag} — {a.name}</option>)}
            </select>
            {assets.length === 0 && <p style={{ fontSize: 12, color: '#f59e0b', marginTop: 4 }}>No available assets found.</p>}
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#94a3b8', marginBottom: 6 }}>Assign To <span style={{ color: '#ef4444' }}>*</span></label>
            <select
              id="alloc-user-select"
              className="input"
              value={userId}
              onChange={e => {
                const uid = e.target.value;
                setUserId(uid);
                const u = users.find(x => x.id === uid);
                if (u?.department_id && !deptId) setDeptId(u.department_id);
              }}
              required
            >
              <option value="">Select employee…</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>)}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#94a3b8', marginBottom: 6 }}>Department</label>
            <select id="alloc-dept-select" className="input" value={deptId} onChange={e => setDeptId(e.target.value)}>
              <option value="">No department</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#94a3b8', marginBottom: 6 }}>Expected Return Date</label>
            <input id="alloc-return-date" type="datetime-local" className="input" value={expectedReturn} onChange={e => setExpectedReturn(e.target.value)} />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#94a3b8', marginBottom: 6 }}>Notes</label>
            <textarea id="alloc-notes" className="input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional allocation notes…" style={{ resize: 'vertical' }} />
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button id="confirm-allocate-btn" type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <Loader2 size={14} className="animate-spin" /> : null}
              {loading ? 'Allocating…' : 'Allocate Asset'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
