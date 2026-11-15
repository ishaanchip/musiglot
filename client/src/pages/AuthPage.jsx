import React, { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

const icon = { width: 26, height: 26, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
const UserIcon = () => (
  <svg {...icon}>
    <circle cx="12" cy="8" r="3.6" />
    <path d="M4.5 20c.6-3.6 3.6-5.6 7.5-5.6s6.900 2 7.500 5.600" />
  </svg>
);
const LockIcon = () => (
  <svg {...icon}>
    <rect x="5.500" y="10.500" width="13" height="9.500" rx="2.200" />
    <path d="M8.500 10.500V8a3.500 3.500 0 0 1 7 0v2.500" />
  </svg>
);
const ArrowIcon = () => (
  <svg {...icon} width={24} height={24} strokeWidth={2}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export default function AuthPage() {
  const { user, authenticate } = useAuth();
  const location = useLocation();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
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
      <main className="auth-column">
        <p className="auth-brand">Musiglot</p>
        <h1>{isLogin ? 'Log in' : 'Sign up'}</h1>
        <form onSubmit={submit} noValidate={false}>
          <label htmlFor="auth-email">Email</label>
          <div className="auth-field">
            <UserIcon />
            <input id="auth-email" type="email" placeholder="Enter your email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </div>

          <label htmlFor="auth-password">Password</label>
          <div className="auth-field">
            <LockIcon />
            <input
              id="auth-password"
              type="password"
              placeholder={isLogin ? 'Enter your password' : 'Choose a password (6+ characters)'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={isLogin ? 'current-password' : 'new-password'}
            />
          </div>

          <div className="auth-row">
            <label className="auth-remember">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              Remember me
            </label>
            {isLogin && (
              <button type="button" className="auth-link" onClick={() => setNote('Password reset is not set up yet. For now, create a new account with another email.')}>
                Forgot password?
              </button>
            )}
          </div>

          {error && <p className="auth-error" role="alert">{error}</p>}
          {note && <p className="auth-note" role="status">{note}</p>}

          <button className="auth-submit" disabled={busy}>
            {busy ? 'Please wait…' : isLogin ? 'Log in' : 'Sign up'}
            {!busy && <ArrowIcon />}
          </button>
        </form>
        <p className="auth-switch">
          <button type="button" className="auth-link" onClick={switchMode}>
            {isLogin ? 'New here? Create an account' : 'Already have an account? Log in'}
          </button>
        </p>
      </main>
    </div>
  );
}
