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
      console.log("[FIREBASE_ADMIN] Initialized Firebase Admin SDK for date fixing.");
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

function getTrueYear(title: string, url: string, content: string): number | null {
  // 1. Try to find year in title
  const titleMatch = title.match(/\b(2018|2019|2020|2021|2022|2023|2024|2025|2026)\b/);
  if (titleMatch) {
    return parseInt(titleMatch[1]);
  }

  // 2. Try to find year in URL
  const urlMatch = url.match(/\b(2018|2019|2020|2021|2022|2023|2024|2025|2026)\b/);
  if (urlMatch) {
    return parseInt(urlMatch[1]);
  }

  // 3. Look for dates or years in the content
  if (content) {
    const dateMatches = content.match(/\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.](2018|2019|2020|2021|2022|2023|2024|2025|2026)\b/g);
    if (dateMatches) {
      const years = dateMatches.map(m => {
        const match = m.match(/\b(2018|2019|2020|2021|2022|2023|2024|2025|2026)\b/);
        return match ? parseInt(match[1]) : null;
      }).filter(y => y !== null) as number[];

      if (years.length > 0) {
        const counts: any = {};
        let maxYear = years[0];
        let maxCount = 0;
        for (const y of years) {
          counts[y] = (counts[y] || 0) + 1;
          if (counts[y] > maxCount) {
            maxCount = counts[y];
            maxYear = y;
          }
        }
        return maxYear;
      }
    }

    // Direct standalone year search in content (excluding 2026 unless it's dominant)
    const contentYears = content.match(/\b(2018|2019|2020|2021|2022|2023|2024|2025)\b/g);
    if (contentYears && contentYears.length > 0) {
      const counts: any = {};
      let maxYear = parseInt(contentYears[0]);
      let maxCount = 0;
      for (const yStr of contentYears) {
        const y = parseInt(yStr);
        counts[y] = (counts[y] || 0) + 1;
        if (counts[y] > maxCount) {
          maxCount = counts[y];
          maxYear = y;
        }
      }
      return maxYear;
    }
  }

  return null;
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

  console.log(`Analyzing and updating years for ${data.length} items...`);
  let updatedCount = 0;

  for (const job of data) {
    const originalDateStr = job.postDate || job.createdAt || job.updatedAt || new Date().toISOString();
    const originalDate = new Date(originalDateStr);
    
    if (isNaN(originalDate.getTime())) {
      continue;
    }

    const trueYear = getTrueYear(job.title, job.path || job.url || '', job.content || '');

    if (trueYear && trueYear !== originalDate.getFullYear()) {
      // Construct a new date keeping the original month, day, hour, etc. but updating the year
      const newDate = new Date(originalDate);
      newDate.setFullYear(trueYear);
      
      const newDateStr = newDate.toISOString();
      console.log(`[YEAR UPDATE] "${job.title}" | True Year: ${trueYear} | ${originalDateStr} -> ${newDateStr}`);
      
      job.postDate = newDateStr;
      job.createdAt = newDateStr;
      job.updatedAt = newDateStr;
      job.scrapedAt = newDateStr;
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
            postDate: newDateStr,
            createdAt: newDateStr,
            updatedAt: newDateStr,
            scrapedAt: newDateStr
          });
          console.log(`[FIRESTORE SYNCED] Updated year for doc ${cleanId}`);
        } catch (fsErr: any) {
          console.error(`[FIRESTORE ERROR] Failed to update year for ${job.title}:`, fsErr.message);
        }
      }
    }
  }

  if (updatedCount > 0) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    console.log(`Successfully fixed years for ${updatedCount} items in local database govexam_db.json.`);
  } else {
    console.log("No year mismatches found.");
  }
}

main();
