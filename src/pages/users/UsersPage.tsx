import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { extractErrorMessage, getRoleLabel, getRoleBadge, formatDate } from '../../lib/utils';
import { Users, Search, Edit2, Loader2, AlertTriangle, X, Save, ChevronLeft, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import type { Profile, Department, UserRole } from '../../types';

const PAGE_SIZE = 20;

export default function UsersPage() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [showModal, setShowModal] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    let q = supabase
      .from('profiles')
      .select('*, department:departments(name)', { count: 'exact' })
      .order('full_name')
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

    if (search) q = q.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,employee_id.ilike.%${search}%`);
    if (roleFilter) q = q.eq('role', roleFilter);

    const { data, count, error: err } = await q;
    if (err) { setError(extractErrorMessage(err)); } else { setUsers((data ?? []) as Profile[]); setTotal(count ?? 0); }
    setLoading(false);
  }, [page, search, roleFilter]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Users</h1>
          <p style={{ color: '#94a3b8', fontSize: 13 }}>{total} registered users</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: 16, marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
          <input
            id="users-search"
            className="input"
            placeholder="Search name, email, or employee ID…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            style={{ paddingLeft: 32 }}
          />
        </div>
        <select id="users-role-filter" className="input" value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setPage(1); }} style={{ width: 'auto', minWidth: 160 }}>
          <option value="">All Roles</option>
          {(['admin', 'asset_manager', 'department_head', 'employee'] as UserRole[]).map(r => (
            <option key={r} value={r}>{getRoleLabel(r)}</option>
          ))}
        </select>
      </div>

      {error && <div className="alert alert-error"><AlertTriangle size={16} /><span>{error}</span></div>}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <Loader2 size={28} className="animate-spin" style={{ color: '#6366f1' }} />
        </div>
      ) : users.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center' }}>
          <Users size={36} style={{ color: '#64748b', margin: '0 auto 12px' }} />
          <p style={{ color: '#64748b' }}>No users found</p>
        </div>
      ) : (
        <>
          <div className="card" style={{ overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  {['User', 'Role', 'Department', 'Employee ID', 'Status', 'Joined', ''].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u, i) => (
                  <tr key={u.id} style={{ borderBottom: i < users.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'white', flexShrink: 0 }}>
                          {u.full_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 500, fontSize: 14 }}>{u.full_name}</div>
                          <div style={{ fontSize: 12, color: '#64748b' }}>{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span className={`badge ${getRoleBadge(u.role)}`}>{getRoleLabel(u.role)}</span>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#94a3b8' }}>
                      {(u.department as { name?: string } | undefined)?.name ?? '—'}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#94a3b8', fontFamily: 'monospace' }}>
                      {u.employee_id ?? '—'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span className={`badge ${u.is_active ? 'badge-success' : 'badge-gray'}`}>{u.is_active ? 'Active' : 'Inactive'}</span>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>
                      {formatDate(u.created_at)}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <button
                        id={`edit-user-${u.id}`}
                        className="btn btn-ghost btn-sm"
                        onClick={() => { setEditing(u); setShowModal(true); }}
                      >
                        <Edit2 size={13} />
                      </button>
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

      {showModal && editing && (
        <EditUserModal
          user={editing}
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); fetchUsers(); }}
        />
      )}
    </div>
  );
}

function EditUserModal({ user, onClose, onSuccess }: { user: Profile; onClose: () => void; onSuccess: () => void }) {
  const { profile: currentUser } = useAuth();
  const [role, setRole] = useState<UserRole>(user.role);
  const [deptId, setDeptId] = useState(user.department_id ?? '');
  const [employeeId, setEmployeeId] = useState(user.employee_id ?? '');
  const [phone, setPhone] = useState(user.phone ?? '');
  const [isActive, setIsActive] = useState(user.is_active);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('departments').select('id, name').eq('is_active', true).order('name').then(({ data }) => {
      if (data) setDepartments(data as Department[]);
    });
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: err } = await supabase.from('profiles').update({
      role,
      department_id: deptId || null,
      employee_id: employeeId.trim() || null,
      phone: phone.trim() || null,
      is_active: isActive,
    }).eq('id', user.id);

    if (err) { setError(extractErrorMessage(err)); setLoading(false); return; }

    await supabase.from('audit_logs').insert({
      actor_id: currentUser?.id, actor_email: currentUser?.email,
      action: 'update', entity_type: 'user', entity_id: user.id,
      description: `Updated user "${user.full_name}" — role: ${role}, active: ${isActive}`,
    });

    toast.success('User updated successfully');
    setLoading(false);
    onSuccess();
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 460 }}>
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600 }}>Edit User</h2>
            <p style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{user.full_name} · {user.email}</p>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-icon"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && <div className="alert alert-error"><AlertTriangle size={14} /><span>{error}</span></div>}
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#94a3b8', marginBottom: 6 }}>Role</label>
            <select id="edit-user-role" className="input" value={role} onChange={e => setRole(e.target.value as UserRole)}>
              {(['admin', 'asset_manager', 'department_head', 'employee'] as UserRole[]).map(r => (
                <option key={r} value={r}>{getRoleLabel(r)}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#94a3b8', marginBottom: 6 }}>Department</label>
            <select id="edit-user-dept" className="input" value={deptId} onChange={e => setDeptId(e.target.value)}>
              <option value="">No department</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#94a3b8', marginBottom: 6 }}>Employee ID</label>
              <input className="input" value={employeeId} onChange={e => setEmployeeId(e.target.value)} placeholder="EMP-001" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#94a3b8', marginBottom: 6 }}>Phone</label>
              <input className="input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 555 0000" />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0' }}>
            <input
              id="edit-user-active"
              type="checkbox"
              checked={isActive}
              onChange={e => setIsActive(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: '#6366f1', cursor: 'pointer' }}
            />
            <label htmlFor="edit-user-active" style={{ fontSize: 14, cursor: 'pointer' }}>Account is active</label>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
