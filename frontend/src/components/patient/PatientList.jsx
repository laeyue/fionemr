import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search, Users, X, Loader2 } from 'lucide-react';
import { api } from '../../api';
import './PatientList.css';

const PatientList = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [patients, setPatients] = useState([]);
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [letterFilter, setLetterFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setSearch(searchParams.get('search') || '');
  }, [searchParams]);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    section: '',
    age: '',
    gender: 'Male',
    status: 'Active',
    date_of_birth: '',
    grade_level: '',
    allergies: '',
    chronic_conditions: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    emergency_contact_relationship: ''
  });

  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

  const fetchPatients = async () => {
    try {
      setIsLoading(true);
      const res = await api.getPatients({ search, letter: letterFilter });
      if (res && res.data) {
        setPatients(res.data);
      }
    } catch (err) {
      console.error("Error fetching patients:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPatients();
  }, [search, letterFilter]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const updated = { ...prev, [name]: value };
      if (name === 'date_of_birth' && value) {
        const birthDate = new Date(value);
        const today = new Date();
        let calculatedAge = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
          calculatedAge--;
        }
        updated.age = calculatedAge >= 0 ? calculatedAge.toString() : '';
      }
      return updated;
    });
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    try {
      const statusColorMap = {
        'Active': 'green',
        'Under Observation': 'amber',
        'Recovered': 'blue',
      };
      const patientPayload = {
        ...formData,
        status_color: statusColorMap[formData.status] || 'green'
      };
      const res = await api.registerPatient(patientPayload);
      if (res && res.data) {
        setShowModal(false);
        setFormData({
          name: '',
          section: '',
          age: '',
          gender: 'Male',
          status: 'Active',
          date_of_birth: '',
          grade_level: '',
          allergies: '',
          chronic_conditions: '',
          emergency_contact_name: '',
          emergency_contact_phone: '',
          emergency_contact_relationship: ''
        });
        navigate(`/dashboard/patients/${res.data.id}`);
      }
    } catch (err) {
      console.error("Error registering patient:", err);
    }
  };

  const filtered = patients; // The API does the filtering for us, but fallback on client just in case

  return (
    <div className="page-patients anim-fade-up">
      {/* Header */}
      <div className="page-top">
        <div>
          <h2>Patient Records</h2>
          <p className="text-muted">{patients.length} total records</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={16} /> Register Patient
        </button>
      </div>

      {/* Filters */}
      <div className="card filter-card anim-fade-up delay-1">
        <div className="filter-row">
          <div className="search-box">
            <Search size={16} className="text-muted" />
            <input
              type="text"
              className="search-inner"
              placeholder="Search by name or patient ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="alpha-strip">
          <button className={`alpha-btn ${letterFilter === '' ? 'active' : ''}`} onClick={() => setLetterFilter('')}>All</button>
          {alphabet.map(letter => (
            <button
              key={letter}
              className={`alpha-btn ${letterFilter === letter ? 'active' : ''}`}
              onClick={() => setLetterFilter(letterFilter === letter ? '' : letter)}
            >{letter}</button>
          ))}
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '80px 40px' }}>
          <Loader2 className="spin text-primary" size={36} />
          <p className="text-muted" style={{ marginTop: 12 }}>Loading patient list...</p>
        </div>
      ) : filtered.length > 0 ? (
        <div className="card table-card anim-fade-up delay-2" style={{ padding: 0 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Patient ID</th>
                <th>Full Name</th>
                <th>Section</th>
                <th>Age</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(patient => (
                <tr key={patient.id} onClick={() => navigate(`/dashboard/patients/${patient.id}`)}>
                  <td className="font-mono">{patient.id}</td>
                  <td>
                    <div className="name-cell">
                      <div className="avatar avatar-xs">{patient.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}</div>
                      {patient.name}
                    </div>
                  </td>
                  <td>{patient.section || '—'}</td>
                  <td>{patient.age || '—'}</td>
                  <td><span className={`badge badge-${patient.status_color || 'green'}`}>{patient.status}</span></td>
                  <td><button className="btn btn-ghost btn-sm">View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card empty-card anim-fade-up delay-2">
          <div className="empty-icon-wrap">
            <Users size={36} />
          </div>
          <h3>No patient records found</h3>
          <p className="text-muted">Patient records will appear here once registered. Click "Register Patient" to add the first record.</p>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setShowModal(true)}>
            <Plus size={16} /> Register Patient
          </button>
        </div>
      )}

      {/* Register Modal */}
      {showModal && createPortal(
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Register New Patient</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleRegister}>
              <div className="form-group">
                <label className="form-label">Full Name *</label>
                <input
                  type="text"
                  name="name"
                  className="form-input"
                  required
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="e.g. John Doe"
                />
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label className="form-label">Section / Classroom</label>
                  <input
                    type="text"
                    name="section"
                    className="form-input"
                    value={formData.section}
                    onChange={handleInputChange}
                    placeholder="e.g. Grade 5-A"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Date of Birth</label>
                  <input
                    type="date"
                    name="date_of_birth"
                    className="form-input"
                    value={formData.date_of_birth}
                    onChange={handleInputChange}
                  />
                </div>
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label className="form-label">Age</label>
                  <input
                    type="number"
                    name="age"
                    className="form-input"
                    value={formData.age}
                    onChange={handleInputChange}
                    placeholder="e.g. 10"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Grade Level</label>
                  <select
                    name="grade_level"
                    className="form-select"
                    value={formData.grade_level}
                    onChange={handleInputChange}
                  >
                    <option value="">Select Grade</option>
                    <option value="Kindergarten">Kindergarten</option>
                    <option value="Grade 1">Grade 1</option>
                    <option value="Grade 2">Grade 2</option>
                    <option value="Grade 3">Grade 3</option>
                    <option value="Grade 4">Grade 4</option>
                    <option value="Grade 5">Grade 5</option>
                    <option value="Grade 6">Grade 6</option>
                    <option value="Grade 7">Grade 7</option>
                    <option value="Grade 8">Grade 8</option>
                    <option value="Grade 9">Grade 9</option>
                    <option value="Grade 10">Grade 10</option>
                    <option value="Grade 11">Grade 11</option>
                    <option value="Grade 12">Grade 12</option>
                  </select>
                </div>
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label className="form-label">Gender</label>
                  <select
                    name="gender"
                    className="form-select"
                    value={formData.gender}
                    onChange={handleInputChange}
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Clinic Status</label>
                  <select
                    name="status"
                    className="form-select"
                    value={formData.status}
                    onChange={handleInputChange}
                  >
                    <option value="Active">Active</option>
                    <option value="Under Observation">Under Observation</option>
                    <option value="Recovered">Recovered</option>
                  </select>
                </div>
              </div>

              <h4 style={{ margin: '16px 0 12px', fontSize: 'var(--text-sm)' }}>Medical Information</h4>

              <div className="form-row-2">
                <div className="form-group">
                  <label className="form-label">Critical Allergies</label>
                  <input
                    type="text"
                    name="allergies"
                    className="form-input"
                    value={formData.allergies}
                    onChange={handleInputChange}
                    placeholder="e.g. Peanut, Penicillin (or 'None')"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Chronic Conditions</label>
                  <input
                    type="text"
                    name="chronic_conditions"
                    className="form-input"
                    value={formData.chronic_conditions}
                    onChange={handleInputChange}
                    placeholder="e.g. Asthma, Diabetes (or 'None')"
                  />
                </div>
              </div>

              <h4 style={{ margin: '16px 0 12px', fontSize: 'var(--text-sm)' }}>Emergency Contact</h4>

              <div className="form-group">
                <label className="form-label">Contact Name</label>
                <input
                  type="text"
                  name="emergency_contact_name"
                  className="form-input"
                  value={formData.emergency_contact_name}
                  onChange={handleInputChange}
                  placeholder="e.g. Jane Doe"
                />
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label className="form-label">Phone Number</label>
                  <input
                    type="text"
                    name="emergency_contact_phone"
                    className="form-input"
                    value={formData.emergency_contact_phone}
                    onChange={handleInputChange}
                    placeholder="e.g. 555-0199"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Relationship</label>
                  <input
                    type="text"
                    name="emergency_contact_relationship"
                    className="form-input"
                    value={formData.emergency_contact_relationship}
                    onChange={handleInputChange}
                    placeholder="e.g. Mother"
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Register & Check-in
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default PatientList;

