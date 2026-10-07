# App consistency review

Reviewed: 2026-10-08

## Resolution — 2026-10-08

All 12 findings have implementation changes. The numbered sections below preserve the original review evidence; their line numbers refer to the pre-fix source snapshot.

| Finding | Implementation |
|---|---|
| 1. Premature gate clearance | Guard notifications require explicit principal approval, a matching checkout, an applicable slip, and no later check-in. Sends are deduplicated and eligibility is rechecked on retry. |
| 2. GET records recipient responses | GET displays a confirmation form. POST records one response atomically; links expire after seven days. |
| 3. Incorrect observation transition | Chart and directory actions recognize Under Observation. The backend enforces allowed state transitions and demographics cannot change state. |
| 4. Stale active alarms | The dashboard selects the latest vital record per active visit and excludes checked-out patients. |
| 5. False healthy report states | Reports, the dashboard, alerts, and the bed tracker show loading/error states instead of zero or all-clear results when requests fail. |
| 6. Partial clinical saves | Shared visit/bed/slip workflows use database transactions and state checks. Browser retries carry idempotency keys with durable, account-scoped response records. |
| 7. Frontend-only bed capacity | Capacity and admission eligibility are enforced inside a serialized backend transaction. The UI uses server capacity and lists only checked-in candidates. |
| 8. Wrong observation timer | Admission stores observation_started_at; discharge clears it. Older active observations are backfilled from admission logs; missing times are shown as not recorded. |
| 9. Placeholder medication stock | Removed calculated stock counts. The UI explicitly displays Not tracked. |
| 10. Ignored teacher preference | The request is stored separately from send outcome. Adviser email honors the request; slip status reflects provider acceptance, simulation, failure, or uncertainty, including retries. |
| 11. Different slip approval paths | Checkout and standalone creation use the same transactional slip service and principal notification flow. |
| 12. Administrator permission mismatch | Physicians, nurses, and administrators explicitly have clinical-management capabilities. Backend guards and corresponding UI controls follow that policy. |

Migrations `006_workflow_consistency.sql` and `007_departure_approval.sql` have been applied to Neon. Historical document acknowledgments remain separate from departure approval and cannot authorize gate clearance. Existing test expectations were updated for explicit response POSTs and departure approval wording. No automated tests or live email sends were run for these fixes. Validation consists of source review, backend syntax checks, frontend production compilation, and migration execution.

Scope: source review of patient visits, bed observation, email notifications, excuse slips, dashboard reports, and role controls. Findings are based on frontend/backend code paths; the scenarios below were not executed against patient records. This is not an exhaustive security or clinical validation. Priorities: P1 = address before real patient use; P2 = workflow or reporting correctness.

## 1. [P1] Gate clearance precedes principal approval

Evidence: `backend/index.js:294`, `backend/index.js:356`, `backend/index.js:364`.

Checkout prepares the principal acknowledgment email and the guard clearance email in the same operation. The guard message states that the student is cleared to leave and asks security to grant departure while the permission slip is still being processed. There is no principal-approval condition before dispatching clearance.

Scenario: check out a patient with an excuse slip and configured principal/guard recipients; the guard can receive clearance before the principal responds.

Recommendation: distinguish clinic checkout, authorization to leave school, and principal acknowledgment. Send clearance only after the required authorization is recorded.

## 2. [P1] Opening a response link records a parent response

Evidence: `backend/index.js:384`, `backend/index.js:402`.

The public GET endpoint updates `acknowledged`, `acknowledged_at`, and `response_status`. A link preview or mail scanner that follows the URL can therefore record an acknowledgment or "On My Way" without a parent's confirmation. Repeated visits can also overwrite the response and timestamp.

Recommendation: make GET display a confirmation form and use POST for an explicit, expiring, replay-controlled response. Keep a separate history if recipients may change their answer.

## 3. [P1] A patient under observation is offered another check-in

Evidence: `frontend/src/components/patient/PatientChart.jsx:258`, `backend/index.js:1008`.

The chart displays Checkout only for `Checked In`; all other states display Check-In, including `Under Observation`. The check-in endpoint unconditionally sets `Checked In`. Clicking this action on an observed patient removes them from bed occupancy and inserts another check-in rather than recording a bed discharge.

Recommendation: define allowed transitions for Checked Out, Checked In, and Under Observation on the server, and render matching actions in every patient screen.

## 4. [P1] Active vital alarms include superseded readings and departed patients

Evidence: `backend/index.js:1262`, `backend/index.js:1313`, `backend/index.js:1335`; `frontend/src/components/alerts/AlertsPage.jsx:183`.

The dashboard aggregates abnormal readings from the entire day instead of evaluating only the latest reading for each patient. A newer normal reading does not clear an earlier alarm. The query does not restrict results to patients currently in the clinic, although the interface describes the list as checked-in students.

Recommendation: separate current alarms from historical abnormal readings. Current alarms should use the latest relevant measurements and active visit state; historical events should remain available in the chart.

