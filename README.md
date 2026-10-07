# OLPHA AeroHealth EMR System — User Guide & System Manual

Welcome to the **OLPHA AeroHealth EMR System** user guide. This document provides comprehensive, step-by-step instructions on how to run, navigate, and utilize the EMR system.

OLPHA AeroHealth manages school clinic records, visit transitions, excuse slips, and tracked email notifications. Principal departure approval and clinic checkout are separate steps; security clearance requires both.

---

## 1. Getting Started & Setup

### Running the App Locally
The project uses a Node.js Express backend, a React Vite frontend, and Neon PostgreSQL. Neon is required for both local development and deployment. Set `DATABASE_URL` in `backend/.env` to your pooled Neon connection URL with TLS enabled (`sslmode=verify-full` recommended). Copy `backend/.env.example` only if `.env` does not already exist. The backend rejects missing or non-Neon connections and has no local database fallback.

1. **Start Backend Service**:
   ```powershell
   cd backend
   npm.cmd install
   npm.cmd start
   ```
   *Runs by default on `http://localhost:5000` and applies migrations to the configured Neon database at startup. It does not create demo accounts.*

2. **Start Frontend Server**:
   ```powershell
   cd frontend
   npm.cmd install
   npm.cmd run dev
   ```
   *Runs by default on `http://localhost:5173`*

`docker compose up --build` starts the frontend and backend using the Neon settings in `backend/.env`. It does not start a PostgreSQL container or create a database volume. Internet access to Neon is required; a connection failure never switches storage to a local database.

Outbound email is simulated by default, even if credentials exist in the environment. Choose a delivery mode explicitly:

- `EMAIL_MODE=simulate`: records attempts without sending external email.
- `EMAIL_MODE=brevo`: sends through Brevo's HTTPS API. Configure `BREVO_API_KEY`, a verified `SENDER_EMAIL`, and `SENDER_NAME`. This avoids SMTP connections in Vercel functions.
- `EMAIL_MODE=smtp`: configure `SMTP_HOST`, `SMTP_PORT` (587 by default, or 465 for implicit TLS), `SMTP_USER`, `SMTP_PASS`, and `SENDER_EMAIL`. SMTP uses mandatory TLS and certificate verification. A Brevo API key cannot substitute for an SMTP key.

Set `BACKEND_URL` to the backend's public HTTPS origin so email action links work outside your computer. Configure principal and security recipients in Clinic Settings; empty recipients are skipped. Parent and adviser addresses come from each patient record. No placeholder principal or security addresses are used.

Every check-in, checkout, principal, and security email attempt is recorded in **Alerts → Email Delivery & Responses**. `accepted` means the provider accepted the message, not that it reached the recipient's inbox. Recipient acknowledgment is tracked separately. Provider rejection, simulation, and uncertain acceptance are shown explicitly. Confirmed failures can be retried within 24 hours, up to three total attempts; uncertain sends require checking the provider logs to avoid duplicates. The clinical record is saved even when notification delivery fails. The Notify Parent action sends email without creating another clinic visit.

Run `npm run db:migrate` from `backend` to apply schema updates. Set `DATABASE_URL_UNPOOLED` for Neon migrations; `DATABASE_URL` remains the pooled runtime connection. Email delivery configuration never exposes credentials through the API. Live sending should only be enabled after validating recipients and the sender domain. No email provider webhooks are configured, so automatic bounce/inbox-delivery tracking is not available.

Create the first administrator account in an interactive terminal after configuring the Neon connection:
```powershell
cd backend
npm.cmd run admin:create
```
The command prompts for the administrator's name, email, and a password of at least 15 characters. Public signup is disabled. An administrator can provision staff accounts with `POST /api/auth/register` using an authenticated session.

### Deploying to Vercel
Deploy this repository as two Vercel projects. This project is a monorepo with separate frontend and backend apps.

1. Import the GitHub repository as a Vercel project with **Root Directory** set to `backend`. Vercel detects the Express app. Add these backend environment variables:
   - `DATABASE_URL`: pooled Neon PostgreSQL connection URL with TLS enabled. Required in every environment.
   - `PG_POOL_SIZE=1`: limits open database connections per function instance. Use a provider's pooled connection string when available.
   - `EMAIL_MODE=simulate`
   - To enable Brevo after its API key and sender are verified, change `EMAIL_MODE` to `brevo` and add `BREVO_API_KEY` as a sensitive backend environment variable, `SENDER_EMAIL` as an active verified sender in Brevo, and `SENDER_NAME` (for example, `OLPHA AeroHealth Clinic`). Keep these values out of the frontend project and source control.
   - `CORS_ORIGIN`: the deployed frontend origin, such as `https://your-frontend.vercel.app` (comma-separate preview origins if needed).
   - `BACKEND_URL`: the backend's deployed origin, such as `https://your-backend.vercel.app`, for email action links. If omitted, the backend uses Vercel's deployment URL.
