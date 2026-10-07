import { useState, createContext, useContext, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import MinimalLanding from './components/layout/MinimalLanding';
import Dashboard from './components/layout/Dashboard';
import './App.css';

// Auth Context
export const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

function InactivityWatcher() {
  const { user, logout } = useAuth();

  useEffect(() => {
    if (!user) return;

    let timeoutId;

    const resetTimer = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        logout();
        alert('Your session has timed out due to inactivity. Please log in again.');
      }, 900000); // 15 minutes
    };

    const events = ['mousemove', 'keypress', 'mousedown', 'scroll', 'touchstart'];

    resetTimer();

    events.forEach(event => {
      window.addEventListener(event, resetTimer);
    });

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      events.forEach(event => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [user, logout]);

  return null;
}

import { api } from './api';

function App() {
  const [user, setUser] = useState(null);

  const login = (userData) => {
    setUser(userData);
    api.setSession(userData);
  };
  const logout = async () => {
    try {
      await api.logout();
    } catch {
      api.clearSession();
    }
    setUser(null);
  };

  useEffect(() => {
    const expireSession = () => setUser(null);
    window.addEventListener('auth:expired', expireSession);
    return () => window.removeEventListener('auth:expired', expireSession);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      <InactivityWatcher />
      <Router>
        <Routes>
          <Route path="/" element={user ? <Navigate to="/dashboard" replace /> : <MinimalLanding />} />
          <Route path="/dashboard/*" element={user ? <Dashboard /> : <Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthContext.Provider>
  );
}

export default App;
