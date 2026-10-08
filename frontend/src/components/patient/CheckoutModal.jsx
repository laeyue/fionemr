import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { clinicDateString } from '../../date';

const validEmail = (value) => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

export default function CheckoutModal({ patient, onClose, onSubmit }) {
  const [issueSlip, setIssueSlip] = useState(false);
  const [notifyAdviser, setNotifyAdviser] = useState(false);
  const [reason, setReason] = useState('');
  const [start, setStart] = useState(clinicDateString);
  const [end, setEnd] = useState(clinicDateString);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const close = () => { if (!saving) onClose(); };
  const submit = async (event) => {
    event.preventDefault();
    if (saving) return;
    if (issueSlip && (!reason.trim() || !start || !end || start > end)) {
      setError('Enter an excuse reason and valid dates, with the end date on or after the start date.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSubmit(issueSlip ? { excuse_reason: reason.trim(), start_date: start, end_date: end, teacher_notified: notifyAdviser && validEmail(patient.adviser_email) } : undefined);
    } catch (failure) {
      setError(failure.message || 'Checkout could not be saved. Your selections are still here.');
    } finally { setSaving(false); }
  };
  return createPortal(
    <div className="modal-overlay">
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="checkout-title">
        <div className="modal-header">
          <h3 id="checkout-title">Check-Out Student: {patient.name}</h3>
          <button className="btn-close" onClick={close} disabled={saving} type="button" aria-label="Close modal"><X size={18} /></button>
        </div>
        <form onSubmit={submit}>
          <p className="text-muted">Check-Out changes the clinic status to Checked Out and releases any occupied bed. A configured parent email notice is attempted. Excuse slips and adviser notices are optional; security clearance requires separate departure approval.</p>
          {!validEmail(patient.parent_email) && <p role="status" className="form-hint">No valid parent email is on file. Checkout can be recorded, but a parent email cannot be sent.</p>}
          {error && <p role="alert" className="form-error">{error}</p>}
          <fieldset disabled={saving} style={{ border: 0, padding: 0, margin: 0 }}>
            <label className="consent-label"><input type="checkbox" checked={issueSlip} onChange={(event) => { setIssueSlip(event.target.checked); setNotifyAdviser(false); }} /> Generate an excuse slip and start its approval workflow</label>
            {issueSlip && <>
              <div className="form-group"><label className="form-label" htmlFor="checkout-reason">Excuse Reason / Clinical Advisory *</label><textarea id="checkout-reason" className="form-textarea" required maxLength={4000} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} /></div>
              <div className="form-row-2">
                <div className="form-group"><label className="form-label" htmlFor="checkout-start">Start Date *</label><input id="checkout-start" className="form-input" type="date" required value={start} onChange={(event) => setStart(event.target.value)} /></div>
                <div className="form-group"><label className="form-label" htmlFor="checkout-end">End Date *</label><input id="checkout-end" className="form-input" type="date" required min={start} value={end} onChange={(event) => setEnd(event.target.value)} /></div>
              </div>
              <label className="consent-label"><input type="checkbox" checked={notifyAdviser} disabled={!validEmail(patient.adviser_email)} onChange={(event) => setNotifyAdviser(event.target.checked)} /> Notify the homeroom adviser by email</label>
              {!validEmail(patient.adviser_email) && <p className="form-hint">No valid adviser email is configured for this student.</p>}
            </>}
          </fieldset>
          <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
            <button type="button" className="btn btn-secondary" disabled={saving} onClick={close}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Complete Checkout'}</button>
          </div>
        </form>
      </div>
    </div>, document.body
  );
}