## 5. [P1] Report failures appear as healthy results

Evidence: `frontend/src/components/reports/ReportsAnalytics.jsx:24`, `frontend/src/components/reports/ReportsAnalytics.jsx:203`.

Report requests log failures to the console without presenting an error. Since stats initially equal null, the interface falls through to "All classroom sections scanned. No active outbreaks detected" and zero counts even when the backend request failed.

Recommendation: use separate loading, successful-empty, failed, and stale states. Show the last successful refresh time; never translate an unavailable result into a clinical all-clear.

## 6. [P1] Visit actions can partially save and still report failure

Evidence: `backend/index.js:1009`, `backend/index.js:1126`, `backend/index.js:1151`.

Check-in and checkout perform patient updates, excuse-slip inserts, and visit-log inserts as separate writes. Some returned errors are ignored. A later failure can leave an updated status or a saved slip even when the HTTP response says the action failed. Retrying can duplicate visits or slips.

Recommendation: transactionally commit the clinical action, check every operation's result, enforce expected starting state, and use an idempotency key. Keep email delivery status independent of the clinical transaction.

## 7. [P2] The five-bed limit exists only in the frontend

Evidence: `frontend/src/components/clinic/ClinicTracker.jsx:158`, `frontend/src/components/clinic/ClinicTracker.jsx:323`; `backend/index.js:1038`.

The UI disables admission at five occupied beds, but the backend simply changes status to Under Observation. Concurrent requests or another client can exceed capacity. The patient selector also includes checked-out students because it excludes only existing bed occupants.

Recommendation: enforce configured capacity and admission eligibility inside a concurrency-safe backend transaction, with a clear conflict response when the final bed has been taken.

## 8. [P2] Observation duration starts at clinic check-in

Evidence: `backend/index.js:1284`, `backend/index.js:1305`; `frontend/src/components/clinic/ClinicTracker.jsx:144`.

The bed timer uses the latest Check-in log, falling back to patient registration time. It does not use the bed-admission event. A student checked in at 09:00 and admitted to a bed at 11:00 appears to have spent two extra hours under observation; readmission also inherits the wrong starting time.

Recommendation: store an observation episode with admitted_at and discharged_at, or select the latest matching admission event for the current episode.

## 9. [P2] Medication inventory is a calculated placeholder

Evidence: `backend/index.js:1259`, `backend/index.js:1276`; `frontend/src/components/reports/ReportsAnalytics.jsx:123`.

The displayed Paracetamol inventory is `120 - number of matching medication orders`. An order is counted as one tablet regardless of quantity or formulation. Stock receipts, stock adjustments, and actual opening balances are not represented.

Recommendation: implement stock movements and quantities, or remove the inventory claim until real inventory tracking exists.

## 10. [P2] The teacher-notification checkbox does not control email sending

Evidence: `frontend/src/components/patient/PatientChart.jsx:446`; `backend/index.js:272`, `backend/index.js:1131`.

Checkout records the checkbox as teacher_notified, but the email function sends to the adviser whenever an adviser address exists. Unchecking it still sends the email. Checking it can also mark Teacher Notified as Yes when sending fails or runs in simulation.

Recommendation: keep requested notification, send outcome, and acknowledgment as separate fields. Respect the selected preference and derive notification status from the durable email record.

## 11. [P2] Excuse slips have different approval workflows depending on where they are created

Evidence: `backend/index.js:1122`, `backend/index.js:1564`, `backend/index.js:1585`.

Checkout creates an acknowledgment token and dispatches a principal email. The standalone Excuse Slips action creates only a verification hash, stores the slip, and logs it. Its slip remains unacknowledged without an equivalent principal action link.

Recommendation: use one excuse-slip creation service for both entry points, including approval state, token issuance, notification preferences, and delivery tracking.

## 12. [P2] Administrator controls conflict with backend permissions

Evidence: `frontend/src/components/patient/PatientChart.jsx:258`, `frontend/src/components/patient/PatientChart.jsx:794`; `backend/index.js:554`, `backend/index.js:715`, `backend/index.js:1003`.

The patient chart hides clinical edit/check-in controls only for teachers and counselors, so administrators see them. Registration, patient editing, and visit transitions require physician or nurse on the backend. The same admin can perform some other clinical actions that only exclude teachers/counselors, making the policy inconsistent across endpoints.

Recommendation: define an explicit capability matrix for administrative and clinical roles, enforce it centrally, and use the same capabilities to render frontend controls. Decide whether administrators may practice clinically rather than inferring this from a broad "not restricted" check.

## Related email implementation status

The preceding email changes add explicit simulate/Brevo/SMTP modes, mandatory SMTP TLS, durable attempt statuses, guarded retries, awaited sends, and notification outcome feedback. Migrations through `007_departure_approval.sql` have been applied to the project's Neon database. No real emails were sent during this work. The resolution table records the implementation changes and validation limits.
