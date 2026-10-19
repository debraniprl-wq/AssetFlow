import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Edit, Trash2, Package, MapPin, User, Calendar,
  DollarSign, Tag, Loader2, AlertTriangle, GitBranch, Wrench, Clock,
  X, ExternalLink
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { Asset, Allocation, MaintenanceRequest } from '../../types';
import {
  formatDate, formatDateTime, formatCurrency,
  getAssetStatusBadge, getConditionBadge, getAllocationStatusBadge,
  getMaintenanceStatusBadge, extractErrorMessage, getStatusLabel
} from '../../lib/utils';
import toast from 'react-hot-toast';

export default function AssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [maintenance, setMaintenance] = useState<MaintenanceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedMaint, setSelectedMaint] = useState<MaintenanceRequest | null>(null);

  const canEdit = profile && ['admin', 'asset_manager'].includes(profile.role);
  const canDelete = profile?.role === 'admin';

  const fetchAsset = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [{ data: assetData, error: assetErr }, { data: allocData }, { data: maintData }] = await Promise.all([
        supabase.from('assets').select(`
          *,
          category:asset_categories(id, name),
          department:departments(id, name),
          assignee:profiles!assigned_to(id, full_name, email),
          creator:profiles!created_by(id, full_name, email)
        `).eq('id', id).single(),
        supabase.from('allocations').select(`
          *,
          assignee:profiles!assigned_to(id, full_name, email),
          assigner:profiles!assigned_by(id, full_name, email)
        `).eq('asset_id', id).order('created_at', { ascending: false }).limit(10),
        supabase.from('maintenance_requests').select(`
          *, reporter:profiles!reported_by(id, full_name), assignee:profiles!assigned_to(id, full_name)
        `).eq('asset_id', id).order('created_at', { ascending: false }).limit(10),
      ]);
      if (assetErr) throw assetErr;
      setAsset(assetData as Asset);
      setAllocations((allocData as Allocation[]) ?? []);
      setMaintenance((maintData as MaintenanceRequest[]) ?? []);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!id) { navigate('/assets'); return; }
    fetchAsset();
  }, [id, navigate, fetchAsset]);

  const handleDelete = async () => {
    if (!asset) return;
    const hasActiveAlloc = allocations.some(a => a.status === 'active');
    if (hasActiveAlloc) {
      toast.error('Cannot delete an asset with active allocations. Return the asset first.');
      setShowDeleteConfirm(false);
      return;
    }
    setDeleting(true);
    const { error: err } = await supabase.from('assets').delete().eq('id', asset.id);
    setDeleting(false);
    if (err) { toast.error(extractErrorMessage(err)); return; }
    await supabase.from('audit_logs').insert({
      actor_id: profile?.id, actor_email: profile?.email,
      action: 'delete', entity_type: 'asset', entity_id: asset.id,
      description: `Deleted asset: ${asset.name} (${asset.asset_tag})`,
    });
    toast.success('Asset deleted successfully');
    navigate('/assets');
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
        <Loader2 size={28} className="animate-spin" style={{ color: '#6366f1' }} />
      </div>
    );
  }

  if (error || !asset) {
    return (
      <div style={{ padding: 8 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/assets')} style={{ marginBottom: 16 }}><ArrowLeft size={14} /> Back</button>
        <div className="alert alert-error"><AlertTriangle size={16} /><span>{error ?? 'Asset not found'}</span></div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/assets')}><ArrowLeft size={14} /></button>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 20, fontWeight: 700 }}>{asset.name}</h1>
            <span className={`badge ${getAssetStatusBadge(asset.status)}`}>{getStatusLabel(asset.status)}</span>
            <span className={`badge ${getConditionBadge(asset.condition)}`}>{getStatusLabel(asset.condition)}</span>
          </div>
          <p style={{ color: '#94a3b8', fontSize: 13, fontFamily: 'monospace' }}>{asset.asset_tag}</p>
        </div>
        {canEdit && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button id="edit-asset-btn" className="btn btn-secondary btn-sm" onClick={() => navigate(`/assets/${id}/edit`)}>
              <Edit size={14} /> Edit
            </button>
            {canDelete && (
              <button id="delete-asset-btn" className="btn btn-danger btn-sm" onClick={() => setShowDeleteConfirm(true)}>
                <Trash2 size={14} /> Delete
              </button>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
        {/* Details */}
        <div className="card">
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Asset Details</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              { icon: <Tag size={14} />, label: 'Asset Tag', value: asset.asset_tag },
              { icon: <Package size={14} />, label: 'Category', value: asset.category?.name },
              { icon: <Package size={14} />, label: 'Manufacturer', value: [asset.manufacturer, asset.model].filter(Boolean).join(' ') || null },
              { icon: <Tag size={14} />, label: 'Serial Number', value: asset.serial_number },
              { icon: <MapPin size={14} />, label: 'Location', value: asset.location },
              { icon: <Package size={14} />, label: 'Department', value: asset.department?.name },
              { icon: <DollarSign size={14} />, label: 'Purchase Cost', value: formatCurrency(asset.purchase_cost) },
              { icon: <Calendar size={14} />, label: 'Purchase Date', value: formatDate(asset.purchase_date) },
              { icon: <Calendar size={14} />, label: 'Warranty Expiry', value: formatDate(asset.warranty_expiry) },
              { icon: <Calendar size={14} />, label: 'Bookable Resource', value: asset.is_bookable ? 'Yes (Can be booked)' : 'No' },
              { icon: <User size={14} />, label: 'Assigned To', value: asset.assignee?.full_name || (asset.assigned_to ? 'Unknown' : null) },
            ].map(({ icon, label, value }) => value ? (
              <div key={label} style={{ display: 'flex', gap: 10 }}>
                <span style={{ color: '#64748b', flexShrink: 0, marginTop: 1 }}>{icon}</span>
                <div>
                  <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 14, color: '#f1f5f9' }}>{value}</div>
                </div>
              </div>
            ) : null)}
            {asset.description && (
              <div>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Description</div>
                <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5 }}>{asset.description}</div>
              </div>
            )}
            {asset.notes && (
              <div>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Notes</div>
                <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5 }}>{asset.notes}</div>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Allocation History */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <GitBranch size={15} style={{ color: '#6366f1' }} />
              <h3 style={{ fontSize: 14, fontWeight: 600 }}>Allocation History</h3>
            </div>
            {allocations.length === 0 ? (
              <p style={{ fontSize: 13, color: '#64748b', textAlign: 'center', padding: '12px 0' }}>No allocation history</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {allocations.map(alloc => (
                  <div key={alloc.id} style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{alloc.assignee?.full_name ?? 'Unknown'}</span>
                      <span className={`badge ${getAllocationStatusBadge(alloc.status)}`}>{getStatusLabel(alloc.status)}</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>
                      {formatDate(alloc.allocation_date)} {alloc.actual_return ? `→ ${formatDate(alloc.actual_return)}` : alloc.expected_return ? `(Expected: ${formatDate(alloc.expected_return)})` : '→ ongoing'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Maintenance History */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <Wrench size={15} style={{ color: '#f59e0b' }} />
              <h3 style={{ fontSize: 14, fontWeight: 600 }}>Maintenance History</h3>
            </div>
            {maintenance.length === 0 ? (
              <p style={{ fontSize: 13, color: '#64748b', textAlign: 'center', padding: '12px 0' }}>No maintenance records</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {maintenance.map(m => (
                  <div
                    key={m.id}
                    style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer' }}
                    onClick={() => setSelectedMaint(m)}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'; }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{m.title}</span>
                      <span className={`badge ${getMaintenanceStatusBadge(m.status)}`}>{getStatusLabel(m.status)}</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{formatDate(m.created_at)} · {m.issue_category} · Priority: {m.priority}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer timestamps */}
      <div style={{ marginTop: 16, fontSize: 11, color: '#64748b', display: 'flex', gap: 24 }}>
        <span><Clock size={11} style={{ display: 'inline', marginRight: 4 }} />Created {formatDateTime(asset.created_at)}</span>
        <span>Updated {formatDateTime(asset.updated_at)}</span>
      </div>

      {/* Maintenance Detail Modal */}
      {selectedMaint && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 480, padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 14 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span className={`badge ${getMaintenanceStatusBadge(selectedMaint.status)}`}>
                    {getStatusLabel(selectedMaint.status)}
                  </span>
                  <span style={{ fontSize: 12, color: '#94a3b8', textTransform: 'capitalize' }}>
                    Priority: {selectedMaint.priority}
                  </span>
                </div>
                <h3 style={{ fontSize: 17, fontWeight: 600 }}>{selectedMaint.title}</h3>
              </div>
              <button onClick={() => setSelectedMaint(null)} className="btn btn-ghost btn-icon">
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontSize: 13, marginBottom: 20 }}>
              <div>
                <span style={{ color: '#64748b', fontSize: 12, display: 'block', marginBottom: 2 }}>Issue Category</span>
                <span style={{ fontWeight: 500 }}>{selectedMaint.issue_category}</span>
              </div>

              <div>
                <span style={{ color: '#64748b', fontSize: 12, display: 'block', marginBottom: 2 }}>Description</span>
                <p style={{ color: '#cbd5e1', lineHeight: 1.5, background: 'rgba(255,255,255,0.02)', padding: 10, borderRadius: 6, margin: 0 }}>
                  {selectedMaint.description || 'No description provided.'}
                </p>
              </div>

              {selectedMaint.work_performed && (
                <div>
                  <span style={{ color: '#10b981', fontSize: 12, display: 'block', marginBottom: 2 }}>Work Performed / Notes</span>
                  <p style={{ color: '#cbd5e1', lineHeight: 1.5, background: 'rgba(16,185,129,0.05)', padding: 10, borderRadius: 6, margin: 0 }}>
                    {selectedMaint.work_performed}
                  </p>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <span style={{ color: '#64748b', fontSize: 12, display: 'block' }}>Reported By</span>
                  <span>{selectedMaint.reporter?.full_name || 'Staff Member'}</span>
                </div>
                <div>
                  <span style={{ color: '#64748b', fontSize: 12, display: 'block' }}>Reported Date</span>
                  <span>{formatDate(selectedMaint.created_at)}</span>
                </div>
              </div>

              {selectedMaint.maintenance_cost !== undefined && selectedMaint.maintenance_cost !== null && (
                <div>
                  <span style={{ color: '#64748b', fontSize: 12, display: 'block' }}>Estimated / Incurred Cost</span>
                  <span style={{ fontWeight: 600, color: '#f59e0b' }}>{formatCurrency(selectedMaint.maintenance_cost)}</span>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 14 }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => { setSelectedMaint(null); navigate('/maintenance'); }}
                style={{ gap: 6 }}
              >
                <ExternalLink size={13} /> View All Maintenance
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setSelectedMaint(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 380, padding: 28 }}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                <Trash2 size={22} color="#ef4444" />
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Delete Asset?</h3>
              <p style={{ color: '#94a3b8', fontSize: 13 }}>
                This will permanently delete <strong>{asset.name}</strong> ({asset.asset_tag}) and all associated records. This cannot be undone.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button className="btn btn-secondary" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
              <button id="confirm-delete-btn" className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {deleting ? 'Deleting…' : 'Delete Asset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
