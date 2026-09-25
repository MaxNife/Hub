import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError, apiJSON } from '../api';
import { BrandMark, IconChevronRight } from '../components/Icons';

// Shown instead of the shell when Hub has a password and there's no session.
export function Login() {
  const qc = useQueryClient();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError('');
    try {
      await apiJSON('/api/login', { method: 'POST', json: { password } });
      await qc.invalidateQueries();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Hub isn’t answering. Is the server running?');
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login">
      <div className="login-card">
        <span className="brand login-brand"><BrandMark /><span className="brand-name">Hub</span></span>
        <h1>Welcome back</h1>
        <p className="form-lead">Enter your password to open Hub.</p>
        <form onSubmit={submit} className="login-form">
          <label htmlFor="password" className="sr-only">Password</label>
          <div className={`search-field${error ? ' has-error' : ''}`}>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              autoFocus
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!error}
              aria-describedby={error ? 'login-error' : undefined}
            />
            <button type="submit" className="ink-btn" disabled={!password || busy} aria-label="Sign in">
              {busy ? 'Signing in…' : <>Sign in<IconChevronRight size={16} /></>}
            </button>
          </div>
          {error && <p className="login-error" id="login-error" role="alert">{error}</p>}
        </form>
      </div>
    </main>
  );
}
