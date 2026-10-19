import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Eye, EyeOff, Loader2, Shield, AlertCircle, Sparkles, UserCheck } from 'lucide-react';
import type { UserRole } from '../../types';

export default function LoginPage() {
  const { signIn, signInAsDemo } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/dashboard';

  const [email, setEmail] = useState('admin@assetflow.com');
  const [password, setPassword] = useState('password123');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) { setError('Please enter your email and password.'); return; }
    setLoading(true);
    const { error: authError } = await signIn(email.trim(), password);
    setLoading(false);
    if (authError) { setError(authError); return; }
    navigate(from, { replace: true });
  };

  const handleQuickDemo = async (role: UserRole) => {
    setLoading(true);
    await signInAsDemo(role);
    setLoading(false);
    navigate(from, { replace: true });
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1b2e 50%, #0f0f1a 100%)', padding: '24px' }}>
      {/* Background glow */}
      <div style={{ position: 'fixed', top: '20%', left: '50%', transform: 'translateX(-50%)', width: 600, height: 400, background: 'radial-gradient(ellipse, rgba(99,102,241,0.18) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <div style={{ width: '100%', maxWidth: 460, position: 'relative', zIndex: 1 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 60, height: 60, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', borderRadius: 16, marginBottom: 16, boxShadow: '0 8px 24px rgba(99,102,241,0.4)' }}>
            <Shield size={28} color="white" />
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 6 }}>
            <span className="gradient-text">AssetFlow</span>
          </h1>
          <p style={{ color: '#94a3b8', fontSize: 14 }}>Enterprise Asset & Resource Management</p>
        </div>

        {/* Demo One-Click Access Card */}
        <div
          className="card"
          style={{
            padding: 18,
            marginBottom: 20,
            background: 'linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(139,92,246,0.06) 100%)',
            borderColor: 'rgba(99,102,241,0.35)',
            boxShadow: '0 10px 25px -5px rgba(99,102,241,0.2)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Sparkles size={16} style={{ color: '#a5b4fc' }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#e0e7ff', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Instant Demo Access
            </span>
          </div>
          <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 14, lineHeight: 1.4 }}>
            Explore populated data across all sections with 1-click test roles:
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ justifyContent: 'flex-start', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', padding: '8px 12px' }}
              onClick={() => handleQuickDemo('admin')}
              disabled={loading}
            >
              <UserCheck size={14} style={{ color: '#818cf8', flexShrink: 0 }} />
              <div style={{ textAlign: 'left', lineHeight: 1.2 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#f1f5f9' }}>Alex (Admin)</div>
                <div style={{ fontSize: 10, color: '#94a3b8' }}>Full System Access</div>
              </div>
            </button>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ justifyContent: 'flex-start', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', padding: '8px 12px' }}
              onClick={() => handleQuickDemo('asset_manager')}
              disabled={loading}
            >
              <UserCheck size={14} style={{ color: '#34d399', flexShrink: 0 }} />
              <div style={{ textAlign: 'left', lineHeight: 1.2 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#f1f5f9' }}>Sarah (Manager)</div>
                <div style={{ fontSize: 10, color: '#94a3b8' }}>Assets & Fleet</div>
              </div>
            </button>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ justifyContent: 'flex-start', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', padding: '8px 12px' }}
              onClick={() => handleQuickDemo('department_head')}
              disabled={loading}
            >
              <UserCheck size={14} style={{ color: '#fbbf24', flexShrink: 0 }} />
              <div style={{ textAlign: 'left', lineHeight: 1.2 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#f1f5f9' }}>Marcus (Head)</div>
                <div style={{ fontSize: 10, color: '#94a3b8' }}>Engineering Lead</div>
              </div>
            </button>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ justifyContent: 'flex-start', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', padding: '8px 12px' }}
              onClick={() => handleQuickDemo('employee')}
              disabled={loading}
            >
              <UserCheck size={14} style={{ color: '#38bdf8', flexShrink: 0 }} />
              <div style={{ textAlign: 'left', lineHeight: 1.2 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#f1f5f9' }}>Priya (Member)</div>
                <div style={{ fontSize: 10, color: '#94a3b8' }}>Product Designer</div>
              </div>
            </button>
          </div>
        </div>

        {/* Regular Login Card */}
        <div className="card" style={{ padding: 28 }}>
          {error && (
            <div className="alert alert-error" style={{ marginBottom: 20 }}>
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#94a3b8', marginBottom: 6 }}>Email address</label>
              <input
                id="login-email"
                type="email"
                className="input"
                placeholder="you@company.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#94a3b8', marginBottom: 6 }}>Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="login-password"
                  type={showPass ? 'text' : 'password'}
                  className="input"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                  style={{ paddingRight: 44 }}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex' }}
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <div style={{ textAlign: 'right', marginTop: 8 }}>
                <Link to="/forgot-password" style={{ fontSize: 12, color: '#6366f1', textDecoration: 'none' }}>Forgot password?</Link>
              </div>
            </div>

            <button
              id="login-submit"
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{ width: '100%', justifyContent: 'center', marginTop: 4, padding: '12px' }}
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : null}
              {loading ? 'Signing in…' : 'Sign In with Credentials'}
            </button>
          </form>

          <div style={{ marginTop: 20, textAlign: 'center', fontSize: 13, color: '#64748b' }}>
            Don't have an account?{' '}
            <Link to="/signup" style={{ color: '#6366f1', textDecoration: 'none', fontWeight: 500 }}>Sign up</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
