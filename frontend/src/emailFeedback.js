export function emailFeedback(notifications = []) {
  if (!notifications.length) return 'Visit saved. No notification recipients are configured for this action.';
  const count = (status) => notifications.filter((item) => item.status === status).length;
  const messages = ['Visit saved.'];
  if (count('accepted')) messages.push(`${count('accepted')} email(s) accepted by the provider; inbox delivery is not confirmed.`);
  if (count('simulated')) messages.push(`${count('simulated')} email(s) simulated; no external email was sent.`);
  if (count('awaiting_approval')) messages.push('Departure approval is pending. Security clearance has not been sent.');
  if (count('processing') || count('pending') || count('sending')) messages.push('This action was saved. Email delivery is still processing; check the delivery log for the outcome.');
  if (count('cancelled')) messages.push('A departure email was cancelled because the approval no longer applies.');
  if (count('failed') || count('unknown')) messages.push('Some emails failed or could not be confirmed. Check Alerts → Email Delivery & Responses.');
  return messages.join(' ');
}
