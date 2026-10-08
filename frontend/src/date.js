export const CLINIC_TIME_ZONE = import.meta.env.VITE_CLINIC_TIME_ZONE || 'Asia/Singapore';

export function clinicDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CLINIC_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function clinicAgeAtDateOfBirth(dateOfBirth, referenceDate = new Date()) {
  if (typeof dateOfBirth !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return null;
  const [birthYear, birthMonth, birthDay] = dateOfBirth.split('-').map(Number);
  const birthDate = new Date(Date.UTC(birthYear, birthMonth - 1, birthDay));
  if (birthDate.getUTCFullYear() !== birthYear || birthDate.getUTCMonth() !== birthMonth - 1 || birthDate.getUTCDate() !== birthDay) return null;

  const [todayYear, todayMonth, todayDay] = clinicDateString(referenceDate).split('-').map(Number);
  return todayYear - birthYear - (todayMonth < birthMonth || (todayMonth === birthMonth && todayDay < birthDay) ? 1 : 0);
}

export function formatClinicDate(value, options = { dateStyle: 'medium' }) {
  const date = value instanceof Date ? value : new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? `${value}T12:00:00Z` : value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString('en-SG', { timeZone: CLINIC_TIME_ZONE, ...options })
    : 'Date unavailable';
}

export function formatClinicDateTime(value, options = { dateStyle: 'medium', timeStyle: 'short' }) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString('en-SG', { timeZone: CLINIC_TIME_ZONE, ...options })
    : 'Time unavailable';
}

export function clinicCalendarDate(date = new Date()) {
  const [year, month, day] = clinicDateString(date).split('-').map(Number);
  // Noon avoids browser-local daylight-saving transitions while this Date is
  // used as a calendar-day value in the dashboard date strip.
  return new Date(year, month - 1, day, 12);
}

export function localDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function clinicHour(date = new Date()) {
  return Number(new Intl.DateTimeFormat('en-US', {
    timeZone: CLINIC_TIME_ZONE,
    hour: 'numeric',
    hourCycle: 'h23'
  }).format(date));
}
