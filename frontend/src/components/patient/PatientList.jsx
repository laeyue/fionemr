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
  
  // Section-First Navigation State
  const [sectionQuery, setSectionQuery] = useState('');
  const [selectedSection, setSelectedSection] = useState('');
  const [nameLetterFilter, setNameLetterFilter] = useState('');
  
  const [isLoading, setIsLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState('active-patients');

  // Registration Modal State
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    section: '',
    age: '',
    gender: 'Male',
    status: 'Checked Out',
    date_of_birth: '',
    grade_level: '',
    graduation_year: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    emergency_contact_relationship: '',
    parent_email: '',
    adviser_name: '',
    adviser_email: ''
  });

  // Check-In Modal State
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [checkInComplaint, setCheckInComplaint] = useState('');

  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

  const fetchPatients = async () => {
    try {
      setIsLoading(true);
      const res = await api.getPatients();
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
  }, []);

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

    if (formData.date_of_birth) {
      const birthDate = new Date(formData.date_of_birth);
      const today = new Date();
      if (birthDate > today) {
        alert("Date of birth cannot be in the future.");
        return;
      }
    }

    if (formData.graduation_year) {
      const gradYear = parseInt(formData.graduation_year);
      if (isNaN(gradYear) || gradYear <= 0) {
        alert("Graduation year must be a valid positive integer.");
        return;
      }
    }

    try {
      const studentPayload = {
        ...formData,
        status: 'Checked Out',
        status_color: 'gray',
        allergies: 'None',
        chronic_conditions: 'None'
      };
      const res = await api.registerPatient(studentPayload);
      if (res && res.data) {
        setShowModal(false);
        setFormData({
          name: '',
          section: '',
          age: '',
          gender: 'Male',
          status: 'Checked Out',
          date_of_birth: '',
          grade_level: '',
          graduation_year: '',
          emergency_contact_name: '',
          emergency_contact_phone: '',
          emergency_contact_relationship: '',
          parent_email: '',
          adviser_name: '',
          adviser_email: ''
        });
        await fetchPatients();
        setActiveSubTab('student-directory');
      }
    } catch (err) {
      console.error("Error registering student:", err);
      alert("Failed to register student: " + err.message);
    }
  };

  const handleCheckInSubmit = async (e) => {
    e.preventDefault();
    if (!checkInComplaint.trim() || !selectedStudent) {
      alert("Please enter a chief complaint for the check-in.");
      return;
    }

    try {
      setIsLoading(true);
      await api.checkInPatient(selectedStudent.id, checkInComplaint.trim());
      setShowCheckInModal(false);
      setCheckInComplaint('');
      setSelectedStudent(null);
      await fetchPatients();
      navigate(`/dashboard/patients/${selectedStudent.id}`);
    } catch (err) {
      console.error("Error checking in student:", err);
      alert("Failed to check in student: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Get unique sections
  const uniqueSections = Array.from(new Set(patients.map(p => p.section).filter(Boolean))).sort();

  // Filter sections matching sectionQuery
  const sectionSuggestions = sectionQuery.trim()
    ? uniqueSections.filter(sec => sec.toLowerCase().startsWith(sectionQuery.toLowerCase()))
    : [];

  // Filter patients based on selection or search parameters
  const getFilteredPatients = () => {
    let list = [...patients];

    if (activeSubTab === 'active-patients') {
      list = list.filter(p => p.status === 'Checked In');
    }

    if (selectedSection) {
      // Filter by section first
      list = list.filter(p => p.section === selectedSection);

      // Filter by first letter of student name inside this section
      if (nameLetterFilter) {
        list = list.filter(p => p.name.toUpperCase().startsWith(nameLetterFilter.toUpperCase()));
      }
    } else {
      // General search filtering
      if (search.trim()) {
        const query = search.toLowerCase();
        list = list.filter(p => p.name.toLowerCase().includes(query) || p.id.toString().includes(query));
      }
      if (letterFilter) {
        list = list.filter(p => p.name.toUpperCase().startsWith(letterFilter.toUpperCase()));
      }
    }

    // Sort alphabetically by name
    return list.sort((a, b) => a.name.localeCompare(b.name));
  };

  const filtered = getFilteredPatients();

  return (
    <div className="page-patients anim-fade-up">
      {/* Header */}
      <div className="page-top">
        <div>
          <h2>Clinic Registry</h2>
          <p className="text-muted">{patients.length} total registered students</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={16} /> Register Student
        </button>
      </div>

      {/* Sub-tabs to switch between Active Patients and Student Directory */}
      <div className="sub-tabs">
        <button 
          className={`sub-tab ${activeSubTab === 'active-patients' ? 'active' : ''}`}
          onClick={() => {
            setActiveSubTab('active-patients');
            setSelectedSection('');
            setSectionQuery('');
            setNameLetterFilter('');
            setLetterFilter('');
            setSearch('');
          }}
        >
          Active Checked-In Patients ({patients.filter(p => p.status === 'Checked In').length})
        </button>
        <button 
          className={`sub-tab ${activeSubTab === 'student-directory' ? 'active' : ''}`}
          onClick={() => {
            setActiveSubTab('student-directory');
            setSelectedSection('');
            setSectionQuery('');
            setNameLetterFilter('');
            setLetterFilter('');
            setSearch('');
          }}
        >
          Student Directory ({patients.length})
        </button>
      </div>

      {/* Filters */}
      <div className="card filter-card anim-fade-up delay-1">
        <div className="filter-navigation-split" style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          
          {/* Column 1: Section-First Navigation */}
          <div className="filter-section-nav" style={{ flex: 1, minWidth: 280 }}>
            <span className="filter-sec-label" style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--gray-500)', marginBottom: 8 }}>
              Section-First Navigation (Dynamic Filter)
            </span>
            <div className="search-box">
              <Search size={16} className="text-muted" />
              <input
                type="text"
                className="search-inner"
                placeholder="Type letter of classroom / grade… (e.g. S, G)"
                aria-label="Filter by classroom or grade"
                value={sectionQuery}
                onChange={(e) => {
                  setSectionQuery(e.target.value);
                  setSelectedSection(''); // Reset selection on typing
                  setNameLetterFilter('');
                }}
              />
            </div>

            {/* Section Suggestions */}
            {sectionSuggestions.length > 0 && (
              <div className="section-suggestions-dropdown" style={{ marginTop: 8, background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', padding: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {sectionSuggestions.map(sec => (
                  <button
                    key={sec}
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ justifyContent: 'flex-start', textAlign: 'left', width: '100%', padding: '6px 10px' }}
                    onClick={() => {
                      setSelectedSection(sec);
                      setSectionQuery('');
                      setNameLetterFilter('');
                    }}
                  >
                    🏫 {sec}
                  </button>
                ))}
              </div>
            )}

            {selectedSection && (
              <div className="active-section-badge" style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--primary-light)', color: 'var(--primary)', padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
                <span>Selected Class: {selectedSection}</span>
                <button 
                  type="button" 
                  style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', display: 'flex', padding: 0 }}
                  onClick={() => {
                    setSelectedSection('');
                    setNameLetterFilter('');
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            )}
          </div>

          {/* Column 2: Global Search (Only active if no section selected) */}
          {!selectedSection && (
            <div className="filter-global-search" style={{ flex: 1, minWidth: 280 }}>
              <span className="filter-sec-label" style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--gray-500)', marginBottom: 8 }}>
                Or Search Globally
              </span>
              <div className="search-box">
                <Search size={16} className="text-muted" />
                <input
                  type="text"
                  className="search-inner"
                  placeholder="Search globally by name or ID…"
                  aria-label="Search globally by name or ID"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        {/* Alphabetical Quick-List selection */}
        <div className="alpha-strip" style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--gray-100)' }}>
          <span className="alpha-strip-label" style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-400)', marginRight: 10 }}>
            {selectedSection ? `Filter student in ${selectedSection}:` : 'Filter student by Name letter (Global):'}
          </span>
          <div className="alpha-buttons-container" style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
            <button 
              className={`alpha-btn ${selectedSection ? (nameLetterFilter === '' ? 'active' : '') : (letterFilter === '' ? 'active' : '')}`} 
              onClick={() => selectedSection ? setNameLetterFilter('') : setLetterFilter('')}
              aria-label="All letters"
            >
              All
            </button>
            {alphabet.map(letter => (
              <button
                key={letter}
                className={`alpha-btn ${selectedSection ? (nameLetterFilter === letter ? 'active' : '') : (letterFilter === letter ? 'active' : '')}`}
                onClick={() => {
                  if (selectedSection) {
                    setNameLetterFilter(nameLetterFilter === letter ? '' : letter);
                  } else {
                    setLetterFilter(letterFilter === letter ? '' : letter);
                  }
                }}
                aria-label={`Filter by letter ${letter}`}
              >
                {letter}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '80px 40px' }}>
          <Loader2 className="spin text-primary" size={36} />
          <p className="text-muted" style={{ marginTop: 12 }}>Loading records...</p>
        </div>
      ) : filtered.length > 0 ? (
        <div className="card table-card anim-fade-up delay-2" style={{ padding: 0 }}>
          <table className="data-table">
            <thead>
              {activeSubTab === 'active-patients' ? (
                <tr>
                  <th>Patient ID</th>
                  <th>Full Name</th>
                  <th>Section</th>
                  <th>Age</th>
                  <th>Chief Complaint</th>
                  <th>Actions</th>
                </tr>
              ) : (
                <tr>
                  <th>Student ID</th>
                  <th>Full Name</th>
                  <th>Section</th>
                  <th>Age</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              )}
            </thead>
            <tbody>
              {filtered.map(patient => (
                <tr 
                  key={patient.id} 
                  onClick={() => navigate(`/dashboard/patients/${patient.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      navigate(`/dashboard/patients/${patient.id}`);
                    }
                  }}
                  tabIndex={0}
                  aria-label={`View chart for ${patient.name}, status ${patient.status}`}
                  role="link"
                >
                  <td className="font-mono">{patient.id}</td>
                  <td>
                    <div className="name-cell">
                      <div className="avatar avatar-xs" aria-hidden="true">
                        {patient.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                      </div>
                      {patient.name}
                    </div>
                  </td>
                  <td>{patient.section || '—'}</td>
                  <td>{patient.age || '—'}</td>
                  
                  {activeSubTab === 'active-patients' ? (
                    <>
                      <td style={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {patient.chief_complaint || '—'}
                      </td>
                      <td>
                        <span className="text-primary font-semibold" style={{ fontSize: 'var(--text-sm)' }}>View Chart</span>
                      </td>
                    </>
                  ) : (
                    <>
                      <td><span className={`badge badge-${patient.status_color || 'gray'}`}>{patient.status}</span></td>
                      <td>
                        {patient.status === 'Checked In' ? (
                          <span className="text-primary font-semibold" style={{ fontSize: 'var(--text-sm)' }}>View Chart</span>
                        ) : (
                          <button
                            className="btn btn-sm"
                            type="button"
                            style={{ 
                              background: 'rgba(var(--altitude-blue-rgb), 0.1)', 
                              color: 'var(--primary)', 
                              border: 'none', 
                              fontWeight: 700, 
                              fontSize: 11,
                              padding: '6px 12px',
                              borderRadius: 'var(--radius-md)',
                              cursor: 'pointer'
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedStudent(patient);
                              setShowCheckInModal(true);
                            }}
                          >
                            Check-In
                          </button>
                        )}
                      </td>
                    </>
                  )}
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
          {activeSubTab === 'active-patients' ? (
            <>
              <h3>No active patients checked in</h3>
              <p className="text-muted">All students are currently checked out. Search the Student Directory to check in a student.</p>
              <button className="btn btn-secondary" style={{ marginTop: 16 }} onClick={() => setActiveSubTab('student-directory')}>
                Go to Student Directory
              </button>
            </>
          ) : (
            <>
              <h3>No student roster records found</h3>
              <p className="text-muted">Student records will appear here once registered. Click "Register Student" to add the first record.</p>
              <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setShowModal(true)}>
                <Plus size={16} /> Register Student
              </button>
            </>
          )}
        </div>
      )}

      {/* Register Modal */}
      {showModal && createPortal(
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Register New Student</h3>
              <button className="modal-close" onClick={() => setShowModal(false)} aria-label="Close modal" type="button">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleRegister}>
              <div className="form-group">
                <label className="form-label" htmlFor="register-name">Full Name *</label>
                <input
                  id="register-name"
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
                  <label className="form-label" htmlFor="register-section">Section / Classroom</label>
                  <input
                    id="register-section"
                    type="text"
                    name="section"
                    className="form-input"
                    value={formData.section}
                    onChange={handleInputChange}
                    placeholder="e.g. Grade 5-A"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="register-dob">Date of Birth</label>
                  <input
                    id="register-dob"
                    type="date"
                    name="date_of_birth"
                    className="form-input"
                    max={new Date().toISOString().split('T')[0]}
                    value={formData.date_of_birth}
                    onChange={handleInputChange}
                  />
                </div>
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label className="form-label" htmlFor="register-age">Age</label>
                  <input
                    id="register-age"
                    type="number"
                    name="age"
                    className="form-input"
                    value={formData.age}
                    onChange={handleInputChange}
                    placeholder="e.g. 10"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="register-grade">Grade Level</label>
                  <select
                    id="register-grade"
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
                  <label className="form-label" htmlFor="register-gender">Gender</label>
                  <select
                    id="register-gender"
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
                  <label className="form-label" htmlFor="register-grad-year">Graduation Year</label>
                  <input
                    id="register-grad-year"
                    type="number"
                    name="graduation_year"
                    className="form-input"
                    value={formData.graduation_year}
                    onChange={handleInputChange}
                    placeholder="e.g. 2028"
                  />
                </div>
              </div>

              <h4 style={{ margin: '16px 0 12px', fontSize: 'var(--text-sm)' }}>Emergency Contact</h4>

              <div className="form-group">
                <label className="form-label" htmlFor="register-contact-name">Contact Name</label>
                <input
                  id="register-contact-name"
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
                  <label className="form-label" htmlFor="register-contact-phone">Phone Number</label>
                  <input
                    id="register-contact-phone"
                    type="text"
                    name="emergency_contact_phone"
                    className="form-input"
                    value={formData.emergency_contact_phone}
                    onChange={handleInputChange}
                    placeholder="e.g. 555-0199"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="register-contact-rel">Relationship</label>
                  <input
                    id="register-contact-rel"
                    type="text"
                    name="emergency_contact_relationship"
                    className="form-input"
                    value={formData.emergency_contact_relationship}
                    onChange={handleInputChange}
                    placeholder="e.g. Mother"
                  />
                </div>
              </div>

              <h4 style={{ margin: '16px 0 12px', fontSize: 'var(--text-sm)' }}>Parent & Adviser Contacts</h4>

              <div className="form-group">
                <label className="form-label" htmlFor="register-parent-email">Parent Email Address</label>
                <input
                  id="register-parent-email"
                  type="email"
                  name="parent_email"
                  className="form-input"
                  value={formData.parent_email}
                  onChange={handleInputChange}
                  placeholder="e.g. parent@example.com"
                />
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label className="form-label" htmlFor="register-adviser-name">Homeroom Adviser Name</label>
                  <input
                    id="register-adviser-name"
                    type="text"
                    name="adviser_name"
                    className="form-input"
                    value={formData.adviser_name}
                    onChange={handleInputChange}
                    placeholder="e.g. Teacher Sarah"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="register-adviser-email">Homeroom Adviser Email</label>
                  <input
                    id="register-adviser-email"
                    type="email"
                    name="adviser_email"
                    className="form-input"
                    value={formData.adviser_email}
                    onChange={handleInputChange}
                    placeholder="e.g. teacher@example.com"
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Register Student
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Quick Check-In Modal */}
      {showCheckInModal && selectedStudent && createPortal(
        <div className="modal-overlay" onClick={() => { setShowCheckInModal(false); setCheckInComplaint(''); setSelectedStudent(null); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Check-In Student</h3>
              <button 
                className="modal-close" 
                onClick={() => { setShowCheckInModal(false); setCheckInComplaint(''); setSelectedStudent(null); }} 
                aria-label="Close modal" 
                type="button"
              >
                <X size={18} />
              </button>
            </div>
            <div style={{ marginBottom: 16 }}>
              <strong>Student:</strong> {selectedStudent.name} ({selectedStudent.section || 'No Section'})
            </div>
            <form onSubmit={handleCheckInSubmit}>
              <div className="form-group" style={{ marginBottom: 20 }}>
                <label className="form-label">Chief Complaint / Reason for Check-In *</label>
                <textarea
                  className="form-textarea"
                  rows={4}
                  required
                  placeholder="Describe reason for clinic visit (e.g. stomach ache, fever)..."
                  value={checkInComplaint}
                  onChange={(e) => setCheckInComplaint(e.target.value)}
                />
              </div>
              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => { setShowCheckInModal(false); setCheckInComplaint(''); setSelectedStudent(null); }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Check-In Student
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

