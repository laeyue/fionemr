# Browser interaction review — October 8, 2026

## Environment and scope

Reviewed the local frontend at http://localhost:5173 using the signed-in development administrator and the in-app browser. Backend configuration was confirmed to target the Neon `development` endpoint. Emails were confirmed simulated in the visible Email Delivery & Responses tab. Production was not modified.

Created one synthetic student: `QA Test Student October 8`, ID `1000`, section `QA Grade 6`. Contact addresses use `example.invalid`. The student and synthetic chart history remain in development for reproduction. Final clinical state: Checked Out; no occupied bed. No real patient information or external messages were used.

## Checks that passed

- Student registration persisted and appeared in the directory with Checked Out status.
- Clinic check-in persisted the complaint and changed status to Checked In.
- Check-in feedback and email logs recorded two simulated notifications (parent and adviser).
- Abnormal synthetic readings (temperature 39, heart rate 120) produced one current patient alert.
- A later normal reading (36.8, heart rate 80, BP 110/70, oxygen 99, respiratory rate 18) cleared that alert.
- A complete SOAP note persisted in the chart workflow.
- Bed admission changed state to Under Observation, occupied one of five beds, removed the patient from admission choices, and began the timer at 0m.
- An observed patient's chart offered Check-Out rather than another check-in.
- Checkout released the bed and removed the patient from the active clinic list.
- Checkout generated an excuse slip. Unchecking teacher notification stored `teacher_notification_requested=false` and displayed Not requested.
- Reports displayed the check-in, no remaining vital alarms, no occupied beds, and Not tracked medication stock.
- Phone layout (390 pixels wide) exposed bottom navigation. Temporary viewport overrides were reset after review.

## Reproduced findings

### 1. P1 — Failed SOAP validation discards the draft

Open the patient's SOAP Notes tab. Enter text only in Subjective and click Save Note. The backend rejects the incomplete note, as confirmed by the captured browser error log. The form clears the text, displays no validation error, and Previous Notes remains empty. This is actual browser reproduction of the earlier source finding.

Expected: display the validation error and preserve all entered fields until successful save.

Evidence: `backend/data/browser-review/soap-validation-loss.png`.

### 2. P1 — Checkout defaults to the previous date

The dashboard displays Thursday, October 8, 2026 in the local Asia/Singapore date. Opening the clinic tracker checkout modal defaults both dates to October 7. The synthetic slip was also ultimately stored with October 7 dates. Attempting to correct dates through automation did not produce a corrected stored result; no separate conclusion about manual date editing is drawn from that attempt.

Expected: use a consistent clinic calendar date for forms and reporting.

Evidence: `backend/data/browser-review/checkout-wrong-date.png`, `backend/data/browser-review/excuse-slip-date.png`. A read-only development database query confirmed the synthetic slip's stored dates.

### 3. P2 — Today's activity feed is empty despite today's actions

After registration, check-in, a vital record, and a SOAP note, the dashboard shows one check-in and a current patient, but selecting Thursday October 8 still leaves the Activity Feed at No activity for this date. This persisted across returning to the dashboard.

Expected: display the events for the selected clinic day. The UI behavior is reproduced; the specific timezone boundary responsible has not been independently isolated.

Evidence: `backend/data/browser-review/dashboard-sent-home.png`.

### 4. P2 — Sent Home reports a departure before checkout

Save a complete SOAP note with disposition Sent Home, without checking the patient out. Returning to the dashboard shows Sent Home: 1 while the same patient's status remains Checked In. That patient could then be admitted to observation. This confirms the metric counts note dispositions rather than completed departures.

Expected: label it as a note disposition count or derive completed departures from the defined checkout workflow.

Evidence: `backend/data/browser-review/dashboard-sent-home.png`.

### 5. P2 — Tablet breakpoint hides all main navigation

At viewport width 850 pixels, the desktop navigation and mobile bottom navigation both have computed display:none and no menu alternative appears. At 1280 and 1440, desktop navigation is present; at 390, bottom navigation is present. The initial observation described this as the default-width problem, but follow-up measurements localized the confirmed problem to the tablet breakpoint.

Expected: expose desktop navigation, bottom navigation, or a menu at every supported viewport width.

Evidence: `backend/data/browser-review/navigation-850.png`.

### 6. P2 — Beds summary opens the patient registry

From the dashboard, click the Beds: 0 summary button. It navigates to `/dashboard/patients`, rather than the bed tracker at `/dashboard/clinic`. The dedicated Clinic navigation button does open the tracker correctly.

Expected: the Beds summary should open the tracker or a clearly relevant bed view.

## Limits

The original interactive review was a smoke review, not a complete release test. It did not exercise all roles, simultaneous admissions, the full five-bed boundary, medication administration, network-failure recovery, real email delivery, public parent response links, or principal-to-security approval delivery. Principal/security recipients were not configured for this test. The fixes below were made and verified afterward.

Full navigation/reload returned to sign-in; the development administrator login was restored. This is recorded as observed behavior, not classified as a defect without an agreed session-persistence requirement.

## Follow-up fixes and verification — October 8, 2026

- **SOAP draft retention:** Submitting only Subjective now displays a validation error and leaves the entered draft intact. Save failures in SOAP and medication order forms are surfaced to the user; entries clear only after a successful save.
- **Clinic dates:** Both checkout date fields showed `2026-10-08` for the clinic's current date. Dashboard day selection and API day ranges now use the same configured clinic timezone (`Asia/Singapore`). No new excuse slip was created during this check.
- **Activity feed:** After restarting the local API to load the changes, the October 8 feed displayed the synthetic student's check-in, notes, vitals, and checkout events.
- **Sent Home count:** The synthetic student received a Sent Home note during a new checked-in visit. The count stayed at 1 before checkout and increased to 2 after checkout.
- **Tablet navigation:** At 873 pixels wide, desktop navigation was hidden and the five-item bottom navigation was visible.
- **Beds shortcut:** The Beds summary opened `/dashboard/clinic` and displayed the clinic bed tracker.
- **Build and backend syntax:** The Vite production build and `node --check backend/index.js` succeeded.

The follow-up used only the existing synthetic development student. The additional check-in and checkout notifications were simulated; no external email was sent. The patient finished Checked Out with no occupied bed. Production was not modified. Medication-order network failure retention was verified by code inspection, not by a browser-simulated failed request.
