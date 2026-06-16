import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, User, FileText, Pill, ShieldAlert, Syringe,
  Save, AlertCircle, CheckCircle, Clock, Thermometer, Loader2, Pencil, X, ShieldCheck, Activity
} from 'lucide-react';
import { useAuth } from '../../App';
import { api } from '../../api';
import './PatientChart.css';

const PatientChart = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const role = (user?.role || 'guest').toLowerCase();
  const isRestrictedRole = role === 'teacher' || role === 'guidance_counselor' || role === 'guidance counselor';

  const availableTabs = [
    { key: 'overview', label: 'Overview',   icon: User },
    ...(!isRestrictedRole ? [
      { key: 'soap',     label: 'SOAP Notes', icon: FileText },
      { key: 'orders',   label: 'Orders',     icon: Pill },
      { key: 'history',  label: 'Visit Log',  icon: Clock },
    ] : []),
    { key: 'excuse-slips', label: 'Excuse Slips', icon: FileText }
  ];

  const [activeTab, setActiveTab] = useState('overview');
  const [patient, setPatient] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Check-In State
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [chiefComplaint, setChiefComplaint] = useState('');

  // Checkout & Excuse Slip State
  const [showCheckOutModal, setShowCheckOutModal] = useState(false);
  const [issueExcuseSlip, setIssueExcuseSlip] = useState(true);
  const [excuseReason, setExcuseReason] = useState('');
  const [excuseStartDate, setExcuseStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [excuseEndDate, setExcuseEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [notifyTeacher, setNotifyTeacher] = useState(true);

  useEffect(() => {
    if (showCheckOutModal && patient) {
      // Find latest check-in log
      const checkInLog = (patient.logs || []).find(l => l.event_type === 'Check-in');
      if (checkInLog) {
        setExcuseReason(`Checked in due to: ${checkInLog.details}`);
      } else {
        setExcuseReason('');
      }
      setExcuseStartDate(new Date().toISOString().split('T')[0]);
      setExcuseEndDate(new Date().toISOString().split('T')[0]);
      setIssueExcuseSlip(true);
      setNotifyTeacher(true);
    }
  }, [showCheckOutModal, patient]);

  useEffect(() => {
    if (!availableTabs.some(t => t.key === activeTab)) {
      setActiveTab('overview');
    }
  }, [isRestrictedRole]);

  const fetchPatient = async () => {
    try {
      setIsLoading(true);
      setError('');
      const res = await api.getPatientById(id);
      if (res && res.data) {
        setPatient(res.data);
      } else {
        setError('Patient not found');
      }
    } catch (err) {
      console.error("Error fetching patient chart:", err);
      setError('Failed to load patient chart data.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckIn = async (e) => {
    e.preventDefault();
    if (!chiefComplaint.trim()) return;
    try {
      await api.checkInPatient(id, chiefComplaint);
      setChiefComplaint('');
      setShowCheckInModal(false);
      fetchPatient();
    } catch (err) {
      console.error("Error checking in patient:", err);
    }
  };

  const handleCheckOut = () => {
    setShowCheckOutModal(true);
  };

  const handleCheckOutConfirm = async (e) => {
    e.preventDefault();
    try {
      setIsLoading(true);
      let payload = undefined;
      if (issueExcuseSlip && excuseReason.trim()) {
        if (new Date(excuseStartDate) > new Date(excuseEndDate)) {
          alert("Excuse start date cannot be after the end date.");
          setIsLoading(false);
          return;
        }
        payload = {
          excuse_reason: excuseReason.trim(),
          start_date: excuseStartDate,
          end_date: excuseEndDate,
          teacher_notified: notifyTeacher
        };
      }
      await api.checkOutPatient(id, payload);
      setShowCheckOutModal(false);
      await fetchPatient();
    } catch (err) {
      console.error("Error checking out patient:", err);
      alert("Failed to checkout student: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      fetchPatient();
    }
  }, [id]);

  const handleRecordVitals = async (vitalsData) => {
    try {
      await api.saveVitals(id, vitalsData);
      fetchPatient();
    } catch (err) {
      console.error("Error saving vitals:", err);
    }
  };

  const handleUpdateImmunization = async (vaccineName, dosesReceived, dosesRequired) => {
    try {
      await api.updateImmunization(id, {
        vaccine_name: vaccineName,
        doses_received: dosesReceived,
        doses_required: dosesRequired
      });
      fetchPatient();
    } catch (err) {
      console.error("Error updating immunization:", err);
    }
  };

  const handleSaveNote = async (noteData) => {
    try {
      await api.saveSoapNote(id, noteData);
      fetchPatient();
    } catch (err) {
      console.error("Error saving SOAP note:", err);
    }
  };

  const handleSaveOrder = async (orderData) => {
    try {
      await api.saveMedicationOrder(id, orderData);
      fetchPatient();
    } catch (err) {
      console.error("Error saving order:", err);
    }
  };

  const handleUpdatePatient = async (updatedData) => {
    try {
      await api.updatePatient(id, updatedData);
      fetchPatient();
    } catch (err) {
      console.error("Error updating patient:", err);
    }
  };

  const handleAddConsent = async (consentData) => {
    try {
      await api.createConsent(id, consentData);
      fetchPatient();
    } catch (err) {
      console.error("Error saving consent:", err);
    }
  };

  const handleCreateExcuseSlip = async (excuseData) => {
    try {
      await api.createExcuseSlip(id, excuseData);
      fetchPatient();
    } catch (err) {
      console.error("Error creating excuse slip:", err);
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
              Patient ID: <span className="font-mono">{patient.id}</span> &bull; {patient.age ? `${patient.age} yrs old` : ''} &bull; {patient.gender} &bull; {patient.grade_level ? `${patient.grade_level} — ` : ''}{patient.section || 'Unassigned'}
            </p>
          </div>
        </div>
        <div className="id-flags" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className={`badge badge-${patient.status_color || 'green'}`}>{patient.status}</span>
          {!isRestrictedRole && (
            patient.status === 'Checked In' ? (
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

        const hasAllergies = patient.allergies && patient.allergies.toLowerCase() !== 'none' && patient.allergies.trim() !== '';
        const hasConditions = patient.chronic_conditions && patient.chronic_conditions.toLowerCase() !== 'none' && patient.chronic_conditions.trim() !== '';

        if (hasAllergies || hasConditions) {
          return (
            <div className="critical-flags-banner danger anim-fade-up delay-1">
              <ShieldAlert size={20} style={{ color: 'var(--primary)' }} />
              <div className="flags-content">
                <strong>Critical Medical Flags:</strong>
                {hasAllergies && <span className="flag-item allergy-flag">Allergies: {patient.allergies}</span>}
                {hasConditions && <span className="flag-item condition-flag">Chronic Conditions: {patient.chronic_conditions}</span>}
              </div>
            </div>
          );
        } else {
          return (
            <div className="critical-flags-banner success anim-fade-up delay-1">
              <CheckCircle size={20} style={{ color: 'var(--primary)' }} />
              <div className="flags-content">
                <span className="no-flags">No Critical Flags Listed</span>
              </div>
            </div>
          );
        }
      })()}

      {/* Tabs */}
      <div className="chart-tabs anim-fade-up delay-2">
        {availableTabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.key} className={`ctab ${activeTab === tab.key ? 'active' : ''}`} onClick={() => setActiveTab(tab.key)}>
              <Icon size={15} style={{ color: activeTab === tab.key ? '#fff' : 'var(--primary)' }} /> {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="patient-chart-body anim-fade-up delay-3">
        {activeTab === 'overview' && (
          <OverviewTab 
            patient={patient} 
            onRecordVitals={handleRecordVitals} 
            onUpdateImmunization={handleUpdateImmunization}
            onUpdatePatient={handleUpdatePatient}
            onAddConsent={handleAddConsent}
            isRestrictedRole={isRestrictedRole}
          />
        )}
        {activeTab === 'soap' && <SOAPTab patient={patient} onSaveNote={handleSaveNote} />}
        {activeTab === 'orders' && <OrdersTab patient={patient} onSaveOrder={handleSaveOrder} />}
        {activeTab === 'history' && <HistoryTab patient={patient} />}
        {activeTab === 'excuse-slips' && (
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
              <button className="btn-close" onClick={() => setShowCheckInModal(false)} type="button" aria-label="Close modal"><X size={18} /></button>
            </div>
            <form onSubmit={handleCheckIn}>
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label className="form-label">Chief Complaint *</label>
                <textarea
                  className="form-textarea"
                  rows={4}
                  placeholder="Enter the reason for visiting the clinic today..."
                  required
                  value={chiefComplaint}
                  onChange={(e) => setChiefComplaint(e.target.value)}
                />
              </div>
              <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowCheckInModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Record Check-In</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Check-Out & Excuse Slip Modal */}
      {showCheckOutModal && createPortal(
        <div className="modal-overlay" onClick={() => setShowCheckOutModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Check-Out & Discharge Student</h3>
              <button className="btn-close" onClick={() => setShowCheckOutModal(false)} type="button" aria-label="Close modal"><X size={18} /></button>
            </div>
            <form onSubmit={handleCheckOutConfirm}>
              <p className="text-muted" style={{ fontSize: 'var(--text-xs)', marginBottom: 14, textAlign: 'left' }}>
                Clear the student's status in the clinic and notify parents, teachers, and security.
              </p>

              <div className="consent-bar" style={{ marginBottom: 14 }}>
                <label className="consent-label" style={{ color: 'var(--gray-700)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={issueExcuseSlip}
                    onChange={(e) => setIssueExcuseSlip(e.target.checked)}
                    style={{ accentColor: 'var(--primary)', marginTop: 0 }}
                  />
                  <span>Generate Medical Excuse Certificate (Recommended)</span>
                </label>
              </div>

              {issueExcuseSlip && (
                <>
                  <div className="form-group" style={{ marginBottom: 14 }}>
                    <label className="form-label">Excuse Reason / Clinical Advisory *</label>
                    <textarea
                      className="form-textarea"
                      rows={3}
                      required={issueExcuseSlip}
                      placeholder="e.g. Student has fever and needs home rest..."
                      value={excuseReason}
                      onChange={(e) => setExcuseReason(e.target.value)}
                    />
                  </div>
                  <div className="form-row-2" style={{ marginBottom: 14 }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Start Date *</label>
                      <input
                        type="date"
                        className="form-input"
                        required={issueExcuseSlip}
                        value={excuseStartDate}
                        onChange={(e) => setExcuseStartDate(e.target.value)}
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">End Date *</label>
                      <input
                        type="date"
                        className="form-input"
                        required={issueExcuseSlip}
                        value={excuseEndDate}
                        onChange={(e) => setExcuseEndDate(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="consent-bar" style={{ marginBottom: 16 }}>
                    <label className="consent-label" style={{ color: 'var(--gray-700)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={notifyTeacher}
                        onChange={(e) => setNotifyTeacher(e.target.checked)}
                        style={{ accentColor: 'var(--primary)', marginTop: 0 }}
                      />
                      <span>Notify homeroom teacher automatically</span>
                    </label>
                  </div>
                </>
              )}

              <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowCheckOutModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Complete Checkout</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

/* ===== IMMUNIZATION MATRIX ===== */
const ImmunizationMatrix = ({ patient, onUpdateDoses }) => {
  const immunizations = patient.immunizations || [];
  const [showAddForm, setShowAddForm] = useState(false);
  const [newVaccineName, setNewVaccineName] = useState('');
  const [newDosesRequired, setNewDosesRequired] = useState('2');

  const handleAddVaccine = async (e) => {
    e.preventDefault();
    if (!newVaccineName.trim()) return;
    const reqDoses = parseInt(newDosesRequired);
    if (isNaN(reqDoses) || reqDoses <= 0) {
      alert("Required doses must be a positive number.");
      return;
    }
    await onUpdateDoses(newVaccineName.trim(), 0, reqDoses);
    setNewVaccineName('');
    setNewDosesRequired('2');
    setShowAddForm(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
      {immunizations.length === 0 ? (
        <div className="empty-sm">
          <p className="text-muted">No immunization records available.</p>
        </div>
      ) : (
        <div className="immunization-list" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {immunizations.map(imm => {
            const isComplete = imm.doses_received >= imm.doses_required;
            return (
              <div key={imm.id} className={`immunization-row ${isComplete ? 'complete' : ''}`}>
                <div className="imm-info">
                  <span className="imm-name">{imm.vaccine_name}</span>
                  <span className="imm-status-text text-muted">
                    {imm.doses_received} of {imm.doses_required} doses received
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
                        onClick={() => {
                          const targetDoses = isSelected && imm.doses_received === doseNum ? doseNum - 1 : doseNum;
                          onUpdateDoses(imm.vaccine_name, targetDoses, imm.doses_required);
                        }}
                        title={`Mark dose ${doseNum}`}
                      >
                        {doseNum}
                      </button>
                    );
                  })}
                </div>

                <div className="imm-status-badge">
                  {isComplete ? (
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
            <span className="form-label" style={{ fontSize: 11, fontWeight: 600 }}>Vaccine Name</span>
            <input 
              type="text" 
              className="form-input" 
              placeholder="e.g. COVID-19, Flu Shot, HPV" 
              required 
              value={newVaccineName} 
              onChange={(e) => setNewVaccineName(e.target.value)} 
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <span className="form-label" style={{ fontSize: 11, fontWeight: 600 }}>Doses Required</span>
            <select 
              className="form-select" 
              value={newDosesRequired} 
              onChange={(e) => setNewDosesRequired(e.target.value)}
            >
              <option value="1">1 Dose</option>
              <option value="2">2 Doses</option>
              <option value="3">3 Doses</option>
              <option value="4">4 Doses</option>
            </select>
          </div>
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
  const latestVitals = patient.vitals?.[0] || {};
  const [showForm, setShowForm] = useState(false);
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
    date_granted: new Date().toISOString().split('T')[0],
    notes: ''
  });

  const startEditing = () => {
    setEditData({
      name: patient.name || '',
      date_of_birth: patient.date_of_birth || '',
      age: patient.age?.toString() || '',
      gender: patient.gender || '',
      grade_level: patient.grade_level || '',
      section: patient.section || '',
      status: patient.status || 'Active',
      status_color: patient.status_color || 'green',
      graduation_year: patient.graduation_year?.toString() || '',
      allergies: patient.allergies || '',
      chronic_conditions: patient.chronic_conditions || '',
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
        const birthDate = new Date(value);
        const today = new Date();
        let calculatedAge = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) calculatedAge--;
        updated.age = calculatedAge >= 0 ? calculatedAge.toString() : '';
      }
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

    if (editData.date_of_birth) {
      const birthDate = new Date(editData.date_of_birth);
      const today = new Date();
      if (birthDate > today) {
        alert("Date of birth cannot be in the future.");
        return;
      }
    }

    if (editData.graduation_year) {
      const gradYear = parseInt(editData.graduation_year);
      if (isNaN(gradYear) || gradYear <= 0) {
        alert("Graduation year must be a valid positive integer.");
        return;
      }
    }

    setIsSaving(true);
    await onUpdatePatient(editData);
    setIsEditing(false);
    setIsSaving(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

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

    await onRecordVitals(vitalsData);
    setShowForm(false);
    setVitalsData({ temperature: '', heart_rate: '', blood_pressure: '', o2_sat: '', respiratory_rate: '' });
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

    await onAddConsent(consentFormData);
    setConsentFormData({
      consent_type: 'Medication',
      parent_name: patient.emergency_contact_name || '',
      document_name: '',
      date_granted: new Date().toISOString().split('T')[0],
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
                <input id="edit-dob" type="date" name="date_of_birth" className="form-input" max={new Date().toISOString().split('T')[0]} value={editData.date_of_birth} onChange={handleEditChange} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" htmlFor="edit-age">Age</label>
                <input id="edit-age" type="number" name="age" className="form-input" value={editData.age} onChange={handleEditChange} placeholder="Auto-calculated" />
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
                <input id="edit-allergies" type="text" name="allergies" className="form-input" value={editData.allergies} onChange={handleEditChange} placeholder="e.g. Peanut, Penicillin" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" htmlFor="edit-conditions">Chronic Conditions</label>
                <input id="edit-conditions" type="text" name="chronic_conditions" className="form-input" value={editData.chronic_conditions} onChange={handleEditChange} placeholder="e.g. Asthma, Diabetes" />
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
            <div><strong>Date of Birth:</strong> {patient.date_of_birth ? new Date(patient.date_of_birth).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}</div>
            <div><strong>Age:</strong> {patient.age ? `${patient.age} years old` : '—'}</div>
            <div><strong>Gender:</strong> {patient.gender || '—'}</div>
            <div><strong>Grade Level:</strong> {patient.grade_level || '—'}</div>
            <div><strong>Section / Room:</strong> {patient.section || '—'}</div>
            <div><strong>Graduation Year:</strong> {patient.graduation_year || '—'}</div>
            <div><strong>Parent Email:</strong> {patient.parent_email || '—'}</div>
            <div><strong>Homeroom Adviser:</strong> {patient.adviser_name || '—'} {patient.adviser_email ? `(${patient.adviser_email})` : ''}</div>
            <div><strong>Registered:</strong> {new Date(patient.created_at).toLocaleDateString()}</div>
          </div>
        )}
      </div>

      {/* Emergency Contacts Card */}
      <div className="card">
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

      {/* Parental Consents Card */}
      <div className="card">
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
            <strong>Consent Verified</strong>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#fef2f2', borderRadius: 'var(--radius-md)', border: '1px solid #fee2e2', color: '#991b1b', marginBottom: 12, fontSize: 'var(--text-sm)' }}>
            <ShieldAlert size={16} style={{ color: 'var(--primary)' }} />
            <strong>Consent Missing</strong>
          </div>
        )}

        <div className="consent-list" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {patient.consents && patient.consents.length > 0 ? (
            patient.consents.map(c => (
              <div key={c.id} style={{ padding: 10, background: 'var(--gray-50)', borderRadius: 'var(--radius-md)', border: '1px solid var(--gray-200)', fontSize: 'var(--text-xs)' }}>
                <div><strong>Type:</strong> {c.consent_type}</div>
                <div><strong>Parent:</strong> {c.parent_name}</div>
                <div><strong>File:</strong> <span className="text-primary" style={{ fontWeight: 600 }}>{c.document_name}</span></div>
                <div><strong>Granted:</strong> {new Date(c.date_granted).toLocaleDateString()}</div>
                {c.notes && <div style={{ marginTop: 4 }}><strong>Notes:</strong> {c.notes}</div>}
              </div>
            ))
          ) : (
            <p className="text-muted" style={{ fontSize: 'var(--text-xs)', textAlign: 'center', margin: '10px 0' }}>No consent documents logged.</p>
          )}
        </div>
      </div>

      {/* Vital Signs Card (clinical only) */}
      {!isRestrictedRole && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h4 className="sec-title" style={{ margin: 0 }}><Thermometer size={15} style={{ color: 'var(--primary)' }} /> Vital Signs</h4>
            <button className={`btn ${showForm ? 'btn-ghost' : 'btn-primary'} btn-sm`} onClick={() => setShowForm(!showForm)}>
              {showForm ? 'Cancel' : 'Record Vitals'}
            </button>
          </div>
          
          {showForm ? (
            <form onSubmit={handleSubmit} style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="form-row-2">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: 11 }}>Temp (°C)</label>
                  <input type="number" step="0.1" name="temperature" className="form-input" required value={vitalsData.temperature} onChange={(e) => setVitalsData({...vitalsData, temperature: e.target.value})} placeholder="e.g. 36.8" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: 11 }}>Heart Rate (bpm)</label>
                  <input type="number" name="heart_rate" className="form-input" required value={vitalsData.heart_rate} onChange={(e) => setVitalsData({...vitalsData, heart_rate: e.target.value})} placeholder="e.g. 72" />
                </div>
              </div>
              <div className="form-row-2">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: 11 }}>Blood Pressure</label>
                  <input type="text" name="blood_pressure" className="form-input" required value={vitalsData.blood_pressure} onChange={(e) => setVitalsData({...vitalsData, blood_pressure: e.target.value})} placeholder="e.g. 120/80" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: 11 }}>O₂ Sat (%)</label>
                  <input type="number" name="o2_sat" className="form-input" required value={vitalsData.o2_sat} onChange={(e) => setVitalsData({...vitalsData, o2_sat: e.target.value})} placeholder="e.g. 98" />
                </div>
              </div>
              <div className="form-row-2">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: 11 }}>Respiratory Rate (breaths/min)</label>
                  <input type="number" name="respiratory_rate" className="form-input" required value={vitalsData.respiratory_rate} onChange={(e) => setVitalsData({...vitalsData, respiratory_rate: e.target.value})} placeholder="e.g. 18" />
                </div>
                <div className="form-group" style={{ marginBottom: 0, visibility: 'hidden' }}></div>
              </div>
              <button type="submit" className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-end', marginTop: 4 }}>Save Vitals</button>
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
                  max={new Date().toISOString().split('T')[0]}
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
const SOAPTab = ({ patient, onSaveNote }) => {
  const [fields, setFields] = useState({ s: '', o: '', a: '', p: '', disposition: 'Returned to Class' });
  const update = (key, val) => setFields(prev => ({ ...prev, [key]: val }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!fields.s.trim() && !fields.o.trim() && !fields.a.trim() && !fields.p.trim()) return;
    await onSaveNote({
      subjective: fields.s,
      objective: fields.o,
      assessment: fields.a,
      plan: fields.p,
      disposition: fields.disposition
    });
    setFields({ s: '', o: '', a: '', p: '', disposition: 'Returned to Class' });
  };

  return (
    <div className="soap-panel">
      <div className="card">
        <div className="soap-top">
          <h4>New Clinical Note</h4>
          <span className="badge badge-blue">SOAP</span>
        </div>
        <form onSubmit={handleSubmit} className="soap-form">
          {[
            { key: 's', color: 'blue',   full: 'Subjective', hint: 'Patient-reported symptoms and complaints' },
            { key: 'o', color: 'purple', full: 'Objective',  hint: 'Clinician observations, vitals, measurements' },
            { key: 'a', color: 'amber',  full: 'Assessment', hint: 'Clinical impression and diagnosis' },
            { key: 'p', color: 'green',  full: 'Plan',       hint: 'Treatment plan, medications, follow-up' },
          ].map(s => (
            <div className="soap-row" key={s.key}>
              <div className={`soap-letter sl-${s.color}`}>{s.key.toUpperCase()}</div>
              <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                <span className="form-label">{s.full}</span>
                <textarea className="form-textarea" rows={s.key === 's' || s.key === 'o' ? 3 : 2} value={fields[s.key]} onChange={(e) => update(s.key, e.target.value)} />
                <span className="form-hint">{s.hint}</span>
              </div>
            </div>
          ))}
          <div className="soap-row" style={{ marginTop: 12, borderTop: '1px solid var(--gray-200)', paddingTop: 16 }}>
            <div className="soap-letter sl-gray" style={{ visibility: 'hidden' }}>D</div>
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <span className="form-label" style={{ fontWeight: 600 }}>Disposition Status *</span>
              <select 
                className="form-select" 
                style={{ maxWidth: 300 }}
                value={fields.disposition} 
                onChange={(e) => update('disposition', e.target.value)}
              >
                <option value="Returned to Class">Returned to Class</option>
                <option value="Sent Home">Sent Home</option>
                <option value="Resting in Clinic">Resting in Clinic</option>
                <option value="Referred to Hospital">Referred to Hospital</option>
                <option value="Other">Other</option>
              </select>
              <span className="form-hint">Specify where the student was sent after the encounter</span>
            </div>
          </div>

          <div className="soap-actions" style={{ marginTop: 16 }}>
            <button type="submit" className="btn btn-primary"><Save size={15} /> Save Note</button>
          </div>
        </form>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h4 className="sec-title"><FileText size={15} /> Previous Notes</h4>
        {patient.soapNotes && patient.soapNotes.length > 0 ? (
          <div className="soap-history" style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 12 }}>
            {patient.soapNotes.map(n => (
              <div key={n.id} style={{ padding: 14, background: 'var(--gray-50)', borderRadius: 'var(--radius-md)', border: '1px solid var(--gray-200)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--gray-400)', marginBottom: 8 }}>
                  <span>Clinical SOAP Note</span>
                  <span>{new Date(n.created_at).toLocaleString()}</span>
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
  if (!allergiesStr || allergiesStr.toLowerCase() === 'none' || !orderedMed) return null;
  
  const allergies = allergiesStr.toLowerCase().split(',').map(a => a.trim()).filter(Boolean);
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

const checkFrequency = (orders, orderedMed) => {
  if (!orders || !orderedMed) return null;
  
  const med = orderedMed.toLowerCase().trim();
  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
  
  // Find orders within the last 4 hours
  const matchedOrders = orders
    .filter(o => o.medication.toLowerCase().trim() === med)
    .map(o => ({ ...o, date: new Date(o.created_at) }))
    .filter(o => o.date >= fourHoursAgo)
    .sort((a, b) => b.date - a.date);
    
  if (matchedOrders.length > 0) {
    const lastOrder = matchedOrders[0];
    const minsAgo = Math.round((Date.now() - lastOrder.date.getTime()) / (60 * 1000));
    return {
      minsAgo,
      lastOrder
    };
  }
  return null;
};

/* ===== ORDERS ===== */
const OrdersTab = ({ patient, onSaveOrder }) => {
  const [medication, setMedication] = useState('');
  const [customMedication, setCustomMedication] = useState('');
  const [strength, setStrength] = useState('');
  const [customStrength, setCustomStrength] = useState('');
  const [form, setForm] = useState('');
  const [customForm, setCustomForm] = useState('');
  const [route, setRoute] = useState('oral');
  const [administeredBy, setAdministeredBy] = useState('');
  const [consent, setConsent] = useState(false);

  // Safety Overrides State
  const [allergyOverride, setAllergyOverride] = useState(false);
  const [frequencyOverride, setFrequencyOverride] = useState(false);

  const drugName = medication === 'other' ? customMedication : medication;
  const allergyConflict = checkAllergy(patient.allergies, drugName);
  const frequencyConflict = checkFrequency(patient.orders, drugName);

  // Reset override confirmation if drug changes
  useEffect(() => {
    setAllergyOverride(false);
    setFrequencyOverride(false);
  }, [medication, customMedication]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const finalMedication = medication === 'other' ? customMedication : medication;
    const finalStrength = strength === 'other' ? customStrength : strength;
    const finalForm = form === 'other' ? customForm : form;

    if (!finalMedication || !finalStrength || !finalForm || !administeredBy || !consent) return;
    if (allergyConflict && !allergyOverride) return;
    if (frequencyConflict && !frequencyOverride) return;

    await onSaveOrder({
      medication: finalMedication,
      strength: finalStrength,
      form: finalForm,
      route,
      administered_by: administeredBy,
      consent
    });

    setMedication('');
    setCustomMedication('');
    setStrength('');
    setCustomStrength('');
    setForm('');
    setCustomForm('');
    setRoute('oral');
    setAdministeredBy('');
    setConsent(false);
  };

  const isFormValid = consent && 
    (medication === 'other' ? customMedication.trim() !== '' : medication !== '') &&
    (strength === 'other' ? customStrength.trim() !== '' : strength !== '') &&
    (form === 'other' ? customForm.trim() !== '' : form !== '') &&
    administeredBy.trim() !== '' &&
    (!allergyConflict || allergyOverride) &&
    (!frequencyConflict || frequencyOverride);

  return (
    <div className="orders-panel">
      <div className="card">
        <h4 className="sec-title"><Pill size={15} /> New Medication Order</h4>
        <form onSubmit={handleSubmit} className="order-form">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Row 1: Medication */}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
                <label className="form-label">Medication *</label>
                <select className="form-select" value={medication} onChange={(e) => setMedication(e.target.value)}>
                  <option value="">Select medication...</option>
                  <option value="ibuprofen">Ibuprofen</option>
                  <option value="paracetamol">Paracetamol / Acetaminophen</option>
                  <option value="salbutamol">Salbutamol Inhaler</option>
                  <option value="cetirizine">Cetirizine</option>
                  <option value="amoxicillin">Amoxicillin</option>
                  <option value="other">Other (Add Custom...)</option>
                </select>
              </div>
              {medication === 'other' && (
                <div className="form-group" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
                  <label className="form-label">Custom Medication Name *</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="Enter drug name" 
                    required 
                    value={customMedication} 
                    onChange={(e) => setCustomMedication(e.target.value)} 
                  />
                </div>
              )}
            </div>

            {/* Row 2: Strength & Form */}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: 1, minWidth: 150, marginBottom: 0 }}>
                <label className="form-label">Strength *</label>
                <select className="form-select" value={strength} onChange={(e) => setStrength(e.target.value)}>
                  <option value="">Select strength...</option>
                  <option value="500mg">500mg</option>
                  <option value="250mg">250mg</option>
                  <option value="125mg">125mg</option>
                  <option value="10mg">10mg</option>
                  <option value="5ml">5ml</option>
                  <option value="1 puff">1 puff</option>
                  <option value="2 puffs">2 puffs</option>
                  <option value="other">Other (Custom Strength...)</option>
                </select>
              </div>
              {strength === 'other' && (
                <div className="form-group" style={{ flex: 1, minWidth: 150, marginBottom: 0 }}>
                  <label className="form-label">Custom Strength *</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="e.g. 50mg, 10ml" 
                    required 
                    value={customStrength} 
                    onChange={(e) => setCustomStrength(e.target.value)} 
                  />
                </div>
              )}

              <div className="form-group" style={{ flex: 1, minWidth: 150, marginBottom: 0 }}>
                <label className="form-label">Form *</label>
                <select className="form-select" value={form} onChange={(e) => setForm(e.target.value)}>
                  <option value="">Select form...</option>
                  <option value="tablet">Tablet</option>
                  <option value="liquid">Liquid</option>
                  <option value="inhaler">Inhaler</option>
                  <option value="topical cream">Topical Cream</option>
                  <option value="other">Other (Custom Form...)</option>
                </select>
              </div>
              {form === 'other' && (
                <div className="form-group" style={{ flex: 1, minWidth: 150, marginBottom: 0 }}>
                  <label className="form-label">Custom Form *</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="e.g. drops, capsule" 
                    required 
                    value={customForm} 
                    onChange={(e) => setCustomForm(e.target.value)} 
                  />
                </div>
              )}
            </div>

            {/* Row 3: Route & Staff Initials */}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: 1, minWidth: 150, marginBottom: 0 }}>
                <label className="form-label">Route *</label>
                <select className="form-select" value={route} onChange={(e) => setRoute(e.target.value)}>
                  <option value="oral">Oral</option>
                  <option value="inhaled">Inhaled</option>
                  <option value="topical">Topical</option>
                </select>
              </div>
              <div className="form-group" style={{ flex: 1, minWidth: 150, marginBottom: 0 }}>
                <label className="form-label">Administration Staff Initials *</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. KT" 
                  required 
                  maxLength={5}
                  value={administeredBy} 
                  onChange={(e) => setAdministeredBy(e.target.value)} 
                />
              </div>
            </div>
          </div>

          {/* Dynamic Safety Decision Alerts */}
          {(() => {
            if (allergyConflict || frequencyConflict) {
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                  {allergyConflict && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div className="alert-bar alert-danger">
                        <AlertCircle size={16} />
                        <span>
                          <strong>⚠️ Allergy Warning:</strong> Patient has a documented allergy to <strong>{allergyConflict}</strong>. Ordering <strong>{drugName}</strong> is contraindicated.
                        </span>
                      </div>
                      <div className="override-panel danger">
                        <label className="override-label">
                          <input 
                            type="checkbox" 
                            checked={allergyOverride} 
                            onChange={(e) => setAllergyOverride(e.target.checked)} 
                          />
                          <span>I have clinically verified safety and wish to override this allergy warning.</span>
                        </label>
                      </div>
                    </div>
                  )}

                  {frequencyConflict && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div className="alert-bar alert-warning">
                        <AlertCircle size={16} />
                        <span>
                          <strong>⚠️ Frequency Warning:</strong> <strong>{drugName}</strong> was already administered <strong>{frequencyConflict.minsAgo} minutes ago</strong> (Dose interval: 4 hours).
                        </span>
                      </div>
                      <div className="override-panel warning">
                        <label className="override-label">
                          <input 
                            type="checkbox" 
                            checked={frequencyOverride} 
                            onChange={(e) => setFrequencyOverride(e.target.checked)} 
                          />
                          <span>I have clinically verified the dose interval and wish to override this frequency limit.</span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              );
            }

            if (drugName) {
              return (
                <div className="alert-bar alert-success" style={{ marginTop: 12 }}>
                  <CheckCircle size={16} />
                  <span>Allergy & frequency checks completed. No active conflicts found.</span>
                </div>
              );
            }

            return (
              <div className="alert-bar alert-info" style={{ marginTop: 12 }}>
                <AlertCircle size={16} />
                <span>Select a medication to complete clinical decision checks.</span>
              </div>
            );
          })()}

          <div className="consent-bar" style={{ marginTop: 12 }}>
            <label className="consent-label">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>I confirm that parental/guardian consent has been verified prior to administration.</span>
            </label>
          </div>

          <button type="submit" className="btn btn-primary" style={{ marginTop: 12 }} disabled={!isFormValid}>
            <CheckCircle size={15} /> Execute Order
          </button>
        </form>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h4 className="sec-title"><Clock size={15} /> Administration Log</h4>
        {patient.orders && patient.orders.length > 0 ? (
          <div className="orders-history" style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
            {patient.orders.map(o => (
              <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, background: 'var(--gray-50)', borderRadius: 'var(--radius-md)', border: '1px solid var(--gray-200)' }}>
                <div style={{ fontSize: 'var(--text-sm)' }}>
                  <strong>{o.medication.charAt(0).toUpperCase() + o.medication.slice(1)}</strong> — {o.dosage} ({o.route})
                  {o.administered_by && (
                    <div style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 4 }}>
                      Administered by: <strong>{o.administered_by}</strong>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', fontSize: 10, color: 'var(--gray-400)' }}>
                  <span style={{ color: 'var(--success)', fontWeight: 600 }}>Consent Verified</span>
                  <span>{new Date(o.created_at).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-sm"><p className="text-muted">No medications administered.</p></div>
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
              {new Date(l.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
            <div style={{ fontSize: 'var(--text-sm)', flex: 1 }}>
              <strong>{l.event_type}:</strong> {l.details}
            </div>
            <div style={{ fontSize: 10, color: 'var(--gray-400)' }}>
              {new Date(l.created_at).toLocaleDateString()}
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
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0],
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
      start_date: new Date().toISOString().split('T')[0],
      end_date: new Date().toISOString().split('T')[0],
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
                    Duration: {new Date(slip.start_date).toLocaleDateString()} to {new Date(slip.end_date).toLocaleDateString()}
                  </span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--gray-500)' }}>
                    Teacher Notified: <strong>{slip.teacher_notified || 'No'}</strong>
                  </span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--gray-500)' }}>
                    Principal Acknowledged: <strong style={{ color: slip.principal_acknowledged ? 'var(--success)' : 'var(--warning)' }}>{slip.principal_acknowledged ? 'Yes' : 'No'}</strong>
                  </span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--gray-400)' }}>
                    Issued by: {slip.created_by || 'Unknown'} on {new Date(slip.created_at).toLocaleDateString()}
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
              {selectedSlip.principal_acknowledged && (
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
                    <span style={{ color: 'var(--gray-700)', fontWeight: 600 }}>{new Date(selectedSlip.created_at).toLocaleDateString(undefined, { dateStyle: 'long' })}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--gray-400)', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: '2px', letterSpacing: '0.05em' }}>Excuse Period</span>
                    <strong style={{ color: 'var(--primary)', fontWeight: 700 }}>
                      {new Date(selectedSlip.start_date).toLocaleDateString(undefined, { dateStyle: 'medium' })} to {new Date(selectedSlip.end_date).toLocaleDateString(undefined, { dateStyle: 'medium' })}
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
                    Principal Acknowledged: <strong>{selectedSlip.principal_acknowledged ? `Yes (${new Date(selectedSlip.principal_acknowledged_at).toLocaleDateString()})` : 'No'}</strong>.
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

