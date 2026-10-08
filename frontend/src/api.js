// Same-origin proxy keeps the HttpOnly session cookie first-party on Vercel.
const API_BASE = '/api';

let currentSession = null;

// In-memory request cache for GET endpoints
const requestCache = new Map();
const pendingClinicalRequests = new Map();
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
  if (method === 'GET' && options.cache !== 'no-store') {
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
  
  if (currentSession?.accessToken) headers.Authorization = `Bearer ${currentSession.accessToken}`;
  if (currentSession?.id) headers['X-Account-ID'] = currentSession.id;

  const clinicalMutation = method === 'POST' && /^\/patients\/\d+\/(checkin|checkout|admit|discharge|excuse-slips)$/.test(path);
  const actionKey = clinicalMutation ? JSON.stringify([currentSession?.id, path, options.body || {}]) : null;
  if (actionKey) {
    if (!pendingClinicalRequests.has(actionKey)) {
      if (pendingClinicalRequests.size >= 100) pendingClinicalRequests.delete(pendingClinicalRequests.keys().next().value);
      pendingClinicalRequests.set(actionKey, crypto.randomUUID());
    }
    headers['Idempotency-Key'] = pendingClinicalRequests.get(actionKey);
  }

  const config = {
    ...options,
    credentials: 'same-origin',
    headers,
  };
  if (config.body && typeof config.body === 'object') {
    config.body = JSON.stringify(config.body);
  }
  const response = await fetch(url, config);
  if (!response.ok) {
    if (actionKey && response.status < 500) pendingClinicalRequests.delete(actionKey);
    const errData = await response.json().catch(() => ({}));
    if (response.status === 401 && path !== '/auth/login') {
      currentSession = null;
      clearCache();
      window.dispatchEvent(new Event('auth:expired'));
    }
    throw Object.assign(new Error(errData.error || `HTTP error! status: ${response.status}`), { status: response.status });
  }
  
  const result = await response.json();
  if (actionKey) pendingClinicalRequests.delete(actionKey);

  if (method === 'GET') {
    if (options.cache !== 'no-store') setCache(path, result);
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

  getPatientById: (id, { refresh = false } = {}) => request(`/patients/${id}${refresh ? '?refresh=true' : ''}`, { cache: 'no-store' }),
  restoreSession: () => request('/auth/session', { cache: 'no-store' }),

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
    body: { ...credentials, cookieSession: true },
  }),

  register: (accountData) => request('/auth/register', {
    method: 'POST',
    body: accountData,
  }),

  logout: async () => {
    try {
      await request('/auth/logout', { method: 'POST' });
    } finally {
      currentSession = null;
      clearCache();
      pendingClinicalRequests.clear();
    }
  },

  changePassword: (currentPassword, newPassword) => request('/auth/change-password', {
    method: 'POST',
    body: { currentPassword, newPassword },
  }),

  updateImmunization: (id, vaccineData) => request(`/patients/${id}/immunizations`, {
    method: 'POST',
    body: vaccineData,
  }),

  checkInPatient: (id, chiefComplaint) => request(`/patients/${id}/checkin`, {
    method: 'POST',
    body: { chief_complaint: chiefComplaint },
  }),

  admitPatient: (id) => request(`/patients/${id}/admit`, {
    method: 'POST',
  }),

  dischargePatient: (id) => request(`/patients/${id}/discharge`, {
    method: 'POST',
  }),

  checkOutPatient: (id, excuseData) => request(`/patients/${id}/checkout`, {
    method: 'POST',
    body: excuseData
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

  getEmailAlertLogs: () => request('/notifications/logs', { cache: 'no-store' }),
  getEmailConfiguration: () => request('/notifications/email-config', { cache: 'no-store' }),
  retryEmail: (id) => request(`/notifications/logs/${id}/retry`, { method: 'POST' }),
  notifyPatientParent: (id) => request(`/patients/${id}/notify-parent`, { method: 'POST' }),

  getClinicSettings: () => request('/settings/clinic'),

  updateClinicSettings: (settings) => request('/settings/clinic', {
    method: 'POST',
    body: settings,
  }),

  setSession: (session) => {
    currentSession = session;
    pendingClinicalRequests.clear();
    clearCache();
  },

  clearSession: () => {
    currentSession = null;
    pendingClinicalRequests.clear();
    clearCache();
  },
};
