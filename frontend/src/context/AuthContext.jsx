import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

/**
 * User roles: Admin | Manager | Sales Executive
 * Role is stored in user_metadata.role (set via Supabase Auth Admin on invite)
 * or falls back to app_metadata.role for service-key-created users.
 */
export function AuthProvider({ children }) {
  const [user, setUser]     = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch current session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      hydrateUser(session?.user ?? null);
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      hydrateUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  function hydrateUser(rawUser) {
    if (!rawUser) {
      setUser(null);
      setProfile(null);
      setLoading(false);
      return;
    }
    const role =
      rawUser.user_metadata?.role ||
      rawUser.app_metadata?.role ||
      'Sales Executive';

    const hydrated = {
      ...rawUser,
      role,
      name:  rawUser.user_metadata?.name  || rawUser.email?.split('@')[0] || 'User',
      email: rawUser.email,
    };

    setUser(hydrated);
    setProfile(hydrated);
    setLoading(false);
  }

  async function signIn({ email, password }) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  /** Role-based permission helpers */
  function isAdmin()   { return user?.role === 'Admin'; }
  function isManager() { return user?.role === 'Manager' || isAdmin(); }

  function canWrite(module) {
    // Admins can write everything; Managers can write most; SEs limited
    const seModules = ['sales_orders'];
    if (isAdmin()) return true;
    if (isManager()) return true;
    return seModules.includes(module);
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signOut, isAdmin, isManager, canWrite }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
