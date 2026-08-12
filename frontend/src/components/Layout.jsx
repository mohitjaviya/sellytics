import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="app-shell">
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      {mobileOpen && (
        <div
          className="mobile-backdrop"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <div className="main-area">
        <Topbar onToggleMobile={() => setMobileOpen(v => !v)} />
        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
