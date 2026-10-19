import React, { useState } from 'react';
import { X, Loader2, AlertCircle, RotateCcw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { Allocation } from '../../types';
import { extractErrorMessage } from '../../lib/utils';
import toast from 'react-hot-toast';

interface Props {
  allocation: Allocation;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ReturnAssetModal({ allocation, onClose, onSuccess }: Props) {
  const { profile } = useAuth();
  const [condition, setCondition] = useState('');
  const [returnNotes, setReturnNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: err } = await supabase.rpc('return_asset', {
      p_allocation_id: allocation.id,
      p_return_notes: returnNotes.trim() || null,
      p_condition: condition || null,
    });

    if (err) {
      setError(extractErrorMessage(err));
      setLoading(false);
      return;
    }

    // Notify the assignee
    await supabase.rpc('create_notification', {
      p_user_id: allocation.assigned_to,
      p_title: 'Asset Returned',
      p_message: `Your allocation of ${allocation.asset?.name ?? 'an asset'} has been marked as returned.`,
      p_type: 'info',
      p_entity_type: 'allocation',
      p_entity_id: allocation.id,
    });

    // Audit log
    await supabase.from('audit_logs').insert({
      actor_id: profile?.id, actor_email: profile?.email,
      action: 'return', entity_type: 'allocation', entity_id: allocation.id,
      description: `Returned asset ${allocation.asset?.name ?? allocation.asset_id} from ${allocation.assignee?.full_name ?? 'user'}`,
    });

    setLoading(false);
    toast.success('Asset returned successfully');
    onSuccess();
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 420 }}>
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>Return Asset</h2>
          <button onClick={onClose} className="btn btn-ghost btn-icon"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {error && <div className="alert alert-error"><AlertCircle size={14} /><span>{error}</span></div>}

          <div className="alert alert-info" style={{ fontSize: 13 }}>
            Returning <strong>{allocation.asset?.name ?? 'asset'}</strong> from <strong>{allocation.assignee?.full_name ?? 'assignee'}</strong>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#94a3b8', marginBottom: 6 }}>Asset Condition After Return</label>
            <select id="return-condition" className="input" value={condition} onChange={e => setCondition(e.target.value)}>
              <option value="">Same as before (no change)</option>
              {['excellent', 'good', 'fair', 'poor', 'damaged'].map(c => (
                <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#94a3b8', marginBottom: 6 }}>Return Notes</label>
            <textarea id="return-notes" className="input" rows={3} value={returnNotes} onChange={e => setReturnNotes(e.target.value)} placeholder="Any observations about the returned asset…" style={{ resize: 'vertical' }} />
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button id="confirm-return-btn" type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
              {loading ? 'Processing…' : 'Confirm Return'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
