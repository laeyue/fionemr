const http = require('http');

const API_BASE = 'http://localhost:5000/api';

function request(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = `${API_BASE}${path}`;
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-User-Email': 'dev@fiona.com',
        'X-User-Role': 'physician',
        'X-User-Name': 'Developer Tester'
      },
    };

    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject({ status: res.statusCode, error: parsed.error || parsed });
          } else {
            resolve({ status: res.statusCode, data: parsed });
          }
        } catch (e) {
          if (res.statusCode >= 400) {
            reject({ status: res.statusCode, error: data });
          } else {
            resolve({ status: res.statusCode, data });
          }
        }
      });
    });

    req.on('error', (err) => { reject(err); });
    if (body) { req.write(JSON.stringify(body)); }
    req.end();
  });
}

async function runTests() {
  console.log('=== STARTING EMAIL ALERTS & ACTIVE CONFIRMATION VERIFICATION ===');

  try {
    // 1. Register student with parent/adviser emails
    console.log('\n[1] Registering a new student with targeted emails...');
    const patientData = {
      name: 'Verification Student',
      section: 'Grade 6-A',
      age: 11,
      gender: 'Female',
      status: 'Active',
      date_of_birth: '2015-05-10',
      grade_level: 'Grade 6',
      allergies: 'None',
      chronic_conditions: 'None',
      emergency_contact_name: 'Mr. Verification Parent',
      emergency_contact_phone: '555-9999',
      emergency_contact_relationship: 'Father',
      parent_email: 'parent.verify@example.com',
      adviser_name: 'Teacher Sarah',
      adviser_email: 'teacher@fiona.com',
      graduation_year: 2027
    };
    const regPatient = await request('/patients', 'POST', patientData);
    console.log('Student registered successfully.');
    const patientId = regPatient.data.data.id;

    // 2. Log student check-in
    console.log(`\n[2] Checking in student ID: ${patientId} due to fever...`);
    const checkin = await request(`/patients/${patientId}/checkin`, 'POST', {
      chief_complaint: 'Student has a sudden fever of 38.5C'
    });
    console.log('Check-in log recorded:', checkin.data);

    // Wait a brief moment for async mail triggers to complete
    await new Promise(resolve => setTimeout(resolve, 500));

    // 3. Fetch email alert logs to confirm the alerts were recorded
    console.log('\n[3] Fetching active email logs...');
    const logsRes = await request('/notifications/logs');
    const logs = logsRes.data.data;
    
    // Find alerts matching our student
    const studentAlerts = logs.filter(l => l.patient_id === patientId);
    console.log(`Found ${studentAlerts.length} email alerts for the student.`);
    
    if (studentAlerts.length !== 2) {
      throw new Error(`Expected exactly 2 email alerts (parent and adviser), but found ${studentAlerts.length}`);
    }

    const parentAlert = studentAlerts.find(l => l.recipient_type === 'parent');
    const adviserAlert = studentAlerts.find(l => l.recipient_type === 'adviser');

    console.log('Parent Email Alert Details:');
    console.log(`- Email: ${parentAlert.recipient_email}`);
    console.log(`- Subject: ${parentAlert.subject}`);
    console.log(`- Status: ${parentAlert.acknowledged ? 'ACKED' : 'PENDING'}`);

    console.log('Adviser Email Alert Details:');
    console.log(`- Email: ${adviserAlert.recipient_email}`);
    console.log(`- Subject: ${adviserAlert.subject}`);
    console.log(`- Status: ${adviserAlert.acknowledged ? 'ACKED' : 'PENDING'}`);

    if (parentAlert.acknowledged || adviserAlert.acknowledged) {
      throw new Error('Expected new email alerts to have acknowledged = false');
    }

    // 4. Simulate Parent Acknowledgment ("On My Way")
    console.log(`\n[4] Simulating Parent Active Response click ("On My Way") for Alert ID: ${parentAlert.id}...`);
    // Using node's http directly to request the HTML confirmation page
    const respondRes = await request(`/notifications/respond?alertId=${parentAlert.id}&response=On%20My%20Way`);
    console.log('Response confirmed page received (HTML characters length):', respondRes.data.length);

    // 5. Re-fetch email alert logs to verify status and receipt timestamp
    console.log('\n[5] Re-fetching active email logs to verify timestamp and status...');
    const updatedLogsRes = await request('/notifications/logs');
    const updatedLogs = updatedLogsRes.data.data;
    const updatedParentAlert = updatedLogs.find(l => l.id === parentAlert.id);

    console.log('Updated Parent Alert Details:');
    console.log(`- Acknowledged: ${updatedParentAlert.acknowledged}`);
    console.log(`- Response Status: ${updatedParentAlert.response_status}`);
    console.log(`- Acknowledged At: ${updatedParentAlert.acknowledged_at}`);

    if (updatedParentAlert.acknowledged !== true) {
      throw new Error('Expected alert to be marked acknowledged = true');
    }
    if (updatedParentAlert.response_status !== 'On My Way') {
      throw new Error('Expected alert response status to be "On My Way"');
    }
    if (!updatedParentAlert.acknowledged_at) {
      throw new Error('Expected alert to have a valid acknowledgment timestamp');
    }

    console.log('\n=== ALL EMAIL ACTIVE RESPONSE & TRACKING TESTS PASSED SUCCESSFULLY ===');
  } catch (err) {
    console.error('\n!!! VERIFICATION TEST FAILED !!!');
    console.error(err);
    process.exit(1);
  }
}

runTests();
