import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import NotificationBell from '../notifications/NotificationBell';
import {
  LayoutDashboard, Package, GitBranch, Calendar, Wrench,
  Users, Settings, LogOut, Menu, X, ChevronDown,
  Shield, BarChart3, Building2, ClipboardList, Sparkles, RefreshCw, UserCheck
} from 'lucide-react';
import type { UserRole } from '../../types';

interface NavItem {
  to: string;
  icon: React.ReactNode;
  label: string;
  roles?: string[];
  badge?: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', icon: <LayoutDashboard size={18} />, label: 'Dashboard' },
  { to: '/assets', icon: <Package size={18} />, label: 'Assets' },
  { to: '/allocations', icon: <GitBranch size={18} />, label: 'Allocations' },
  { to: '/bookings', icon: <Calendar size={18} />, label: 'Bookings' },
  { to: '/maintenance', icon: <Wrench size={18} />, label: 'Maintenance' },
  { to: '/reports', icon: <BarChart3 size={18} />, label: 'Reports', roles: ['admin', 'asset_manager', 'department_head'] },
  { to: '/audit-logs', icon: <ClipboardList size={18} />, label: 'Audit Logs', roles: ['admin'] },
  { to: '/departments', icon: <Building2 size={18} />, label: 'Departments', roles: ['admin'] },
  { to: '/users', icon: <Users size={18} />, label: 'Users', roles: ['admin'] },
  { to: '/settings', icon: <Settings size={18} />, label: 'Settings', roles: ['admin'] },
];

interface SidebarContentProps {
  profile: ReturnType<typeof useAuth>['profile'];
  visibleNavItems: NavItem[];
  isActive: (path: string) => boolean;
  onCloseMobile?: () => void;
  onSignOut: () => void;
}

