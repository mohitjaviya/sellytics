import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp, Package, ShoppingCart, AlertTriangle,
  DollarSign, Target, Activity, ArrowRight, FlaskConical,
} from 'lucide-react';
import { api } from '../lib/api';

const currencyFmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const numFmt = new Intl.NumberFormat('en-IN');

export default function Dashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/api/dashboard')
      .then(setData)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
        <div className="loader" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="card empty-state animate-fade-in">
        <div className="empty-state-icon" style={{ background: 'rgba(239,68,68,0.1)' }}>
          <AlertTriangle size={26} color="var(--color-danger)" />
        </div>
        <h3>Couldn't load the dashboard</h3>
        <p>{error} — make sure the backend is running on port 4000.</p>
      </div>
    );
  }

  if (!data) return null;

  const { metrics, topSkus, activeTests } = data;
  const targetProgress = metrics.mtdTargetRevenue > 0
    ? (metrics.mtdRevenue / metrics.mtdTargetRevenue) * 100
    : 0;

  const STATS = [
    { label: 'Revenue (30d)',      value: currencyFmt.format(metrics.mtdRevenue),     icon: DollarSign,   color: '#22c55e', bg: 'rgba(34,197,94,0.12)'  },
    { label: 'Gross Profit (30d)', value: currencyFmt.format(metrics.mtdGrossProfit), icon: TrendingUp,   color: '#38bdf8', bg: 'rgba(56,189,248,0.12)' },
    { label: 'Units Sold (30d)',   value: numFmt.format(metrics.mtdUnits),            icon: ShoppingCart, color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
    { label: 'Active SKUs',        value: numFmt.format(metrics.activeSkus),          icon: Package,      color: '#6366f1', bg: 'rgba(99,102,241,0.12)' },
  ];

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1>Overview</h1>
          <p>Performance across your channels — last 30 days</p>
        </div>
      </div>

      {/* Low-stock alert banner */}
      {metrics.lowStockCount > 0 && (
        <div
          onClick={() => navigate('/inventory')}
          className="card"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 12, marginBottom: 24, cursor: 'pointer',
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ padding: 9, borderRadius: 10, background: 'rgba(239,68,68,0.15)', display: 'flex' }}>
              <AlertTriangle size={18} color="var(--color-danger)" />
            </div>
            <div>
              <div style={{ fontWeight: 600, color: 'var(--color-danger)', fontSize: '0.9rem' }}>Low Stock Alerts</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--color-danger)', opacity: 0.8 }}>
                {metrics.lowStockCount} {metrics.lowStockCount === 1 ? 'item is' : 'items are'} below the alert threshold.
              </div>
            </div>
          </div>
          <ArrowRight size={18} color="var(--color-danger)" />
        </div>
      )}

      {/* Stats grid */}
      <div className="grid-stats" style={{ marginBottom: 24 }}>
        {STATS.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="stat-card">
            <div className="stat-card-icon" style={{ background: bg }}>
              <Icon size={20} color={color} />
            </div>
            <div className="stat-card-value">{value}</div>
            <div className="stat-card-label">{label}</div>
          </div>
        ))}
      </div>

      {/* Main grid: top SKUs (left) + target & tests (right) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 20, alignItems: 'start' }} className="dashboard-grid">
        {/* Top performing SKUs */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 20px', borderBottom: '1px solid var(--color-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Activity size={16} color="var(--color-accent-light)" />
              <h3 style={{ fontSize: '0.95rem' }}>Top Performing SKUs (30d)</h3>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/analytics')}>
              Full report <ArrowRight size={13} />
            </button>
          </div>

          {topSkus.length === 0 ? (
            <div className="empty-state" style={{ padding: '48px 24px' }}>
              <div className="empty-state-icon"><Package size={24} /></div>
              <h3 style={{ fontSize: '0.9rem' }}>No sales yet this month</h3>
              <p>Once orders come in, your fastest movers show up here.</p>
            </div>
          ) : (
            <div>
              {topSkus.map((sku, i) => (
                <div key={sku.id}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: 12, padding: '13px 20px',
                    borderBottom: i < topSkus.length - 1 ? '1px solid var(--color-border)' : 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                    <span style={{ width: 18, textAlign: 'right', color: 'var(--color-muted)', fontSize: '0.8rem', fontWeight: 600 }}>{i + 1}</span>
                    {sku.image ? (
                      <img src={sku.image} alt="" style={{ width: 38, height: 38, borderRadius: 8, objectFit: 'cover', background: 'var(--color-surface-3)', flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 38, height: 38, borderRadius: 8, background: 'var(--color-surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Package size={16} color="var(--color-muted)" />
                      </div>
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div className="truncate" style={{ fontWeight: 500, fontSize: '0.88rem' }}>{sku.name || '—'}</div>
                      <div style={{ fontSize: '0.76rem', color: 'var(--color-muted)' }}>{numFmt.format(sku.units)} units sold</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, color: 'var(--color-success)' }}>{currencyFmt.format(sku.revenue)}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--color-muted)' }}>{sku.velocity} units/day</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* MTD Target tracker */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
              <Target size={16} color="var(--color-accent-2)" />
              <h3 style={{ fontSize: '0.95rem' }}>Target Tracker (30d)</h3>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 8 }}>
              <span style={{ color: 'var(--color-muted)' }}>Revenue target</span>
              <span style={{ fontWeight: 600 }}>{Math.round(targetProgress)}%</span>
            </div>
            <div style={{ height: 10, background: 'var(--color-surface-3)', borderRadius: 99, overflow: 'hidden', marginBottom: 16 }}>
              <div style={{
                height: '100%', width: `${Math.min(targetProgress, 100)}%`, borderRadius: 99,
                background: 'linear-gradient(90deg, var(--color-accent-2), var(--color-accent))',
                transition: 'width 0.5s ease',
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div>
                <div style={{ fontSize: '0.66rem', color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600, marginBottom: 3 }}>Achieved</div>
                <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: '1.25rem' }}>{currencyFmt.format(metrics.mtdRevenue)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.66rem', color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600, marginBottom: 3 }}>Target</div>
                <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 600, fontSize: '1.05rem', color: 'var(--color-subtle)' }}>
                  {metrics.mtdTargetRevenue > 0 ? currencyFmt.format(metrics.mtdTargetRevenue) : '—'}
                </div>
              </div>
            </div>
          </div>

          {/* Active price tests */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FlaskConical size={16} color="var(--color-accent-light)" />
                <h3 style={{ fontSize: '0.95rem' }}>Active Price Tests</h3>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/price-testing')}>View all</button>
            </div>

            {activeTests.length === 0 ? (
              <div style={{ padding: '28px 20px', textAlign: 'center', color: 'var(--color-muted)', fontSize: '0.82rem' }}>
                No active price tests.
              </div>
            ) : (
              <div>
                {activeTests.map((test, i) => (
                  <div key={test.id}
                    style={{
                      padding: '13px 20px',
                      borderBottom: i < activeTests.length - 1 ? '1px solid var(--color-border)' : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                      <span className="truncate" style={{ fontWeight: 500, fontSize: '0.86rem' }}>{test.name}</span>
                      <span className="badge badge-success" style={{ flexShrink: 0 }}>Running</span>
                    </div>
                    <div className="truncate" style={{ fontSize: '0.76rem', color: 'var(--color-muted)' }}>{test.skus?.name}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
