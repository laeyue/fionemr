const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
})[character]);

const clinicName = () => process.env.CLINIC_NAME?.trim() || 'OLPHA AeroHealth Clinic';

function formatClinicTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 'the recorded time';
  const options = { dateStyle: 'medium', timeStyle: 'short', timeZone: process.env.CLINIC_TIME_ZONE || 'Asia/Singapore' };
  try { return new Intl.DateTimeFormat('en-PH', options).format(date); }
  catch { return new Intl.DateTimeFormat('en-PH', { ...options, timeZone: 'Asia/Singapore' }).format(date); }
}

function buildEmailPayload({ eventType, subject, title, greeting, paragraphs = [], actions = [], note }) {
  const name = clinicName();
  const safeParagraphs = paragraphs.map((paragraph) => String(paragraph ?? '').trim()).filter(Boolean);
  const htmlParagraphs = safeParagraphs.map((paragraph) => `<p style="margin:0 0 16px;line-height:1.6;color:#334155">${escapeHtml(paragraph)}</p>`).join('');
  const htmlActions = actions.map(({ label, url }) => `<p style="margin:0 0 12px"><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#176b5b;color:#fff;text-decoration:none;font-weight:700">${escapeHtml(label)}</a></p>`).join('');
  const htmlNote = note ? `<p style="margin:20px 0 0;padding:12px 14px;background:#f1f5f9;border-radius:8px;font-size:13px;line-height:1.5;color:#475569">${escapeHtml(note)}</p>` : '';
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head><body style="margin:0;padding:24px 12px;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#172033"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #dce4eb;border-radius:12px"><tr><td style="padding:24px 28px;background:#176b5b;color:#fff;border-radius:12px 12px 0 0"><p style="margin:0 0 6px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.9">${escapeHtml(name)}</p><h1 style="margin:0;font-size:22px;line-height:1.3">${escapeHtml(title)}</h1></td></tr><tr><td style="padding:26px 28px"><p style="margin:0 0 16px;color:#334155">${escapeHtml(greeting || 'Hello,')}</p>${htmlParagraphs}${htmlActions}${htmlNote}<p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.5;color:#64748b">For help, contact the school clinic through your usual school contact. This email is intended for the named recipient.</p></td></tr></table></body></html>`;
  const text = [
    name,
    title,
    greeting || 'Hello,',
    ...safeParagraphs,
    ...actions.map(({ label, url }) => `${label}: ${url}`),
    note,
    'For help, contact the school clinic through your usual school contact.'
  ].filter(Boolean).join('\n\n');

  return { eventType, subject, html, text };
}

function responseUrl(backendUrl, alertId, response) {
  const url = new URL('/api/notifications/respond', backendUrl);
  url.searchParams.set('alertId', alertId);
  url.searchParams.set('response', response);
  return url.toString();
}

function parentCheckin({ patient, eventAt, backendUrl, alertId }) {
  const studentName = patient.name || 'your child';
  return buildEmailPayload({
    eventType: 'clinic_checkin_parent',
    subject: `[${clinicName()}] Clinic check-in update`,
    title: 'Clinic check-in update',
    greeting: `Hello ${patient.emergency_contact_name || 'Parent/Guardian'},`,
    paragraphs: [
      `${studentName} checked in to the school clinic at ${formatClinicTime(eventAt)}.`,
      'This email does not include the reason for the visit or other health information.'
    ],
    actions: [
      { label: 'Acknowledge update', url: responseUrl(backendUrl, alertId, 'Acknowledged') },
      { label: 'I am on my way', url: responseUrl(backendUrl, alertId, 'On My Way') }
    ],
    note: 'Opening a button will show a confirmation page. Your response is recorded only after you confirm it there.'
  });
}

function adviserCheckin({ patient, eventAt }) {
  return buildEmailPayload({
    eventType: 'clinic_checkin_adviser',
    subject: `[${clinicName()}] Clinic attendance update`,
    title: 'Clinic attendance update',
    greeting: `Hello ${patient.adviser_name || 'Homeroom Adviser'},`,
    paragraphs: [
      `${patient.name || 'A student'} checked in to the school clinic at ${formatClinicTime(eventAt)}.`,
      'Please contact the clinic through the usual school process if attendance follow-up is needed.'
    ],
    note: 'This notification does not include health or treatment details.'
  });
}

function parentCheckout({ patient, eventAt }) {
  return buildEmailPayload({
    eventType: 'clinic_checkout_parent',
    subject: `[${clinicName()}] Clinic visit update`,
    title: 'Clinic visit update',
    greeting: `Hello ${patient.emergency_contact_name || 'Parent/Guardian'},`,
    paragraphs: [
      `${patient.name || 'Your child'} checked out of the school clinic at ${formatClinicTime(eventAt)}.`,
      'The clinic visit has ended. This update does not indicate whether the student has left school or returned to class.'
    ],
    note: 'This email does not include the reason for the visit or other health information.'
  });
}

function parentContactRequest({ patient }) {
  return buildEmailPayload({
    eventType: 'clinic_contact_requested',
    subject: `[${clinicName()}] Please contact the school clinic`,
    title: 'Please contact the school clinic',
    greeting: `Hello ${patient.emergency_contact_name || 'Parent/Guardian'},`,
    paragraphs: [`The clinic team requests that you contact the school clinic regarding ${patient.name || 'your child'}.`],
    note: 'This email does not include health information. Please use your usual school contact for follow-up.'
  });
}

function adviserDocumentUpdate({ patient }) {
  return buildEmailPayload({
    eventType: 'clinic_document_update_adviser',
    subject: `[${clinicName()}] Clinic document update`,
    title: 'Clinic document update',
    greeting: `Hello ${patient.adviser_name || 'Homeroom Adviser'},`,
    paragraphs: [`A clinic document has been recorded for ${patient.name || 'a student'}. Please contact the clinic through the authorized school process for details.`],
    note: 'This email does not include the document reason or health information.'
  });
}

function principalApproval({ backendUrl, slipId, token }) {
  const url = new URL(`/api/excuse-slips/${encodeURIComponent(slipId)}/acknowledge`, backendUrl);
  url.hash = token;
  return buildEmailPayload({
    eventType: 'departure_approval_request',
    subject: `[${clinicName()}] Departure approval requested`,
    title: 'Departure approval requested',
    greeting: 'Hello,',
    paragraphs: ['A clinic excuse slip requires your review. Verify the request through the authorized school process before approving departure.'],
    actions: [{ label: 'Review request', url: url.toString() }],
    note: 'This link expires after seven days. Opening it does not approve the request.'
  });
}

function securityClearance({ patient }) {
  return buildEmailPayload({
    eventType: 'approved_departure_security',
    subject: `[${clinicName()}] Approved departure`,
    title: 'Approved departure',
    greeting: 'Hello,',
    paragraphs: [`Principal approval and clinic checkout have been recorded for ${patient.name || 'the student'}${patient.section ? ` (${patient.section})` : ''}.`, 'Verify the student and follow the school departure procedure before permitting exit.'],
    note: 'This clearance is for the listed departure. Follow the school’s identity verification procedure.'
  });
}

module.exports = {
  adviserCheckin,
  adviserDocumentUpdate,
  buildEmailPayload,
  formatClinicTime,
  parentCheckin,
  parentCheckout,
  parentContactRequest,
  principalApproval,
  securityClearance
};
