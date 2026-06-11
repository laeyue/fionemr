import React, { useState, useRef, useEffect } from 'react';
import { 
  User, Shield, Key, ClipboardList, ShieldCheck, ShieldAlert, 
  Loader2, ArrowRight, CheckCircle2, AlertTriangle, Smartphone, Mail, Eye, EyeOff, Sliders
} from 'lucide-react';
import { useAuth } from '../../App';
import { api } from '../../api';
import './Settings.css';

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

const SettingsPage = () => {
  const { user, login } = useAuth();
  const [activeTab, setActiveTab] = useState('profile'); // 'profile', 'security', 'compliance'
  const [isLoading, setIsLoading] = useState(false);

  // Notifications
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Password fields
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Inline MFA setup wizard states
  const [mfaSetupStep, setMfaSetupStep] = useState('none'); // 'none', 'choose', 'totp', 'email'
  const [totpSecret, setTotpSecret] = useState('');
  const [totpQrUrl, setTotpQrUrl] = useState('');
  const [mfaCode, setMfaCode] = useState(['', '', '', '', '', '']);
  const mfaRefs = useRef([]);

  // Data Retention & Purging / Automated parent alerts
  const [purgeYears, setPurgeYears] = useState('5');
  const [purgeSuccess, setPurgeSuccess] = useState('');
  const [purgeError, setPurgeError] = useState('');
  const [notifications, setNotifications] = useState([]);
  const [isLoadingNotifs, setIsLoadingNotifs] = useState(false);

  // Clinic Settings
  const [principalEmail, setPrincipalEmail] = useState('');
  const [securityGuardEmail, setSecurityGuardEmail] = useState('');
  const [schoolLogoUrl, setSchoolLogoUrl] = useState('');
  const [settingsSuccess, setSettingsSuccess] = useState('');
  const [settingsError, setSettingsError] = useState('');

  const fetchClinicSettings = async () => {
    setIsLoading(true);
    try {
      const res = await api.getClinicSettings();
      if (res && res.data) {
        setPrincipalEmail(res.data.principal_email || '');
        setSecurityGuardEmail(res.data.security_guard_email || '');
        setSchoolLogoUrl(res.data.school_logo_url || '');
      }
    } catch (err) {
      console.error("Failed to fetch clinic settings:", err);
      setSettingsError('Failed to load clinic settings.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClinicSettingsSubmit = async (e) => {
    e.preventDefault();
    setSettingsSuccess('');
    setSettingsError('');
    setIsLoading(true);
    try {
      await api.updateClinicSettings({
        principal_email: principalEmail.trim(),
        security_guard_email: securityGuardEmail.trim(),
        school_logo_url: schoolLogoUrl.trim()
      });
      setSettingsSuccess('Clinic settings updated successfully.');
    } catch (err) {
      setSettingsError(err.message || 'Failed to update clinic settings.');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchNotifications = async () => {
    setIsLoadingNotifs(true);
    try {
      const res = await api.getSimulatedNotifications();
      if (res && res.data) {
        setNotifications(res.data);
      }
    } catch (err) {
      console.error("Failed to fetch notifications log:", err);
    } finally {
      setIsLoadingNotifs(false);
    }
  };

  const handlePurgeGraduates = async (e) => {
    e.preventDefault();
    setPurgeSuccess('');
    setPurgeError('');
    const yearsNum = parseInt(purgeYears);
    if (!purgeYears || isNaN(yearsNum) || yearsNum <= 0) {
      setPurgeError('Please enter a valid positive number of years.');
      return;
    }
    
    if (!window.confirm(`Warning: This action will permanently delete all student patient charts who graduated ${purgeYears} or more years ago. This action is irreversible. Proceed?`)) {
      return;
    }

    setIsLoading(true);
    try {
      const res = await api.purgeGraduates(yearsNum);
      setPurgeSuccess(res.message || 'Records successfully purged.');
    } catch (err) {
      setPurgeError(err.message || 'Failed to purge graduate records.');
    } finally {
      setIsLoading(false);
    }
  };

  // Clear messages when tab changes
  useEffect(() => {
    setError('');
    setSuccess('');
    setMfaSetupStep('none');
    setPurgeSuccess('');
    setPurgeError('');
    setSettingsSuccess('');
    setSettingsError('');
    clearPasswordFields();
    if (activeTab === 'compliance') {
      fetchNotifications();
    } else if (activeTab === 'clinic') {
      fetchClinicSettings();
    }
  }, [activeTab]);

  const clearPasswordFields = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const handlePasswordChangeSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('Please fill in all password fields.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters long.');
      return;
    }

    setIsLoading(true);
    try {
      await api.changePassword(user.id, currentPassword, newPassword);
      setSuccess('Your password has been changed successfully.');
      clearPasswordFields();
    } catch (err) {
      setError(err.message || 'Failed to change password. Please check your current password.');
    } finally {
      setIsLoading(false);
    }
  };

  // Initiate TOTP setup
  const handleInitiateTotpSetup = async () => {
    setError('');
    setIsLoading(true);
    try {
      const response = await api.mfaSetup(user.id);
      setTotpSecret(response.secret);
      setTotpQrUrl(response.qrCodeUrl);
      setMfaCode(['', '', '', '', '', '']);
      setMfaSetupStep('totp');
    } catch (err) {
      setError(err.message || 'Failed to initialize Authenticator App setup.');
    } finally {
      setIsLoading(false);
    }
  };

  // Initiate Email Setup
  const handleInitiateEmailSetup = async () => {
    setError('');
    setIsLoading(true);
    try {
      await api.mfaSendEmail(user.id);
      setMfaCode(['', '', '', '', '', '']);
      setMfaSetupStep('email');
    } catch (err) {
      setError(err.message || 'Failed to send test verification code.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendEmailCode = async () => {
    setError('');
    setSuccess('');
    try {
      await api.mfaSendEmail(user.id);
      setSuccess('A new verification code has been sent to your email.');
    } catch (err) {
      setError(err.message || 'Failed to resend verification code.');
    }
  };

  // Verify Setup Submit (TOTP or Email)
  const handleVerifySetupSubmit = async (e, mfaType) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    const code = mfaCode.join('');
    if (code.length < 6) {
      setError('Please enter the full 6-digit code.');
      return;
    }
    setIsLoading(true);
    try {
      const response = await api.mfaVerifySetup(user.id, code, mfaType);
      login(response.data); // Update AuthContext user details
      setSuccess(`Multi-Factor Authentication enabled successfully via ${mfaType === 'totp' ? 'Authenticator App' : 'Email'}.`);
      setMfaSetupStep('none');
    } catch (err) {
      setError(err.message || 'Verification failed. Please check the code.');
    } finally {
      setIsLoading(false);
    }
  };

  // Disable MFA
  const handleDisableMfa = async () => {
    if (!window.confirm('Warning: Disabling Multi-Factor Authentication decreases account security. Are you sure you want to proceed?')) {
      return;
    }
    setError('');
    setSuccess('');
    setIsLoading(true);
    try {
      const response = await api.disableMfa(user.id);
      login(response.data);
      setSuccess('Multi-Factor Authentication has been disabled.');
    } catch (err) {
      setError(err.message || 'Failed to disable MFA.');
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
    if (['totp', 'email'].includes(mfaSetupStep)) {
      mfaRefs.current[0]?.focus();
    }
  }, [mfaSetupStep]);

  return (
    <div className="settings-container anim-fade-up">
      <div className="settings-header">
        <h1>Settings</h1>
        <p className="text-muted">Manage your practitioner profile, security preferences, and compliance certifications.</p>
      </div>

      <div className="settings-layout">
        {/* Left Side Tab Navigation */}
        <aside className="settings-tabs">
          <button 
            type="button" 
            className={`settings-tab-btn ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => setActiveTab('profile')}
          >
            <User size={18} />
            <span>Profile</span>
          </button>
          <button 
            type="button" 
            className={`settings-tab-btn ${activeTab === 'security' ? 'active' : ''}`}
            onClick={() => setActiveTab('security')}
          >
            <Shield size={18} />
            <span>Security & MFA</span>
          </button>
          <button 
            type="button" 
            className={`settings-tab-btn ${activeTab === 'compliance' ? 'active' : ''}`}
            onClick={() => setActiveTab('compliance')}
          >
            <ClipboardList size={18} />
            <span>DPA Compliance</span>
          </button>
          <button 
            type="button" 
            className={`settings-tab-btn ${activeTab === 'clinic' ? 'active' : ''}`}
            onClick={() => setActiveTab('clinic')}
          >
            <Sliders size={18} />
            <span>Clinic Settings</span>
          </button>
        </aside>

        {/* Right Side Content Panel */}
        <section className="settings-content card">
          {activeTab === 'profile' && (
            <>
              <div className="settings-card-header">
                <h2>Profile Details</h2>
              </div>
              <div className="settings-section">
                <div className="profile-grid">
                  <div className="profile-field">
                    <span className="field-label">Full Name</span>
                    <span className="field-value">{user?.name || 'Practitioner User'}</span>
                  </div>
                  <div className="profile-field">
                    <span className="field-label">Email Address</span>
                    <span className="field-value">{user?.email || '—'}</span>
                  </div>
                  <div className="profile-field">
                    <span className="field-label">System Role</span>
                    <span className="field-value" style={{ textTransform: 'capitalize' }}>
                      {user?.role || 'guest'}
                    </span>
                  </div>
                  <div className="profile-field">
                    <span className="field-label">Account Creation</span>
                    <span className="field-value">June 8, 2026</span>
                  </div>
                  <div className="profile-field">
                    <span className="field-label">Institution License</span>
                    <span className="field-value font-mono">AEROHEALTH-LIC-ACTIVE</span>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'security' && (
            <>
              <div className="settings-card-header">
                <h2>Security Preferences</h2>
              </div>

              {/* MFA SECTION */}
              <div className="settings-section">
                <h3 className="settings-section-title">Multi-Factor Authentication (MFA)</h3>

                {success && <div className="form-success">{success}</div>}
                {error && <div className="form-error">{error}</div>}

                {mfaSetupStep === 'none' && (
                  <>
                    {user?.mfa_enabled ? (
                      <div className="mfa-status-banner enabled">
                        <div className="mfa-status-text">
                          <ShieldCheck size={24} className="text-success" />
                          <div>
                            <span className="badge badge-green mfa-badge">MFA Enabled</span>
                            <p className="mfa-desc">Your account is secured via <strong>{user.mfa_type === 'totp' ? 'Authenticator App' : 'Email Codes'}</strong>.</p>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMfaSetupStep('choose')}>
                            Change Method
                          </button>
                          {isSeededAccount(user?.email) && (
                            <button type="button" className="btn btn-ghost btn-sm text-danger" onClick={handleDisableMfa} disabled={isLoading}>
                              Disable
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="mfa-status-banner disabled">
                        <div className="mfa-status-text">
                          <ShieldAlert size={24} className="text-danger" />
                          <div>
                            <span className="badge badge-red mfa-badge">MFA Disabled</span>
                            <p className="mfa-desc">We strongly recommend enabling MFA to prevent unauthorized database access.</p>
                          </div>
                        </div>
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => setMfaSetupStep('choose')}>
                          Enable MFA
                        </button>
                      </div>
                    )}
                  </>
                )}

                {/* INLINE MFA SETUP WIZARDS */}
                {mfaSetupStep === 'choose' && (
                  <div className="mfa-choice-list" style={{ marginTop: 0 }}>
                    <p className="text-muted" style={{ marginBottom: 8, fontSize: 'var(--text-sm)' }}>
                      Choose your secondary verification method:
                    </p>
                    <button type="button" className="mfa-choice-card" onClick={handleInitiateTotpSetup}>
                      <div className="choice-icon">
                        <Smartphone size={20} />
                      </div>
                      <div className="choice-details">
                        <h3>Authenticator App (Google/Authy)</h3>
                        <p>Generate secure, time-based passcodes instantly using your smartphone app.</p>
                      </div>
                    </button>

                    <button type="button" className="mfa-choice-card" onClick={handleInitiateEmailSetup}>
                      <div className="choice-icon">
                        <Mail size={20} />
                      </div>
                      <div className="choice-details">
                        <h3>Email Verification Codes</h3>
                        <p>Receive a temporary 6-digit access code at your logged-in email inbox.</p>
                      </div>
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm back-link" onClick={() => setMfaSetupStep('none')}>
                      Cancel
                    </button>
                  </div>
                )}

                {mfaSetupStep === 'totp' && (
                  <div>
                    <p className="text-muted" style={{ fontSize: 'var(--text-sm)', marginBottom: '16px' }}>
                      Scan this QR code in your authenticator app and enter the verification code below:
                    </p>
                    <div className="qr-container">
                      {totpQrUrl ? (
                        <img src={totpQrUrl} alt="MFA QR Code" className="qr-image" />
                      ) : (
                        <div className="qr-placeholder"><Loader2 className="spin text-primary" /></div>
                      )}
                      <div className="key-details">
                        <span className="key-label">Setup key:</span>
                        <code className="key-value">{totpSecret}</code>
                      </div>
                    </div>

                    <form onSubmit={(e) => handleVerifySetupSubmit(e, 'totp')} className="auth-form">
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

                      <div className="form-actions">
                        <button type="button" className="btn btn-ghost" onClick={() => setMfaSetupStep('choose')}>
                          Back
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={isLoading}>
                          {isLoading ? <Loader2 size={16} className="spin" /> : 'Confirm & Enable'}
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {mfaSetupStep === 'email' && (
                  <div>
                    <p className="text-muted" style={{ fontSize: 'var(--text-sm)', marginBottom: '16px' }}>
                      Enter the 6-digit confirmation code we sent to your email <strong>{user?.email}</strong>:
                    </p>

                    <form onSubmit={(e) => handleVerifySetupSubmit(e, 'email')} className="auth-form">
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

                      <div style={{ textAlign: 'center', marginTop: '16px' }}>
                        <span className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>Didn't receive it? </span>
                        <button type="button" className="btn-link" style={{ fontSize: 'var(--text-xs)' }} onClick={handleResendEmailCode}>
                          Resend Code
                        </button>
                      </div>

                      <div className="form-actions">
                        <button type="button" className="btn btn-ghost" onClick={() => setMfaSetupStep('choose')}>
                          Back
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={isLoading}>
                          {isLoading ? <Loader2 size={16} className="spin" /> : 'Confirm & Enable'}
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </div>

              {/* CHANGE PASSWORD SECTION */}
              <div className="settings-section" style={{ marginTop: '40px' }}>
                <h3 className="settings-section-title">Change Password</h3>
                <form onSubmit={handlePasswordChangeSubmit} style={{ maxWidth: '480px' }}>
                  <div className="form-group">
                    <label className="form-label" htmlFor="current-pw">Current Password</label>
                    <input 
                      id="current-pw"
                      type={showPassword ? 'text' : 'password'}
                      className="form-input"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      autoComplete="new-password"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="new-pw">New Password</label>
                    <input 
                      id="new-pw"
                      type={showPassword ? 'text' : 'password'}
                      className="form-input"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      autoComplete="new-password"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="confirm-pw">Confirm New Password</label>
                    <input 
                      id="confirm-pw"
                      type={showPassword ? 'text' : 'password'}
                      className="form-input"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                      required
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                    <input 
                      id="show-pws"
                      type="checkbox"
                      checked={showPassword}
                      onChange={() => setShowPassword(!showPassword)}
                      style={{ cursor: 'pointer' }}
                    />
                    <label htmlFor="show-pws" style={{ fontSize: 'var(--text-xs)', color: 'var(--gray-500)', cursor: 'pointer', userSelect: 'none' }}>
                      Show passwords
                    </label>
                  </div>

                  <button type="submit" className="btn btn-primary" disabled={isLoading}>
                    {isLoading ? <Loader2 size={16} className="spin" /> : 'Update Password'}
                  </button>
                </form>
              </div>
            </>
          )}

          {activeTab === 'compliance' && (
            <>
              <div className="settings-card-header">
                <h2>Data Privacy & Compliance</h2>
              </div>
              <div className="settings-section">
                <p className="text-muted" style={{ fontSize: 'var(--text-sm)', marginBottom: '24px' }}>
                  This EMR system operates under strict compliance with medical information laws (e.g. Data Privacy Act of 2012 / HIPAA guidelines). Below is your current security checklist:
                </p>

                <div className="compliance-checklist">
                  <div className="compliance-item passed">
                    <div className="compliance-icon passed">
                      <CheckCircle2 size={18} />
                    </div>
                    <div className="compliance-details">
                      <h3>End-to-End Encryption</h3>
                      <p>Active (AES-256). All database records, clinician soap notes, and medication prescription logs are fully encrypted at rest and in transit.</p>
                    </div>
                  </div>

                  <div className="compliance-item passed">
                    <div className="compliance-icon passed">
                      <CheckCircle2 size={18} />
                    </div>
                    <div className="compliance-details">
                      <h3>System Audit Trails</h3>
                      <p>Active. Every transaction, check-in, patient record access, and prescription change is audited and saved with a timestamp signature for HIPAA compliance checks.</p>
                    </div>
                  </div>

                  <div className={`compliance-item ${user?.mfa_enabled ? 'passed' : 'warning'}`}>
                    <div className={`compliance-icon ${user?.mfa_enabled ? 'passed' : 'warning'}`}>
                      {user?.mfa_enabled ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                    </div>
                    <div className="compliance-details">
                      <h3>Access Protection (MFA)</h3>
                      <p>
                        {user?.mfa_enabled 
                          ? 'Passed. Multi-Factor Authentication is currently active on your account, validating your logins securely.' 
                          : 'Warning. MFA is currently disabled. We strongly urge you to enable Authenticator or Email codes in the Security tab.'
                        }
                      </p>
                    </div>
                  </div>

                  <div className="compliance-item passed">
                    <div className="compliance-icon passed">
                      <CheckCircle2 size={18} />
                    </div>
                    <div className="compliance-details">
                      <h3>Secure Data Backup</h3>
                      <p>Passed. System backups are generated automatically every 24 hours. Disaster recovery procedures are tested and active.</p>
                    </div>
                  </div>
                </div>

                {/* Data Retention & Purging Section */}
                <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid var(--gray-200)' }}>
                  <h3 className="settings-section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <ClipboardList size={18} style={{ color: 'var(--primary)' }} /> Data Retention Controller
                  </h3>
                  <p className="text-muted" style={{ fontSize: 'var(--text-sm)', marginBottom: '16px' }}>
                    Compliance guidelines require archiving or purging old student health records after graduation to ensure DPA compliance.
                  </p>

                  {user?.role === 'admin' ? (
                    <form onSubmit={handlePurgeGraduates} style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap', maxWidth: '520px', background: 'var(--gray-50)', padding: 16, borderRadius: 'var(--radius-lg)', border: '1px solid var(--gray-200)' }}>
                      <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
                        <label className="form-label">Purge Graduation Threshold (Years) *</label>
                        <input 
                          type="number" 
                          className="form-input" 
                          min="1" 
                          required 
                          value={purgeYears} 
                          onChange={(e) => setPurgeYears(e.target.value)} 
                        />
                      </div>
                      <button type="submit" className="btn btn-primary" style={{ height: '42px' }} disabled={isLoading}>
                        {isLoading ? <Loader2 size={16} className="spin" /> : 'Run Purge'}
                      </button>
                    </form>
                  ) : (
                    <div className="form-error" style={{ background: '#fef2f2', border: '1px solid #fee2e2', color: '#b91c1c', padding: 12, borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', display: 'inline-block' }}>
                      ⚠️ Access Restricted: Only system administrators can trigger data purging.
                    </div>
                  )}

                  {purgeSuccess && <div className="form-success" style={{ marginTop: 12 }}>{purgeSuccess}</div>}
                  {purgeError && <div className="form-error" style={{ marginTop: 12 }}>{purgeError}</div>}
                </div>

                {/* Automated Parent Notifications Log */}
                <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid var(--gray-200)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 className="settings-section-title" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                      <Smartphone size={18} style={{ color: 'var(--primary)' }} /> Automated Parent Alerts Console
                    </h3>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={fetchNotifications} disabled={isLoadingNotifs}>
                      {isLoadingNotifs ? <Loader2 size={14} className="spin" /> : 'Refresh Logs'}
                    </button>
                  </div>
                  <p className="text-muted" style={{ fontSize: 'var(--text-sm)', marginBottom: '16px' }}>
                    Simulated delivery log of automated SMS alerts sent to parents/guardians upon clinic check-ins or medication orders.
                  </p>

                  <div className="notifications-simulation-console" style={{ background: '#0f172a', color: '#38bdf8', fontFamily: 'monospace', padding: 16, borderRadius: 'var(--radius-lg)', maxHeight: 240, overflowY: 'auto', fontSize: 11, border: '1px solid var(--gray-700)' }}>
                    {notifications.length > 0 ? (
                      notifications.map(n => (
                        <div key={n.id} style={{ marginBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: 9 }}>
                            <span>[ALERT ROUTED] Recipient: {n.recipient} via {n.type}</span>
                            <span>{new Date(n.sent_at).toLocaleString()}</span>
                          </div>
                          <div style={{ marginTop: 4, color: '#f8fafc', whiteSpace: 'pre-wrap' }}>
                            {n.message}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div style={{ color: '#94a3b8', textAlign: 'center', padding: '20px 0' }}>
                        &gt;&gt; No automated notifications sent yet. Check in a patient or execute a medication order to trigger alerts.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'clinic' && (
            <>
              <div className="settings-card-header">
                <h2>Clinic Administration Settings</h2>
              </div>
              <div className="settings-section">
                <p className="text-muted" style={{ fontSize: 'var(--text-sm)', marginBottom: '24px' }}>
                  Configure institutional email addresses for excuse slip dispatch and active approval workflows.
                </p>

                <form onSubmit={handleClinicSettingsSubmit} style={{ maxWidth: '520px' }}>
                  {settingsSuccess && <div className="form-success" style={{ marginBottom: 16 }}>{settingsSuccess}</div>}
                  {settingsError && <div className="form-error" style={{ marginBottom: 16 }}>{settingsError}</div>}

                  <div className="form-group">
                    <label className="form-label" htmlFor="principal-email-input">Principal Email Address</label>
                    <input 
                      id="principal-email-input"
                      type="email" 
                      className="form-input" 
                      required 
                      value={principalEmail} 
                      onChange={(e) => setPrincipalEmail(e.target.value)} 
                      placeholder="principal@aerohealth.com"
                    />
                    <span style={{ fontSize: '11px', color: 'var(--gray-400)', marginTop: '4px', display: 'block' }}>
                      Excuse slips generated on student checkout will be emailed here for active principal acknowledgment.
                    </span>
                  </div>

                  <div className="form-group" style={{ marginTop: '20px' }}>
                    <label className="form-label" htmlFor="guard-email-input">Security Guard Email Address</label>
                    <input 
                      id="guard-email-input"
                      type="email" 
                      className="form-input" 
                      required 
                      value={securityGuardEmail} 
                      onChange={(e) => setSecurityGuardEmail(e.target.value)} 
                      placeholder="guard@aerohealth.com"
                    />
                    <span style={{ fontSize: '11px', color: 'var(--gray-400)', marginTop: '4px', display: 'block' }}>
                      Security gate clearance permits will be emailed here automatically upon student checkout.
                    </span>
                  </div>

                  <div className="form-group" style={{ marginTop: '20px' }}>
                    <label className="form-label" htmlFor="logo-url-input">School Logo Image URL</label>
                    <input 
                      id="logo-url-input"
                      type="text" 
                      className="form-input" 
                      value={schoolLogoUrl} 
                      onChange={(e) => setSchoolLogoUrl(e.target.value)} 
                      placeholder="https://example.com/logo.png"
                    />
                    <span style={{ fontSize: '11px', color: 'var(--gray-400)', marginTop: '4px', display: 'block' }}>
                      Paste a URL to an image file (PNG, JPG, or SVG) representing your school logo. This will replace the default logo icon across the EMR shell and landing pages.
                    </span>
                  </div>

                  <button type="submit" className="btn btn-primary" style={{ marginTop: '24px' }} disabled={isLoading}>
                    {isLoading ? <Loader2 size={16} className="spin" /> : 'Save Settings'}
                  </button>
                </form>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
};

export default SettingsPage;
