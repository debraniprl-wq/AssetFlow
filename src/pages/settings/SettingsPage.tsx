import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { extractErrorMessage } from '../../lib/utils';
import { Settings, Save, Loader2, AlertTriangle, Check } from 'lucide-react';
import toast from 'react-hot-toast';

interface Setting { key: string; value?: string; description: string; label: string; type: 'text' | 'number' | 'boolean' | 'select'; options?: string[]; }

const SETTINGS_SCHEMA: Setting[] = [
  { key: 'org_name', label: 'Organisation Name', description: 'Displayed in emails and reports', type: 'text' },
  { key: 'asset_tag_prefix', label: 'Asset Tag Prefix', description: 'Prefix for auto-generated asset tags (e.g. AST)', type: 'text' },
  { key: 'overdue_threshold_days', label: 'Overdue Threshold (days)', description: 'Mark allocations as overdue after this many days past expected return', type: 'number' },
  { key: 'booking_requires_approval', label: 'Bookings Require Approval', description: 'If true, all bookings need manager approval before becoming active', type: 'boolean' },
  { key: 'maintenance_requires_approval', label: 'Maintenance Requires Approval', description: 'If true, maintenance requests need approval before work starts', type: 'boolean' },
  { key: 'default_currency', label: 'Default Currency', description: 'Currency used in reports and asset valuation', type: 'select', options: ['USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD'] },
];

export default function SettingsPage() {
  const { profile } = useAuth();
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      const { data } = await supabase.from('system_settings').select('key, value');
      if (data) {
        const map: Record<string, string> = {};
        for (const row of data) map[row.key] = row.value;
        // Apply defaults for missing keys
        const defaults: Record<string, string> = {
          org_name: 'AssetFlow',
          asset_tag_prefix: 'AST',
          overdue_threshold_days: '7',
          booking_requires_approval: 'true',
          maintenance_requires_approval: 'true',
          default_currency: 'USD',
        };
        setValues({ ...defaults, ...map });
      }
      setLoading(false);
    };
    fetchSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      for (const [key, value] of Object.entries(values)) {
        const { error: err } = await supabase.from('system_settings').upsert({
          key, value, updated_by: profile?.id,
        }, { onConflict: 'key' });
        if (err) throw err;
      }

      await supabase.from('audit_logs').insert({
        actor_id: profile?.id, actor_email: profile?.email,
        action: 'update', entity_type: 'system_settings',
        description: 'Updated system settings',
      });

      setSaved(true);
      toast.success('Settings saved');
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
      <Loader2 size={28} className="animate-spin" style={{ color: '#6366f1' }} />
    </div>
  );

  return (
    <div className="animate-fade-in" style={{ maxWidth: 640 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{ width: 40, height: 40, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Settings size={18} color="white" />
        </div>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>System Settings</h1>
          <p style={{ color: '#94a3b8', fontSize: 13 }}>Configure global application behaviour</p>
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 20 }}><AlertTriangle size={16} /><span>{error}</span></div>}

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {SETTINGS_SCHEMA.map(setting => (
          <div key={setting.key} className="card" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: 1 }}>
                <label htmlFor={`setting-${setting.key}`} style={{ display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
                  {setting.label}
                </label>
                <p style={{ fontSize: 12, color: '#64748b' }}>{setting.description}</p>
              </div>
              <div style={{ minWidth: 200 }}>
                {setting.type === 'boolean' ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      type="button"
                      id={`setting-${setting.key}`}
                      onClick={() => setValues(v => ({ ...v, [setting.key]: v[setting.key] === 'true' ? 'false' : 'true' }))}
                      style={{
                        width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                        background: values[setting.key] === 'true' ? '#6366f1' : 'rgba(255,255,255,0.1)',
                        position: 'relative', transition: 'background 0.2s',
                      }}
                    >
                      <span style={{
                        position: 'absolute', top: 3, left: values[setting.key] === 'true' ? 22 : 2,
                        width: 18, height: 18, borderRadius: '50%', background: 'white',
                        transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                      }} />
                    </button>
                    <span style={{ fontSize: 13, color: values[setting.key] === 'true' ? '#10b981' : '#64748b' }}>
                      {values[setting.key] === 'true' ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                ) : setting.type === 'select' ? (
                  <select
                    id={`setting-${setting.key}`}
                    className="input"
                    value={values[setting.key] ?? ''}
                    onChange={e => setValues(v => ({ ...v, [setting.key]: e.target.value }))}
                  >
                    {setting.options!.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input
                    id={`setting-${setting.key}`}
                    className="input"
                    type={setting.type === 'number' ? 'number' : 'text'}
                    value={values[setting.key] ?? ''}
                    onChange={e => setValues(v => ({ ...v, [setting.key]: e.target.value }))}
                    min={setting.type === 'number' ? 1 : undefined}
                  />
                )}
              </div>
            </div>
          </div>
        ))}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="submit" className="btn btn-primary" disabled={saving} style={{ minWidth: 140 }}>
            {saving ? (
              <><Loader2 size={14} className="animate-spin" /> Saving…</>
            ) : saved ? (
              <><Check size={14} /> Saved!</>
            ) : (
              <><Save size={14} /> Save Settings</>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
