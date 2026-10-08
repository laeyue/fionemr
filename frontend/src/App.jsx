import { useState, useRef, useCallback, useEffect } from 'react';
import { AuthContext, useAuth } from './auth-context';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import MinimalLanding from './components/layout/MinimalLanding';
import Dashboard from './components/layout/Dashboard';
import './App.css';

// Auth Context
const IDLE_MS = 15 * 60 * 1000;
const readFlag = (key) => { try { return sessionStorage.getItem(key); } catch { return null; } };
const writeFlag = (key, value) => { try { sessionStorage.setItem(key, value); } catch { /* Storage may be disabled. */ } };

function InactivityWatcher() {
  const { user, logout } = useAuth();

  useEffect(() => {
    if (!user) return;

    let timeoutId;

    const resetTimer = () => {
      if (timeoutId) clearTimeout(timeoutId);
      writeFlag('fione:last-activity', String(Date.now()));
      timeoutId = setTimeout(() => {
        logout();
      }, IDLE_MS);
    };

    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
    const checkIdle = () => {
      const last = Number(readFlag('fione:last-activity'));
      if (last && Date.now() - last >= IDLE_MS) void logout();
    };

    resetTimer();
    window.addEventListener('focus', checkIdle);
    document.addEventListener('visibilitychange', checkIdle);

    events.forEach(event => {
      window.addEventListener(event, resetTimer);
    });

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      window.removeEventListener('focus', checkIdle);
      document.removeEventListener('visibilitychange', checkIdle);
      events.forEach(event => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [user, logout]);

  return null;
}

import { api } from './api';

function ProtectedDashboard({ user }) {
  const location = useLocation();
  return user ? <Dashboard key={user.id} /> : <Navigate to="/" replace state={{ from: location.pathname + location.search }} />;
}

function App() {
  const [user, setUser] = useState(null);
  const [restoring, setRestoring] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [restoreError, setRestoreError] = useState('');
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  // Drafts never enter persistent browser storage; each login starts a new scope.
  const clinicalDrafts = useRef(new Map());

  const login = useCallback((userData) => {
    clinicalDrafts.current.clear();
    writeFlag('fione:signed-out', '0');
    writeFlag('fione:last-activity', String(Date.now()));
    setUser(userData);
    api.setSession(userData);
  }, []);
  const logout = useCallback(async () => {
    setSigningOut(true);
    setRestoring(true);
    writeFlag('fione:signed-out', '1');
    clinicalDrafts.current.clear();
    setUser(null);
    try {
      await api.logout();
    } catch {
      api.clearSession();
    } finally {
      setSigningOut(false);
      setRestoring(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      const last = Number(readFlag('fione:last-activity'));
      if (readFlag('fione:signed-out') === '1' || (last && Date.now() - last >= IDLE_MS)) {
        await logout();
        if (!cancelled) setRestoring(false);
        return;
      }
      try {
        const { data } = await api.restoreSession();
        if (!cancelled) { api.setSession(data); setUser(data); setRestoreError(''); }
      } catch (failure) {
        if (!cancelled && failure.status !== 401) setRestoreError('Your session could not be checked. Retry when the connection is available.');
      } finally { if (!cancelled) setRestoring(false); }
    };
    void restore();
    return () => { cancelled = true; };
  }, [logout, restoreAttempt]);

  useEffect(() => {
    const expireSession = () => { clinicalDrafts.current.clear(); setUser(null); };
    const protectDrafts = (event) => {
      if (clinicalDrafts.current.size) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('auth:expired', expireSession);
    window.addEventListener('beforeunload', protectDrafts);
    return () => { window.removeEventListener('auth:expired', expireSession); window.removeEventListener('beforeunload', protectDrafts); };
  }, []);

  if (restoring) return <div role="status" className="card" style={{ margin: 40, padding: 24 }}>{signingOut ? 'Signing out…' : 'Restoring your session…'}</div>;
  if (restoreError) return <div role="alert" className="card" style={{ margin: 40, padding: 24 }}><p>{restoreError}</p><button className="btn btn-primary" onClick={() => { setRestoring(true); setRestoreError(''); setRestoreAttempt((attempt) => attempt + 1); }}>Retry</button></div>;
  return (
    <AuthContext.Provider value={{ user, login, logout, clinicalDrafts }}>
      <InactivityWatcher />
      <Router>
        <Routes>
          <Route path="/" element={user ? <Navigate to="/dashboard" replace /> : <MinimalLanding />} />
          <Route path="/dashboard/*" element={<ProtectedDashboard user={user} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthContext.Provider>
  );
}

export default App;
