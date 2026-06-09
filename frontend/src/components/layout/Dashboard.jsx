import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import {
  Activity, Search, Bell, LogOut, Settings,
  LayoutDashboard, Users, Bed, FileText, AlertTriangle,
  X, Loader2
} from 'lucide-react';
import { useAuth } from '../../App';
import { api } from '../../api';
import DashboardHome from '../dashboard/DashboardHome';
import PatientList from '../patient/PatientList';
import PatientChart from '../patient/PatientChart';
import ClinicTracker from '../clinic/ClinicTracker';
import ReportsAnalytics from '../reports/ReportsAnalytics';
import AlertsPage from '../alerts/AlertsPage';
import SettingsPage from '../settings/Settings';
import './Dashboard.css';


const NAV_ITEMS = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { path: '/dashboard/patients', label: 'Patients', icon: Users },
  { path: '/dashboard/clinic', label: 'Clinic', icon: Bed },
  { path: '/dashboard/reports', label: 'Reports', icon: FileText },
  { path: '/dashboard/alerts', label: 'Alerts', icon: AlertTriangle },
];

const Dashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const delayDebounce = setTimeout(async () => {
      try {
        setIsSearchLoading(true);
        const res = await api.getPatients({ search: searchQuery });
        if (res && res.data) {
          setSearchResults(res.data);
        }
      } catch (err) {
        console.error("Global search error:", err);
      } finally {
        setIsSearchLoading(false);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(delayDebounce);
  }, [searchQuery]);

  const handleSearchSubmit = (e) => {
    if (e.key === 'Enter') {
      navigate(`/dashboard/patients?search=${encodeURIComponent(searchQuery)}`);
      setIsSearchFocused(false);
      setIsMobileSearchOpen(false);
    }
  };

  const handlePatientSelect = (id) => {
    navigate(`/dashboard/patients/${id}`);
    setSearchQuery('');
    setIsSearchFocused(false);
    setIsMobileSearchOpen(false);
  };

  const isActive = (path, exact) => exact ? location.pathname === path : location.pathname.startsWith(path);

  const initials = user?.name
    ? user.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : 'U';

  return (
    <div className="app-shell">
      {/* ===== TOP NAVIGATION BAR ===== */}
      <header className="topbar">
        {/* Left — Brand */}
        <div className="topbar-brand" onClick={() => navigate('/dashboard')}>
          <div className="brand-mark">
            <Activity size={20} />
          </div>
          <span className="brand-name">Fiona proj EMR</span>
        </div>

        {/* Center — Pill Nav */}
        <nav className="topbar-nav">
          <div className="nav-pills">
            {NAV_ITEMS.map(item => {
              const Icon = item.icon;
              const active = isActive(item.path, item.exact);
              return (
                <button
                  key={item.path}
                  className={`nav-pill ${active ? 'active' : ''}`}
                  onClick={() => navigate(item.path)}
                >
                  <Icon size={16} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* Right — Utilities */}
        <div className="topbar-right">
          <div className={`header-search-container ${isMobileSearchOpen ? 'mobile-open' : ''}`}>
            {/* On mobile, this button toggles search open */}
            <button 
              className="btn btn-icon btn-ghost search-trigger-btn"
              onClick={() => setIsMobileSearchOpen(true)}
              type="button"
            >
              <Search size={18} />
            </button>

            <div className="search-input-wrapper">
              <Search className="search-icon-inside" size={16} />
              <input
                type="text"
                placeholder="Search students..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchSubmit}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => {
                  // Delay closing the dropdown to allow click events to register
                  setTimeout(() => setIsSearchFocused(false), 200);
                }}
                className="header-search-input"
              />
              {searchQuery && (
                <button 
                  className="search-clear-btn" 
                  onClick={() => setSearchQuery('')}
                  type="button"
                >
                  <X size={14} />
                </button>
              )}
              <button 
                className="btn btn-icon btn-ghost search-close-btn"
                onClick={() => setIsMobileSearchOpen(false)}
                type="button"
              >
                <X size={18} />
              </button>
            </div>

            {isSearchFocused && (searchQuery || searchResults.length > 0) && (
              <div className="search-dropdown anim-fade-up">
                {isSearchLoading ? (
                  <div className="search-dropdown-status">
                    <Loader2 className="animate-spin" size={16} />
                    <span>Searching...</span>
                  </div>
                ) : searchResults.length > 0 ? (
                  <div className="search-results-list">
                    {searchResults.map(p => (
                      <div 
                        key={p.id} 
                        className="search-result-item" 
                        onClick={() => handlePatientSelect(p.id)}
                      >
                        <div className="patient-avatar-mini">
                          {p.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <div className="patient-details">
                          <div className="patient-name">{p.name}</div>
                          <div className="patient-sub">
                            ID: {p.id} • {p.grade_level || p.section} • {p.gender}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="search-dropdown-status">No students found</div>
                )}
              </div>
            )}
          </div>

          <button className="btn btn-icon btn-ghost">
            <Bell size={18} />
          </button>
          <div className="topbar-divider"></div>
          <div className="user-block" onClick={() => navigate('/dashboard/settings')}>
            <div className="avatar avatar-sm">{initials}</div>
            <div className="user-meta">
              <span className="user-name">{user?.name}</span>
              <span className="user-role">{user?.role}</span>
            </div>
          </div>
          <button className="btn btn-icon btn-ghost logout-btn" onClick={() => { logout(); navigate('/'); }} title="Sign out">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* ===== PAGE CONTENT ===== */}
      <main className="page-area">
        <Routes>
          <Route index element={<DashboardHome />} />
          <Route path="patients" element={<PatientList />} />
          <Route path="patients/:id" element={<PatientChart />} />
          <Route path="clinic" element={<ClinicTracker />} />
          <Route path="reports" element={<ReportsAnalytics />} />
          <Route path="alerts" element={<AlertsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>

      {/* ===== MOBILE BOTTOM NAVIGATION BAR ===== */}
      <nav className="mobile-bottom-nav">
        {NAV_ITEMS.map(item => {
          const Icon = item.icon;
          const active = isActive(item.path, item.exact);
          return (
            <button
              key={item.path}
              className={`mobile-nav-item ${active ? 'active' : ''}`}
              onClick={() => navigate(item.path)}
            >
              <Icon size={20} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};

const Placeholder = ({ title }) => (
  <div className="placeholder-page anim-fade-up">
    <div className="card" style={{ textAlign: 'center', padding: '80px 40px', maxWidth: 520, margin: '40px auto' }}>
      <h2>{title}</h2>
      <p className="text-muted" style={{ marginTop: 8 }}>This module is under development.</p>
    </div>
  </div>
);

export default Dashboard;
