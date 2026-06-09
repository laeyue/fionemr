import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, FileText, CheckSquare, ShieldAlert, Sparkles, Thermometer, Pill, Home, Activity } from 'lucide-react';
import { api } from '../../api';

const ReportsAnalytics = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [trends, setTrends] = useState({ Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0 });
  const [isLoading, setIsLoading] = useState(true);

  const fetchReportsData = async () => {
    try {
      setIsLoading(true);
      const resStats = await api.getDashboardStats();
      if (resStats) {
        setStats(resStats);
      }
      
      const resTrends = await api.getDashboardTrends();
      if (resTrends && resTrends.data) {
        setTrends(resTrends.data);
      }
    } catch (err) {
      console.error('Error fetching analytics reports data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReportsData();
  }, []);

  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const maxTrendVal = Math.max(...weekdays.map(d => trends[d] || 0), 5);

  // Simulated symptom breakdown distribution (for visual representation of school clinical cases)
  const symptomsList = [
    { name: 'Fever & Flu', count: stats?.highRiskPatients?.length || 2, color: 'var(--danger)', percentage: 40 },
    { name: 'Respiratory (Cough/Cold)', count: stats?.outbreakAlert ? stats.outbreakAlert.count : 3, color: 'var(--primary)', percentage: 30 },
    { name: 'Gastrointestinal Pain', count: 1, color: 'var(--warning)', percentage: 15 },
    { name: 'Minor Injury / Sprains', count: 2, color: 'var(--info)', percentage: 15 },
  ];

  return (
    <div className="reports-analytics-page anim-fade-up" style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--gray-200)', paddingBottom: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--gray-900)', margin: 0 }}>Reports & Daily Analytics</h1>
          <p className="text-muted" style={{ margin: '4px 0 0 0', fontSize: 'var(--text-sm)' }}>
            Real-time charts, daily check-in indicators, paracetamol stocks, and classroom outbreak reports.
          </p>
        </div>
      </div>

      {/* Grid of Daily Counters */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
        {/* Check-ins */}
        <div className="card" style={{ padding: 16, textAlign: 'left' }}>
          <span style={{ fontSize: 10, color: 'var(--gray-400)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Daily Check-ins</span>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <strong style={{ fontSize: 24, fontWeight: 800, color: 'var(--gray-800)' }}>{stats?.checkinsToday || 0}</strong>
            <Activity size={20} style={{ color: 'var(--primary)' }} />
          </div>
        </div>

        {/* Vitals Alerts */}
        <div className="card" style={{ padding: 16, textAlign: 'left' }}>
          <span style={{ fontSize: 10, color: 'var(--gray-400)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Vitals Alarms</span>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <strong style={{ fontSize: 24, fontWeight: 800, color: stats?.activeAlerts > 0 ? 'var(--danger)' : 'var(--gray-800)' }}>
              {stats?.activeAlerts || 0}
            </strong>
            <Thermometer size={20} style={{ color: stats?.activeAlerts > 0 ? 'var(--danger)' : 'var(--primary)' }} />
          </div>
        </div>

        {/* Beds Occupied */}
        <div className="card" style={{ padding: 16, textAlign: 'left' }}>
          <span style={{ fontSize: 10, color: 'var(--gray-400)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Beds Occupied</span>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <strong style={{ fontSize: 24, fontWeight: 800, color: 'var(--gray-800)' }}>{stats?.bedsOccupied || 0} <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>/ 5</span></strong>
            <BarChart size={20} style={{ color: 'var(--primary)' }} />
          </div>
        </div>

        {/* Paracetamol Stock */}
        <div className="card" style={{ padding: 16, textAlign: 'left' }}>
          <span style={{ fontSize: 10, color: 'var(--gray-400)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Paracetamol Inventory</span>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <strong style={{ fontSize: 24, fontWeight: 800, color: stats?.paracetamolStock < 20 ? 'var(--danger)' : 'var(--gray-800)' }}>
              {stats?.paracetamolStock || 0} <span style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 500 }}>tabs</span>
            </strong>
            <Pill size={20} style={{ color: 'var(--primary)' }} />
          </div>
        </div>

        {/* Sent Home Count */}
        <div className="card" style={{ padding: 16, textAlign: 'left' }}>
          <span style={{ fontSize: 10, color: 'var(--gray-400)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Discharged Home</span>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <strong style={{ fontSize: 24, fontWeight: 800, color: 'var(--gray-800)' }}>{stats?.sentHomeToday || 0}</strong>
            <Home size={20} style={{ color: 'var(--primary)' }} />
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px', alignItems: 'flex-start' }}>
        
        {/* Left Side: Weekly trends SVG Bar chart */}
        <div className="card" style={{ padding: 24 }}>
          <h3 className="settings-section-title" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 20px 0', fontSize: '16px' }}>
            <BarChart size={18} style={{ color: 'var(--primary)' }} /> Weekly Clinic Visit Trends
          </h3>

          {isLoading ? (
            <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gray-400)' }}>
              Loading trends data...
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* SVG Bar Chart container */}
              <div style={{ width: '100%', height: '200px', display: 'flex', alignItems: 'flex-end', borderBottom: '2px solid var(--gray-200)', borderLeft: '2px solid var(--gray-200)', paddingBottom: '8px', paddingLeft: '8px', boxSizing: 'border-box' }}>
                <div style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'flex-end', justifyContent: 'space-around' }}>
                  {weekdays.map(day => {
                    const val = trends[day] || 0;
                    const pct = Math.max(8, (val / maxTrendVal) * 100);
                    return (
                      <div key={day} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '40px', height: '100%', justifyContent: 'flex-end', gap: 8 }}>
                        {/* Tooltip-like value badge */}
                        <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--gray-700)' }}>{val}</span>
                        {/* Bar */}
                        <div 
                          style={{ 
                            width: '100%', 
                            height: `${pct}%`, 
                            background: 'linear-gradient(to top, var(--primary), var(--blue-400))', 
                            borderRadius: '4px 4px 0 0', 
                            transition: 'height 0.4s ease' 
                          }}
                        />
                        {/* X-Axis Label */}
                        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--gray-500)', marginBottom: '-28px' }}>{day}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Offset space for axis label */}
              <div style={{ height: 16 }} />
            </div>
          )}
        </div>

        {/* Right Side: Symptom breakdown & Outbreak stats */}
        <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Outbreak warning state */}
          <div>
            <h3 className="settings-section-title" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 12px 0', fontSize: '16px' }}>
              <ShieldAlert size={18} style={{ color: 'var(--primary)' }} /> Outbreak Analytics
            </h3>
            
            {stats?.outbreakAlert ? (
              <div style={{ padding: 12, background: 'var(--danger-bg)', border: '1px solid var(--danger)', borderRadius: 'var(--radius-md)', color: '#b91c1c', fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                <ShieldAlert size={14} style={{ color: 'var(--danger)' }} />
                <span>Active Outbreak: {stats.outbreakAlert.section} flagged for flu cases.</span>
              </div>
            ) : (
              <div style={{ padding: 12, background: 'var(--success-bg)', border: '1px solid var(--success)', borderRadius: 'var(--radius-md)', color: '#166534', fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Sparkles size={14} style={{ color: 'var(--success)' }} />
                <span>All classroom sections scanned. No active outbreaks detected.</span>
              </div>
            )}
          </div>

          {/* Symptom distribution breakdown */}
          <div>
            <h4 style={{ margin: '0 0 12px 0', fontSize: '12px', fontWeight: 700, color: 'var(--gray-800)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Symptom Case Distribution
            </h4>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {symptomsList.map(item => (
                <div key={item.name} style={{ fontSize: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, color: 'var(--gray-700)' }}>{item.name}</span>
                    <strong style={{ color: 'var(--gray-800)' }}>{item.count} cases</strong>
                  </div>
                  {/* Progress bar */}
                  <div style={{ width: '100%', height: 6, background: 'var(--gray-200)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${item.percentage}%`, height: '100%', background: item.color, borderRadius: 3 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default ReportsAnalytics;
