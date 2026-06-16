# OLPHA AeroHealth EMR System — User Guide & System Manual

Welcome to the **OLPHA AeroHealth EMR System** user guide. This document provides comprehensive, step-by-step instructions on how to run, navigate, and utilize the EMR system.

OLPHA AeroHealth replaces manual school clinic paperwork (logbooks, paper excuse slips, gate permits, phone calls) with digital automation, instantly notifying parents, homeroom advisers, the principal, and gate security of clinical events.

---

## 1. Getting Started & Setup

### Running the App Locally
The project is divided into a Node.js Express backend and a React Vite frontend.

1. **Start Backend Service**:
   ```powershell
   cd backend
   npm install
   npm start
   ```
   *Runs by default on `http://localhost:5000`*

2. **Start Frontend Server**:
   ```powershell
   cd frontend
   npm install
   npm run dev
   ```
   *Runs by default on `http://localhost:5173`*

---

## 2. Credentials & Role-Based Access Control (RBAC)

The system enforces strict Role-Based Access Control to comply with student medical privacy policies.

### Seed Accounts (Password: `password123`)

| Role | Email | Permissions |
| :--- | :--- | :--- |
| **Physician** | `doctor@aerohealth.com` | Full clinical access, SOAP notes, vitals, meds, check-in, checkout, bed management. |
| **Nurse** | `nurse@aerohealth.com` | Full clinical access, SOAP notes, vitals, meds, check-in, checkout, bed management. |
| **Teacher** | `teacher@aerohealth.com` | Read-only. Can search students, view checkout logs and active excuse slips. Cannot view medical histories, SOAP notes, or check out students. |
| **Counselor** | `counselor@aerohealth.com` | Read-only. Access restricted to general checkout logs and active excuse slips. |
| **Admin** | `admin@aerohealth.com` | Access to system settings, customization, and logs. |

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
5. Confirm checkout. This triggers the following automated email notifications in a secure transaction:
   - **Parent Email**: Excused departure alert.
   - **Homeroom Adviser Email**: Excused absence alert.
   - **Principal Email**: Excuse slip approval request containing details and a single-click stamp/acknowledgment link.
   - **Security Guard Email**: Gate clearance permit containing the verification hash and student details, allowing them to pass through the campus exit.
6. The excuse slip is generated with a secure, unique **Verification Hash** (e.g. `1A2B3C4D5E`), which the guard or principal can use to verify the validity of the excuse certificate online.

---

## 4. Notifications & Outbound Logger
During development and simulation:
* Since outbound email servers might be simulated, you can view all triggered links and logs directly in:
  - The **Alerts** tab inside the application dashboard (displays a timeline of adviser responses and alerts).
  - The **terminal console output** of the backend server (prints simulation URLs for Principal approval and Gate Security clearance actions).
