import { useLocation } from 'react-router-dom';
import { Bell, Search, Activity } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const PAGE_TITLES = {
  '/':               { title: 'Dashboard',      desc: 'Overview of your operations'              },
  '/sales':          { title: 'Sale Planning',  desc: 'Targets, forecasts & performance'          },
  '/skus':           { title: 'SKU Management', desc: 'Catalog, pricing & listing health'         },
  '/inventory':      { title: 'Inventory',      desc: 'Stock levels across warehouses'             },
  '/analytics':      { title: 'Analytics',      desc: 'Sales velocity, brands & platforms'         },
  '/profitability':  { title: 'Profitability',  desc: 'Net profit per SKU · ROAS · High-burn'      },
  '/price-testing':  { title: 'Price A/B Testing', desc: 'Set variants, compare results automatically' },
  '/import':         { title: 'Data Import',    desc: 'Bulk upload orders & inventory'             },
  '/settings':       { title: 'Settings',       desc: 'Platform & account configuration'           },
};



export default function Topbar() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const info = PAGE_TITLES[pathname] ?? { title: 'Sellytics', desc: '' };

  return (
    <header className="topbar">
      <div className="topbar-breadcrumb">
        <div>
          <div className="topbar-breadcrumb-page">{info.title}</div>
          {info.desc && (
            <div className="topbar-breadcrumb-text" style={{ fontSize: '0.78rem' }}>{info.desc}</div>
          )}
        </div>
      </div>

      <div className="topbar-actions">
        {/* Search (Phase 1+) */}
        <button
          id="topbar-search"
          className="btn btn-ghost btn-icon"
          title="Search (coming soon)"
          data-tooltip="Search"
          disabled
          style={{ opacity: 0.4 }}
        >
          <Search size={17} />
        </button>

        {/* Notifications (Phase 1+) */}
        <button
          id="topbar-notifications"
          className="btn btn-ghost btn-icon"
          title="Notifications"
          data-tooltip="Notifications"
          style={{ position: 'relative' }}
        >
          <Bell size={17} />
          <span style={{
            position: 'absolute', top: 5, right: 5,
            width: 7, height: 7,
            background: 'var(--color-accent)',
            borderRadius: '50%',
          }} />
        </button>

        {/* Live dot */}
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.75rem', color: 'var(--color-success)' }}
          data-tooltip="System live"
        >
          <Activity size={14} />
          <span className="text-xs">Live</span>
        </div>

        {/* User avatar */}
        <div className="avatar" style={{ cursor: 'default' }} data-tooltip={user?.email}>
          {(user?.name?.[0] ?? user?.email?.[0] ?? 'U').toUpperCase()}
        </div>
      </div>
    </header>
  );
}
