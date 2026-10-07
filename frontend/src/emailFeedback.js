export function emailFeedback(notifications = []) {
  if (!notifications.length) return 'Visit saved. No notification recipients are configured for this action.';
  const count = (status) => notifications.filter((item) => item.status === status).length;
  const messages = ['Visit saved.'];
  if (count('accepted')) messages.push(`${count('accepted')} email(s) accepted by the provider; inbox delivery is not confirmed.`);
  if (count('simulated')) messages.push(`${count('simulated')} email(s) simulated; no external email was sent.`);
  if (count('awaiting_approval')) messages.push('Departure approval is pending. Security clearance has not been sent.');
  if (count('processing')) messages.push('This action was already saved. Check the email delivery log for notification progress.');
  if (count('failed') || count('unknown')) messages.push('Some emails failed or could not be confirmed. Check Alerts → Email Delivery & Responses.');
  return messages.join(' ');
}
