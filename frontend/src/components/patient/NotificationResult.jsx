import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { emailFeedback } from '../../emailFeedback';

const pending = (status) => ['processing', 'pending', 'sending'].includes(status);

export default function NotificationResult({ notifications }) {
  const [resolved, setResolved] = useState(notifications);
  const [refreshError, setRefreshError] = useState('');
  useEffect(() => {
    let cancelled = false;
    let timer;
    let attempts = 0;
    const refresh = async () => {
      attempts += 1;
      try {
        const { data = [] } = await api.getEmailAlertLogs();
        const next = notifications.map((item) => {
          const log = item.id && data.find((entry) => entry.id === item.id);
          return log ? { ...item, status: log.delivery_status } : item;
        });
        if (cancelled) return;
        setResolved(next);
        setRefreshError('');
        if (next.some((item) => pending(item.status)) && attempts < 15) timer = setTimeout(refresh, 4000);
      } catch {
        if (!cancelled) {
          setRefreshError('The latest email status could not be loaded. Open the delivery log for the current result.');
          if (attempts < 15) timer = setTimeout(refresh, 4000);
        }
      }
    };
    if (notifications.some((item) => pending(item.status) && item.id)) timer = setTimeout(refresh, 1000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [notifications]);
  return <div role="status" className="card" style={{ padding: 16, marginBottom: 16 }}>
    <p>{emailFeedback(resolved)}</p>
    {refreshError && <p>{refreshError}</p>}
    <Link to="/dashboard/alerts?tab=email">View Email Delivery &amp; Responses</Link>
  </div>;
}
