import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UserCheck, Bed, AlertTriangle, FileText,
  ArrowUpRight, Calendar, ChevronLeft, ChevronRight,
  Activity, Users, TrendingUp, Clock, Pill, Home, LogOut
} from 'lucide-react';
import { useAuth } from '../../App';
import { api } from '../../api';
import heroImg from '../../assets/hero-illustration.png';
import './DashboardHome.css';

const DashboardHome = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const now = new Date();
  const isRestrictedRole = user?.role !== 'physician' && user?.role !== 'nurse';
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening';

  /* Date selector state */
  const [selectedDate, setSelectedDate] = useState(now);
  const [stats, setStats] = useState({
    totalPatients: 0,
    checkinsToday: 0,
    activeAlerts: 0,
    bedsOccupied: 0,
    paracetamolStock: 120,
    sentHomeToday: 0,
    occupiedBedsList: [],
    highRiskPatients: []
  });
  const [trends, setTrends] = useState({ Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0 });
  const [recentPatients, setRecentPatients] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeTick, setTimeTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeTick(t => t + 1);
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const formatDuration = (entryTime) => {
    if (!entryTime) return '—';
    const diffMs = Date.now() - new Date(entryTime).getTime();
    if (diffMs < 0) return 'Just now';
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) {
      return `${diffMins}m`;
    }
    const diffHours = Math.floor(diffMins / 60);
    const remainingMins = diffMins % 60;
    if (diffHours < 24) {
      return `${diffHours}h ${remainingMins}m`;
    }
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d`;
  };

  const getDays = () => {
    const days = [];
    for (let i = -3; i <= 3; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() + i);
      days.push(d);
    }
    return days;
  };

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const [statsRes, trendsRes, patientsRes] = await Promise.all([
        api.getDashboardStats(),
        api.getDashboardTrends(),
        api.getPatients()
      ]);
      if (statsRes) setStats(statsRes);
      if (trendsRes && trendsRes.data) setTrends(trendsRes.data);
      if (patientsRes && patientsRes.data) {
        // Take the 3 most recently created patients
        const sorted = [...patientsRes.data]
          .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
          .slice(0, 3);
        setRecentPatients(sorted);
      }
    } catch (err) {
      console.error("Error fetching dashboard data:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchActivityFeed = async (date) => {
    try {
      const dateStr = date.toISOString().split('T')[0];
      const res = await api.getDashboardActivity(dateStr);
      if (res && res.data) {
        setActivity(res.data);
      }
    } catch (err) {
      console.error("Error fetching activity feed:", err);
    }
  };

  const handleQuickCheckOut = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to check out this student?")) return;
    try {
      await api.checkOutPatient(id);
      fetchDashboardData();
      fetchActivityFeed(selectedDate);
    } catch (err) {
      console.error("Error checking out patient:", err);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  useEffect(() => {
    fetchActivityFeed(selectedDate);
  }, [selectedDate]);

  const getEventIcon = (type) => {
    switch (type) {
      case 'Check-in': return <UserCheck size={14} />;
      case 'Vitals Recorded': return <Activity size={14} />;
      case 'Clinical Note Added': return <FileText size={14} />;
      case 'Medication Ordered': return <Pill size={14} />;
      default: return <Clock size={14} />;
    }
  };

  const getEventColor = (type) => {
    switch (type) {
      case 'Check-in': return 'blue';
      case 'Vitals Recorded': return 'purple';
      case 'Clinical Note Added': return 'amber';
      case 'Medication Ordered': return 'green';
      default: return 'gray';
    }
  };

  return (
    <div className="dash-home anim-fade-up">
      {/* ===== ASYMMETRIC THREE-COLUMN ===== */}
      <div className="dash-columns">

        {/* ===== LEFT SECTION — VISUAL & SUMMARY ===== */}
        <div className="dash-left">
          {/* Header Block */}
          <div className="welcome-block anim-fade-up">
            <h1>{greeting},<br /><span className="text-primary">{user?.name?.split(' ')[0] || 'Doctor'}</span></h1>
            <p className="text-muted" style={{ marginTop: 8, fontSize: 'var(--text-base)' }}>
              {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          </div>

          {/* Hero Illustration with Glassmorphism Overlay */}
          <div className="hero-visual anim-fade-up delay-1">
            <div className="hero-image-wrapper card">
              <img src={heroImg} alt="Health Dashboard" className="hero-img" />
            </div>
          </div>

          {/* Bottom Row — Small Square Cards */}
          <div className="quick-squares anim-fade-up delay-2">
            <SquareCard label="Check-ins" value={stats.checkinsToday} color="blue" icon={UserCheck} onClick={() => navigate('/dashboard/patients')} />
            <SquareCard label="Alerts" value={stats.activeAlerts} color="red" icon={AlertTriangle} onClick={() => navigate('/dashboard/patients')} />
            <SquareCard label="Beds" value={stats.bedsOccupied} color="cyan" icon={Bed} onClick={() => navigate('/dashboard/patients')} />
            <SquareCard label="Patients" value={stats.totalPatients} color="green" icon={Users} onClick={() => navigate('/dashboard/patients')} />
            <SquareCard 
              label="Paracetamol" 
              value={stats.paracetamolStock} 
              color={stats.paracetamolStock < 20 ? "red" : "amber"} 
              icon={Pill} 
              onClick={() => navigate('/dashboard/patients')} 
            />
            <SquareCard label="Sent Home" value={stats.sentHomeToday} color="purple" icon={Home} onClick={() => navigate('/dashboard/patients')} />
          </div>
        </div>

        {/* ===== CENTER SECTION — DATA & TRENDS ===== */}
        <div className="dash-center">

          {/* Check-in Trends Chart */}
          <div className="card chart-card anim-fade-up delay-1">
            <div className="chart-header">
              <h4>Check-in Trends</h4>
              <span className="badge badge-blue">Weekly</span>
            </div>
            <div className="chart-body">
              <div className="chart-bars">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((day) => {
                  const val = trends[day] || 0;
                  const maxVal = Math.max(...Object.values(trends), 5);
                  const heightPct = Math.min((val / maxVal) * 80, 100); // Max 80% to keep label spacing clean
                  return (
                    <div key={day} className="bar-col">
                      <div className="bar-track">
                        <div className="bar-fill" style={{ height: `${heightPct}%` }} title={`${val} check-ins`}></div>
                      </div>
                      <span className="bar-label">{day}</span>
                    </div>
                  );
                })}
              </div>
              {Object.values(trends).every(v => v === 0) && (
                <p className="chart-empty-note text-muted">No data recorded this week</p>
              )}
            </div>
          </div>

          {/* Bottom Row — Lists & Modules */}
          <div className="data-row anim-fade-up delay-2">
            {/* Inner Column — Pill List */}
            <div className="data-col-inner">
              <div className="card">
                <div className="card-title-row">
                  <h4>Recent Patients</h4>
                  <button className="btn btn-ghost btn-sm" onClick={() => navigate('/dashboard/patients')}>View All <ArrowUpRight size={14} /></button>
                </div>
                <div className="pill-list">
                  {recentPatients.length > 0 ? (
                    recentPatients.map(p => (
                      <div key={p.id} className="pill-item" onClick={() => navigate(`/dashboard/patients/${p.id}`)}>
                        <div className="avatar avatar-xs">{p.name.split(' ').map(w => w[0]).join('')}</div>
                        <div className="pill-info">
                          <span className="pill-name">{p.name}</span>
                          <span className="pill-subtext">{p.section}</span>
                        </div>
                        <span className={`badge badge-${p.status_color || 'green'}`}>{p.status}</span>
                      </div>
                    ))
                  ) : (
                    <div className="pill-list-empty">
                      <Users size={24} className="text-muted" />
                      <span className="text-muted">No recent patients</span>
                    </div>
                  )}
                </div>
              </div>
              {/* Info block */}
              {/* Info block */}
              {stats.outbreakAlert ? (
                <div className="card info-block anim-fade-up delay-3 pulsating-bg" style={{ border: '1.5px solid #ef4444', background: '#fef2f2' }}>
                  <div className="info-icon-wrap" style={{ background: '#fca5a5' }}>
                    <TrendingUp size={20} style={{ color: '#991b1b' }} />
                  </div>
                  <div>
                    <h5 style={{ color: '#991b1b' }}>Outbreak Alert Active</h5>
                    <p className="text-danger" style={{ fontSize: 'var(--text-sm)', marginTop: 4, fontWeight: 600 }}>
                      {stats.outbreakAlert.message}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="card info-block anim-fade-up delay-3">
                  <div className="info-icon-wrap">
                    <TrendingUp size={20} />
                  </div>
                  <div>
                    <h5>Outbreak Analytics</h5>
                    <p className="text-muted" style={{ fontSize: 'var(--text-sm)', marginTop: 4 }}>Trend detection across classrooms will activate when sufficient data is available.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Outer Right — Activity Feed */}
            <div className="card data-col-outer anim-slide-right delay-3">
              {/* Date Selector */}
              <div className="date-strip">
                <button className="btn btn-icon btn-ghost btn-sm" onClick={() => setSelectedDate(prev => { const d = new Date(prev); d.setDate(d.getDate() - 1); return d; })}>
                  <ChevronLeft size={16} />
                </button>
                <div className="date-pills">
                  {getDays().map(d => (
                    <button
                      key={d.toISOString()}
                      className={`date-pill ${d.toDateString() === selectedDate.toDateString() ? 'active' : ''}`}
                      onClick={() => setSelectedDate(d)}
                    >
                      <span className="date-pill-day">{d.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                      <span className="date-pill-num">{d.getDate()}</span>
                    </button>
                  ))}
                </div>
                <button className="btn btn-icon btn-ghost btn-sm" onClick={() => setSelectedDate(prev => { const d = new Date(prev); d.setDate(d.getDate() + 1); return d; })}>
                  <ChevronRight size={16} />
                </button>
              </div>

              {/* Activity Feed */}
              <div className="activity-feed">
                <h4 style={{ marginBottom: 16 }}>Activity Feed</h4>
                {activity.length > 0 ? (
                  <div className="feed-list">
                    {activity.map(act => (
                      <div key={act.id} className="feed-item">
                        <div className={`feed-item-icon icon-${getEventColor(act.event_type)}`}>
                          {getEventIcon(act.event_type)}
                        </div>
                        <div className="feed-item-body">
                          <div className="feed-item-title-row">
                            <span className="feed-item-name">{act.patient_name}</span>
                            <span className="feed-item-time">
                              {new Date(act.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className="feed-item-desc">
                            <strong>{act.event_type}:</strong> {act.details}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="feed-empty">
                    <Clock size={28} className="text-muted" />
                    <span className="text-muted">No activity for this date</span>
                    <span className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>Check-ins, notes, and orders will appear here.</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ===== RIGHT SECTION — CLINICAL SIDEBAR ===== */}
        <div className="dash-sidebar">
          {/* Emergency Alerts Panel */}
          <div className="card sidebar-card alerts-panel-card anim-fade-up">
            <div className="card-header-with-icon">
              <div className="card-header-icon-wrap icon-red pulsating-bg">
                <AlertTriangle size={18} />
              </div>
              <div className="card-header-text">
                <h4>Emergency Alerts</h4>
                <span className="text-muted small-subtitle">{stats.highRiskPatients?.length || 0} active warning{stats.highRiskPatients?.length !== 1 ? 's' : ''}</span>
              </div>
            </div>
            <div className="sidebar-list">
              {stats.highRiskPatients && stats.highRiskPatients.length > 0 ? (
                stats.highRiskPatients.map(patient => (
                  <div key={patient.id} className="sidebar-item sidebar-alert-card" onClick={() => navigate(`/dashboard/patients/${patient.id}`)}>
                    <div className="sidebar-item-main">
                      <div className="sidebar-alert-title">
                        <span className="sidebar-item-name">{patient.name}</span>
                        <span className="sidebar-alert-vitals">
                          {patient.vitals.temperature ? `${patient.vitals.temperature}°C` : ''}
                          {patient.vitals.o2_sat ? ` • O₂ ${patient.vitals.o2_sat}%` : ''}
                        </span>
                      </div>
                      <span className="sidebar-item-sub">{patient.section}</span>
                      <div className="alert-tags">
                        {patient.alerts.map(alertText => (
                          <span key={alertText} className="alert-tag-badge">
                            ⚠️ {alertText}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="sidebar-item-indicator blinking-indicator-red"></div>
                  </div>
                ))
              ) : (
                <div className="sidebar-empty">
                  <AlertTriangle size={24} className="text-muted" />
                  <span className="text-muted">No high-risk alerts today</span>
                </div>
              )}
            </div>
          </div>

          {/* Clinic Live Beds Tracker */}
          <div className="card sidebar-card beds-tracker-card anim-fade-up">
            <div className="card-header-with-icon">
              <div className="card-header-icon-wrap icon-cyan">
                <Bed size={18} />
              </div>
              <div className="card-header-text">
                <h4>Live Beds Tracker</h4>
                <span className="text-muted small-subtitle">{stats.occupiedBedsList?.length || 0} occupied</span>
              </div>
            </div>
            <div className="sidebar-list">
              {stats.occupiedBedsList && stats.occupiedBedsList.length > 0 ? (
                stats.occupiedBedsList.map(bed => (
                  <div key={bed.id} className="sidebar-item sidebar-bed-card" onClick={() => navigate(`/dashboard/patients/${bed.id}`)}>
                    <div className="sidebar-item-main">
                      <span className="sidebar-item-name">{bed.name}</span>
                      <span className="sidebar-item-sub">{bed.section} • {bed.age} {bed.gender}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div className="sidebar-item-badge badge-cyan">
                        <Clock size={12} className="margin-right-xs" />
                        {formatDuration(bed.entryTime)}
                      </div>
                      {!isRestrictedRole && (
                        <button
                          className="btn-checkout-quick"
                          title="Check-Out Student"
                          onClick={(e) => handleQuickCheckOut(e, bed.id)}
                        >
                          <LogOut size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="sidebar-empty">
                  <Bed size={24} className="text-muted" />
                  <span className="text-muted">No patients under observation</span>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

/* ===== Square Card Component ===== */
const SquareCard = ({ label, value, color, onClick, icon: Icon }) => (
  <div className={`square-card card sq-${color}`} onClick={onClick}>
    {Icon && (
      <div className="sq-icon">
        <Icon size={20} />
      </div>
    )}
    <span className="sq-value">{value}</span>
    <span className="sq-label">{label}</span>
  </div>
);

export default DashboardHome;

