import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Warehouse, AlertTriangle, BarChart2, Search, Plus, RefreshCw,
  Edit3, Check, X, Loader, Package, MapPin, Boxes,
  CheckCircle, XCircle, Trash2, Clock, TrendingDown,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { inventoryApi, warehouseApi, skuApi } from '../lib/api';
import { format, parseISO } from 'date-fns';
import ExportMenu from '../components/ExportMenu';

// ── Constants ─────────────────────────────────────────────────────────────────
const AGING_COLORS = {
  '0–30 days':  '#22c55e',
  '31–60 days': '#f59e0b',
  '61–90 days': '#f97316',
  '90+ days':   '#ef4444',
};

const AGING_BG = {
  '0–30 days':  'rgba(34,197,94,0.1)',
  '31–60 days': 'rgba(245,158,11,0.1)',
  '61–90 days': 'rgba(249,115,22,0.1)',
  '90+ days':   'rgba(239,68,68,0.1)',
};

const BAR_COLORS = ['#6366f1','#22c55e','#f59e0b','#38bdf8','#ec4899','#a78bfa'];

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n) {
  return new Intl.NumberFormat('en-IN').format(n ?? 0);
}

function agingColor(bucket) { return AGING_COLORS[bucket] || '#64748b'; }

// ── Inline-edit cell ──────────────────────────────────────────────────────────
function EditableQty({ row, onSave }) {
  const [editing, setEditing] = useState(false);
  const [val,     setVal]     = useState(String(row.quantity));
  const [saving,  setSaving]  = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  async function commit() {
    const n = parseInt(val, 10);
    if (isNaN(n) || n === row.quantity) { setEditing(false); return; }
    setSaving(true);
    try {
      await inventoryApi.update(row.id, { quantity: n });
      onSave(row.id, n);
    } catch { setVal(String(row.quantity)); }
    finally   { setSaving(false); setEditing(false); }
  }

  function handleKey(e) {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') { setVal(String(row.quantity)); setEditing(false); }
  }

  if (editing) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <input
        ref={inputRef}
        type="number" min="0" value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={handleKey}
        onBlur={commit}
        style={{
          width: 72, padding: '4px 8px', fontSize: '0.85rem',
          background: 'var(--color-surface-3)',
          border: '1px solid var(--color-accent)',
          borderRadius: 6, color: 'var(--color-text)',
          outline: 'none',
        }}
      />
      {saving && <Loader size={12} className="animate-spin" style={{ color: 'var(--color-accent)' }} />}
    </div>
  );

  return (
    <div
      onClick={() => setEditing(true)}
      title="Click to edit"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        cursor: 'pointer',
        padding: '4px 8px',
        borderRadius: 6,
        fontWeight: 600,
        fontSize: '0.9rem',
        color: row.is_low_stock ? 'var(--color-danger)' : 'var(--color-text)',
        background: row.is_low_stock ? 'rgba(239,68,68,0.08)' : 'transparent',
        transition: 'background 0.1s',
      }}
    >
      {fmt(row.quantity)}
      <Edit3 size={11} color="var(--color-muted)" />
    </div>
  );
}

// ── Threshold inline edit ─────────────────────────────────────────────────────
function ThresholdEdit({ row, onSave }) {
  const [editing, setEditing] = useState(false);
  const [val,     setVal]     = useState(String(row.skus?.low_stock_threshold ?? 10));
  const [saving,  setSaving]  = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  async function commit() {
    const n = parseInt(val, 10);
    setSaving(true);
    try {
      await inventoryApi.setThreshold(row.sku_id, n);
      onSave(row.sku_id, n);
    } catch { setVal(String(row.skus?.low_stock_threshold ?? 10)); }
    finally   { setSaving(false); setEditing(false); }
  }

  function handleKey(e) {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') setEditing(false);
  }

  if (editing) return (
    <input
      ref={inputRef} type="number" min="0" value={val}
      onChange={e => setVal(e.target.value)}
      onKeyDown={handleKey}
      onBlur={commit}
      style={{
        width: 56, padding: '3px 6px', fontSize: '0.8rem',
        background: 'var(--color-surface-3)',
        border: '1px solid var(--color-accent)',
        borderRadius: 6, color: 'var(--color-text)', outline: 'none',
      }}
    />
  );

  return (
    <span
      onClick={() => setEditing(true)}
      title="Click to set alert threshold"
      style={{ cursor: 'pointer', fontSize: '0.82rem', color: 'var(--color-muted)', textDecoration: 'underline dotted' }}
    >
      {row.skus?.low_stock_threshold ?? 10}
    </span>
  );
}

