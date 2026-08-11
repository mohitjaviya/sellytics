import { useState, useEffect } from 'react';
import { Users, Shield, MapPin, Store, Check, Save } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';

export default function SettingsPage() {
  const { user } = useAuth();
  const isAdminOrManager = user?.role === 'Admin' || user?.role === 'Manager';

  const [usersList, setUsersList] = useState([]);
  const [availableCities, setAvailableCities] = useState([]);
  const [availableAccounts, setAvailableAccounts] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);

  const [assignedCities, setAssignedCities] = useState([]);
  const [assignedAccounts, setAssignedAccounts] = useState([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!isAdminOrManager) return;

    api.get('/api/users')
      .then(res => {
        setUsersList(res);
        if (res.length > 0) selectUserForEdit(res[0]);
      })
      .catch(console.error);

    api.get('/api/sales/cities')
      .then(res => setAvailableCities(res || []))
      .catch(console.error);

    api.get('/api/sales/accounts')
      .then(res => setAvailableAccounts(res || []))
      .catch(console.error);
  }, [isAdminOrManager]);

  const selectUserForEdit = (u) => {
    setSelectedUser(u);
    setAssignedCities(u.assignments?.cities || []);
    setAssignedAccounts(u.assignments?.accounts || []);
    setMessage('');
  };

  const handleSaveAssignments = async () => {
    if (!selectedUser) return;
    setSaving(true);
    setMessage('');
    try {
      await api.post(`/api/users/${selectedUser.id}/assignments`, {
        cities: assignedCities,
        accounts: assignedAccounts,
      });

      setUsersList(prev => prev.map(u => u.id === selectedUser.id ? {
        ...u,
        assignments: { cities: assignedCities, accounts: assignedAccounts },
      } : u));

      setMessage('Assignments saved successfully!');
    } catch (err) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const toggleCity = (city) =>
    setAssignedCities(prev => prev.includes(city) ? prev.filter(c => c !== city) : [...prev, city]);

  const toggleAccount = (accId) =>
    setAssignedAccounts(prev => prev.includes(accId) ? prev.filter(a => a !== accId) : [...prev, accId]);

  const labelRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0' };

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1>Settings</h1>
          <p>Platform configuration &amp; team permissions</p>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 20 }}>
        {/* My Profile */}
        <div className="card">
          <h3 style={{ fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Shield size={16} color="var(--color-accent-light)" /> My Profile
          </h3>
          <div>
            <div style={{ ...labelRow, borderBottom: '1px solid var(--color-border)' }}>
              <span className="text-sm text-muted">Email</span>
              <span className="text-sm font-semibold">{user?.email}</span>
            </div>
            <div style={{ ...labelRow, borderBottom: '1px solid var(--color-border)' }}>
              <span className="text-sm text-muted">Role</span>
              <span className="badge badge-accent">{user?.role}</span>
            </div>
            <div style={labelRow}>
              <span className="text-sm text-muted">Name</span>
              <span className="text-sm font-semibold">{user?.name}</span>
            </div>
          </div>
        </div>

        {/* Active Platforms */}
        <div className="card">
          <h3 style={{ fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Store size={16} color="var(--color-success)" /> Active Platforms
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {['Amazon', 'Flipkart', 'Meesho', 'Myntra', 'Own Website'].map(p => (
              <div key={p} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '9px 12px', background: 'var(--color-surface-2)',
                border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
              }}>
                <span className="text-sm font-semibold">{p}</span>
                <span className="badge badge-success">Active</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Team Management (Admin / Manager only) */}
      {isAdminOrManager && (
        <div className="card">
          <div style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Users size={18} color="var(--color-accent-light)" /> Team &amp; Role Assignments (RBAC)
            </h2>
            <p className="text-sm text-muted">
              Assign specific cities or marketplace accounts to Sales Executives to restrict their data visibility.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 20, alignItems: 'start' }} className="dashboard-grid">
            {/* Team member list */}
            <div style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: 14 }}>
              <div className="sidebar-section-label" style={{ padding: '0 0 10px' }}>Team Members</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {usersList.length === 0 && (
                  <div className="text-sm text-muted" style={{ padding: '8px 0' }}>No users found.</div>
                )}
                {usersList.map(u => {
                  const active = selectedUser?.id === u.id;
                  return (
                    <button
                      key={u.id}
                      onClick={() => selectUserForEdit(u)}
                      style={{
                        width: '100%', textAlign: 'left', cursor: 'pointer',
                        padding: '10px 12px', borderRadius: 'var(--radius-sm)',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                        background: active ? 'rgba(99,102,241,0.12)' : 'transparent',
                        border: `1px solid ${active ? 'rgba(99,102,241,0.3)' : 'transparent'}`,
                        color: active ? 'var(--color-text)' : 'var(--color-subtle)',
                        transition: 'all 0.12s',
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div className="truncate font-semibold" style={{ fontSize: '0.85rem' }}>{u.name}</div>
                        <div className="truncate text-xs text-muted">{u.email}</div>
                      </div>
                      <span className="badge badge-muted" style={{ flexShrink: 0 }}>{u.role}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Assignments panel */}
            {selectedUser && (
              <div style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingBottom: 14, marginBottom: 14, borderBottom: '1px solid var(--color-border)', flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <h3 className="truncate" style={{ fontSize: '0.95rem' }}>{selectedUser.name} <span className="text-muted" style={{ fontWeight: 400 }}>({selectedUser.email})</span></h3>
                    <p className="text-xs text-muted">Role: {selectedUser.role}</p>
                  </div>
                  {selectedUser.role === 'Sales Executive' ? (
                    <button className="btn btn-primary btn-sm" onClick={handleSaveAssignments} disabled={saving}>
                      <Save size={14} /> {saving ? 'Saving…' : 'Save Assignments'}
                    </button>
                  ) : (
                    <span className="badge badge-accent">Unrestricted Access ({selectedUser.role})</span>
                  )}
                </div>

                {message && (
                  <div style={{
                    padding: '10px 12px', borderRadius: 'var(--radius-sm)', fontSize: '0.82rem', marginBottom: 14,
                    background: message.startsWith('Error') ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
                    border: `1px solid ${message.startsWith('Error') ? 'rgba(239,68,68,0.25)' : 'rgba(34,197,94,0.25)'}`,
                    color: message.startsWith('Error') ? 'var(--color-danger)' : 'var(--color-success)',
                  }}>
                    {message}
                  </div>
                )}

                {selectedUser.role === 'Sales Executive' ? (
                  <div className="grid-2">
                    {/* Cities */}
                    <div>
                      <h4 style={{ fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, color: 'var(--color-subtle)' }}>
                        <MapPin size={14} color="var(--color-accent-2)" /> Assigned Cities
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto', paddingRight: 4 }}>
                        {availableCities.length === 0 && <span className="text-xs text-muted">No cities available yet.</span>}
                        {availableCities.map(city => {
                          const checked = assignedCities.includes(city);
                          return (
                            <button key={city} onClick={() => toggleCity(city)}
                              style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '9px 12px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', textAlign: 'left',
                                fontSize: '0.82rem',
                                background: checked ? 'rgba(167,139,250,0.1)' : 'var(--color-surface)',
                                border: `1px solid ${checked ? 'rgba(167,139,250,0.35)' : 'var(--color-border)'}`,
                                color: checked ? 'var(--color-text)' : 'var(--color-subtle)',
                                transition: 'all 0.12s',
                              }}>
                              <span>{city}</span>
                              <span style={{
                                width: 16, height: 16, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                background: checked ? 'var(--color-accent-2)' : 'transparent',
                                border: `1px solid ${checked ? 'var(--color-accent-2)' : 'var(--color-border-hover)'}`,
                              }}>
                                {checked && <Check size={11} color="#fff" />}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Accounts */}
                    <div>
                      <h4 style={{ fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, color: 'var(--color-subtle)' }}>
                        <Store size={14} color="var(--color-success)" /> Assigned Accounts
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto', paddingRight: 4 }}>
                        {availableAccounts.length === 0 && <span className="text-xs text-muted">No accounts available yet.</span>}
                        {availableAccounts.map(acc => {
                          const checked = assignedAccounts.includes(acc.id);
                          return (
                            <button key={acc.id} onClick={() => toggleAccount(acc.id)}
                              style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '9px 12px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', textAlign: 'left',
                                fontSize: '0.82rem',
                                background: checked ? 'rgba(34,197,94,0.1)' : 'var(--color-surface)',
                                border: `1px solid ${checked ? 'rgba(34,197,94,0.35)' : 'var(--color-border)'}`,
                                color: checked ? 'var(--color-text)' : 'var(--color-subtle)',
                                transition: 'all 0.12s',
                              }}>
                              <span className="truncate">{acc.account_name} <span className="text-muted">({acc.platforms?.name})</span></span>
                              <span style={{
                                width: 16, height: 16, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                background: checked ? 'var(--color-success)' : 'transparent',
                                border: `1px solid ${checked ? 'var(--color-success)' : 'var(--color-border-hover)'}`,
                              }}>
                                {checked && <Check size={11} color="#fff" />}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted" style={{ textAlign: 'center', padding: '24px 0' }}>
                    Admins and Managers have full access to all cities, warehouses, and accounts across all modules.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {!isAdminOrManager && (
        <div className="card empty-state">
          <div className="empty-state-icon"><Shield size={24} /></div>
          <h3>Limited access</h3>
          <p>Team &amp; role management is available to Admins and Managers.</p>
        </div>
      )}
    </div>
  );
}
