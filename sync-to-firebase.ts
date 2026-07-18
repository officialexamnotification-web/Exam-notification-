import * as admin from "firebase-admin";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

// Firebase Admin SDK wrapper functions (same as server.ts)
let adminDb: any = null;
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
          console.warn("[SYNC_TO_FIREBASE] Tried parsing credentials as JSON but failed:", jsonErr.message);
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
          console.warn("[SYNC_TO_FIREBASE] Checked credentials as file path but failed:", fsErr.message);
        }
      }
    }

    if (serviceAccount && serviceAccount.private_key && serviceAccount.private_key.includes("BEGIN PRIVATE KEY")) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
      credential = admin.cert(serviceAccount);
      admin.initializeApp({ credential });
      console.log("[SYNC_TO_FIREBASE] Synchronously initialized Firebase Admin SDK with credentials.");
    } else {
      try {
        credential = admin.applicationDefault();
        admin.initializeApp({ credential });
        console.log("[SYNC_TO_FIREBASE] Synchronously initialized Firebase Admin SDK with application default credentials.");
      } catch (appDefaultErr: any) {
        admin.initializeApp();
        console.log("[SYNC_TO_FIREBASE] Initialized default app without explicit credentials.");
      }
    }
  }
  adminDb = getAdminFirestore();
} catch (e: any) {
  console.log("[SYNC_TO_FIREBASE] Synchronous initialization failed, falling back:", e.message);
}

// Firebase wrapper functions
class AdminDocumentReferenceWrap {
  _ref: any;
  constructor(ref: any) {
    this._ref = ref;
  }
  get id() {
    return this._ref.id;
  }
  get path() {
    return this._ref.path;
  }
}

class AdminDocumentSnapshotWrap {
  _snap: any;
  constructor(snap: any) {
    this._snap = snap;
  }
  exists() {
    return this._snap.exists;
  }
  get id() {
    return this._snap.id;
  }
  data() {
    return this._snap.data();
  }
}

function doc(db: any, collectionName: string, docId: string) {
  const realDb = db?._realDb || db || adminDb;
  if (!realDb) {
    throw new Error("Firestore Admin SDK is not initialized.");
  }
  return new AdminDocumentReferenceWrap(realDb.collection(collectionName).doc(docId));
}

async function getDoc(docRefWrap: any) {
  if (!docRefWrap || !docRefWrap._ref) {
    throw new Error("Invalid document reference wrap.");
  }
  const snap = await docRefWrap._ref.get();
  return new AdminDocumentSnapshotWrap(snap);
}

async function setDoc(docRefWrap: any, data: any, options?: any) {
  if (!docRefWrap || !docRefWrap._ref) {
    throw new Error("Invalid document reference wrap.");
  }
  if (options && options.merge) {
    return await docRefWrap._ref.set(data, { merge: true });
  }
  return await docRefWrap._ref.set(data);
}

async function syncToFirebase() {
  try {
    console.log('[SYNC_TO_FIREBASE] Starting sync from govexam_db.json to Firebase...');
    
    if (!adminDb) {
      console.error("[SYNC_TO_FIREBASE] Firebase Admin SDK not initialized");
      return;
    }
    
    console.log('[SYNC_TO_FIREBASE] Firebase Admin initialized successfully');

    // Read govexam_db.json
    const dbPath = path.join(process.cwd(), 'govexam_db.json');
    const dbData = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    
    console.log(`[SYNC_TO_FIREBASE] Loaded ${dbData.length} jobs from govexam_db.json`);

    let syncCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    // Sync each job to Firebase
    for (const job of dbData) {
      try {
        // Safe document ID for Firebase
        const jobId = job.id || encodeURIComponent(job.path).replace(/\./g, '%2E');
        
        // Check if job already exists in Firebase
        const docRef = doc(adminDb, 'jobs', jobId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const existingData = docSnap.data();
          const existingUpdatedAt = existingData.updatedAt || existingData.createdAt;
          const localUpdatedAt = job.updatedAt || job.createdAt;
          
          // Only update if local version is newer
          if (localUpdatedAt > existingUpdatedAt) {
            await setDoc(docRef, job);
            console.log(`[SYNC_TO_FIREBASE] Updated job: ${job.title} (newer version)`);
            syncCount++;
          } else {
            console.log(`[SYNC_TO_FIREBASE] Skipped job: ${job.title} (Firebase version is newer or same)`);
            skipCount++;
          }
        } else {
          // New job, add to Firebase
          await setDoc(docRef, job);
          console.log(`[SYNC_TO_FIREBASE] Added new job: ${job.title}`);
          syncCount++;
        }
      } catch (error: any) {
        console.error(`[SYNC_TO_FIREBASE] Error syncing job ${job.title}:`, error.message);
        errorCount++;
      }
    }
    
    console.log(`[SYNC_TO_FIREBASE] Sync completed:`);
    console.log(`  - Added/Updated: ${syncCount} jobs`);
    console.log(`  - Skipped: ${skipCount} jobs`);
    console.log(`  - Errors: ${errorCount} jobs`);
    
    return { syncCount, skipCount, errorCount };
  } catch (error: any) {
    console.error('[SYNC_TO_FIREBASE] Error:', error.message);
    throw error;
  }
}

syncToFirebase()
  .then((result) => {
    console.log(`[SYNC_TO_FIREBASE] Completed! Result:`, result);
    process.exit(0);
  })
  .catch((error) => {
    console.error('[SYNC_TO_FIREBASE] Failed:', error);
    process.exit(1);
  });
