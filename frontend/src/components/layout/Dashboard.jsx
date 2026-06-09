import React, { useState } from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import {
  Activity, Search, Bell, LogOut, Settings,
  LayoutDashboard, Users, Bed, FileText, AlertTriangle
} from 'lucide-react';
import { useAuth } from '../../App';
import DashboardHome from '../dashboard/DashboardHome';
import PatientList from '../patient/PatientList';
import PatientChart from '../patient/PatientChart';
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
          <button className="btn btn-icon btn-ghost">
            <Search size={18} />
          </button>
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
          <Route path="clinic" element={<Placeholder title="Clinic & Bed Tracker" />} />
          <Route path="reports" element={<Placeholder title="Reports & Analytics" />} />
          <Route path="alerts" element={<Placeholder title="Alerts & Notifications" />} />
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