2. Import the same GitHub repository again as another Vercel project with **Root Directory** set to `frontend`. Vercel detects Vite and uses the included SPA rewrite so direct navigation to app routes works. Set `VITE_API_URL` to `https://your-backend.vercel.app/api`, then deploy.
3. After the frontend deployment has a URL, set that exact origin in the backend's `CORS_ORIGIN` variable and redeploy the backend.

The backend applies SQL migrations when it receives its first request on Vercel. The Vercel configuration includes the migration files in the function bundle. Set `CORS_ORIGIN` to the exact frontend origin. Set `DATABASE_URL` to Neon, then run `npm run admin:create` from `backend` with that same connection string to provision the first administrator. The migration disables the legacy demo accounts and removes MFA columns.

Sign-in uses email and password only, as configured for this project. API requests use server-issued sessions; staff roles come from database account records, and login attempts are rate limited. Passwords must be at least 15 characters. Public self-registration is disabled.

**This software configuration does not by itself establish readiness for real patient information or certify compliance.** Before using real records, complete and document an organizational risk assessment, configure and verify database and hosting encryption, set up backups and test restoration, review vendor agreements and required business associate agreements, and confirm the organization's access, incident response, and retention procedures. Keep outbound email in simulation until recipient authorization and content handling have been reviewed.

### Neon environments

The `fionemr` Neon project has two environments:

| Environment | Neon branch | Purpose |
|---|---|---|
| Production | `main` | Existing database and records; use its connection in Vercel Production only. |
| Development | `development` | Schema-only testing environment; local `backend/.env` points here. |

The original production configuration is preserved in ignored `backend/.env.neon-production`; development settings are in ignored `backend/.env.neon-development`. Both contain secrets and must never be committed or shared. Updating local settings does not update Vercel environment variables. For Vercel Preview/Development, use the development connection; retain the main connection for Production. Development email uses simulation.

Development starts with no patient records or accounts. Run `npm run seed:dev` from `backend` to seed an administrator, physician, nurse, teacher, and guidance counselor, each with a generated password. Credentials are saved in ignored `backend/.dev-accounts.json`. The seeder accepts only this project's development endpoint, rejects production execution, and never resets existing passwords. Alternatively, run `npm run admin:create` to provision only an administrator. Do not copy production patient data into development. Automated tests still require their own disposable database via `TEST_DATABASE_URL`, separate from the local app database.

### Backend Checks
The backend test suite requires `TEST_DATABASE_URL` pointing to a separate disposable Neon database or branch containing no real patient data. It writes synthetic records; reset that test database between runs. Tests refuse missing test URLs and connections to the configured app database, including pooled/direct variants:
```powershell
cd backend
npm.cmd test
```

---
## 2. Credentials & Role-Based Access Control (RBAC)

API access is authenticated and role checks are enforced on the server. Physicians, nurses, and administrators have clinical-management capabilities, including registration, demographics, visit transitions, and bed assignment. Administrators also manage staff and retention. Teachers and counselors receive a limited directory view and cannot change clinical records.

Visit transitions are enforced on the server: Checked Out → Checked In → Under Observation → Checked In, with checkout permitted from Checked In or Under Observation. The clinical change and its logs commit together. Demographic edits cannot change visit state. Browser requests include an idempotency key so retries after an uncertain response return the recorded action instead of creating another visit or slip. Request records follow patient/account deletion through database foreign keys.

Bed capacity is enforced on the backend and defaults to five (`CLINIC_BED_CAPACITY`). Observation durations start at bed admission. Current clinical alarms use the latest vital-sign record from each active visit. Reports distinguish loading failures from successful empty results. Medication inventory is not tracked; no estimated tablet stock is displayed.

### Account Provisioning

There are no built-in staff accounts or shared default passwords. Create the first administrator using `npm run admin:create`; then sign in and create additional accounts through the authenticated registration endpoint. Use unique staff accounts and remove access when staff no longer need it.

---

## 3. Core Workflows & Clinical Features

### 3.1 Registry & Directory Flow
The **Patients** navigation tab is divided into a clean, dual-view registry system:

