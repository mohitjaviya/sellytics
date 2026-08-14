import { useState, useEffect, useCallback, useRef } from 'react';
import {
  DollarSign, Flame, BarChart2, Settings2, TrendingUp, TrendingDown,
  AlertTriangle, Zap, Loader, X, Check, RefreshCw, Info,
  ChevronDown, ChevronUp, ArrowUp, ArrowDown, Minus,
} from 'lucide-react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, Legend, BarChart, ReferenceLine,
} from 'recharts';
import { profitabilityApi } from '../lib/api';
import { format, parseISO } from 'date-fns';
import ExportMenu from '../components/ExportMenu';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtINR(n) {
  if (n === null || n === undefined) return '—';
  const abs = Math.abs(n);
  let s;
  if (abs >= 1_00_00_000) s = `₹${(abs / 1_00_00_000).toFixed(2)}Cr`;
  else if (abs >= 1_00_000) s = `₹${(abs / 1_00_000).toFixed(1)}L`;
  else if (abs >= 1_000)    s = `₹${(abs / 1_000).toFixed(1)}K`;
  else                       s = `₹${abs.toFixed(0)}`;
  return n < 0 ? `-${s}` : s;
}
function fmtFull(n) {
  if (n === null || n === undefined) return '—';
  return (n < 0 ? '-₹' : '₹') + new Intl.NumberFormat('en-IN').format(Math.abs(Math.round(n)));
}
function fmtNum(n) { return new Intl.NumberFormat('en-IN').format(n || 0); }
function fmtPct(n, suffix = '%') { return n === null || n === undefined ? '—' : `${n.toFixed(1)}${suffix}` ; }

function marginColor(pct) {
  if (pct === null || pct === undefined) return 'var(--color-muted)';
  if (pct >= 20) return 'var(--color-success)';
  if (pct >= 8)  return 'var(--color-warning)';
  return 'var(--color-danger)';
}
function roasColor(r) {
  if (r === null || r === undefined) return 'var(--color-muted)';
  if (r >= 4) return 'var(--color-success)';
  if (r >= 2) return 'var(--color-warning)';
  return 'var(--color-danger)';
}

function thisYear() { const y = new Date().getFullYear(); return { from: `${y}-01-01`, to: `${y}-12-31` }; }

// ── Custom Tooltip ────────────────────────────────────────────────────────────
function RoasTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const spend = payload.find(p => p.dataKey === 'ad_spend')?.value;
  const rev   = payload.find(p => p.dataKey === 'revenue_attributed')?.value;
  const roas  = spend > 0 ? (rev / spend).toFixed(2) : '—';
  return (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '12px 16px', fontSize: '0.8rem' }}>
      <div style={{ fontWeight: 700, marginBottom: 8, color: 'var(--color-accent-light)' }}>{label}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 3 }}>
        <span style={{ color: 'var(--color-muted)' }}>Ad Spend</span>
        <span style={{ fontWeight: 600, color: '#f97316' }}>{fmtINR(spend)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 8 }}>
        <span style={{ color: 'var(--color-muted)' }}>Revenue Attributed</span>
        <span style={{ fontWeight: 600, color: '#22c55e' }}>{fmtINR(rev)}</span>
      </div>
      <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 8, display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ color: 'var(--color-muted)' }}>ROAS</span>
        <span style={{ fontWeight: 700, color: roasColor(parseFloat(roas)) }}>{roas}×</span>
      </div>
    </div>
  );
}

