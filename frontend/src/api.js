const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

let currentSession = null;

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  
  if (currentSession) {
    headers['X-User-Email'] = currentSession.email;
    headers['X-User-Role'] = currentSession.role;
    headers['X-User-Name'] = currentSession.name;
  }

  const config = {
    ...options,
    headers,
  };
  if (config.body && typeof config.body === 'object') {
    config.body = JSON.stringify(config.body);
  }
  const response = await fetch(url, config);
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `HTTP error! status: ${response.status}`);
  }
  return response.json();
}

export const api = {
  getPatients: (params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.search) searchParams.append('search', params.search);
    if (params.letter) searchParams.append('letter', params.letter);
    const query = searchParams.toString();
    return request(`/patients${query ? `?${query}` : ''}`);
  },

  getPatientById: (id) => request(`/patients/${id}`),

  registerPatient: (patientData) => request('/patients', {
    method: 'POST',
    body: patientData,
  }),

  updatePatient: (id, patientData) => request(`/patients/${id}`, {
    method: 'PUT',
    body: patientData,
  }),

  saveSoapNote: (id, soapData) => request(`/patients/${id}/soap`, {
    method: 'POST',
    body: soapData,
  }),

  saveMedicationOrder: (id, orderData) => request(`/patients/${id}/orders`, {
    method: 'POST',
    body: orderData,
  }),

  saveVitals: (id, vitalsData) => request(`/patients/${id}/vitals`, {
    method: 'POST',
    body: vitalsData,
  }),

  getDashboardStats: () => request('/dashboard/stats'),

  getDashboardActivity: (date) => {
    const query = date ? `?date=${date}` : '';
    return request(`/dashboard/activity${query}`);
  },

  getDashboardTrends: () => request('/dashboard/trends'),

  login: (credentials) => request('/auth/login', {
    method: 'POST',
    body: credentials,
  }),

  register: (accountData) => request('/auth/register', {
    method: 'POST',
    body: accountData,
  }),

  mfaSetup: (userId) => request('/auth/mfa/setup', {
    method: 'POST',
    body: { userId },
  }),

  mfaVerifySetup: (userId, code, mfaType) => request('/auth/mfa/verify-setup', {
    method: 'POST',
    body: { userId, code, mfaType },
  }),

  mfaSendEmail: (userId) => request('/auth/mfa/send-email', {
    method: 'POST',
    body: { userId },
  }),

  mfaVerify: (userId, code) => request('/auth/mfa/verify', {
    method: 'POST',
    body: { userId, code },
  }),

  changePassword: (userId, currentPassword, newPassword) => request('/auth/change-password', {
    method: 'POST',
    body: { userId, currentPassword, newPassword },
  }),

  disableMfa: (userId) => request('/auth/mfa/disable', {
    method: 'POST',
    body: { userId },
  }),

  updateImmunization: (id, vaccineData) => request(`/patients/${id}/immunizations`, {
    method: 'POST',
    body: vaccineData,
  }),

  checkInPatient: (id, chiefComplaint) => request(`/patients/${id}/checkin`, {
    method: 'POST',
    body: { chief_complaint: chiefComplaint },
  }),

  getExcuseSlips: (patientId) => request(`/patients/${patientId}/excuse-slips`),

  createExcuseSlip: (patientId, excuseData) => request(`/patients/${patientId}/excuse-slips`, {
    method: 'POST',
    body: excuseData,
  }),

  getConsents: (patientId) => request(`/patients/${patientId}/consents`),

  createConsent: (patientId, consentData) => request(`/patients/${patientId}/consents`, {
    method: 'POST',
    body: consentData,
  }),

  purgeGraduates: (years) => request('/admin/purge-graduates', {
    method: 'POST',
    body: { years },
  }),

  getSimulatedNotifications: () => request('/admin/notifications'),

  setSession: (session) => {
    currentSession = session;
  },

  clearSession: () => {
    currentSession = null;
  },
};




