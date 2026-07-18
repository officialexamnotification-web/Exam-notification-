import * as fs from 'fs';
import * as path from 'path';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import dotenv from 'dotenv';
import * as cheerio from 'cheerio';

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
      console.log("[FIREBASE_ADMIN] Initialized Firebase Admin SDK for post date fix.");
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

  console.log(`Analyzing and fixing post dates for ${data.length} items...`);
  let updatedCount = 0;

  for (const job of data) {
    let originalDateStr = job.postDate;
    let extractedDateStr = '';

    if (job.content) {
      try {
        const $ = cheerio.load(job.content);
        // Find the <time> tag with class entry-date or datetime attribute
        const timeEl = $('time.entry-date, time');
        const datetime = timeEl.attr('datetime');
        
        if (datetime) {
          extractedDateStr = datetime.trim();
        } else {
          // Fallback: try regex in content
          const match = job.content.match(/datetime="([^"]+)"/i);
          if (match && match[1]) {
            extractedDateStr = match[1].trim();
          }
        }
      } catch (err: any) {
        console.error(`Error parsing cheerio content for ${job.title}:`, err.message);
      }
    }

    // If we extracted a date and it's different or more precise than postDate
    if (extractedDateStr && extractedDateStr !== originalDateStr) {
      // Validate that it's a valid date
      const d = new Date(extractedDateStr);
      if (!isNaN(d.getTime())) {
        console.log(`[DATE FIX] "${job.title}" | Old: ${originalDateStr} -> New: ${extractedDateStr}`);
        job.postDate = extractedDateStr;
        // Also align createdAt/updatedAt/scrapedAt to have consistent chronology
        job.createdAt = extractedDateStr;
        job.scrapedAt = extractedDateStr;
        job.updatedAt = extractedDateStr;
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
              postDate: extractedDateStr,
              createdAt: extractedDateStr,
              scrapedAt: extractedDateStr,
              updatedAt: extractedDateStr
            });
            console.log(`[FIRESTORE SYNCED] Updated post dates for doc ${cleanId}`);
          } catch (fsErr: any) {
            console.error(`[FIRESTORE ERROR] Failed to update post date for ${job.title}:`, fsErr.message);
          }
        }
      }
    }
  }

  if (updatedCount > 0) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    console.log(`Successfully fixed post dates for ${updatedCount} items in local database govexam_db.json.`);
  } else {
    console.log("No post date updates required or possible.");
  }
}

main();
