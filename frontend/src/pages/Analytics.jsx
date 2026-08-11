import { useState, useEffect, useCallback } from 'react';
import {
  BarChart2, Zap, Snail, Tag, Globe, CalendarDays,
  TrendingUp, TrendingDown, Minus, Loader, AlertCircle,
  RefreshCw, ArrowRight, ArrowUp, ArrowDown,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, Legend,
  LineChart, Line, ComposedChart,
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

// ── Colors ────────────────────────────────────────────────────────────────────
const PALETTE = ['#6366f1','#22c55e','#f59e0b','#38bdf8','#ec4899','#a78bfa','#fb923c','#34d399'];

const PLATFORM_COLORS = {
  amazon: '#f59e0b', flipkart: '#6366f1', meesho: '#ec4899',
  myntra: '#ef4444', 'own website': '#22c55e',
};
function platformColor(name, idx) {
  return PLATFORM_COLORS[name?.toLowerCase()] || PALETTE[idx % PALETTE.length];
}

// ── Delta badge ───────────────────────────────────────────────────────────────
function Delta({ value, suffix = '%', inverse = false }) {
  if (value === null || value === undefined) return <span style={{ color: 'var(--color-muted)', fontSize: '0.75rem' }}>—</span>;
  const good  = inverse ? value < 0 : value > 0;
  const color = value === 0 ? 'var(--color-muted)' : good ? 'var(--color-success)' : 'var(--color-danger)';
  const Icon  = value === 0 ? Minus : value > 0 ? ArrowUp : ArrowDown;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: '0.78rem', fontWeight: 700, color }}>
      <Icon size={12} /> {Math.abs(value).toFixed(1)}{suffix}
    </span>
  );
}

