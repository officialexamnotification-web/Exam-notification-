import * as admin from "firebase-admin";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

async function fetchJobsFromFirebase() {
  try {
    console.log('[FETCH_JOBS] Starting to fetch jobs from Firebase...');
    
    // Initialize Firebase Admin
    let credential;
    const creds = process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '';
    let serviceAccount: any = null;

    if (creds) {
      const trimmed = creds.trim();
      if (trimmed.startsWith('{')) {
        try {
          serviceAccount = JSON.parse(trimmed);
        } catch (jsonErr: any) {
          console.error("[FETCH_JOBS] Failed to parse credentials as JSON:", jsonErr.message);
          return;
        }
      } else {
        try {
          if (fs.existsSync(trimmed)) {
            const fileContent = fs.readFileSync(trimmed, 'utf8');
            if (fileContent.trim().startsWith('{')) {
              serviceAccount = JSON.parse(fileContent);
            }
          }
        } catch (fsErr: any) {
          console.error("[FETCH_JOBS] Failed to read credentials file:", fsErr.message);
          return;
        }
      }
    }

    if (serviceAccount && serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
      credential = admin.cert(serviceAccount);
    } else {
      console.error("[FETCH_JOBS] Invalid service account credentials");
      return;
    }

    if (!admin.getApps().length) {
      admin.initializeApp({ credential });
    }

    const db = getAdminFirestore();
    console.log('[FETCH_JOBS] Firebase Admin initialized successfully');

    // Fetch all jobs from Firestore
    console.log('[FETCH_JOBS] Fetching jobs from Firestore...');
    const jobsCollection = db.collection('jobs');
    const snapshot = await jobsCollection.get();
    
    console.log(`[FETCH_JOBS] Found ${snapshot.docs.length} jobs in Firestore`);

    const jobs: any[] = [];
    snapshot.forEach((doc) => {
      const jobData = doc.data();
      jobs.push({
        id: doc.id,
        ...jobData
      });
    });

    console.log(`[FETCH_JOBS] Successfully fetched ${jobs.length} jobs`);

    // Save to govexam_db.json
    const outputPath = path.join(process.cwd(), 'govexam_db.json');
    fs.writeFileSync(outputPath, JSON.stringify(jobs, null, 2));
    console.log(`[FETCH_JOBS] Saved ${jobs.length} jobs to ${outputPath}`);

    return jobs.length;
  } catch (error: any) {
    console.error('[FETCH_JOBS] Error:', error.message);
    throw error;
  }
}

fetchJobsFromFirebase()
  .then((count) => {
    console.log(`[FETCH_JOBS] Completed! Fetched ${count} jobs.`);
    process.exit(0);
  })
  .catch((error) => {
    console.error('[FETCH_JOBS] Failed:', error);
    process.exit(1);
  });
