import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Bed, UserMinus, Plus, ShieldAlert, Activity, Heart, ArrowUpRight } from 'lucide-react';
import { api } from '../../api';
import CheckoutModal from '../patient/CheckoutModal';
import NotificationResult from '../patient/NotificationResult';
import { useAuth } from '../../auth-context';

const ClinicTracker = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [bedsList, setBedsList] = useState([]);
  const [patients, setPatients] = useState([]);
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({ bedsOccupied: 0 });
  const [currentTime, setCurrentTime] = useState(Date.now);

  const [checkoutPatient, setCheckoutPatient] = useState(null);
  const [releasePatient, setReleasePatient] = useState(null);
  const [isReleasing, setIsReleasing] = useState(false);
  const [releaseError, setReleaseError] = useState('');
  const [notifications, setNotifications] = useState(null);
  const [loadError, setLoadError] = useState('');

  const canManageBeds = ['physician', 'nurse', 'admin'].includes(user?.role);

  const fetchClinicData = async () => {
    try {
      setIsLoading(true);
      setLoadError('');
      const [resStats, resPatients] = await Promise.all([
        api.getDashboardStats(),
        api.getPatients()
      ]);

      if (resStats) {
        setBedsList(resStats.occupiedBedsList || []);
        setStats(resStats);
      }
      
      if (resPatients && resPatients.data) {
        // Only list patients who are NOT currently in a bed
        const bedIds = (resStats ? resStats.occupiedBedsList || [] : []).map(b => b.id);
        const available = resPatients.data.filter(p => p.status === 'Checked In' && !bedIds.includes(p.id));
        setPatients(available);
      }
    } catch (err) {
      setLoadError(err.message || 'Clinic occupancy is unavailable.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const initial = setTimeout(fetchClinicData, 0);
    // Update durations every 30 seconds
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 30000);
    return () => { clearTimeout(initial); clearInterval(interval); };
  }, []);

  const handleDischarge = async (patientId) => {
    if (isReleasing) return;
    setIsReleasing(true);
    setReleaseError('');
    try {
      await api.dischargePatient(patientId);
      setReleasePatient(null);
      await fetchClinicData();
    } catch (err) {
      setReleaseError('Failed to release student: ' + err.message);
    } finally { setIsReleasing(false); }
  };

  const handleAdmit = async (e) => {
    e.preventDefault();
    if (!selectedPatientId) return;

    try {
      const patientId = parseInt(selectedPatientId);
      await api.admitPatient(patientId);
      setSelectedPatientId('');
      fetchClinicData();
    } catch (err) {
      alert('Failed to admit student: ' + err.message);
    }
  };

  const handleOpenCheckOut = async (bedPatient) => {
    try {
      const { data } = await api.getPatientById(bedPatient.id);
      if (!data) throw new Error('Patient not found.');
      setCheckoutPatient(data);
    } catch (failure) {
      window.alert('Could not load checkout details: ' + failure.message);
    }
  };
  const handleCheckOutSubmit = async (payload) => {
    const result = await api.checkOutPatient(checkoutPatient.id, payload);
    setNotifications(result.notifications || []);
    setCheckoutPatient(null);
    await fetchClinicData();
  };

  const getDuration = (entryTime) => {
    if (!entryTime) return 'Not recorded';
    const diffMs = currentTime - new Date(entryTime).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 0) return '0m';
    if (diffMins < 60) return `${diffMins}m`;
    
    const diffHours = Math.floor(diffMins / 60);
    const remainingMins = diffMins % 60;
    return `${diffHours}h ${remainingMins}m`;
  };

  const capacity = stats.bedCapacity || 5;
  const occupiedCount = bedsList.length;
  const availableBeds = Math.max(0, capacity - occupiedCount);
  const occupancyRate = Math.round((occupiedCount / capacity) * 100);

  if (isLoading) return <div role="status" className="card" style={{ padding: 24 }}>Loading clinic occupancy…</div>;
  if (loadError) return <div role="alert" className="card" style={{ padding: 24 }}><p>Clinic occupancy could not be loaded: {loadError}</p><button className="btn btn-secondary" onClick={fetchClinicData}>Retry</button></div>;

  return (
    <div className="clinic-tracker-page anim-fade-up" style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {notifications !== null && <NotificationResult key={JSON.stringify(notifications)} notifications={notifications} />}
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--gray-200)', paddingBottom: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--gray-900)', margin: 0 }}>Clinic Beds & Observation Tracker</h1>
          <p className="text-muted" style={{ margin: '4px 0 0 0', fontSize: 'var(--text-sm)' }}>
            Monitor currently occupied clinic beds, observation durations, and admit or discharge students.
          </p>
        </div>
      </div>

      {/* Overview Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
        {/* Total Occupied Card */}
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '20px' }}>
          <div style={{ background: 'var(--primary-light)', padding: '12px', borderRadius: 'var(--radius-lg)' }}>
            <Bed size={24} style={{ color: 'var(--primary)' }} />
          </div>
          <div>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--gray-400)', fontWeight: 700, textTransform: 'uppercase', display: 'block', letterSpacing: '0.05em' }}>Occupied Beds</span>
            <strong style={{ fontSize: '24px', fontWeight: 800, color: 'var(--gray-800)' }}>{occupiedCount} <span style={{ fontSize: '14px', color: 'var(--gray-400)', fontWeight: 500 }}>/ {capacity}</span></strong>
          </div>
        </div>

        {/* Available Beds Card */}
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '20px' }}>
          <div style={{ background: 'var(--success-bg)', padding: '12px', borderRadius: 'var(--radius-lg)' }}>
            <Activity size={24} style={{ color: 'var(--success)' }} />
          </div>
          <div>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--gray-400)', fontWeight: 700, textTransform: 'uppercase', display: 'block', letterSpacing: '0.05em' }}>Beds Available</span>
            <strong style={{ fontSize: '24px', fontWeight: 800, color: 'var(--success)' }}>{availableBeds}</strong>
          </div>
        </div>

        {/* Occupancy Rate Card */}
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '20px' }}>
          <div style={{ background: 'var(--info-bg)', padding: '12px', borderRadius: 'var(--radius-lg)' }}>
            <Heart size={24} style={{ color: 'var(--info)' }} />
          </div>
          <div>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--gray-400)', fontWeight: 700, textTransform: 'uppercase', display: 'block', letterSpacing: '0.05em' }}>Occupancy Rate</span>
            <strong style={{ fontSize: '24px', fontWeight: 800, color: 'var(--gray-800)' }}>{occupancyRate}%</strong>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px', alignItems: 'flex-start' }}>
        {/* Left Side: Beds Details list */}
        <div className="card" style={{ padding: 24 }}>
          <h3 className="settings-section-title" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 16px 0', fontSize: '16px' }}>
            <Bed size={18} style={{ color: 'var(--primary)' }} /> Live Bed Occupants
          </h3>
          
          {isLoading ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--gray-400)' }}>Loading beds data...</div>
          ) : bedsList.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {bedsList.map((bed, index) => (
                <div key={bed.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-lg)', flexWrap: 'wrap', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    {/* Bed Index Badge */}
                    <div style={{ background: 'var(--primary)', color: '#fff', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700 }}>
                      B{index + 1}
                    </div>
                    {/* Student Info */}
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <strong style={{ fontSize: '14px', color: 'var(--gray-800)' }}>{bed.name}</strong>
                        <span style={{ fontSize: '10px', background: 'var(--primary-light)', color: 'var(--primary)', padding: '2px 8px', borderRadius: '10px', fontWeight: 700 }}>{bed.section}</span>
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--gray-400)' }}>
                        {bed.age} years old • {bed.gender}
                      </span>
                    </div>
                  </div>

                  {/* Bed Stats */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '9px', color: 'var(--gray-400)', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>Observed Duration</span>
                      <strong style={{ fontSize: '14px', color: 'var(--primary)' }}>{getDuration(bed.entryTime)}</strong>
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                      <button 
                        onClick={() => navigate(`/dashboard/patients/${bed.id}`)}
                        className="btn btn-secondary btn-sm"
                        style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                      >
                        Chart <ArrowUpRight size={12} style={{ color: 'var(--primary)' }} />
                      </button>
                      {canManageBeds && (
                        <>
                          <button 
                            onClick={() => { setReleaseError(''); setReleasePatient(bed); }}
                            className="btn btn-secondary btn-sm"
                            style={{ borderColor: 'var(--gray-300)', color: 'var(--gray-600)', display: 'flex', alignItems: 'center', gap: 4 }}
                          >
                            <UserMinus size={12} style={{ color: 'var(--gray-600)' }} /> Release Bed
                          </button>
                          <button 
                            onClick={() => handleOpenCheckOut(bed)}
                            className="btn btn-primary btn-sm"
                            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                          >
                            Check-Out
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-sm" style={{ padding: '60px 20px', border: '1.5px dashed var(--gray-200)', borderRadius: 'var(--radius-lg)', textAlign: 'center' }}>
              <Bed size={32} style={{ color: 'var(--gray-300)', margin: '0 auto 12px auto' }} />
              <h4 style={{ color: 'var(--gray-700)', margin: '0 0 4px 0' }}>All Beds Are Empty</h4>
              <p className="text-muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>There are no patients currently under observation in beds.</p>
            </div>
          )}
        </div>

        {/* Right Side: Quick Admission Panel */}
        <div className="card" style={{ padding: 24 }}>
          <h3 className="settings-section-title" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 16px 0', fontSize: '16px' }}>
            <Plus size={18} style={{ color: 'var(--primary)' }} /> Bed Admission
          </h3>
          
          {canManageBeds ? (
            <>
              <p className="text-muted" style={{ fontSize: 'var(--text-xs)', marginBottom: '16px', lineHeight: '1.4' }}>
                Select an active clinic student to place under observation in an empty bed.
              </p>

              <form onSubmit={handleAdmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Select Student *</label>
                  <select 
                    className="form-select"
                    required
                    value={selectedPatientId}
                    onChange={(e) => setSelectedPatientId(e.target.value)}
                    disabled={occupiedCount >= capacity}
                  >
                    <option value="">-- Select Student --</option>
                    {patients.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.section || p.grade_level || 'No class'})
                      </option>
                    ))}
                  </select>
                </div>

                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  disabled={!selectedPatientId || occupiedCount >= capacity}
                >
                  <Plus size={15} style={{ color: '#fff' }} /> Admit to Bed
                </button>

                {occupiedCount >= capacity && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--danger)', fontSize: 10, marginTop: 4 }}>
                    <ShieldAlert size={12} style={{ color: 'var(--danger)' }} />
                    <span>Clinic beds at maximum capacity. Discharge a student first.</span>
                  </div>
                )}
              </form>
            </>
          ) : (
            <div className="form-error" style={{ background: '#fef2f2', border: '1px solid #fee2e2', color: '#b91c1c', padding: 12, borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)' }}>
              Access restricted: Clinical staff and administrators can assign or discharge clinic beds.
            </div>
          )}
        </div>
      </div>
      {checkoutPatient && <CheckoutModal patient={checkoutPatient} onClose={() => setCheckoutPatient(null)} onSubmit={handleCheckOutSubmit} />}
      {releasePatient && createPortal(<div className="modal-overlay">
        <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="release-bed-title">
          <h3 id="release-bed-title">Release Bed: {releasePatient.name}</h3>
          <p>The bed will become available. This student will remain checked in at the clinic.</p>
          {releaseError && <p role="alert" className="form-error">{releaseError}</p>}
          <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
            <button type="button" className="btn btn-secondary" disabled={isReleasing} onClick={() => setReleasePatient(null)}>Cancel</button>
            <button type="button" className="btn btn-primary" disabled={isReleasing} onClick={() => void handleDischarge(releasePatient.id)}>{isReleasing ? 'Releasing…' : 'Confirm Bed Release'}</button>
          </div>
        </div>
      </div>, document.body)}
    </div>
  );
};

export default ClinicTracker;
