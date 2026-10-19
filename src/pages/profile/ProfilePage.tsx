import { useState, useEffect, type FormEvent } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import {
  User, Shield, Mail, Building, Phone, KeyRound,
  Package, Calendar, Check, AlertTriangle, Loader2, Save,
  Clock, Hash
} from 'lucide-react';
import {
  formatDate, formatDateTime, getRoleBadge,
  getRoleLabel, getStatusLabel, extractErrorMessage, isOverdue
} from '../../lib/utils';
import type { Allocation, Booking } from '../../types';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';

export default function ProfilePage() {
  const { profile, user, refreshProfile, updatePassword } = useAuth();

  // Profile Edit State
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Password State
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // User Activity
  const [myAllocations, setMyAllocations] = useState<Allocation[]>([]);
  const [myBookings, setMyBookings] = useState<Booking[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(true);

  // Sync state if profile changes
  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name);
      setPhone(profile.phone || '');
    }
  }, [profile]);

  // Fetch user's active assets and bookings
  useEffect(() => {
    if (!profile?.id) return;
    const fetchUserActivity = async () => {
      setLoadingActivity(true);
      try {
        const [{ data: allocs }, { data: bks }] = await Promise.all([
          supabase
            .from('allocations')
            .select('*, asset:assets(id, name, asset_tag, status, condition)')
            .eq('assigned_to', profile.id)
            .eq('status', 'active')
            .order('allocation_date', { ascending: false }),
          supabase
            .from('bookings')
            .select('*, resource:resources(id, name)')
            .eq('booked_by', profile.id)
            .in('status', ['pending', 'approved'])
            .order('start_time', { ascending: true })
            .limit(10),
        ]);
        setMyAllocations((allocs as Allocation[]) || []);
        setMyBookings((bks as Booking[]) || []);
      } catch (err) {
        console.error('Error fetching user activity:', err);
      } finally {
        setLoadingActivity(false);
      }
    };
    fetchUserActivity();
  }, [profile?.id]);

  const handleUpdateProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile?.id) return;
    setSavingProfile(true);
    setProfileError(null);
    setProfileSuccess(false);

    try {
      const { error: err } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim(),
          phone: phone.trim() || null,
        })
        .eq('id', profile.id);

      if (err) throw err;

      await refreshProfile();
      setProfileSuccess(true);
      toast.success('Profile updated successfully');
      setTimeout(() => setProfileSuccess(false), 3000);
    } catch (err) {
      setProfileError(extractErrorMessage(err));
    } finally {
      setSavingProfile(false);
    }
  };

  const handleUpdatePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }

    setSavingPassword(true);
    const { error: err } = await updatePassword(newPassword);
    setSavingPassword(false);

    if (err) {
      setPasswordError(err);
      return;
    }

    setPasswordSuccess(true);
    setNewPassword('');
    setConfirmPassword('');
    toast.success('Password changed successfully');
    setTimeout(() => setPasswordSuccess(false), 3000);
  };

  return (
    <div className="animate-fade-in" style={{ maxWidth: 1000, margin: '0 auto' }}>
      {/* Profile Header Banner */}
      <div className="card" style={{ padding: 28, marginBottom: 24, position: 'relative', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', top: -50, right: -50, width: 200, height: 200,
          background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)',
          borderRadius: '50%', pointerEvents: 'none'
        }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28, fontWeight: 700, color: 'white', flexShrink: 0,
            boxShadow: '0 8px 20px rgba(99,102,241,0.35)'
          }}>
            {profile?.full_name?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
              <h1 style={{ fontSize: 24, fontWeight: 700 }}>{profile?.full_name || 'My Profile'}</h1>
              {profile && (
                <span className={`badge ${getRoleBadge(profile.role)}`}>
                  {getRoleLabel(profile.role)}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, color: '#94a3b8', fontSize: 13, flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Mail size={14} /> {profile?.email || user?.email}
              </span>
              {profile?.department && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Building size={14} /> {profile.department.name}
                </span>
              )}
              {profile?.employee_id && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Hash size={14} /> {profile.employee_id}
                </span>
              )}
              {profile?.created_at && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Clock size={14} /> Joined {formatDate(profile.created_at)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 24, marginBottom: 24 }}>
        {/* Personal Information Form */}
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 12 }}>
            <User size={18} style={{ color: '#6366f1' }} />
            <h2 style={{ fontSize: 16, fontWeight: 600 }}>Personal Information</h2>
          </div>

          {profileError && (
            <div className="alert alert-error" style={{ marginBottom: 14 }}>
              <AlertTriangle size={15} /> <span>{profileError}</span>
            </div>
          )}

          <form onSubmit={handleUpdateProfile} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#94a3b8', marginBottom: 6 }}>
                Full Name
              </label>
              <input
                id="profile-name"
                type="text"
                className="input"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#94a3b8', marginBottom: 6 }}>
                Email Address
              </label>
              <input
                type="email"
                className="input"
                value={profile?.email || user?.email || ''}
                disabled
                style={{ opacity: 0.7, cursor: 'not-allowed' }}
              />
              <span style={{ fontSize: 11, color: '#64748b', marginTop: 4, display: 'block' }}>Email address is managed via authentication</span>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#94a3b8', marginBottom: 6 }}>
                Phone Number
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="profile-phone"
                  type="tel"
                  className="input"
                  placeholder="+1 (555) 000-0000"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  style={{ paddingLeft: 34 }}
                />
                <Phone size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#94a3b8', marginBottom: 6 }}>
                  Role
                </label>
                <input
                  type="text"
                  className="input"
                  value={profile ? getRoleLabel(profile.role) : ''}
                  disabled
                  style={{ opacity: 0.7, cursor: 'not-allowed' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#94a3b8', marginBottom: 6 }}>
                  Department
                </label>
                <input
                  type="text"
                  className="input"
                  value={profile?.department?.name || 'Unassigned'}
                  disabled
                  style={{ opacity: 0.7, cursor: 'not-allowed' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
              <button id="save-profile-btn" type="submit" className="btn btn-primary btn-sm" disabled={savingProfile}>
                {savingProfile ? (
                  <><Loader2 size={13} className="animate-spin" /> Saving…</>
                ) : profileSuccess ? (
                  <><Check size={13} /> Updated!</>
                ) : (
                  <><Save size={13} /> Save Profile</>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Password & Security Form */}
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 12 }}>
            <KeyRound size={18} style={{ color: '#8b5cf6' }} />
            <h2 style={{ fontSize: 16, fontWeight: 600 }}>Security & Password</h2>
          </div>

          {passwordError && (
            <div className="alert alert-error" style={{ marginBottom: 14 }}>
              <AlertTriangle size={15} /> <span>{passwordError}</span>
            </div>
          )}

          <form onSubmit={handleUpdatePassword} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#94a3b8', marginBottom: 6 }}>
                New Password
              </label>
              <input
                id="profile-new-pwd"
                type="password"
                className="input"
                placeholder="At least 6 characters"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                minLength={6}
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#94a3b8', marginBottom: 6 }}>
                Confirm New Password
              </label>
              <input
                id="profile-confirm-pwd"
                type="password"
                className="input"
                placeholder="Re-enter new password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                minLength={6}
                required
              />
            </div>

            <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 8, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#818cf8', fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
                <Shield size={14} /> Password Policy
              </div>
              <p style={{ color: '#94a3b8', fontSize: 11, margin: 0 }}>
                Must be at least 6 characters. Use a combination of uppercase, lowercase, numbers, and symbols for best protection.
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
              <button id="update-pwd-btn" type="submit" className="btn btn-primary btn-sm" disabled={savingPassword}>
                {savingPassword ? (
                  <><Loader2 size={13} className="animate-spin" /> Updating…</>
                ) : passwordSuccess ? (
                  <><Check size={13} /> Changed!</>
                ) : (
                  <><Save size={13} /> Update Password</>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* User's Current Allocations & Bookings */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 24 }}>
        {/* Allocated Assets */}
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Package size={17} style={{ color: '#10b981' }} />
              <h3 style={{ fontSize: 15, fontWeight: 600 }}>My Assigned Assets</h3>
            </div>
            <span style={{ fontSize: 12, color: '#64748b' }}>{myAllocations.length} active</span>
          </div>

          {loadingActivity ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
              <Loader2 size={20} className="animate-spin" style={{ color: '#6366f1' }} />
            </div>
          ) : myAllocations.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: '#64748b', fontSize: 13 }}>
              No assets currently assigned to you
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {myAllocations.map(a => (
                <div
                  key={a.id}
                  style={{
                    padding: '12px 14px',
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.06)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12
                  }}
                >
                  <div>
                    <Link
                      to={`/assets/${a.asset?.id}`}
                      style={{ fontWeight: 600, fontSize: 13, color: '#f1f5f9', textDecoration: 'none' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#818cf8')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#f1f5f9')}
                    >
                      {a.asset?.name || 'Asset'}
                    </Link>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                      Tag: <span style={{ fontFamily: 'monospace' }}>{a.asset?.asset_tag}</span> · Allocated {formatDate(a.allocation_date)}
                    </div>
                  </div>
                  {a.expected_return && (
                    <div style={{ textAlign: 'right', fontSize: 11 }}>
                      <span style={{ color: isOverdue(a.expected_return) ? '#ef4444' : '#94a3b8' }}>
                        Due {formatDate(a.expected_return)}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Active Bookings */}
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Calendar size={17} style={{ color: '#38bdf8' }} />
              <h3 style={{ fontSize: 15, fontWeight: 600 }}>My Upcoming Bookings</h3>
            </div>
            <span style={{ fontSize: 12, color: '#64748b' }}>{myBookings.length} upcoming</span>
          </div>

          {loadingActivity ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
              <Loader2 size={20} className="animate-spin" style={{ color: '#6366f1' }} />
            </div>
          ) : myBookings.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: '#64748b', fontSize: 13 }}>
              No upcoming or pending bookings
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {myBookings.map(b => (
                <div
                  key={b.id}
                  style={{
                    padding: '12px 14px',
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.06)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{b.resource?.name || b.title || 'Resource'}</div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                      {formatDateTime(b.start_time)} → {formatDateTime(b.end_time)}
                    </div>
                  </div>
                  <span className={`badge ${b.status === 'approved' ? 'badge-success' : 'badge-warning'}`}>
                    {getStatusLabel(b.status)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
