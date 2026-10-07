import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Bell, Smartphone, ShieldAlert, ArrowUpRight } from 'lucide-react';
import { api } from '../../api';
import { useAuth } from '../../App';

const AlertsPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeSubTab, setActiveSubTab] = useState('clinical');
  const [highRiskList, setHighRiskList] = useState([]);
  const [outbreak, setOutbreak] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [emailAlerts, setEmailAlerts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSendingNotif, setIsSendingNotif] = useState(false);
  const [emailConfig, setEmailConfig] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [retryingId, setRetryingId] = useState(null);

  const fetchAlertsData = useCallback(async () => {
    try {
      const [resStats, resNotifs, resEmailLogs, config] = await Promise.all([
        api.getDashboardStats(),
        user?.role === 'admin' ? api.getSimulatedNotifications() : Promise.resolve({ data: [] }),
        api.getEmailAlertLogs(),
        api.getEmailConfiguration()
      ]);
      setLoadError('');
      setEmailConfig(config.data);
      if (resStats) {
        setHighRiskList(resStats.highRiskPatients || []);
        setOutbreak(resStats.outbreakAlert || null);
      }

      if (resNotifs && resNotifs.data) {
        setNotifications(resNotifs.data);
      }

      if (resEmailLogs && resEmailLogs.data) {
        setEmailAlerts(resEmailLogs.data);
      }
    } catch (err) {
      setLoadError(err.message || 'Could not load notification logs.');
    } finally {
      setIsLoading(false);
    }
  }, [user?.role]);

  useEffect(() => {
    const initial = setTimeout(fetchAlertsData, 0);
    // Auto refresh logs every 10 seconds
    const interval = setInterval(fetchAlertsData, 10000);
    return () => { clearTimeout(initial); clearInterval(interval); };
  }, [fetchAlertsData]);

  const handleAlertParent = async (patientId, patientName) => {
    if (!window.confirm(`Email the parent or guardian on ${patientName}'s record to contact the clinic?`)) return;

    try {
      setIsSendingNotif(true);
      const result = await api.notifyPatientParent(patientId);
      
      // Re-fetch simulated logs
      const resEmailLogs = await api.getEmailAlertLogs();
      if (resEmailLogs && resEmailLogs.data) {
        setEmailAlerts(resEmailLogs.data);
      }
      const delivery = result.notifications?.[0];
      window.alert(delivery?.status === 'accepted' ? 'Email accepted by the provider. Inbox delivery is not yet confirmed.' : delivery?.status === 'simulated' ? 'Simulation recorded. No email was sent.' : delivery?.error || 'Email was not sent. Check the delivery log.');
    } catch (err) {
      alert('Failed to send notification: ' + err.message);
    } finally {
      setIsSendingNotif(false);
    }
  };

  const handleRetry = async (id) => {
    try {
      setRetryingId(id);
      const result = await api.retryEmail(id);
      if (result.data?.error) window.alert(result.data.error);
      await fetchAlertsData();
    } catch (error) { window.alert(error.message); }
    finally { setRetryingId(null); }
  };

  if (isLoading) return <div role="status" className="card" style={{ padding: 24 }}>Loading clinic alerts…</div>;
  if (loadError) return <div role="alert" className="card" style={{ padding: 24 }}><h2>Alerts unavailable</h2><p>{loadError}</p><p>Current clinical alert status could not be confirmed.</p><button className="btn btn-secondary" onClick={fetchAlertsData}>Retry</button></div>;

  return (
    <div className="alerts-page anim-fade-up" style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--gray-900)', margin: 0 }}>Emergency Alerts & Notifications</h1>
        <p className="text-muted" style={{ margin: '4px 0 0 0', fontSize: 'var(--text-sm)' }}>
          Monitor real-time clinical alarms, outbreak warnings, and verify automated communication with parents.
        </p>
      </div>

      {/* Outbreak Alert Banner */}
      {loadError && <div role="alert" className="card" style={{ padding: 16, color: 'var(--danger)' }}>{loadError}</div>}
      {outbreak && (
        <div 
          className="outbreak-banner"
          style={{ 
            background: 'var(--danger-bg)', 
            border: '2px solid var(--danger)', 
            borderRadius: 'var(--radius-lg)', 
            padding: '16px 20px', 
            display: 'flex', 
            alignItems: 'center', 
            gap: 16,
            animation: 'pulse 2s infinite' 
          }}
        >
          <div style={{ background: 'var(--danger)', color: '#fff', padding: '10px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShieldAlert size={24} style={{ color: '#fff' }} />
          </div>
          <div>
            <h4 style={{ margin: 0, color: '#b91c1c', fontSize: '14px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Potential Outbreak Warning ({outbreak.section})
            </h4>
            <p style={{ margin: '4px 0 0 0', color: '#7f1d1d', fontSize: '13px', fontWeight: 600 }}>
              {outbreak.message}
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 16, borderBottom: '1.5px solid var(--gray-200)', paddingBottom: 8, marginTop: 12 }}>
        <button 
          onClick={() => setActiveSubTab('clinical')}
          style={{
            background: 'none',
            border: 'none',
            padding: '8px 16px',
            fontSize: '14px',
            fontWeight: 700,
            cursor: 'pointer',
            color: activeSubTab === 'clinical' ? 'var(--primary)' : 'var(--gray-500)',
            borderBottom: activeSubTab === 'clinical' ? '2.5px solid var(--primary)' : 'none',
            transition: 'all 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          <AlertTriangle size={16} style={{ color: activeSubTab === 'clinical' ? 'var(--primary)' : 'var(--gray-500)' }} />
          Clinical Alerts
        </button>
        <button 
          onClick={() => setActiveSubTab('email')}
          style={{
            background: 'none',
            border: 'none',
            padding: '8px 16px',
            fontSize: '14px',
            fontWeight: 700,
            cursor: 'pointer',
            color: activeSubTab === 'email' ? 'var(--primary)' : 'var(--gray-500)',
            borderBottom: activeSubTab === 'email' ? '2.5px solid var(--primary)' : 'none',
            transition: 'all 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          <Smartphone size={16} style={{ color: activeSubTab === 'email' ? 'var(--primary)' : 'var(--gray-500)' }} />
          Email Delivery & Responses
        </button>
      </div>

      {/* Tab Contents */}
      {activeSubTab === 'clinical' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px', alignItems: 'flex-start' }}>
          
          {/* Left Side: High Risk Student Warnings */}
          <div className="card" style={{ padding: 24 }}>
            <h3 className="settings-section-title" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 16px 0', fontSize: '16px' }}>
              <AlertTriangle size={18} style={{ color: 'var(--primary)' }} /> High-Risk Vitals Warnings
            </h3>

            <p className="text-muted" style={{ fontSize: 'var(--text-xs)', marginBottom: '16px', lineHeight: '1.4' }}>
              Current clinic patients whose latest recorded vital signs are outside the configured thresholds.
            </p>

            {isLoading ? (
              <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--gray-400)' }}>Loading high risk alarms...</div>
            ) : highRiskList.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {highRiskList.map(item => (
                  <div 
                    key={item.id} 
                    style={{ 
                      padding: '16px', 
                      background: 'var(--gray-50)', 
                      border: '1.5px solid var(--danger)', 
                      borderLeft: '5px solid var(--danger)', 
                      borderRadius: 'var(--radius-lg)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12
                    }}
                  >
                    {/* Student Demographic block */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <strong style={{ fontSize: '14px', color: 'var(--gray-800)', display: 'block' }}>{item.name}</strong>
                        <span style={{ fontSize: '11px', color: 'var(--gray-500)' }}>
                          Section: {item.section} • Age: {item.age} • Gender: {item.gender}
                        </span>
                      </div>
                      <button 
                        onClick={() => navigate(`/dashboard/patients/${item.id}`)}
                        className="btn btn-secondary btn-sm"
                        style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                      >
                        View Chart <ArrowUpRight size={12} style={{ color: 'var(--primary)' }} />
                      </button>
                    </div>

                    {/* Active Alarms list */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {item.alerts.map(alert => (
                        <span 
                          key={alert} 
                          style={{ 
                            fontSize: '10px', 
                            background: 'var(--danger-bg)', 
                            color: 'var(--danger)', 
                            padding: '2px 8px', 
                            borderRadius: '10px', 
                            fontWeight: 700,
                            border: '1px solid var(--danger)'
                          }}
                        >
                          {alert.toUpperCase()}
                        </span>
                      ))}
                    </div>

                    {/* Vitals Summary Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '10px', padding: '10px', background: '#fff', borderRadius: 'var(--radius-md)', border: '1px solid var(--gray-200)', fontSize: '11px', textAlign: 'left' }}>
                      <div>
                        <span style={{ color: 'var(--gray-400)', display: 'block' }}>Temp</span>
                        <strong style={{ color: parseFloat(item.vitals.temperature) >= 38.0 ? 'var(--danger)' : 'var(--gray-800)' }}>
                          {item.vitals.temperature}°C
                        </strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--gray-400)', display: 'block' }}>Heart Rate</span>
                        <strong style={{ color: (item.vitals.heart_rate > 100 || item.vitals.heart_rate < 60) ? 'var(--danger)' : 'var(--gray-800)' }}>
                          {item.vitals.heart_rate} bpm
                        </strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--gray-400)', display: 'block' }}>Blood Press.</span>
                        <strong style={{ color: 'var(--gray-800)' }}>{item.vitals.blood_pressure}</strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--gray-400)', display: 'block' }}>O₂ Saturation</span>
                        <strong style={{ color: item.vitals.o2_sat < 95 ? 'var(--danger)' : 'var(--gray-800)' }}>
                          {item.vitals.o2_sat}%
                        </strong>
                      </div>
                    </div>

                    {/* Actions area */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
                      <button 
                        onClick={() => handleAlertParent(item.id, item.name)}
                        className="btn btn-primary btn-sm"
                        style={{ background: 'var(--primary)', color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}
                        disabled={isSendingNotif}
                      >
                        <Smartphone size={12} style={{ color: '#fff' }} /> Notify Parent
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-sm" style={{ padding: '60px 20px', border: '1.5px dashed var(--gray-200)', borderRadius: 'var(--radius-lg)', textAlign: 'center' }}>
                <Bell size={32} style={{ color: 'var(--primary)', margin: '0 auto 12px auto' }} />
                <h4 style={{ color: 'var(--gray-700)', margin: '0 0 4px 0' }}>No Active Alarms</h4>
                <p className="text-muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>There are no patients displaying emergency vital sign alarms currently.</p>
              </div>
            )}
          </div>

          {/* Right Side: Automated Parent Logs */}
          <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <h3 className="settings-section-title" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, fontSize: '16px' }}>
                <Smartphone size={18} style={{ color: 'var(--primary)' }} /> Automated Parent Logs
              </h3>
              <p className="text-muted" style={{ margin: '4px 0 0 0', fontSize: 'var(--text-xs)', lineHeight: '1.4' }}>
                Simulated delivery logs of system-generated notifications routed to parents via SMS/Email gateways.
              </p>
            </div>

            <div 
              className="notifications-simulation-console" 
              style={{ 
                background: '#0f172a', 
                color: '#38bdf8', 
                fontFamily: 'monospace', 
                padding: 16, 
                borderRadius: 'var(--radius-lg)', 
                height: '420px', 
                overflowY: 'auto', 
                fontSize: '11px', 
                border: '1px solid var(--gray-700)',
                textAlign: 'left'
              }}
            >
              {notifications.length > 0 ? (
                [...notifications].reverse().map(n => (
                  <div key={n.id} style={{ marginBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: '9px' }}>
                      <span>[ALERT DISPATCHED] {n.type}</span>
                      <span>{new Date(n.sent_at).toLocaleTimeString()}</span>
                    </div>
                    <div style={{ color: '#38bdf8', fontSize: '9px', marginTop: 2, fontWeight: 700 }}>
                      To: {n.recipient}
                    </div>
                    <div style={{ marginTop: 4, color: '#f8fafc', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>
                      {n.message}
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ color: '#94a3b8', textAlign: 'center', padding: '40px 0' }}>
                  &gt;&gt; No automated notifications sent yet.
                </div>
              )}
            </div>
          </div>
          
        </div>
      ) : (
        /* Email Active Response Verification Console */
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 className="settings-section-title" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, fontSize: '16px' }}>
                <Smartphone size={18} style={{ color: 'var(--primary)' }} /> Active Email Alerts Tracking & Verification
              </h3>
              <p className="text-muted" style={{ margin: '4px 0 0 0', fontSize: 'var(--text-xs)', lineHeight: '1.4' }}>
                Track provider acceptance separately from recipient responses. Acceptance does not confirm inbox delivery.
              </p>
            </div>
            <button 
              onClick={fetchAlertsData} 
              className="btn btn-secondary btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              Refresh Logs
            </button>
          </div>

          {emailConfig && <div role="status" style={{ padding: 12, marginBottom: 16, background: 'var(--gray-50)', borderRadius: 8 }}>
            {emailConfig.mode === 'simulate' ? 'Simulation mode: no external emails are sent.' : emailConfig.configured ? `Email sending configured via ${emailConfig.mode}. Sender: ${emailConfig.sender}` : `Email setup incomplete: ${emailConfig.missing.join(', ')}. Configure these values on the backend.`}
          </div>}

          {emailAlerts.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--gray-200)', textAlign: 'left' }}>
                    <th style={{ padding: '12px 8px', fontSize: '12px', fontWeight: 700, color: 'var(--gray-600)' }}>Student</th>
                    <th style={{ padding: '12px 8px', fontSize: '12px', fontWeight: 700, color: 'var(--gray-600)' }}>Recipient</th>
                    <th style={{ padding: '12px 8px', fontSize: '12px', fontWeight: 700, color: 'var(--gray-600)' }}>Subject</th>
                    <th style={{ padding: '12px 8px', fontSize: '12px', fontWeight: 700, color: 'var(--gray-600)' }}>Created At</th>
                    <th style={{ padding: '12px 8px', fontSize: '12px', fontWeight: 700, color: 'var(--gray-600)' }}>Delivery</th>
                    <th style={{ padding: '12px 8px', fontSize: '12px', fontWeight: 700, color: 'var(--gray-600)' }}>Status</th>
                    <th style={{ padding: '12px 8px', fontSize: '12px', fontWeight: 700, color: 'var(--gray-600)' }}>Verification Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {emailAlerts.map(alert => {
                    const isParent = alert.recipient_type === 'parent';
                    const isAcked = alert.acknowledged;
                    
                    return (
                      <tr 
                        key={alert.id} 
                        style={{ 
                          borderBottom: '1px solid var(--gray-100)', 
                          fontSize: '13px',
                          color: 'var(--gray-700)',
                          background: isAcked ? 'rgba(240, 253, 244, 0.4)' : 'transparent'
                        }}
                      >
                        <td style={{ padding: '12px 8px', fontWeight: 600 }}>{alert.student_name}</td>
                        <td style={{ padding: '12px 8px' }}>
                          <span 
                            style={{ 
                              fontSize: '11px', 
                              padding: '2px 8px', 
                              borderRadius: '10px', 
                              fontWeight: 700, 
                              marginRight: 8,
                              background: isParent ? '#e0f2fe' : '#fef3c7',
                              color: isParent ? '#0369a1' : '#b45309'
                            }}
                          >
                            {{ parent: 'Parent', adviser: 'Adviser', principal: 'Principal', security_guard: 'Security' }[alert.recipient_type] || alert.recipient_type}
                          </span>
                          <span className="font-mono text-muted" style={{ fontSize: '12px' }}>{alert.recipient_email}</span>
                        </td>
                        <td style={{ padding: '12px 8px', color: 'var(--gray-600)' }}>{alert.subject}</td>
                        <td style={{ padding: '12px 8px' }}>{new Date(alert.sent_at).toLocaleString()}</td>
                        <td style={{ padding: '12px 8px', minWidth: 170 }}>
                          <strong style={{ color: alert.delivery_status === 'failed' ? 'var(--danger)' : 'var(--gray-700)' }}>
                            {{ pending: 'Queued', sending: 'Sending', accepted: 'Provider accepted', simulated: 'Simulated', failed: 'Failed', unknown: 'Unconfirmed', cancelled: 'No longer applicable' }[alert.delivery_status] || 'Unconfirmed'}
                          </strong>
                          {alert.delivery_error && <div style={{ fontSize: 11, marginTop: 4 }}>{alert.delivery_error}</div>}
                          {alert.can_retry && <button className="btn btn-secondary btn-sm" disabled={retryingId !== null} onClick={() => handleRetry(alert.id)} style={{ marginTop: 6 }}>{retryingId === alert.id ? 'Retrying…' : 'Retry email'}</button>}
                        </td>
                        <td style={{ padding: '12px 8px' }}>
                          {isAcked ? (
                            <span 
                              style={{ 
                                fontSize: '11px', 
                                background: alert.response_status === 'On My Way' ? '#dbeafe' : '#dcfce7', 
                                color: alert.response_status === 'On My Way' ? '#1d4ed8' : '#15803d', 
                                padding: '2px 8px', 
                                borderRadius: '10px', 
                                fontWeight: 700
                              }}
                            >
                              {alert.response_status || 'Acknowledged'}
                            </span>
                          ) : (
                            <span 
                              style={{ 
                                fontSize: '11px', 
                                background: '#f3f4f6', 
                                color: '#4b5563', 
                                padding: '2px 8px', 
                                borderRadius: '10px', 
                                fontWeight: 700
                              }}
                            >
                              {alert.response_requested ? 'No response' : 'Not requested'}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '12px 8px', fontWeight: 600 }}>
                          {isAcked ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#166534' }}>
                              <span style={{ fontSize: '12px' }}>{new Date(alert.acknowledged_at).toLocaleString()}</span>
                            </div>
                          ) : (
                            <span className="text-muted" style={{ fontSize: '12px' }}>{['principal', 'security_guard'].includes(alert.recipient_type) ? 'See excuse slip record' : 'No response recorded'}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-sm" style={{ padding: '60px 20px', border: '1.5px dashed var(--gray-200)', borderRadius: 'var(--radius-lg)', textAlign: 'center' }}>
              <Bell size={32} style={{ color: 'var(--primary)', margin: '0 auto 12px auto' }} />
              <h4 style={{ color: 'var(--gray-700)', margin: '0 0 4px 0' }}>No Active Email Alerts Sent</h4>
              <p className="text-muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>Email alerts will appear here with verification logs after patient check-in.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AlertsPage;
