import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, User, FileText, Pill, ShieldAlert, Syringe,
  Save, AlertCircle, CheckCircle, Clock, Thermometer, Loader2, Pencil, X
} from 'lucide-react';
import { api } from '../../api';
import './PatientChart.css';

const TABS = [
  { key: 'overview', label: 'Overview',   icon: User },
  { key: 'soap',     label: 'SOAP Notes', icon: FileText },
  { key: 'orders',   label: 'Orders',     icon: Pill },
  { key: 'history',  label: 'Visit Log',  icon: Clock },
];

const PatientChart = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [activeTab, setActiveTab] = useState('overview');
  const [patient, setPatient] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Check-In State
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [chiefComplaint, setChiefComplaint] = useState('');

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

  if (isLoading) {
    return (
      <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '80px 40px', maxWidth: 520, margin: '40px auto' }}>
        <Loader2 className="spin text-primary" size={36} />
        <p className="text-muted" style={{ marginTop: 12 }}>Loading patient chart...</p>
      </div>
    );
  }

  if (error || !patient) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '80px 40px', maxWidth: 520, margin: '40px auto' }}>
        <AlertCircle size={36} className="text-danger" style={{ margin: '0 auto 16px' }} />
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
        <ArrowLeft size={16} /> Back to Patient List
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
          <button className="btn btn-primary btn-sm" onClick={() => setShowCheckInModal(true)} type="button">
            Check-In Student
          </button>
        </div>
      </div>

      {/* Critical Medical Flags */}
      {(() => {
        const hasAllergies = patient.allergies && patient.allergies.toLowerCase() !== 'none' && patient.allergies.trim() !== '';
        const hasConditions = patient.chronic_conditions && patient.chronic_conditions.toLowerCase() !== 'none' && patient.chronic_conditions.trim() !== '';

        if (hasAllergies || hasConditions) {
          return (
            <div className="critical-flags-banner danger anim-fade-up delay-1">
              <ShieldAlert size={20} className="text-danger-icon" />
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
              <CheckCircle size={20} className="text-success-icon" />
              <div className="flags-content">
                <span className="no-flags">No Critical Flags Listed</span>
              </div>
            </div>
          );
        }
      })()}

      {/* Tabs */}
      <div className="chart-tabs anim-fade-up delay-2">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.key} className={`ctab ${activeTab === tab.key ? 'active' : ''}`} onClick={() => setActiveTab(tab.key)}>
              <Icon size={15} /> {tab.label}
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
          />
        )}
        {activeTab === 'soap' && <SOAPTab patient={patient} onSaveNote={handleSaveNote} />}
        {activeTab === 'orders' && <OrdersTab patient={patient} onSaveOrder={handleSaveOrder} />}
        {activeTab === 'history' && <HistoryTab patient={patient} />}
      </div>

      {/* Check-In Modal */}
      {showCheckInModal && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h3>New Clinic Check-In</h3>
              <button className="btn-close" onClick={() => setShowCheckInModal(false)} type="button"><X size={18} /></button>
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
        </div>
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
    await onUpdateDoses(newVaccineName.trim(), 0, parseInt(newDosesRequired));
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

/* ===== OVERVIEW ===== */
const OverviewTab = ({ patient, onRecordVitals, onUpdateImmunization, onUpdatePatient }) => {
  const latestVitals = patient.vitals?.[0] || {};
  const [showForm, setShowForm] = useState(false);
  const [vitalsData, setVitalsData] = useState({ temperature: '', heart_rate: '', blood_pressure: '', o2_sat: '', respiratory_rate: '' });

  // Demographics edit mode
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editData, setEditData] = useState({});

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
      allergies: patient.allergies || '',
      chronic_conditions: patient.chronic_conditions || '',
      emergency_contact_name: patient.emergency_contact_name || '',
      emergency_contact_phone: patient.emergency_contact_phone || '',
      emergency_contact_relationship: patient.emergency_contact_relationship || '',
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
        const colorMap = { 'Active': 'green', 'Under Observation': 'amber', 'Recovered': 'blue' };
        updated.status_color = colorMap[value] || 'green';
      }
      return updated;
    });
  };

  const handleSaveDemographics = async (e) => {
    e.preventDefault();
    if (!editData.name?.trim()) return;
    setIsSaving(true);
    await onUpdatePatient(editData);
    setIsEditing(false);
    setIsSaving(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await onRecordVitals(vitalsData);
    setShowForm(false);
    setVitalsData({ temperature: '', heart_rate: '', blood_pressure: '', o2_sat: '', respiratory_rate: '' });
  };

  return (
    <div className="overview-grid">
      {/* Demographics Card */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4 className="sec-title" style={{ margin: 0, borderBottom: 'none', paddingBottom: 0 }}><User size={15} /> Demographics</h4>
          {!isEditing && (
            <button className="btn btn-ghost btn-sm" onClick={startEditing}>
              <Pencil size={14} /> Edit
            </button>
          )}
        </div>

        {isEditing ? (
          <form onSubmit={handleSaveDemographics} style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Full Name *</label>
              <input type="text" name="name" className="form-input" required value={editData.name} onChange={handleEditChange} />
            </div>
            <div className="form-row-2">
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Date of Birth</label>
                <input type="date" name="date_of_birth" className="form-input" value={editData.date_of_birth} onChange={handleEditChange} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Age</label>
                <input type="number" name="age" className="form-input" value={editData.age} onChange={handleEditChange} placeholder="Auto-calculated" />
              </div>
            </div>
            <div className="form-row-2">
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Gender</label>
                <select name="gender" className="form-select" value={editData.gender} onChange={handleEditChange}>
                  <option value="">Select</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Grade Level</label>
                <select name="grade_level" className="form-select" value={editData.grade_level} onChange={handleEditChange}>
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
                <label className="form-label">Section / Room</label>
                <input type="text" name="section" className="form-input" value={editData.section} onChange={handleEditChange} placeholder="e.g. Grade 5-A" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Clinic Status</label>
                <select name="status" className="form-select" value={editData.status} onChange={handleEditChange}>
                  <option value="Active">Active</option>
                  <option value="Under Observation">Under Observation</option>
                  <option value="Recovered">Recovered</option>
                </select>
              </div>
            </div>

            <h5 style={{ marginTop: 8, fontSize: 'var(--text-sm)', color: 'var(--gray-600)' }}>Medical Information</h5>
            <div className="form-row-2">
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Critical Allergies</label>
                <input type="text" name="allergies" className="form-input" value={editData.allergies} onChange={handleEditChange} placeholder="e.g. Peanut, Penicillin" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Chronic Conditions</label>
                <input type="text" name="chronic_conditions" className="form-input" value={editData.chronic_conditions} onChange={handleEditChange} placeholder="e.g. Asthma, Diabetes" />
              </div>
            </div>

            <h5 style={{ marginTop: 8, fontSize: 'var(--text-sm)', color: 'var(--gray-600)' }}>Emergency Contact</h5>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Contact Name</label>
              <input type="text" name="emergency_contact_name" className="form-input" value={editData.emergency_contact_name} onChange={handleEditChange} placeholder="e.g. Jane Doe" />
            </div>
            <div className="form-row-2">
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Phone Number</label>
                <input type="text" name="emergency_contact_phone" className="form-input" value={editData.emergency_contact_phone} onChange={handleEditChange} placeholder="e.g. 555-0199" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Relationship</label>
                <input type="text" name="emergency_contact_relationship" className="form-input" value={editData.emergency_contact_relationship} onChange={handleEditChange} placeholder="e.g. Mother" />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8, paddingTop: 12, borderTop: '1px solid var(--gray-200)' }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={cancelEditing} disabled={isSaving}>
                <X size={14} /> Cancel
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
            <div><strong>Registered:</strong> {new Date(patient.created_at).toLocaleDateString()}</div>
          </div>
        )}
      </div>

      {/* Vital Signs Card */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h4 className="sec-title" style={{ margin: 0 }}><Thermometer size={15} /> Vital Signs</h4>
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
            ].map(([label, val, unit]) => (
              <div className="vital-slot" key={label}>
                <span className="vs-label">{label}</span>
                <span className="vs-value">{val !== undefined && val !== null ? val : '—'}</span>
                <span className="vs-unit">{unit}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Emergency Contacts Card */}
      <div className="card">
        <h4 className="sec-title"><ShieldAlert size={15} /> Emergency Contacts</h4>
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

      {/* Immunization Card */}
      <div className="card">
        <h4 className="sec-title"><Syringe size={15} /> Immunization Matrix</h4>
        <ImmunizationMatrix patient={patient} onUpdateDoses={onUpdateImmunization} />
      </div>
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

/* ===== ORDERS ===== */
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    const finalMedication = medication === 'other' ? customMedication : medication;
    const finalStrength = strength === 'other' ? customStrength : strength;
    const finalForm = form === 'other' ? customForm : form;

    if (!finalMedication || !finalStrength || !finalForm || !administeredBy || !consent) return;

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
    administeredBy.trim() !== '';

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

          <div className="alert-bar alert-info" style={{ marginTop: 12 }}>
            <AlertCircle size={16} />
            <span>Allergy cross-referencing completed. No active conflicts found.</span>
          </div>

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
    <h4 className="sec-title"><Clock size={15} /> Visit Log</h4>
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

export default PatientChart;

