import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { extractErrorMessage } from '../../lib/utils';
import { Building2, Plus, Edit2, Loader2, AlertTriangle, X, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import type { Department } from '../../types';

export default function DepartmentsPage() {
  const { profile } = useAuth();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);

  const fetchDepts = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('departments')
      .select('*')
      .order('name');
    if (err) { setError(extractErrorMessage(err)); }
    else { setDepartments((data ?? []) as Department[]); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchDepts(); }, [fetchDepts]);

  const handleToggleActive = async (dept: Department) => {
    const { error: err } = await supabase
      .from('departments')
      .update({ is_active: !dept.is_active })
      .eq('id', dept.id);
    if (err) { toast.error(extractErrorMessage(err)); return; }
    await supabase.from('audit_logs').insert({
      actor_id: profile?.id, actor_email: profile?.email,
      action: 'update', entity_type: 'department', entity_id: dept.id,
      description: `${dept.is_active ? 'Deactivated' : 'Activated'} department "${dept.name}"`,
    });
    toast.success(`Department ${dept.is_active ? 'deactivated' : 'activated'}`);
    fetchDepts();
  };

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Departments</h1>
          <p style={{ color: '#94a3b8', fontSize: 13 }}>{departments.length} departments</p>
        </div>
        <button id="create-dept-btn" className="btn btn-primary btn-sm" onClick={() => { setEditing(null); setShowModal(true); }}>
          <Plus size={14} /> New Department
        </button>
      </div>

      {error && <div className="alert alert-error"><AlertTriangle size={16} /><span>{error}</span></div>}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <Loader2 size={28} className="animate-spin" style={{ color: '#6366f1' }} />
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {departments.map(dept => (
            <div key={dept.id} className="card" style={{ padding: 20, opacity: dept.is_active ? 1 : 0.6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Building2 size={16} color="white" />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{dept.name}</div>
                    <div style={{ fontSize: 12, color: '#64748b', fontFamily: 'monospace' }}>{dept.code}</div>
                  </div>
                </div>
                <span className={`badge ${dept.is_active ? 'badge-success' : 'badge-gray'}`}>
                  {dept.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              {dept.description && (
                <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 12, lineHeight: 1.5 }}>{dept.description}</p>
              )}
              <div style={{ display: 'flex', gap: 8, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => { setEditing(dept); setShowModal(true); }}
                  style={{ flex: 1 }}
                >
                  <Edit2 size={13} /> Edit
                </button>
                <button
                  className={`btn btn-sm ${dept.is_active ? 'btn-danger' : 'btn-secondary'}`}
                  onClick={() => handleToggleActive(dept)}
                  style={{ flex: 1, fontSize: 12 }}
                >
                  {dept.is_active ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <DepartmentModal
          dept={editing}
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); fetchDepts(); }}
        />
      )}
    </div>
  );
}

function DepartmentModal({ dept, onClose, onSuccess }: { dept: Department | null; onClose: () => void; onSuccess: () => void }) {
  const { profile } = useAuth();
  const isEdit = !!dept;
  const [name, setName] = useState(dept?.name ?? '');
  const [code, setCode] = useState(dept?.code ?? '');
  const [description, setDescription] = useState(dept?.description ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) { setError('Name is required.'); return; }
    if (!code.trim()) { setError('Code is required.'); return; }

    setLoading(true);
    const payload = {
      name: name.trim(),
      code: code.trim().toUpperCase(),
      description: description.trim() || null,
    };

    let err: { message?: string } | null = null;
    let id = dept?.id;
    if (isEdit) {
      const res = await supabase.from('departments').update(payload).eq('id', dept!.id);
      err = res.error;
    } else {
      const res = await supabase.from('departments').insert({ ...payload, is_active: true }).select('id').single();
      err = res.error;
      id = res.data?.id;
    }

    if (err) { setError(extractErrorMessage(err)); setLoading(false); return; }

    await supabase.from('audit_logs').insert({
      actor_id: profile?.id, actor_email: profile?.email,
      action: isEdit ? 'update' : 'create', entity_type: 'department', entity_id: id,
      description: `${isEdit ? 'Updated' : 'Created'} department "${name.trim()}"`,
    });

    toast.success(`Department ${isEdit ? 'updated' : 'created'}`);
    setLoading(false);
    onSuccess();
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 440 }}>
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>{isEdit ? 'Edit Department' : 'New Department'}</h2>
          <button onClick={onClose} className="btn btn-ghost btn-icon"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && <div className="alert alert-error"><AlertTriangle size={14} /><span>{error}</span></div>}
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#94a3b8', marginBottom: 6 }}>Name <span style={{ color: '#ef4444' }}>*</span></label>
            <input id="dept-name" className="input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Engineering" required />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#94a3b8', marginBottom: 6 }}>Code <span style={{ color: '#ef4444' }}>*</span></label>
            <input id="dept-code" className="input" value={code} onChange={e => setCode(e.target.value)} placeholder="e.g. ENG" maxLength={10} required />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#94a3b8', marginBottom: 6 }}>Description</label>
            <textarea id="dept-description" className="input" rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description" style={{ resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {isEdit ? 'Save Changes' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