// ── Global date bar ───────────────────────────────────────────────────────────
function DateBar({ dates, onChange, onApply, loading }) {
  return (
    <div className="card" style={{ padding: '14px 20px', marginBottom: 20, display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
      <div className="form-group" style={{ flex: '0 0 140px' }}>
        <label className="form-label">From</label>
        <input type="date" className="form-input" value={dates.from} onChange={e => onChange({ ...dates, from: e.target.value })} />
      </div>
      <div className="form-group" style={{ flex: '0 0 140px' }}>
        <label className="form-label">To</label>
        <input type="date" className="form-input" value={dates.to} onChange={e => onChange({ ...dates, to: e.target.value })} />
      </div>
      {[
        { label: 'This Year',  d: thisYear() },
        { label: 'Last Year',  d: lastYear() },
        { label: 'Last 30d',   d: (() => { const t = new Date(); const f = new Date(t); f.setDate(f.getDate()-29); return { from: f.toISOString().slice(0,10), to: t.toISOString().slice(0,10) }; })() },
        { label: 'Last 90d',   d: (() => { const t = new Date(); const f = new Date(t); f.setDate(f.getDate()-89); return { from: f.toISOString().slice(0,10), to: t.toISOString().slice(0,10) }; })() },
      ].map(({ label, d }) => (
        <button key={label} className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-end' }}
          onClick={() => { onChange(d); setTimeout(() => onApply(d), 0); }}>
          {label}
        </button>
      ))}
      <button id="btn-apply-dates" className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-end', minWidth: 90, justifyContent: 'center' }}
        onClick={() => onApply(dates)}>
        {loading ? <Loader size={13} className="animate-spin" /> : <RefreshCw size={13} />} Apply
      </button>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({ icon: Icon, msg }) {
  return (
    <div className="empty-state" style={{ padding: '48px 0' }}>
      <div className="empty-state-icon"><Icon size={26} /></div>
      <h3 style={{ fontSize: '0.9rem' }}>No data for this range</h3>
      <p>{msg || 'Import sales orders to see analytics.'}</p>
    </div>
  );
}

// ── Section loader ────────────────────────────────────────────────────────────
function SectionLoader() {
  return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="loader" /></div>;
}

// ── Custom Tooltip (shared) ────────────────────────────────────────────────────
function BaseTooltip({ active, payload, label, keys }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '10px 14px', fontSize: '0.8rem' }}>
      <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--color-accent-light)' }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 3 }}>
          <span style={{ color: 'var(--color-muted)' }}>{p.name}</span>
          <span style={{ fontWeight: 600, color: p.fill || p.color }}>{p.name?.toLowerCase().includes('revenue') ? fmtINR(p.value) : fmtNum(p.value)}</span>
        </div>
      ))}
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: '1rem', marginBottom: 2 }}>Fast-Moving SKUs</h3>
          <p style={{ fontSize: '0.78rem', color: 'var(--color-muted)' }}>Ranked by sales velocity (units sold per day)</p>
        </div>
        <select className="form-input" value={limit} onChange={e => setLimit(e.target.value)} style={{ width: 110, padding: '6px 10px' }}>
          {[5,10,15,20,50].map(n => <option key={n} value={n}>Top {n}</option>)}
        </select>
      </div>

      {loading ? <SectionLoader /> : data.length === 0 ? <EmptyState icon={Zap} /> : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
          {/* Horizontal bar chart */}
          <ResponsiveContainer width="100%" height={Math.max(300, data.length * 48)}>
            <BarChart data={data} layout="vertical" margin={{ left: 10, right: 24, top: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
              <XAxis type="number" tick={{ fill: 'var(--color-muted)', fontSize: 11 }} tickFormatter={v => `${v}/d`} axisLine={false} tickLine={false} />
              <YAxis
                type="category"
                dataKey="sku_code"
                tick={{ fill: 'var(--color-subtle)', fontSize: 11 }}
                width={120}
                tickFormatter={str => (str && str.length > 15 ? `${str.slice(0, 13)}…` : str)}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<BaseTooltip />} cursor={{ fill: 'rgba(99,102,241,0.05)' }} />
              <Bar dataKey="velocity" name="Units/day" radius={[0,4,4,0]} maxBarSize={22}>
                {data.map((entry, i) => {
                  const ratio = entry.velocity / maxV;
                  const color = ratio > 0.7 ? '#22c55e' : ratio > 0.35 ? '#f59e0b' : '#6366f1';
                  return <Cell key={i} fill={color} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Table */}
          <div className="table-wrap" style={{ border: 'none', borderRadius: 0, overflow: 'visible' }}>
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
                      <td style={{ color: 'var(--color-muted)', fontSize: '0.75rem' }}>{i+1}</td>
                      <td>
                        <div style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--color-accent-light)' }}>{row.sku_code}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }} className="truncate">{row.sku_name}</div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: '0.95rem', color }}>{row.velocity}</span>
                        <span style={{ fontSize: '0.68rem', color: 'var(--color-muted)' }}>/day</span>
                      </td>
                      <td style={{ textAlign: 'right', fontSize: '0.85rem', fontWeight: 600 }}>{fmtNum(row.units)}</td>
                      <td style={{ textAlign: 'right', fontSize: '0.85rem' }}>{fmtINR(row.revenue)}</td>
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h3 style={{ fontSize: '1rem', marginBottom: 2 }}>Slow-Moving SKUs</h3>
          <p style={{ fontSize: '0.78rem', color: 'var(--color-muted)' }}>
            {zeroCount > 0 && <span style={{ color: 'var(--color-danger)', fontWeight: 600 }}>{zeroCount} SKUs with zero sales</span>}
            {zeroCount > 0 && ' · '} sorted by least sold
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button id="btn-toggle-zero" className={`btn btn-sm ${zeroOnly ? 'btn-danger' : 'btn-secondary'}`} onClick={() => setZeroOnly(v => !v)}>
            {zeroOnly ? '⚠ Zero sales only' : 'Show zero sales only'}
          </button>
          <select className="form-input" value={limit} onChange={e => setLimit(e.target.value)} style={{ width: 90, padding: '6px 10px' }}>
            {[10,15,20,30,50].map(n => <option key={n} value={n}>Show {n}</option>)}
          </select>
        </div>
      </div>

      {loading ? <SectionLoader /> : data.length === 0 ? <EmptyState icon={Snail} msg="No slow-moving SKUs found — great news!" /> : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
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
                const risk   = isZero ? 'Dead stock' : row.velocity < 0.1 ? 'High' : 'Moderate';
                const riskCl = isZero ? 'badge-danger' : row.velocity < 0.1 ? 'badge-warning' : 'badge-muted';
                return (
                  <tr key={row.sku_id || i} style={{ background: isZero ? 'rgba(239,68,68,0.025)' : undefined }}>
                    <td style={{ color: 'var(--color-muted)', fontSize: '0.75rem' }}>{i+1}</td>
                    <td>
                      <div style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: isZero ? 'var(--color-danger)' : 'var(--color-accent-light)' }}>{row.sku_code}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }} className="truncate">{row.sku_name}</div>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--color-subtle)' }}>{row.brand || '—'}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'Outfit, sans-serif', fontWeight: 700, color: isZero ? 'var(--color-danger)' : 'var(--color-text)' }}>
                      {fmtNum(row.units)}
                    </td>
                    <td style={{ textAlign: 'right', fontSize: '0.82rem', color: 'var(--color-muted)' }}>
                      {row.velocity.toFixed(2)}/day
                    </td>
                    <td style={{ textAlign: 'right', fontSize: '0.82rem' }}>{isZero ? <span style={{ color: 'var(--color-muted)' }}>—</span> : fmtINR(row.revenue)}</td>
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
  const [data,  setData]    = useState([]);
  const [total, setTotal]   = useState(0);
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
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: '1rem', marginBottom: 2 }}>Brand-wise Sales</h3>
        <p style={{ fontSize: '0.78rem', color: 'var(--color-muted)' }}>Revenue share by brand · Total: {fmtFull(total)}</p>
      </div>

      {loading ? <SectionLoader /> : data.length === 0 ? <EmptyState icon={Tag} /> : (
        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 24, alignItems: 'start' }}>
          {/* Donut pie */}
          <div>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={pieData} dataKey="revenue" nameKey="brand_name"
                  cx="50%" cy="50%" innerRadius={65} outerRadius={110}
                  paddingAngle={2} strokeWidth={0}>
                  {pieData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => [fmtFull(v), 'Revenue']} contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: '0.8rem' }} />
              </PieChart>
            </ResponsiveContainer>
            {/* Pie legend */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
              {pieData.map((d, i) => (
                <div key={d.brand_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: PALETTE[i % PALETTE.length], flexShrink: 0 }} />
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-subtle)' }}>{d.brand_name}</span>
                  </div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: PALETTE[i % PALETTE.length] }}>{d.share_pct}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Brand</th>
                  <th style={{ textAlign: 'right' }}>Revenue</th>
                  <th style={{ textAlign: 'right' }}>Units</th>
                  <th style={{ textAlign: 'right' }}>Orders</th>
                  <th style={{ textAlign: 'right' }}>SKUs</th>
                  <th>Share</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row, i) => (
                  <tr key={row.brand_id}>
                    <td style={{ color: 'var(--color-muted)', fontSize: '0.75rem' }}>{i+1}</td>
                    <td style={{ fontWeight: 500 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: PALETTE[i % PALETTE.length], flexShrink: 0 }} />
                        {row.brand_name}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'Outfit, sans-serif', fontWeight: 700 }}>{fmtINR(row.revenue)}</td>
                    <td style={{ textAlign: 'right', fontSize: '0.85rem' }}>{fmtNum(row.units)}</td>
                    <td style={{ textAlign: 'right', fontSize: '0.85rem', color: 'var(--color-muted)' }}>{fmtNum(row.orders)}</td>
                    <td style={{ textAlign: 'right', fontSize: '0.85rem', color: 'var(--color-muted)' }}>{row.sku_count}</td>
                    <td style={{ minWidth: 100 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 6, background: 'var(--color-surface-3)', borderRadius: 99, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${row.share_pct}%`, background: PALETTE[i % PALETTE.length], borderRadius: 99 }} />
                        </div>
                        <span style={{ fontSize: '0.72rem', color: 'var(--color-muted)', minWidth: 32, textAlign: 'right' }}>{row.share_pct}%</span>
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

  const chartData = data.map(d => ({ ...d, name: d.platform_name }));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: '1rem', marginBottom: 2 }}>Platform Comparison</h3>
          <p style={{ fontSize: '0.78rem', color: 'var(--color-muted)' }}>Side-by-side across all channels · Total: {fmtFull(total)}</p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[['revenue','Revenue'], ['units','Units'], ['orders','Orders'], ['avg_order_value','Avg Order']].map(([k, l]) => (
            <button key={k} className={`btn btn-sm ${metric === k ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setMetric(k)}>{l}</button>
          ))}
        </div>
      </div>

      {loading ? <SectionLoader /> : data.length === 0 ? <EmptyState icon={Globe} /> : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>
          {/* Bar chart */}
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ left: 0, right: 16, top: 0, bottom: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: 'var(--color-muted)', fontSize: 11 }} axisLine={false} tickLine={false} angle={-15} textAnchor="end" />
              <YAxis tickFormatter={metric === 'revenue' || metric === 'avg_order_value' ? fmtINR : undefined}
                tick={{ fill: 'var(--color-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<BaseTooltip />} cursor={{ fill: 'rgba(99,102,241,0.05)' }} />
              <Bar dataKey={metric} name={metric === 'revenue' ? 'Revenue' : metric === 'units' ? 'Units' : metric === 'orders' ? 'Orders' : 'Avg Order'} radius={[6,6,0,0]} maxBarSize={50}>
                {chartData.map((entry, i) => <Cell key={i} fill={platformColor(entry.platform_name, i)} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Platform cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {data.map((p, i) => {
              const color = platformColor(p.platform_name, i);
              return (
                <div key={p.platform_id} style={{
                  background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
                  borderLeft: `3px solid ${color}`,
                  borderRadius: 10, padding: '12px 16px',
                  display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12,
                }}>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--color-muted)', marginBottom: 3 }}>Platform</div>
                    <div style={{ fontWeight: 600, color }}>{p.platform_name}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--color-muted)' }}>{p.share_pct}% of total</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--color-muted)', marginBottom: 3 }}>Revenue</div>
                    <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: '0.95rem' }}>{fmtINR(p.revenue)}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--color-muted)' }}>{fmtNum(p.orders)} orders</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--color-muted)', marginBottom: 3 }}>Units / AOV</div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{fmtNum(p.units)}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--color-muted)' }}>AOV {fmtINR(p.avg_order_value)}</div>
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
  { key: 'revenue',         label: 'Revenue',        fmt: fmtFull },
  { key: 'units',           label: 'Units',          fmt: fmtNum  },
  { key: 'orders',          label: 'Orders',         fmt: fmtNum  },
  { key: 'avg_order_value', label: 'Avg Order Value',fmt: fmtFull },
  { key: 'revenue_per_day', label: 'Revenue / Day',  fmt: fmtFull },
  { key: 'unique_skus',     label: 'Unique SKUs',    fmt: fmtNum  },
];

