const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

let currentSession = null;

// In-memory request cache for GET endpoints
const requestCache = new Map();
const CACHE_TTL = 30000; // 30 seconds

function getCache(key) {
  if (!requestCache.has(key)) return null;
  const entry = requestCache.get(key);
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    requestCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data) {
  requestCache.set(key, {
    data,
    timestamp: Date.now()
  });
}

function clearCache() {
  requestCache.clear();
}

async function request(path, options = {}) {
  const method = options.method || 'GET';

  // Only use cache for GET requests
  if (method === 'GET') {
    const cachedData = getCache(path);
    if (cachedData !== null) {
      // Return deep copy to prevent mutations affecting cache
      return JSON.parse(JSON.stringify(cachedData));
    }
  }

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
  
  const result = await response.json();

  if (method === 'GET') {
    setCache(path, result);
  } else {
    // Invalidate cache on mutations (POST, PUT, DELETE)
    clearCache();
  }

  return result;
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

  checkOutPatient: (id) => request(`/patients/${id}/checkout`, {
    method: 'POST',
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

  getEmailAlertLogs: () => request('/notifications/logs'),

  getClinicSettings: () => request('/settings/clinic'),

  updateClinicSettings: (settings) => request('/settings/clinic', {
    method: 'POST',
    body: settings,
  }),

  setSession: (session) => {
    currentSession = session;
    clearCache();
  },

  clearSession: () => {
    currentSession = null;
    clearCache();
  },
};