#### Active Checked-In Patients
* Shows only the students **currently sitting in the clinic** (`status === 'Checked In'`).
* Displays their **Patient ID**, **Name**, **Classroom/Section**, **Age**, and **Chief Complaint** (pulled dynamically from their check-in log).
* Provides a quick **View Chart** action.

#### Student Directory
* Displays the master roster of **all students** enrolled in the school.
* Displays their general information and active clinic status (with colored status badges).
* **Register Student**: Adds a new student record to the directory.
  - *Clinical Note: To maintain privacy, registration only asks for demographic and emergency contact details, completely omitting medical details (like allergies/conditions) or immediate check-in configuration.*
* **Quick Check-In**: Next to each student row is a **Check-In** button.
  - Click **Check-In** to open the Check-In modal.
  - Enter the student's **Chief Complaint** (e.g. "fever", "severe stomach pain") and submit.
  - You will be immediately redirected to the student's clinical chart page.

---

### 3.2 Clinical Charting & SOAP Documentation
From a student's chart page, nurses and physicians can manage and record clinical data across tabs:

* **Overview**: Displays demographics, Emergency Contact, parental contact, and critical alerts.
* **SOAP Notes**: Record clinical progress notes:
  - **Subjective (S)**: The student's complaint and symptoms in their own words.
  - **Objective (O)**: Observable signs (vitals, exams).
  - **Assessment (A)**: Clinical diagnosis or assessment.
  - **Plan (P)**: Treatments, medications, actions.
  - **Disposition**: Select where the student is going (e.g. *Returned to Class*, *Sent Home*, *Admitted to Bed*, *Referred to Hospital*).
* **Orders**: Administer medications from the clinic stock (e.g. Paracetamol, Ibuprofen) with strength, form (tablet, syrup), route, and parent consent confirmation.
* **Visit Log**: Comprehensive audit trail of all actions performed on this student record (views, vitals, admissions, checkouts).
* **Excuse Slips**: List of active and archived medical excuses.

---

### 3.3 Bed Observation & Tracker
The **Clinic** tab provides a real-time board for monitoring the clinic's observation beds:

* **Live Bed Occupants**: Displays students currently lying in beds, their class section, and their **exact elapsed observation duration** (automatically updating in real-time).
* **Bed Admission**:
  - Select any student currently checked into the clinic from the quick admission dropdown and click **Admit to Bed**.
  - Their status changes to `Under Observation`.
* **Release Bed**:
  - Releases the bed once the student is ready to stand up, returning their status to `Checked In`.
  - The student remains checked into the clinic registry (useful if they are waiting for a pick-up).
* **Check-Out from Bed**:
  - Checks the student out of the clinic entirely, releasing the bed in a single click.
  - Automatically pops up the **Unified Checkout Modal** (pre-filling the excuse reason from the check-in logs).

---

### 3.4 Excuse Slips & Automated Email Notifications
When checking out a student from the clinic (either from their Chart page or directly from the Bed tracker):

1. Click **Check-Out Student**.
2. The **Unified Checkout Modal** appears.
3. The **Excuse Reason** is automatically pre-filled with their check-in Chief Complaint to eliminate double data entry.
4. Set the **Excuse Period** (Start Date & End Date) and toggle teacher notification.
5. Confirm checkout. Depending on the configured recipients, the system can send these notifications:
   - **Parent Email**: Clinic visit-ended notification; this does not authorize departure from school.
   - **Homeroom Adviser Email**: Sent when teacher notification is requested. The slip displays the email outcome, including simulation or failure.
   - **Principal Email**: Explicit departure approval request with a one-use link that expires after seven days. Standalone excuse slips use this same workflow.
   - **Security Guard Email**: Sent only after principal approval and a matching checkout, while the slip is applicable. Duplicate sends and retries for obsolete clearance are blocked.
6. Each excuse slip has a random verification value. Keep outbound email disabled or simulated until your organization has approved the recipients and workflow for patient information.

---

## 4. Notifications & Outbound Logger
During development and simulation:
* Since outbound email servers might be simulated, you can view all triggered links and logs directly in:
  - The **Alerts** tab inside the application dashboard (displays a timeline of adviser responses and alerts).
  - The email delivery log, which distinguishes simulated sends, provider acceptance, failures, and uncertain outcomes. Bearer action URLs are not printed to the backend console.

Parent/adviser response links open a confirmation form; only an explicit POST records a response. Links expire after seven days, and a submitted response cannot be silently overwritten by reopening a link.
