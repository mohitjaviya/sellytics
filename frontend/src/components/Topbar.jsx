import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Bell, Search, Activity, User, LogOut, Settings, Menu,
  AlertTriangle, Package, TrendingUp, CheckCircle2, X, Command, ArrowRight
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { inventoryApi, skuApi } from '../lib/api';

const PAGE_TITLES = {
  '/':               { title: 'Dashboard',         desc: 'Overview of your operations'                   },
  '/sales':          { title: 'Sale Planning',     desc: 'Targets, forecasts & performance'              },
  '/skus':           { title: 'SKU Management',    desc: 'Catalog, pricing & listing health'             },
  '/inventory':      { title: 'Inventory',         desc: 'Stock levels across warehouses'                 },
  '/analytics':      { title: 'Analytics',         desc: 'Sales velocity, brands & platforms'             },
  '/profitability':  { title: 'Profitability',     desc: 'Net profit per SKU · ROAS · High-burn'          },
  '/price-testing':  { title: 'Price A/B Testing', desc: 'Set variants, compare results automatically'    },
  '/import':         { title: 'Data Import',       desc: 'Bulk upload orders & inventory'                 },
  '/settings':       { title: 'Settings',          desc: 'Platform API & account configuration'          },
};

const PAGES_LIST = [
  { path: '/',          title: 'Dashboard',      icon: TrendingUp },
  { path: '/sales',     title: 'Sale Planning',  icon: TrendingUp },
  { path: '/skus',      title: 'SKU Management', icon: Package    },
  { path: '/inventory', title: 'Inventory',      icon: Package    },
  { path: '/analytics', title: 'Analytics',      icon: TrendingUp },
  { path: '/import',    title: 'Data Import',    icon: Settings   },
  { path: '/settings',  title: 'Settings',       icon: Settings   },
];

