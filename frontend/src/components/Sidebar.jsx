import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  TrendingUp,
  Package,
  Warehouse,
  BarChart3,
  Upload,
  ShoppingBag,
  LogOut,
  Settings,
  AlertTriangle,
  DollarSign,
  FlaskConical,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useEffect, useState } from 'react';
import { inventoryApi } from '../lib/api';

const BASE_NAV = [
  {
    label: 'Main',
    items: [
      { to: '/',          icon: LayoutDashboard, label: 'Dashboard',      end: true },
      { to: '/sales',     icon: TrendingUp,      label: 'Sale Planning'  },
      { to: '/skus',      icon: Package,         label: 'SKU Management' },
      { to: '/inventory', icon: Warehouse,       label: 'Inventory',     alert: true },
      { to: '/analytics',     icon: BarChart3,    label: 'Analytics'      },
      { to: '/profitability',  icon: DollarSign,   label: 'Profitability'  },
      { to: '/price-testing',  icon: FlaskConical, label: 'Price Testing'  },
      { to: '/import',         icon: Upload,       label: 'Data Import'    },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/settings', icon: Settings, label: 'Settings' },
    ],
  },
];

export default function Sidebar() {
  const { user, signOut } = useAuth();
  const location           = useLocation();
  const [alertCount, setAlertCount] = useState(0);

  // Poll alert count every 60 seconds
  useEffect(() => {
    function fetchAlerts() {
      inventoryApi.alerts()
        .then(({ count }) => setAlertCount(count))
        .catch(() => {});
    }
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 60_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo" style={{ marginBottom: 16 }}>
        <div className="sidebar-logo-icon">
          <ShoppingBag size={18} />
        </div>
        <span className="sidebar-logo-name">Sellytics</span>
      </div>

      <div className="sidebar-divider" />

      {/* Navigation */}
      <nav className="sidebar-nav">
        {BASE_NAV.map((section) => (
          <div key={section.label} style={{ marginBottom: 8 }}>
            <div className="sidebar-section-label">{section.label}</div>
            {section.items.map(({ to, icon: Icon, label, end, alert }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                id={`nav-${label.toLowerCase().replace(/\s+/g, '-')}`}
                className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              >
                <Icon size={17} />
                <span style={{ flex: 1 }}>{label}</span>

                {/* Alert badge on Inventory link */}
                {alert && alertCount > 0 && (
                  <span style={{
                    minWidth: 18, height: 18, borderRadius: 99,
                    background: 'var(--color-danger)',
                    color: '#fff',
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 4px',
                    animation: 'pulse 2s infinite',
                  }}>
                    {alertCount > 99 ? '99+' : alertCount}
                  </span>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="sidebar-footer">
        {/* Low stock summary */}
        {alertCount > 0 && (
          <div style={{
            marginBottom: 10,
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.15)',
            borderRadius: 8,
            padding: '8px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <AlertTriangle size={12} color="var(--color-danger)" />
            <span style={{ fontSize: '0.72rem', color: 'var(--color-danger)', fontWeight: 600 }}>
              {alertCount} low stock {alertCount === 1 ? 'alert' : 'alerts'}
            </span>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div className="avatar" style={{ width: 32, height: 32, fontSize: '0.75rem' }}>
            {(user?.name?.[0] ?? user?.email?.[0] ?? 'U').toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="truncate text-sm font-semibold">{user?.name ?? 'User'}</div>
            <div className="truncate text-xs text-muted">{user?.email}</div>
          </div>
        </div>
        <button
          id="btn-sign-out"
          className="btn btn-ghost w-full"
          style={{ justifyContent: 'flex-start', gap: 8, fontSize: '0.82rem', padding: '8px 10px' }}
          onClick={signOut}
        >
          <LogOut size={15} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
