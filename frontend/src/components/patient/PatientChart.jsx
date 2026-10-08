import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, User, FileText, Pill, ShieldAlert, Syringe,
  Save, AlertCircle, CheckCircle, Clock, Thermometer, Loader2, Pencil, X, ShieldCheck, Activity
} from 'lucide-react';
import { useAuth } from '../../auth-context';
import { api } from '../../api';
import { clinicDateString, clinicAgeAtDateOfBirth, formatClinicDate, formatClinicDateTime } from '../../date';
import CheckoutModal from './CheckoutModal';
import NotificationResult from './NotificationResult';
import { roleLabel } from '../../roles';
import './PatientChart.css';

const noKnownAllergyValues = new Set(['no known allergies', 'no known drug allergies', 'nka', 'nkda']);
const noKnownConditionValues = new Set(['no known chronic conditions', 'no chronic conditions', 'none after review']);
const unreviewedClinicalValues = new Set(['', 'none', 'unknown', 'unknown - not reviewed', 'not reviewed', 'not recorded', 'not on file', 'n/a']);
const clinicalEntryStatus = (value, clearValues) => {
  const normalized = String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (unreviewedClinicalValues.has(normalized)) return 'unknown';
  if (clearValues.has(normalized)) return 'clear';
  return 'documented';
};

const displayAdministeredDose = (entry) => {
  if (entry?.dose_amount !== null && entry?.dose_amount !== undefined && entry?.dose_unit) {
    return `${entry.dose_amount} ${entry.dose_unit}`;
  }
  return 'Actual amount not captured in this legacy record';
};

const PatientChart = () => {
  const { id } = useParams();
  return <PatientChartContent key={id} id={id} />;
};