export default function Topbar({ onToggleMobile }) {
  const { user, signOut } = useAuth();
  const { pathname }     = useLocation();
  const navigate         = useNavigate();
  const info             = PAGE_TITLES[pathname] ?? { title: 'Sellytics', desc: '' };

  // Dropdown states
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile,       setShowProfile]       = useState(false);
  const [showSearchModal,   setShowSearchModal]   = useState(false);

  // Search state
  const [query,   setQuery]   = useState('');
  const [skus,    setSkus]    = useState([]);
  const [alerts,  setAlerts]  = useState([]);

  const notifRef   = useRef(null);
  const profileRef = useRef(null);

  // Fetch low stock alerts for notifications
  useEffect(() => {
    inventoryApi.alerts()
      .then(res => setAlerts(res.data || []))
      .catch(() => {});
  }, []);

  // Close popovers on click outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotifications(false);
      if (profileRef.current && !profileRef.current.contains(e.target)) setShowProfile(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard shortcut Ctrl+K / Cmd+K for search
  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearchModal(v => !v);
      }
      if (e.key === 'Escape') {
        setShowSearchModal(false);
        setShowNotifications(false);
        setShowProfile(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Fetch SKUs on search input
  useEffect(() => {
    if (!query.trim()) { setSkus([]); return; }
    const timer = setTimeout(() => {
      skuApi.list({ search: query })
        .then(res => setSkus(res.data?.slice(0, 5) || []))
        .catch(() => {});
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  const filteredPages = PAGES_LIST.filter(p =>
    p.title.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <header className="topbar">
      {/* Mobile Menu Toggle Button */}
      <button
        className="btn btn-ghost btn-icon mobile-menu-toggle"
        onClick={onToggleMobile}
        title="Open navigation menu"
      >
        <Menu size={19} />
      </button>

      {/* Breadcrumb / Page Title */}
      <div className="topbar-breadcrumb">
        <div>
          <div className="topbar-breadcrumb-page">{info.title}</div>
          {info.desc && (
            <div className="topbar-breadcrumb-text" style={{ fontSize: '0.78rem' }}>{info.desc}</div>
          )}
        </div>
      </div>

      {/* Topbar Actions */}
      <div className="topbar-actions" style={{ position: 'relative' }}>
        {/* Search Trigger Button */}
        <button
          id="topbar-search"
          className="btn btn-ghost btn-icon"
          title="Search (Ctrl+K)"
          onClick={() => setShowSearchModal(true)}
          style={{ position: 'relative' }}
        >
          <Search size={17} />
        </button>

        {/* Notifications Button & Popover */}
        <div ref={notifRef} style={{ position: 'relative' }}>
          <button
            id="topbar-notifications"
            className="btn btn-ghost btn-icon"
            title="Notifications"
            onClick={() => {
              setShowNotifications(v => !v);
              setShowProfile(false);
            }}
            style={{ position: 'relative' }}
          >
            <Bell size={17} />
            {alerts.length > 0 && (
              <span style={{
                position: 'absolute', top: 5, right: 5,
                width: 7, height: 7,
                background: 'var(--color-danger)',
                borderRadius: '50%',
                boxShadow: '0 0 6px var(--color-danger)',
              }} />
            )}
          </button>

          {/* Notifications Dropdown */}
          {showNotifications && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 8px)', right: 0,
              width: 320, background: 'var(--color-surface)',
              border: '1px solid var(--color-border)', borderRadius: 14,
              boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
              zIndex: 1000, overflow: 'hidden',
              animation: 'fadeIn 0.15s ease',
            }}>
              <div style={{
                padding: '12px 16px', borderBottom: '1px solid var(--color-border)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>Notifications</span>
                <span className="badge badge-accent">{alerts.length} Low Stock</span>
              </div>

              <div style={{ maxHeight: 280, overflowY: 'auto', padding: 8 }}>
                {alerts.length === 0 ? (
                  <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--color-muted)', fontSize: '0.8rem' }}>
                    <CheckCircle2 size={20} color="var(--color-success)" style={{ marginBottom: 6 }} />
                    <div>All inventory levels are healthy!</div>
                  </div>
                ) : (
                  alerts.slice(0, 5).map(item => (
                    <div key={item.id}
                      onClick={() => { navigate('/inventory'); setShowNotifications(false); }}
                      style={{
                        padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                        display: 'flex', alignItems: 'flex-start', gap: 10,
                        transition: 'background 0.15s',
                        marginBottom: 4,
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-2)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ padding: 6, borderRadius: 6, background: 'rgba(239,68,68,0.12)', color: 'var(--color-danger)' }}>
                        <AlertTriangle size={14} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text)' }} className="truncate">
                          {item.name || item.sku_code}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--color-danger)' }}>
                          Stock: {item.current_stock ?? 0} units (min: {item.min_stock_alert ?? 10})
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div style={{ padding: '8px 12px', borderTop: '1px solid var(--color-border)', textAlign: 'center' }}>
                <button className="btn btn-ghost btn-sm w-full"
                  onClick={() => { navigate('/inventory'); setShowNotifications(false); }}>
                  View All Inventory <ArrowRight size={12} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Live Indicator */}
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.75rem', color: 'var(--color-success)', cursor: 'default' }}
          data-tooltip="System live"
        >
          <Activity size={14} />
          <span className="text-xs font-semibold">Live</span>
        </div>

        {/* User Profile Avatar & Dropdown */}
        <div ref={profileRef} style={{ position: 'relative' }}>
          <div
            className="avatar"
            onClick={() => {
              setShowProfile(v => !v);
              setShowNotifications(false);
            }}
            style={{ cursor: 'pointer', transition: 'transform 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
          >
            {(user?.name?.[0] ?? user?.email?.[0] ?? 'A').toUpperCase()}
          </div>

          {/* Profile Dropdown */}
          {showProfile && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 8px)', right: 0,
              width: 240, background: 'var(--color-surface)',
              border: '1px solid var(--color-border)', borderRadius: 14,
              boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
              zIndex: 1000, padding: 8,
              animation: 'fadeIn 0.15s ease',
            }}>
              {/* User Header */}
              <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--color-border)', marginBottom: 6 }}>
                <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--color-text)' }} className="truncate">
                  {user?.name ?? 'User'}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--color-muted)' }} className="truncate">
                  {user?.email}
                </div>
                <div style={{ marginTop: 6 }}>
                  <span className="badge badge-accent" style={{ fontSize: '0.68rem' }}>
                    {user?.role ?? 'Admin'}
                  </span>
                </div>
              </div>

              {/* Menu Actions */}
              <button
                className="btn btn-ghost btn-sm w-full"
                style={{ justifyContent: 'flex-start', gap: 8, padding: '8px 12px' }}
                onClick={() => { navigate('/settings'); setShowProfile(false); }}
              >
                <Settings size={14} /> Settings & APIs
              </button>

              <button
                className="btn btn-ghost btn-sm w-full"
                style={{ justifyContent: 'flex-start', gap: 8, padding: '8px 12px', color: 'var(--color-danger)' }}
                onClick={signOut}
              >
                <LogOut size={14} /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Global Search Modal (Ctrl+K) */}
      {showSearchModal && (
        <div className="modal-overlay" onClick={() => setShowSearchModal(false)}>
          <div className="modal" style={{ maxWidth: 520, padding: 0, overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '14px 18px', borderBottom: '1px solid var(--color-border)',
              background: 'var(--color-surface-2)',
            }}>
              <Search size={18} color="var(--color-muted)" />
              <input
                type="text"
                autoFocus
                placeholder="Search pages, SKUs, or type a command... (Esc to close)"
                value={query}
                onChange={e => setQuery(e.target.value)}
                style={{
                  flex: 1, background: 'transparent', border: 'none',
                  color: 'var(--color-text)', fontSize: '0.92rem', outline: 'none',
                }}
              />
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowSearchModal(false)}>
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: 12, maxHeight: 360, overflowY: 'auto' }}>
              {/* Pages */}
              {filteredPages.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '4px 8px', marginBottom: 4 }}>
                    Pages
                  </div>
                  {filteredPages.map(page => {
                    const PageIcon = page.icon;
                    return (
                      <div key={page.path}
                        onClick={() => { navigate(page.path); setShowSearchModal(false); }}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                          fontSize: '0.85rem', fontWeight: 500,
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-2)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <PageIcon size={16} color="var(--color-accent-light)" />
                          <span>{page.title}</span>
                        </div>
                        <ArrowRight size={13} color="var(--color-muted)" />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* SKUs */}
              {skus.length > 0 && (
                <div>
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '4px 8px', marginBottom: 4 }}>
                    SKUs
                  </div>
                  {skus.map(s => (
                    <div key={s.id}
                      onClick={() => { navigate('/skus'); setShowSearchModal(false); }}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                        fontSize: '0.85rem',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-2)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--color-accent-light)', fontFamily: 'monospace', fontSize: '0.8rem' }}>{s.sku_code}</div>
                        <div style={{ fontSize: '0.76rem', color: 'var(--color-muted)' }}>{s.name}</div>
                      </div>
                      <span className="badge badge-accent" style={{ fontSize: '0.7rem' }}>₹{s.sale_price}</span>
                    </div>
                  ))}
                </div>
              )}

              {filteredPages.length === 0 && skus.length === 0 && (
                <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--color-muted)', fontSize: '0.85rem' }}>
                  No matching pages or SKUs found for "{query}"
                </div>
              )}
            </div>

            <div style={{
              padding: '8px 16px', background: 'var(--color-surface-2)',
              borderTop: '1px solid var(--color-border)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              fontSize: '0.72rem', color: 'var(--color-muted)',
            }}>
              <span>Tip: Press <kbd style={{ background: 'var(--color-surface-3)', padding: '2px 5px', borderRadius: 4 }}>Ctrl+K</kbd> anywhere to open search</span>
              <span>Sellytics Search</span>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