function DateComparison() {
  const now   = new Date();
  const y     = now.getFullYear();
  const [rangeA, setRangeA] = useState({ from: `${y}-01-01`, to: `${y}-06-30`, label: 'Range A' });
  const [rangeB, setRangeB] = useState({ from: `${y-1}-01-01`, to: `${y-1}-06-30`, label: 'Range B' });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  async function runComparison() {
    if (!rangeA.from || !rangeA.to || !rangeB.from || !rangeB.to) { setError('All 4 dates required.'); return; }
    setError('');
    setLoading(true);
    try {
      const r = await analyticsApi.dateCompare({ from_a: rangeA.from, to_a: rangeA.to, from_b: rangeB.from, to_b: rangeB.to });
      setResult(r);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Build overlay chart (normalise day index so both ranges overlay)
  const overlayData = result ? (() => {
    const len = Math.max(result.daily_a.length, result.daily_b.length);
    const arr = [];
    for (let i = 0; i < len; i++) {
      arr.push({
        day: `Day ${i+1}`,
        'Range A Revenue': result.daily_a[i]?.revenue ?? null,
        'Range B Revenue': result.daily_b[i]?.revenue ?? null,
      });
    }
    return arr;
  })() : [];

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: '1rem', marginBottom: 2 }}>Date Comparison</h3>
        <p style={{ fontSize: '0.78rem', color: 'var(--color-muted)' }}>Compare two time periods side by side</p>
      </div>

      {/* Dual date pickers */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        {[
          { range: rangeA, setRange: setRangeA, label: 'Range A (Current)', color: '#6366f1', id: 'A' },
          { range: rangeB, setRange: setRangeB, label: 'Range B (Compare)',  color: '#f59e0b', id: 'B' },
        ].map(({ range, setRange, label, color, id }) => (
          <div key={id} style={{ background: 'var(--color-surface-2)', border: `1px solid ${color}30`, borderRadius: 12, padding: '16px 18px' }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
              {label}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div className="form-group">
                <label className="form-label">From</label>
                <input type="date" className="form-input" value={range.from} onChange={e => setRange(r => ({ ...r, from: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">To</label>
                <input type="date" className="form-input" value={range.to} onChange={e => setRange(r => ({ ...r, to: e.target.value }))} />
              </div>
            </div>
            <input className="form-input" placeholder="Label (optional)" value={range.label}
              onChange={e => setRange(r => ({ ...r, label: e.target.value }))}
              style={{ fontSize: '0.8rem', padding: '6px 10px' }} />
          </div>
        ))}
      </div>

      {error && <div style={{ color: 'var(--color-danger)', fontSize: '0.82rem', marginBottom: 12 }}>{error}</div>}

      <button id="btn-run-comparison" className="btn btn-primary" onClick={runComparison} disabled={loading} style={{ marginBottom: 24, minWidth: 160, justifyContent: 'center' }}>
        {loading ? <><Loader size={14} className="animate-spin" /> Comparing…</> : <><BarChart2 size={14} /> Run Comparison</>}
      </button>

      {result && (
        <div className="animate-fade-in">
          {/* Metric comparison grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 24 }}>
            {COMPARE_METRICS.map(({ key, label, fmt }) => {
              const a   = result.range_a[key];
              const b   = result.range_b[key];
              const d   = result.deltas[key];
              return (
                <div key={key} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, padding: '16px 18px' }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--color-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
                    {label}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: '0.62rem', color: '#6366f1', marginBottom: 2 }}>{rangeA.label}</div>
                      <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: '1.1rem', color: '#818cf8' }}>{fmt(a)}</div>
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--color-muted)', flexShrink: 0 }}>vs</div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.62rem', color: '#f59e0b', marginBottom: 2 }}>{rangeB.label}</div>
                      <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: '1.1rem', color: '#fbbf24' }}>{fmt(b)}</div>
                    </div>
                  </div>
                  {d !== null && (
                    <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end' }}>
                      <Delta value={d} />
                      <span style={{ fontSize: '0.68rem', color: 'var(--color-muted)', marginLeft: 4 }}>vs prior</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Period info cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
            {[result.range_a, result.range_b].map((r, i) => (
              <div key={i} style={{ background: 'var(--color-surface-2)', border: `1px solid ${i === 0 ? '#6366f130' : '#f59e0b30'}`, borderRadius: 10, padding: '12px 16px', fontSize: '0.78rem' }}>
                <div style={{ fontWeight: 600, color: i === 0 ? '#818cf8' : '#fbbf24', marginBottom: 6 }}>{i === 0 ? rangeA.label : rangeB.label}</div>
                <div style={{ color: 'var(--color-muted)' }}>
                  {format(parseISO(r.from), 'dd MMM yy')} → {format(parseISO(r.to), 'dd MMM yy')} ({r.days} days)
                </div>
              </div>
            ))}
          </div>

          {/* Overlay daily revenue chart */}
          {overlayData.length > 0 && (
            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 16, color: 'var(--color-accent-light)' }}>Daily Revenue Overlay</div>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={overlayData} margin={{ left: 0, right: 16, top: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: 'var(--color-muted)', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tickFormatter={fmtINR} tick={{ fill: 'var(--color-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v, name) => [fmtFull(v), name]} contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: '0.78rem' }} />
                  <Legend wrapperStyle={{ fontSize: '0.78rem', color: 'var(--color-subtle)' }} />
                  <Line type="monotone" dataKey="Range A Revenue" stroke="#818cf8" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Range B Revenue" stroke="#fbbf24" strokeWidth={2} dot={false} strokeDasharray="4 3" />
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
  { id: 'velocity',  label: 'Fast Movers',         icon: Zap,           component: FastMovers   },
  { id: 'slow',      label: 'Slow Movers',          icon: Snail,         component: SlowMovers   },
  { id: 'brand',     label: 'Brand Analysis',       icon: Tag,           component: BrandSales   },
  { id: 'platform',  label: 'Platforms',            icon: Globe,         component: PlatformComparison },
  { id: 'compare',   label: 'Date Comparison',      icon: CalendarDays,  component: DateComparison },
];

export default function Analytics() {
  const [tab,     setTab]     = useState('velocity');
  const [dates,   setDates]   = useState(thisYear());
  const [loading, setLoading] = useState(false);

  const activeTab = TABS.find(t => t.id === tab);
  const Component = activeTab?.component;
  const needsDates = tab !== 'compare';

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1>Analytics</h1>
          <p>Deep-dive into your sales data across SKUs, brands, and platforms</p>
        </div>
        <ExportMenu filename={`analytics_${tab}_report`} />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', marginBottom: 20, gap: 0, overflowX: 'auto' }}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} id={`tab-analytics-${id}`}
            onClick={() => setTab(id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 18px', background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '0.82rem', fontWeight: 600, whiteSpace: 'nowrap',
              color: tab === id ? 'var(--color-accent-light)' : 'var(--color-muted)',
              borderBottom: `2px solid ${tab === id ? 'var(--color-accent)' : 'transparent'}`,
              marginBottom: -1, transition: 'all 0.15s',
            }}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Global date filter (hidden for Date Comparison which has its own) */}
      {needsDates && (
        <DateBar
          dates={dates}
          onChange={setDates}
          onApply={(d) => setDates(d)}
          loading={loading}
        />
      )}

      {/* Active section */}
      <div className="card" style={{ padding: 24 }}>
        {Component && <Component dates={dates} />}
      </div>
    </div>
  );
}
