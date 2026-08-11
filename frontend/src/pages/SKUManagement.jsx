import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus, Search, Filter, Package, ChevronRight, X, Check,
  Trash2, Edit3, Clock, Image, Tag, DollarSign, BarChart2,
  AlertCircle, Loader, CheckCircle, Circle, PlusCircle,
  ExternalLink, Archive, RefreshCw, Upload,
} from 'lucide-react';
import { api, skuApi, platformApi, brandApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { format } from 'date-fns';
import ExportMenu from '../components/ExportMenu';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);
}

function pct(num, den) {
  if (!den) return 0;
  return Math.round((num / den) * 100);
}

// ── Completion Ring ────────────────────────────────────────────────────────────
function CompletionRing({ value, size = 36 }) {
  const r  = (size - 4) / 2;
  const cx = size / 2;
  const circumference = 2 * Math.PI * r;
  const dash = (value / 100) * circumference;
  const color = value === 100 ? '#22c55e' : value > 50 ? '#f59e0b' : '#6366f1';

  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--color-surface-3)" strokeWidth={3} />
      <circle
        cx={cx} cy={cx} r={r} fill="none"
        stroke={color} strokeWidth={3}
        strokeDasharray={`${dash} ${circumference}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.4s ease' }}
      />
    </svg>
  );
}

// ── Platform badge ─────────────────────────────────────────────────────────────
const PLATFORM_COLORS = {
  amazon: '#f59e0b', flipkart: '#6366f1', meesho: '#ec4899',
  myntra: '#ef4444', 'own website': '#22c55e',
};

function PlatformBadge({ name }) {
  const key = name.toLowerCase();
  const color = PLATFORM_COLORS[key] || '#64748b';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: `${color}18`, color, border: `1px solid ${color}30`,
      borderRadius: 99, padding: '2px 8px', fontSize: '0.7rem', fontWeight: 600,
    }}>
      {name}
    </span>
  );
}

// ── Add SKU Modal ──────────────────────────────────────────────────────────────
function AddSKUModal({ platforms, brands, onClose, onCreated }) {
  const { user } = useAuth();
  const [form, setForm] = useState({
    sku_code: '', name: '', brand_name: '', category: '',
    cost_price: '', mrp: '',
  });
  const [mappings, setMappings] = useState(
    platforms.map(p => ({ platform_id: p.id, name: p.name, enabled: false, listing_id: '', price: '' }))
  );
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })); }

  function handleImagePick(e) {
    const file = e.target.files[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.sku_code.trim() || !form.name.trim()) {
      setError('SKU Code and Name are required.');
      return;
    }
    setLoading(true);
    try {
      // 1. Upload image if selected — ask the backend for a signed upload URL
      //    (authenticated via the api client), then PUT the file to storage.
      let image_url = '';
      if (imageFile) {
        try {
          const { signedUrl, path } = await api.post('/api/skus/image-upload-url', {
            sku_code: form.sku_code.trim().toUpperCase(),
            file_name: imageFile.name,
          });
          await fetch(signedUrl, { method: 'PUT', body: imageFile, headers: { 'Content-Type': imageFile.type } });
          image_url = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/sku-images/${path}`;
        } catch { /* image upload failure is non-fatal */ }
      }

      // 2. Create SKU
      const platform_mappings = mappings
        .filter(m => m.enabled)
        .map(m => ({ platform_id: m.platform_id, platform_listing_id: m.listing_id, current_price: m.price }));

      const sku = await skuApi.create({
        ...form,
        cost_price: parseFloat(form.cost_price) || 0,
        mrp: parseFloat(form.mrp) || 0,
        image_url: image_url || undefined,
        platform_mappings,
      });

      onCreated(sku);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 580 }}>
        <div className="modal-header">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Package size={18} color="var(--color-accent-light)" /> New SKU
          </h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={16} /></button>
        </div>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: '0.85rem', color: 'var(--color-danger)', display: 'flex', gap: 8 }}>
            <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} /> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {/* Row 1: Code + Name */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, marginBottom: 14 }}>
            <div className="form-group">
              <label className="form-label">SKU Code *</label>
              <input id="input-sku-code" className="form-input" placeholder="e.g. SKU001" value={form.sku_code}
                onChange={e => setField('sku_code', e.target.value)} required style={{ textTransform: 'uppercase' }} />
            </div>
            <div className="form-group">
              <label className="form-label">Product Name *</label>
              <input id="input-sku-name" className="form-input" placeholder="e.g. Blue T-Shirt L" value={form.name}
                onChange={e => setField('name', e.target.value)} required />
            </div>
          </div>

          {/* Row 2: Brand + Category */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div className="form-group">
              <label className="form-label">Brand</label>
              <input id="input-sku-brand" className="form-input" placeholder="Type brand name" value={form.brand_name}
                list="brand-list" onChange={e => setField('brand_name', e.target.value)} />
              <datalist id="brand-list">
                {brands.map(b => <option key={b.id} value={b.name} />)}
              </datalist>
            </div>
            <div className="form-group">
              <label className="form-label">Category</label>
              <input id="input-sku-category" className="form-input" placeholder="e.g. Apparel" value={form.category}
                onChange={e => setField('category', e.target.value)} />
            </div>
          </div>

          {/* Row 3: Cost Price + MRP */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div className="form-group">
              <label className="form-label">Cost Price (₹)</label>
              <input id="input-cost-price" type="number" className="form-input" placeholder="0.00" value={form.cost_price}
                onChange={e => setField('cost_price', e.target.value)} min="0" step="0.01" />
            </div>
            <div className="form-group">
              <label className="form-label">MRP (₹)</label>
              <input id="input-mrp" type="number" className="form-input" placeholder="0.00" value={form.mrp}
                onChange={e => setField('mrp', e.target.value)} min="0" step="0.01" />
            </div>
          </div>

          {/* Image upload */}
          <div className="form-group" style={{ marginBottom: 16 }}>
            <label className="form-label">Product Image (optional)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {imagePreview
                ? <img src={imagePreview} alt="preview" style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover', border: '1px solid var(--color-border)' }} />
                : <div style={{ width: 56, height: 56, borderRadius: 8, background: 'var(--color-surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed var(--color-border)' }}>
                    <Image size={20} color="var(--color-muted)" />
                  </div>
              }
              <button type="button" id="btn-pick-image" className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>
                <Upload size={14} /> {imageFile ? 'Change Image' : 'Upload Image'}
              </button>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImagePick} />
            </div>
          </div>

          {/* Platform mappings */}
          <div style={{ marginBottom: 20 }}>
            <div className="form-label" style={{ marginBottom: 10 }}>Platform Listing IDs (optional)</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {mappings.map((m, i) => (
                <div key={m.platform_id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input type="checkbox" id={`platform-${m.platform_id}`}
                    checked={m.enabled}
                    onChange={e => setMappings(ms => ms.map((x, j) => j === i ? { ...x, enabled: e.target.checked } : x))}
                    style={{ accentColor: 'var(--color-accent)', width: 14, height: 14, flexShrink: 0, cursor: 'pointer' }}
                  />
                  <label htmlFor={`platform-${m.platform_id}`} style={{ fontSize: '0.82rem', color: 'var(--color-subtle)', width: 90, cursor: 'pointer' }}>
                    {m.name}
                  </label>
                  {m.enabled && (
                    <>
                      <input
                        className="form-input" placeholder="Listing ID" value={m.listing_id}
                        onChange={e => setMappings(ms => ms.map((x, j) => j === i ? { ...x, listing_id: e.target.value } : x))}
                        style={{ flex: 1, padding: '7px 10px', fontSize: '0.8rem' }}
                      />
                      <input
                        type="number" className="form-input" placeholder="Price ₹" value={m.price}
                        onChange={e => setMappings(ms => ms.map((x, j) => j === i ? { ...x, price: e.target.value } : x))}
                        style={{ width: 90, padding: '7px 10px', fontSize: '0.8rem' }}
                      />
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" id="btn-cancel-sku" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" id="btn-save-sku" className="btn btn-primary" disabled={loading} style={{ minWidth: 130, justifyContent: 'center' }}>
              {loading ? <><Loader size={14} className="animate-spin" /> Saving…</> : <><Plus size={14} /> Add SKU</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Checklist Tab ──────────────────────────────────────────────────────────────
function ChecklistTab({ skuId }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newItem, setNewItem] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => { load(); }, [skuId]);

  async function load() {
    setLoading(true);
    try { setItems(await skuApi.checklist(skuId)); }
    catch { /* silent */ }
    finally { setLoading(false); }
  }

  async function toggle(item) {
    const updated = { ...item, is_complete: !item.is_complete };
    setItems(prev => prev.map(x => x.id === item.id ? updated : x));
    try { await skuApi.toggleCheckItem(skuId, item.id, updated.is_complete); }
    catch { setItems(prev => prev.map(x => x.id === item.id ? item : x)); }
  }

  async function addItem() {
    if (!newItem.trim()) return;
    setAdding(true);
    try {
      const created = await skuApi.addCheckItem(skuId, newItem.trim());
      setItems(prev => [...prev, created]);
      setNewItem('');
    } catch { /* silent */ }
    finally { setAdding(false); }
  }

  async function deleteItem(item) {
    setItems(prev => prev.filter(x => x.id !== item.id));
    try { await skuApi.deleteCheckItem(skuId, item.id); }
    catch { setItems(prev => [...prev, item]); }
  }

  const done  = items.filter(x => x.is_complete).length;
  const total = items.length;
  const prog  = pct(done, total);

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><div className="loader" /></div>;

  return (
    <div>
      {/* Progress bar */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <CompletionRing value={prog} size={40} />
          <div>
            <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{prog}% Complete</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>{done} of {total} items done</div>
          </div>
        </div>
        <div style={{ height: 6, background: 'var(--color-surface-3)', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 99, transition: 'width 0.4s ease',
            width: `${prog}%`,
            background: prog === 100 ? 'var(--color-success)' : prog > 50 ? 'var(--color-warning)' : 'var(--color-accent)',
          }} />
        </div>
      </div>

      {/* Items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
        {items.map(item => (
          <div key={item.id} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 12px',
            background: item.is_complete ? 'rgba(34,197,94,0.04)' : 'var(--color-surface-2)',
            border: `1px solid ${item.is_complete ? 'rgba(34,197,94,0.15)' : 'var(--color-border)'}`,
            borderRadius: 8,
            transition: 'all 0.15s',
          }}>
            <button
              onClick={() => toggle(item)}
              style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', color: item.is_complete ? 'var(--color-success)' : 'var(--color-muted)' }}
            >
              {item.is_complete ? <CheckCircle size={18} /> : <Circle size={18} />}
            </button>
            <span style={{
              flex: 1, fontSize: '0.875rem',
              textDecoration: item.is_complete ? 'line-through' : 'none',
              color: item.is_complete ? 'var(--color-muted)' : 'var(--color-text)',
              transition: 'all 0.15s',
            }}>
              {item.checklist_item}
            </span>
            <button
              onClick={() => deleteItem(item)}
              className="btn btn-ghost btn-icon"
              style={{ padding: 4, opacity: 0.4, color: 'var(--color-danger)' }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>

      {/* Add custom item */}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          id="input-new-checklist"
          className="form-input"
          placeholder="Add custom checklist item…"
          value={newItem}
          onChange={e => setNewItem(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addItem()}
          style={{ flex: 1 }}
        />
        <button id="btn-add-checklist" className="btn btn-primary btn-sm" onClick={addItem} disabled={adding || !newItem.trim()}>
          {adding ? <Loader size={13} className="animate-spin" /> : <PlusCircle size={14} />}
        </button>
      </div>
    </div>
  );
}

// ── History Tab ────────────────────────────────────────────────────────────────
function HistoryTab({ skuId }) {
  const [logs, setLogs]     = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    skuApi.history(skuId)
      .then(setLogs)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [skuId]);

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><div className="loader" /></div>;

  if (!logs.length) return (
    <div className="empty-state" style={{ padding: 40 }}>
      <div className="empty-state-icon"><Clock size={22} /></div>
      <h3 style={{ fontSize: '0.95rem' }}>No changes recorded yet</h3>
      <p>Edits to this SKU's title or images will appear here.</p>
    </div>
  );

  const FIELD_ICONS = { name: Tag, image_url: Image };
  const FIELD_LABELS = { name: 'Title', image_url: 'Image URL' };

  return (
    <div style={{ position: 'relative', paddingLeft: 20 }}>
      {/* Timeline line */}
      <div style={{ position: 'absolute', left: 7, top: 0, bottom: 0, width: 2, background: 'var(--color-border)' }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {logs.map((log, idx) => {
          const Icon = FIELD_ICONS[log.field_changed] || Edit3;
          const label = FIELD_LABELS[log.field_changed] || log.field_changed;
          const isImage = log.field_changed === 'image_url';

          return (
            <div key={log.id} style={{ position: 'relative', paddingLeft: 20, paddingBottom: 20 }}>
              {/* Dot */}
              <div style={{
                position: 'absolute', left: -13, top: 4,
                width: 14, height: 14,
                background: idx === 0 ? 'var(--color-accent)' : 'var(--color-surface-3)',
                border: `2px solid ${idx === 0 ? 'var(--color-accent)' : 'var(--color-border)'}`,
                borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon size={7} color={idx === 0 ? '#fff' : 'var(--color-muted)'} />
              </div>

              <div style={{
                background: 'var(--color-surface-2)',
                border: '1px solid var(--color-border)',
                borderRadius: 10, padding: '12px 14px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-accent-light)' }}>
                    {label} changed
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--color-muted)' }}>
                    {format(new Date(log.changed_at), 'dd MMM yyyy, hh:mm a')}
                  </span>
                </div>

                {isImage ? (
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    {log.old_value && <div style={{ fontSize: '0.72rem', color: 'var(--color-muted)' }}>From: <span style={{ fontFamily: 'monospace', fontSize: '0.7rem' }}>{log.old_value.slice(0, 40)}…</span></div>}
                    {log.new_value && <div style={{ fontSize: '0.72rem', color: 'var(--color-subtle)' }}>To: <span style={{ fontFamily: 'monospace', fontSize: '0.7rem' }}>{log.new_value.slice(0, 40)}…</span></div>}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {log.old_value && (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--color-muted)', minWidth: 28 }}>Was:</span>
                        <span style={{ fontSize: '0.82rem', color: 'var(--color-muted)', textDecoration: 'line-through', fontStyle: 'italic' }}>{log.old_value}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--color-muted)', minWidth: 28 }}>Now:</span>
                      <span style={{ fontSize: '0.82rem', fontWeight: 500 }}>{log.new_value}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Detail Drawer ──────────────────────────────────────────────────────────────
function SKUDrawer({ sku, platforms, onClose, onUpdated }) {
  const { user } = useAuth();
  const [tab, setTab]         = useState('details');
  const [editing, setEditing] = useState(false);
  const [form, setForm]       = useState({ name: sku.name, category: sku.category || '', cost_price: sku.cost_price, mrp: sku.mrp });
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  useEffect(() => {
    setForm({ name: sku.name, category: sku.category || '', cost_price: sku.cost_price, mrp: sku.mrp });
    setEditing(false);
    setTab('details');
  }, [sku.id]);

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function saveDetails() {
    setSaving(true);
    setError('');
    try {
      const updated = await skuApi.update(sku.id, {
        name: form.name,
        category: form.category,
        cost_price: parseFloat(form.cost_price),
        mrp: parseFloat(form.mrp),
        changed_by: user?.id,
      });
      onUpdated({ ...sku, ...updated });
      setEditing(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const completedMappings = (sku.platform_sku_mapping || []).filter(m => m.platform_listing_id);
  const margin = sku.mrp > 0 ? pct(sku.mrp - sku.cost_price, sku.mrp) : 0;

  return (
    <div style={{
      position: 'fixed', right: 0, top: 0, bottom: 0, width: 440,
      background: 'var(--color-surface)',
      borderLeft: '1px solid var(--color-border)',
      display: 'flex', flexDirection: 'column',
      zIndex: 500,
      animation: 'slideInRight 0.2s ease',
    }}>
      {/* Drawer header */}
      <div style={{ padding: '20px 20px 0', borderBottom: '1px solid var(--color-border)', paddingBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--color-muted)', fontFamily: 'monospace', marginBottom: 2 }}>{sku.sku_code}</div>
            {editing
              ? <input className="form-input" value={form.name} onChange={e => setField('name', e.target.value)}
                  style={{ fontSize: '1rem', fontWeight: 600, padding: '6px 10px' }} />
              : <h2 style={{ fontSize: '1.05rem', lineHeight: 1.3, marginRight: 8 }}>{sku.name}</h2>
            }
            <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              {sku.brands?.name && <span className="badge badge-accent">{sku.brands.name}</span>}
              {sku.category && <span className="badge badge-muted">{sku.category}</span>}
              {sku.is_active ? <span className="badge badge-success">Active</span> : <span className="badge badge-danger">Archived</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4, marginLeft: 8, flexShrink: 0 }}>
            {editing
              ? <>
                  <button className="btn btn-ghost btn-icon" onClick={() => { setEditing(false); setError(''); }} title="Cancel"><X size={15} /></button>
                  <button id="btn-save-details" className="btn btn-primary btn-sm" onClick={saveDetails} disabled={saving}>
                    {saving ? <Loader size={13} className="animate-spin" /> : <Check size={13} />} Save
                  </button>
                </>
              : <button id="btn-edit-sku" className="btn btn-ghost btn-icon" onClick={() => setEditing(true)} title="Edit"><Edit3 size={15} /></button>
            }
            <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={16} /></button>
          </div>
        </div>

        {error && <div style={{ fontSize: '0.78rem', color: 'var(--color-danger)', marginTop: 6 }}>{error}</div>}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: 'none', marginTop: 12 }}>
          {[
            { id: 'details',   label: 'Details'   },
            { id: 'checklist', label: 'Checklist' },
            { id: 'history',   label: 'Change Log' },
          ].map(t => (
            <button key={t.id} id={`tab-sku-${t.id}`}
              onClick={() => setTab(t.id)}
              style={{
                padding: '8px 14px',
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: '0.82rem', fontWeight: 600,
                color: tab === t.id ? 'var(--color-accent-light)' : 'var(--color-muted)',
                borderBottom: `2px solid ${tab === t.id ? 'var(--color-accent)' : 'transparent'}`,
                transition: 'all 0.15s',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Drawer body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        {/* ── Details Tab ── */}
        {tab === 'details' && (
          <div className="animate-fade-in">
            {/* SKU image */}
            {sku.image_url && (
              <img src={sku.image_url} alt={sku.name}
                style={{ width: '100%', height: 180, objectFit: 'contain', borderRadius: 10, background: 'var(--color-surface-2)', marginBottom: 16, border: '1px solid var(--color-border)' }}
              />
            )}

            {/* Pricing */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
              {[
                { label: 'Cost Price', value: editing
                    ? <input type="number" className="form-input" value={form.cost_price} onChange={e => setField('cost_price', e.target.value)} style={{ padding: '6px 8px', fontSize: '0.9rem' }} />
                    : fmt(sku.cost_price), icon: DollarSign, color: '#6366f1' },
                { label: 'MRP', value: editing
                    ? <input type="number" className="form-input" value={form.mrp} onChange={e => setField('mrp', e.target.value)} style={{ padding: '6px 8px', fontSize: '0.9rem' }} />
                    : fmt(sku.mrp), icon: Tag, color: '#22c55e' },
                { label: 'Margin', value: `${margin}%`, icon: BarChart2, color: margin > 40 ? '#22c55e' : margin > 20 ? '#f59e0b' : '#ef4444' },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
                    <Icon size={12} color={color} />
                    <span style={{ fontSize: '0.68rem', color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{label}</span>
                  </div>
                  <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: '1rem', color }}>
                    {value}
                  </div>
                </div>
              ))}
            </div>

            {/* Category edit */}
            {editing && (
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label className="form-label">Category</label>
                <input className="form-input" value={form.category} onChange={e => setField('category', e.target.value)} />
              </div>
            )}

            {/* Platform listings */}
            <div style={{ marginBottom: 4 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                Platform Listings
              </div>
              {platforms.map(p => {
                const mapping = (sku.platform_sku_mapping || []).find(m => m.platform_id === p.id);
                return (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
                    <PlatformBadge name={p.name} />
                    {mapping?.platform_listing_id
                      ? <div style={{ display: 'flex', align: 'center', gap: 8 }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--color-subtle)', fontFamily: 'monospace' }}>{mapping.platform_listing_id}</span>
                          {mapping.current_price && <span style={{ fontSize: '0.75rem', color: 'var(--color-success)', fontWeight: 600 }}>{fmt(mapping.current_price)}</span>}
                        </div>
                      : <span style={{ fontSize: '0.72rem', color: 'var(--color-muted)', fontStyle: 'italic' }}>Not mapped</span>
                    }
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Checklist Tab ── */}
        {tab === 'checklist' && <ChecklistTab skuId={sku.id} />}

        {/* ── History Tab ── */}
        {tab === 'history' && <HistoryTab skuId={sku.id} />}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function SKUManagement() {
  const [skus,        setSkus]        = useState([]);
  const [platforms,   setPlatforms]   = useState([]);
  const [brands,      setBrands]      = useState([]);
  const [categories,  setCategories]  = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');

  // Filters
  const [search,      setSearch]      = useState('');
  const [filterBrand, setFilterBrand] = useState('');
  const [filterCat,   setFilterCat]   = useState('');
  const [filterActive, setFilterActive] = useState('true');

  // UI state
  const [showAdd,     setShowAdd]     = useState(false);
  const [selected,    setSelected]    = useState(null);

  const debouncedSearch  = useRef(null);

  // Load platforms and brands once
  useEffect(() => {
    Promise.all([platformApi.list(), brandApi.list()])
      .then(([ps, bs]) => { setPlatforms(ps); setBrands(bs); })
      .catch(() => {});
    loadMeta();
  }, []);

  async function loadMeta() {
    try {
      const { categories: cats } = await skuApi.meta();
      setCategories(cats);
    } catch { /* silent */ }
  }

  useEffect(() => {
    clearTimeout(debouncedSearch.current);
    debouncedSearch.current = setTimeout(loadSkus, 300);
    return () => clearTimeout(debouncedSearch.current);
  }, [search, filterBrand, filterCat, filterActive]);

  async function loadSkus() {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (search)       params.search    = search;
      if (filterBrand)  params.brand_id  = filterBrand;
      if (filterCat)    params.category  = filterCat;
      if (filterActive) params.is_active = filterActive;
      setSkus(await skuApi.list(params));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleCreated(sku) {
    setSkus(prev => [sku, ...prev]);
    loadMeta();
  }

  function handleUpdated(updated) {
    setSkus(prev => prev.map(s => s.id === updated.id ? updated : s));
    setSelected(updated);
  }

  const activeCount  = skus.filter(s => s.is_active).length;
  const platformCount = platforms.length;

  return (
    <div className="animate-fade-in">
      {/* Page header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1>SKU Management</h1>
          <p>{activeCount} active SKUs across {platformCount} platforms</p>
        </div>

        <div className="flex items-center gap-3">
          <ExportMenu 
            data={skus.map(s => ({
              sku_code: s.sku_code,
              name: s.name,
              category: s.category || '',
              brand: s.brands?.name || '',
              cost_price: s.cost_price,
              mrp: s.mrp,
              is_active: s.is_active ? 'Active' : 'Archived'
            }))} 
            filename="skus_catalog" 
          />
          <button id="btn-new-sku" className="btn btn-primary" onClick={() => setShowAdd(true)}>
            <Plus size={15} /> New SKU
          </button>
        </div>
      </div>

      {/* Filters bar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 200 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)', pointerEvents: 'none' }} />
          <input
            id="search-skus"
            className="form-input"
            placeholder="Search SKU code or name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 36 }}
          />
        </div>

        {/* Brand filter */}
        <select
          id="filter-brand"
          className="form-input"
          value={filterBrand}
          onChange={e => setFilterBrand(e.target.value)}
          style={{ flex: '0 0 160px', cursor: 'pointer' }}
        >
          <option value="">All Brands</option>
          {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>

        {/* Category filter */}
        <select
          id="filter-category"
          className="form-input"
          value={filterCat}
          onChange={e => setFilterCat(e.target.value)}
          style={{ flex: '0 0 160px', cursor: 'pointer' }}
        >
          <option value="">All Categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        {/* Active filter */}
        <select
          id="filter-active"
          className="form-input"
          value={filterActive}
          onChange={e => setFilterActive(e.target.value)}
          style={{ flex: '0 0 120px', cursor: 'pointer' }}
        >
          <option value="true">Active</option>
          <option value="false">Archived</option>
          <option value="">All</option>
        </select>

        <button id="btn-refresh-skus" className="btn btn-ghost btn-icon" onClick={loadSkus} title="Refresh" data-tooltip="Refresh">
          <RefreshCw size={15} />
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: '0.85rem', color: 'var(--color-danger)', display: 'flex', gap: 8 }}>
          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          {error} — make sure the backend is running on port 4000.
        </div>
      )}

      {/* SKU Table */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}><div className="loader" /></div>
      ) : skus.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-state-icon"><Package size={28} /></div>
          <h3>{search || filterBrand || filterCat ? 'No SKUs match your filters' : 'No SKUs yet'}</h3>
          <p>{search || filterBrand || filterCat ? 'Try clearing the search or filters.' : 'Click "New SKU" to add your first product, or use Data Import to bulk upload.'}</p>
          {!search && !filterBrand && !filterCat && (
            <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)} style={{ marginTop: 8 }}>
              <Plus size={14} /> Add First SKU
            </button>
          )}
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 48 }}></th>
                <th>SKU Code</th>
                <th>Product Name</th>
                <th>Brand</th>
                <th>Category</th>
                <th style={{ textAlign: 'right' }}>Cost</th>
                <th style={{ textAlign: 'right' }}>MRP</th>
                <th style={{ textAlign: 'right' }}>Margin</th>
                <th>Platforms</th>
                <th>Checklist</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {skus.map(sku => {
                const mappedPlatforms = (sku.platform_sku_mapping || []).filter(m => m.platform_listing_id);
                const margin = sku.mrp > 0 ? pct(sku.mrp - sku.cost_price, sku.mrp) : 0;
                const isSelected = selected?.id === sku.id;

                return (
                  <tr
                    key={sku.id}
                    onClick={() => setSelected(isSelected ? null : sku)}
                    style={{ cursor: 'pointer', background: isSelected ? 'rgba(99,102,241,0.06)' : undefined }}
                  >
                    <td>
                      {sku.image_url
                        ? <img src={sku.image_url} alt="" style={{ width: 34, height: 34, objectFit: 'cover', borderRadius: 6, display: 'block' }} />
                        : <div style={{ width: 34, height: 34, borderRadius: 6, background: 'var(--color-surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Package size={14} color="var(--color-muted)" />
                          </div>
                      }
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--color-accent-light)' }}>{sku.sku_code}</td>
                    <td style={{ maxWidth: 200 }}>
                      <div className="truncate" style={{ fontWeight: 500 }}>{sku.name}</div>
                    </td>
                    <td style={{ fontSize: '0.8rem' }}>{sku.brands?.name ?? <span style={{ color: 'var(--color-muted)' }}>—</span>}</td>
                    <td style={{ fontSize: '0.8rem' }}>{sku.category ?? <span style={{ color: 'var(--color-muted)' }}>—</span>}</td>
                    <td style={{ textAlign: 'right', fontSize: '0.85rem' }}>{fmt(sku.cost_price)}</td>
                    <td style={{ textAlign: 'right', fontSize: '0.85rem', fontWeight: 600 }}>{fmt(sku.mrp)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: margin > 40 ? 'var(--color-success)' : margin > 20 ? 'var(--color-warning)' : 'var(--color-danger)' }}>
                        {margin}%
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {mappedPlatforms.length > 0
                          ? mappedPlatforms.slice(0, 2).map(m => <PlatformBadge key={m.id} name={m.platforms?.name ?? 'Platform'} />)
                          : <span style={{ fontSize: '0.72rem', color: 'var(--color-muted)', fontStyle: 'italic' }}>None</span>
                        }
                        {mappedPlatforms.length > 2 && <span className="badge badge-muted">+{mappedPlatforms.length - 2}</span>}
                      </div>
                    </td>
                    <td>
                      {/* Completion ring - requires checklist data; shows placeholder */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <CompletionRing value={0} size={28} />
                        <span style={{ fontSize: '0.72rem', color: 'var(--color-muted)' }}>View</span>
                      </div>
                    </td>
                    <td>
                      <ChevronRight size={14} color="var(--color-muted)" style={{ transform: isSelected ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add SKU Modal — portalled to body so it never affects page scroll */}
      {showAdd && createPortal(
        <AddSKUModal
          platforms={platforms}
          brands={brands}
          onClose={() => setShowAdd(false)}
          onCreated={handleCreated}
        />,
        document.body
      )}

      {/* SKU Detail Drawer — portalled to body so the fixed overlay never
          touches the .page-content scroll container, preventing scroll-to-top */}
      {selected && createPortal(
        <>
          <div
            onClick={() => setSelected(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 499, backdropFilter: 'blur(2px)', animation: 'fadeIn 0.15s ease' }}
          />
          <SKUDrawer
            sku={selected}
            platforms={platforms}
            onClose={() => setSelected(null)}
            onUpdated={handleUpdated}
          />
        </>,
        document.body
      )}
    </div>
  );
}
