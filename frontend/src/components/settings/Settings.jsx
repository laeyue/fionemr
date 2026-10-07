import { useState } from 'react';
import { 
  User, Shield, ClipboardList, Loader2, AlertTriangle, Smartphone, Sliders
} from 'lucide-react';
import { useAuth } from '../../App';
import { api } from '../../api';
import './Settings.css';

const SettingsPage = () => {
  const { user } = useAuth();
  const canManageClinic = ['physician', 'nurse', 'admin'].includes(user?.role);
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

  const clearPasswordFields = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const changeTab = (tab) => {
    setActiveTab(tab);
    setError('');
    setSuccess('');
    setPurgeSuccess('');
    setPurgeError('');
    setSettingsSuccess('');
    setSettingsError('');
    clearPasswordFields();
    if (tab === 'clinic' && canManageClinic) fetchClinicSettings();
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

    if (newPassword.length < 15) {
      setError('New password must be at least 15 characters long.');
      return;
    }

    setIsLoading(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setSuccess('Your password has been changed successfully.');
      clearPasswordFields();
    } catch (err) {
      setError(err.message || 'Failed to change password. Please check your current password.');
    } finally {
      setIsLoading(false);
    }
  };

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
            onClick={() => changeTab('profile')}
          >
            <User size={18} />
            <span>Profile</span>
          </button>
          <button 
            type="button" 
            className={`settings-tab-btn ${activeTab === 'security' ? 'active' : ''}`}
            onClick={() => changeTab('security')}
          >
            <Shield size={18} />
            <span>Password & Security</span>
          </button>
          <button 
            type="button" 
            className={`settings-tab-btn ${activeTab === 'compliance' ? 'active' : ''}`}
            onClick={() => changeTab('compliance')}
          >
            <ClipboardList size={18} />
            <span>DPA Compliance</span>
          </button>
          {canManageClinic && <button
            type="button"
            className={`settings-tab-btn ${activeTab === 'clinic' ? 'active' : ''}`}
            onClick={() => changeTab('clinic')}
          >
            <Sliders size={18} />
            <span>Clinic Settings</span>
          </button>}
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
                    <span className="field-value">{user?.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}</span>
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
              <div className="settings-section">
                <h3 className="settings-section-title">Change Password</h3>
                {success && <div className="form-success">{success}</div>}
                {error && <div className="form-error">{error}</div>}
                <p className="text-muted" style={{ fontSize: 'var(--text-sm)', marginBottom: 16 }}>
                  Use a password with at least 15 characters. Changing it signs out your other active sessions.
                </p>
                <form onSubmit={handlePasswordChangeSubmit} style={{ maxWidth: '480px' }}>
                  <div className="form-group">
                    <label className="form-label" htmlFor="current-pw">Current Password</label>
                    <input
                      id="current-pw"
                      type={showPassword ? 'text' : 'password'}
                      className="form-input"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      autoComplete="current-password"
                      maxLength={128}
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
                      minLength={15}
                      maxLength={128}
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
                      minLength={15}
                      maxLength={128}
                      required
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
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
                  Review the controls implemented by the application and the operational controls that still need to be configured by your organization:
                </p>

                <div className="compliance-checklist">
                  <div className="compliance-item passed">
                    <div className="compliance-icon passed"><Shield size={18} /></div>
                    <div className="compliance-details">
                      <h3>Account access</h3>
                      <p>Sign-in uses email and password. Passwords use scrypt hashing, API sessions expire after eight hours, and staff roles are loaded from the account record.</p>
                    </div>
                  </div>
                  <div className="compliance-item passed">
                    <div className="compliance-icon passed"><ClipboardList size={18} /></div>
                    <div className="compliance-details">
                      <h3>Application audit events</h3>
                      <p>Successful authenticated API requests and sign-in attempts are recorded with timestamps. This does not represent an independent compliance audit.</p>
                    </div>
                  </div>
                  <div className="compliance-item warning">
                    <div className="compliance-icon warning"><AlertTriangle size={18} /></div>
                    <div className="compliance-details">
                      <h3>Hosting, encryption, and backups</h3>
                      <p>Configure and verify encryption, backup retention, and recovery with your database and hosting providers. These settings are not confirmed by this application.</p>
                    </div>
                  </div>
                  <div className="compliance-item warning">
                    <div className="compliance-icon warning"><AlertTriangle size={18} /></div>
                    <div className="compliance-details">
                      <h3>Compliance review</h3>
                      <p>This screen does not certify legal or regulatory compliance. Complete an organizational risk assessment and review vendor agreements before storing real patient records.</p>
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

                {user?.role === 'admin' && <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid var(--gray-200)' }}>
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
                            <span>[SIMULATED] {n.type}</span>
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
                </div>}
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