// ── Platform Settings Modal ────────────────────────────────────────────────────
function PlatformSettingsModal({ platforms, onClose, onSaved }) {
  const [rows,   setRows]   = useState(platforms.map(p => ({ ...p })));
  const [saving, setSaving] = useState({});
  const [dirty,  setDirty]  = useState({});

  function setField(id, field, val) {
    setRows(prev => prev.map(p => p.id === id ? { ...p, [field]: val } : p));
    setDirty(prev => ({ ...prev, [id]: true }));
  }

  async function savePlatform(id) {
    const row = rows.find(p => p.id === id);
    setSaving(prev => ({ ...prev, [id]: true }));
    try {
      await profitabilityApi.updatePlatform(id, { commission_pct: row.commission_pct, shipping_cost: row.shipping_cost });
      setDirty(prev => ({ ...prev, [id]: false }));
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(prev => ({ ...prev, [id]: false }));
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <h2 style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Settings2 size={16} color="var(--color-accent-light)" /> Platform Cost Settings
          </h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={15} /></button>
        </div>

        <p style={{ fontSize: '0.8rem', color: 'var(--color-muted)', marginBottom: 16 }}>
          These are defaults. Individual sales orders can override commission % and shipping cost at import time.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map(p => (
            <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px 44px', gap: 10, alignItems: 'end' }}>
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>{p.name}</div>
              </div>
              <div className="form-group">
                <label className="form-label">Commission %</label>
                <input type="number" className="form-input" min="0" max="100" step="0.1"
                  value={p.commission_pct || 0}
                  onChange={e => setField(p.id, 'commission_pct', e.target.value)}
                  style={{ padding: '7px 10px' }}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Shipping ₹</label>
                <input type="number" className="form-input" min="0" step="1"
                  value={p.shipping_cost || 0}
                  onChange={e => setField(p.id, 'shipping_cost', e.target.value)}
                  style={{ padding: '7px 10px' }}
                />
              </div>
              <button
                className={`btn btn-sm ${dirty[p.id] ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => savePlatform(p.id)}
                disabled={!dirty[p.id] || saving[p.id]}
                style={{ padding: '7px 10px', alignSelf: 'flex-end' }}
                title={dirty[p.id] ? 'Save' : 'Saved'}
              >
                {saving[p.id] ? <Loader size={13} className="animate-spin" /> : <Check size={13} />}
              </button>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
          <button className="btn btn-primary" onClick={() => { onSaved(); onClose(); }}>Done</button>
        </div>
      </div>
    </div>
  );
}

// ── Global Date & Filter Bar ──────────────────────────────────────────────────
function FilterBar({ dates, onChange, onApply, loading, extra }) {
  return (
    <div className="card" style={{ padding: '14px 20px', marginBottom: 20, display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
      <div className="form-group" style={{ flex: '0 0 138px' }}>
        <label className="form-label">From</label>
        <input type="date" className="form-input" value={dates.from} onChange={e => onChange({ ...dates, from: e.target.value })} />
      </div>
      <div className="form-group" style={{ flex: '0 0 138px' }}>
        <label className="form-label">To</label>
        <input type="date" className="form-input" value={dates.to} onChange={e => onChange({ ...dates, to: e.target.value })} />
      </div>
      {[
        { label: 'This Year', d: thisYear() },
        { label: 'Last 90d',  d: (() => { const t = new Date(); const f = new Date(t); f.setDate(f.getDate()-89); return { from: f.toISOString().slice(0,10), to: t.toISOString().slice(0,10) }; })() },
      ].map(({ label, d }) => (
        <button key={label} className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-end' }}
          onClick={() => { onChange(d); setTimeout(() => onApply(d), 0); }}>
          {label}
        </button>
      ))}
      {extra}
      <button className="btn btn-primary btn-sm" onClick={() => onApply(dates)} style={{ alignSelf: 'flex-end', minWidth: 90, justifyContent: 'center' }}>
        {loading ? <Loader size={13} className="animate-spin" /> : <RefreshCw size={13} />} Apply
      </button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// TAB 1 — SKU Profit Table
// ════════════════════════════════════════════════════════════════════════════════
function SkuProfitTab({ dates, onDatesChange }) {
  const [data,    setData]    = useState([]);
  const [totals,  setTotals]  = useState(null);
  const [loading, setLoading] = useState(false);
  const [limit,   setLimit]   = useState(25);
  const [sortBy,  setSortBy]  = useState('net_profit');
  const [sortDir, setSortDir] = useState('desc');
  const [expand,  setExpand]  = useState(null); // row id for cost breakdown

  const load = useCallback(async (d = dates) => {
    setLoading(true);
    try {
      const r = await profitabilityApi.skuProfit({ ...d, limit });
      setData(r.data || []);
      setTotals(r.totals || null);
    }
    catch { /* silent */ }
    finally { setLoading(false); }
  }, [dates, limit]);

  useEffect(() => { load(); }, [load]);

  function toggleSort(col) {
    if (sortBy === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortBy(col); setSortDir('desc'); }
  }

  const sorted = [...data].sort((a, b) =>
    sortDir === 'desc' ? (b[sortBy] ?? -Infinity) - (a[sortBy] ?? -Infinity)
                       : (a[sortBy] ?? Infinity)  - (b[sortBy] ?? Infinity)
  );

  // Summary stats — use store-wide totals across all 86 SKUs if available
  const totalRev    = totals?.total_revenue   ?? data.reduce((s, r) => s + r.total_revenue, 0);
  const totalNet    = totals?.net_profit      ?? data.reduce((s, r) => s + r.net_profit, 0);
  const totalAd     = totals?.ad_spend        ?? data.reduce((s, r) => s + r.ad_spend, 0);
  const avgMargin   = totals?.avg_margin      ?? (data.length ? (data.reduce((s, r) => s + (r.net_margin_pct || 0), 0) / data.length) : 0);

  function SortIcon({ col }) {
    if (sortBy !== col) return <ChevronDown size={11} color="var(--color-muted)" />;
    return sortDir === 'desc' ? <ChevronDown size={11} color="var(--color-accent-light)" /> : <ChevronUp size={11} color="var(--color-accent-light)" />;
  }

  return (
    <div>
      <FilterBar dates={dates} onChange={onDatesChange} onApply={load} loading={loading}
        extra={
          <select className="form-input" value={limit} onChange={e => setLimit(e.target.value)} style={{ flex: '0 0 100px', padding: '6px 10px', alignSelf: 'flex-end' }}>
            {[25,50,100].map(n => <option key={n} value={n}>Top {n} SKUs</option>)}
          </select>
        }
      />

      {/* Summary strip */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { label: 'Total Revenue',    value: fmtINR(totalRev),    color: '#818cf8' },
          { label: 'Total Net Profit', value: fmtINR(totalNet),    color: totalNet >= 0 ? 'var(--color-success)' : 'var(--color-danger)' },
          { label: 'Total Ad Spend',   value: fmtINR(totalAd),     color: '#f97316' },
          { label: 'Avg Net Margin',   value: fmtPct(avgMargin),   color: marginColor(avgMargin) },
        ].map(s => (
          <div key={s.label} style={{ flex: '1 1 150px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '12px 16px' }}>
            <div style={{ fontSize: '0.68rem', color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600, marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: '1.2rem', color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="loader" /></div>
      ) : data.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-state-icon"><DollarSign size={26} /></div>
          <h3>No profit data yet</h3>
          <p>Import sales orders and ensure SKUs have cost prices set to see profitability.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ cursor: 'default' }}>SKU</th>
                <th onClick={() => toggleSort('total_revenue')} style={{ cursor: 'pointer', textAlign: 'right', userSelect: 'none' }}>Revenue <SortIcon col="total_revenue" /></th>
                <th onClick={() => toggleSort('total_cost')} style={{ cursor: 'pointer', textAlign: 'right', userSelect: 'none' }}>COGS <SortIcon col="total_cost" /></th>
                <th onClick={() => toggleSort('total_commission')} style={{ cursor: 'pointer', textAlign: 'right', userSelect: 'none' }}>Commission <SortIcon col="total_commission" /></th>
                <th onClick={() => toggleSort('total_shipping')} style={{ cursor: 'pointer', textAlign: 'right', userSelect: 'none' }}>Shipping <SortIcon col="total_shipping" /></th>
                <th onClick={() => toggleSort('ad_spend')} style={{ cursor: 'pointer', textAlign: 'right', userSelect: 'none' }}>Ad Spend <SortIcon col="ad_spend" /></th>
                <th onClick={() => toggleSort('net_profit')} style={{ cursor: 'pointer', textAlign: 'right', userSelect: 'none', whiteSpace: 'nowrap' }}>Net Profit <SortIcon col="net_profit" /></th>
                <th onClick={() => toggleSort('net_margin_pct')} style={{ cursor: 'pointer', textAlign: 'right', userSelect: 'none' }}>Margin <SortIcon col="net_margin_pct" /></th>
                <th onClick={() => toggleSort('roas')} style={{ cursor: 'pointer', textAlign: 'right', userSelect: 'none' }}>ROAS <SortIcon col="roas" /></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(row => {
                const isExpanded = expand === row.sku_id;
                const netIsNeg   = row.net_profit < 0;
                return [
                  <tr key={row.sku_id}
                    onClick={() => setExpand(isExpanded ? null : row.sku_id)}
                    style={{ cursor: 'pointer', background: netIsNeg ? 'rgba(239,68,68,0.025)' : undefined }}
                  >
                    <td style={{ maxWidth: 220 }}>
                      <div style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--color-accent-light)' }} className="truncate" title={row.sku_code}>{row.sku_code}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--color-muted)' }} className="truncate" title={row.sku_name}>{row.sku_name}</div>
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'Outfit, sans-serif', fontWeight: 600 }}>{fmtINR(row.total_revenue)}</td>
                    <td style={{ textAlign: 'right', fontSize: '0.83rem', color: 'var(--color-muted)' }}>{fmtINR(row.total_cost)}</td>
                    <td style={{ textAlign: 'right', fontSize: '0.83rem', color: 'var(--color-muted)' }}>{fmtINR(row.total_commission)}</td>
                    <td style={{ textAlign: 'right', fontSize: '0.83rem', color: 'var(--color-muted)' }}>{fmtINR(row.total_shipping)}</td>
                    <td style={{ textAlign: 'right', fontSize: '0.83rem', color: '#f97316' }}>{fmtINR(row.ad_spend)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: '0.95rem', color: netIsNeg ? 'var(--color-danger)' : 'var(--color-success)' }}>
                        {fmtINR(row.net_profit)}
                      </span>
                      <div style={{ fontSize: '0.68rem', color: 'var(--color-muted)' }}>{fmtINR(row.net_profit_unit)}/unit</div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, color: marginColor(row.net_margin_pct) }}>
                        {fmtPct(row.net_margin_pct)}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {row.roas !== null
                        ? <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, color: roasColor(row.roas) }}>{row.roas}×</span>
                        : <span style={{ color: 'var(--color-muted)', fontSize: '0.75rem' }}>No ads</span>
                      }
                    </td>
                  </tr>,
                  isExpanded && (
                    <tr key={`${row.sku_id}-expand`}>
                      <td colSpan={9} style={{ padding: '0 16px 14px', background: 'var(--color-surface-2)' }}>
                        <div style={{ display: 'flex', gap: 24, fontSize: '0.78rem', color: 'var(--color-muted)', flexWrap: 'wrap', paddingTop: 10 }}>
                          <div><span style={{ fontWeight: 600, color: 'var(--color-subtle)' }}>Units Sold:</span> {fmtNum(row.total_units)}</div>
                          <div><span style={{ fontWeight: 600, color: 'var(--color-subtle)' }}>Cost Price/unit:</span> ₹{row.cost_price?.toFixed(2) ?? '—'}</div>
                          <div><span style={{ fontWeight: 600, color: 'var(--color-subtle)' }}>Gross Margin:</span> {fmtPct(row.gross_margin_pct)}</div>
                          <div><span style={{ fontWeight: 600, color: 'var(--color-subtle)' }}>Ad/unit:</span> {fmtINR(row.ad_per_unit)}</div>
                          <div><span style={{ fontWeight: 600, color: 'var(--color-subtle)' }}>ACoS:</span> {row.acos !== null ? `${row.acos}%` : 'N/A'}</div>
                          <div><span style={{ fontWeight: 600, color: 'var(--color-subtle)' }}>Brand:</span> {row.brand || '—'}</div>
                        </div>
                        {/* Mini waterfall bar */}
                        <div style={{ marginTop: 10, display: 'flex', gap: 4, alignItems: 'center', fontSize: '0.68rem', flexWrap: 'wrap' }}>
                          {[
                            { label: 'Revenue',    val: row.total_revenue,    color: '#818cf8' },
                            { label: '- COGS',     val: -row.total_cost,      color: '#ef4444' },
                            { label: '- Commission', val: -row.total_commission, color: '#f97316' },
                            { label: '- Shipping', val: -row.total_shipping,  color: '#f59e0b' },
                            { label: '- Ad Spend', val: -row.ad_spend,        color: '#ec4899' },
                            { label: '= Net',      val: row.net_profit,       color: row.net_profit >= 0 ? '#22c55e' : '#ef4444' },
                          ].map((item, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                              {i > 0 && <span style={{ color: 'var(--color-muted)' }}></span>}
                              <span style={{ fontWeight: 600, color: item.color }}>
                                {item.label} {item.label === '= Net' ? fmtINR(item.val) : fmtINR(Math.abs(item.val))}
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// TAB 2 — ROAS Chart
// ════════════════════════════════════════════════════════════════════════════════
const ROAS_PALETTE = ['#6366f1','#22c55e','#f59e0b','#38bdf8','#ec4899','#a78bfa','#fb923c'];

function RoasTab({ dates, onDatesChange }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [view,    setView]    = useState('monthly'); // monthly | sku | platform
  const [metric,  setMetric]  = useState('roas');    // roas | acos | spend | revenue

  const load = useCallback(async (d = dates) => {
    setLoading(true);
    try { setData(await profitabilityApi.roas(d)); }
    catch { /* silent */ }
    finally { setLoading(false); }
  }, [dates]);

  useEffect(() => { load(); }, [load]);

  const chartRows = data
    ? view === 'monthly'  ? data.monthly
    : view === 'sku'      ? data.by_sku.slice(0, 20)
    : data.by_platform
    : [];

  const xKey = view === 'monthly' ? 'month_label' : view === 'sku' ? 'sku_code' : 'platform_name';

  const totals = data?.totals;

  return (
    <div>
      <FilterBar dates={dates} onChange={onDatesChange} onApply={load} loading={loading} />

      {/* Summary tiles */}
      {totals && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          {[
            { label: 'Total Ad Spend',     value: fmtINR(totals.ad_spend),           color: '#f97316' },
            { label: 'Attributed Revenue', value: fmtINR(totals.revenue_attributed), color: '#22c55e' },
            { label: 'Overall ROAS',       value: totals.roas !== null ? `${totals.roas}×` : 'N/A', color: roasColor(totals.roas) },
            { label: 'Overall ACoS',       value: totals.acos !== null ? `${totals.acos}%` : 'N/A', color: totals.acos > 30 ? 'var(--color-danger)' : 'var(--color-success)' },
          ].map(s => (
            <div key={s.label} style={{ flex: '1 1 150px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '12px 16px' }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600, marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: '1.2rem', color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* View & metric toggles */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {[['monthly','Monthly'], ['sku','By SKU'], ['platform','By Platform']].map(([k,l]) => (
            <button key={k} id={`roas-view-${k}`} className={`btn btn-sm ${view === k ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setView(k)}>{l}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[['roas','ROAS'], ['acos','ACoS %'], ['ad_spend','Ad Spend'], ['revenue_attributed','Revenue']].map(([k,l]) => (
            <button key={k} id={`roas-metric-${k}`} className={`btn btn-sm ${metric === k ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setMetric(k)}>{l}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="loader" /></div>
      ) : !data || chartRows.length === 0 ? (
        <div className="empty-state" style={{ padding: '48px 0' }}>
          <div className="empty-state-icon"><BarChart2 size={24} /></div>
          <h3 style={{ fontSize: '0.9rem' }}>No ad spend data</h3>
          <p>Import ad spend data to see ROAS analytics.</p>
        </div>
      ) : metric === 'roas' || metric === 'acos' ? (
        /* Simple bar for ROAS / ACoS */
        <div className="card" style={{ padding: 20 }}>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={chartRows} margin={{ left: 0, right: 16, top: 8, bottom: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey={xKey} tick={{ fill: 'var(--color-muted)', fontSize: 11 }} axisLine={false} tickLine={false} angle={view !== 'monthly' ? -20 : 0} textAnchor={view !== 'monthly' ? 'end' : 'middle'} />
              <YAxis tickFormatter={v => metric === 'roas' ? `${v}×` : `${v}%`} tick={{ fill: 'var(--color-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => [metric === 'roas' ? `${v}×` : `${v}%`, metric === 'roas' ? 'ROAS' : 'ACoS']} contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: '0.8rem' }} />
              {metric === 'acos' && <ReferenceLine y={30} stroke="#ef4444" strokeDasharray="5 4" label={{ value: '30% threshold', fill: '#ef4444', fontSize: 10, position: 'insideTopRight' }} />}
              <Bar dataKey={metric} name={metric === 'roas' ? 'ROAS' : 'ACoS %'} radius={[4,4,0,0]} maxBarSize={44}>
                {chartRows.map((entry, i) => {
                  const v = entry[metric];
                  const color = metric === 'roas' ? roasColor(v) : (v > 30 ? 'var(--color-danger)' : 'var(--color-success)');
                  return <Cell key={i} fill={color} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        /* Grouped bar for spend vs revenue */
        <div className="card" style={{ padding: 20 }}>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={chartRows} margin={{ left: 0, right: 16, top: 8, bottom: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey={xKey} tick={{ fill: 'var(--color-muted)', fontSize: 11 }} axisLine={false} tickLine={false} angle={view !== 'monthly' ? -20 : 0} textAnchor={view !== 'monthly' ? 'end' : 'middle'} />
              <YAxis tickFormatter={v => fmtINR(v)} tick={{ fill: 'var(--color-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<RoasTooltip />} cursor={{ fill: 'rgba(99,102,241,0.05)' }} />
              <Legend wrapperStyle={{ fontSize: '0.8rem', color: 'var(--color-subtle)' }} />
              <Bar dataKey="ad_spend" name="Ad Spend" fill="#f97316" radius={[4,4,0,0]} maxBarSize={30} />
              <Bar dataKey="revenue_attributed" name="Attributed Revenue" fill="#22c55e" radius={[4,4,0,0]} maxBarSize={30} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* By-SKU ROAS table when in monthly view */}
      {view === 'monthly' && data?.by_sku?.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h4 style={{ fontSize: '0.88rem', marginBottom: 12, color: 'var(--color-accent-light)' }}>SKU-level ROAS breakdown</h4>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th style={{ textAlign: 'right' }}>Ad Spend</th>
                  <th style={{ textAlign: 'right' }}>Rev Attributed</th>
                  <th style={{ textAlign: 'right' }}>ROAS</th>
                  <th style={{ textAlign: 'right' }}>ACoS</th>
                </tr>
              </thead>
              <tbody>
                {data.by_sku.slice(0, 15).map((row, i) => (
                  <tr key={row.sku_id}>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--color-accent-light)' }}>{row.sku_code}</td>
                    <td style={{ textAlign: 'right', color: '#f97316', fontSize: '0.85rem' }}>{fmtINR(row.ad_spend)}</td>
                    <td style={{ textAlign: 'right', color: '#22c55e', fontSize: '0.85rem' }}>{fmtINR(row.revenue_attributed)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, color: roasColor(row.roas) }}>{row.roas !== null ? `${row.roas}×` : '—'}</span>
                    </td>
                    <td style={{ textAlign: 'right', fontSize: '0.85rem', color: row.acos > 30 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                      {row.acos !== null ? `${row.acos}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// TAB 3 — High-Burn SKU Report
// ════════════════════════════════════════════════════════════════════════════════
function HighBurnTab({ dates, onDatesChange }) {
  const [data,      setData]      = useState([]);
  const [counts,    setCounts]    = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [acosThresh,setAcosThresh]= useState(30);
  const [deplRatio, setDeplRatio] = useState(2.0);

  const load = useCallback(async (d = dates) => {
    setLoading(true);
    try {
      const r = await profitabilityApi.highBurn({ ...d, acos_threshold: acosThresh, depletion_ratio: deplRatio });
      setData(r.data || []);
      setCounts(r.counts);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [dates, acosThresh, deplRatio]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      {/* Info box explaining the signals */}
      <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.18)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: '0.8rem', display: 'flex', gap: 10 }}>
        <Info size={14} color="var(--color-accent-light)" style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ color: 'var(--color-subtle)' }}>
          <strong style={{ color: 'var(--color-accent-light)' }}>High-Burn Signals:</strong>{' '}
          🔴 <strong>High ACoS</strong> — ad spend ÷ revenue exceeds the ACoS threshold below. &nbsp;
          🟡 <strong>Fast Depletion</strong> — last 7-day sales velocity is {deplRatio}× higher than the prior 30-day baseline.
          A SKU can carry one or both flags independently.
        </div>
      </div>

      {/* Threshold controls */}
      <div className="card" style={{ padding: '14px 20px', marginBottom: 20, display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="form-group" style={{ flex: '0 0 138px' }}>
          <label className="form-label">From</label>
          <input type="date" className="form-input" value={dates.from} onChange={e => onDatesChange({ ...dates, from: e.target.value })} />
        </div>
        <div className="form-group" style={{ flex: '0 0 138px' }}>
          <label className="form-label">To</label>
          <input type="date" className="form-input" value={dates.to} onChange={e => onDatesChange({ ...dates, to: e.target.value })} />
        </div>
        <div className="form-group" style={{ flex: '0 0 150px' }}>
          <label className="form-label">ACoS Threshold %</label>
          <input type="number" className="form-input" min="1" max="200" step="1" value={acosThresh} onChange={e => setAcosThresh(e.target.value)} />
        </div>
        <div className="form-group" style={{ flex: '0 0 160px' }}>
          <label className="form-label">Depletion Ratio ×</label>
          <input type="number" className="form-input" min="1" max="10" step="0.5" value={deplRatio} onChange={e => setDeplRatio(e.target.value)} />
        </div>
        <button id="btn-run-highburn" className="btn btn-primary btn-sm" onClick={() => load(dates)} disabled={loading} style={{ alignSelf: 'flex-end', minWidth: 90, justifyContent: 'center' }}>
          {loading ? <Loader size={13} className="animate-spin" /> : <Flame size={13} />} Analyse
        </button>
      </div>

      {/* Count summary */}
      {counts && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          {[
            { label: 'Total Flagged',    value: counts.total,           color: '#f97316', bg: 'rgba(249,115,22,0.1)' },
            { label: 'Both Signals',     value: counts.both,            color: '#ef4444', bg: 'rgba(239,68,68,0.1)'  },
            { label: 'High ACoS only',   value: counts.acos_only,       color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
            { label: 'Fast Depletion',   value: counts.depletion_only,  color: '#6366f1', bg: 'rgba(99,102,241,0.1)' },
          ].map(s => (
            <div key={s.label} style={{ flex: '1 1 120px', background: s.bg, border: `1px solid ${s.color}30`, borderRadius: 10, padding: '10px 14px' }}>
              <div style={{ fontSize: '0.67rem', color: s.color, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: '1.4rem', color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="loader" /></div>
      ) : data.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-state-icon" style={{ background: 'rgba(34,197,94,0.1)' }}>
            <Flame size={26} color="var(--color-success)" />
          </div>
          <h3>No high-burning SKUs detected</h3>
          <p>All SKUs are within the configured ACoS and depletion thresholds. Try loosening the thresholds above.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Signals</th>
                <th>SKU</th>
                <th style={{ textAlign: 'right' }}>Revenue</th>
                <th style={{ textAlign: 'right' }}>Ad Spend</th>
                <th style={{ textAlign: 'right' }}>ACoS</th>
                <th style={{ textAlign: 'right' }}>ROAS</th>
                <th>Depletion</th>
              </tr>
            </thead>
            <tbody>
              {data.map(row => (
                <tr key={row.sku_id} style={{ background: (row.flag_acos && row.flag_depletion) ? 'rgba(239,68,68,0.035)' : undefined }}>
                  <td>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {row.flag_acos      && <span className="badge badge-danger"  style={{ fontSize: '0.65rem' }}>🔴 High ACoS</span>}
                      {row.flag_depletion && <span className="badge badge-warning" style={{ fontSize: '0.65rem' }}>🟡 Depleting Fast</span>}
                    </div>
                  </td>
                  <td style={{ maxWidth: 220 }}>
                    <div style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--color-accent-light)' }} className="truncate" title={row.sku_code}>{row.sku_code}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--color-muted)' }} className="truncate" title={row.sku_name}>{row.sku_name}</div>
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'Outfit, sans-serif', fontWeight: 600 }}>{fmtINR(row.revenue)}</td>
                  <td style={{ textAlign: 'right', color: '#f97316', fontSize: '0.85rem' }}>{fmtINR(row.ad_spend)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, color: row.acos > acosThresh ? 'var(--color-danger)' : 'var(--color-success)' }}>
                      {row.acos !== null ? `${row.acos}%` : '—'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 600, color: roasColor(row.roas) }}>
                      {row.roas !== null ? `${row.roas}×` : '—'}
                    </span>
                  </td>
                  <td>
                    {row.depletion_ratio !== null ? (
                      <div style={{ fontSize: '0.78rem' }}>
                        <span style={{ color: row.flag_depletion ? 'var(--color-warning)' : 'var(--color-muted)', fontWeight: 600 }}>
                          {row.depletion_ratio}× baseline
                        </span>
                        <div style={{ fontSize: '0.68rem', color: 'var(--color-muted)' }}>
                          {row.recent_vel}/d now vs {row.baseline_vel}/d avg
                        </div>
                      </div>
                    ) : <span style={{ color: 'var(--color-muted)', fontSize: '0.75rem' }}>No baseline</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// Main Profitability Page
// ════════════════════════════════════════════════════════════════════════════════
const TABS = [
  { id: 'profit',   label: 'SKU Profitability', icon: DollarSign  },
  { id: 'roas',     label: 'ROAS & Ad Spend',   icon: BarChart2   },
  { id: 'highburn', label: 'High-Burn Report',  icon: Flame       },
];

export default function Profitability() {
  const [tab,       setTab]       = useState('profit');
  const [dates,     setDates]     = useState(thisYear());
  const [platforms, setPlatforms] = useState([]);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    profitabilityApi.platformSettings().then(setPlatforms).catch(() => {});
  }, []);

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1>Profitability</h1>
          <p>Net profit per SKU, ROAS analytics, and high-burn detection</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <ExportMenu filename={`profitability_${tab}_report`} />
          <button id="btn-platform-settings" className="btn btn-secondary" onClick={() => setShowSettings(true)}>
            <Settings2 size={14} /> Platform Costs
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', marginBottom: 20, gap: 0 }}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} id={`tab-profit-${id}`}
            onClick={() => setTab(id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '10px 22px', background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '0.875rem', fontWeight: 600,
              color: tab === id ? 'var(--color-accent-light)' : 'var(--color-muted)',
              borderBottom: `2px solid ${tab === id ? 'var(--color-accent)' : 'transparent'}`,
              marginBottom: -1, transition: 'all 0.15s',
            }}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'profit'   && <SkuProfitTab  dates={dates} onDatesChange={setDates} />}
      {tab === 'roas'     && <RoasTab       dates={dates} onDatesChange={setDates} />}
      {tab === 'highburn' && <HighBurnTab   dates={dates} onDatesChange={setDates} />}

      {/* Platform Settings Modal */}
      {showSettings && platforms.length > 0 && (
        <PlatformSettingsModal
          platforms={platforms}
          onClose={() => setShowSettings(false)}
          onSaved={() => profitabilityApi.platformSettings().then(setPlatforms).catch(() => {})}
        />
      )}

      {showSettings && platforms.length === 0 && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 360, textAlign: 'center' }}>
            <Settings2 size={36} color="var(--color-muted)" style={{ marginBottom: 12 }} />
            <h2 style={{ fontSize: '1rem', marginBottom: 8 }}>No platforms found</h2>
            <p style={{ fontSize: '0.82rem', color: 'var(--color-muted)', marginBottom: 16 }}>
              Add platforms in the Data Import tab first, then configure their commission rates here.
            </p>
            <button className="btn btn-primary" onClick={() => setShowSettings(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