const PatientChartContent = ({ id }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const role = (user?.role || 'guest').toLowerCase();
  const isRestrictedRole = role === 'teacher' || role === 'guidance_counselor' || role === 'guidance counselor';

  const availableTabs = [
    { key: 'overview', label: 'Overview',   icon: User },
    ...(!isRestrictedRole ? [
      { key: 'soap',     label: 'SOAP Notes', icon: FileText },
      { key: 'orders',   label: 'Medications', icon: Pill },
      { key: 'history',  label: 'Visit Log',  icon: Clock },
    ] : []),
    { key: 'excuse-slips', label: 'Excuse Slips', icon: FileText }
  ];
  const [activeTab, setActiveTab] = useState('overview');
  const [patient, setPatient] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [notifications, setNotifications] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastLoaded, setLastLoaded] = useState(null);
  const [refreshError, setRefreshError] = useState('');
  const hasPatient = useRef(false);
  const requestNumber = useRef(0);
  const refreshInFlight = useRef(null);
  const displayedTab = availableTabs.some((tab) => tab.key === activeTab) ? activeTab : 'overview';

  // Check-In State
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [chiefComplaint, setChiefComplaint] = useState('');

  // Checkout & Excuse Slip State
  const [showCheckOutModal, setShowCheckOutModal] = useState(false);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const fetchPatient = useCallback((force = false) => {
    if (refreshInFlight.current && force !== true) return refreshInFlight.current;
    const sequence = ++requestNumber.current;
    setIsRefreshing(true);
    const work = (async () => {
      try {
        const res = await api.getPatientById(id, { refresh: hasPatient.current });
        if (sequence !== requestNumber.current) return;
        if (!res?.data) throw new Error('Patient not found.');
        hasPatient.current = true;
        setPatient(res.data);
        setLastLoaded(new Date());
        setError('');
        setRefreshError('');
      } catch (failure) {
        if (sequence !== requestNumber.current) return;
        if (hasPatient.current) setRefreshError('Chart refresh failed. Displayed data may be out of date.');
        else setError(failure.message || 'Failed to load patient chart data.');
      } finally {
        if (sequence === requestNumber.current) { setIsLoading(false); setIsRefreshing(false); }
        if (sequence === requestNumber.current) refreshInFlight.current = null;
      }
    })();
    refreshInFlight.current = work;
    return work;
  }, [id]);

  const handleCheckIn = async (e) => {
    e.preventDefault();
    if (!chiefComplaint.trim() || isCheckingIn) return;
    setIsCheckingIn(true);
    try {
      const result = await api.checkInPatient(id, chiefComplaint);
      setNotifications(result.notifications || []);
      setChiefComplaint('');
      setShowCheckInModal(false);
      await fetchPatient(true);
    } catch (err) {
      console.error("Error checking in patient:", err);
      window.alert('Could not check in the patient: ' + err.message);
    } finally {
      setIsCheckingIn(false);
    }
  };

  const handleCheckOut = () => setShowCheckOutModal(true);
  const handleCheckOutConfirm = async (payload) => {
    const result = await api.checkOutPatient(id, payload);
    setNotifications(result.notifications || []);
    setShowCheckOutModal(false);
    await fetchPatient(true);
  };

  useEffect(() => {
    if (!id) return undefined;
    const refreshVisible = () => { if (document.visibilityState === 'visible') void fetchPatient(); };
    const initial = setTimeout(fetchPatient, 0);
    const interval = setInterval(refreshVisible, 30000);
    window.addEventListener('focus', refreshVisible);
    document.addEventListener('visibilitychange', refreshVisible);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
      window.removeEventListener('focus', refreshVisible);
      document.removeEventListener('visibilitychange', refreshVisible);
      requestNumber.current += 1;
      refreshInFlight.current = null;
    };
  }, [fetchPatient, id]);

  const handleRecordVitals = async (vitalsData) => {
    try {
      await api.saveVitals(id, vitalsData);
      await fetchPatient(true);
    } catch (err) {
      console.error("Error saving vitals:", err);
      throw err;
    }
  };

  const handleUpdateImmunization = async (vaccineName, dosesReceived, dosesRequired) => {
    try {
      await api.updateImmunization(id, {
        vaccine_name: vaccineName,
        doses_received: dosesReceived,
        doses_required: dosesRequired,
        verified: true
      });
      await fetchPatient(true);
      return true;
    } catch (err) {
      console.error("Error updating immunization:", err);
      window.alert('Could not save immunization history: ' + err.message);
      return false;
    }
  };

  const handleSaveNote = async (noteData) => {
    try {
      await api.saveSoapNote(id, noteData);
      await fetchPatient(true);
    } catch (err) {
      console.error("Error saving SOAP note:", err);
      throw err;
    }
  };

  const handleSaveOrder = async (orderData) => {
    try {
      await api.saveMedicationOrder(id, orderData);
      await fetchPatient(true);
    } catch (err) {
      console.error("Error saving order:", err);
      throw err;
    }
  };

  const handleUpdatePatient = async (updatedData) => {
    try {
      await api.updatePatient(id, updatedData);
      await fetchPatient(true);
    } catch (err) {
      console.error("Error updating patient:", err);
      throw err;
    }
  };

  const handleAddConsent = async (consentData) => {
    try {
      await api.createConsent(id, consentData);
      await fetchPatient(true);
    } catch (err) {
      console.error("Error saving consent:", err);
      throw err;
    }
  };

  const handleCreateExcuseSlip = async (excuseData) => {
    try {
      const result = await api.createExcuseSlip(id, excuseData);
      setNotifications(result.notifications || []);
      await fetchPatient(true);
    } catch (err) {
      window.alert('Could not create the excuse slip: ' + err.message);
      throw err;
    }
  };

  if (isLoading) {
    return (
      <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '80px 40px', maxWidth: 520, margin: '40px auto' }}>
        <Loader2 className="spin text-primary" size={36} style={{ color: 'var(--primary)' }} />
        <p className="text-muted" style={{ marginTop: 12 }}>Loading patient chart...</p>
      </div>
    );
  }

  if (error || !patient) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '80px 40px', maxWidth: 520, margin: '40px auto' }}>
        <AlertCircle size={36} style={{ margin: '0 auto 16px', color: 'var(--primary)' }} />
        <h2>{error || 'Patient Not Found'}</h2>
        <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate('/dashboard/patients')}>
          Back to Patient List
        </button>
      </div>
    );
  }

  const initials = patient.name
    ? patient.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : 'U';

  return (
    <div className="page-chart anim-fade-up">
      {notifications !== null && <NotificationResult key={JSON.stringify(notifications)} notifications={notifications} />}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <button className="btn btn-secondary btn-sm" disabled={isRefreshing} onClick={() => void fetchPatient()}>{isRefreshing ? 'Refreshing…' : 'Refresh Chart'}</button>
        <span className="text-muted">Last refreshed: {formatClinicDateTime(lastLoaded)}</span>
      </div>
      {refreshError && <p role="alert" className="form-error">{refreshError}</p>}
      <button className="btn btn-ghost back-btn" onClick={() => navigate('/dashboard/patients')}>
        <ArrowLeft size={16} style={{ color: 'var(--primary)' }} /> Back to Patient List
      </button>

      {/* Identity Card */}
      <div className="card chart-id anim-fade-up delay-1">
        <div className="id-left">
          <div className="avatar avatar-xl">{initials}</div>
          <div>
            <h2 style={{ marginBottom: 2 }}>{patient.name}</h2>
            <p className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>
              Patient ID: <span className="font-mono">{patient.id}</span>{!isRestrictedRole && <> &bull; {patient.age !== null && patient.age !== undefined ? `${patient.age} yrs old` : 'Age not recorded'} &bull; {patient.gender || 'Gender not recorded'}</>} &bull; {patient.grade_level ? `${patient.grade_level} — ` : ''}{patient.section || 'Unassigned'}
            </p>
          </div>
        </div>
        <div className="id-flags" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className={`badge badge-${patient.status_color || 'green'}`}>{patient.status}</span>
          {!isRestrictedRole && (
            ['Checked In', 'Under Observation'].includes(patient.status) ? (
              <button className="btn btn-secondary btn-sm" onClick={handleCheckOut} type="button">
                Check-Out Student
              </button>
            ) : (
              <button className="btn btn-primary btn-sm" onClick={() => setShowCheckInModal(true)} type="button">
                Check-In Student
              </button>
            )
          )}
        </div>
      </div>

      {/* Critical Medical Flags */}
      {(() => {
        if (isRestrictedRole) {
          return (
            <div className="critical-flags-banner danger anim-fade-up delay-1" style={{ background: 'var(--primary-light)', borderColor: 'rgba(59, 130, 246, 0.2)', color: 'var(--primary)' }}>
              <ShieldAlert size={20} style={{ color: 'var(--primary)' }} />
              <div className="flags-content">
                <strong>Critical Medical Flags:</strong>
                <span className="flag-item allergy-flag" style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>Sensitive health data restricted</span>
              </div>
            </div>
          );
        }

        const allergyStatus = clinicalEntryStatus(patient.allergies, noKnownAllergyValues);
        const conditionStatus = clinicalEntryStatus(patient.chronic_conditions, noKnownConditionValues);
        const hasDocumentedFlag = allergyStatus === 'documented' || conditionStatus === 'documented';
        const needsReview = allergyStatus === 'unknown' || conditionStatus === 'unknown';
        const bannerClass = hasDocumentedFlag ? 'danger' : needsReview ? 'review' : 'success';
        return (
          <div className={`critical-flags-banner ${bannerClass} anim-fade-up delay-1`}>
            {hasDocumentedFlag || needsReview
              ? <ShieldAlert size={20} aria-hidden="true" />
              : <CheckCircle size={20} aria-hidden="true" />}
            <div className="flags-content">
              <strong>Medical History:</strong>
              {allergyStatus === 'unknown' && <span className="flag-item review-flag">Allergy history not reviewed</span>}
              {allergyStatus === 'clear' && <span className="flag-item clear-flag">No known allergies (reviewed)</span>}
              {allergyStatus === 'documented' && <span className="flag-item allergy-flag">Allergies: {patient.allergies}</span>}
              {conditionStatus === 'unknown' && <span className="flag-item review-flag">Chronic conditions not reviewed</span>}
              {conditionStatus === 'clear' && <span className="flag-item clear-flag">No known chronic conditions (reviewed)</span>}
              {conditionStatus === 'documented' && <span className="flag-item condition-flag">Chronic Conditions: {patient.chronic_conditions}</span>}
            </div>
          </div>
        );
      })()}

      {/* Tabs */}
      <div className="chart-tabs anim-fade-up delay-2">
        {availableTabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.key} className={`ctab ${displayedTab === tab.key ? 'active' : ''}`} onClick={() => setActiveTab(tab.key)}>
              <Icon size={15} style={{ color: displayedTab === tab.key ? '#fff' : 'var(--primary)' }} /> {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="patient-chart-body anim-fade-up delay-3">
        {displayedTab === 'overview' && (
          <OverviewTab 
            patient={patient} 
            onRecordVitals={handleRecordVitals} 
            onUpdateImmunization={handleUpdateImmunization}
            onUpdatePatient={handleUpdatePatient}
            onAddConsent={handleAddConsent}
            isRestrictedRole={isRestrictedRole}
          />
        )}
        {displayedTab === 'soap' && <SOAPTab patient={patient} onSaveNote={handleSaveNote} onCompleteCheckout={() => { setActiveTab('overview'); handleCheckOut(); }} />}
        {displayedTab === 'orders' && <OrdersTab patient={patient} user={user} onSaveOrder={handleSaveOrder} />}
        {displayedTab === 'history' && <HistoryTab patient={patient} />}
        {displayedTab === 'excuse-slips' && (
          <ExcuseSlipsTab 
            patient={patient} 
            onCreateExcuseSlip={handleCreateExcuseSlip}
            isRestrictedRole={isRestrictedRole}
          />
        )}
      </div>

      {/* Check-In Modal */}
      {showCheckInModal && createPortal(
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h3>New Clinic Check-In</h3>
              <button className="btn-close" disabled={isCheckingIn} onClick={() => setShowCheckInModal(false)} type="button" aria-label="Close modal"><X size={18} /></button>
            </div>
            <form onSubmit={handleCheckIn}>
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label className="form-label">Chief Complaint *</label>
                <textarea
                  className="form-textarea"
                  disabled={isCheckingIn}
                  rows={4}
                  placeholder="Enter the reason for visiting the clinic today..."
                  required
                  value={chiefComplaint}
                  onChange={(e) => setChiefComplaint(e.target.value)}
                />
              </div>
              <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button type="button" className="btn btn-secondary" disabled={isCheckingIn} onClick={() => setShowCheckInModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={isCheckingIn}>{isCheckingIn ? 'Saving…' : 'Record Check-In'}</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {showCheckOutModal && <CheckoutModal patient={patient} onClose={() => setShowCheckOutModal(false)} onSubmit={handleCheckOutConfirm} />}
    </div>
  );
};

/* ===== IMMUNIZATION MATRIX ===== */
const ImmunizationMatrix = ({ patient, onUpdateDoses }) => {
  const immunizations = patient.immunizations || [];
  const [showAddForm, setShowAddForm] = useState(false);
  const [newVaccineName, setNewVaccineName] = useState('');
  const [newDosesRequired, setNewDosesRequired] = useState('');
  const [newDosesReceived, setNewDosesReceived] = useState('');
  const [sourceReviewed, setSourceReviewed] = useState(false);

  const handleAddVaccine = async (e) => {
    e.preventDefault();
    if (!newVaccineName.trim() || newDosesReceived === '' || !sourceReviewed) return;
    const reqDoses = Number(newDosesRequired);
    const receivedDoses = Number(newDosesReceived);
    if (!Number.isInteger(reqDoses) || reqDoses <= 0 || reqDoses > 50) {
      alert("Required doses must be a whole number from 1 to 50.");
      return;
    }
    if (!Number.isInteger(receivedDoses) || receivedDoses < 0 || receivedDoses > reqDoses) {
      alert("Doses received must be a whole number within the required count.");
      return;
    }
    const saved = await onUpdateDoses(newVaccineName.trim(), receivedDoses, reqDoses);
    if (saved === false) return;
    setNewVaccineName('');
    setNewDosesRequired('');
    setNewDosesReceived('');
    setSourceReviewed(false);
    setShowAddForm(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
      {immunizations.length === 0 ? (
        <div className="empty-sm">
          <p className="text-muted">No immunization history is recorded. Verify the source record before adding doses; no entry does not mean no vaccines were received.</p>
        </div>
      ) : (
        <div className="immunization-list" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {immunizations.map(imm => {
            const isVerified = imm.verification_status === 'verified';
            const isComplete = isVerified && imm.doses_received >= imm.doses_required;
            return (
              <div key={imm.id} className={`immunization-row ${isComplete ? 'complete' : ''}`}>
                <div className="imm-info">
                  <span className="imm-name">{imm.vaccine_name}</span>
                  <span className="imm-status-text text-muted">
                    {isVerified
                      ? `${imm.doses_received} of ${imm.doses_required} doses recorded`
                      : `Unverified count: ${imm.doses_received} of ${imm.doses_required}. Review source history.`}
                  </span>
                </div>
                
                <div className="imm-doses-selector">
                  {Array.from({ length: imm.doses_required }).map((_, idx) => {
                    const doseNum = idx + 1;
                    const isSelected = doseNum <= imm.doses_received;
                    return (
                      <button
                        key={idx}
                        type="button"
                        className={`dose-circle-btn ${isSelected ? 'active' : ''}`}
                        disabled={!isVerified}
                        onClick={() => {
                          const targetDoses = isSelected && imm.doses_received === doseNum ? doseNum - 1 : doseNum;
                          onUpdateDoses(imm.vaccine_name, targetDoses, imm.doses_required);
                        }}
                        aria-label={`Mark ${doseNum} of ${imm.doses_required} ${imm.vaccine_name} doses as received after reviewing the source record`}
                        title={`Mark dose ${doseNum} as received`}
                      >
                        {doseNum}
                      </button>
                    );
                  })}
                </div>

                <div className="imm-status-badge">
                  {!isVerified ? (
                    <>
                      <span className="badge badge-yellow">Not verified</span>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onUpdateDoses(imm.vaccine_name, imm.doses_received, imm.doses_required)}>
                        Verify history
                      </button>
                    </>
                  ) : isComplete ? (
                    <span className="badge badge-green">Complete</span>
                  ) : (
                    <span className="badge badge-yellow">Outstanding</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showAddForm ? (
        <form onSubmit={handleAddVaccine} style={{ marginTop: 8, padding: 14, background: 'var(--gray-50)', borderRadius: 'var(--radius-md)', border: '1px solid var(--gray-200)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="immunization-new-name" style={{ fontSize: 11, fontWeight: 600 }}>Vaccine Name</label>
            <input 
              id="immunization-new-name"
              type="text" 
              className="form-input" 
              placeholder="e.g. COVID-19, Flu Shot, HPV" 
              required 
              value={newVaccineName} 
              onChange={(e) => setNewVaccineName(e.target.value)} 
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="immunization-required" style={{ fontSize: 11, fontWeight: 600 }}>Doses Required in the Source Schedule</label>
            <input id="immunization-required" type="number" min="1" max="50" step="1" required className="form-input" value={newDosesRequired} onChange={(e) => { setNewDosesRequired(e.target.value); setNewDosesReceived(''); }} />
            <span className="form-hint">Schedules vary. Enter the count from the applicable record or clinic protocol.</span>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="immunization-received" style={{ fontSize: 11, fontWeight: 600 }}>Doses Received in the Source Record</label>
            <input id="immunization-received" type="number" min="0" max={newDosesRequired || undefined} step="1" className="form-input" required value={newDosesReceived} onChange={(e) => setNewDosesReceived(e.target.value)} />
          </div>
          <label className="consent-label">
            <input type="checkbox" required checked={sourceReviewed} onChange={(e) => setSourceReviewed(e.target.checked)} />
            <span>I reviewed the source immunization record and entered its dose count.</span>
          </label>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowAddForm(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary btn-sm">Add Vaccine</button>
          </div>
        </form>
      ) : (
        <button 
          type="button" 
          className="btn btn-ghost btn-sm" 
          style={{ width: '100%', justifyContent: 'center', border: '1px dashed var(--gray-300)', background: 'var(--gray-50)' }} 
          onClick={() => setShowAddForm(true)}
        >
          + Add Custom Vaccine
        </button>
      )}
    </div>
  );
};

/* ===== VITAL ALARMS CHECK ===== */
const checkVitalAlarm = (label, val) => {
  if (val === undefined || val === null || val === '') return { isAbnormal: false };
  
  if (label === 'Temperature') {
    const num = parseFloat(val);
    if (isNaN(num)) return { isAbnormal: false };
    if (num >= 38.0) return { isAbnormal: true, type: 'High', status: 'Fever' };
    if (num < 35.5) return { isAbnormal: true, type: 'Low', status: 'Hypothermia' };
  }
  
  if (label === 'Heart Rate') {
    const num = parseInt(val);
    if (isNaN(num)) return { isAbnormal: false };
    if (num > 100) return { isAbnormal: true, type: 'High', status: 'Tachycardia' };
    if (num < 60) return { isAbnormal: true, type: 'Low', status: 'Bradycardia' };
  }
  
  if (label === 'Respiratory Rate') {
    const num = parseInt(val);
    if (isNaN(num)) return { isAbnormal: false };
    if (num > 24) return { isAbnormal: true, type: 'High', status: 'Tachypnea' };
    if (num < 12) return { isAbnormal: true, type: 'Low', status: 'Bradypnea' };
  }
  
  if (label === 'O₂ Sat') {
    const num = parseInt(val);
    if (isNaN(num)) return { isAbnormal: false };
    if (num < 95) return { isAbnormal: true, type: 'Low', status: 'Hypoxia' };
  }
  
  if (label === 'Blood Pressure') {
    const parts = val.toString().split('/');
    if (parts.length === 2) {
      const sys = parseInt(parts[0]);
      const dia = parseInt(parts[1]);
      if (!isNaN(sys) && !isNaN(dia)) {
        if (sys > 130 || dia > 90) return { isAbnormal: true, type: 'High', status: 'Hypertension' };
        if (sys < 90 || dia < 60) return { isAbnormal: true, type: 'Low', status: 'Hypotension' };
      }
    }
  }
  
  return { isAbnormal: false };
};

/* ===== OVERVIEW ===== */
const OverviewTab = ({ patient, onRecordVitals, onUpdateImmunization, onUpdatePatient, onAddConsent, isRestrictedRole }) => {
  const historicalVitals = patient.vitals?.[0];
  const checkIn = (patient.logs || []).find((entry) => entry.event_type === 'Check-in');
  const activeVisit = ['Checked In', 'Under Observation'].includes(patient.status);
  const currentVitals = activeVisit && checkIn?.created_at
    ? (patient.vitals || []).find((entry) => new Date(entry.recorded_at).getTime() >= new Date(checkIn.created_at).getTime())
    : null;
  const latestVitals = currentVitals || {};
  const [showForm, setShowForm] = useState(false);
  const [isSavingVitals, setIsSavingVitals] = useState(false);
  const [vitalsData, setVitalsData] = useState({ temperature: '', heart_rate: '', blood_pressure: '', o2_sat: '', respiratory_rate: '' });

  // Demographics edit mode
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editData, setEditData] = useState({});

  // Consent modal state
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [consentFormData, setConsentFormData] = useState({
    consent_type: 'Medication',
    parent_name: patient.emergency_contact_name || '',
    document_name: '',
    date_granted: clinicDateString(),
    notes: ''
  });

  const startEditing = () => {
    setEditData({
      name: patient.name || '',
      date_of_birth: patient.date_of_birth || '',
      age: patient.age?.toString() || '',
      gender: patient.gender || 'Not recorded',
      grade_level: patient.grade_level || '',
      section: patient.section || '',
      status: patient.status || 'Active',
      status_color: patient.status_color || 'green',
      graduation_year: patient.graduation_year?.toString() || '',
      allergies: patient.allergies || 'Unknown - not reviewed',
      chronic_conditions: patient.chronic_conditions || 'Unknown - not reviewed',
      emergency_contact_name: patient.emergency_contact_name || '',
      emergency_contact_phone: patient.emergency_contact_phone || '',
      emergency_contact_relationship: patient.emergency_contact_relationship || '',
      parent_email: patient.parent_email || '',
      adviser_name: patient.adviser_name || '',
      adviser_email: patient.adviser_email || '',
    });
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditData({});
  };

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditData(prev => {
      const updated = { ...prev, [name]: value };
      if (name === 'date_of_birth' && value) {
        const calculatedAge = clinicAgeAtDateOfBirth(value);
        updated.age = calculatedAge !== null && calculatedAge >= 0 ? calculatedAge.toString() : '';
      }
      if (name === 'age') updated.date_of_birth = '';
      if (name === 'status') {
        const colorMap = { 'Checked In': 'amber', 'Checked Out': 'gray' };
        updated.status_color = colorMap[value] || 'gray';
      }
      return updated;
    });
  };

  const handleSaveDemographics = async (e) => {
    e.preventDefault();
    if (!editData.name?.trim()) return;

    if (editData.date_of_birth && editData.date_of_birth > clinicDateString()) {
      alert("Date of birth cannot be in the future.");
      return;
    }

    if (editData.graduation_year) {
      const gradYear = parseInt(editData.graduation_year);
      if (isNaN(gradYear) || gradYear <= 0) {
        alert("Graduation year must be a valid positive integer.");
        return;
      }
    }

    setIsSaving(true);
    try {
      await onUpdatePatient(editData);
      setIsEditing(false);
    } catch (failure) {
      window.alert('Could not save the patient details: ' + failure.message);
    } finally { setIsSaving(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isSavingVitals) return;
    const temp = parseFloat(vitalsData.temperature);
    const hr = parseInt(vitalsData.heart_rate);
    const o2 = parseInt(vitalsData.o2_sat);
    const rr = parseInt(vitalsData.respiratory_rate);

    if (isNaN(temp) || temp <= 0 || temp > 50) {
      alert("Please enter a valid temperature between 0 and 50 °C.");
      return;
    }
    if (isNaN(hr) || hr <= 0 || hr > 300) {
      alert("Please enter a valid heart rate.");
      return;
    }
    if (isNaN(o2) || o2 < 0 || o2 > 100) {
      alert("Oxygen saturation must be between 0% and 100%.");
      return;
    }
    if (isNaN(rr) || rr <= 0 || rr > 100) {
      alert("Please enter a valid respiratory rate.");
      return;
    }
    const bpPattern = /^\d{2,3}\/\d{2,3}$/;
    if (!bpPattern.test(vitalsData.blood_pressure.trim())) {
      alert("Blood pressure must be in Sys/Dia format (e.g., 120/80).");
      return;
    }

    setIsSavingVitals(true);
    try {
      await onRecordVitals(vitalsData);
      setShowForm(false);
      setVitalsData({ temperature: '', heart_rate: '', blood_pressure: '', o2_sat: '', respiratory_rate: '' });
    } catch (failure) {
      window.alert('Could not save the vital signs: ' + failure.message);
    } finally { setIsSavingVitals(false); }
  };

  const handleConsentSubmit = async (e) => {
    e.preventDefault();
    if (!consentFormData.consent_type.trim() || !consentFormData.parent_name.trim() || !consentFormData.document_name.trim()) return;

    if (consentFormData.date_granted) {
      const selectedDate = new Date(consentFormData.date_granted);
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      if (selectedDate > today) {
        alert("Consent date cannot be in the future.");
        return;
      }
    }

    try { await onAddConsent(consentFormData); }
    catch (failure) { window.alert('Could not save the consent: ' + failure.message); return; }
    setConsentFormData({
      consent_type: 'Medication',
      parent_name: patient.emergency_contact_name || '',
      document_name: '',
      date_granted: clinicDateString(),
      notes: ''
    });
    setShowConsentModal(false);
  };

  const hasConsent = patient.consents && patient.consents.length > 0;

  return (
    <div className="overview-grid">
      {/* Demographics Card */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4 className="sec-title" style={{ margin: 0, borderBottom: 'none', paddingBottom: 0 }}><User size={15} style={{ color: 'var(--primary)' }} /> Demographics</h4>
          {!isEditing && !isRestrictedRole && (
            <button className="btn btn-ghost btn-sm" onClick={startEditing}>
              <Pencil size={14} style={{ color: 'var(--primary)' }} /> Edit
            </button>
          )}
        </div>

        {isEditing ? (
          <form onSubmit={handleSaveDemographics} style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" htmlFor="edit-name">Full Name *</label>
              <input id="edit-name" type="text" name="name" className="form-input" required value={editData.name} onChange={handleEditChange} />
            </div>
            <div className="form-row-2">
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" htmlFor="edit-dob">Date of Birth</label>
                <input id="edit-dob" type="date" name="date_of_birth" className="form-input" max={clinicDateString()} value={editData.date_of_birth} onChange={handleEditChange} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" htmlFor="edit-age">Age</label>
                <input id="edit-age" type="number" min="0" max="150" step="1" name="age" className="form-input" disabled={Boolean(editData.date_of_birth)} value={editData.age} onChange={handleEditChange} placeholder="Enter if date of birth is unavailable" />
              </div>
            </div>
            <div className="form-row-2">
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" htmlFor="edit-gender">Gender</label>
                <select id="edit-gender" name="gender" className="form-select" value={editData.gender} onChange={handleEditChange}>
                  <option value="">Select</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                  <option value="Not recorded">Not recorded</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" htmlFor="edit-grade">Grade Level</label>
                <select id="edit-grade" name="grade_level" className="form-select" value={editData.grade_level} onChange={handleEditChange}>
                  <option value="">Select Grade</option>
                  <option value="Kindergarten">Kindergarten</option>
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i + 1} value={`Grade ${i + 1}`}>Grade {i + 1}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-row-2">
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" htmlFor="edit-section">Section / Room</label>
                <input id="edit-section" type="text" name="section" className="form-input" value={editData.section} onChange={handleEditChange} placeholder="e.g. Grade 5-A" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" htmlFor="edit-grad-year">Graduation Year</label>
                <input id="edit-grad-year" type="number" name="graduation_year" className="form-input" value={editData.graduation_year} onChange={handleEditChange} placeholder="e.g. 2028" />
              </div>
            </div>

            <h5 style={{ marginTop: 8, fontSize: 'var(--text-sm)', color: 'var(--gray-600)' }}>Medical Information</h5>
            <div className="form-row-2">
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" htmlFor="edit-allergies">Critical Allergies</label>
                <input id="edit-allergies" type="text" name="allergies" className="form-input" value={editData.allergies} onChange={handleEditChange} placeholder="List allergies or record no known allergies after review" aria-describedby="edit-allergies-help" />
                <span id="edit-allergies-help" className="form-hint">Blank or “None” is treated as unknown. Use “No known allergies” only after checking the source record.</span>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" htmlFor="edit-conditions">Chronic Conditions</label>
                <input id="edit-conditions" type="text" name="chronic_conditions" className="form-input" value={editData.chronic_conditions} onChange={handleEditChange} placeholder="List conditions or state none after review" aria-describedby="edit-conditions-help" />
                <span id="edit-conditions-help" className="form-hint">Use “No known chronic conditions” after checking the source record.</span>
              </div>
            </div>

            <h5 style={{ marginTop: 8, fontSize: 'var(--text-sm)', color: 'var(--gray-600)' }}>Emergency Contact</h5>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" htmlFor="edit-contact-name">Contact Name</label>
              <input id="edit-contact-name" type="text" name="emergency_contact_name" className="form-input" value={editData.emergency_contact_name} onChange={handleEditChange} placeholder="e.g. Jane Doe" />
            </div>
            <div className="form-row-2">
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" htmlFor="edit-contact-phone">Phone Number</label>
                <input id="edit-contact-phone" type="text" name="emergency_contact_phone" className="form-input" value={editData.emergency_contact_phone} onChange={handleEditChange} placeholder="e.g. 555-0199" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" htmlFor="edit-contact-rel">Relationship</label>
                <input id="edit-contact-rel" type="text" name="emergency_contact_relationship" className="form-input" value={editData.emergency_contact_relationship} onChange={handleEditChange} placeholder="e.g. Mother" />
              </div>
            </div>

            <h5 style={{ marginTop: 8, fontSize: 'var(--text-sm)', color: 'var(--gray-600)' }}>Parent & Adviser Contacts</h5>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" htmlFor="edit-parent-email">Parent Email Address</label>
              <input id="edit-parent-email" type="email" name="parent_email" className="form-input" value={editData.parent_email} onChange={handleEditChange} placeholder="e.g. parent@example.com" />
            </div>
            <div className="form-row-2">
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" htmlFor="edit-adviser-name">Homeroom Adviser Name</label>
                <input id="edit-adviser-name" type="text" name="adviser_name" className="form-input" value={editData.adviser_name} onChange={handleEditChange} placeholder="e.g. Teacher Sarah" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" htmlFor="edit-adviser-email">Homeroom Adviser Email</label>
                <input id="edit-adviser-email" type="email" name="adviser_email" className="form-input" value={editData.adviser_email} onChange={handleEditChange} placeholder="e.g. teacher@example.com" />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8, paddingTop: 12, borderTop: '1px solid var(--gray-200)' }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={cancelEditing} disabled={isSaving}>
                <X size={14} style={{ color: 'var(--primary)' }} /> Cancel
              </button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={isSaving}>
                {isSaving ? <Loader2 size={14} className="spin" /> : <Save size={14} />} Save Changes
              </button>
            </div>
          </form>
        ) : (
          <div className="demo-details" style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 'var(--text-sm)' }}>
            <div><strong>Full Name:</strong> {patient.name}</div>
            {!isRestrictedRole && (<div><strong>Date of Birth:</strong> {patient.date_of_birth ? formatClinicDate(patient.date_of_birth, { dateStyle: 'long' }) : '—'}</div>)}
            {!isRestrictedRole && (<div><strong>Age:</strong> {patient.age !== null && patient.age !== undefined ? `${patient.age} years old` : '—'}</div>)}
            {!isRestrictedRole && (<div><strong>Gender:</strong> {patient.gender || '—'}</div>)}
            <div><strong>Grade Level:</strong> {patient.grade_level || '—'}</div>
            <div><strong>Section / Room:</strong> {patient.section || '—'}</div>
            {!isRestrictedRole && (<div><strong>Graduation Year:</strong> {patient.graduation_year || '—'}</div>)}
            {!isRestrictedRole && (<div><strong>Parent Email:</strong> {patient.parent_email || '—'}</div>)}
            {!isRestrictedRole && (<div><strong>Homeroom Adviser:</strong> {patient.adviser_name || '—'} {patient.adviser_email ? `(${patient.adviser_email})` : ''}</div>)}
            <div><strong>Registered:</strong> {formatClinicDate(patient.created_at)}</div>
          </div>
        )}
      </div>

      {isRestrictedRole && <div className="card"><p>Contact details, consent documents and clinical information are not available to your role.</p></div>}
      {/* Emergency Contacts Card */}
      {!isRestrictedRole && <div className="card">
        <h4 className="sec-title"><ShieldAlert size={15} style={{ color: 'var(--primary)' }} /> Emergency Contacts</h4>
        {patient.emergency_contact_name ? (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 'var(--text-sm)' }}>
            <div><strong>Contact Name:</strong> {patient.emergency_contact_name}</div>
            <div><strong>Relationship:</strong> {patient.emergency_contact_relationship || '—'}</div>
            <div><strong>Phone Number:</strong> {patient.emergency_contact_phone || '—'}</div>
          </div>
        ) : (
          <div className="empty-sm"><p className="text-muted">No emergency contacts on file.</p></div>
        )}
      </div>

      }
      {/* Parental Consents Card */}
      {!isRestrictedRole && <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h4 className="sec-title" style={{ margin: 0, borderBottom: 'none', paddingBottom: 0 }}><ShieldCheck size={15} style={{ color: 'var(--primary)' }} /> Parental Consents</h4>
          {!isRestrictedRole && (
            <button className="btn btn-primary btn-sm" onClick={() => setShowConsentModal(true)}>
              Add Consent
            </button>
          )}
        </div>
        
        {hasConsent ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#f0fdf4', borderRadius: 'var(--radius-md)', border: '1px solid #dcfce7', color: '#166534', marginBottom: 12, fontSize: 'var(--text-sm)' }}>
            <ShieldCheck size={16} style={{ color: 'var(--primary)' }} />
            <strong>{patient.consents.length} consent document{patient.consents.length === 1 ? '' : 's'} on file</strong>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#fef2f2', borderRadius: 'var(--radius-md)', border: '1px solid #fee2e2', color: '#991b1b', marginBottom: 12, fontSize: 'var(--text-sm)' }}>
            <ShieldAlert size={16} style={{ color: 'var(--primary)' }} />
            <strong>No consent documents on file</strong>
          </div>
        )}

        <div className="consent-list" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {patient.consents && patient.consents.length > 0 ? (
            patient.consents.map(c => (
              <div key={c.id} style={{ padding: 10, background: 'var(--gray-50)', borderRadius: 'var(--radius-md)', border: '1px solid var(--gray-200)', fontSize: 'var(--text-xs)' }}>
                <div><strong>Type:</strong> {c.consent_type}</div>
                <div><strong>Parent:</strong> {c.parent_name}</div>
                <div><strong>File:</strong> <span className="text-primary" style={{ fontWeight: 600 }}>{c.document_name}</span></div>
                <div><strong>Granted:</strong> {formatClinicDate(c.date_granted)}</div>
                {c.notes && <div style={{ marginTop: 4 }}><strong>Notes:</strong> {c.notes}</div>}
              </div>
            ))
          ) : (
            <p className="text-muted" style={{ fontSize: 'var(--text-xs)', textAlign: 'center', margin: '10px 0' }}>No consent documents logged.</p>
          )}
        </div>
      </div>

      }
      {/* Vital Signs Card (clinical only) */}
      {!isRestrictedRole && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h4 className="sec-title" style={{ margin: 0 }}><Thermometer size={15} style={{ color: 'var(--primary)' }} /> Vital Signs</h4>
            <button className={`btn ${showForm ? 'btn-ghost' : 'btn-primary'} btn-sm`} disabled={isSavingVitals} onClick={() => setShowForm(!showForm)}>
              {showForm ? 'Cancel' : 'Record Vitals'}
            </button>
          </div>
          
          <p className="form-hint">{currentVitals ? <>Recorded {formatClinicDateTime(currentVitals.recorded_at)} • {currentVitals.recorded_by || 'Clinician not recorded'}</> : activeVisit ? 'No vitals recorded for this visit.' : 'No active clinic visit.'}</p>
          {!currentVitals && historicalVitals && <details style={{ marginBottom: 12 }}><summary>Previous measurements — {formatClinicDateTime(historicalVitals.recorded_at)}</summary><p>Historical measurements; not recorded for the current visit. By {historicalVitals.recorded_by || 'clinician not recorded'}.</p><p>Temperature {historicalVitals.temperature} °C • HR {historicalVitals.heart_rate} bpm • BP {historicalVitals.blood_pressure} mmHg • O₂ {historicalVitals.o2_sat}% • RR {historicalVitals.respiratory_rate} breaths/min</p></details>}
          {showForm ? (
            <form onSubmit={handleSubmit} aria-busy={isSavingVitals} style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="form-row-2">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="vital-temperature" style={{ fontSize: 11 }}>Temp (°C)</label>
                  <input id="vital-temperature" type="number" min="0.1" max="50" step="0.1" name="temperature" className="form-input" required value={vitalsData.temperature} onChange={(e) => setVitalsData({...vitalsData, temperature: e.target.value})} placeholder="e.g. 36.8" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="vital-heart-rate" style={{ fontSize: 11 }}>Heart Rate (bpm)</label>
                  <input id="vital-heart-rate" type="number" min="1" max="300" step="1" name="heart_rate" className="form-input" required value={vitalsData.heart_rate} onChange={(e) => setVitalsData({...vitalsData, heart_rate: e.target.value})} placeholder="e.g. 72" />
                </div>
              </div>
              <div className="form-row-2">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="vital-blood-pressure" style={{ fontSize: 11 }}>Blood Pressure (mmHg)</label>
                  <input id="vital-blood-pressure" type="text" name="blood_pressure" className="form-input" required value={vitalsData.blood_pressure} onChange={(e) => setVitalsData({...vitalsData, blood_pressure: e.target.value})} placeholder="e.g. 120/80" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="vital-o2-sat" style={{ fontSize: 11 }}>O₂ Saturation (%)</label>
                  <input id="vital-o2-sat" type="number" min="0" max="100" step="1" name="o2_sat" className="form-input" required value={vitalsData.o2_sat} onChange={(e) => setVitalsData({...vitalsData, o2_sat: e.target.value})} placeholder="e.g. 98" />
                </div>
              </div>
              <div className="form-row-2">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="vital-respiratory-rate" style={{ fontSize: 11 }}>Respiratory Rate (breaths/min)</label>
                  <input id="vital-respiratory-rate" type="number" min="1" max="100" step="1" name="respiratory_rate" className="form-input" required value={vitalsData.respiratory_rate} onChange={(e) => setVitalsData({...vitalsData, respiratory_rate: e.target.value})} placeholder="e.g. 18" />
                </div>
                <div className="form-group" style={{ marginBottom: 0, visibility: 'hidden' }}></div>
              </div>
              <button type="submit" className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-end', marginTop: 4 }} disabled={isSavingVitals}>{isSavingVitals ? 'Saving…' : 'Save Vitals'}</button>
            </form>
          ) : (
            <div className="vitals-grid">
              {[
                ['Temperature', latestVitals.temperature, '°C'],
                ['Heart Rate', latestVitals.heart_rate, 'bpm'],
                ['Respiratory Rate', latestVitals.respiratory_rate, 'breaths/min'],
                ['Blood Pressure', latestVitals.blood_pressure, 'mmHg'],
                ['O₂ Sat', latestVitals.o2_sat, '%']
              ].map(([label, val, unit]) => {
                const { isAbnormal } = checkVitalAlarm(label, val);
                const hasValue = val !== undefined && val !== null && val !== '';
                return (
                  <div className={`vital-slot ${hasValue ? 'has-value' : ''} ${isAbnormal ? 'alarm' : ''}`} key={label}>
                    <span className="vs-label">{label}</span>
                    <span className="vs-value">{hasValue ? val : '—'}</span>
                    <span className="vs-unit">{unit}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Immunization Card (clinical only) */}
      {!isRestrictedRole && (
        <div className="card">
          <h4 className="sec-title"><Syringe size={15} style={{ color: 'var(--primary)' }} /> Immunization Matrix</h4>
          <ImmunizationMatrix patient={patient} onUpdateDoses={onUpdateImmunization} />
        </div>
      )}

      {/* Add Consent Modal */}
      {showConsentModal && createPortal(
        <div className="modal-overlay" onClick={() => setShowConsentModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Upload Parental Consent</h3>
              <button className="btn-close" onClick={() => setShowConsentModal(false)} type="button"><X size={18} style={{ color: 'var(--primary)' }} /></button>
            </div>
            <form onSubmit={handleConsentSubmit}>
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label className="form-label">Consent Type *</label>
                <select 
                  className="form-select" 
                  value={consentFormData.consent_type}
                  onChange={(e) => setConsentFormData({ ...consentFormData, consent_type: e.target.value })}
                >
                  <option value="Medication">Medication Administration</option>
                  <option value="Treatment">Emergency Treatment</option>
                  <option value="Immunization">School Vaccination</option>
                  <option value="Dental">Dental Care</option>
                  <option value="General">General Clinic Check-up</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label className="form-label">Parent / Guardian Name *</label>
                <input 
                  type="text" 
                  className="form-input" 
                  required
                  placeholder="e.g. Jane Doe"
                  value={consentFormData.parent_name}
                  onChange={(e) => setConsentFormData({ ...consentFormData, parent_name: e.target.value })}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label className="form-label">Document File Name *</label>
                <input 
                  type="text" 
                  className="form-input" 
                  required
                  placeholder="e.g. parent_consent_signed.pdf"
                  value={consentFormData.document_name}
                  onChange={(e) => setConsentFormData({ ...consentFormData, document_name: e.target.value })}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label className="form-label">Date Granted *</label>
                <input 
                  type="date" 
                  className="form-input" 
                  required
                  max={clinicDateString()}
                  value={consentFormData.date_granted}
                  onChange={(e) => setConsentFormData({ ...consentFormData, date_granted: e.target.value })}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label className="form-label">Notes / Limitations</label>
                <textarea 
                  className="form-textarea" 
                  rows={2}
                  placeholder="e.g. Approved ibuprofen only. No aspirin."
                  value={consentFormData.notes}
                  onChange={(e) => setConsentFormData({ ...consentFormData, notes: e.target.value })}
                />
              </div>
              <div className="modal-actions" style={{ margin: 0, paddingTop: 14 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowConsentModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Consent</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

/* ===== SOAP ===== */
const SOAPTab = ({ patient, onSaveNote, onCompleteCheckout }) => {
  const { clinicalDrafts } = useAuth();
  const draftKey = 'soap:' + patient.id;
  const [fields, setFields] = useState(() => clinicalDrafts.current.get(draftKey) || { s: '', o: '', a: '', p: '', disposition: '' });
  const [saveError, setSaveError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const latestNote = patient.soapNotes?.[0];
  const latestCheckIn = (patient.logs || []).find((log) => log.event_type === 'Check-in');
  const latestNoteTime = latestNote?.created_at ? new Date(latestNote.created_at).getTime() : NaN;
  const latestCheckInTime = latestCheckIn?.created_at ? new Date(latestCheckIn.created_at).getTime() : NaN;
  const noteIsFromCurrentVisit = !Number.isFinite(latestCheckInTime) || latestNoteTime >= latestCheckInTime;
  const dispositionNeedsCheckout = noteIsFromCurrentVisit &&
    ['Returned to Class', 'Sent Home'].includes(latestNote?.disposition) &&
    ['Checked In', 'Under Observation'].includes(patient.status);
  const update = (key, val) => {
    setSaveError('');
    const next = { ...fields, [key]: val };
    setFields(next);
    if (Object.values(next).some((value) => value.trim())) clinicalDrafts.current.set(draftKey, next);
    else clinicalDrafts.current.delete(draftKey);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSaving) return;
    if (!fields.s.trim() || !fields.o.trim() || !fields.a.trim() || !fields.p.trim() || !fields.disposition.trim()) {
      setSaveError('Complete the Subjective, Objective, Assessment, Plan, and Disposition fields before saving.');
      return;
    }

    setSaveError('');
    setIsSaving(true);
    try {
      await onSaveNote({
        subjective: fields.s,
        objective: fields.o,
        assessment: fields.a,
        plan: fields.p,
        disposition: fields.disposition
      });
      if (clinicalDrafts.current.get(draftKey) === fields) clinicalDrafts.current.delete(draftKey);
      setFields((current) => current === fields ? { s: '', o: '', a: '', p: '', disposition: '' } : current);
    } catch (err) {
      setSaveError(err.message || 'The clinical note could not be saved. Your draft is still here.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="soap-panel">
      <div className="card">
        <div className="soap-top">
          <h4>New Clinical Note</h4>
          <span className="badge badge-blue">SOAP</span>
        </div>
        <form onSubmit={handleSubmit} className="soap-form">
          {saveError && <div className="alert-bar alert-danger" role="alert" style={{ marginBottom: 12 }}>{saveError}</div>}
          {[
            { key: 's', color: 'blue',   full: 'Subjective', hint: 'Patient-reported symptoms and complaints' },
            { key: 'o', color: 'purple', full: 'Objective',  hint: 'Clinician observations, vitals, measurements' },
            { key: 'a', color: 'amber',  full: 'Assessment', hint: 'Clinical impression and diagnosis' },
            { key: 'p', color: 'green',  full: 'Plan',       hint: 'Treatment plan, medications, follow-up' },
          ].map(s => (
            <div className="soap-row" key={s.key}>
              <div className={`soap-letter sl-${s.color}`}>{s.key.toUpperCase()}</div>
              <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                <label className="form-label" htmlFor={`soap-${s.key}`}>{s.full}</label>
                <textarea id={`soap-${s.key}`} disabled={isSaving} className="form-textarea" rows={s.key === 's' || s.key === 'o' ? 3 : 2} value={fields[s.key]} onChange={(e) => update(s.key, e.target.value)} aria-describedby={`soap-${s.key}-hint`} />
                <span id={`soap-${s.key}-hint`} className="form-hint">{s.hint}</span>
              </div>
            </div>
          ))}
          <div className="soap-row" style={{ marginTop: 12, borderTop: '1px solid var(--gray-200)', paddingTop: 16 }}>
            <div className="soap-letter sl-gray" style={{ visibility: 'hidden' }}>D</div>
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label className="form-label" htmlFor="soap-disposition" style={{ fontWeight: 600 }}>Disposition Status *</label>
              <select 
                id="soap-disposition"
                disabled={isSaving}
                className="form-select" 
                required
                style={{ maxWidth: 300 }}
                value={fields.disposition} 
                onChange={(e) => update('disposition', e.target.value)}
              >
                <option value="">Select disposition…</option>
                <option value="Returned to Class">Returned to Class</option>
                <option value="Sent Home">Sent Home</option>
                <option value="Resting in Clinic">Resting in Clinic</option>
                <option value="Referred to Hospital">Referred to Hospital</option>
                <option value="Other">Other</option>
              </select>
              <span id="soap-disposition-hint" className="form-hint">This note records disposition only. Clinic status changes through Check-Out or Observation.</span>
            </div>
          </div>

          <div className="soap-actions" style={{ marginTop: 16 }}>
            <button type="submit" className="btn btn-primary" disabled={isSaving}><Save size={15} /> {isSaving ? 'Saving…' : 'Save Note'}</button>
          </div>
        </form>
        {dispositionNeedsCheckout && (
          <div className="alert-bar alert-warning" role="status" style={{ marginTop: 16 }}>
            <AlertCircle size={16} />
            <span>The latest note says “{latestNote.disposition},” but the student is still {patient.status}. Complete Check-Out to update clinic status and run the configured contact workflow.</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onCompleteCheckout}>Complete Check-Out</button>
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h4 className="sec-title"><FileText size={15} /> Previous Notes</h4>
        {patient.soapNotes && patient.soapNotes.length > 0 ? (
          <div className="soap-history" style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 12 }}>
            {patient.soapNotes.map(n => (
              <div key={n.id} style={{ padding: 14, background: 'var(--gray-50)', borderRadius: 'var(--radius-md)', border: '1px solid var(--gray-200)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--gray-400)', marginBottom: 8 }}>
                  <span>Clinical SOAP Note • {n.author_name ? `${n.author_name} (${roleLabel(n.author_role || 'guest')})` : 'Author not recorded (legacy note)'}</span>
                  <span>{formatClinicDateTime(n.created_at)}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 'var(--text-sm)' }}>
                  {n.subjective && <div><strong>S (Subjective):</strong> {n.subjective}</div>}
                  {n.objective && <div><strong>O (Objective):</strong> {n.objective}</div>}
                  {n.assessment && <div><strong>A (Assessment):</strong> {n.assessment}</div>}
                  {n.plan && <div><strong>P (Plan):</strong> {n.plan}</div>}
                  {n.disposition && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                      <strong>Disposition:</strong>
                      <span className={`badge badge-${
                        n.disposition === 'Returned to Class' ? 'green' :
                        n.disposition === 'Sent Home' ? 'red' :
                        n.disposition === 'Resting in Clinic' ? 'amber' :
                        n.disposition === 'Referred to Hospital' ? 'red' : 'blue'
                      }`}>{n.disposition}</span>
                    </div>
                  )}
                </div>
              </div>

            ))}
          </div>
        ) : (
          <div className="empty-sm"><p className="text-muted">No previous clinical notes.</p></div>
        )}
      </div>
    </div>
  );
};

/* ===== CLINICAL DECISION SUPPORT HELPERS ===== */
const checkAllergy = (allergiesStr, orderedMed) => {
  if (!allergiesStr || !orderedMed) return null;
  
  const allergies = allergiesStr.toLowerCase().split(',').map(a => a.trim()).filter(a => a && !noKnownAllergyValues.has(a));
  const med = orderedMed.toLowerCase().trim();
  
  for (const allergy of allergies) {
    if (med.includes(allergy) || allergy.includes(med)) {
      return allergy;
    }
    // Penicillin / Amoxicillin cross-sensitivity check
    if (allergy === 'penicillin' && med.includes('amoxicillin')) {
      return 'Penicillin (cross-sensitivity with Amoxicillin)';
    }
    if (allergy === 'amoxicillin' && med.includes('penicillin')) {
      return 'Amoxicillin (cross-sensitivity with Penicillin)';
    }
  }
  return null;
};

const getPreviousAdministration = (orders, orderedMed) => {
  if (!orders || !orderedMed) return null;
  
  const med = orderedMed.toLowerCase().trim();
  const matchedOrders = orders
    .filter(o => o.medication?.toLowerCase().trim() === med)
    .map(o => ({ ...o, date: new Date(o.created_at) }))
    .filter(o => Number.isFinite(o.date.getTime()))
    .sort((a, b) => b.date - a.date);
  return matchedOrders[0] || null;
};

/* ===== ORDERS ===== */
const OrdersTab = ({ patient, user, onSaveOrder }) => {
  const [medication, setMedication] = useState('');
  const [customMedication, setCustomMedication] = useState('');
  const [strength, setStrength] = useState('');
  const [form, setForm] = useState('');
  const [customForm, setCustomForm] = useState('');
  const [doseAmount, setDoseAmount] = useState('');
  const [doseUnit, setDoseUnit] = useState('');
  const [route, setRoute] = useState('');
  const [consent, setConsent] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [allergyOverride, setAllergyOverride] = useState(false);

  const drugName = medication === 'other' ? customMedication : medication;
  const allergyStatus = clinicalEntryStatus(patient.allergies, noKnownAllergyValues);
  const allergyConflict = checkAllergy(patient.allergies, drugName);
  const previousAdministration = getPreviousAdministration(patient.orders, drugName);
  const administeringAccount = user?.email || user?.name || 'Current signed-in account';
  const canAdminister = ['Checked In', 'Under Observation'].includes(patient.status);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const finalMedication = medication === 'other' ? customMedication.trim() : medication;
    const finalForm = form === 'other' ? customForm.trim() : form;
    if (!canAdminister || !finalMedication || !strength.trim() || !finalForm || !doseAmount || !doseUnit || !route || !consent) return;
    if (allergyStatus === 'unknown' || (allergyConflict && !allergyOverride)) return;

    setSaveError('');
    setIsSaving(true);
    try {
      await onSaveOrder({
        medication: finalMedication,
        strength: strength.trim(),
        form: finalForm,
        dose_amount: Number(doseAmount),
        dose_unit: doseUnit,
        route,
        consent,
        allergy_override: allergyOverride
      });
      setMedication('');
      setCustomMedication('');
      setStrength('');
      setForm('');
      setCustomForm('');
      setDoseAmount('');
      setDoseUnit('');
      setRoute('');
      setConsent(false);
      setAllergyOverride(false);
    } catch (err) {
      setSaveError(err.message || 'The administration record could not be saved. Your entries are still here.');
    } finally {
      setIsSaving(false);
    }
  };

  const finalMedicationIsValid = medication === 'other' ? customMedication.trim() !== '' : medication !== '';
  const finalFormIsValid = form === 'other' ? customForm.trim() !== '' : form !== '';
  const isFormValid = canAdminister && consent && finalMedicationIsValid && strength.trim() !== '' && finalFormIsValid &&
    Number.isFinite(Number(doseAmount)) && Number(doseAmount) > 0 && doseUnit !== '' && route !== '' &&
    allergyStatus !== 'unknown' && (!allergyConflict || allergyOverride);

  return (
    <div className="orders-panel">
      <div className="card">
        <h4 className="sec-title"><Pill size={15} /> Record Medication Administration</h4>
        <p className="text-muted" style={{ marginTop: -6, marginBottom: 16, fontSize: 'var(--text-xs)' }}>
          Enter the amount actually given. The signed-in account is recorded as the administering clinician: <strong>{administeringAccount}</strong>.
        </p>
        <form onSubmit={handleSubmit} className="order-form">
          {saveError && <div className="alert-bar alert-danger" role="alert" style={{ marginBottom: 12 }}>{saveError}</div>}
          {!canAdminister && (
            <div className="alert-bar alert-warning" role="status" style={{ marginBottom: 12 }}>
              <AlertCircle size={16} />
              <span>Medication can only be recorded while the student is Checked In or Under Observation.</span>
            </div>
          )}
          <fieldset disabled={!canAdminister} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
                <label className="form-label" htmlFor="admin-medication">Medication *</label>
                <select id="admin-medication" className="form-select" required value={medication} onChange={(e) => { setMedication(e.target.value); setAllergyOverride(false); }}>
                  <option value="">Select medication…</option>
                  <option value="ibuprofen">Ibuprofen</option>
                  <option value="paracetamol">Paracetamol / Acetaminophen</option>
                  <option value="salbutamol">Salbutamol</option>
                  <option value="cetirizine">Cetirizine</option>
                  <option value="amoxicillin">Amoxicillin</option>
                  <option value="other">Other</option>
                </select>
              </div>
              {medication === 'other' && (
                <div className="form-group" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
                  <label className="form-label" htmlFor="admin-custom-medication">Medication Name *</label>
                  <input id="admin-custom-medication" type="text" className="form-input" placeholder="Enter medication name" required value={customMedication} onChange={(e) => { setCustomMedication(e.target.value); setAllergyOverride(false); }} />
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
                <label className="form-label" htmlFor="admin-strength">Product Strength / Concentration *</label>
                <input id="admin-strength" type="text" className="form-input" placeholder="e.g. 500 mg/tablet or 125 mg/5 mL" required value={strength} onChange={(e) => setStrength(e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: 1, minWidth: 150, marginBottom: 0 }}>
                <label className="form-label" htmlFor="admin-form">Form *</label>
                <select id="admin-form" className="form-select" required value={form} onChange={(e) => setForm(e.target.value)}>
                  <option value="">Select form…</option>
                  <option value="tablet">Tablet</option>
                  <option value="liquid">Liquid</option>
                  <option value="inhaler">Inhaler</option>
                  <option value="topical cream">Topical cream</option>
                  <option value="capsule">Capsule</option>
                  <option value="other">Other</option>
                </select>
              </div>
              {form === 'other' && (
                <div className="form-group" style={{ flex: 1, minWidth: 150, marginBottom: 0 }}>
                  <label className="form-label" htmlFor="admin-custom-form">Other Form *</label>
                  <input id="admin-custom-form" type="text" className="form-input" placeholder="Describe the form" required value={customForm} onChange={(e) => setCustomForm(e.target.value)} />
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: 1, minWidth: 150, marginBottom: 0 }}>
                <label className="form-label" htmlFor="admin-dose-amount">Amount Given *</label>
                <input id="admin-dose-amount" type="number" min="0.001" step="0.001" className="form-input" required value={doseAmount} onChange={(e) => setDoseAmount(e.target.value)} aria-describedby="admin-dose-hint" />
                <span id="admin-dose-hint" className="form-hint">Record the amount administered, not the product concentration.</span>
              </div>
              <div className="form-group" style={{ flex: 1, minWidth: 150, marginBottom: 0 }}>
                <label className="form-label" htmlFor="admin-dose-unit">Dose Unit *</label>
                <select id="admin-dose-unit" className="form-select" required value={doseUnit} onChange={(e) => setDoseUnit(e.target.value)}>
                  <option value="">Select unit…</option>
                  <option value="mg">mg</option>
                  <option value="g">g</option>
                  <option value="mcg">mcg</option>
                  <option value="mL">mL</option>
                  <option value="tablet">tablet(s)</option>
                  <option value="capsule">capsule(s)</option>
                  <option value="puff">puff(s)</option>
                  <option value="drop">drop(s)</option>
                  <option value="patch">patch(es)</option>
                  <option value="application">application(s)</option>
                </select>
              </div>
              <div className="form-group" style={{ flex: 1, minWidth: 150, marginBottom: 0 }}>
                <label className="form-label" htmlFor="admin-route">Route *</label>
                <select id="admin-route" className="form-select" required value={route} onChange={(e) => setRoute(e.target.value)}>
                  <option value="">Select route…</option>
                  <option value="oral">Oral</option>
                  <option value="inhaled">Inhaled</option>
                  <option value="topical">Topical</option>
                </select>
              </div>
            </div>
          </div>

          {drugName && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
              {allergyStatus === 'unknown' ? (
                <div className="alert-bar alert-warning" role="alert">
                  <AlertCircle size={16} />
                  <span>Allergy history is unknown or not reviewed. Update the allergy record before recording an administration.</span>
                </div>
              ) : allergyConflict ? (
                <>
                  <div className="alert-bar alert-danger" role="alert">
                    <AlertCircle size={16} />
                    <span>A possible name match was found for the recorded allergy <strong>{allergyConflict}</strong>. Review the full chart and clinical guidance before proceeding.</span>
                  </div>
                  <div className="override-panel danger">
                    <label className="override-label">
                      <input type="checkbox" checked={allergyOverride} onChange={(e) => setAllergyOverride(e.target.checked)} />
                      <span>I reviewed this possible match and confirmed the clinical decision to proceed.</span>
                    </label>
                  </div>
                </>
              ) : (
                <div className="alert-bar alert-info" role="status">
                  <AlertCircle size={16} />
                  <span>No direct allergy name match was found. This app does not evaluate interactions, dose appropriateness, or administration intervals.</span>
                </div>
              )}
              {previousAdministration && (
                <div className="alert-bar alert-warning" role="status">
                  <Clock size={16} />
                  <span>Previous chart administration: {displayAdministeredDose(previousAdministration)} on {formatClinicDateTime(previousAdministration.date)}. Review the full record and applicable medication schedule; the app does not apply an interval rule.</span>
                </div>
              )}
            </div>
          )}

          <div className="consent-bar" style={{ marginTop: 12 }}>
            <label className="consent-label">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>I confirm that guardian consent was verified before administration.</span>
            </label>
          </div>
          </fieldset>

          <button type="submit" className="btn btn-primary" style={{ marginTop: 12 }} disabled={!isFormValid || isSaving}>
            <CheckCircle size={15} /> {isSaving ? 'Saving…' : 'Record Administration'}
          </button>
        </form>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h4 className="sec-title"><Clock size={15} /> Administration History</h4>
        {patient.orders && patient.orders.length > 0 ? (
          <div className="orders-history" style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
            {patient.orders.map(o => (
              <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, padding: 12, background: 'var(--gray-50)', borderRadius: 'var(--radius-md)', border: '1px solid var(--gray-200)' }}>
                <div style={{ fontSize: 'var(--text-sm)' }}>
                  <strong>{o.medication.charAt(0).toUpperCase() + o.medication.slice(1)}</strong>
                  <div>Dose given: {displayAdministeredDose(o)} {o.route && `· ${o.route}`}</div>
                  {(o.strength || o.form) && <div className="text-muted">Product: {[o.strength, o.form].filter(Boolean).join(' · ')}</div>}
                  {o.administered_by && <div className="text-muted">Recorded by: {o.administered_by}</div>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, fontSize: 10, color: 'var(--gray-500)' }}>
                  <span style={{ color: o.consent ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>{o.consent ? 'Consent attested' : 'Consent not recorded (legacy)'}</span>
                  <span>{formatClinicDateTime(o.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-sm"><p className="text-muted">No medication administrations are recorded.</p></div>
        )}
      </div>
    </div>
  );
};

/* ===== HISTORY ===== */
const HistoryTab = ({ patient }) => (
  <div className="card">
    <h4 className="sec-title"><Clock size={15} style={{ color: 'var(--primary)' }} /> Visit Log</h4>
    {patient.logs && patient.logs.length > 0 ? (
      <div className="visit-logs" style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
        {patient.logs.map(l => (
          <div key={l.id} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--gray-100)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-400)', minWidth: 64 }}>
              {formatClinicDateTime(l.created_at, { timeStyle: 'short' })}
            </div>
            <div style={{ fontSize: 'var(--text-sm)', flex: 1 }}>
              <strong>{l.event_type}:</strong> {l.details}
            </div>
            <div style={{ fontSize: 10, color: 'var(--gray-400)' }}>
              {formatClinicDate(l.created_at)}
            </div>
          </div>
        ))}
      </div>
    ) : (
      <div className="empty-sm"><p className="text-muted">No visit history available.</p></div>
    )}
  </div>
);

/* ===== EXCUSE SLIPS TAB ===== */
const ExcuseSlipsTab = ({ patient, onCreateExcuseSlip, isRestrictedRole }) => {
  const [showModal, setShowModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [selectedSlip, setSelectedSlip] = useState(null);
  
  const [formData, setFormData] = useState({
    excuse_reason: '',
    start_date: clinicDateString(),
    end_date: clinicDateString(),
    teacher_notified: false
  });

  const handleOpenPrint = (slip) => {
    setSelectedSlip(slip);
    setShowPrintModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.excuse_reason.trim() || !formData.start_date || !formData.end_date) return;

    if (new Date(formData.start_date) > new Date(formData.end_date)) {
      alert("Excuse start date cannot be after the end date.");
      return;
    }

    await onCreateExcuseSlip({
      excuse_reason: formData.excuse_reason,
      start_date: formData.start_date,
      end_date: formData.end_date,
      teacher_notified: formData.teacher_notified ? 'Yes' : 'No'
    });
    setFormData({
      excuse_reason: '',
      start_date: clinicDateString(),
      end_date: clinicDateString(),
      teacher_notified: false
    });
    setShowModal(false);
  };

  const excuseSlips = patient.excuseSlips || [];

  return (
    <div className="excuse-slips-panel">
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h4 className="sec-title" style={{ margin: 0, borderBottom: 'none', paddingBottom: 0 }}>
            <FileText size={15} style={{ color: 'var(--primary)' }} /> Excuse Slips History
          </h4>
          {!isRestrictedRole && (
            <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>
              Generate Excuse Slip
            </button>
          )}
        </div>

        {excuseSlips.length > 0 ? (
          <div className="excuse-slips-list" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {excuseSlips.map(slip => (
              <div key={slip.id} className="excuse-slip-card" style={{ padding: 16, background: 'var(--gray-50)', border: '1.5px solid var(--gray-200)', borderRadius: 'var(--radius-lg)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--gray-800)' }}>
                    Reason: {slip.excuse_reason}
                  </span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--gray-500)' }}>
                    Duration: {formatClinicDate(slip.start_date)} to {formatClinicDate(slip.end_date)}
                  </span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--gray-500)' }}>
                    Teacher email: <strong>{slip.teacher_notified || 'Not requested'}</strong>
                  </span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--gray-500)' }}>
                    Departure approval: <strong style={{ color: slip.departure_approved ? 'var(--success)' : 'var(--warning)' }}>{slip.departure_approved ? 'Approved' : 'Pending'}</strong>
                  </span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--gray-400)' }}>
                    Issued by: {slip.created_by || 'Unknown'} on {formatClinicDate(slip.created_at)}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                  <div style={{ background: 'var(--primary-light)', padding: '4px 10px', borderRadius: 6, border: '1px solid var(--primary)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <span style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', color: 'var(--primary)', display: 'block' }}>VERIFICATION HASH</span>
                    <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace', color: 'var(--primary)' }}>{slip.verification_hash}</span>
                  </div>
                  <button className="btn btn-secondary btn-sm" onClick={() => handleOpenPrint(slip)}>
                    View / Print
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-sm">
            <p className="text-muted">No excuse slips generated for this student.</p>
          </div>
        )}
      </div>

      {/* Generate Excuse Slip Modal */}
      {showModal && createPortal(
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Generate Digital Excuse Slip</h3>
              <button className="btn-close" onClick={() => setShowModal(false)} type="button"><X size={18} style={{ color: 'var(--primary)' }} /></button>
            </div>
            <p className="form-hint">Your draft stays available when you switch chart tabs or navigate within this session. Save before refreshing or signing out.</p>
        <form onSubmit={handleSubmit}>
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label className="form-label">Excuse Reason *</label>
                <textarea
                  className="form-textarea"
                  rows={3}
                  required
                  placeholder="e.g. Student has acute gastroenteritis and needs rest."
                  value={formData.excuse_reason}
                  onChange={(e) => setFormData({ ...formData, excuse_reason: e.target.value })}
                />
              </div>
              <div className="form-row-2" style={{ marginBottom: 14 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Start Date *</label>
                  <input
                    type="date"
                    className="form-input"
                    required
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">End Date *</label>
                  <input
                    type="date"
                    className="form-input"
                    required
                    value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                  />
                </div>
              </div>
              <div className="consent-bar" style={{ marginBottom: 16 }}>
                <label className="consent-label" style={{ color: 'var(--gray-700)' }}>
                  <input
                    type="checkbox"
                    checked={formData.teacher_notified}
                    onChange={(e) => setFormData({ ...formData, teacher_notified: e.target.checked })}
                    style={{ accentColor: 'var(--primary)' }}
                  />
                  <span>Notify student's homeroom teacher automatically.</span>
                </label>
              </div>
              <div className="modal-actions" style={{ margin: 0, paddingTop: 14 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Generate Slip</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Print / View Certificate Modal */}
      {showPrintModal && selectedSlip && createPortal(
        <div className="modal-overlay print-modal-overlay" onClick={() => setShowPrintModal(false)}>
          <div className="modal-card print-modal-card" style={{ maxWidth: 580, padding: 32 }} onClick={(e) => e.stopPropagation()}>
            <div className="print-certificate-container" style={{ border: '2.5px solid var(--primary)', padding: 32, borderRadius: 'var(--radius-lg)', background: '#fff', position: 'relative', overflow: 'hidden', textAlign: 'center', fontFamily: 'var(--font)' }}>
              
              {/* Principal Approved Stamp Seal */}
              {selectedSlip.departure_approved && (
                <div style={{ 
                  position: 'absolute', 
                  top: '16px', 
                  right: '20px', 
                  border: '3px solid var(--success)', 
                  color: 'var(--success)', 
                  padding: '6px 12px', 
                  fontSize: '11px', 
                  fontWeight: '800', 
                  borderRadius: '4px', 
                  textTransform: 'uppercase', 
                  transform: 'rotate(-8deg)', 
                  zIndex: 10,
                  background: '#fff',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                  letterSpacing: '0.05em'
                }}>
                  ✓ Principal Approved
                </div>
              )}

              {/* Subtle watermark background seal */}
              <div style={{ position: 'absolute', top: '45%', left: '50%', transform: 'translate(-50%, -50%) rotate(-12deg)', width: '280px', height: '280px', border: '5px double var(--primary-light)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary-light)', fontSize: '24px', fontWeight: 800, letterSpacing: '0.15em', pointerEvents: 'none', select: 'none', opacity: 0.25, zIndex: 0 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span>OLPHA AEROHEALTH CLINIC</span>
                  <span style={{ fontSize: '12px', borderTop: '2.5px solid var(--primary-light)', marginTop: '8px', paddingTop: '4px' }}>OFFICIALLY VERIFIED</span>
                </div>
              </div>

              {/* Certificate content layer */}
              <div style={{ position: 'relative', zIndex: 1 }}>
                {/* Clinic Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid var(--primary)', paddingBottom: '16px', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', textAlign: 'left' }}>
                    <div style={{ background: 'var(--primary)', color: '#fff', padding: '8px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Activity size={24} style={{ color: '#fff' }} />
                    </div>
                    <div>
                      <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--primary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>OLPHA AeroHealth Academy</h2>
                      <span style={{ fontSize: '10px', color: 'var(--gray-500)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Clinic & Health Services</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '10px', color: 'var(--gray-500)', lineHeight: '1.4', fontWeight: 500 }}>
                    <div>123 Education Blvd, Campus Zone</div>
                    <div>Tel: (555) 0199-CLINIC</div>
                    <div>Email: clinic@aerohealth.edu</div>
                  </div>
                </div>

                {/* Certificate Title */}
                <h3 style={{ fontSize: '16px', color: 'var(--gray-900)', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '20px 0 6px 0', textAlign: 'center' }}>
                  Medical Excuse Certificate
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--gray-500)', margin: '0 0 20px 0' }}>
                  This official document certifies clinical evaluation at the OLPHA AeroHealth Academy Health Center.
                </p>

                {/* Student Details Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', margin: '20px 0', padding: '16px', background: 'var(--gray-50)', borderRadius: 'var(--radius-md)', border: '1px solid var(--gray-200)', textAlign: 'left', fontSize: '12px' }}>
                  <div>
                    <span style={{ color: 'var(--gray-400)', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: '2px', letterSpacing: '0.05em' }}>Student Name</span>
                    <strong style={{ color: 'var(--gray-800)', fontSize: '13px' }}>{patient.name}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--gray-400)', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: '2px', letterSpacing: '0.05em' }}>Grade & Section</span>
                    <strong style={{ color: 'var(--gray-800)', fontSize: '13px' }}>{patient.section || '—'}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--gray-400)', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: '2px', letterSpacing: '0.05em' }}>Evaluation Date</span>
                    <span style={{ color: 'var(--gray-700)', fontWeight: 600 }}>{formatClinicDate(selectedSlip.created_at, { dateStyle: 'long' })}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--gray-400)', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: '2px', letterSpacing: '0.05em' }}>Excuse Period</span>
                    <strong style={{ color: 'var(--primary)', fontWeight: 700 }}>
                      {formatClinicDate(selectedSlip.start_date)} to {formatClinicDate(selectedSlip.end_date)}
                    </strong>
                  </div>
                </div>

                {/* Medical Advisory Box */}
                <div style={{ textAlign: 'left', margin: '20px 0', fontSize: '12px', lineHeight: '1.5', color: 'var(--gray-700)' }}>
                  <span style={{ color: 'var(--gray-400)', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: '4px', letterSpacing: '0.05em' }}>Attending Recommendations</span>
                  <div style={{ margin: 0, padding: '12px 16px', borderLeft: '3.5px solid var(--primary)', background: '#f8fafc', borderRadius: '0 var(--radius-md) var(--radius-md) 0', fontStyle: 'italic', color: 'var(--gray-800)', borderTop: '1px solid var(--gray-100)', borderRight: '1px solid var(--gray-100)', borderBottom: '1px solid var(--gray-100)' }}>
                    "{selectedSlip.excuse_reason}"
                  </div>
                  <div style={{ marginTop: '10px', fontSize: '10.5px', color: 'var(--gray-500)' }}>
                    Based on this evaluation, the student is excused from classroom attendance and physical activities for the duration specified. Homeroom teacher notification: <strong>{selectedSlip.teacher_notified || 'No'}</strong>.
                    Departure approval: <strong>{selectedSlip.departure_approved ? `Approved (${formatClinicDate(selectedSlip.departure_approved_at)})` : 'Pending'}</strong>.
                  </div>
                </div>

                {/* Certificate Footer Signature Stamp & Barcode Grid */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '36px', paddingTop: '16px', borderTop: '1px dashed var(--gray-200)' }}>
                  
                  {/* Left Practitioner Signature */}
                  <div style={{ textAlign: 'left', minWidth: '180px' }}>
                    <div style={{ fontFamily: '"Playball", cursive', fontSize: '24px', color: 'var(--primary)', transform: 'rotate(-3deg) translateY(6px)', paddingLeft: '16px', height: '32px', opacity: 0.9 }}>
                      {selectedSlip.created_by ? `${selectedSlip.created_by.split('@')[0]}` : 'Dr. Test'}
                    </div>
                    <div style={{ borderBottom: '1px solid var(--gray-400)', width: '100%', marginBottom: '4px' }}></div>
                    <span style={{ fontSize: '9px', color: 'var(--gray-400)', display: 'block', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Attending Practitioner</span>
                    <span style={{ fontSize: '11px', color: 'var(--gray-600)', fontWeight: 600 }}>{selectedSlip.created_by || 'School Clinic Staff'}</span>
                  </div>

                  {/* Center Circular Stamp Seal */}
                  <div style={{ border: '2px dashed var(--primary)', borderRadius: '50%', width: '74px', height: '74px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.65, transform: 'rotate(12deg)', color: 'var(--primary)', fontSize: '8px', fontWeight: 800, margin: '0 8px', userSelect: 'none' }}>
                    <div style={{ fontSize: '7px' }}>OLPHA AEROHEALTH ACADEMY</div>
                    <div style={{ borderTop: '1px solid var(--primary)', borderBottom: '1px solid var(--primary)', padding: '1px 0', margin: '2px 0', fontSize: '6px', fontWeight: 700 }}>CLINIC STAMP</div>
                    <div style={{ fontSize: '7px', letterSpacing: '0.05em' }}>VERIFIED</div>
                  </div>

                  {/* Right Barcode & Hash Container */}
                  <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                    {/* Simulated Barcode */}
                    <div style={{ display: 'flex', height: '16px', width: '90px', background: '#fff', alignItems: 'stretch', gap: '1px', opacity: 0.8, marginBottom: '2px' }}>
                      <div style={{ width: '2px', background: '#000' }}></div>
                      <div style={{ width: '4px', background: '#000' }}></div>
                      <div style={{ width: '1px', background: '#000' }}></div>
                      <div style={{ width: '3px', background: '#000' }}></div>
                      <div style={{ width: '1px', background: '#000' }}></div>
                      <div style={{ width: '2px', background: '#000' }}></div>
                      <div style={{ width: '5px', background: '#000' }}></div>
                      <div style={{ width: '1px', background: '#000' }}></div>
                      <div style={{ width: '3px', background: '#000' }}></div>
                      <div style={{ width: '2px', background: '#000' }}></div>
                    </div>
                    <div style={{ background: 'var(--primary-light)', padding: '4px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--primary)', display: 'inline-block' }}>
                      <span style={{ fontSize: '7px', color: 'var(--primary)', display: 'block', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Verification Hash</span>
                      <span style={{ fontSize: '11px', fontWeight: 800, fontFamily: 'monospace', color: 'var(--primary)' }}>{selectedSlip.verification_hash}</span>
                    </div>
                  </div>
                </div>

              </div>

            </div>

            <div className="print-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowPrintModal(false)}>Close</button>
              <button type="button" className="btn btn-primary" onClick={() => window.print()}><FileText size={14} style={{ color: '#fff' }} /> Print Certificate</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default PatientChart;