function SidebarContent({ profile, visibleNavItems, isActive, onCloseMobile, onSignOut }: SidebarContentProps) {
  return (
    <>
      {/* Logo */}
      <div style={{ padding: '20px 20px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <Link to="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <div style={{ width: 36, height: 36, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(99,102,241,0.4)' }}>
            <Shield size={18} color="white" />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: '#f1f5f9', letterSpacing: '-0.02em' }}>AssetFlow</div>
            <div style={{ fontSize: 10, color: '#818cf8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Enterprise Suite</div>
          </div>
        </Link>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '14px 10px', overflowY: 'auto' }}>
        <div style={{ marginBottom: 4 }}>
          {visibleNavItems.map(item => {
            const active = isActive(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={onCloseMobile}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 12px',
                  borderRadius: 8,
                  textDecoration: 'none',
                  marginBottom: 3,
                  color: active ? '#ffffff' : '#94a3b8',
                  background: active ? 'linear-gradient(90deg, rgba(99,102,241,0.2) 0%, rgba(99,102,241,0.08) 100%)' : 'transparent',
                  fontWeight: active ? 600 : 400,
                  fontSize: 14,
                  transition: 'all 0.15s',
                  borderLeft: active ? '3px solid #6366f1' : '3px solid transparent',
                }}
                onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'; (e.currentTarget as HTMLElement).style.color = '#f1f5f9'; } }}
                onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#94a3b8'; } }}
              >
                <span style={{ opacity: active ? 1 : 0.7, color: active ? '#818cf8' : 'inherit' }}>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* User section */}
      <div style={{ padding: '12px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.04)' }}>
          <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'white', flexShrink: 0 }}>
            {profile?.full_name?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {profile?.full_name || 'User'}
            </div>
            <div style={{ fontSize: 11, color: '#818cf8', textTransform: 'capitalize', fontWeight: 500 }}>
              {profile?.role?.replace(/_/g, ' ') || 'employee'}
            </div>
          </div>
          <button
            onClick={onSignOut}
            title="Sign out"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 4, borderRadius: 6, display: 'flex', transition: 'color 0.15s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#ef4444'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#64748b'; }}
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile, signOut, switchDemoRole, resetAllDemoData } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [demoMenuOpen, setDemoMenuOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const visibleNavItems = NAV_ITEMS.filter(item =>
    !item.roles || (profile && item.roles.includes(profile.role))
  );

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0e0f17' }}>
      {/* Desktop sidebar */}
      <aside className="sidebar" style={{ display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, height: '100vh', width: 240, borderRight: '1px solid rgba(255,255,255,0.06)', background: '#141522' }}>
        <SidebarContent
          profile={profile}
          visibleNavItems={visibleNavItems}
          isActive={isActive}
          onSignOut={handleSignOut}
        />
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} onClick={() => setSidebarOpen(false)} />
          <aside style={{ position: 'relative', width: 260, height: '100%', background: '#141522', borderRight: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', zIndex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 12px 0' }}>
              <button onClick={() => setSidebarOpen(false)} className="btn btn-ghost btn-icon"><X size={18} /></button>
            </div>
            <SidebarContent
              profile={profile}
              visibleNavItems={visibleNavItems}
              isActive={isActive}
              onCloseMobile={() => setSidebarOpen(false)}
              onSignOut={handleSignOut}
            />
          </aside>
        </div>
      )}

      {/* Main content */}
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Top bar */}
        <header style={{ height: 60, display: 'flex', alignItems: 'center', padding: '0 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(20,21,34,0.85)', backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 40, gap: 12 }}>
          <button className="btn btn-ghost btn-icon" onClick={() => setSidebarOpen(true)} style={{ display: 'none' }} aria-label="Open menu">
            <Menu size={18} />
          </button>

          {/* Quick Demo Data Indicator & Role Switcher */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setDemoMenuOpen(v => !v)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 12px',
                borderRadius: 20,
                background: 'rgba(99,102,241,0.12)',
                border: '1px solid rgba(99,102,241,0.3)',
                color: '#c7d2fe',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Sparkles size={13} style={{ color: '#818cf8' }} />
              <span>Sample Data Loaded</span>
              <ChevronDown size={13} style={{ opacity: 0.7 }} />
            </button>

            {demoMenuOpen && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setDemoMenuOpen(false)} />
                <div style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, background: '#1c1d2d', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: 8, minWidth: 230, zIndex: 50, boxShadow: '0 12px 32px rgba(0,0,0,0.5)' }}>
                  <div style={{ padding: '6px 10px', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Switch Active Role
                  </div>
                  {(['admin', 'asset_manager', 'department_head', 'employee'] as UserRole[]).map(role => (
                    <button
                      key={role}
                      onClick={() => { switchDemoRole(role); setDemoMenuOpen(false); }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        width: '100%',
                        padding: '7px 10px',
                        borderRadius: 6,
                        border: 'none',
                        background: profile?.role === role ? 'rgba(99,102,241,0.2)' : 'transparent',
                        color: profile?.role === role ? '#ffffff' : '#cbd5e1',
                        fontSize: 12,
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <span style={{ textTransform: 'capitalize' }}>{role.replace('_', ' ')}</span>
                      {profile?.role === role && <UserCheck size={13} style={{ color: '#818cf8' }} />}
                    </button>
                  ))}
                  <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '6px 0' }} />
                  <button
                    onClick={() => { resetAllDemoData(); setDemoMenuOpen(false); }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      width: '100%',
                      padding: '7px 10px',
                      borderRadius: 6,
                      border: 'none',
                      background: 'transparent',
                      color: '#a5b4fc',
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.12)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <RefreshCw size={13} /> Reset Fresh Sample Data
                  </button>
                </div>
              </>
            )}
          </div>

          <div style={{ flex: 1 }} />

          {/* Right actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <NotificationBell />

            {/* Profile menu */}
            <div style={{ position: 'relative' }}>
              <button
                id="user-menu-btn"
                onClick={() => setUserMenuOpen(v => !v)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', color: '#f1f5f9' }}
              >
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'white' }}>
                  {profile?.full_name?.charAt(0)?.toUpperCase() || '?'}
                </div>
                <span style={{ fontSize: 13, fontWeight: 500, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile?.full_name || 'User'}</span>
                <ChevronDown size={14} style={{ color: '#64748b' }} />
              </button>

              {userMenuOpen && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setUserMenuOpen(false)} />
                  <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, background: '#1c1d2d', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: 6, minWidth: 180, zIndex: 50, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
                    <Link to="/profile" onClick={() => setUserMenuOpen(false)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 6, color: '#94a3b8', textDecoration: 'none', fontSize: 13 }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                      <Shield size={14} /> My Profile
                    </Link>
                    <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '4px 0' }} />
                    <button
                      onClick={() => { setUserMenuOpen(false); handleSignOut(); }}
                      style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 6, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.08)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                      <LogOut size={14} /> Sign Out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <div style={{ flex: 1, padding: 24 }}>
          {children}
        </div>
      </main>
    </div>
  );
}
