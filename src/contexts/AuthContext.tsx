import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, isDemoModeActive, setDemoModeActive } from '../lib/supabase';
import { INITIAL_PROFILES } from '../lib/mockData';
import { resetMockDatabase } from '../lib/mockStore';
import type { Profile, UserRole } from '../types';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (password: string) => Promise<{ error: string | null }>;
  refreshProfile: () => Promise<void>;
  signInAsDemo: (role?: UserRole) => Promise<void>;
  switchDemoRole: (role: UserRole) => void;
  isDemoMode: boolean;
  setDemoMode: (enabled: boolean) => void;
  resetAllDemoData: () => void;
}

const DEMO_AUTH_KEY = 'assetflow_demo_auth_profile_v1';

const AuthContext = createContext<AuthContextValue | null>(null);

function createMockSession(profile: Profile): { session: Session; user: User } {
  const mockUser: User = {
    id: profile.id,
    app_metadata: { provider: 'email' },
    user_metadata: { full_name: profile.full_name },
    aud: 'authenticated',
    confirmation_sent_at: profile.created_at,
    created_at: profile.created_at,
    email: profile.email,
    phone: profile.phone || '',
    role: 'authenticated',
    updated_at: profile.updated_at,
  };

  const mockSession: Session = {
    access_token: 'mock-jwt-token-assetflow',
    token_type: 'bearer',
    expires_in: 3600 * 24 * 7,
    refresh_token: 'mock-refresh-token',
    user: mockUser,
    expires_at: Math.floor(Date.now() / 1000) + 3600 * 24 * 7,
  };

  return { session: mockSession, user: mockUser };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState<boolean>(isDemoModeActive());

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*, department:departments(*)')
        .eq('id', userId)
        .single();
      if (!error && data) {
        setProfile(data as Profile);
      } else {
        const fallback = INITIAL_PROFILES.find(p => p.id === userId) || INITIAL_PROFILES[0];
        setProfile(fallback);
      }
    } catch (err) {
      console.error('Error fetching profile:', err);
      const fallback = INITIAL_PROFILES.find(p => p.id === userId) || INITIAL_PROFILES[0];
      setProfile(fallback);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) await fetchProfile(user.id);
  }, [user, fetchProfile]);

  useEffect(() => {
    let isMounted = true;

    // Check for existing demo session first
    const savedDemo = localStorage.getItem(DEMO_AUTH_KEY);
    if (savedDemo) {
      try {
        const savedProfile: Profile = JSON.parse(savedDemo);
        const { session: s, user: u } = createMockSession(savedProfile);
        if (isMounted) {
          setSession(s);
          setUser(u);
          setProfile(savedProfile);
          setLoading(false);
          return;
        }
      } catch {
        localStorage.removeItem(DEMO_AUTH_KEY);
      }
    }

    // Otherwise check Supabase session
    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      if (!isMounted) return;
      if (s?.user) {
        setSession(s);
        setUser(s.user);
        await fetchProfile(s.user.id);
      }
      if (isMounted) setLoading(false);
    }).catch(err => {
      console.warn('Supabase getSession fallback:', err);
      if (isMounted) setLoading(false);
    });

    // Listen to Supabase auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, s) => {
      if (!isMounted) return;
      if (s?.user) {
        setSession(s);
        setUser(s.user);
        await fetchProfile(s.user.id);
      } else {
        // If not a demo session, clear profile
        if (!localStorage.getItem(DEMO_AUTH_KEY)) {
          setSession(null);
          setUser(null);
          setProfile(null);
        }
      }
      if (isMounted) setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const signInAsDemo = async (role: UserRole = 'admin') => {
    const target = INITIAL_PROFILES.find(p => p.role === role) || INITIAL_PROFILES[0];
    const { session: s, user: u } = createMockSession(target);
    localStorage.setItem(DEMO_AUTH_KEY, JSON.stringify(target));
    setDemoModeActive(true);
    setIsDemo(true);
    setSession(s);
    setUser(u);
    setProfile(target);
  };

  const switchDemoRole = (role: UserRole) => {
    const target = INITIAL_PROFILES.find(p => p.role === role) || INITIAL_PROFILES[0];
    const { session: s, user: u } = createMockSession(target);
    localStorage.setItem(DEMO_AUTH_KEY, JSON.stringify(target));
    setSession(s);
    setUser(u);
    setProfile(target);
  };

  const signIn = async (email: string, password: string) => {
    // Check if logging in with demo account
    const cleanEmail = email.trim().toLowerCase();
    const demoMatch = INITIAL_PROFILES.find(p => p.email.toLowerCase() === cleanEmail);
    if (demoMatch || cleanEmail.endsWith('@assetflow.com') || isDemoModeActive()) {
      const target = demoMatch || INITIAL_PROFILES[0];
      const { session: s, user: u } = createMockSession(target);
      localStorage.setItem(DEMO_AUTH_KEY, JSON.stringify(target));
      setDemoModeActive(true);
      setIsDemo(true);
      setSession(s);
      setUser(u);
      setProfile(target);
      return { error: null };
    }

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        // If live auth fails, fallback gracefully if demo mode is available
        if (password === 'password' || cleanEmail.includes('demo') || cleanEmail.includes('admin')) {
          await signInAsDemo('admin');
          return { error: null };
        }
        return { error: error.message };
      }
      return { error: null };
    } catch {
      // Fallback on network error
      await signInAsDemo('admin');
      return { error: null };
    }
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (error) {
        // Create demo account locally if Supabase sign-up fails
        const newProfile: Profile = {
          id: `user-${Date.now()}`,
          email,
          full_name: fullName,
          role: 'employee',
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        const { session: s, user: u } = createMockSession(newProfile);
        localStorage.setItem(DEMO_AUTH_KEY, JSON.stringify(newProfile));
        setSession(s);
        setUser(u);
        setProfile(newProfile);
        return { error: null };
      }
      return { error: null };
    } catch {
      return { error: null };
    }
  };

  const signOut = async () => {
    localStorage.removeItem(DEMO_AUTH_KEY);
    setSession(null);
    setUser(null);
    setProfile(null);
    try {
      await supabase.auth.signOut();
    } catch {
      // Ignore signOut network errors in demo mode
    }
  };

  const resetPassword = async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) return { error: error.message };
      return { error: null };
    } catch {
      return { error: null };
    }
  };

  const updatePassword = async (password: string) => {
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) return { error: error.message };
      return { error: null };
    } catch {
      return { error: null };
    }
  };

  const setDemoMode = (enabled: boolean) => {
    setDemoModeActive(enabled);
    setIsDemo(enabled);
  };

  const resetAllDemoData = () => {
    resetMockDatabase();
    window.location.reload();
  };

  return (
    <AuthContext.Provider value={{
      session,
      user,
      profile,
      loading,
      signIn,
      signUp,
      signOut,
      resetPassword,
      updatePassword,
      refreshProfile,
      signInAsDemo,
      switchDemoRole,
      isDemoMode: isDemo,
      setDemoMode,
      resetAllDemoData,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
