import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Activity, ArrowRight, Eye, EyeOff, Loader2, LockKeyhole } from 'lucide-react';
import { useAuth } from '../../auth-context';
import { api } from '../../api';
import './MinimalLanding.css';

const MinimalLanding = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (event) => {
    event.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const response = await api.login({ email: email.trim(), password });
      login(response.data);
      const destination = location.state?.from;
      navigate(typeof destination === 'string' && destination.startsWith('/dashboard') ? destination : '/dashboard', { replace: true });
    } catch (loginError) {
      setError(loginError.message || 'Unable to sign in. Check your email and password.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-brand-panel">
        <div className="ecg-waveform-bg" aria-hidden="true">
          <svg viewBox="0 0 1000 300" className="ecg-svg" preserveAspectRatio="none">
            <path d="M0,150 L200,150 L220,130 L240,170 L260,150 L350,150 L370,100 L390,200 L410,130 L430,160 L450,150 L600,150 L620,130 L640,170 L660,150 L750,150 L770,50 L790,250 L810,130 L830,160 L850,150 L1000,150" className="ecg-line" />
          </svg>
        </div>
        <div className="brand-content">
          <div className="brand-logo"><Activity size={28} /></div>
          <h1>OLPHA AeroHealth</h1>
          <p>School Clinic Management</p>
        </div>
        <div className="brand-footer"><span>Authorized clinic staff only</span></div>
        <div className="deco-circle deco-1" />
        <div className="deco-circle deco-2" />
      </div>

      <div className="login-form-panel">
        <div className="login-form-wrapper anim-fade-up">
          <div className="form-top">
            <LockKeyhole size={28} className="text-primary" />
            <h2>Sign in</h2>
            <p className="text-muted">Use your clinic email and password to continue.</p>
          </div>

          {error && <div className="form-error" role="alert">{error}</div>}

          <form onSubmit={handleLogin} className="auth-form">
            <div className="form-group">
              <label className="form-label" htmlFor="login-email">Email address</label>
              <input
                id="login-email"
                type="email"
                className="form-input"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="username"
                autoFocus
                maxLength={254}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="login-password">Password</label>
              <div className="pw-wrap">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  maxLength={128}
                  required
                />
                <button
                  type="button"
                  className="pw-toggle"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <p className="text-muted" style={{ fontSize: 'var(--text-xs)', marginTop: 8 }}>
                Passwords must be at least 15 characters long.
              </p>
            </div>

            <button type="submit" className="btn btn-primary btn-lg submit-btn" disabled={isLoading}>
              {isLoading ? <Loader2 size={20} className="spin" /> : <>Sign in <ArrowRight size={18} /></>}
            </button>
          </form>

          <p className="text-muted text-center" style={{ marginTop: 24, fontSize: 'var(--text-sm)' }}>
            Need an account? Contact your system administrator.
          </p>
        </div>
      </div>
    </div>
  );
};

export default MinimalLanding;
