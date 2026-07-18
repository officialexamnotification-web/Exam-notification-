import * as fs from 'fs';
import * as path from 'path';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const DB_PATH = path.join(process.cwd(), 'govexam_db.json');

// Initialize Firebase Admin SDK
let db: any = null;
try {
  if (!admin.getApps().length) {
    let credential;
    const creds = process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '';
    let serviceAccount: any = null;

    if (creds) {
      const trimmed = creds.trim();
      if (trimmed.startsWith('{')) {
        try {
          serviceAccount = JSON.parse(trimmed);
        } catch (jsonErr: any) {
          console.warn("[FIREBASE_ADMIN] Tried parsing credentials as JSON but failed:", jsonErr.message);
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
          console.warn("[FIREBASE_ADMIN] Checked credentials as file path but failed:", fsErr.message);
        }
      }
    }

    if (serviceAccount && serviceAccount.private_key && serviceAccount.private_key.includes("BEGIN PRIVATE KEY")) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
      credential = admin.cert(serviceAccount);
      admin.initializeApp({ credential });
      console.log("[FIREBASE_ADMIN] Initialized Firebase Admin SDK for cleanup.");
    } else {
      try {
        credential = admin.applicationDefault();
        admin.initializeApp({ credential });
        console.log("[FIREBASE_ADMIN] Initialized Firebase Admin with App Default.");
      } catch (appDefaultErr: any) {
        admin.initializeApp();
        console.log("[FIREBASE_ADMIN] Initialized default app without credentials.");
      }
    }
  }
  db = getFirestore();
} catch (fbErr: any) {
  console.error("Firebase admin init failed:", fbErr.message);
}

function determineCategory(title: string, pathUrl: string, currentCategory: string): string {
  const text = (title + ' ' + pathUrl).toLowerCase();

  // 1. Syllabus / Exam Pattern (Highest priority for these keywords)
  if (text.includes('syllabus') || text.includes('exam pattern') || text.includes('exam-pattern')) {
    return 'syllabus';
  }

  // 2. Calendar / Time Table
  if (text.includes('calendar') || text.includes('time table') || text.includes('time-table') || text.includes('timetable') || text.includes('exam schedule') || text.includes('exam-schedule')) {
    return 'calendar';
  }

  // 3. Documents / Certificate Verification
  if (text.includes('document upload') || text.includes('document verification') || text.includes('certificate verification') || text.includes('dv document') || text.includes('dv-document')) {
    return 'documents';
  }

  // 4. Answer Key
  if (text.includes('answer key') || text.includes('answer-key') || text.includes('answer_key')) {
    return 'answer-key';
  }

  // 5. Admit Card
  if (text.includes('admit card') || text.includes('admit-card') || text.includes('hall ticket') || text.includes('call letter')) {
    return 'admit-card';
  }

  // 6. Result
  if (text.includes('result') || text.includes('marks') || text.includes('score card') || text.includes('scorecard') || text.includes('cutoff') || text.includes('cut-off')) {
    return 'result';
  }

  // 7. Admission
  if (text.includes('admission') || text.includes('entrance test') || text.includes('counseling') || text.includes('counselling')) {
    return 'admission';
  }

  // 8. Latest Job (Fallback)
  if (text.includes('online form') || text.includes('recruitment') || text.includes('vacancy') || text.includes('bharti') || text.includes('apply online') || text.includes('apprentice') || text.includes('constable') || text.includes('officer')) {
    return 'latest-job';
  }

  // If no match, return current category
  return currentCategory;
}

async function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.error("No database file found.");
    return;
  }

  const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  if (!Array.isArray(data)) {
    console.error("Invalid database format.");
    return;
  }

  console.log(`Analyzing ${data.length} items...`);
  let updatedCount = 0;

  for (const job of data) {
    const oldCat = job.category;
    const newCat = determineCategory(job.title, job.path || job.url || '', oldCat);

    if (oldCat !== newCat) {
      console.log(`[UPDATE] "${job.title}" | Path: ${job.path || job.url} | ${oldCat} -> ${newCat}`);
      job.category = newCat;
      job.updatedAt = new Date().toISOString();
      updatedCount++;

      // Sync with Firestore if db is active
      if (db) {
        try {
          const pathName = job.path || job.url;
          let cleanId = pathName.replace(/\//g, '_');
          if (cleanId.startsWith('_')) cleanId = cleanId.substring(1);
          if (cleanId.endsWith('_')) cleanId = cleanId.substring(0, cleanId.length - 1);
          if (!cleanId) cleanId = job.id;

          await db.collection('jobs').doc(cleanId).update({
            category: newCat,
            updatedAt: job.updatedAt
          });
          console.log(`[FIRESTORE SYNCED] Updated doc ${cleanId} to ${newCat}`);
        } catch (fsErr: any) {
          console.error(`[FIRESTORE ERROR] Failed to update category for ${job.title}:`, fsErr.message);
        }
      }
    }
  }

  if (updatedCount > 0) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    console.log(`Successfully updated ${updatedCount} items in local database govexam_db.json.`);
  } else {
    console.log("No category mismatches found.");
  }
}

main();
