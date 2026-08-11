import { useState, useEffect, useCallback } from 'react';
import {
  FlaskConical, Plus, Trash2, X, Check, Loader,
  Trophy, BarChart2, TrendingUp, TrendingDown, Minus,
  ChevronRight, PlayCircle, StopCircle, Info, RefreshCw,
} from 'lucide-react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { priceTestApi, skuApi } from '../lib/api';
import { format, parseISO } from 'date-fns';

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
  return '₹' + new Intl.NumberFormat('en-IN').format(Math.round(Math.abs(n || 0)));
}
function fmtNum(n) { return new Intl.NumberFormat('en-IN').format(n || 0); }
function fmtDate(d) { if (!d) return '—'; try { return format(parseISO(d), 'dd MMM yy'); } catch { return d; } }

const STATUS_STYLE = {
  active: { badge: 'badge-success', icon: PlayCircle,  label: 'Active'  },
  ended:  { badge: 'badge-muted',   icon: StopCircle,  label: 'Ended'   },
  draft:  { badge: 'badge-warning', icon: FlaskConical, label: 'Draft'  },
};

const COLOR_A = '#6366f1';  // Indigo
const COLOR_B = '#f59e0b';  // Amber

// ── Delta ────────────────────────────────────────────────────────────────────
function Delta({ a, b }) {
  if (!b) return null;
  const pct = ((a - b) / b) * 100;
  const good = pct > 0;
  const Icon = pct > 0 ? TrendingUp : pct < 0 ? TrendingDown : Minus;
  const color = pct > 0 ? 'var(--color-success)' : pct < 0 ? 'var(--color-danger)' : 'var(--color-muted)';
  return (
    <span style={{ fontSize: '0.72rem', color, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
      <Icon size={11} /> {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

// ── Winner badge ─────────────────────────────────────────────────────────────
function WinnerBadge({ winner, labelA, labelB }) {
  if (winner === 'tie') return <span className="badge badge-muted">Tie</span>;
  const label = winner === 'A' ? labelA : labelB;
  const color = winner === 'A' ? COLOR_A : COLOR_B;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: `${color}18`, color, padding: '2px 8px', borderRadius: 99, fontSize: '0.72rem', fontWeight: 700 }}>
      <Trophy size={10} /> {label}
    </span>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatPair({ label, a, b, labelA, labelB, format = fmtNum, winnerOf }) {
  return (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ fontSize: '0.68rem', color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600, marginBottom: 10 }}>{label}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {/* Variant A */}
        <div style={{ borderLeft: `3px solid ${COLOR_A}`, paddingLeft: 10 }}>
          <div style={{ fontSize: '0.68rem', color: COLOR_A, marginBottom: 3, fontWeight: 600 }}>{labelA}</div>
          <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: '1.1rem', color: winnerOf === 'A' ? COLOR_A : 'var(--color-text)' }}>{format(a)}</div>
        </div>
        {/* Variant B */}
        <div style={{ borderLeft: `3px solid ${COLOR_B}`, paddingLeft: 10 }}>
          <div style={{ fontSize: '0.68rem', color: COLOR_B, marginBottom: 3, fontWeight: 600 }}>{labelB}</div>
          <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: '1.1rem', color: winnerOf === 'B' ? COLOR_B : 'var(--color-text)' }}>{format(b)}</div>
        </div>
      </div>
      {winnerOf && winnerOf !== 'tie' && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <WinnerBadge winner={winnerOf} labelA={labelA} labelB={labelB} />
          <Delta a={winnerOf === 'A' ? a : b} b={winnerOf === 'A' ? b : a} />
          <span style={{ fontSize: '0.68rem', color: 'var(--color-muted)' }}>ahead</span>
        </div>
      )}
    </div>
  );
}

// ── Test Form Modal ───────────────────────────────────────────────────────────
const EMPTY_FORM = {
  sku_id: '', name: '',
  variant_a_label: 'Variant A', variant_b_label: 'Variant B',
  variant_a_price: '', variant_b_price: '',
  start_date: new Date().toISOString().slice(0, 10),
  end_date: '',
  price_tolerance_pct: '5',
  status: 'active', notes: '',
};

