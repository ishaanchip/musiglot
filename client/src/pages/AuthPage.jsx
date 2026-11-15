import React, { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import AuthArt from '../components/AuthArt.jsx';

const EyeIcon = ({ off }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="3" />
    {off && <path d="M4 20 20 4" />}
  </svg>
);

export default function AuthPage() {
  const { user, authenticate } = useAuth();
  const location = useLocation();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={location.state?.from || '/'} replace />;

  const isLogin = mode === 'login';
  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setNote('');
    setBusy(true);
    try {
      await authenticate(mode, email, password, remember);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const switchMode = () => {
    setMode(isLogin ? 'signup' : 'login');
    setError('');
    setNote('');
  };

  return (
    <div className="auth-page">
      <AuthArt />
      <main className="auth-card">
          <p className="auth-brand">Musiglot</p>
          <h1>{isLogin ? 'Welcome back!' : 'Create your account'}</h1>
          <p className="auth-tagline">Sing your way to a new language.</p>

          <form onSubmit={submit}>
           <div className="auth-fields">
            <div className="auth-box">
              <label htmlFor="auth-email">Email</label>
              <input id="auth-email" type="email" placeholder="Enter your email..." value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </div>
            <div className="auth-box">
              <label htmlFor="auth-password">Password</label>
              <div className="auth-password">
                <input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder={isLogin ? 'Enter your password...' : 'Choose a password (6+ characters)...'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                />
                <button type="button" className="auth-eye" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}>
                  <EyeIcon off={!showPassword} />
                </button>
              </div>
            </div>

           </div>
            {error && <p className="auth-error" role="alert">{error}</p>}

            <button className="auth-submit" disabled={busy}>
              {busy ? 'Please wait…' : isLogin ? 'Log in' : 'Sign up'}
            </button>

            <div className="auth-row">
              {isLogin ? (
                <button type="button" className="auth-link" onClick={() => setNote('Password reset is not set up yet. For now, create a new account with another email.')}>
                  Forgot your password?
                </button>
              ) : (
                <span />
              )}
              <label className="auth-remember">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                Remember me
              </label>
            </div>
            {note && <p className="auth-note" role="status">{note}</p>}
          </form>

          <p className="auth-switch">
            {isLogin ? "Don't have an account? " : 'Already have an account? '}
            <button type="button" className="auth-link" onClick={switchMode}>
              {isLogin ? 'Sign up' : 'Log in'}
            </button>
          </p>
      </main>
    </div>
  );
}