// ── Add Inventory Row Modal ───────────────────────────────────────────────────
function AddStockModal({ warehouses, onClose, onAdded }) {
  const [skuCode,    setSkuCode]    = useState('');
  const [warehouseId,setWarehouseId]= useState(warehouses[0]?.id || '');
  const [qty,        setQty]        = useState('');
  const [restocked,  setRestocked]  = useState(new Date().toISOString().split('T')[0]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      // Resolve sku_id from code (authenticated via the api client)
      const skus = await skuApi.list({ search: skuCode });
      const sku  = skus.find(s => s.sku_code.toLowerCase() === skuCode.trim().toLowerCase());
      if (!sku) throw new Error(`SKU "${skuCode}" not found. Import it first.`);

      const row = await inventoryApi.create({
        sku_id: sku.id,
        warehouse_id: warehouseId,
        quantity: parseInt(qty),
        last_restocked_at: restocked,
      });
      onAdded();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <h2 style={{ fontSize: '1rem' }}>Add Stock Entry</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={15} /></button>
        </div>

        {error && <div style={{ fontSize: '0.82rem', color: 'var(--color-danger)', marginBottom: 12, padding: '8px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: 8 }}>{error}</div>}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label className="form-label">SKU Code *</label>
            <input id="input-add-stock-sku" className="form-input" placeholder="e.g. SKU001"
              value={skuCode} onChange={e => setSkuCode(e.target.value)} required style={{ textTransform: 'uppercase' }} />
          </div>
          <div className="form-group">
            <label className="form-label">Warehouse *</label>
            <select id="input-add-stock-warehouse" className="form-input" value={warehouseId} onChange={e => setWarehouseId(e.target.value)} required>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name} — {w.city}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Quantity *</label>
              <input id="input-add-stock-qty" type="number" className="form-input" placeholder="0" min="0"
                value={qty} onChange={e => setQty(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">Restocked on</label>
              <input type="date" className="form-input" value={restocked} onChange={e => setRestocked(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" id="btn-save-stock" className="btn btn-primary" disabled={loading} style={{ minWidth: 110, justifyContent: 'center' }}>
              {loading ? <Loader size={14} className="animate-spin" /> : <Plus size={14} />}
              {loading ? 'Saving…' : 'Add Stock'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Warehouse Modal ───────────────────────────────────────────────────────────
function WarehouseModal({ initial, onClose, onSaved }) {
  const editing = !!initial?.id;
  const [form, setForm] = useState({ name: initial?.name || '', city: initial?.city || '', address: initial?.address || '' });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (editing) await warehouseApi.update(initial.id, form);
      else         await warehouseApi.create(form);
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 400 }}>
        <div className="modal-header">
          <h2 style={{ fontSize: '1rem' }}>{editing ? 'Edit Warehouse' : 'New Warehouse'}</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={15} /></button>
        </div>
        {error && <div style={{ fontSize: '0.82rem', color: 'var(--color-danger)', marginBottom: 12, padding: '8px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: 8 }}>{error}</div>}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label className="form-label">Warehouse Name *</label>
            <input id="input-wh-name" className="form-input" placeholder="e.g. Delhi Main WH" value={form.name} onChange={e => setField('name', e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="form-label">City *</label>
            <input id="input-wh-city" className="form-input" placeholder="e.g. New Delhi" value={form.city} onChange={e => setField('city', e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="form-label">Address</label>
            <input className="form-input" placeholder="Full address (optional)" value={form.address} onChange={e => setField('address', e.target.value)} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" id="btn-save-warehouse" className="btn btn-primary" disabled={loading} style={{ minWidth: 100, justifyContent: 'center' }}>
              {loading ? <Loader size={14} className="animate-spin" /> : <Check size={14} />}
              {loading ? 'Saving…' : editing ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Custom Pie tooltip ────────────────────────────────────────────────────────
function AgingTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { name, units, count } = payload[0].payload;
  return (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '10px 14px', fontSize: '0.8rem' }}>
      <div style={{ fontWeight: 700, marginBottom: 4, color: agingColor(name) }}>{name}</div>
      <div style={{ color: 'var(--color-subtle)' }}>{fmt(units)} units in {count} entries</div>
    </div>
  );
}

// ── Bar tooltip ───────────────────────────────────────────────────────────────
function BarTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '10px 14px', fontSize: '0.8rem' }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
      <div style={{ color: 'var(--color-accent-light)' }}>{fmt(payload[0]?.value)} units</div>
      {payload[1] && <div style={{ color: 'var(--color-muted)' }}>{payload[1]?.value} SKUs</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════════════════════════════
export default function Inventory() {
  const [tab,         setTab]         = useState('stock');
  const [inventory,   setInventory]   = useState([]);
  const [warehouses,  setWarehouses]  = useState([]);
  const [agingData,   setAgingData]   = useState([]);
  const [summaryData, setSummaryData] = useState([]);
  const [alertCount,  setAlertCount]  = useState(0);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');

  // Filters
  const [search,      setSearch]      = useState('');
  const [whFilter,    setWhFilter]    = useState('');
  const [lowOnly,     setLowOnly]     = useState(false);

  // Modals
  const [showAddStock, setShowAddStock] = useState(false);
  const [warehouseModal, setWarehouseModal] = useState(null); // null | {} | {id,...}

  const debounceRef = useRef(null);

  // ── Load data ──────────────────────────────────────────────────────────────
  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(loadInventory, 280);
    return () => clearTimeout(debounceRef.current);
  }, [search, whFilter, lowOnly]);

  async function loadAll() {
    await Promise.all([loadInventory(), loadWarehouses(), loadAging(), loadSummary(), loadAlerts()]);
  }

  async function loadInventory() {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (search)    params.search         = search;
      if (whFilter)  params.warehouse_id   = whFilter;
      if (lowOnly)   params.low_stock_only = 'true';
      setInventory(await inventoryApi.list(params));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadWarehouses() {
    try { setWarehouses(await warehouseApi.list()); } catch { /* silent */ }
  }

  async function loadAging() {
    try { setAgingData(await inventoryApi.aging()); } catch { /* silent */ }
  }

  async function loadSummary() {
    try { setSummaryData(await inventoryApi.summary()); } catch { /* silent */ }
  }

  async function loadAlerts() {
    try {
      const { count } = await inventoryApi.alerts();
      setAlertCount(count);
    } catch { /* silent */ }
  }

  // Optimistic updates
  function handleQtySave(id, qty) {
    setInventory(prev => prev.map(r => r.id === id
      ? { ...r, quantity: qty, is_low_stock: qty < (r.skus?.low_stock_threshold ?? 10) }
      : r
    ));
    loadAlerts();
    loadSummary();
  }

  function handleThresholdSave(skuId, thr) {
    setInventory(prev => prev.map(r => r.sku_id === skuId
      ? { ...r, skus: { ...r.skus, low_stock_threshold: thr }, is_low_stock: r.quantity < thr }
      : r
    ));
    loadAlerts();
  }

  // Stats
  const totalUnits    = inventory.reduce((a, r) => a + (r.quantity || 0), 0);
  const uniqueSkus    = new Set(inventory.map(r => r.sku_id)).size;
  const lowStockRows  = inventory.filter(r => r.is_low_stock);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1>Inventory</h1>
          <p>Stock levels across {warehouses.length} warehouse{warehouses.length !== 1 ? 's' : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <ExportMenu 
            data={inventory.map(row => ({
              sku_code: row.skus?.sku_code || '',
              sku_name: row.skus?.name || '',
              warehouse: row.warehouses?.name || '',
              quantity: row.quantity,
              last_restocked: row.last_restocked_at ? format(parseISO(row.last_restocked_at), 'yyyy-MM-dd') : ''
            }))} 
            filename="inventory_report" 
          />
          <button id="btn-add-wh" className="btn btn-secondary btn-sm" onClick={() => setWarehouseModal({})}>
            <Plus size={14} /> Add Warehouse
          </button>
          <button id="btn-add-stock" className="btn btn-primary btn-sm" onClick={() => setShowAddStock(true)}>
            <Plus size={14} /> Add Stock
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid-stats" style={{ marginBottom: 24 }}>
        {[
          { label: 'Total Units',      value: fmt(totalUnits), icon: Boxes,        color: '#6366f1', bg: 'rgba(99,102,241,0.12)'  },
          { label: 'SKUs Tracked',     value: uniqueSkus,      icon: Package,      color: '#38bdf8', bg: 'rgba(56,189,248,0.12)'  },
          { label: 'Warehouses',       value: warehouses.length,icon: Warehouse,   color: '#f59e0b', bg: 'rgba(245,158,11,0.12)'  },
          { label: 'Low Stock Alerts', value: alertCount,      icon: AlertTriangle,color: alertCount > 0 ? '#ef4444' : '#22c55e',
            bg: alertCount > 0 ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="stat-card" style={{ cursor: label === 'Low Stock Alerts' ? 'pointer' : 'default' }}
            onClick={() => label === 'Low Stock Alerts' && setTab('alerts')}>
            <div className="stat-card-icon" style={{ background: bg }}>
              <Icon size={20} color={color} />
            </div>
            <div className="stat-card-value" style={{ color: label === 'Low Stock Alerts' && alertCount > 0 ? '#ef4444' : undefined }}>
              {value}
            </div>
            <div className="stat-card-label">{label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', marginBottom: 20, gap: 0 }}>
        {[
          { id: 'stock',      label: 'Stock View'  },
          { id: 'warehouses', label: 'Warehouses'  },
          { id: 'alerts',     label: `Low Stock Alerts${alertCount > 0 ? ` (${alertCount})` : ''}` },
        ].map(t => (
          <button key={t.id} id={`tab-inv-${t.id}`}
            onClick={() => setTab(t.id)}
            style={{
              padding: '10px 20px', background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '0.875rem', fontWeight: 600,
              color: tab === t.id ? 'var(--color-accent-light)' : 'var(--color-muted)',
              borderBottom: `2px solid ${tab === t.id ? 'var(--color-accent)' : 'transparent'}`,
              marginBottom: -1, transition: 'all 0.15s',
              ...(t.id === 'alerts' && alertCount > 0 ? { color: tab === t.id ? '#ef4444' : '#f97316' } : {}),
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: '0.85rem', color: 'var(--color-danger)', display: 'flex', gap: 8, alignItems: 'center' }}>
          <XCircle size={14} /> {error} — ensure the backend is running and phase3_migration.sql has been applied.
        </div>
      )}

      {/* ════════════════════════════════════════════════════════ */}
      {/* TAB: STOCK VIEW                                         */}
      {/* ════════════════════════════════════════════════════════ */}
      {tab === 'stock' && (
        <div className="animate-fade-in">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'start' }}>
            {/* Left: table */}
            <div>
              {/* Filters */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: '1 1 180px' }}>
                  <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)', pointerEvents: 'none' }} />
                  <input id="search-inventory" className="form-input" placeholder="Search SKU code or name…"
                    value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 32 }} />
                </div>
                <select id="filter-warehouse" className="form-input" value={whFilter} onChange={e => setWhFilter(e.target.value)} style={{ flex: '0 0 160px' }}>
                  <option value="">All Warehouses</option>
                  {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
                <button
                  id="btn-toggle-low-stock"
                  className={`btn btn-sm ${lowOnly ? 'btn-danger' : 'btn-secondary'}`}
                  onClick={() => setLowOnly(v => !v)}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  <AlertTriangle size={13} /> {lowOnly ? 'All Stock' : 'Low Stock Only'}
                </button>
                <button className="btn btn-ghost btn-icon" onClick={loadInventory} title="Refresh">
                  <RefreshCw size={14} />
                </button>
              </div>

              {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><div className="loader" /></div>
              ) : inventory.length === 0 ? (
                <div className="card empty-state">
                  <div className="empty-state-icon"><Package size={26} /></div>
                  <h3>{search || whFilter || lowOnly ? 'No results match your filters' : 'No stock entries yet'}</h3>
                  <p>{!search && !whFilter && !lowOnly ? 'Click "Add Stock" or use Data Import to add inventory.' : 'Try clearing the search or filters.'}</p>
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>SKU Code</th>
                        <th>Product</th>
                        <th>Warehouse</th>
                        <th style={{ textAlign: 'right' }}>Qty</th>
                        <th style={{ textAlign: 'right' }}>Alert Threshold</th>
                        <th>Status</th>
                        <th>Aging</th>
                        <th>Last Restocked</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inventory.map(row => (
                        <tr key={row.id} style={{ background: row.is_low_stock ? 'rgba(239,68,68,0.025)' : undefined }}>
                          <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--color-accent-light)' }}>
                            {row.skus?.sku_code ?? '—'}
                          </td>
                          <td style={{ maxWidth: 180 }}>
                            <div className="truncate" style={{ fontSize: '0.85rem', fontWeight: 500 }}>{row.skus?.name ?? '—'}</div>
                            {row.skus?.brands?.name && <div style={{ fontSize: '0.72rem', color: 'var(--color-muted)' }}>{row.skus.brands.name}</div>}
                          </td>
                          <td style={{ fontSize: '0.82rem' }}>
                            <div>{row.warehouses?.name ?? '—'}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--color-muted)' }}>{row.warehouses?.city}</div>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <EditableQty row={row} onSave={handleQtySave} />
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <ThresholdEdit row={row} onSave={handleThresholdSave} />
                          </td>
                          <td>
                            {row.is_low_stock
                              ? <span className="badge badge-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                  <TrendingDown size={10} /> Low
                                </span>
                              : <span className="badge badge-success">OK</span>
                            }
                          </td>
                          <td>
                            <span style={{
                              fontSize: '0.75rem', fontWeight: 600, padding: '2px 8px', borderRadius: 99,
                              background: AGING_BG[row.aging_bucket] || 'var(--color-surface-3)',
                              color: agingColor(row.aging_bucket),
                            }}>
                              {row.aging_bucket}
                            </span>
                          </td>
                          <td style={{ fontSize: '0.78rem', color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>
                            {row.last_restocked_at
                              ? format(parseISO(row.last_restocked_at), 'dd MMM yyyy')
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Right: Stock Aging Pie Chart */}
            <div>
              <div className="card" style={{ padding: 20 }}>
                <h3 style={{ fontSize: '0.9rem', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Clock size={15} color="var(--color-accent-light)" />
                  Stock Aging
                </h3>
                <p style={{ fontSize: '0.72rem', color: 'var(--color-muted)', marginBottom: 16 }}>
                  Units by days since last restock
                </p>

                {agingData.length === 0 || agingData.every(d => d.units === 0) ? (
                  <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--color-muted)', fontSize: '0.82rem' }}>
                    No inventory data yet
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie
                        data={agingData}
                        cx="50%" cy="50%"
                        innerRadius={55} outerRadius={90}
                        paddingAngle={3}
                        dataKey="units"
                      >
                        {agingData.map((entry, i) => (
                          <Cell key={i} fill={AGING_COLORS[entry.name] || '#6366f1'} stroke="none" />
                        ))}
                      </Pie>
                      <Tooltip content={<AgingTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                )}

                {/* Legend */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                  {agingData.map(d => (
                    <div key={d.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 10, height: 10, borderRadius: 2, background: AGING_COLORS[d.name], flexShrink: 0 }} />
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-subtle)' }}>{d.name}</span>
                      </div>
                      <span style={{ fontSize: '0.78rem', fontWeight: 600, color: AGING_COLORS[d.name] }}>
                        {fmt(d.units)} units
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════ */}
      {/* TAB: WAREHOUSES                                         */}
      {/* ════════════════════════════════════════════════════════ */}
      {tab === 'warehouses' && (
        <div className="animate-fade-in">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
            {/* Warehouse list */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <h3 style={{ fontSize: '0.95rem' }}>All Warehouses</h3>
                <button id="btn-add-warehouse-tab" className="btn btn-primary btn-sm" onClick={() => setWarehouseModal({})}>
                  <Plus size={13} /> New
                </button>
              </div>

              {warehouses.length === 0 ? (
                <div className="card empty-state" style={{ padding: 32 }}>
                  <div className="empty-state-icon" style={{ width: 48, height: 48 }}><Warehouse size={22} /></div>
                  <h3 style={{ fontSize: '0.9rem' }}>No warehouses yet</h3>
                  <p>Add a warehouse to start tracking stock.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {warehouses.map((wh, idx) => {
                    const summary = summaryData.find(s => s.id === wh.id);
                    return (
                      <div key={wh.id} className="card" style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <div style={{ width: 28, height: 28, borderRadius: 6, background: `${BAR_COLORS[idx % BAR_COLORS.length]}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Warehouse size={14} color={BAR_COLORS[idx % BAR_COLORS.length]} />
                              </div>
                              <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{wh.name}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', color: 'var(--color-muted)' }}>
                              <MapPin size={11} /> {wh.city}
                              {wh.address && <span>· {wh.address}</span>}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            {summary && (
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontWeight: 700, fontSize: '1rem', color: BAR_COLORS[idx % BAR_COLORS.length] }}>{fmt(summary.total_units)}</div>
                                <div style={{ fontSize: '0.68rem', color: 'var(--color-muted)' }}>{summary.sku_count} SKUs</div>
                              </div>
                            )}
                            <button className="btn btn-ghost btn-icon" onClick={() => setWarehouseModal(wh)} title="Edit">
                              <Edit3 size={13} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Bar chart */}
            <div className="card" style={{ padding: 20 }}>
              <h3 style={{ fontSize: '0.9rem', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <BarChart2 size={15} color="var(--color-accent-light)" /> Stock Distribution
              </h3>
              <p style={{ fontSize: '0.72rem', color: 'var(--color-muted)', marginBottom: 20 }}>Units per warehouse</p>

              {summaryData.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--color-muted)', fontSize: '0.82rem' }}>
                  No inventory data yet
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={summaryData} margin={{ left: 0, right: 10, top: 4, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: 'var(--color-muted)', fontSize: 11 }} axisLine={false} tickLine={false} angle={-20} textAnchor="end" />
                    <YAxis tick={{ fill: 'var(--color-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<BarTooltip />} cursor={{ fill: 'rgba(99,102,241,0.06)' }} />
                    <Bar dataKey="total_units" name="Units" radius={[6,6,0,0]}>
                      {summaryData.map((_, i) => (
                        <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════ */}
      {/* TAB: ALERTS                                             */}
      {/* ════════════════════════════════════════════════════════ */}
      {tab === 'alerts' && (
        <div className="animate-fade-in">
          {lowStockRows.length === 0 && !loading ? (
            <div className="card empty-state">
              <div className="empty-state-icon" style={{ background: 'rgba(34,197,94,0.1)' }}>
                <CheckCircle size={28} color="var(--color-success)" />
              </div>
              <h3>All stock levels are healthy!</h3>
              <p>No SKUs are below their alert thresholds. You can adjust thresholds in the Stock View tab.</p>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <AlertTriangle size={16} color="var(--color-danger)" />
                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{alertCount} items below alert threshold</span>
                <span style={{ fontSize: '0.78rem', color: 'var(--color-muted)' }}>— click threshold to adjust</span>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>Product</th>
                      <th>Warehouse</th>
                      <th style={{ textAlign: 'right' }}>Current Stock</th>
                      <th style={{ textAlign: 'right' }}>Alert Threshold</th>
                      <th style={{ textAlign: 'right' }}>Deficit</th>
                      <th>Last Restocked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventory
                      .filter(r => r.is_low_stock)
                      .sort((a, b) => a.quantity - b.quantity)
                      .map(row => {
                        const thr     = row.skus?.low_stock_threshold ?? 10;
                        const deficit = thr - row.quantity;
                        return (
                          <tr key={row.id}>
                            <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--color-accent-light)' }}>{row.skus?.sku_code}</td>
                            <td style={{ maxWidth: 180 }}>
                              <div className="truncate" style={{ fontWeight: 500, fontSize: '0.85rem' }}>{row.skus?.name}</div>
                            </td>
                            <td style={{ fontSize: '0.82rem' }}>{row.warehouses?.name}<span style={{ color: 'var(--color-muted)', fontSize: '0.72rem' }}>, {row.warehouses?.city}</span></td>
                            <td style={{ textAlign: 'right' }}>
                              <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--color-danger)' }}>{fmt(row.quantity)}</span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <ThresholdEdit row={row} onSave={handleThresholdSave} />
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <span className="badge badge-danger">Need {fmt(deficit)} more</span>
                            </td>
                            <td style={{ fontSize: '0.78rem', color: 'var(--color-muted)' }}>
                              {row.last_restocked_at ? format(parseISO(row.last_restocked_at), 'dd MMM yyyy') : '—'}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      {showAddStock && warehouses.length > 0 && createPortal(
        <AddStockModal warehouses={warehouses} onClose={() => setShowAddStock(false)} onAdded={() => { loadInventory(); loadSummary(); loadAging(); loadAlerts(); }} />,
        document.body
      )}

      {showAddStock && warehouses.length === 0 && createPortal(
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 360, textAlign: 'center' }}>
            <Warehouse size={40} color="var(--color-muted)" style={{ marginBottom: 12 }} />
            <h2 style={{ fontSize: '1rem', marginBottom: 8 }}>No warehouses yet</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-muted)', marginBottom: 16 }}>
              Create a warehouse before adding stock.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button className="btn btn-secondary" onClick={() => setShowAddStock(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => { setShowAddStock(false); setWarehouseModal({}); }}>
                <Plus size={14} /> Create Warehouse
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {warehouseModal !== null && createPortal(
        <WarehouseModal
          initial={warehouseModal?.id ? warehouseModal : null}
          onClose={() => setWarehouseModal(null)}
          onSaved={() => { loadWarehouses(); loadSummary(); }}
        />,
        document.body
      )}
    </div>
  );
}
