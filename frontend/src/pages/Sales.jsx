import { useState, useEffect, useRef } from 'react';
import {
  Target, Plus, TrendingUp, TrendingDown, X, Check,
  Loader, Trash2, Edit3, CalendarDays, BarChart2,
  Users, MapPin, Package, RefreshCw, AlertCircle,
  ChevronDown, Minus,
} from 'lucide-react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
  Cell,
} from 'recharts';
import { salesApi, targetApi, skuApi } from '../lib/api';
import { format, parseISO } from 'date-fns';
import ExportMenu from '../components/ExportMenu';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtINR(n) {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(1)}Cr`;
  if (n >= 1_00_000)    return `₹${(n / 1_00_000).toFixed(1)}L`;
  if (n >= 1_000)       return `₹${(n / 1_000).toFixed(1)}K`;
  return `₹${Math.round(n)}`;
}

function fmtFull(n) {
  return '₹' + new Intl.NumberFormat('en-IN').format(Math.round(n || 0));
}

function pctColor(v) {
  if (v === null || v === undefined) return 'var(--color-muted)';
  if (v >= 100) return 'var(--color-success)';
  if (v >= 75)  return 'var(--color-warning)';
  return 'var(--color-danger)';
}

function AchievementPill({ pct }) {
  if (pct === null || pct === undefined)
    return <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)', fontStyle: 'italic' }}>No target</span>;

  const color = pctColor(pct);
  const Icon  = pct >= 100 ? TrendingUp : pct >= 75 ? Minus : TrendingDown;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.82rem', fontWeight: 700, color }}>
      <Icon size={13} /> {pct}%
    </span>
  );
}

// ── Default date range: current year ─────────────────────────────────────────
function defaultDates() {
  const now = new Date();
  return {
    from: `${now.getFullYear()}-01-01`,
    to:   `${now.getFullYear()}-12-31`,
  };
}

// ── Target type config ────────────────────────────────────────────────────────
const TARGET_TYPES = [
  { id: 'overall', label: 'Overall',  icon: Target,     color: '#6366f1' },
  { id: 'sku',     label: 'SKU',      icon: Package,    color: '#22c55e' },
  { id: 'city',    label: 'City',     icon: MapPin,     color: '#f59e0b' },
  { id: 'account', label: 'Account',  icon: Users,      color: '#38bdf8' },
];

const PERIOD_TYPES = [
  { value: 'monthly',   label: 'Monthly'   },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly',    label: 'Yearly'    },
  { value: 'custom',    label: 'Custom'    },
];

// ── Quick date shortcuts ──────────────────────────────────────────────────────
function periodDates(type) {
  const now = new Date();
  const y   = now.getFullYear();
  const m   = now.getMonth();
  if (type === 'monthly')   return { from: `${y}-${String(m+1).padStart(2,'0')}-01`, to: new Date(y, m+1, 0).toISOString().slice(0,10) };
  if (type === 'quarterly') {
    const q = Math.floor(m / 3);
    return { from: `${y}-${String(q*3+1).padStart(2,'0')}-01`, to: new Date(y, q*3+3, 0).toISOString().slice(0,10) };
  }
  if (type === 'yearly')    return { from: `${y}-01-01`, to: `${y}-12-31` };
  return { from: '', to: '' };
}

// ── Create / Edit Target Modal ────────────────────────────────────────────────
function TargetModal({ initial, skus, cities, accounts, onClose, onSaved }) {
  const editing = !!initial?.id;
  const [type,      setType]     = useState(initial?.target_type   || 'overall');
  const [period,    setPeriod]   = useState(initial?.period_type   || 'monthly');
  const [from,      setFrom]     = useState(initial?.period_start  || '');
  const [to,        setTo]       = useState(initial?.period_end    || '');
  const [label,     setLabel]    = useState(initial?.label         || '');
  const [revenue,   setRevenue]  = useState(initial?.target_revenue ?? '');
  const [units,     setUnits]    = useState(initial?.target_units   ?? '');
  const [skuId,     setSkuId]    = useState(initial?.sku_id         || '');
  const [city,      setCity]     = useState(initial?.city           || '');
  const [accountId, setAccId]    = useState(initial?.account_id     || '');
  const [loading,   setLoading]  = useState(false);
  const [error,     setError]    = useState('');

  function applyPeriod(p) {
    setPeriod(p);
    if (p !== 'custom') {
      const { from: f, to: t } = periodDates(p);
      setFrom(f); setTo(t);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!from || !to) { setError('Please select a date range.'); return; }
    setError('');
    setLoading(true);
    try {
      const body = {
        target_type: type, label, period_type: period,
        period_start: from, period_end: to,
        target_revenue: revenue, target_units: units,
        sku_id:     type === 'sku'     ? skuId     : null,
        city:       type === 'city'    ? city       : null,
        account_id: type === 'account' ? accountId : null,
      };
      if (editing) await targetApi.update(initial.id, body);
      else         await targetApi.create(body);
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
      <div className="modal" style={{ maxWidth: 540 }}>
        <div className="modal-header">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '1rem' }}>
            <Target size={17} color="var(--color-accent-light)" />
            {editing ? 'Edit Target' : 'New Target Plan'}
          </h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={15} /></button>
        </div>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 12px', marginBottom: 14, fontSize: '0.82rem', color: 'var(--color-danger)', display: 'flex', gap: 6 }}>
            <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} /> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {/* Target Type */}
          <div style={{ marginBottom: 16 }}>
            <div className="form-label" style={{ marginBottom: 8 }}>Target Scope</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
              {TARGET_TYPES.map(t => {
                const Icon = t.icon;
                const active = type === t.id;
                return (
                  <button key={t.id} type="button"
                    onClick={() => setType(t.id)}
                    style={{
                      padding: '8px 0', borderRadius: 8, border: `1px solid ${active ? t.color : 'var(--color-border)'}`,
                      background: active ? `${t.color}18` : 'var(--color-surface-2)',
                      color: active ? t.color : 'var(--color-muted)',
                      cursor: 'pointer', display: 'flex', flexDirection: 'column',
                      alignItems: 'center', gap: 4, fontWeight: 600, fontSize: '0.78rem',
                      transition: 'all 0.12s',
                    }}
                  >
                    <Icon size={15} />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dimension selector (conditional) */}
          {type === 'sku' && (
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label className="form-label">SKU</label>
              <select id="target-sku" className="form-input" value={skuId} onChange={e => setSkuId(e.target.value)} required>
                <option value="">Select SKU…</option>
                {skus.map(s => <option key={s.id} value={s.id}>{s.sku_code} — {s.name}</option>)}
              </select>
            </div>
          )}
          {type === 'city' && (
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label className="form-label">City</label>
              <input id="target-city" className="form-input" list="city-list" value={city} onChange={e => setCity(e.target.value)} placeholder="Type city name" required />
              <datalist id="city-list">
                {cities.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
          )}
          {type === 'account' && (
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label className="form-label">Account</label>
              <select id="target-account" className="form-input" value={accountId} onChange={e => setAccId(e.target.value)} required>
                <option value="">Select account…</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.account_name} ({a.platforms?.name ?? 'Platform'})</option>)}
              </select>
            </div>
          )}

          {/* Label */}
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label">Plan Name / Label</label>
            <input id="target-label" className="form-input" placeholder="e.g. Q3 2024 Growth Target" value={label} onChange={e => setLabel(e.target.value)} />
          </div>

          {/* Period type buttons */}
          <div style={{ marginBottom: 14 }}>
            <div className="form-label" style={{ marginBottom: 8 }}>Period</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {PERIOD_TYPES.map(p => (
                <button key={p.value} type="button"
                  onClick={() => applyPeriod(p.value)}
                  className={`btn btn-sm ${period === p.value ? 'btn-primary' : 'btn-secondary'}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date range */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div className="form-group">
              <label className="form-label">Start Date *</label>
              <input type="date" className="form-input" value={from} onChange={e => setFrom(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">End Date *</label>
              <input type="date" className="form-input" value={to} onChange={e => setTo(e.target.value)} required />
            </div>
          </div>

          {/* Targets */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            <div className="form-group">
              <label className="form-label">Revenue Target (₹)</label>
              <input id="target-revenue" type="number" className="form-input" placeholder="0" min="0" step="1000"
                value={revenue} onChange={e => setRevenue(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Units Target</label>
              <input id="target-units" type="number" className="form-input" placeholder="0" min="0"
                value={units} onChange={e => setUnits(e.target.value)} />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" id="btn-save-target" className="btn btn-primary" disabled={loading} style={{ minWidth: 140, justifyContent: 'center' }}>
              {loading ? <><Loader size={14} className="animate-spin" /> Saving…</> : <><Check size={14} /> {editing ? 'Update Target' : 'Create Target'}</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Custom chart tooltip ──────────────────────────────────────────────────────
function ComparisonTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const target = payload.find(p => p.dataKey === 'target_revenue')?.value;
  const actual = payload.find(p => p.dataKey === 'actual_revenue')?.value;
  const pct    = target > 0 ? Math.round((actual / target) * 100) : null;

  return (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '12px 16px', minWidth: 180, fontSize: '0.82rem' }}>
      <div style={{ fontWeight: 700, marginBottom: 8, color: 'var(--color-accent-light)' }}>{label}</div>
      {target > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 4 }}>
          <span style={{ color: 'var(--color-muted)' }}>Target</span>
          <span style={{ fontWeight: 600 }}>{fmtINR(target)}</span>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: target ? 8 : 0 }}>
        <span style={{ color: 'var(--color-muted)' }}>Actual</span>
        <span style={{ fontWeight: 600, color: '#818cf8' }}>{fmtINR(actual)}</span>
      </div>
      {pct !== null && (
        <div style={{ paddingTop: 8, borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--color-muted)' }}>Achievement</span>
          <span style={{ fontWeight: 700, color: pctColor(pct) }}>{pct}%</span>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════════════════════════════
export default function Sales() {
  const [tab,          setTab]          = useState('plans');
  const [targets,      setTargets]      = useState([]);
  const [skus,         setSkus]         = useState([]);
  const [cities,       setCities]       = useState([]);
  const [accounts,     setAccounts]     = useState([]);
  const [chartData,    setChartData]    = useState([]);
  const [summary,      setSummary]      = useState(null);
  const [accountRows,  setAccountRows]  = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [chartLoading, setChartLoading] = useState(false);
  const [error,        setError]        = useState('');
  const [showModal,    setShowModal]    = useState(false);
  const [editTarget,   setEditTarget]   = useState(null);
  const [typeFilter,   setTypeFilter]   = useState('');

  // Chart filters
  const [chartDates,   setChartDates]   = useState(defaultDates());
  const [chartScope,   setChartScope]   = useState('overall');  // overall|sku|city|account
  const [chartSkuId,   setChartSkuId]   = useState('');
  const [chartCity,    setChartCity]    = useState('');
  const [chartAccId,   setChartAccId]   = useState('');
  const [chartMetric,  setChartMetric]  = useState('revenue'); // revenue|units

  useEffect(() => {
    loadReferenceData();
    loadTargets();
  }, []);

  useEffect(() => {
    if (typeFilter !== undefined) loadTargets();
  }, [typeFilter]);

  useEffect(() => {
    if (tab === 'chart') loadChartData();
  }, [tab]);

  useEffect(() => {
    if (tab === 'accounts') loadAccountsSummary();
  }, [tab, chartDates]);

  async function loadReferenceData() {
    const [s, c, a] = await Promise.allSettled([
      skuApi.list({ is_active: 'true' }),
      salesApi.cities(),
      salesApi.accounts(),
    ]);
    if (s.status === 'fulfilled') setSkus(s.value);
    if (c.status === 'fulfilled') setCities(c.value);
    if (a.status === 'fulfilled') setAccounts(a.value);
  }

  async function loadTargets() {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (typeFilter) params.target_type = typeFilter;
      setTargets(await targetApi.list(params));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadChartData() {
    setChartLoading(true);
    try {
      const params = {
        from: chartDates.from,
        to:   chartDates.to,
      };
      if (chartScope === 'sku'     && chartSkuId) params.sku_id     = chartSkuId;
      if (chartScope === 'city'    && chartCity)  params.city       = chartCity;
      if (chartScope === 'account' && chartAccId) params.account_id = chartAccId;

      const { data, summary: s } = await salesApi.comparison(params);
      setChartData(data);
      setSummary(s);
    } catch (err) {
      setError(err.message);
    } finally {
      setChartLoading(false);
    }
  }

  async function loadAccountsSummary() {
    try {
      const rows = await salesApi.accountsSummary({ from: chartDates.from, to: chartDates.to });
      setAccountRows(rows);
    } catch { /* silent */ }
  }

  async function deleteTarget(id) {
    if (!confirm('Delete this target?')) return;
    try {
      await targetApi.delete(id);
      setTargets(prev => prev.filter(t => t.id !== id));
    } catch (err) {
      alert(err.message);
    }
  }

  function openEdit(target) { setEditTarget(target); setShowModal(true); }

  const TYPE_LABEL_MAP = Object.fromEntries(TARGET_TYPES.map(t => [t.id, t]));

  // ── Summary stats ──────────────────────────────────────────────────────────
  const statsData = summary ? [
    { label: 'Target Revenue',  value: fmtFull(summary.total_target_revenue), color: '#6366f1' },
    { label: 'Actual Revenue',  value: fmtFull(summary.total_actual_revenue), color: '#818cf8' },
    { label: 'Achievement',     value: summary.overall_achievement_pct !== null ? `${summary.overall_achievement_pct}%` : 'No target', color: pctColor(summary.overall_achievement_pct) },
    { label: 'Target Units',    value: new Intl.NumberFormat('en-IN').format(summary.total_target_units), color: '#f59e0b' },
    { label: 'Actual Units',    value: new Intl.NumberFormat('en-IN').format(summary.total_actual_units), color: '#fbbf24' },
  ] : [];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1>Sale Planning</h1>
          <p>Set targets and track performance by SKU, city, or account</p>
        </div>
        <div className="flex items-center gap-3">
          <ExportMenu 
            data={chartData.map(d => ({
              month: d.month,
              target_revenue: d.target_revenue,
              actual_revenue: d.actual_revenue,
              target_units: d.target_units,
              actual_units: d.actual_units
            }))} 
            filename="sales_targets_actuals" 
          />
          <button id="btn-new-target" className="btn btn-primary" onClick={() => { setEditTarget(null); setShowModal(true); }}>
            <Plus size={15} /> New Target
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', marginBottom: 24, gap: 0 }}>
        {[
          { id: 'plans',    label: 'Target Plans'      },
          { id: 'chart',    label: 'Performance Chart' },
          { id: 'accounts', label: 'Account Tracker'   },
        ].map(t => (
          <button key={t.id} id={`tab-sales-${t.id}`}
            onClick={() => setTab(t.id)}
            style={{
              padding: '10px 22px', background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '0.875rem', fontWeight: 600,
              color: tab === t.id ? 'var(--color-accent-light)' : 'var(--color-muted)',
              borderBottom: `2px solid ${tab === t.id ? 'var(--color-accent)' : 'transparent'}`,
              marginBottom: -1, transition: 'all 0.15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: '0.85rem', color: 'var(--color-danger)', display: 'flex', gap: 8, alignItems: 'center' }}>
          <AlertCircle size={14} /> {error} — run phase4_migration.sql in Supabase first.
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* TAB: TARGET PLANS                                             */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {tab === 'plans' && (
        <div className="animate-fade-in">
          {/* Type filter */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>Filter:</span>
            {[{ id: '', label: 'All' }, ...TARGET_TYPES].map(t => {
              const Icon = t.icon;
              return (
                <button key={t.id} id={`filter-target-${t.id || 'all'}`}
                  onClick={() => setTypeFilter(t.id)}
                  className={`btn btn-sm ${typeFilter === t.id ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ gap: 5 }}
                >
                  {Icon && <Icon size={12} />}
                  {t.label}
                </button>
              );
            })}
            <button className="btn btn-ghost btn-icon btn-sm" onClick={loadTargets} title="Refresh">
              <RefreshCw size={13} />
            </button>
          </div>

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}><div className="loader" /></div>
          ) : targets.length === 0 ? (
            <div className="card empty-state">
              <div className="empty-state-icon"><Target size={26} /></div>
              <h3>No targets yet</h3>
              <p>Create your first target plan to start tracking performance against goals.</p>
              <button className="btn btn-primary btn-sm" style={{ marginTop: 10 }} onClick={() => { setEditTarget(null); setShowModal(true); }}>
                <Plus size={13} /> Create First Target
              </button>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Scope</th>
                    <th>Label / Dimension</th>
                    <th>Period</th>
                    <th style={{ textAlign: 'right' }}>Revenue Target</th>
                    <th style={{ textAlign: 'right' }}>Units Target</th>
                    <th>Type</th>
                    <th style={{ width: 80 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {targets.map(t => {
                    const tt = TYPE_LABEL_MAP[t.target_type] || TYPE_LABEL_MAP.overall;
                    const Icon = tt.icon;
                    const dimLabel = t.target_type === 'sku'     ? `${t.skus?.sku_code} — ${t.skus?.name}`
                                   : t.target_type === 'city'    ? t.city
                                   : t.target_type === 'account' ? `${t.accounts?.account_name} (${t.accounts?.platforms?.name ?? '—'})`
                                   : '—';
                    return (
                      <tr key={t.id}>
                        <td>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 99, background: `${tt.color}15`, color: tt.color, fontSize: '0.75rem', fontWeight: 600 }}>
                            <Icon size={11} /> {tt.label}
                          </span>
                        </td>
                        <td style={{ maxWidth: 220 }}>
                          <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>{t.label || <span style={{ color: 'var(--color-muted)', fontStyle: 'italic' }}>Unnamed</span>}</div>
                          {t.target_type !== 'overall' && <div style={{ fontSize: '0.72rem', color: 'var(--color-muted)' }}>{dimLabel}</div>}
                        </td>
                        <td style={{ fontSize: '0.82rem' }}>
                          <div style={{ fontWeight: 500 }}>{t.period_type?.charAt(0).toUpperCase() + t.period_type?.slice(1)}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--color-muted)' }}>
                            {format(parseISO(t.period_start), 'dd MMM yy')} – {format(parseISO(t.period_end), 'dd MMM yy')}
                          </div>
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'Outfit, sans-serif', fontWeight: 700 }}>
                          {fmtFull(t.target_revenue)}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'Outfit, sans-serif', fontWeight: 600, color: 'var(--color-subtle)' }}>
                          {new Intl.NumberFormat('en-IN').format(t.target_units || 0)}
                        </td>
                        <td>
                          <span className="badge badge-muted" style={{ fontSize: '0.68rem', background: 'var(--color-surface-3)', color: 'var(--color-subtle)' }}>
                            {t.period_type}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => openEdit(t)} title="Edit">
                              <Edit3 size={13} />
                            </button>
                            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => deleteTarget(t.id)} title="Delete" style={{ color: 'var(--color-danger)' }}>
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* TAB: PERFORMANCE CHART                                        */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {tab === 'chart' && (
        <div className="animate-fade-in">
          {/* Filter bar */}
          <div className="card" style={{ padding: '16px 20px', marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              {/* Date range */}
              <div className="form-group" style={{ flex: '0 0 140px' }}>
                <label className="form-label">From</label>
                <input type="date" className="form-input" value={chartDates.from}
                  onChange={e => setChartDates(d => ({ ...d, from: e.target.value }))} />
              </div>
              <div className="form-group" style={{ flex: '0 0 140px' }}>
                <label className="form-label">To</label>
                <input type="date" className="form-input" value={chartDates.to}
                  onChange={e => setChartDates(d => ({ ...d, to: e.target.value }))} />
              </div>

              {/* Scope */}
              <div className="form-group" style={{ flex: '0 0 140px' }}>
                <label className="form-label">Scope</label>
                <select id="chart-scope" className="form-input" value={chartScope}
                  onChange={e => { setChartScope(e.target.value); setChartSkuId(''); setChartCity(''); setChartAccId(''); }}>
                  <option value="overall">Overall</option>
                  <option value="sku">By SKU</option>
                  <option value="city">By City</option>
                  <option value="account">By Account</option>
                </select>
              </div>

              {/* Dimension selector */}
              {chartScope === 'sku' && (
                <div className="form-group" style={{ flex: '1 1 200px' }}>
                  <label className="form-label">SKU</label>
                  <select id="chart-sku" className="form-input" value={chartSkuId} onChange={e => setChartSkuId(e.target.value)}>
                    <option value="">All SKUs</option>
                    {skus.map(s => <option key={s.id} value={s.id}>{s.sku_code} — {s.name}</option>)}
                  </select>
                </div>
              )}
              {chartScope === 'city' && (
                <div className="form-group" style={{ flex: '1 1 160px' }}>
                  <label className="form-label">City</label>
                  <select id="chart-city" className="form-input" value={chartCity} onChange={e => setChartCity(e.target.value)}>
                    <option value="">All Cities</option>
                    {cities.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              )}
              {chartScope === 'account' && (
                <div className="form-group" style={{ flex: '1 1 200px' }}>
                  <label className="form-label">Account</label>
                  <select id="chart-account" className="form-input" value={chartAccId} onChange={e => setChartAccId(e.target.value)}>
                    <option value="">All Accounts</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.account_name} ({a.platforms?.name ?? '—'})</option>)}
                  </select>
                </div>
              )}

              {/* Metric toggle */}
              <div className="form-group" style={{ flex: '0 0 130px' }}>
                <label className="form-label">Metric</label>
                <select id="chart-metric" className="form-input" value={chartMetric} onChange={e => setChartMetric(e.target.value)}>
                  <option value="revenue">Revenue (₹)</option>
                  <option value="units">Units</option>
                </select>
              </div>

              <button id="btn-apply-chart" className="btn btn-primary" onClick={loadChartData}
                style={{ alignSelf: 'flex-end', minWidth: 100, justifyContent: 'center' }}>
                {chartLoading ? <Loader size={14} className="animate-spin" /> : <BarChart2 size={14} />}
                Apply
              </button>
            </div>
          </div>

          {/* Summary cards */}
          {summary && (
            <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
              {statsData.map(s => (
                <div key={s.label} style={{ flex: '1 1 140px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '12px 16px' }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--color-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.1rem', fontWeight: 700, color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Chart */}
          <div className="card" style={{ padding: 24 }}>
            <h3 style={{ fontSize: '0.9rem', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6 }}>
              <BarChart2 size={15} color="var(--color-accent-light)" /> Target vs Actual — {chartMetric === 'revenue' ? 'Revenue' : 'Units'}
            </h3>

            {chartLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="loader" /></div>
            ) : chartData.length === 0 ? (
              <div className="empty-state" style={{ padding: '48px 0' }}>
                <div className="empty-state-icon"><BarChart2 size={24} /></div>
                <h3 style={{ fontSize: '0.9rem' }}>No data for this range</h3>
                <p>Try a wider date range, or import some sales orders first.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={360}>
                <ComposedChart data={chartData} margin={{ top: 8, right: 24, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="month_label" tick={{ fill: 'var(--color-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis
                    tickFormatter={v => chartMetric === 'revenue' ? fmtINR(v) : v.toLocaleString()}
                    tick={{ fill: 'var(--color-muted)', fontSize: 11 }}
                    axisLine={false} tickLine={false}
                  />
                  <Tooltip content={<ComparisonTooltip />} cursor={{ fill: 'rgba(99,102,241,0.05)' }} />
                  <Legend wrapperStyle={{ fontSize: '0.8rem', color: 'var(--color-subtle)', paddingTop: 12 }} />

                  {/* Actual bars */}
                  <Bar
                    dataKey={chartMetric === 'revenue' ? 'actual_revenue' : 'actual_units'}
                    name="Actual"
                    fill="#6366f1"
                    radius={[4,4,0,0]}
                    maxBarSize={40}
                  >
                    {chartData.map((entry, i) => {
                      const tgt = chartMetric === 'revenue' ? entry.target_revenue : entry.target_units;
                      const act = chartMetric === 'revenue' ? entry.actual_revenue : entry.actual_units;
                      const color = tgt > 0 && act >= tgt ? '#22c55e' : tgt > 0 && act >= tgt * 0.75 ? '#f59e0b' : '#6366f1';
                      return <Cell key={i} fill={color} />;
                    })}
                  </Bar>

                  {/* Target line */}
                  <Line
                    dataKey={chartMetric === 'revenue' ? 'target_revenue' : 'target_units'}
                    name="Target"
                    stroke="#f97316"
                    strokeWidth={2.5}
                    strokeDasharray="5 4"
                    dot={{ fill: '#f97316', r: 3 }}
                    activeDot={{ r: 5 }}
                    type="monotone"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}

            {/* Legend explanation */}
            <div style={{ display: 'flex', gap: 20, marginTop: 16, flexWrap: 'wrap' }}>
              {[
                { color: '#22c55e', label: 'Actual ≥ Target (on track)' },
                { color: '#f59e0b', label: 'Actual 75–99% of target' },
                { color: '#6366f1', label: 'Actual < 75% of target' },
                { color: '#f97316', label: '--- Target line', dashed: true },
              ].map(l => (
                <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 24, height: 3, background: l.color, borderRadius: 2, opacity: l.dashed ? 0.8 : 1, borderTop: l.dashed ? '2px dashed' : 'none' }} />
                  <span style={{ fontSize: '0.72rem', color: 'var(--color-muted)' }}>{l.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* TAB: ACCOUNT TRACKER                                          */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {tab === 'accounts' && (
        <div className="animate-fade-in">
          {/* Date filter */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ flex: '0 0 140px' }}>
              <label className="form-label">From</label>
              <input type="date" className="form-input" value={chartDates.from}
                onChange={e => setChartDates(d => ({ ...d, from: e.target.value }))} />
            </div>
            <div className="form-group" style={{ flex: '0 0 140px' }}>
              <label className="form-label">To</label>
              <input type="date" className="form-input" value={chartDates.to}
                onChange={e => setChartDates(d => ({ ...d, to: e.target.value }))} />
            </div>
            <button className="btn btn-primary btn-sm" onClick={loadAccountsSummary} style={{ alignSelf: 'flex-end' }}>
              <RefreshCw size={13} /> Refresh
            </button>
          </div>

          {accountRows.length === 0 ? (
            <div className="card empty-state">
              <div className="empty-state-icon"><Users size={26} /></div>
              <h3>No account data</h3>
              <p>Import sales orders with account information to see per-account tracking.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Platform</th>
                    <th style={{ textAlign: 'right' }}>Target Revenue</th>
                    <th style={{ textAlign: 'right' }}>Actual Revenue</th>
                    <th style={{ textAlign: 'right' }}>Achievement</th>
                    <th style={{ textAlign: 'right' }}>Actual Units</th>
                    <th>Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {accountRows.map(acc => {
                    const pct = acc.achievement_pct;
                    const barW = pct !== null ? Math.min(pct, 100) : 0;
                    return (
                      <tr key={acc.id}>
                        <td style={{ fontWeight: 500 }}>{acc.account_name}</td>
                        <td><span className="badge badge-accent" style={{ fontSize: '0.72rem' }}>{acc.platform}</span></td>
                        <td style={{ textAlign: 'right', color: 'var(--color-muted)', fontSize: '0.85rem' }}>
                          {acc.target_revenue > 0 ? fmtFull(acc.target_revenue) : '—'}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: '1rem' }}>
                          {fmtFull(acc.actual_revenue)}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <AchievementPill pct={pct} />
                        </td>
                        <td style={{ textAlign: 'right', fontSize: '0.85rem' }}>
                          {new Intl.NumberFormat('en-IN').format(acc.actual_units)}
                        </td>
                        <td style={{ minWidth: 120 }}>
                          <div style={{ height: 6, background: 'var(--color-surface-3)', borderRadius: 99, overflow: 'hidden' }}>
                            <div style={{
                              height: '100%', width: `${barW}%`, borderRadius: 99,
                              background: pctColor(pct),
                              transition: 'width 0.4s ease',
                            }} />
                          </div>
                          {pct !== null && <div style={{ fontSize: '0.68rem', color: 'var(--color-muted)', marginTop: 3 }}>{pct}% of target</div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <TargetModal
          initial={editTarget}
          skus={skus}
          cities={cities}
          accounts={accounts}
          onClose={() => { setShowModal(false); setEditTarget(null); }}
          onSaved={loadTargets}
        />
      )}
    </div>
  );
}