function TestFormModal({ initial, skus, onClose, onSaved }) {
  const [form,   setForm]   = useState(initial ? { ...EMPTY_FORM, ...initial } : { ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');
  const isEdit = !!initial;

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function submit(e) {
    e.preventDefault();
    if (!form.sku_id) { setError('Please select a SKU.'); return; }
    if (!form.variant_a_price || !form.variant_b_price) { setError('Both variant prices are required.'); return; }
    setError('');
    setSaving(true);
    try {
      const saved = isEdit
        ? await priceTestApi.update(initial.id, form)
        : await priceTestApi.create(form);
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <h2 style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <FlaskConical size={16} color="var(--color-accent-light)" />
            {isEdit ? 'Edit Price Test' : 'New Price A/B Test'}
          </h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={15} /></button>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* SKU */}
          <div className="form-group">
            <label className="form-label">SKU <span style={{ color: 'var(--color-danger)' }}>*</span></label>
            <select className="form-input" value={form.sku_id} onChange={e => set('sku_id', e.target.value)} required>
              <option value="">Select a SKU…</option>
              {skus.map(s => <option key={s.id} value={s.id}>{s.sku_code} — {s.name}</option>)}
            </select>
          </div>

          {/* Name */}
          <div className="form-group">
            <label className="form-label">Test Name <span style={{ color: 'var(--color-danger)' }}>*</span></label>
            <input className="form-input" placeholder="e.g. Summer pricing experiment" value={form.name} onChange={e => set('name', e.target.value)} required />
          </div>

          {/* Variants */}
          <div style={{ background: 'var(--color-surface-2)', borderRadius: 10, padding: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {/* Variant A */}
            <div style={{ borderLeft: `3px solid ${COLOR_A}`, paddingLeft: 12 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: COLOR_A, marginBottom: 10 }}>Variant A</div>
              <div className="form-group">
                <label className="form-label">Label</label>
                <input className="form-input" value={form.variant_a_label} onChange={e => set('variant_a_label', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Price (₹) <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                <input type="number" className="form-input" min="0" step="0.01" placeholder="e.g. 999" value={form.variant_a_price} onChange={e => set('variant_a_price', e.target.value)} required />
              </div>
            </div>
            {/* Variant B */}
            <div style={{ borderLeft: `3px solid ${COLOR_B}`, paddingLeft: 12 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: COLOR_B, marginBottom: 10 }}>Variant B</div>
              <div className="form-group">
                <label className="form-label">Label</label>
                <input className="form-input" value={form.variant_b_label} onChange={e => set('variant_b_label', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Price (₹) <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                <input type="number" className="form-input" min="0" step="0.01" placeholder="e.g. 1199" value={form.variant_b_price} onChange={e => set('variant_b_price', e.target.value)} required />
              </div>
            </div>
          </div>

          {/* Date range */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="form-group">
              <label className="form-label">Start Date <span style={{ color: 'var(--color-danger)' }}>*</span></label>
              <input type="date" className="form-input" value={form.start_date} onChange={e => set('start_date', e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">End Date <span style={{ color: 'var(--color-muted)' }}>(leave blank = still running)</span></label>
              <input type="date" className="form-input" value={form.end_date} onChange={e => set('end_date', e.target.value)} />
            </div>
          </div>

          {/* Tolerance + Status */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="form-group">
              <label className="form-label" title="A sales order is attributed to a variant if its sale_price is within ±this % of the variant price">
                Price Tolerance % <span style={{ fontSize: '0.68rem', color: 'var(--color-muted)' }}>(±%)</span>
              </label>
              <input type="number" className="form-input" min="0" max="50" step="0.5" value={form.price_tolerance_pct} onChange={e => set('price_tolerance_pct', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-input" value={form.status} onChange={e => set('status', e.target.value)}>
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="ended">Ended</option>
              </select>
            </div>
          </div>

          {/* Notes */}
          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea className="form-input" rows={2} placeholder="Hypothesis, context…" value={form.notes} onChange={e => set('notes', e.target.value)} style={{ resize: 'vertical' }} />
          </div>

          {/* Price tolerance note */}
          <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.18)', borderRadius: 8, padding: '10px 14px', fontSize: '0.76rem', display: 'flex', gap: 8, color: 'var(--color-subtle)' }}>
            <Info size={13} color="var(--color-accent-light)" style={{ flexShrink: 0, marginTop: 1 }} />
            <span>Sales orders for this SKU are attributed to a variant when the <strong>sale_price</strong> falls within ±{form.price_tolerance_pct}% of the variant price. If a sale matches both, it goes to the closer variant.</span>
          </div>

          {error && <div style={{ color: 'var(--color-danger)', fontSize: '0.82rem' }}>{error}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" id="btn-save-price-test" className="btn btn-primary" disabled={saving}>
              {saving ? <Loader size={14} className="animate-spin" /> : <Check size={14} />}
              {isEdit ? 'Save Changes' : 'Create Test'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Results Panel ─────────────────────────────────────────────────────────────
function ResultsPanel({ test, onClose }) {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try { setResults(await priceTestApi.results(test.id)); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [test.id]);

  useEffect(() => { load(); }, [load]);

  const labelA = test.variant_a_label || 'Variant A';
  const labelB = test.variant_b_label || 'Variant B';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end',
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        width: 'min(780px, 95vw)',
        background: 'var(--color-bg)',
        borderLeft: '1px solid var(--color-border)',
        overflowY: 'auto',
        display: 'flex', flexDirection: 'column',
        animation: 'slideInRight 0.22s ease forwards',
      }}>
        {/* Panel header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <FlaskConical size={16} color="var(--color-accent-light)" />
              <span style={{ fontWeight: 700, fontSize: '1rem' }}>{test.name}</span>
              <span className={`badge ${STATUS_STYLE[test.status]?.badge}`}>{STATUS_STYLE[test.status]?.label}</span>
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--color-muted)' }}>
              {test.skus?.sku_code} · {fmtDate(test.start_date)} → {test.end_date ? fmtDate(test.end_date) : 'ongoing'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-icon" onClick={load} title="Refresh"><RefreshCw size={14} /></button>
            <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={15} /></button>
          </div>
        </div>

        <div style={{ padding: 24, flex: 1 }}>
          {loading && <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="loader" /></div>}
          {error   && <div style={{ color: 'var(--color-danger)', fontSize: '0.85rem' }}>{error}</div>}
          {results && !loading && (
            <div className="animate-fade-in">
              {/* Overall winner banner */}
              {(() => {
                const wins = { A: 0, B: 0 };
                Object.values(results.winners).forEach(w => { if (w === 'A') wins.A++; if (w === 'B') wins.B++; });
                const overallWinner = wins.A > wins.B ? 'A' : wins.B > wins.A ? 'B' : 'tie';
                const label  = overallWinner === 'A' ? labelA : overallWinner === 'B' ? labelB : null;
                const color  = overallWinner === 'A' ? COLOR_A : COLOR_B;
                return (
                  <div style={{
                    background: overallWinner !== 'tie' ? `${color}12` : 'var(--color-surface-2)',
                    border: `1px solid ${overallWinner !== 'tie' ? `${color}30` : 'var(--color-border)'}`,
                    borderRadius: 12, padding: '14px 18px', marginBottom: 24,
                    display: 'flex', alignItems: 'center', gap: 12,
                  }}>
                    <Trophy size={22} color={overallWinner !== 'tie' ? color : 'var(--color-muted)'} />
                    <div>
                      {overallWinner !== 'tie' ? (
                        <>
                          <div style={{ fontWeight: 700, fontSize: '0.95rem', color }}>
                            {label} wins on {wins[overallWinner]} of 3 metrics
                          </div>
                          <div style={{ fontSize: '0.76rem', color: 'var(--color-muted)', marginTop: 2 }}>
                            {results.days_elapsed} days · {fmtNum(results.total_orders)} total orders · {results.unattributed > 0 ? `${results.unattributed} unattributed` : 'all orders attributed'}
                          </div>
                        </>
                      ) : (
                        <>
                          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--color-muted)' }}>No clear winner yet</div>
                          <div style={{ fontSize: '0.76rem', color: 'var(--color-muted)', marginTop: 2 }}>
                            {results.days_elapsed} days · {fmtNum(results.total_orders)} orders · more data needed
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Price strip */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                {[
                  { v: results.variant_a, color: COLOR_A },
                  { v: results.variant_b, color: COLOR_B },
                ].map(({ v, color }) => (
                  <div key={v.label} style={{ background: `${color}08`, border: `1px solid ${color}30`, borderRadius: 10, padding: '10px 14px', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.7rem', color, fontWeight: 700, marginBottom: 2 }}>{v.label}</div>
                    <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: '1.5rem', color }}>{fmtFull(v.price)}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--color-muted)' }}>target price</div>
                  </div>
                ))}
              </div>

              {/* Comparison metrics */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 24 }}>
                <StatPair
                  label="Units Sold"
                  a={results.variant_a.units}
                  b={results.variant_b.units}
                  labelA={labelA} labelB={labelB}
                  format={fmtNum}
                  winnerOf={results.winners.by_units}
                />
                <StatPair
                  label="Revenue"
                  a={results.variant_a.revenue}
                  b={results.variant_b.revenue}
                  labelA={labelA} labelB={labelB}
                  format={fmtINR}
                  winnerOf={results.winners.by_revenue}
                />
                <StatPair
                  label="Orders / Day"
                  a={results.variant_a.orders_per_day}
                  b={results.variant_b.orders_per_day}
                  labelA={labelA} labelB={labelB}
                  format={v => `${v}`}
                  winnerOf={results.winners.by_velocity}
                />
              </div>

              {/* Secondary stats table */}
              <div className="table-wrap" style={{ marginBottom: 24 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Metric</th>
                      <th style={{ color: COLOR_A }}>{labelA}</th>
                      <th style={{ color: COLOR_B }}>{labelB}</th>
                      <th>Winner</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { metric: 'Total Orders',      a: fmtNum(results.variant_a.orders),          b: fmtNum(results.variant_b.orders) },
                      { metric: 'Total Units',       a: fmtNum(results.variant_a.units),           b: fmtNum(results.variant_b.units), winner: results.winners.by_units },
                      { metric: 'Total Revenue',     a: fmtINR(results.variant_a.revenue),         b: fmtINR(results.variant_b.revenue), winner: results.winners.by_revenue },
                      { metric: 'Revenue / Day',     a: fmtINR(results.variant_a.revenue_per_day), b: fmtINR(results.variant_b.revenue_per_day), winner: results.winners.by_revenue },
                      { metric: 'Orders / Day',      a: `${results.variant_a.orders_per_day}`,     b: `${results.variant_b.orders_per_day}`, winner: results.winners.by_velocity },
                      { metric: 'Units / Day',       a: `${results.variant_a.units_per_day}`,      b: `${results.variant_b.units_per_day}` },
                      { metric: 'Avg Sale Price',    a: fmtINR(results.variant_a.avg_sale_price),  b: fmtINR(results.variant_b.avg_sale_price) },
                    ].map(row => (
                      <tr key={row.metric}>
                        <td style={{ color: 'var(--color-subtle)', fontSize: '0.82rem' }}>{row.metric}</td>
                        <td style={{ fontWeight: 600, color: row.winner === 'A' ? COLOR_A : 'var(--color-text)' }}>{row.a}</td>
                        <td style={{ fontWeight: 600, color: row.winner === 'B' ? COLOR_B : 'var(--color-text)' }}>{row.b}</td>
                        <td>{row.winner ? <WinnerBadge winner={row.winner} labelA={labelA} labelB={labelB} /> : <span style={{ color: 'var(--color-muted)', fontSize: '0.72rem' }}>—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Daily orders chart */}
              {results.daily_chart.length > 0 && (
                <div className="card" style={{ padding: 20 }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 16, color: 'var(--color-accent-light)' }}>
                    Daily Orders — {labelA} vs {labelB}
                  </div>
                  <ResponsiveContainer width="100%" height={220}>
                    <ComposedChart data={results.daily_chart} margin={{ left: 0, right: 8, top: 4, bottom: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                      <XAxis dataKey="date" tick={{ fill: 'var(--color-muted)', fontSize: 10 }} axisLine={false} tickLine={false}
                        tickFormatter={d => { try { return format(parseISO(d), 'dd/MM'); } catch { return d; } }}
                        interval={Math.max(0, Math.floor(results.daily_chart.length / 8) - 1)}
                      />
                      <YAxis allowDecimals={false} tick={{ fill: 'var(--color-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: '0.78rem' }}
                        labelFormatter={d => { try { return format(parseISO(d), 'dd MMM yyyy'); } catch { return d; } }}
                      />
                      <Legend wrapperStyle={{ fontSize: '0.78rem' }} />
                      <Bar dataKey={`${labelA} orders`} fill={COLOR_A} radius={[3,3,0,0]} maxBarSize={18} opacity={0.85} />
                      <Bar dataKey={`${labelB} orders`} fill={COLOR_B} radius={[3,3,0,0]} maxBarSize={18} opacity={0.85} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Unattributed note */}
              {results.unattributed > 0 && (
                <div style={{ marginTop: 16, padding: '10px 14px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, fontSize: '0.78rem', color: 'var(--color-muted)', display: 'flex', gap: 8 }}>
                  <Info size={13} color="var(--color-warning)" style={{ flexShrink: 0 }} />
                  {results.unattributed} orders couldn't be matched to either variant (sale price outside ±{test.price_tolerance_pct}% of both prices). Consider widening the tolerance in test settings.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Test Row ──────────────────────────────────────────────────────────────────
function TestRow({ test, onView, onEdit, onDelete, onEnd }) {
  const s = STATUS_STYLE[test.status] || STATUS_STYLE.draft;
  const Icon = s.icon;
  return (
    <tr>
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon size={13} color={test.status === 'active' ? 'var(--color-success)' : 'var(--color-muted)'} />
          <span className={`badge ${s.badge}`} style={{ fontSize: '0.65rem' }}>{s.label}</span>
        </div>
      </td>
      <td>
        <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{test.name}</div>
        <div style={{ fontSize: '0.72rem', color: 'var(--color-muted)' }}>{test.skus?.sku_code} · {test.skus?.name}</div>
      </td>
      <td>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ color: COLOR_A, fontWeight: 700, fontFamily: 'Outfit, sans-serif', fontSize: '0.95rem' }}>₹{test.variant_a_price}</span>
          <span style={{ color: 'var(--color-muted)', fontSize: '0.75rem' }}>{test.variant_a_label}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 2 }}>
          <span style={{ color: COLOR_B, fontWeight: 700, fontFamily: 'Outfit, sans-serif', fontSize: '0.95rem' }}>₹{test.variant_b_price}</span>
          <span style={{ color: 'var(--color-muted)', fontSize: '0.75rem' }}>{test.variant_b_label}</span>
        </div>
      </td>
      <td style={{ fontSize: '0.82rem', color: 'var(--color-muted)' }}>
        <div>{fmtDate(test.start_date)}</div>
        <div style={{ color: 'var(--color-subtle)', fontSize: '0.72rem' }}>
          {test.end_date ? `→ ${fmtDate(test.end_date)}` : '→ ongoing'}
        </div>
      </td>
      <td style={{ textAlign: 'right' }}>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <button id={`btn-view-${test.id}`} className="btn btn-primary btn-sm" onClick={() => onView(test)} title="View Results">
            <BarChart2 size={12} /> Results
          </button>
          {test.status === 'active' && (
            <button className="btn btn-secondary btn-sm" onClick={() => onEnd(test)} title="End test">
              <StopCircle size={12} />
            </button>
          )}
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => onEdit(test)} title="Edit"><ChevronRight size={13} /></button>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => onDelete(test.id)} title="Delete" style={{ color: 'var(--color-danger)' }}><Trash2 size={12} /></button>
        </div>
      </td>
    </tr>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// Main Page
// ════════════════════════════════════════════════════════════════════════════════
export default function PriceTesting() {
  const [tests,       setTests]       = useState([]);
  const [skus,        setSkus]        = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [showForm,    setShowForm]    = useState(false);
  const [editTest,    setEditTest]    = useState(null);
  const [viewTest,    setViewTest]    = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');

  useEffect(() => {
    priceTestApi.list().then(setTests).catch(() => {}).finally(() => setLoading(false));
    skuApi.list({ limit: 500 }).then(r => setSkus(r.data || r)).catch(() => {});
  }, []);

  async function handleSaved(saved) {
    setTests(prev => {
      const existing = prev.findIndex(t => t.id === saved.id);
      return existing >= 0
        ? prev.map(t => t.id === saved.id ? saved : t)
        : [saved, ...prev];
    });
  }

  async function handleDelete(id) {
    if (!confirm('Delete this price test?')) return;
    await priceTestApi.delete(id).catch(() => {});
    setTests(prev => prev.filter(t => t.id !== id));
  }

  async function handleEnd(test) {
    const ended = await priceTestApi.update(test.id, { status: 'ended', end_date: new Date().toISOString().slice(0, 10) });
    handleSaved(ended);
  }

  const filtered = filterStatus === 'all' ? tests : tests.filter(t => t.status === filterStatus);
  const counts   = { all: tests.length, active: tests.filter(t => t.status === 'active').length, ended: tests.filter(t => t.status === 'ended').length, draft: tests.filter(t => t.status === 'draft').length };

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1>Price A/B Testing</h1>
          <p>Set variant prices, log results automatically from sales orders, compare performance</p>
        </div>
        <button id="btn-new-price-test" className="btn btn-primary" onClick={() => { setEditTest(null); setShowForm(true); }}>
          <Plus size={14} /> New Test
        </button>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {[['all','All'], ['active','Active'], ['ended','Ended'], ['draft','Draft']].map(([k, l]) => (
          <button key={k} id={`filter-status-${k}`}
            className={`btn btn-sm ${filterStatus === k ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilterStatus(k)}>
            {l} {counts[k] > 0 && <span style={{ marginLeft: 4, opacity: 0.7, fontSize: '0.7rem' }}>({counts[k]})</span>}
          </button>
        ))}
      </div>

      {/* Test list */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><div className="loader" /></div>
      ) : filtered.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-state-icon"><FlaskConical size={28} /></div>
          <h3>{tests.length === 0 ? 'No price tests yet' : 'No tests match this filter'}</h3>
          <p>
            {tests.length === 0
              ? 'Create your first A/B test to compare two price points for a SKU.'
              : 'Try the "All" filter to see all tests.'}
          </p>
          {tests.length === 0 && (
            <button className="btn btn-primary" onClick={() => { setEditTest(null); setShowForm(true); }}>
              <Plus size={14} /> Create First Test
            </button>
          )}
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 90 }}>Status</th>
                <th>Test / SKU</th>
                <th>Variants</th>
                <th>Date Range</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(test => (
                <TestRow
                  key={test.id}
                  test={test}
                  onView={setViewTest}
                  onEdit={t => { setEditTest(t); setShowForm(true); }}
                  onDelete={handleDelete}
                  onEnd={handleEnd}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* How it works info card */}
      <div className="card" style={{ marginTop: 24, padding: 20, display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <Info size={18} color="var(--color-accent-light)" style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: '0.8rem', color: 'var(--color-subtle)', lineHeight: 1.7 }}>
          <strong style={{ color: 'var(--color-accent-light)' }}>How attribution works: </strong>
          When you view results, Sellytics scans every sales order for the SKU within the test date range.
          Each order is attributed to <strong style={{ color: COLOR_A }}>Variant A</strong> or <strong style={{ color: COLOR_B }}>Variant B</strong> based on whether its
          sale_price falls within the configured tolerance (±%) of that variant's price.
          If a sale price is within range of both variants, it's attributed to the closer one.
          Orders outside both tolerances are listed as <em>unattributed</em>.
        </div>
      </div>

      {/* Modals */}
      {showForm && (
        <TestFormModal
          initial={editTest}
          skus={skus}
          onClose={() => { setShowForm(false); setEditTest(null); }}
          onSaved={handleSaved}
        />
      )}
      {viewTest && (
        <ResultsPanel
          test={viewTest}
          onClose={() => setViewTest(null)}
        />
      )}
    </div>
  );
}
