import React, { useState, useRef, useEffect } from 'react';
import { ShieldCheck, Lock, Eye, EyeOff, ArrowRight, Loader2, Activity, Mail, Smartphone, AlertCircle } from 'lucide-react';
import { useAuth } from '../../App';
import { api } from '../../api';
import './MinimalLanding.css';

const SEEDED_EMAILS = [
  'dev@aerohealth.com',
  'doctor@aerohealth.com',
  'nurse@aerohealth.com',
  'teacher@aerohealth.com',
  'counselor@aerohealth.com',
  'admin@aerohealth.com'
];

const isSeededAccount = (email) => {
  if (!email) return false;
  return SEEDED_EMAILS.includes(email.toLowerCase());
};

const MinimalLanding = () => {
  const { login } = useAuth();
  const [step, setStep] = useState('login'); // 'login', 'register', 'mfa_choose', 'mfa_setup_totp', 'mfa_setup_email', 'mfa'
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // Login states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [tempUser, setTempUser] = useState(null); // Stores intermediate credentials/profile

  // Registration states
  const [registerName, setRegisterName] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerRole, setRegisterRole] = useState('physician');

  // MFA Setup states
  const [totpSecret, setTotpSecret] = useState('');
  const [totpQrUrl, setTotpQrUrl] = useState('');

  // 6-digit MFA verification inputs
  const [mfaCode, setMfaCode] = useState(['', '', '', '', '', '']);
  const mfaRefs = useRef([]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    if (!email.trim() || !password.trim()) {
      setError('Please enter both email and password.');
      return;
    }
    setIsLoading(true);
    try {
      const response = await api.login({ email: email.trim(), password: password.trim() });
      if (response.mfaRequired) {
        setTempUser({ id: response.userId, userId: response.userId, email: response.email, mfaType: response.mfaType });
        if (response.mfaType === 'email') {
          await api.mfaSendEmail(response.userId);
        }
        setMfaCode(['', '', '', '', '', '']);
        setStep('mfa');
      } else {
        // Direct login if MFA not enabled, but prompt setup
        setTempUser(response.data);
        setStep('mfa_choose');
      }
    } catch (err) {
      setError(err.message || 'Failed to sign in. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    if (!registerName.trim() || !registerEmail.trim() || !registerPassword.trim() || !registerRole) {
      setError('Please fill in all fields.');
      return;
    }
    setIsLoading(true);
    try {
      await api.register({
        name: registerName.trim(),
        email: registerEmail.trim(),
        password: registerPassword.trim(),
        role: registerRole,
      });
      setSuccessMessage('Account created successfully! Please sign in.');
      setEmail(registerEmail.trim()); // Pre-fill email on login page
      setPassword(''); // Clear password
      setRegisterName('');
      setRegisterEmail('');
      setRegisterPassword('');
      setRegisterRole('physician');
      setStep('login');
    } catch (err) {
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Triggers TOTP Setup
  const handleInitiateTotpSetup = async () => {
    setError('');
    setIsLoading(true);
    try {
      const response = await api.mfaSetup(tempUser.id);
      setTotpSecret(response.secret);
      setTotpQrUrl(response.qrCodeUrl);
      setMfaCode(['', '', '', '', '', '']);
      setStep('mfa_setup_totp');
    } catch (err) {
      setError(err.message || 'Failed to initialize Authenticator App setup.');
    } finally {
      setIsLoading(false);
    }
  };

  // Triggers Email Setup
  const handleInitiateEmailSetup = async () => {
    setError('');
    setIsLoading(true);
    try {
      await api.mfaSendEmail(tempUser.id);
      setMfaCode(['', '', '', '', '', '']);
      setStep('mfa_setup_email');
    } catch (err) {
      setError(err.message || 'Failed to send test verification code.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendEmailCode = async () => {
    setError('');
    setSuccessMessage('');
    try {
      await api.mfaSendEmail(tempUser.id || tempUser.userId);
      setSuccessMessage('A new verification code has been sent to your email.');
    } catch (err) {
      setError(err.message || 'Failed to resend verification code.');
    }
  };

  // Verify Setup Submit (TOTP or Email)
  const handleVerifySetupSubmit = async (e, mfaType) => {
    e.preventDefault();
    setError('');
    const code = mfaCode.join('');
    if (code.length < 6) {
      setError('Please enter the full 6-digit code.');
      return;
    }
    setIsLoading(true);
    try {
      const response = await api.mfaVerifySetup(tempUser.id, code, mfaType);
      login(response.data);
    } catch (err) {
      setError(err.message || 'Verification failed. Please check the code.');
    } finally {
      setIsLoading(false);
    }
  };

  // Verify Login Code Submit (TOTP or Email)
  const handleVerifyMfaSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const code = mfaCode.join('');
    if (code.length < 6) {
      setError('Please enter the full 6-digit code.');
      return;
    }
    setIsLoading(true);
    try {
      const response = await api.mfaVerify(tempUser.id || tempUser.userId, code);
      login(response.data);
    } catch (err) {
      setError(err.message || 'Verification failed. Please check the code.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMfaInput = (index, value) => {
    if (value.length > 1) return;
    const next = [...mfaCode];
    next[index] = value;
    setMfaCode(next);
    if (value && index < 5) mfaRefs.current[index + 1]?.focus();
  };

  const handleMfaKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !mfaCode[index] && index > 0) {
      mfaRefs.current[index - 1]?.focus();
    }
  };

  useEffect(() => {
    if (['mfa_setup_totp', 'mfa_setup_email', 'mfa'].includes(step)) {
      mfaRefs.current[0]?.focus();
    }
  }, [step]);

  return (
    <div className="login-page">
      {/* Left panel — branding */}
      <div className="login-brand-panel">
        <div className="brand-content">
          <div className="brand-logo">
            <Activity size={28} />
          </div>
          <h1>AeroHealth</h1>
          <p>Advanced School Clinic Management & Real-time Health Analytics</p>
        </div>
        <div className="brand-footer">
          <span>Protected under the Data Privacy Act</span>
        </div>
        <div className="deco-circle deco-1"></div>
        <div className="deco-circle deco-2"></div>
      </div>

      {/* Right panel — form */}
      <div className="login-form-panel">
        <div className="login-form-wrapper anim-fade-up">
          {step === 'login' && (
            <>
              <div className="form-top">
                <ShieldCheck size={28} className="text-primary" />
                <h2>Sign in</h2>
                <p className="text-muted">Enter your credentials to access the system.</p>
              </div>

              {successMessage && <div className="form-success">{successMessage}</div>}
              {error && <div className="form-error">{error}</div>}

              <form onSubmit={handleLogin} className="auth-form" key="login">
                <div className="form-group">
                  <label className="form-label" htmlFor="login-email">Email Address</label>
                  <input
                    id="login-email"
                    type="email"
                    className="form-input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="username"
                    autoFocus
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
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                      required
                    />
                    <button type="button" className="pw-toggle" onClick={() => setShowPassword(!showPassword)} tabIndex={-1}>
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <button type="submit" className="btn btn-primary btn-lg submit-btn" disabled={isLoading}>
                  {isLoading ? <Loader2 size={20} className="spin" /> : <>Sign In <ArrowRight size={18} /></>}
                </button>

                <div className="auth-toggle">
                  <span className="text-muted">Don't have an account? </span>
                  <button type="button" className="btn-link" onClick={() => { setStep('register'); setError(''); setSuccessMessage(''); }}>
                    Sign Up
                  </button>
                </div>
              </form>
            </>
          )}

          {step === 'register' && (
            <>
              <div className="form-top">
                <ShieldCheck size={28} className="text-primary" />
                <h2>Create Account</h2>
                <p className="text-muted">Register a new practitioner profile.</p>
              </div>

              {error && <div className="form-error">{error}</div>}

              <form onSubmit={handleRegister} className="auth-form" key="register">
                <div className="form-group">
                  <label className="form-label" htmlFor="register-name">Full Name</label>
                  <input
                    id="register-name"
                    type="text"
                    className="form-input"
                    value={registerName}
                    onChange={(e) => setRegisterName(e.target.value)}
                    placeholder="e.g. Dr. Jane Doe"
                    autoComplete="name"
                    autoFocus
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="register-email">Email Address</label>
                  <input
                    id="register-email"
                    type="email"
                    className="form-input"
                    value={registerEmail}
                    onChange={(e) => setRegisterEmail(e.target.value)}
                    placeholder="name@aerohealth.com"
                    autoComplete="email"
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="register-password">Password</label>
                  <div className="pw-wrap">
                    <input
                      id="register-password"
                      type={showPassword ? 'text' : 'password'}
                      className="form-input"
                      value={registerPassword}
                      onChange={(e) => setRegisterPassword(e.target.value)}
                      autoComplete="new-password"
                      required
                    />
                    <button type="button" className="pw-toggle" onClick={() => setShowPassword(!showPassword)} tabIndex={-1}>
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="register-role">System Role</label>
                  <select
                    id="register-role"
                    className="form-select"
                    value={registerRole}
                    onChange={(e) => setRegisterRole(e.target.value)}
                    required
                  >
                    <option value="physician">Physician / Doctor</option>
                    <option value="nurse">Nurse</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>

                <button type="submit" className="btn btn-primary btn-lg submit-btn" disabled={isLoading}>
                  {isLoading ? <Loader2 size={20} className="spin" /> : <>Sign Up <ArrowRight size={18} /></>}
                </button>

                <div className="auth-toggle">
                  <span className="text-muted">Already have an account? </span>
                  <button type="button" className="btn-link" onClick={() => { setStep('login'); setError(''); setSuccessMessage(''); }}>
                    Sign In
                  </button>
                </div>
              </form>
            </>
          )}

          {step === 'mfa_choose' && (
            <>
              <div className="form-top">
                <ShieldCheck size={28} className="text-primary" />
                <h2>Secure Your Account</h2>
                <p className="text-muted">We strongly recommend enabling Multi-Factor Authentication to safeguard sensitive patient data.</p>
              </div>

              <div className="mfa-choice-list">
                <button type="button" className="mfa-choice-card" onClick={handleInitiateTotpSetup}>
                  <div className="choice-icon">
                    <Smartphone size={24} />
                  </div>
                  <div className="choice-details">
                    <h3>Authenticator App</h3>
                    <p>Use Google Authenticator, Authy, or Microsoft Authenticator to generate time-based codes.</p>
                  </div>
                </button>

                <button type="button" className="mfa-choice-card" onClick={handleInitiateEmailSetup}>
                  <div className="choice-icon">
                    <Mail size={24} />
                  </div>
                  <div className="choice-details">
                    <h3>Email Verification</h3>
                    <p>Receive a one-time passcode at your registered email address.</p>
                  </div>
                </button>
              </div>

              {isSeededAccount(tempUser?.email) ? (
                <button type="button" className="btn btn-ghost back-link" onClick={() => login(tempUser)}>
                  Skip for now
                </button>
              ) : (
                <p className="text-muted text-center" style={{ marginTop: '16px', fontSize: '11px' }}>
                  Multi-Factor Authentication (MFA) is mandatory for non-seeded accounts. Please choose a method above.
                </p>
              )}
            </>
          )}

          {step === 'mfa_setup_totp' && (
            <>
              <div className="form-top">
                <ShieldCheck size={28} className="text-primary" />
                <h2>Set Up Authenticator</h2>
                <p className="text-muted">Scan the QR code below using your authenticator app.</p>
              </div>

              {error && <div className="form-error">{error}</div>}

              <div className="qr-container">
                {totpQrUrl ? (
                  <img src={totpQrUrl} alt="MFA QR Code" className="qr-image" />
                ) : (
                  <div className="qr-placeholder"><Loader2 className="spin text-primary" /></div>
                )}
                <div className="key-details">
                  <span className="key-label">Or enter setup key manually:</span>
                  <code className="key-value">{totpSecret}</code>
                </div>
              </div>

              <form onSubmit={(e) => handleVerifySetupSubmit(e, 'totp')} className="auth-form" key="mfa_setup_totp">
                <label className="form-label" style={{ textAlign: 'center', marginBottom: '12px' }}>
                  Enter the 6-digit code from your app:
                </label>
                <div className="mfa-digits">
                  {mfaCode.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => (mfaRefs.current[i] = el)}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      className="mfa-digit"
                      value={digit}
                      onChange={(e) => handleMfaInput(i, e.target.value.replace(/\D/g, ''))}
                      onKeyDown={(e) => handleMfaKeyDown(i, e)}
                      autoComplete="off"
                    />
                  ))}
                </div>

                <button type="submit" className="btn btn-primary btn-lg submit-btn" disabled={isLoading}>
                  {isLoading ? <Loader2 size={20} className="spin" /> : <>Verify & Enable <ArrowRight size={18} /></>}
                </button>

                <button type="button" className="btn btn-ghost back-link" onClick={() => setStep('mfa_choose')}>
                  ← Back
                </button>
              </form>
            </>
          )}

          {step === 'mfa_setup_email' && (
            <>
              <div className="form-top">
                <Mail size={28} className="text-primary" style={{ marginBottom: '16px' }} />
                <h2>Verify Your Email</h2>
                <p className="text-muted">Enter the 6-digit code sent to <strong>{tempUser?.email}</strong>.</p>
              </div>

              {successMessage && <div className="form-success">{successMessage}</div>}
              {error && <div className="form-error">{error}</div>}

              <form onSubmit={(e) => handleVerifySetupSubmit(e, 'email')} className="auth-form" key="mfa_setup_email">
                <div className="mfa-digits">
                  {mfaCode.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => (mfaRefs.current[i] = el)}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      className="mfa-digit"
                      value={digit}
                      onChange={(e) => handleMfaInput(i, e.target.value.replace(/\D/g, ''))}
                      onKeyDown={(e) => handleMfaKeyDown(i, e)}
                      autoComplete="off"
                    />
                  ))}
                </div>

                <button type="submit" className="btn btn-primary btn-lg submit-btn" disabled={isLoading}>
                  {isLoading ? <Loader2 size={20} className="spin" /> : <>Verify & Enable <ArrowRight size={18} /></>}
                </button>

                <div className="auth-toggle">
                  <span className="text-muted">Didn't receive the code? </span>
                  <button type="button" className="btn-link" onClick={handleResendEmailCode} disabled={isLoading}>
                    Resend Code
                  </button>
                </div>

                <button type="button" className="btn btn-ghost back-link" onClick={() => setStep('mfa_choose')}>
                  ← Back
                </button>
              </form>
            </>
          )}

          {step === 'mfa' && (
            <>
              <div className="form-top">
                <div className="mfa-ring">
                  <Lock size={22} />
                </div>
                <h2>Security Verification</h2>
                <p className="text-muted">
                  {tempUser?.mfaType === 'totp' 
                    ? 'Enter the 6-digit code generated by your Authenticator app.'
                    : `Enter the 6-digit verification code sent to ${tempUser?.email}.`
                  }
                </p>
              </div>

              {successMessage && <div className="form-success">{successMessage}</div>}
              {error && <div className="form-error">{error}</div>}

              <form onSubmit={handleVerifyMfaSubmit} className="auth-form" key="mfa">
                <div className="mfa-digits">
                  {mfaCode.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => (mfaRefs.current[i] = el)}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      className="mfa-digit"
                      value={digit}
                      onChange={(e) => handleMfaInput(i, e.target.value.replace(/\D/g, ''))}
                      onKeyDown={(e) => handleMfaKeyDown(i, e)}
                      autoComplete="off"
                    />
                  ))}
                </div>

                <button type="submit" className="btn btn-primary btn-lg submit-btn" disabled={isLoading}>
                  {isLoading ? <Loader2 size={20} className="spin" /> : <>Verify <ArrowRight size={18} /></>}
                </button>

                {tempUser?.mfaType === 'email' && (
                  <div className="auth-toggle">
                    <span className="text-muted">Didn't receive the code? </span>
                    <button type="button" className="btn-link" onClick={handleResendEmailCode} disabled={isLoading}>
                      Resend Code
                    </button>
                  </div>
                )}

                <button type="button" className="btn btn-ghost back-link" onClick={() => { setStep('login'); setError(''); setMfaCode(['', '', '', '', '', '']); }}>
                  ← Back to sign in
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default MinimalLanding;

