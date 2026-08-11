import { useState, useEffect, useCallback } from 'react';
import {
  Zap, Snail, Tag, Globe, CalendarDays,
  TrendingUp, TrendingDown, Minus, Loader, AlertCircle,
  RefreshCw, ArrowUp, ArrowDown, BarChart2, Activity,
  ChevronRight,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie,
  LineChart, Line, Legend,
} from 'recharts';
import { analyticsApi } from '../lib/api';
import { format, parseISO } from 'date-fns';
import ExportMenu from '../components/ExportMenu';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtINR(n) {
  if (!n) return '₹0';
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)}Cr`;
  if (n >= 1_00_000)    return `₹${(n / 1_00_000).toFixed(1)}L`;
  if (n >= 1_000)       return `₹${(n / 1_000).toFixed(1)}K`;
  return `₹${Math.round(n)}`;
}
function fmtFull(n) {
  return '₹' + new Intl.NumberFormat('en-IN').format(Math.round(n || 0));
}
function fmtNum(n) {
  return new Intl.NumberFormat('en-IN').format(n || 0);
}
function thisYear() {
  const y = new Date().getFullYear();
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}
function lastYear() {
  const y = new Date().getFullYear() - 1;
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

// ── Palette ───────────────────────────────────────────────────────────────────
const PALETTE = ['#6366f1','#22c55e','#f59e0b','#38bdf8','#ec4899','#a78bfa','#fb923c','#34d399'];
const PLATFORM_COLORS = {
  amazon: '#f59e0b', flipkart: '#6366f1', meesho: '#ec4899',
  myntra: '#ef4444', 'own website': '#22c55e',
};
function platformColor(name, idx) {
  return PLATFORM_COLORS[name?.toLowerCase()] || PALETTE[idx % PALETTE.length];
}

// ── Delta badge ───────────────────────────────────────────────────────────────
function Delta({ value, suffix = '%' }) {
  if (value === null || value === undefined)
    return <span style={{ color: 'var(--color-muted)', fontSize: '0.75rem' }}>—</span>;
  const positive = value > 0;
  const color = value === 0 ? 'var(--color-muted)' : positive ? 'var(--color-success)' : 'var(--color-danger)';
  const Icon  = value === 0 ? Minus : positive ? ArrowUp : ArrowDown;
  const bg    = value === 0
    ? 'rgba(100,116,139,0.1)'
    : positive
    ? 'rgba(34,197,94,0.12)'
    : 'rgba(239,68,68,0.12)';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize: '0.75rem', fontWeight: 700, color,
      background: bg, padding: '2px 8px', borderRadius: 99,
    }}>
      <Icon size={11} /> {Math.abs(value).toFixed(1)}{suffix}
    </span>
  );
}

// ── Custom Tooltip ─────────────────────────────────────────────────────────────
function BaseTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--color-surface)', border: '1px solid var(--color-border)',
      borderRadius: 10, padding: '10px 14px', fontSize: '0.8rem',
      boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
    }}>
      <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--color-accent-light)' }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 3 }}>
          <span style={{ color: 'var(--color-muted)' }}>{p.name}</span>
          <span style={{ fontWeight: 600, color: p.fill || p.color }}>
            {p.name?.toLowerCase().includes('revenue') ? fmtINR(p.value) : fmtNum(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Section Loader ─────────────────────────────────────────────────────────────
function SectionLoader() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '72px 24px', gap: 12 }}>
      <div className="loader" style={{ width: 32, height: 32, borderWidth: 3 }} />
      <span style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>Loading analytics…</span>
    </div>
  );
}

// ── Empty State ────────────────────────────────────────────────────────────────
function EmptyState({ icon: Icon, msg }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 24px', gap: 14 }}>
      <div style={{
        width: 72, height: 72, borderRadius: '50%',
        background: 'var(--color-surface-3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--color-muted)',
      }}>
        <Icon size={30} />
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 4 }}>No data for this range</div>
        <div style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>{msg || 'Import sales orders to see analytics.'}</div>
      </div>
    </div>
  );
}

// ── Section Header ─────────────────────────────────────────────────────────────
function SectionHeader({ icon: Icon, color = 'var(--color-accent)', title, subtitle, actions }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10, flexShrink: 0,
          background: `${color}18`, border: `1px solid ${color}30`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color,
        }}>
          <Icon size={18} />
        </div>
        <div>
          <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: '1rem', color: 'var(--color-text)' }}>{title}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginTop: 1 }}>{subtitle}</div>
        </div>
      </div>
      {actions && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>{actions}</div>}
    </div>
  );
}

// ── Date Filter Bar ────────────────────────────────────────────────────────────
function DateBar({ dates, onChange, onApply, loading }) {
  const presets = [
    { label: 'This Year',  d: thisYear() },
    { label: 'Last Year',  d: lastYear() },
    { label: 'Last 30d',   d: (() => { const t = new Date(), f = new Date(t); f.setDate(f.getDate()-29); return { from: f.toISOString().slice(0,10), to: t.toISOString().slice(0,10) }; })() },
    { label: 'Last 90d',   d: (() => { const t = new Date(), f = new Date(t); f.setDate(f.getDate()-89); return { from: f.toISOString().slice(0,10), to: t.toISOString().slice(0,10) }; })() },
  ];

  return (
    <div style={{
      background: 'var(--color-surface)', border: '1px solid var(--color-border)',
      borderRadius: 12, padding: '14px 20px', marginBottom: 20,
      display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap',
    }}>
      {[{ label: 'From', key: 'from' }, { label: 'To', key: 'to' }].map(({ label, key }) => (
        <div key={key} className="form-group" style={{ flex: '0 0 148px' }}>
          <label className="form-label">{label}</label>
          <input type="date" className="form-input" value={dates[key]}
            onChange={e => onChange({ ...dates, [key]: e.target.value })}
            style={{ padding: '8px 12px' }} />
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {presets.map(({ label, d }) => (
          <button key={label} className="btn btn-secondary btn-sm"
            onClick={() => { onChange(d); setTimeout(() => onApply(d), 0); }}>
            {label}
          </button>
        ))}
        <button id="btn-apply-dates" className="btn btn-primary btn-sm"
          style={{ minWidth: 90, justifyContent: 'center' }}
          onClick={() => onApply(dates)}>
          {loading ? <Loader size={13} className="animate-spin" /> : <RefreshCw size={13} />} Apply
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// TAB 1 — Fast Movers
// ════════════════════════════════════════════════════════════════════════════════
function FastMovers({ dates }) {
  const [data,    setData]    = useState([]);
  const [loading, setLoading] = useState(false);
  const [limit,   setLimit]   = useState(10);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await analyticsApi.velocity({ ...dates, limit }); setData(r.data || []); }
    catch { /* silent */ }
    finally { setLoading(false); }
  }, [dates, limit]);

  useEffect(() => { load(); }, [load]);

  const maxV = Math.max(...data.map(d => d.velocity), 0.01);

  return (
    <div>
      <SectionHeader
        icon={Zap}
        color="#f59e0b"
        title="Fast-Moving SKUs"
        subtitle="Ranked by sales velocity — units sold per day"
        actions={
          <select className="form-input" value={limit} onChange={e => setLimit(e.target.value)}
            style={{ width: 110, padding: '7px 10px', fontSize: '0.82rem' }}>
            {[5,10,15,20,50].map(n => <option key={n} value={n}>Top {n}</option>)}
          </select>
        }
      />

      {loading ? <SectionLoader /> : data.length === 0 ? <EmptyState icon={Zap} /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 24, alignItems: 'start' }}>
          {/* Horizontal bar chart */}
          <div style={{ background: 'var(--color-surface-2)', borderRadius: 12, padding: '16px 8px 16px 0', border: '1px solid var(--color-border)' }}>
            <ResponsiveContainer width="100%" height={Math.max(280, data.length * 46)}>
              <BarChart data={data} layout="vertical" margin={{ left: 12, right: 24, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                <XAxis type="number" tick={{ fill: 'var(--color-muted)', fontSize: 10 }}
                  tickFormatter={v => `${v}/d`} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="sku_code"
                  tick={{ fill: 'var(--color-subtle)', fontSize: 10.5 }}
                  width={110}
                  tickFormatter={str => str && str.length > 13 ? `${str.slice(0, 11)}…` : str}
                  axisLine={false} tickLine={false} />
                <Tooltip content={<BaseTooltip />} cursor={{ fill: 'rgba(99,102,241,0.06)' }} />
                <Bar dataKey="velocity" name="Units/day" radius={[0,5,5,0]} maxBarSize={20}>
                  {data.map((entry, i) => {
                    const ratio = entry.velocity / maxV;
                    const color = ratio > 0.7 ? '#22c55e' : ratio > 0.35 ? '#f59e0b' : '#6366f1';
                    return <Cell key={i} fill={color} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Table */}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 32 }}>#</th>
                  <th>SKU</th>
                  <th style={{ textAlign: 'right' }}>Velocity</th>
                  <th style={{ textAlign: 'right' }}>Units</th>
                  <th style={{ textAlign: 'right' }}>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row, i) => {
                  const ratio = row.velocity / maxV;
                  const color = ratio > 0.7 ? 'var(--color-success)' : ratio > 0.35 ? 'var(--color-warning)' : 'var(--color-accent-light)';
                  return (
                    <tr key={row.sku_id}>
                      <td style={{ color: 'var(--color-muted)', fontSize: '0.72rem', fontWeight: 600 }}>{i + 1}</td>
                      <td style={{ maxWidth: 160, overflow: 'hidden' }}>
                        <div style={{ fontFamily: 'monospace', fontSize: '0.77rem', color: 'var(--color-accent-light)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.sku_code}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--color-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.sku_name}</div>
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: '0.9rem', color }}>{row.velocity}</span>
                        <span style={{ fontSize: '0.68rem', color: 'var(--color-muted)' }}>/d</span>
                      </td>
                      <td style={{ textAlign: 'right', fontSize: '0.83rem', fontWeight: 600 }}>{fmtNum(row.units)}</td>
                      <td style={{ textAlign: 'right', fontSize: '0.83rem' }}>{fmtINR(row.revenue)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// TAB 2 — Slow Movers
// ════════════════════════════════════════════════════════════════════════════════
function SlowMovers({ dates }) {
  const [data,      setData]      = useState([]);
  const [zeroCount, setZeroCount] = useState(0);
  const [loading,   setLoading]   = useState(false);
  const [zeroOnly,  setZeroOnly]  = useState(false);
  const [limit,     setLimit]     = useState(15);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await analyticsApi.slowMovers({ ...dates, limit, zero_only: zeroOnly ? 'true' : 'false' });
      setData(r.data || []);
      setZeroCount(r.zero_count || 0);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [dates, limit, zeroOnly]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <SectionHeader
        icon={Snail}
        color="var(--color-warning)"
        title="Slow-Moving SKUs"
        subtitle={
          zeroCount > 0
            ? <span><span style={{ color: 'var(--color-danger)', fontWeight: 700 }}>{zeroCount} SKUs</span> with zero sales · sorted by least sold</span>
            : 'Sorted by least units sold'
        }
        actions={
          <>
            <button id="btn-toggle-zero" className={`btn btn-sm ${zeroOnly ? 'btn-danger' : 'btn-secondary'}`}
              onClick={() => setZeroOnly(v => !v)}>
              {zeroOnly ? '⚠ Zero sales only' : 'Show zero sales only'}
            </button>
            <select className="form-input" value={limit} onChange={e => setLimit(e.target.value)}
              style={{ width: 90, padding: '7px 10px', fontSize: '0.82rem' }}>
              {[10,15,20,30,50].map(n => <option key={n} value={n}>Show {n}</option>)}
            </select>
          </>
        }
      />

      {loading ? <SectionLoader /> : data.length === 0 ? (
        <EmptyState icon={Snail} msg="No slow-moving SKUs found — great news!" />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 32 }}>#</th>
                <th>SKU</th>
                <th>Brand</th>
                <th style={{ textAlign: 'right' }}>Units Sold</th>
                <th style={{ textAlign: 'right' }}>Velocity</th>
                <th style={{ textAlign: 'right' }}>Revenue</th>
                <th>Risk</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => {
                const isZero = row.units === 0;
                const risk   = isZero ? 'Dead Stock' : row.velocity < 0.1 ? 'High' : 'Moderate';
                const riskCl = isZero ? 'badge-danger' : row.velocity < 0.1 ? 'badge-warning' : 'badge-muted';
                return (
                  <tr key={row.sku_id || i}
                    style={{ background: isZero ? 'rgba(239,68,68,0.03)' : undefined }}>
                    <td style={{ color: 'var(--color-muted)', fontSize: '0.72rem', fontWeight: 600 }}>{i + 1}</td>
                    <td style={{ maxWidth: 180, overflow: 'hidden' }}>
                      <div style={{ fontFamily: 'monospace', fontSize: '0.77rem', color: isZero ? 'var(--color-danger)' : 'var(--color-accent-light)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.sku_code}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--color-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.sku_name}</div>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--color-subtle)' }}>{row.brand || '—'}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'Outfit, sans-serif', fontWeight: 700, color: isZero ? 'var(--color-danger)' : 'var(--color-text)' }}>
                      {fmtNum(row.units)}
                    </td>
                    <td style={{ textAlign: 'right', fontSize: '0.82rem', color: 'var(--color-muted)' }}>
                      {row.velocity.toFixed(2)}/day
                    </td>
                    <td style={{ textAlign: 'right', fontSize: '0.82rem' }}>
                      {isZero ? <span style={{ color: 'var(--color-muted)' }}>—</span> : fmtINR(row.revenue)}
                    </td>
                    <td><span className={`badge ${riskCl}`}>{risk}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// TAB 3 — Brand Analysis
// ════════════════════════════════════════════════════════════════════════════════
function BrandSales({ dates }) {
  const [data,    setData]    = useState([]);
  const [total,   setTotal]   = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await analyticsApi.brandSales(dates);
      setData(r.data || []);
      setTotal(r.total_revenue || 0);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [dates]);

  useEffect(() => { load(); }, [load]);

  const pieData = data.slice(0, 8);

  return (
    <div>
      <SectionHeader
        icon={Tag}
        color="#a78bfa"
        title="Brand-wise Sales"
        subtitle={`Revenue share by brand · Total: ${fmtFull(total)}`}
      />

      {loading ? <SectionLoader /> : data.length === 0 ? <EmptyState icon={Tag} /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px,300px) minmax(0,1fr)', gap: 24, alignItems: 'start' }}>
          {/* Donut + legend */}
          <div style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 14, padding: 20 }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Share Breakdown</div>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} dataKey="revenue" nameKey="brand_name"
                  cx="50%" cy="50%" innerRadius={60} outerRadius={95}
                  paddingAngle={2} strokeWidth={0}>
                  {pieData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                </Pie>
                <Tooltip
                  formatter={(v) => [fmtFull(v), 'Revenue']}
                  contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: '0.8rem' }} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
              {pieData.map((d, i) => (
                <div key={d.brand_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: PALETTE[i % PALETTE.length], flexShrink: 0 }} />
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-subtle)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.brand_name}</span>
                  </div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: PALETTE[i % PALETTE.length], flexShrink: 0 }}>{d.share_pct}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 28 }}>#</th>
                  <th>Brand</th>
                  <th style={{ textAlign: 'right' }}>Revenue</th>
                  <th style={{ textAlign: 'right' }}>Units</th>
                  <th style={{ textAlign: 'right' }}>Orders</th>
                  <th style={{ textAlign: 'right' }}>SKUs</th>
                  <th style={{ minWidth: 100 }}>Share</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row, i) => (
                  <tr key={row.brand_id}>
                    <td style={{ color: 'var(--color-muted)', fontSize: '0.72rem', fontWeight: 600 }}>{i + 1}</td>
                    <td style={{ fontWeight: 500 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 9, height: 9, borderRadius: 2, background: PALETTE[i % PALETTE.length], flexShrink: 0 }} />
                        {row.brand_name}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'Outfit, sans-serif', fontWeight: 700 }}>{fmtINR(row.revenue)}</td>
                    <td style={{ textAlign: 'right', fontSize: '0.85rem' }}>{fmtNum(row.units)}</td>
                    <td style={{ textAlign: 'right', fontSize: '0.85rem', color: 'var(--color-muted)' }}>{fmtNum(row.orders)}</td>
                    <td style={{ textAlign: 'right', fontSize: '0.85rem', color: 'var(--color-muted)' }}>{row.sku_count}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 5, background: 'var(--color-surface-3)', borderRadius: 99, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${row.share_pct}%`, background: PALETTE[i % PALETTE.length], borderRadius: 99 }} />
                        </div>
                        <span style={{ fontSize: '0.7rem', color: 'var(--color-muted)', minWidth: 30, textAlign: 'right' }}>{row.share_pct}%</span>
                      </div>
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
// TAB 4 — Platform Comparison
// ════════════════════════════════════════════════════════════════════════════════
function PlatformComparison({ dates }) {
  const [data,    setData]    = useState([]);
  const [total,   setTotal]   = useState(0);
  const [metric,  setMetric]  = useState('revenue');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await analyticsApi.platforms(dates);
      setData(r.data || []);
      setTotal(r.total_revenue || 0);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [dates]);

  useEffect(() => { load(); }, [load]);

  const metricButtons = [
    ['revenue','Revenue'], ['units','Units'], ['orders','Orders'], ['avg_order_value','Avg Order'],
  ];

  const chartData = data.map(d => ({ ...d, name: d.platform_name }));

  return (
    <div>
      <SectionHeader
        icon={Globe}
        color="var(--color-info)"
        title="Platform Comparison"
        subtitle={`Side-by-side across all channels · Total: ${fmtFull(total)}`}
        actions={
          <div style={{ display: 'flex', background: 'var(--color-surface-3)', borderRadius: 8, padding: 3, gap: 2 }}>
            {metricButtons.map(([k, l]) => (
              <button key={k}
                className={`btn btn-sm ${metric === k ? 'btn-primary' : ''}`}
                style={{
                  padding: '5px 12px', fontSize: '0.78rem',
                  background: metric === k ? 'var(--color-accent)' : 'transparent',
                  color: metric === k ? '#fff' : 'var(--color-muted)',
                  border: 'none',
                }}
                onClick={() => setMetric(k)}>{l}</button>
            ))}
          </div>
        }
      />

      {loading ? <SectionLoader /> : data.length === 0 ? <EmptyState icon={Globe} /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,0.9fr)', gap: 24, alignItems: 'start' }}>
          {/* Bar chart */}
          <div style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 14, padding: '20px 16px 12px' }}>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData} margin={{ left: 0, right: 16, top: 0, bottom: 28 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: 'var(--color-muted)', fontSize: 11 }}
                  axisLine={false} tickLine={false} angle={-12} textAnchor="end" />
                <YAxis
                  tickFormatter={metric === 'revenue' || metric === 'avg_order_value' ? fmtINR : undefined}
                  tick={{ fill: 'var(--color-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<BaseTooltip />} cursor={{ fill: 'rgba(99,102,241,0.05)' }} />
                <Bar dataKey={metric}
                  name={metricButtons.find(([k]) => k === metric)?.[1] || metric}
                  radius={[6,6,0,0]} maxBarSize={52}>
                  {chartData.map((entry, i) => <Cell key={i} fill={platformColor(entry.platform_name, i)} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Platform cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {data.map((p, i) => {
              const color = platformColor(p.platform_name, i);
              return (
                <div key={p.platform_id} style={{
                  background: 'var(--color-surface-2)', borderRadius: 12,
                  border: '1px solid var(--color-border)',
                  borderLeft: `3px solid ${color}`,
                  padding: '14px 18px',
                  display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12,
                  transition: 'border-color 0.2s',
                }}>
                  <div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--color-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Platform</div>
                    <div style={{ fontWeight: 700, color, fontSize: '0.88rem' }}>{p.platform_name}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--color-muted)', marginTop: 2 }}>{p.share_pct}% of total</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--color-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Revenue</div>
                    <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: '0.95rem' }}>{fmtINR(p.revenue)}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--color-muted)', marginTop: 2 }}>{fmtNum(p.orders)} orders</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--color-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Units / AOV</div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 600 }}>{fmtNum(p.units)}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--color-muted)', marginTop: 2 }}>AOV {fmtINR(p.avg_order_value)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// TAB 5 — Date Comparison
// ════════════════════════════════════════════════════════════════════════════════
const COMPARE_METRICS = [
  { key: 'revenue',         label: 'Revenue',         fmt: fmtFull },
  { key: 'units',           label: 'Units',            fmt: fmtNum  },
  { key: 'orders',          label: 'Orders',           fmt: fmtNum  },
  { key: 'avg_order_value', label: 'Avg Order Value',  fmt: fmtFull },
  { key: 'revenue_per_day', label: 'Revenue / Day',    fmt: fmtFull },
  { key: 'unique_skus',     label: 'Unique SKUs',      fmt: fmtNum  },
];

function DateComparison() {
  const now = new Date();
  const y   = now.getFullYear();
  const [rangeA, setRangeA] = useState({ from: `${y}-01-01`, to: `${y}-06-30`, label: 'Range A' });
  const [rangeB, setRangeB] = useState({ from: `${y-1}-01-01`, to: `${y-1}-06-30`, label: 'Range B' });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  async function runComparison() {
    if (!rangeA.from || !rangeA.to || !rangeB.from || !rangeB.to) { setError('All 4 dates required.'); return; }
    setError(''); setLoading(true);
    try {
      const r = await analyticsApi.dateCompare({ from_a: rangeA.from, to_a: rangeA.to, from_b: rangeB.from, to_b: rangeB.to });
      setResult(r);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  const overlayData = result ? (() => {
    const len = Math.max(result.daily_a.length, result.daily_b.length);
    return Array.from({ length: len }, (_, i) => ({
      day: `Day ${i + 1}`,
      'Range A': result.daily_a[i]?.revenue ?? null,
      'Range B': result.daily_b[i]?.revenue ?? null,
    }));
  })() : [];

  const RANGE_COLORS = ['#818cf8', '#fbbf24'];

  return (
    <div>
      <SectionHeader
        icon={CalendarDays}
        color="var(--color-success)"
        title="Date Comparison"
        subtitle="Compare two time periods side by side"
      />

      {/* Range pickers */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        {[
          { range: rangeA, setRange: setRangeA, label: 'Range A (Current)', color: '#818cf8', id: 'A' },
          { range: rangeB, setRange: setRangeB, label: 'Range B (Compare)',  color: '#fbbf24', id: 'B' },
        ].map(({ range, setRange, label, color, id }) => (
          <div key={id} style={{
            background: 'var(--color-surface-2)', borderRadius: 12,
            border: `1px solid ${color}30`, padding: '18px 20px',
          }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}60` }} />
              {label}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              {[{ l: 'From', k: 'from' }, { l: 'To', k: 'to' }].map(({ l, k }) => (
                <div key={k} className="form-group">
                  <label className="form-label">{l}</label>
                  <input type="date" className="form-input" value={range[k]}
                    onChange={e => setRange(r => ({ ...r, [k]: e.target.value }))} />
                </div>
              ))}
            </div>
            <input className="form-input" placeholder="Label (optional)" value={range.label}
              onChange={e => setRange(r => ({ ...r, label: e.target.value }))}
              style={{ fontSize: '0.8rem', padding: '7px 10px' }} />
          </div>
        ))}
      </div>

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-danger)', fontSize: '0.82rem', marginBottom: 14, padding: '10px 14px', background: 'rgba(239,68,68,0.08)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)' }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}

      <button id="btn-run-comparison" className="btn btn-primary"
        onClick={runComparison} disabled={loading}
        style={{ marginBottom: 28, minWidth: 180, justifyContent: 'center' }}>
        {loading
          ? <><Loader size={14} className="animate-spin" /> Comparing…</>
          : <><Activity size={14} /> Run Comparison</>}
      </button>

      {result && (
        <div className="animate-fade-in">
          {/* Period info */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            {[result.range_a, result.range_b].map((r, i) => (
              <div key={i} style={{
                background: 'var(--color-surface-2)', borderRadius: 10,
                border: `1px solid ${RANGE_COLORS[i]}30`,
                padding: '12px 16px', fontSize: '0.78rem',
                borderLeft: `3px solid ${RANGE_COLORS[i]}`,
              }}>
                <div style={{ fontWeight: 700, color: RANGE_COLORS[i], marginBottom: 4 }}>
                  {i === 0 ? rangeA.label : rangeB.label}
                </div>
                <div style={{ color: 'var(--color-muted)' }}>
                  {format(parseISO(r.from), 'dd MMM yy')} → {format(parseISO(r.to), 'dd MMM yy')}
                  <span style={{ marginLeft: 8, color: RANGE_COLORS[i], fontWeight: 600 }}>{r.days} days</span>
                </div>
              </div>
            ))}
          </div>

          {/* Metric cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 24 }}>
            {COMPARE_METRICS.map(({ key, label, fmt }) => {
              const a = result.range_a[key];
              const b = result.range_b[key];
              const d = result.deltas[key];
              return (
                <div key={key} style={{
                  background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                  borderRadius: 12, padding: '16px 18px',
                  transition: 'border-color 0.2s',
                }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--color-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                    {label}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 8, marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: '0.6rem', color: RANGE_COLORS[0], marginBottom: 3, fontWeight: 600 }}>{rangeA.label}</div>
                      <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: '1rem', color: RANGE_COLORS[0] }}>{fmt(a)}</div>
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--color-border)', flexShrink: 0 }}>vs</div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.6rem', color: RANGE_COLORS[1], marginBottom: 3, fontWeight: 600 }}>{rangeB.label}</div>
                      <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: '1rem', color: RANGE_COLORS[1] }}>{fmt(b)}</div>
                    </div>
                  </div>
                  {d !== null && (
                    <div style={{ paddingTop: 8, borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6 }}>
                      <Delta value={d} />
                      <span style={{ fontSize: '0.65rem', color: 'var(--color-muted)' }}>vs prior</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Daily overlay chart */}
          {overlayData.length > 0 && (
            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 14, padding: '20px 16px' }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 16, color: 'var(--color-accent-light)' }}>Daily Revenue Overlay</div>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={overlayData} margin={{ left: 0, right: 16, top: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: 'var(--color-muted)', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tickFormatter={fmtINR} tick={{ fill: 'var(--color-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    formatter={(v, name) => [fmtFull(v), name]}
                    contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: '0.78rem' }} />
                  <Legend wrapperStyle={{ fontSize: '0.78rem', color: 'var(--color-subtle)' }} />
                  <Line type="monotone" dataKey="Range A" stroke={RANGE_COLORS[0]} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Range B" stroke={RANGE_COLORS[1]} strokeWidth={2} dot={false} strokeDasharray="5 3" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// Main Analytics Page
// ════════════════════════════════════════════════════════════════════════════════
const TABS = [
  { id: 'velocity', label: 'Fast Movers',    icon: Zap,          color: '#f59e0b', component: FastMovers         },
  { id: 'slow',     label: 'Slow Movers',    icon: Snail,        color: '#f59e0b', component: SlowMovers         },
  { id: 'brand',    label: 'Brand Analysis', icon: Tag,          color: '#a78bfa', component: BrandSales         },
  { id: 'platform', label: 'Platforms',      icon: Globe,        color: '#38bdf8', component: PlatformComparison },
  { id: 'compare',  label: 'Date Comparison',icon: CalendarDays, color: '#22c55e', component: DateComparison     },
];

export default function Analytics() {
  const [tab,     setTab]     = useState('velocity');
  const [dates,   setDates]   = useState(thisYear());
  const [loading, setLoading] = useState(false);

  const activeTab  = TABS.find(t => t.id === tab);
  const Component  = activeTab?.component;
  const needsDates = tab !== 'compare';

  return (
    <div className="animate-fade-in">
      {/* Page header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1>Analytics</h1>
          <p>Deep-dive into your sales data across SKUs, brands, and platforms</p>
        </div>
        <ExportMenu filename={`analytics_${tab}_report`} />
      </div>

      {/* Tab navigation */}
      <div style={{
        display: 'flex', gap: 4,
        background: 'var(--color-surface)', border: '1px solid var(--color-border)',
        borderRadius: 12, padding: 4, marginBottom: 20, overflowX: 'auto',
      }}>
        {TABS.map(({ id, label, icon: Icon, color }) => {
          const isActive = tab === id;
          return (
            <button key={id} id={`tab-analytics-${id}`}
              onClick={() => setTab(id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '9px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontSize: '0.83rem', fontWeight: 600, whiteSpace: 'nowrap',
                transition: 'all 0.15s',
                background: isActive ? `${color}18` : 'transparent',
                color: isActive ? color : 'var(--color-muted)',
                boxShadow: isActive ? `inset 0 0 0 1px ${color}30` : 'none',
              }}>
              <Icon size={14} />
              {label}
            </button>
          );
        })}
      </div>

      {/* Date filter bar */}
      {needsDates && (
        <DateBar
          dates={dates}
          onChange={setDates}
          onApply={(d) => setDates(d)}
          loading={loading}
        />
      )}

      {/* Section content */}
      <div style={{
        background: 'var(--color-surface)', border: '1px solid var(--color-border)',
        borderRadius: 14, padding: 24,
      }}>
        {Component && <Component dates={dates} />}
      </div>
    </div>
  );
}
