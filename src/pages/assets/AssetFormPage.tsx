import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { AssetCategory, Department } from '../../types';
import { generateAssetTag, extractErrorMessage } from '../../lib/utils';
import toast from 'react-hot-toast';

interface AssetForm {
  asset_tag: string;
  name: string;
  category_id: string;
  description: string;
  serial_number: string;
  manufacturer: string;
  model: string;
  purchase_date: string;
  purchase_cost: string;
  warranty_expiry: string;
  department_id: string;
  location: string;
  status: string;
  condition: string;
  is_bookable: boolean;
  notes: string;
}

const INITIAL_FORM: AssetForm = {
  asset_tag: '', name: '', category_id: '', description: '', serial_number: '',
  manufacturer: '', model: '', purchase_date: '', purchase_cost: '',
  warranty_expiry: '', department_id: '', location: '', status: 'available',
  condition: 'good', is_bookable: false, notes: '',
};

export default function AssetFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState<AssetForm>({ ...INITIAL_FORM, asset_tag: generateAssetTag() });
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(isEdit);
  const [errors, setErrors] = useState<Partial<Record<keyof AssetForm, string>>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      supabase.from('asset_categories').select('*').order('name'),
      supabase.from('departments').select('*').eq('is_active', true).order('name'),
    ]).then(([{ data: cats }, { data: depts }]) => {
      if (cats) setCategories(cats as AssetCategory[]);
      if (depts) setDepartments(depts as Department[]);
    });

    if (isEdit && id) {
      setFetching(true);
      supabase.from('assets').select('*').eq('id', id).single().then(({ data, error: err }) => {
        setFetching(false);
        if (err || !data) { setError('Asset not found'); return; }
        setForm({
          asset_tag: data.asset_tag ?? '',
          name: data.name ?? '',
          category_id: data.category_id ?? '',
          description: data.description ?? '',
          serial_number: data.serial_number ?? '',
          manufacturer: data.manufacturer ?? '',
          model: data.model ?? '',
          purchase_date: data.purchase_date ?? '',
          purchase_cost: data.purchase_cost?.toString() ?? '',
          warranty_expiry: data.warranty_expiry ?? '',
          department_id: data.department_id ?? '',
          location: data.location ?? '',
          status: data.status ?? 'available',
          condition: data.condition ?? 'good',
          is_bookable: data.is_bookable ?? false,
          notes: data.notes ?? '',
        });
      });
    }
  }, [id, isEdit]);

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof AssetForm, string>> = {};
    if (!form.asset_tag.trim()) newErrors.asset_tag = 'Asset tag is required';
    if (!form.name.trim()) newErrors.name = 'Asset name is required';
    if (form.purchase_cost && isNaN(Number(form.purchase_cost))) newErrors.purchase_cost = 'Must be a valid number';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    setError(null);

    const payload = {
      asset_tag: form.asset_tag.trim().toUpperCase(),
      name: form.name.trim(),
      category_id: form.category_id || null,
      description: form.description.trim() || null,
      serial_number: form.serial_number.trim() || null,
      manufacturer: form.manufacturer.trim() || null,
      model: form.model.trim() || null,
      purchase_date: form.purchase_date || null,
      purchase_cost: form.purchase_cost ? Number(form.purchase_cost) : null,
      warranty_expiry: form.warranty_expiry || null,
      department_id: form.department_id || null,
      location: form.location.trim() || null,
      status: form.status,
      condition: form.condition,
      is_bookable: form.is_bookable,
      notes: form.notes.trim() || null,
    };

    let assetId = id;
    if (isEdit) {
      const { error: err } = await supabase.from('assets').update(payload).eq('id', id!);
      if (err) { setError(extractErrorMessage(err)); setLoading(false); return; }
    } else {
      const { data, error: err } = await supabase.from('assets').insert({ ...payload, created_by: profile?.id }).select().single();
      if (err) { setError(extractErrorMessage(err)); setLoading(false); return; }
      assetId = data.id;
    }

    // Audit log
    await supabase.from('audit_logs').insert({
      actor_id: profile?.id, actor_email: profile?.email,
      action: isEdit ? 'update' : 'create',
      entity_type: 'asset', entity_id: assetId,
      description: `${isEdit ? 'Updated' : 'Created'} asset: ${form.name} (${form.asset_tag.toUpperCase()})`,
    });

    toast.success(`Asset ${isEdit ? 'updated' : 'created'} successfully`);
    navigate(`/assets/${assetId}`);
  };

  if (fetching) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Loader2 size={28} className="animate-spin" style={{ color: '#6366f1' }} /></div>;
  }

  return (
    <div className="animate-fade-in" style={{ maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(isEdit ? `/assets/${id}` : '/assets')}><ArrowLeft size={14} /></button>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>{isEdit ? 'Edit Asset' : 'Register New Asset'}</h1>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: 20 }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>Basic Information</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            <FormField label="Asset Tag" error={errors.asset_tag} required>
              <div style={{ display: 'flex', gap: 8 }}>
                <input id="asset-tag" className="input" value={form.asset_tag} onChange={e => setForm(f => ({ ...f, asset_tag: e.target.value }))} placeholder="AST-000000" style={{ flex: 1 }} />
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setForm(f => ({ ...f, asset_tag: generateAssetTag() }))} title="Generate tag">↺</button>
              </div>
            </FormField>
            <FormField label="Asset Name" error={errors.name} required>
              <input id="asset-name" className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Dell Laptop XPS 15" />
            </FormField>
            <FormField label="Category" error={errors.category_id}>
              <select id="asset-category" className="input" value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}>
                <option value="">Select category…</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </FormField>
            <FormField label="Department" error={errors.department_id}>
              <select id="asset-department" className="input" value={form.department_id} onChange={e => setForm(f => ({ ...f, department_id: e.target.value }))}>
                <option value="">Select department…</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </FormField>
          </div>
          <div style={{ marginTop: 16 }}>
            <FormField label="Description" error={errors.description}>
              <textarea id="asset-description" className="input" rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional description…" style={{ resize: 'vertical' }} />
            </FormField>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>Hardware Details</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            <FormField label="Manufacturer" error={errors.manufacturer}>
              <input id="asset-manufacturer" className="input" value={form.manufacturer} onChange={e => setForm(f => ({ ...f, manufacturer: e.target.value }))} placeholder="e.g. Dell" />
            </FormField>
            <FormField label="Model" error={errors.model}>
              <input id="asset-model" className="input" value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} placeholder="e.g. XPS 15 9500" />
            </FormField>
            <FormField label="Serial Number" error={errors.serial_number}>
              <input id="asset-serial" className="input" value={form.serial_number} onChange={e => setForm(f => ({ ...f, serial_number: e.target.value }))} placeholder="SN/ID" />
            </FormField>
            <FormField label="Location" error={errors.location}>
              <input id="asset-location" className="input" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="e.g. Room 201, Floor 3" />
            </FormField>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>Financial & Dates</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            <FormField label="Purchase Date" error={errors.purchase_date}>
              <input id="asset-purchase-date" type="date" className="input" value={form.purchase_date} onChange={e => setForm(f => ({ ...f, purchase_date: e.target.value }))} />
            </FormField>
            <FormField label="Purchase Cost (USD)" error={errors.purchase_cost}>
              <input id="asset-cost" type="number" className="input" value={form.purchase_cost} onChange={e => setForm(f => ({ ...f, purchase_cost: e.target.value }))} placeholder="0.00" min="0" step="0.01" />
            </FormField>
            <FormField label="Warranty Expiry" error={errors.warranty_expiry}>
              <input id="asset-warranty" type="date" className="input" value={form.warranty_expiry} onChange={e => setForm(f => ({ ...f, warranty_expiry: e.target.value }))} />
            </FormField>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>Status & Condition</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
            <FormField label="Status" error={errors.status}>
              <select id="asset-status" className="input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                {['available', 'allocated', 'maintenance', 'retired', 'lost'].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
            </FormField>
            <FormField label="Condition" error={errors.condition}>
              <select id="asset-condition" className="input" value={form.condition} onChange={e => setForm(f => ({ ...f, condition: e.target.value }))}>
                {['excellent', 'good', 'fair', 'poor', 'damaged'].map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </FormField>
            <FormField label="Bookable Resource" error={errors.is_bookable}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <input id="asset-bookable" type="checkbox" checked={form.is_bookable} onChange={e => setForm(f => ({ ...f, is_bookable: e.target.checked }))} style={{ accentColor: '#6366f1', width: 16, height: 16 }} />
                <label htmlFor="asset-bookable" style={{ fontSize: 13, color: '#94a3b8', cursor: 'pointer' }}>Allow booking</label>
              </div>
            </FormField>
          </div>
          <div style={{ marginTop: 16 }}>
            <FormField label="Notes" error={errors.notes}>
              <textarea id="asset-notes" className="input" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Internal notes…" style={{ resize: 'vertical' }} />
            </FormField>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={() => navigate(isEdit ? `/assets/${id}` : '/assets')}>Cancel</button>
          <button id="save-asset-btn" type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {loading ? 'Saving…' : isEdit ? 'Save Changes' : 'Register Asset'}
          </button>
        </div>
      </form>
    </div>
  );
}

function FormField({ label, error, required, children }: { label: string; error?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#94a3b8', marginBottom: 6 }}>
        {label} {required && <span style={{ color: '#ef4444' }}>*</span>}
      </label>
      {children}
      {error && <p style={{ color: '#ef4444', fontSize: 12, marginTop: 4 }}>{error}</p>}
    </div>
  );
}
