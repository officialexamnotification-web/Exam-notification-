import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from 'url';
import multer from 'multer';
import dotenv from 'dotenv';
import * as cheerio from 'cheerio';
import Groq from 'groq-sdk';
import * as admin from "firebase-admin";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";

// Load environment variables from .env file immediately so they are available for initialization
dotenv.config();

// Initialize Firebase Admin SDK synchronously
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
      console.log("[FIREBASE_ADMIN] Synchronously initialized Firebase Admin SDK with credentials.");
    } else {
      try {
        credential = admin.applicationDefault();
        admin.initializeApp({ credential });
        console.log("[FIREBASE_ADMIN] Synchronously initialized Firebase Admin SDK with application default credentials.");
      } catch (appDefaultErr: any) {
        admin.initializeApp();
        console.log("[FIREBASE_ADMIN] Initialized default app without explicit credentials.");
      }
    }
  }
  adminDb = getAdminFirestore();
} catch (e: any) {
  console.log("[FIREBASE_ADMIN] Synchronous initialization failed, falling back:", e.message);
}

// --- Firebase Web-to-Admin Compatibility Layer ---
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
  get id() {
    return this._snap.id;
  }
  get ref() {
    return new AdminDocumentReferenceWrap(this._snap.ref);
  }
  exists() {
    return this._snap.exists;
  }
  data() {
    return this._snap.data();
  }
}

class AdminQuerySnapshotWrap {
  _snap: any;
  docs: AdminDocumentSnapshotWrap[];
  constructor(snap: any) {
    this._snap = snap;
    this.docs = snap.docs.map((d: any) => new AdminDocumentSnapshotWrap(d));
  }
  get size() {
    return this.docs.length;
  }
  forEach(callback: (doc: AdminDocumentSnapshotWrap) => void) {
    this.docs.forEach(callback);
  }
}

class AdminCollectionReferenceWrap {
  _ref: any;
  constructor(ref: any) {
    this._ref = ref;
  }
}

function initializeApp(config: any) {
  return {};
}

function getFirestore(app?: any) {
  return adminDb;
}

function doc(db: any, collectionName: string, docId: string) {
  const realDb = db?._realDb || db || adminDb;
  if (!realDb) {
    throw new Error("Firestore Admin SDK is not initialized.");
  }
  return new AdminDocumentReferenceWrap(realDb.collection(collectionName).doc(docId));
}

function collection(db: any, collectionName: string) {
  const realDb = db?._realDb || db || adminDb;
  if (!realDb) {
    throw new Error("Firestore Admin SDK is not initialized.");
  }
  return new AdminCollectionReferenceWrap(realDb.collection(collectionName));
}

function firebaseQuery(colRefWrap: any) {
  return colRefWrap;
}

async function getDoc(docRefWrap: any) {
  if (!docRefWrap || !docRefWrap._ref) {
    throw new Error("Invalid document reference wrap.");
  }
  const snap = await docRefWrap._ref.get();
  return new AdminDocumentSnapshotWrap(snap);
}

async function getDocs(colOrQueryWrap: any) {
  if (!colOrQueryWrap || !colOrQueryWrap._ref) {
    throw new Error("Invalid collection or query wrap.");
  }
  const snap = await colOrQueryWrap._ref.get();
  return new AdminQuerySnapshotWrap(snap);
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

async function deleteDoc(docRefWrap: any) {
  if (!docRefWrap || !docRefWrap._ref) {
    throw new Error("Invalid document reference wrap.");
  }
  return await docRefWrap._ref.delete();
}
// Safe Firestore operation wrapper - catches PERMISSION_DENIED and other errors gracefully
async function safeFirestoreOp<T>(operation: () => Promise<T>, fallbackValue: T, operationName: string = 'Firestore operation'): Promise<{ success: boolean; value: T; error?: string }> {
  try {
    const result = await operation();
    return { success: true, value: result };
  } catch (err: any) {
    const errMsg = err?.message || err?.code || String(err);
    const isPermissionDenied = errMsg.includes('PERMISSION_DENIED') || errMsg.includes('permission') || err?.code === 7;
    if (isPermissionDenied) {
      console.error(`[FIRESTORE] PERMISSION_DENIED during ${operationName}. Falling back to cache-only mode.`);
    } else {
      console.error(`[FIRESTORE] Error during ${operationName}: ${errMsg}`);
    }
    return { success: false, value: fallbackValue, error: errMsg };
  }
}
// --- End Compatibility Layer ---

export const serverCache = new Map<string, any>();
export const searchCache = new Map<string, { results: any[], timestamp: number }>();
export const fullJobListCache = { data: null as any[] | null, timestamp: 0 };
const SEARCH_CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache TTL
const FULL_JOB_LIST_TTL = 10 * 60 * 1000; // 10 minutes for full job list refresh

// ES module compatible __dirname for development and production
const _filename = typeof import.meta !== 'undefined' && import.meta.url ? fileURLToPath(import.meta.url) : '';
const _dirname = _filename ? path.dirname(_filename) : process.cwd();
const __filename = _filename;
const __dirname = _dirname;

// Configure multer for APK file uploads (use memory storage for serverless compatibility)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB max file size
  },
  fileFilter: function (req, file, cb) {
    if (!file.originalname.endsWith('.apk')) {
      return cb(new Error('Only APK files are allowed'));
    }
    cb(null, true);
  }
});

// Initialize Firebase Admin for FCM (already initialized synchronously, keeping references for compatibility)
let adminApp: any = null;
try {
  adminApp = admin.getApps().length ? admin.getApps()[0] : null;
} catch (e) {
  console.log("Failed to assign adminApp:", e);
}

// Persistent cache storage using JSON file
const CACHE_FILE = path.join(process.cwd(), 'cache.json');
const CACHE_DURATION_MS = 6 * 60 * 60 * 1000; // 6 hours in milliseconds

// Load cache from file on startup
let cache = new Map<string, { data: any, timestamp: number }>();
try {
  if (fs.existsSync(CACHE_FILE)) {
    const cacheData = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    cache = new Map(Object.entries(cacheData));
    console.log(`[CACHE] Loaded ${cache.size} items from ${CACHE_FILE}`);
    
    // First, scan all jobs in cache to identify duplicates and sync to the newest version
    const tempJobsMap = new Map<string, { key: string, item: any, time: number }>();
    for (const [key, value] of cache.entries()) {
      if (key.startsWith('jobs_')) {
        const item = (value as any).data || value;
        const id = key.substring(5);
        let decoded = id;
        try {
          decoded = decodeURIComponent(id);
        } catch (err) {}
        const cleanId = decoded.replace(/^\/+|\/+$/g, '');
        if (!cleanId) continue;
        
        const timestamp = new Date(item.updatedAt || item.createdAt || (value as any).timestamp || 0).getTime();
        
        if (!tempJobsMap.has(cleanId)) {
          tempJobsMap.set(cleanId, { key, item, time: timestamp });
        } else {
          const existing = tempJobsMap.get(cleanId)!;
          if (timestamp > existing.time) {
            tempJobsMap.set(cleanId, { key, item, time: timestamp });
          }
        }
      }
    }

    // Now, write back the newest data for each cleanId to ALL of its aliases in serverCache and persistent cache
    for (const [cleanId, entry] of tempJobsMap.entries()) {
      const escapeDot = (s: string) => s.replace(/\./g, '%2E');
      const aliases = [
        `jobs_${cleanId}`,
        `jobs_${escapeDot(encodeURIComponent('/' + cleanId))}`,
        `jobs_${escapeDot(encodeURIComponent('/' + cleanId + '/'))}`
      ];
      for (const aliasKey of aliases) {
        serverCache.set(aliasKey, entry.item);
        cache.set(aliasKey, { data: entry.item, timestamp: Date.now() });
      }
    }

    // Populate other static config pages like home_data_index and category pages
    for (const [key, value] of cache.entries()) {
      if (key === 'home_data_index') {
        serverCache.set(key, (value as any).data || value);
      } else if (key.startsWith('category_pages_')) {
        serverCache.set(key, (value as any).data || value);
      }
    }
    console.log(`[CACHE] Populated serverCache with ${serverCache.size} items after deduplication`);
  }
} catch (e) {
  console.log('[CACHE] No existing cache file found, starting fresh');
}

let lastWriteTime = 0;

const stripImagesAndLinks = (html: string): string => {
  if (!html) return html;
  try {
    const $ = cheerio.load(html, null, false);
    
    // 1. Remove all img, picture, source, svg, path, symbol tags
    $('img, picture, source, svg, path, symbol').remove();
    
    // 2. Remove any anchor tag pointing to image extensions
    $('a').each((i, el) => {
      const href = ($(el).attr('href') || '').toLowerCase().trim();
      const isImageLink = /(\.(png|jpg|jpeg|webp|gif|bmp))(\?|$)/i.test(href) || 
                          href.includes('fbcdn.net') || 
                          (href.includes('/uploads/') && href.match(/\.(png|jpg|jpeg|webp|gif)/i));
      
      if (isImageLink) {
        // Check if it's inside a table cell (td) or row (tr)
        const parentTr = $(el).closest('tr');
        if (parentTr.length > 0) {
          const rowText = parentTr.text().toLowerCase();
          // If the row contains words like poster or notice, remove the row, otherwise just remove the anchor
          if (rowText.includes('poster') || rowText.includes('notice') || rowText.includes('short info') || rowText.includes('download') || rowText.includes('click here')) {
            parentTr.remove();
          } else {
            $(el).remove();
          }
        } else {
          const parentP = $(el).parent('p');
          if (parentP.length > 0 && parentP.text().trim() === $(el).text().trim()) {
            parentP.remove();
          } else {
            $(el).remove();
          }
        }
      }
    });
    
    // 3. Remove any remaining empty paragraphs, divs, rows, or cells
    $('p, div, span, tr, td').each((i, el) => {
       if ($(el).text().trim() === '' && $(el).children().length === 0) {
           $(el).remove();
       }
    });
    
    return $.html();
  } catch (err) {
    console.error('[STRIP_IMAGES] Error stripping images from content:', err);
    return html;
  }
};

// Load database from Firebase first, then fallback to govexam_db.json
const loadGovExamDb = async () => {
  try {
    const DB_FILE = path.join(process.cwd(), 'govexam_db.json');
    
    const CATEGORY_MAP = [
      { id: 'result', title: 'Result' },
      { id: 'admit-card', title: 'Admit Card' },
      { id: 'latest-job', title: 'Latest Jobs' },
      { id: 'answer-key', title: 'Answer Key' },
      { id: 'syllabus', title: 'Syllabus' },
      { id: 'admission', title: 'Admission' },
      { id: 'calendar', title: 'Calendar' },
      { id: 'documents', title: 'Documents' },
    ];

    let allDbData: any[] = [];
    let homeDataIndex: any = {
      data: [],
      trending: []
    };

    // Try loading from Firebase first
    if (adminDb) {
      try {
        console.log('[GOVEXAM_DB] Loading database from Firebase...');
        const jobsCol = collection(adminDb, 'jobs');
        const snapshot = await getDocs(jobsCol);
        
        allDbData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        console.log(`[GOVEXAM_DB] Loaded ${allDbData.length} jobs from Firebase`);
      } catch (e: any) {
        console.error('[GOVEXAM_DB] Error loading from Firebase:', e.message);
        console.log('[GOVEXAM_DB] Falling back to local JSON file');
      }
    }

    // Fallback to local JSON if Firebase failed or is not available
    if (allDbData.length === 0 && fs.existsSync(DB_FILE)) {
      console.log(`[GOVEXAM_DB] Loading database from ${DB_FILE}`);
      
      try {
        const dbData = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
        allDbData = dbData;
        console.log(`[GOVEXAM_DB] Loaded ${dbData.length} total jobs from govexam_db.json`);
      } catch (e) {
        console.error(`[GOVEXAM_DB] Error reading govexam_db.json:`, e);
      }
    } else if (allDbData.length === 0) {
      console.log(`[GOVEXAM_DB] No data available from Firebase or local JSON`);
    }
    
    // Group jobs by category for homepage
    const categoryGroups: Record<string, any[]> = {};
    CATEGORY_MAP.forEach(cat => {
      categoryGroups[cat.id] = [];
    });
    
    allDbData.forEach((job: any) => {
      const jobCat = job.category || 'latest-job';
      if (categoryGroups[jobCat]) {
        categoryGroups[jobCat].push(job);
      }
    });
    
    // Build homepage data from grouped jobs
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    
    CATEGORY_MAP.forEach(cat => {
      const catJobs = categoryGroups[cat.id] || [];
      // Sort jobs by updatedAt descending (latest first)
      catJobs.sort((a: any, b: any) => {
        const dateA = new Date(a.updatedAt || a.createdAt || a.postDate || 0).getTime();
        const dateB = new Date(b.updatedAt || b.createdAt || b.postDate || 0).getTime();
        return dateB - dateA;
      });
      const catLinks = catJobs.map((job: any) => {
        // Check if job is within last 5 days for tags
        const jobDate = new Date(job.updatedAt || job.createdAt || job.postDate || 0);
        const isRecent = jobDate >= fiveDaysAgo;
        
        return {
          id: job.id || `scraped-${Math.random().toString(36).substring(7)}`,
          title: job.title,
          url: job.path || job.url,
          path: job.path || job.url,
          postDate: job.postDate || new Date().toISOString().split('T')[0],
          createdAt: job.createdAt || job.scrapedAt || new Date().toISOString(),
          updatedAt: job.updatedAt || job.scrapedAt || new Date().toISOString(),
          isNew: isRecent ? (job.isNew || false) : false,
          isOut: isRecent ? (job.isOut || false) : false
        };
      });
      
      homeDataIndex.data.push({
        id: cat.id,
        title: cat.title,
        links: catLinks
      });
      
      console.log(`[GOVEXAM_DB] Category ${cat.id}: ${catJobs.length} jobs`);
    });
    
    // Select top 7 featured/hot jobs for homepage (similar to SarkariResult)
    const featuredJobs = allDbData
        .filter((job: any) => job.isHot || job.vacancies && job.vacancies.length > 0)
        .sort((a: any, b: any) => {
          const dateA = new Date(a.updatedAt || a.createdAt || a.postDate || 0).getTime();
          const dateB = new Date(b.updatedAt || b.createdAt || b.postDate || 0).getTime();
          return dateB - dateA;
        })
        .slice(0, 7)
        .map((job: any) => {
          // Extract post count from vacancies or title
          let postCount = '';
          if (job.vacancies && job.vacancies.length > 0) {
            const totalVacancies = job.vacancies.reduce((sum: number, v: any) => sum + (parseInt(v.posts) || 0), 0);
            if (totalVacancies > 0) postCount = `(${totalVacancies} Posts)`;
          } else {
            // Try to extract from title
            const match = job.title.match(/\((\d+)\s*Posts?\)|(\d+)\s*Posts/i);
            if (match) postCount = `(${match[1] || match[2]} Posts)`;
          }
          // Check if job is within last 5 days for tags
          const jobDate = new Date(job.updatedAt || job.createdAt || job.postDate || 0);
          const isRecent = jobDate >= fiveDaysAgo;
          
          return {
            id: job.id || `scraped-${Math.random().toString(36).substring(7)}`,
            title: job.title,
            url: job.path || job.url,
            path: job.path || job.url,
            postDate: job.postDate || new Date().toISOString().split('T')[0],
            createdAt: job.createdAt || job.scrapedAt || new Date().toISOString(),
            updatedAt: job.updatedAt || job.scrapedAt || new Date().toISOString(),
            isNew: isRecent ? (job.isNew || false) : false,
            isOut: isRecent ? (job.isOut || false) : false,
            postCount: postCount
          };
        });

    // Select top 15 jobs across all categories for Trending
    homeDataIndex.trending = allDbData
        .sort((a: any, b: any) => {
          const dateA = new Date(a.updatedAt || a.createdAt || a.postDate || 0).getTime();
          const dateB = new Date(b.updatedAt || b.createdAt || b.postDate || 0).getTime();
          return dateB - dateA;
        })
        .slice(0, 15)
        .map((job: any) => {
          // Check if job is within last 5 days for tags
          const jobDate = new Date(job.updatedAt || job.createdAt || job.postDate || 0);
          const isRecent = jobDate >= fiveDaysAgo;
          
          return {
            id: job.id || `scraped-${Math.random().toString(36).substring(7)}`,
            title: job.title,
            url: job.path || job.url,
            path: job.path || job.url,
            postDate: job.postDate || new Date().toISOString().split('T')[0],
            createdAt: job.scrapedAt || new Date().toISOString(),
            updatedAt: job.scrapedAt || new Date().toISOString(),
            isNew: isRecent ? (job.isNew || false) : false,
            isOut: isRecent ? (job.isOut || false) : false
          };
        });

    // Add featured jobs to homeDataIndex
    homeDataIndex.featured = featuredJobs;

      // Cache the home data
      serverCache.set('home_data_index', homeDataIndex);
      cache.set('home_data_index', { data: homeDataIndex, timestamp: Date.now() });

      // Store individual jobs in serverCache for quick access
      for (const job of allDbData) {
        if (job.content) {
          job.content = stripImagesAndLinks(job.content);
        }
        // Ensure chronological and audit fields are correctly populated from scrapedAt
        if (!job.postDate) {
          job.postDate = job.scrapedAt ? job.scrapedAt.split('T')[0] : new Date().toISOString().split('T')[0];
        }
        if (!job.createdAt) {
          job.createdAt = job.scrapedAt || new Date().toISOString();
        }
        if (!job.updatedAt) {
          job.updatedAt = job.scrapedAt || new Date().toISOString();
        }
        
        const cleanId = (job.path || job.url || job.id).replace(/^\/|\/$/g, '').replace(/\//g, '-');
        serverCache.set(`jobs_${cleanId}`, job);
      }

      console.log(`[GOVEXAM_DB] Loaded ${allDbData.length} jobs into serverCache`);
      return { allDbData, homeDataIndex };
    } catch (e) {
      console.error('[GOVEXAM_DB] Error loading database:', e);
      return { allDbData: [], homeDataIndex: { data: [], trending: [] } };
    }
};

// Initial load on startup
(async () => {
  await loadGovExamDb();
})();

// Save cache to file
const saveCache = () => {
  try {
    const cacheObj = Object.fromEntries(cache);
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheObj, null, 2));
    
    // DISABLED: Auto-sync to local JSON file to prevent git conflicts
    // All job data now lives in Firebase only
    // try {
    //   const GOVEXAM_DB_FILE = path.join(process.cwd(), 'govexam_db.json');
    //   const jobsList: any[] = [];
    //   
    //   // Load current govexam_db.json to preserve any existing fields (like originalUrl, structures) if any
    //   let existingDbJobs: any[] = [];
    //   if (fs.existsSync(GOVEXAM_DB_FILE)) {
    //     try {
    //       existingDbJobs = JSON.parse(fs.readFileSync(GOVEXAM_DB_FILE, 'utf-8'));
    //     } catch (e) {
    //       console.error('[GOVEXAM_DB] Error reading existing govexam_db.json, starting fresh:', e);
    //     }
    //   }
    //   
    //   // Map of existing jobs by normalized path for easy lookup/merging
    //   const existingJobsMap = new Map<string, any>();
    //   for (const job of existingDbJobs) {
    //     let p = (job.path || '').trim().toLowerCase().replace(/^\/+|\/+$/g, '');
    //     if (!p && job.originalUrl) {
    //       try {
    //         const urlObj = new URL(job.originalUrl);
    //         p = urlObj.pathname.trim().toLowerCase().replace(/^\/+|\/+$/g, '');
    //       } catch (e) {
    //         p = job.originalUrl.trim().toLowerCase().replace(/^\/+|\/+$/g, '');
    //       }
    //     }
    //     if (p) {
    //       existingJobsMap.set(p, job);
    //     }
    //   }
    //
    //   for (const [key, value] of cache.entries()) {
    //     if (key.startsWith('jobs_')) {
    //       const item = value.data || value;
    //       if (item && typeof item === 'object') {
    //         const jobId = key.substring(5);
    //         let decodedId = jobId;
    //         try {
    //           decodedId = decodeURIComponent(jobId);
    //         } catch (e) {}
    //         
    //         const cleanId = decodedId.replace(/^\/+|\/+$/g, '');
    //         
    //         // Normalize path to have leading and trailing slash
    //         let pathVal = item.path || '/' + cleanId + '/';
    //         if (!pathVal.startsWith('/')) pathVal = '/' + pathVal;
    //         if (!pathVal.endsWith('/') && pathVal !== '/') pathVal = pathVal + '/';
    //         
    //         const normPath = pathVal.trim().toLowerCase().replace(/^\/+|\/+$/g, '');
    //         const existingJob = existingJobsMap.get(normPath) || {};
    //
    //         // Merge cache data with existing job data to preserve structural details like applicationFee, vacancies, etc.
    //         const mergedJob = {
    //           id: existingJob.id || item.id || cleanId,
    //           title: item.title || existingJob.title || '',
    //           category: item.category || existingJob.category || 'latest-job',
    //           postDate: item.postDate || existingJob.postDate || item.createdAt?.substring(0, 10) || existingJob.createdAt?.substring(0, 10) || new Date().toISOString().substring(0, 10),
    //           department: item.department || existingJob.department || '',
    //           shortInfo: item.shortInfo || existingJob.shortInfo || '',
    //           importantLinks: item.importantLinks || existingJob.importantLinks || [],
    //           originalUrl: item.originalUrl || existingJob.originalUrl || item.url || pathVal,
    //           tags: item.tags || existingJob.tags || [],
    //           isNew: item.isNew !== undefined ? item.isNew : (existingJob.isNew !== undefined ? existingJob.isNew : true),
    //           isHot: item.isHot !== undefined ? item.isHot : (existingJob.isHot !== undefined ? existingJob.isHot : false),
    //           importantDates: { ...(existingJob.importantDates || {}), ...(item.importantDates || {}) },
    //           applicationFee: { ...(existingJob.applicationFee || {}), ...(item.applicationFee || {}) },
    //           vacancies: item.vacancies && item.vacancies.length ? item.vacancies : (existingJob.vacancies || []),
    //           content: item.content || existingJob.content || '',
    //           path: pathVal,
    //           createdAt: item.createdAt || existingJob.createdAt || item.postDate || existingJob.postDate || new Date().toISOString(),
    //           updatedAt: item.updatedAt || new Date().toISOString()
    //         };
    //         
    //         jobsList.push(mergedJob);
    //       }
    //     }
    //   }
    //   
    //   // Deduplicate unique jobs
    //   const uniqueJobs: any[] = [];
    //   const seenPaths = new Set<string>();
    //   
    //   // Sort jobs list by updatedAt descending (newest first)
    //   jobsList.sort((a, b) => {
    //     const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime();
    //     const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime();
    //     return dateB - dateA;
    //   });
    //   
    //   for (const job of jobsList) {
    //     const normPath = (job.path || '').trim().toLowerCase().replace(/^\/+|\/+$/g, '');
    //     if (normPath && !seenPaths.has(normPath)) {
    //       seenPaths.add(normPath);
    //       uniqueJobs.push(job);
    //     }
    //   }
    //   
    //   lastWriteTime = Date.now();
    //   fs.writeFileSync(GOVEXAM_DB_FILE, JSON.stringify(uniqueJobs, null, 2));
    //   console.log(`[GOVEXAM_DB] Synced ${uniqueJobs.length} unique jobs to ${GOVEXAM_DB_FILE}`);
    // } catch (dbErr: any) {
    //   console.error('[GOVEXAM_DB] Failed to auto-sync to govexam_db.json:', dbErr);
    // }
  } catch (e) {
    console.error('[CACHE] Failed to save cache:', e);
  }
};

const syncJobToCacheAndAliases = (id: string, jobData: any) => {
  if (!id) return;
  if (jobData && jobData.content) {
    jobData.content = sanitizePostContent(stripImagesAndLinks(jobData.content));
  }
  let decodedId = id;
  try {
    decodedId = decodeURIComponent(id);
  } catch (e) {}
  const cleanId = decodedId.replace(/^\/+|\/+$/g, '');
  if (!cleanId) return;

  const escapeDot = (s: string) => s.replace(/\./g, '%2E');
  const aliases = [
    `jobs_${cleanId}`,
    `jobs_${escapeDot(encodeURIComponent('/' + cleanId))}`,
    `jobs_${escapeDot(encodeURIComponent('/' + cleanId + '/'))}`,
    `jobs_${id}`
  ];

  for (const aliasKey of aliases) {
    serverCache.set(aliasKey, jobData);
    cache.set(aliasKey, { data: jobData, timestamp: Date.now() });
  }
};

const inFlightRequests = new Map<string, Promise<any>>();

// Initialize Firebase SDK
let db: any = null;
let config: any = null;

function isFirebaseConfigValid(cfg: any) {
  // Check if Firebase config is valid
  return cfg && cfg.apiKey && cfg.projectId && cfg.authDomain;
}

try {
  const firebaseConfig = {
    apiKey: process.env.VITE_FIREBASE_API_KEY,
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.VITE_FIREBASE_APP_ID
  };
  
  if (isFirebaseConfigValid(firebaseConfig)) {
    config = firebaseConfig;
    console.log('[FIREBASE] Firebase configuration loaded successfully');
  } else {
    console.log('[FIREBASE] Firebase config invalid, using local cache mode');
  }
} catch (e: any) {
  console.error('[FIREBASE] Firebase initialization error:', e);
}

// Comprehensive content cleaning function
const cleanJobContent = (html: string) => {
  if (!html) return html;
  
  let cleaned = html;
  
  // 1. Remove social media links (Telegram, WhatsApp)
  const socialMediaLinks = [
    /https?:\/\/t\.me\/[^\s<>"']+/gi,
    /https?:\/\/whatsapp\.com\/channel\/[^\s<>"']+/gi,
    /https?:\/\/www\.whatsapp\.com\/channel\/[^\s<>"']+/gi,
    /https?:\/\/telegram\.me\/[^\s<>"']+/gi,
  ];
  socialMediaLinks.forEach(regex => {
    cleaned = cleaned.replace(regex, '');
  });
  
  // 2. Remove app store links
  const appStoreLinks = [
    /https?:\/\/play\.google\.com\/store\/apps\/[^\s<>"']+/gi,
    /https?:\/\/apps\.apple\.com\/[^\s<>"']+/gi,
  ];
  appStoreLinks.forEach(regex => {
    cleaned = cleaned.replace(regex, '');
  });
  
  // 3. Remove branding/disclaimer text
  const brandingPatterns = [
    /Official Website of ™️\.com\.cm[^]*?\n/gi,
    /Since 2009[^]*?\n/gi,
    /Trademark Applications[^]*?\n/gi,
    /Controller General of Patents[^]*?\n/gi,
    /Application Nos\.[^]*?\n/gi,
    /Disclaimer:[^]*?examinees[^]*?legal document[^]*?inadvertent errors[^]*?examination[^]*?\n/gi,
    /While every effort has been made[^]*?not responsible[^]*?\n/gi,
    /team to ensure the accuracy[^]*?\n/gi,
    /sarkariresult\.com\.cm/gi,
    /Sarkari Result/gi,
    /SarkariNaukri/gi,
  ];
  brandingPatterns.forEach(regex => {
    cleaned = cleaned.replace(regex, '');
  });
  
  // 4. Remove Q&A sections
  const qaPatterns = [
    /Question:[^]*?Answer:[^]*?\n/gi,
    /Q:[^]*?A:[^]*?\n/gi,
    /<div[^>]*>Question:[^]*?<\/div>/gi,
    /<div[^>]*>Answer:[^]*?<\/div>/gi,
  ];
  qaPatterns.forEach(regex => {
    cleaned = cleaned.replace(regex, '');
  });
  
  // 5. Remove descriptive content before "Important Dates"
  const importantDatesIndex = cleaned.toLowerCase().indexOf('important dates');
  if (importantDatesIndex > 0) {
    // Keep only from "Important Dates" onwards
    cleaned = cleaned.substring(importantDatesIndex);
  }
  
  // 6. Remove empty lines and extra whitespace
  cleaned = cleaned.replace(/\n\s*\n/g, '\n');
  cleaned = cleaned.trim();
  
  return cleaned;
};

// Clean FAQs About CEE Result 2026 box from all jobs dynamically
async function cleanAllJobsCEEFAQ() {
  // Use the comprehensive cleaning function
  const cleanHtmlContent = (html: string) => {
    return cleanJobContent(html);
  };

  // 1. Clean Local Cache first
  let localCleanedCount = 0;
  for (const [key, value] of cache.entries()) {
    if (key.startsWith('jobs_') && value && value.data) {
      let isModified = false;
      const content = value.data.content || '';
      const aiGeneratedDetails = value.data.aiGeneratedDetails || '';

      const cleanedContent = cleanHtmlContent(content);
      const cleanedDetails = cleanHtmlContent(aiGeneratedDetails);

      if (cleanedContent !== content) {
        value.data.content = cleanedContent;
        isModified = true;
      }
      if (cleanedDetails !== aiGeneratedDetails) {
        value.data.aiGeneratedDetails = cleanedDetails;
        isModified = true;
      }

      if (isModified) {
        localCleanedCount++;
        // Update serverCache
        if (serverCache.has(key)) {
          const cached = serverCache.get(key);
          if (cached) {
            cached.content = value.data.content;
            cached.aiGeneratedDetails = value.data.aiGeneratedDetails;
          }
        }
        console.log(`[FIREBASE_CLEAN] Cleaned CEE FAQ from local cache key: ${key}`);
      }
    }
  }

  if (localCleanedCount > 0) {
    saveCache();
    console.log(`[FIREBASE_CLEAN] Saved ${localCleanedCount} cleaned jobs back to cache.json`);
  }

  // 2. Clean Firestore if available
  if (!db) {
    console.log('[FIREBASE_CLEAN] Firestore not initialized, skipping Firestore clean.');
    return;
  }

  try {
    const jobsCol = collection(db, 'jobs');
    // Add limit to prevent data exhaustion - fetch only 500 jobs at a time
    const limitedQuery = firebaseQuery(jobsCol).limit(500);
    const snapshot = await getDocs(limitedQuery);
    console.log(`[FIREBASE_CLEAN] Scanning ${snapshot.docs.length} Firestore jobs for CEE FAQs...`);
    
    let firestoreCleanedCount = 0;
    const batchSize = 20; // Process in batches of 20 documents
    const delayBetweenBatches = 1000; // 1 second delay between batches
    
    for (let i = 0; i < snapshot.docs.length; i += batchSize) {
      const batch = snapshot.docs.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(snapshot.docs.length / batchSize);
      
      console.log(`[FIREBASE_CLEAN] Processing batch ${batchNum}/${totalBatches} (${batch.length} documents)...`);
      
      for (const d of batch) {
        const data = d.data();
        let isModified = false;
        let content = data.content || '';
        let aiGeneratedDetails = data.aiGeneratedDetails || '';

        const cleanedContent = cleanHtmlContent(content);
        const cleanedDetails = cleanHtmlContent(aiGeneratedDetails);

        if (cleanedContent !== content) {
          content = cleanedContent;
          isModified = true;
        }
        if (cleanedDetails !== aiGeneratedDetails) {
          aiGeneratedDetails = cleanedDetails;
          isModified = true;
        }

        if (isModified) {
          await setDoc(d.ref, {
            content,
            aiGeneratedDetails,
            updatedAt: new Date().toISOString()
          }, { merge: true });
          firestoreCleanedCount++;
          console.log(`[FIREBASE_CLEAN] Cleaned CEE FAQ from job in Firestore: ${d.id}`);
          
          // Update local cache
          const cacheKey = `jobs_${d.id}`;
          if (serverCache.has(cacheKey)) {
            const cached = serverCache.get(cacheKey);
            if (cached) {
              cached.content = content;
              cached.aiGeneratedDetails = aiGeneratedDetails;
            }
          }
          const cachedEntry = cache.get(cacheKey);
          if (cachedEntry && cachedEntry.data) {
            cachedEntry.data.content = content;
            cachedEntry.data.aiGeneratedDetails = aiGeneratedDetails;
          }
        }
      }
      
      // Add delay between batches to avoid quota exhaustion
      if (i + batchSize < snapshot.docs.length) {
        console.log(`[FIREBASE_CLEAN] Waiting ${delayBetweenBatches}ms before next batch...`);
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    }
    
    if (firestoreCleanedCount > 0) {
      saveCache();
    }
    console.log(`[FIREBASE_CLEAN] Firestore scan complete. Cleaned ${firestoreCleanedCount} jobs in Firestore.`);
  } catch (err: any) {
    console.error('[FIREBASE_CLEAN] Error cleaning Firestore jobs:', err.message);
  }
}

async function startServer() {
  // Run dynamic cleanup of FAQs box
  cleanAllJobsCEEFAQ().catch(err => {
    console.error('[FIREBASE_CLEAN] Background cleanup task failed:', err);
  });

  const app = express();
  const PORT = 3000;

  // Helper to remove forbidden links, table rows, list items or phrases from job content
  const sanitizePostContent = (html: string): string => {
      if (!html) return '';
      try {
          const $ = cheerio.load(html, null, false);

          // 1. Remove social media links (Telegram, WhatsApp)
          $("a").each((i, el) => {
              const $el = $(el);
              const href = $el.attr("href") || "";
              const text = $el.text().trim();
              
              if (/t\.me|telegram\.me|whatsapp\.com|whatsapp\.channel/i.test(href) ||
                  /telegram|whatsapp/i.test(text)) {
                  $el.remove();
              }
          });

          // 2. Remove app store links
          $("a").each((i, el) => {
              const $el = $(el);
              const href = $el.attr("href") || "";
              
              if (/play\.google\.com|apps\.apple\.com/i.test(href)) {
                  $el.remove();
              }
          });

          // 3. Remove branding/disclaimer text
          $("*").each((i, el) => {
              const $el = $(el);
              const text = $el.text().trim();
              
              if (/Official Website of ™️\.com\.cm|Since 2009|Trademark Applications|Controller General of Patents|Application Nos\./i.test(text) ||
                  /Disclaimer:[^]*?examinees[^]*?legal document/i.test(text) ||
                  /While every effort has been made[^]*?not responsible/i.test(text) ||
                  /team to ensure the accuracy/i.test(text) ||
                  /sarkariresult\.com\.cm|Sarkari Result|SarkariNaukri/i.test(text)) {
                  $el.remove();
              }
          });

          // 4. Remove Q&A sections
          $("*").each((i, el) => {
              const $el = $(el);
              const text = $el.text().trim();
              const tagName = ($(el).prop("tagName") || "").toUpperCase();
              
              if (["TR", "LI", "P", "H1", "H2", "H3", "H4", "H5", "H6", "DIV"].includes(tagName)) {
                  const isQA = /^(Question|Answer)\s*:/i.test(text) || 
                               (text.includes("Question:") && text.includes("Answer:") && text.length < 500);
                  
                  if (isQA) {
                      $el.remove();
                  }
              }
          });

          // 5. Remove descriptive content before "Important Dates"
          let importantDatesNode: any = null;
          $('*').each((i, el) => {
              const text = $(el).text().trim().toLowerCase();
              if (text === 'important dates' || text === 'important date') {
                  importantDatesNode = $(el);
                  return false; // Stop iteration
              }
          });

          if (importantDatesNode) {
              // Remove all siblings before the Important Dates node
              importantDatesNode.prevAll().remove();
              // Also remove any text nodes before it
              importantDatesNode.parent().contents().filter(function(this: any) {
                  return this.type === 'text' && $(this).prevAll().length === 0;
              }).remove();
          }

          return $.html().trim();
      } catch (e) {
          console.error('[SANITIZER] Error in sanitizePostContent:', e);
          return html;
      }
  };

  // Serve dynamic firebase config for service worker
  app.get("/api/firebase-config.js", (req, res) => {
      res.setHeader("Content-Type", "application/javascript");
      res.send(`self.DYNAMIC_FIREBASE_CONFIG = ${JSON.stringify(config || {})};`);
  });

  app.use(express.json());

  // Secure contact-us email submission endpoint via Web3Forms
  app.post("/api/contact", async (req, res) => {
    try {
      const { name, email, subject, message } = req.body;
      if (!name || !email || !message) {
        return res.status(400).json({ success: false, error: "Please fill in all required fields (Name, Email, Message)." });
      }

      const accessKey = process.env.WEB3FORMS_ACCESS_KEY;
      if (!accessKey) {
        console.warn("[CONTACT_US] WEB3FORMS_ACCESS_KEY is not configured in .env file.");
        return res.status(400).json({ 
          success: false, 
          error: "Contact Form is not fully configured yet. Please define WEB3FORMS_ACCESS_KEY in your server configuration." 
        });
      }

      const response = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          access_key: accessKey,
          name,
          email,
          subject: subject || "New Query from GovExam Notification Portal",
          message,
          from_name: "GovExam Contact Portal"
        })
      });

      const data = await response.json();
      if (response.ok && data.success) {
        const cached = serverCache.get('home_data_index'); console.log('CACHED KEYS:', cached.data.map((c:any)=>c.title)); return res.json({ success: true, message: "Thank you! Your query has been delivered to our support team." });
      } else {
        return res.status(500).json({ success: false, error: data.message || "Failed to deliver message via Web3Forms." });
      }
    } catch (err: any) {
      console.error("[CONTACT_US] Error handling contact form submission:", err.message);
      return res.status(500).json({ success: false, error: "Internal server error while sending message." });
    }
  });

  app.post("/api/subscribe", async (req, res) => {
    try {
      const { token } = req.body;
      if (!token) return res.status(400).json({ success: false, error: "No token provided" });
      
      const admin = await import("firebase-admin");
      const { getMessaging } = await import("firebase-admin/messaging");
      if (admin.getApps().length > 0) {
        await getMessaging().subscribeToTopic(token, "broadcast_alerts");
        res.json({ success: true });
      } else {
        res.status(500).json({ success: false, error: "Admin SDK not initialized" });
      }
    } catch (error) {
      console.error("FCM Subscribe error:", error);
      res.status(500).json({ success: false, error: "Failed to subscribe" });
    }
  });

  // Add health check endpoint for Cloud Run
  app.get("/api/health", (req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.get("/api/cache-stats", (req, res) => {
    const keys = Array.from(serverCache.keys());
    res.json({ size: serverCache.size, keys });
  });

  // Dynamic Sitemap Generator
  app.get("/sitemap.xml", async (req, res) => {
    try {
      res.header("Content-Type", "application/xml");
      
      const baseUrl = "https://govexamnotification.online";
      let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}/</loc>
    <changefreq>hourly</changefreq>
    <priority>1.0</priority>
  </url>`;

      const paths = new Set<string>();
      
      // Add category pages to sitemap
      const categoryPages = [
        '/category/latest-job/',
        '/category/result/',
        '/category/admit-card/',
        '/category/answer-key/',
        '/category/syllabus/',
        '/category/admission/',
        '/about-us',
        '/contact-us',
        '/disclaimer',
        '/privacy-policy'
      ];
      categoryPages.forEach(catPath => paths.add(catPath));
      
      // Extract links from home page cache (trending and category lists)
      const homeData = serverCache.get('home_data_index');
      if (homeData) {
        if (Array.isArray(homeData.trending)) {
          homeData.trending.forEach((link: any) => {
            if (link && link.path) paths.add(link.path);
          });
        }
        if (Array.isArray(homeData.data)) {
          homeData.data.forEach((cat: any) => {
            if (Array.isArray(cat.links)) {
              cat.links.forEach((link: any) => {
                if (link && link.path) paths.add(link.path);
              });
            }
          });
        }
      }

      // Extract links from individual job caches
      for (const [key, item] of serverCache.entries()) {
        if (key.startsWith('jobs_')) {
          if (item && item.path) paths.add(item.path);
          else if (item && item.data && item.data.path) paths.add(item.data.path);
        }
      }

      // Fetch all jobs from Firestore for complete sitemap if database is available
      if (db) {
        try {
          // Add limit to prevent data exhaustion - fetch only 1000 jobs for sitemap
          const jobsQuery = firebaseQuery(collection(db, 'jobs')).limit(1000);
          const querySnapshot = await getDocs(jobsQuery);
          querySnapshot.forEach((doc) => {
            const jobData = doc.data();
            if (jobData && jobData.path) {
              paths.add(jobData.path);
            }
          });
          console.log(`[SITEMAP] Added ${querySnapshot.size} jobs from Firestore`);
        } catch (e: any) {
          console.error('[SITEMAP] Firestore query failed:', e.message);
        }
      }

      // Append extracted paths to XML using clean URLs
      paths.forEach(path => {
        const formattedPath = path.startsWith('/') ? path : `/${path}`;
        const cleanUrl = `${baseUrl}${formattedPath}`
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&apos;');
        
        xml += `
  <url>
    <loc>${cleanUrl}</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`;
      });

      xml += `\n</urlset>`;
      res.send(xml);
      console.log(`[SITEMAP] Generated sitemap with ${paths.size} URLs`);
    } catch (error) {
      console.error("Sitemap generation error:", error);
      res.status(500).send("Error generating sitemap");
    }
  });

  // Endpoint to trigger sitemap submission to search engines (call this after adding new posts)
  app.post("/api/ping-sitemap", async (req, res) => {
    try {
      const sitemapUrl = "https://govexamnotification.online/sitemap.xml";
      const searchEngines = [
        `https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`,
        `https://www.bing.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`
      ];
      
      const results = await Promise.allSettled(
        searchEngines.map(url => fetch(url))
      );
      
      console.log(`[SITEMAP PING] Submitted to ${results.length} search engines`);
      res.json({ success: true, message: "Sitemap submitted to search engines" });
    } catch (error) {
      console.error("Sitemap ping error:", error);
      res.status(500).json({ success: false, error: "Failed to submit sitemap" });
    }
  });

  // Dynamic Sitemap Generator
  app.get("/sitemap.xml", async (req, res) => {
      try {
          res.header("Content-Type", "application/xml");
          
          const baseUrl = "https://govexamnotification.online";
          let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;
          
          // Add homepage
          xml += `
  <url>
    <loc>${baseUrl}/</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>`;
          
          // Add category pages
          const categories = ['latest-jobs', 'admit-card', 'result', 'answer-key', 'syllabus', 'admission', 'calendar', 'documents'];
          categories.forEach(cat => {
              xml += `
  <url>
    <loc>${baseUrl}/${cat}/</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`;
          });
          
          // Add job URLs from cache
          const keys = Array.from(serverCache.keys()).filter(k => k.startsWith('jobs_'));
          for (const key of keys) {
              const job = serverCache.get(key);
              if (job && job.path) {
                  const lastmod = job.updatedAt || job.createdAt || new Date().toISOString();
                  xml += `
  <url>
    <loc>${baseUrl}${job.path}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>`;
              }
          }
          
          xml += `
</urlset>`;
          
          res.send(xml);
      } catch (error) {
          console.error('[SITEMAP] Error:', error);
          res.status(500).json({ success: false, error: "Failed to generate sitemap" });
      }
  });

  // Helper to determine job category from title and path
  const determineJobCategory = (title: string, path: string): string => {
      const text = ((path || '') + ' ' + (title || '')).toLowerCase();
      if (text.includes('admit-card') || text.includes('admit card') || text.includes('hall ticket')) return 'admit-card';
      if (text.includes('answer-key') || text.includes('answer key') || text.includes('key solution')) return 'answer-key';
      if (text.includes('calendar') || text.includes('calender') || text.includes('time table') || text.includes('schedule')) return 'calendar';
      if (text.includes('syllabus') || text.includes('pattern')) return 'syllabus';
      if (text.includes('pan card') || text.includes('aadhar') || text.includes('certificate') || text.includes('voter id') || text.includes('dakhil kharij')) return 'documents';
      if (text.includes('result') || text.includes('merit list') || text.includes('score card')) return 'result';
      if (text.includes('admission')) return 'admission';
      return 'latest-job';
  };

  // Helper to get exact timestamp of a link (newest first)
  const getLinkTimestamp = (link: any): number => {
      if (!link) return 0;
      
      // We want to find the true chronological date of the job.
      // Order of preference:
      // 1. postDate (actual publication/notification date e.g. '2026-07-14')
      // 2. createdAt (date the job was added, e.g. '2026-07-12')
      // 3. updatedAt (last scraped/updated timestamp)
      
      // Let's resolve the actual job data from serverCache to get all fields accurately!
      let dbItem = null;
      let pathParam = '';
      if (link.url || link.path) {
          const rawUrl = link.url || link.path || '';
          try {
              if (rawUrl.startsWith('/?path=')) {
                  pathParam = decodeURIComponent(rawUrl.substring('/?path='.length));
              } else if (rawUrl.startsWith('/')) {
                  pathParam = rawUrl.substring(1);
              } else {
                  pathParam = rawUrl;
              }
          } catch (err) {}
          if (pathParam && pathParam.endsWith('/')) {
              pathParam = pathParam.slice(0, -1);
          }
      }

      if (pathParam) {
          dbItem = serverCache.get(`jobs_${encodeURIComponent(pathParam).replace(/\./g, '%2E')}`);
          if (!dbItem) {
              dbItem = serverCache.get(`jobs_${pathParam}`);
          }
      }
      
      if (!dbItem && link.id) {
          dbItem = serverCache.get(`jobs_${link.id}`) || serverCache.get(link.id);
      }

      // Check fields from dbItem first (as it contains the full accurate properties from govexam_db.json / Firestore)
      if (dbItem) {
          if (dbItem.postDate) {
              const t = new Date(dbItem.postDate).getTime();
              if (!isNaN(t)) return t;
          }
          if (dbItem.createdAt) {
              const t = new Date(dbItem.createdAt).getTime();
              if (!isNaN(t)) return t;
          }
          if (dbItem.updatedAt) {
              const t = new Date(dbItem.updatedAt).getTime();
              if (!isNaN(t)) return t;
          }
      }

      // If no dbItem is resolved, fallback to the link's own properties, preferring postDate/createdAt over updatedAt
      if (link.postDate) {
          const t = new Date(link.postDate).getTime();
          if (!isNaN(t)) return t;
      }
      if (link.createdAt) {
          const t = new Date(link.createdAt).getTime();
          if (!isNaN(t)) return t;
      }
      if (link.updatedAt) {
          const t = new Date(link.updatedAt).getTime();
          if (!isNaN(t)) return t;
      }

      return 0;
  };

  // Helper to keep posts in chronological order (newest first)
  const maskSequence = (links: any[]): any[] => {
      // Maintain original sequence (do not sort)
      return links || [];
  };

  // Helper to apply OUT and NEW tags on homepage and category lists
  const applyHomepageTags = (links: any[], category: string) => {
      if (!links || !Array.isArray(links)) return links || [];
      return links.map((link: any) => {
          let cleanTitle = link.title || '';
          cleanTitle = cleanTitle
              .replace(/\(\s*Sarkari\s*Result(?:\s+Update|\s+Mirror|\s+Info|\s+Website)?\s*\)/gi, '')
              .replace(/\s*[-\–\—]\s*Sarkari\s*Result(?:\s+Update|\s+Mirror|\s+Info|\s+Website)?/gi, '')
              .replace(/Sarkari\s*Result/gi, '')
              .replace(/SarkariResult/gi, '')
              .replace(/\(\s*\)/g, '')
              .replace(/\s+/g, ' ')
              .replace(/\s*[-\–\—\s]+$/, '')
              .replace(/^[-\–\—\s]+/, '')
              .trim();

          const lowerTitle = cleanTitle.toLowerCase();
          let isNew = link.isNew || false;
          let isOut = link.isOut || false;

          // Extract path
          let pathParam = '';
          if (link.url) {
              try {
                  if (link.url.startsWith('/?path=')) {
                      pathParam = decodeURIComponent(link.url.substring('/?path='.length));
                  } else if (link.url.startsWith('/')) {
                      pathParam = link.url.substring(1);
                  }
              } catch (err) {}
              if (pathParam && pathParam.endsWith('/')) {
                  pathParam = pathParam.slice(0, -1);
              }
          }

          let dbItem = null;
          if (pathParam) {
              // Try to find the item in serverCache
              dbItem = serverCache.get(`jobs_${encodeURIComponent(pathParam).replace(/\./g, '%2E')}`);
              if (!dbItem) {
                  dbItem = serverCache.get(`jobs_${pathParam}`);
              }
          }

          // Determine if the post is recent (within last 3 days)
          const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
          let isRecent = false;
          
          let referenceDateStr = null;
          if (dbItem) {
              referenceDateStr = dbItem.postDate || dbItem.createdAt || dbItem.scrapedAt || dbItem.updatedAt;
          } else {
              referenceDateStr = link.postDate || link.createdAt || link.scrapedAt || link.updatedAt;
          }
          
          if (referenceDateStr) {
              const updatedDate = new Date(referenceDateStr).getTime();
              if (!isNaN(updatedDate) && (Date.now() - updatedDate) <= THREE_DAYS_MS) {
                  isRecent = true;
              }
          }

          // Determine tags (ONLY if recent)
          if (isRecent) {
              // Dynamically determine the item's true category for absolute tagging accuracy
              let itemCat = category;
              if (dbItem && dbItem.category) {
                  itemCat = dbItem.category;
              } else {
                  itemCat = determineJobCategory(cleanTitle, link.url || link.path);
              }
              if (itemCat === 'latest-jobs') itemCat = 'latest-job';

              // 1. If Category is "latest-job", tag it as "isNew = true"
              if (itemCat === 'latest-job') {
                  isNew = true;
              }

              // 2. If Category is admit-card, result, or answer-key, and has keywords, tag it as "isOut = true"
              if (
                  (itemCat === 'admit-card' || itemCat === 'result' || itemCat === 'answer-key' || itemCat === 'syllabus') &&
                  (lowerTitle.includes('out') || lowerTitle.includes('released') || lowerTitle.includes('declared') || lowerTitle.includes('announced') || lowerTitle.includes('result') || lowerTitle.includes('admit card') || lowerTitle.includes('answer key') || lowerTitle.includes('exam city'))
              ) {
                  isOut = true;
              }

              // Check explicit tags in DB item
              if (dbItem) {
                  if (dbItem.tags && Array.isArray(dbItem.tags)) {
                      if (dbItem.tags.includes('new')) isNew = true;
                      if (dbItem.tags.includes('out')) isOut = true;
                  }
              }
          } else {
              // If not recent, aggressively strip any explicit tags that might have been saved
              isNew = false;
              isOut = false;
          }

          return { ...link, title: cleanTitle, isNew, isOut };
      });
  };

  // Helper to dynamically build homepage categories from the central jobs cache (Source of Truth)
  const enforceHomepageCategories = (homeData: any): any => {
      if (!homeData) return homeData;
      
      try {
          const copiedData = JSON.parse(JSON.stringify(homeData));
          
          const requiredCategories = [
              { id: 'result', title: 'Result', links: [] },
              { id: 'admit-card', title: 'Admit Card', links: [] },
              { id: 'latest-job', title: 'Latest Jobs', links: [] },
              { id: 'answer-key', title: 'Answer Key', links: [] },
              { id: 'syllabus', title: 'Syllabus', links: [] },
              { id: 'admission', title: 'Admission', links: [] },
              { id: 'calendar', title: 'Calendar', links: [] },
              { id: 'documents', title: 'Documents', links: [] }
          ];

          if (!copiedData.data || !Array.isArray(copiedData.data)) {
              copiedData.data = requiredCategories;
          } else {
              const existingMap = new Map<string, any>(copiedData.data.map((c: any) => [c.id, c]));
              copiedData.data = requiredCategories.map(req => {
                  const existing = existingMap.get(req.id);
                  return {
                      id: req.id,
                      title: req.title,
                      links: existing && Array.isArray((existing as any).links) ? (existing as any).links : []
                  };
              });
          }
          
          // 1. Gather ALL jobs from the serverCache (the true source of truth)
          const allJobs: any[] = [];
          const seenPaths = new Set<string>();
          
          for (const [key, item] of serverCache.entries()) {
              if (key.startsWith('jobs_')) {
                  const job = item.data || item;
                  
                  let rawPath = job.path || job.url;
                  if (!rawPath && job.originalUrl) {
                      try {
                          const urlObj = new URL(job.originalUrl);
                          rawPath = urlObj.pathname;
                      } catch (e) {
                          rawPath = job.originalUrl;
                      }
                  }
                  
                  const jobPath = (rawPath || ('/' + key.substring(5))).toLowerCase().trim();
                  
                  if (jobPath && !seenPaths.has(jobPath)) {
                      seenPaths.add(jobPath);
                      allJobs.push({
                          id: job.id || key.substring(5),
                          title: job.title || 'Untitled',
                          url: jobPath,
                          path: jobPath,
                          category: job.category || null,
                          postDate: job.postDate || (job.scrapedAt ? job.scrapedAt.split('T')[0] : new Date().toISOString().split('T')[0]),
                          createdAt: job.createdAt || job.scrapedAt || new Date().toISOString(),
                          updatedAt: job.updatedAt || job.scrapedAt || new Date().toISOString()
                      });
                  }
              }
          }
          
          // Maintain original scraped order (no sorting)
          // 2. Clear all categories' links
          const categoryMap = new Map<string, any[]>();
          copiedData.data.forEach((category: any) => {
              if (category && category.id) {
                  categoryMap.set(category.id, []);
                  // We also map title keywords to IDs just in case - but with separate arrays
                  if (category.title) {
                      const title = category.title.toLowerCase();
                      if (title.includes('result') && !categoryMap.has('result')) categoryMap.set('result', []);
                      if (title.includes('admit') && !categoryMap.has('admit-card')) categoryMap.set('admit-card', []);
                      if (title.includes('answer') && !categoryMap.has('answer-key')) categoryMap.set('answer-key', []);
                      if (title.includes('syllabus') && !categoryMap.has('syllabus')) categoryMap.set('syllabus', []);
                      if (title.includes('admission') && !categoryMap.has('admission')) categoryMap.set('admission', []);
                      if (title.includes('calendar') && !categoryMap.has('calendar')) categoryMap.set('calendar', []);
                      if (title.includes('document') && !categoryMap.has('documents')) categoryMap.set('documents', []);
                      if (title.includes('calendar') && !categoryMap.has('calendar')) categoryMap.set('calendar', []);
                      if (title.includes('document') && !categoryMap.has('documents')) categoryMap.set('documents', []);
                      if (title.includes('latest') && !categoryMap.has('latest-job')) categoryMap.set('latest-job', []);
                  }
              }
          });
          
          // Ensure we have the base buckets mapped
          const getBucketForCat = (catId: string) => {
              for (const [key] of categoryMap.entries()) {
                  if (key === catId) return key;
              }
              // If not found by direct ID, try partial match
              for (const [key] of categoryMap.entries()) {
                  if (key.includes(catId) || catId.includes(key)) return key;
              }
              return null;
          };
          
          // 3. Re-distribute jobs based on strict determination
          allJobs.forEach(job => {
              let trueCat = job.category || determineJobCategory(job.title, job.url || job.path);
              let bucketKey = getBucketForCat(trueCat) || getBucketForCat('latest-job');
              if (bucketKey && categoryMap.has(bucketKey)) {
                  // Show all items per category (removed limit)
                  categoryMap.get(bucketKey)!.push(job);
              }
          });
          
          // 4. Update the copiedData with the newly generated links
          copiedData.data.forEach((category: any) => {
              if (category && category.id) {
                  let bucketKey = getBucketForCat(category.id);
                  if (bucketKey && categoryMap.has(bucketKey)) {
                      category.links = categoryMap.get(bucketKey);
                      // prevent double assignment
                      categoryMap.delete(bucketKey); 
                  }
              }
          });

          // 5. Update trending list with the 15 newest overall jobs
          copiedData.trending = allJobs.slice(0, 15).map((job, idx) => ({
              id: job.id,
              title: job.title,
              url: job.path,
              path: job.path,
              postDate: job.postDate,
              createdAt: job.createdAt,
              updatedAt: job.updatedAt
          }));
          
          return copiedData;
      } catch (err) {
          console.error("Failed to dynamically build home categories", err);
          return homeData;
      }
  };

  const maskDataSequence = (homeData: any): any => {
      if (!homeData) return homeData;
      
      try {
          let copiedData = JSON.parse(JSON.stringify(homeData));
          
          // ALWAYS dynamically rebuild homepage categories and trending lists 
          // directly from the central serverCache memory holding all local govexam_db.json jobs
          // as well as Firestore synced ones. This gives an ultra-fast hybrid fallback
          // that renders instantly and remains fully functional offline/during Firebase exhaustion.
          console.log('[HOME] Dynamically compiling from serverCache (Hybrid Fallback Mode)');
          console.log('BEFORE enforce:', copiedData.data.map((c:any)=>c.title)); console.log('BEFORE enforce:', copiedData.data.map((c:any)=>c.title)); copiedData = enforceHomepageCategories(copiedData); console.log('AFTER enforce:', copiedData.data.map((c:any)=>c.title)); console.log('AFTER enforce:', copiedData.data.map((c:any)=>c.title));
          
          if (copiedData.data && Array.isArray(copiedData.data)) {
              copiedData.data.forEach((category: any) => {
                  if (category && category.links) {
                      category.links = maskSequence(category.links);
                      
                      // Dynamically apply tags based on the correct assigned category
                      let catId = '';
                      const titleLower = category.title?.toLowerCase() || '';
                      if (titleLower.includes('admit card')) catId = 'admit-card';
                      else if (titleLower.includes('result')) catId = 'result';
                      else if (titleLower.includes('answer key')) catId = 'answer-key';
                      else if (titleLower.includes('latest job')) catId = 'latest-job';
                      else if (titleLower.includes('syllabus')) catId = 'syllabus';
                      else if (titleLower.includes('calendar')) catId = 'calendar';
                      else if (titleLower.includes('document')) catId = 'documents';
                      else if (titleLower.includes('admission')) catId = 'admission';
                      
                      category.links = applyHomepageTags(category.links, catId);
                  }
              });
          }
          
          if (copiedData.trending && Array.isArray(copiedData.trending)) {
              copiedData.trending = maskSequence(copiedData.trending);
              copiedData.trending = applyHomepageTags(copiedData.trending, 'result');
          }
          
          return copiedData;
      } catch (err) {
          console.error("Failed to mask home data sequence", err);
          return homeData;
      }
  };

  // Helper to dynamically build beautiful Sarkari Result style HTML tables from structured data
  function generateHtmlFromStructuredData(data: any): string {
    const title = data.title || 'Government Job Notification';
    const postDate = data.postDate || '';
    const department = data.department || '';
    const shortInfo = data.shortInfo || '';
    
    let html = `<div style="font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; color: #1f2937; max-width: 100%; margin: 0 auto; padding: 12px;">`;
    
    // Outer table container matching Sarkari Result layout
    html += `
    <table style="width:100%; border-collapse:collapse; margin-bottom:20px; border:3px solid #104ba6;">
      <tr class="primary-table-heading" style="background-color:#104ba6; color:#ffffff;">
        <th colspan="2" style="text-align:center; padding:15px; font-size:1.4rem; font-weight:bold; border-bottom:3px solid #104ba6;">
          ${title}
        </th>
      </tr>`;

    if (department) {
      html += `
      <tr>
        <td style="width:30%; font-weight:bold; padding:12px; border:1px solid #cbd5e1; background-color:#f1f5f9;">conducting body / department</td>
        <td style="padding:12px; border:1px solid #cbd5e1; font-weight:500;">${department}</td>
      </tr>`;
    }

    if (postDate) {
      html += `
      <tr>
        <td style="width:30%; font-weight:bold; padding:12px; border:1px solid #cbd5e1; background-color:#f1f5f9;">post date / update date</td>
        <td style="padding:12px; border:1px solid #cbd5e1;">${postDate}</td>
      </tr>`;
    }

    if (shortInfo) {
      html += `
      <tr>
        <td style="width:30%; font-weight:bold; padding:12px; border:1px solid #cbd5e1; background-color:#f1f5f9;">short description</td>
        <td style="padding:12px; border:1px solid #cbd5e1; font-size:0.95rem; line-height:1.5;">${shortInfo}</td>
      </tr>`;
    }

    html += `</table>`;

    // Important Dates & Application Fee Table
    const dates = data.importantDates || {};
    const fees = data.applicationFee || {};
    const datesKeys = Object.keys(dates);
    const feesKeys = Object.keys(fees);

    if (datesKeys.length > 0 || feesKeys.length > 0) {
      let datesListHtml = '';
      if (datesKeys.length > 0) {
        datesKeys.forEach(k => {
          datesListHtml += `
            <li style="margin-bottom:8px;">
              <strong style="color:#0f172a;">${k}:</strong> <span style="color:#2563eb; font-weight:600;">${dates[k]}</span>
            </li>`;
        });
      } else {
        datesListHtml = '<li style="list-style-type:none; color:#64748b;">Refer to official notification</li>';
      }

      let feesListHtml = '';
      if (feesKeys.length > 0) {
        feesKeys.forEach(k => {
          feesListHtml += `
            <li style="margin-bottom:8px;">
              <strong style="color:#0f172a;">${k}:</strong> <span style="color:#16a34a; font-weight:600;">${fees[k]}</span>
            </li>`;
        });
      } else {
        feesListHtml = '<li style="list-style-type:none; color:#64748b;">Refer to official notification</li>';
      }

      html += `
      <table style="width:100%; border-collapse:collapse; margin-bottom:20px; border:3px solid #104ba6;">
        <tr class="primary-table-heading" style="background-color:#104ba6; color:#ffffff; font-weight:bold;">
          <th style="width:50%; text-align:center; padding:12px; font-size:1.1rem; border-right:1px solid #cbd5e1;">Important Dates</th>
          <th style="width:50%; text-align:center; padding:12px; font-size:1.1rem;">Application Fee</th>
        </tr>
        <tr>
          <td style="vertical-align:top; padding:12px; border:1px solid #cbd5e1; border-right:1px solid #cbd5e1; background-color:#ffffff;">
            <ul style="margin:0; padding-left:20px; list-style-type:disc;">
              ${datesListHtml}
            </ul>
          </td>
          <td style="vertical-align:top; padding:12px; border:1px solid #cbd5e1; background-color:#ffffff;">
            <ul style="margin:0; padding-left:20px; list-style-type:disc;">
              ${feesListHtml}
            </ul>
          </td>
        </tr>
      </table>
      `;
    }

    // Vacancy details table
    const vacancies = data.vacancies || [];
    if (vacancies.length > 0) {
      let vacancyRows = '';
      vacancies.forEach((v: any) => {
        vacancyRows += `
        <tr>
          <td style="padding:10px; border:1px solid #cbd5e1; font-weight:600; color:#1e3a8a;">${v.postName || 'Vacancy Post'}</td>
          <td style="padding:10px; border:1px solid #cbd5e1; font-weight:bold; color:#dc2626; text-align:center !important;">${v.totalPost || 'Not Specified'}</td>
          <td style="padding:10px; border:1px solid #cbd5e1; font-size:0.95rem;">${v.eligibility || 'Refer to the official notification below.'}</td>
        </tr>`;
      });

      html += `
      <table style="width:100%; border-collapse:collapse; margin-bottom:20px; border:3px solid #104ba6;">
        <tr class="primary-table-heading" style="background-color:#104ba6; color:#ffffff;">
          <th colspan="3" style="text-align:center; padding:12px; font-size:1.2rem; font-weight:bold;">
            Vacancy Details & Eligibility Criteria
          </th>
        </tr>
        <tr style="background-color:#f1f5f9; font-weight:bold; text-align:center;">
          <td style="padding:10px; border:1px solid #cbd5e1; width:35%;">Post Name</td>
          <td style="padding:10px; border:1px solid #cbd5e1; width:20%;">Total Post</td>
          <td style="padding:10px; border:1px solid #cbd5e1; width:45%;">Eligibility Criteria</td>
        </tr>
        ${vacancyRows}
      </table>
      `;
    }

    // Useful Important Links table
    const links = data.importantLinks || [];
    if (links.length > 0) {
      let linkRows = '';
      links.forEach((link: any) => {
        linkRows += `
        <tr>
          <td style="width:50%; font-weight:bold; padding:12px; border:1px solid #cbd5e1; background-color:#f8fafc; color:#1e293b;">
            ${link.label || 'Link'}
          </td>
          <td style="padding:12px; border:1px solid #cbd5e1; text-align:center !important;">
            <a href="${link.url || '#'}" target="_blank" rel="noopener noreferrer" style="color:#ff0000; text-decoration:underline; font-weight:bold; font-size:1.1rem;">
              Click Here
            </a>
          </td>
        </tr>`;
      });

      html += `
      <table style="width:100%; border-collapse:collapse; margin-top:30px; margin-bottom:20px; border:3px solid #104ba6;">
        <tr>
          <td colspan="2" class="important-links-heading" style="text-align:center !important; padding:15px; font-size:1.3rem; font-weight:bold; background-color:#104ba6; color:#ffffff;">
            Useful Important Links
          </td>
        </tr>
        ${linkRows}
      </table>
      `;
    }

    html += `</div>`;
    return html;
  }

  // Simple in-memory rate limiting structure
  const rateLimitMap = new Map<string, { count: number, resetTime: number }>();
  const RATE_LIMIT_SEC = 60 * 1000; // 1 minute
  const MAX_REQUESTS_PER_MIN = 120; // Max requests per user IP (increased for testing)

  // Generic proxy endpoint to fetch and parse external posts without data loss
  app.get("/api/scrape", async (req, res): Promise<any> => {
    try {
      const clientIp = req.ip || req.socket.remoteAddress || "unknown";
      const nowMs = Date.now();
      
      // Check rate limit
      let rateData = rateLimitMap.get(clientIp);
      if (!rateData || nowMs > rateData.resetTime) {
         rateData = { count: 0, resetTime: nowMs + RATE_LIMIT_SEC };
         rateLimitMap.set(clientIp, rateData);
      }
      
      if (rateData.count >= MAX_REQUESTS_PER_MIN) {
         return res.status(429).json({ 
           success: false, 
           error: "Too many requests. Please wait a moment and try again." 
         });
      }
      rateData.count += 1;

      let targetPath = req.query.path as string || "/";
      if (!targetPath.startsWith('/')) {
        targetPath = '/' + targetPath;
      }
      // --- READ ONLY FROM FIRESTORE DATABASE ---
      if (targetPath === '/' || targetPath === '') {
          // Read Home index data - Self-initializing Hybrid Cache
          if (!serverCache.has('home_data_index')) {
              const defaultHomeData = {
                  data: [
                      { id: 'result', title: 'Result', links: [] },
                      { id: 'admit-card', title: 'Admit Card', links: [] },
                      { id: 'latest-job', title: 'Latest Jobs', links: [] },
                      { id: 'answer-key', title: 'Answer Key', links: [] },
                      { id: 'syllabus', title: 'Syllabus', links: [] },
                      { id: 'admission', title: 'Admission', links: [] },
                      { id: 'calendar', title: 'Calendar', links: [] },
                      { id: 'documents', title: 'Documents', links: [] }
                  ],
                  trending: []
              };
              serverCache.set('home_data_index', defaultHomeData);
          }

          return res.json({
              success: true,
              isHome: true,
              ...maskDataSequence(serverCache.get('home_data_index'))
          });
      } else if (
          targetPath.startsWith('/category/') ||
          targetPath.startsWith('/result') ||
          targetPath.startsWith('/admit-card') ||
          targetPath.startsWith('/latest-job') ||
          targetPath.startsWith('/answer-key') ||
          targetPath.startsWith('/syllabus') ||
          targetPath.startsWith('/admission') ||
          targetPath.startsWith('/calendar') ||
          targetPath.startsWith('/documents')
      ) {
          // Serve Category Page from Firestore
          try {
              let categoryId = '';
              if (targetPath.includes('latest-job')) categoryId = 'latest-job';
              else if (targetPath.includes('result')) categoryId = 'result';
              else if (targetPath.includes('admit-card')) categoryId = 'admit-card';
              else if (targetPath.includes('answer-key')) categoryId = 'answer-key';
              else if (targetPath.includes('syllabus')) categoryId = 'syllabus';
              else if (targetPath.includes('admission')) categoryId = 'admission';
              else if (targetPath.includes('calendar')) categoryId = 'calendar';
              else if (targetPath.includes('documents')) categoryId = 'documents';

              if (categoryId) {
                  let data: any = null;
                  
                  if (!data && serverCache.has(`category_pages_${categoryId}`)) {
                      data = serverCache.get(`category_pages_${categoryId}`);
                      
                      // Maintain original scraped sequence
                      if (data.data && Array.isArray(data.data)) {
                          // No sorting
                      }
                  }
                  
                  if (db && !data) {
                      try {
                          const catDocRef = doc(db, 'category_pages', categoryId);
                          const catDoc = await getDoc(catDocRef);
                      if (catDoc.exists()) {
                          data = catDoc.data();
                          
                          // Add OUT and NEW tag logic for category page links 
                           if (data.data && Array.isArray(data.data)) {
                               // Maintain original sequence
                               
                               data.data = applyHomepageTags(data.data, categoryId);
                           }
                           
                           serverCache.set(`category_pages_${categoryId}`, data);
                           cache.set(`category_pages_${categoryId}`, { data, timestamp: Date.now() });
                           saveCache();
                       }
                   } catch (e: any) {
                       console.error(`Category doc fetch failed for ${categoryId}:`, e.message);
                   }
                  } 

                  if (!data && cache.has(`category_pages_${categoryId}`)) {
                       const cached = cache.get(`category_pages_${categoryId}`);
                       if (Date.now() - cached.timestamp < CACHE_DURATION_MS) {
                           data = cached.data;
                       }
                   }

                   // Dynamic Fallback: Scan serverCache/Firestore jobs and construct list if empty
                   if (!data || !data.data || !Array.isArray(data.data) || data.data.length === 0) {
                       const fallbackLinks: any[] = [];
                       const seenPaths = new Set<string>(); // Deduplication by path
                       
                       for (const [key, val] of serverCache.entries()) {
                           if (key.startsWith('jobs_')) {
                               const job = val;
                               let jobCat = job.category || '';
                               if (jobCat === 'latest-jobs') jobCat = 'latest-job';
                               
                               let targetCat = categoryId;
                               if (targetCat === 'latest-jobs') targetCat = 'latest-job';

                               // If category not stored, detect from title/path
                                if (!jobCat) {
                                    jobCat = determineJobCategory(job.title || '', job.path || '');
                                }

                               const jobPath = job.path || job.url;
                               // Skip if already seen (deduplication)
                               if (seenPaths.has(jobPath)) continue;
                               
                               if (job && (jobCat === targetCat || (targetCat === 'admit-card' && (jobCat === 'admit-card' || jobCat === 'admit card')))) {
                                   seenPaths.add(jobPath); // Mark as seen
                                   fallbackLinks.push({
                                       id: job.id || job.path,
                                       title: job.title,
                                       url: job.path,
                                       path: job.path,
                                       category: jobCat,
                                       postDate: job.postDate,
                                       createdAt: job.createdAt,
                                       updatedAt: job.updatedAt
                                   });
                               }
                           }
                       }
                       
                       // Maintain original sequence (do not sort)

                       if (fallbackLinks.length > 0) {
                           const prettyTitle = categoryId === 'latest-job' ? 'Latest Jobs' :
                                                categoryId === 'result' ? 'Results' :
                                                categoryId === 'admit-card' ? 'Admit Cards' :
                                                categoryId === 'answer-key' ? 'Answer Keys' :
                                                categoryId === 'syllabus' ? 'Syllabus' :
                                                categoryId === 'admission' ? 'Admissions' : categoryId;
                           data = {
                               title: prettyTitle,
                               data: fallbackLinks
                           };
                       }
                   }
                   
                   if (data) {
                       return res.json({
                           success: true,
                           isHome: false, // Category page, not homepage
                           title: data.title,
                           data: [
                               {
                                   id: 'category-results',
                                   title: data.title,
                                   links: maskSequence(applyHomepageTags(data.data || data.links || [], categoryId)),
                                   viewAllUrl: targetPath
                               }
                           ],
                           trending: []
                       });
                   }

                  // Fallback if not found in db or not matching explicitly
                  console.log(`[INFO] Category ${categoryId} not found in DB.`);
                  
                  if (data) {
                      return res.json({
                          success: true,
                          isHome: false, // Category page, not homepage
                          title: data.title,
                          data: [
                              {
                                  id: 'category-results',
                                  title: data.title,
                                  links: maskSequence(data.data || data.links || []),
                                  viewAllUrl: targetPath
                              }
                          ],
                          trending: []
                      });
                  }
                  
                  return res.status(404).json({ success: false, error: 'Category data not found or still syncing. Please check back later.' });
              }
              
              return res.status(404).json({ success: false, error: 'Category not found' });
          } catch (error) {
              console.error("Category fetch error:", error);
              return res.status(500).json({ success: false, error: 'Failed to load category data' });
          }
      } else if (targetPath.includes('?s=') || targetPath.includes('&s=') || targetPath.includes('/search') || req.query.s || targetPath.includes('?q=') || targetPath.includes('&q=') || req.query.q) {
          // Search logic
          let searchQuery = '';
          if (targetPath.includes('s=')) {
              const queryPart = targetPath.includes('?') ? targetPath.split('?')[1] : targetPath;
              const params = new URLSearchParams(queryPart);
              searchQuery = params.get('s') || '';
          }
          if (!searchQuery && req.query.s) {
              searchQuery = req.query.s as string;
          }
          if (!searchQuery && targetPath.includes('q=')) {
              const queryPart = targetPath.includes('?') ? targetPath.split('?')[1] : targetPath;
              const params = new URLSearchParams(queryPart);
              searchQuery = params.get('q') || '';
          }
          if (!searchQuery && req.query.q) {
              searchQuery = req.query.q as string;
          }

          if (!searchQuery || !searchQuery.trim()) {
              let homeData: any = null;
              if (db) {
                  try {
                      const homeDocRef = doc(db, 'home_data', 'index');
                      const homeDoc = await getDoc(homeDocRef);
                      if (homeDoc.exists()) homeData = homeDoc.data();
                  } catch (e: any) {
                      console.error("Home doc fetch logic failed during empty search:", e.message);
                  }
              }
              if (!homeData && serverCache.has('home_data_index')) {
                  homeData = serverCache.get('home_data_index');
              }
              return res.json(homeData ? maskDataSequence(homeData) : { success: false, error: "No data" });
          }

          const searchString = searchQuery.toLowerCase().trim();
          const tokens = searchString.split(/\s+/).filter(t => t.length > 0);
          
          // Function to score the relevance of a job post against search query
          const getMatchScore = (title: string, path: string): number => {
              const lowerTitle = title.toLowerCase();
              const lowerPath = path.toLowerCase();
              let totalScore = 0;

              for (const token of tokens) {
                  let maxTokenScore = 0;

                  // 1. Check title occurrences
                  let pos = lowerTitle.indexOf(token);
                  while (pos !== -1) {
                      let currentScore = 1; // base score for matching substring

                      const isWordStart = (pos === 0 || !/[a-zA-Z0-9]/.test(lowerTitle.charAt(pos - 1)));
                      const isWordEnd = (pos + token.length === lowerTitle.length || !/[a-zA-Z0-9]/.test(lowerTitle.charAt(pos + token.length)));

                      if (isWordStart && isWordEnd) {
                          currentScore += 100; // Exact word match (e.g. "UP" matches "UP")
                      } else if (isWordStart) {
                          currentScore += 50;  // Word prefix match (e.g. "UP" matches "UPSSSC")
                      } else {
                          // Substring match inside a word (e.g., "up" in "group" or "support")
                          if (token.length <= 2) {
                              // Completely disqualify short tokens matching inside larger words
                              currentScore = 0;
                          } else {
                              currentScore += 1;
                          }
                      }

                      if (currentScore > maxTokenScore) {
                          maxTokenScore = currentScore;
                      }
                      pos = lowerTitle.indexOf(token, pos + 1);
                  }

                  // 2. Check path occurrences
                  let pathPos = lowerPath.indexOf(token);
                  while (pathPos !== -1) {
                      let currentScore = 0.5; // base path score

                      const isWordStart = (pathPos === 0 || !/[a-zA-Z0-9]/.test(lowerPath.charAt(pathPos - 1)));
                      const isWordEnd = (pathPos + token.length === lowerPath.length || !/[a-zA-Z0-9]/.test(lowerPath.charAt(pathPos + token.length)));

                      if (isWordStart && isWordEnd) {
                          currentScore += 50;
                      } else if (isWordStart) {
                          currentScore += 25;
                      } else {
                          if (token.length <= 2) {
                              currentScore = 0;
                          } else {
                              currentScore += 0.5;
                          }
                      }

                      if (currentScore > maxTokenScore) {
                          maxTokenScore = currentScore;
                      }
                      pathPos = lowerPath.indexOf(token, pathPos + 1);
                  }

                  // If any token fails to match with a valid score (> 0), the job post is not a match
                  if (maxTokenScore === 0) {
                      return 0;
                  }

                  totalScore += maxTokenScore;
              }

              return totalScore;
          };

          
          
          let jobsData: any[] = [];

          // Super-fast memory-based job indexing (sub-millisecond search directly from loaded RAM cache)
          const seenPathForIndex = new Set<string>();
          for (const [key, value] of serverCache.entries()) {
              if (key.startsWith('jobs_') && value && value.title && value.path) {
                  let normPath = value.path.toLowerCase().trim();
                  if (!normPath.startsWith('/')) normPath = '/' + normPath;
                  if (!normPath.endsWith('/')) normPath = normPath + '/';
                  
                  if (!seenPathForIndex.has(normPath)) {
                      seenPathForIndex.add(normPath);
                      jobsData.push(value);
                  }
              }
          }
          console.log(`[SEARCH] Indexed ${jobsData.length} unique jobs directly from memory cache.`);
          
          const scoredLinks: { link: any; score: number }[] = [];
          const seenPaths = new Set<string>();

          // Extract helper to resolve ?path= URL parameter values
          const getPathParam = (urlStr: string) => {
              if (!urlStr) return '';
              try {
                  if (urlStr.startsWith('/?path=')) {
                      return decodeURIComponent(urlStr.substring('/?path='.length));
                  }
              } catch(e) {}
              return '';
          };

          // Build a set of all active paths marked as a "New" update on the homepage
          const newHomepagePaths = new Set<string>();
          const homeDataObj = serverCache.get('home_data_index');
          if (homeDataObj && homeDataObj.data) {
              homeDataObj.data.forEach((cat: any) => {
                  if (cat.links) {
                      cat.links.forEach((l: any) => {
                          if (l.isNew) {
                              const pathParam = getPathParam(l.url || '');
                              if (pathParam) {
                                  newHomepagePaths.add(pathParam.toLowerCase().trim());
                              }
                          }
                      });
                  }
              });
          }
          if (homeDataObj && homeDataObj.trending) {
              homeDataObj.trending.forEach((l: any) => {
                  if (l.isNew) {
                      const pathParam = getPathParam(l.url || '');
                      if (pathParam) {
                          newHomepagePaths.add(pathParam.toLowerCase().trim());
                      }
                  }
              });
          }

          const addCandidate = (id: string, title: string, path: string, itemData?: any) => {
              const normalizedPath = path.toLowerCase().trim();
              if (!normalizedPath || seenPaths.has(normalizedPath)) return;

              const score = getMatchScore(title, path);
              if (score > 0) {
                  seenPaths.add(normalizedPath);

                  let isNew = false;
                  let isOut = false;
                  
                  // Check tags from Firestore data
                  const dbItem = itemData || serverCache.get(`jobs_${id}`);
                  if (dbItem && dbItem.tags && Array.isArray(dbItem.tags)) {
                      if (dbItem.tags.includes('new')) {
                          isNew = true;
                      }
                      if (dbItem.tags.includes('out')) {
                          isOut = true;
                      }
                  }
                  
                  // Fallback: If no tags, use old logic
                  if (!isNew && !isOut) {
                      // 1. Is it currently marked as isNew on the homepage categories or trending?
                      if (newHomepagePaths.has(normalizedPath)) {
                          isNew = true;
                      }

                      // 2. Is the item in Firestore/cache created or updated recently?
                      let isOldItem = false;
                      if (dbItem) {
                          const timestamp = dbItem.createdAt || dbItem.updatedAt;
                          if (timestamp) {
                              try {
                                  const createdTime = new Date(timestamp).getTime();
                                  const ageInHours = (Date.now() - createdTime) / (1000 * 60 * 60);
                                  if (ageInHours < 120) { // last 5 days
                                      isNew = true;
                                  } else {
                                      isOldItem = true; // Definitely older than 5 days, so not genuinely new
                                  }
                              } catch (err) {}
                          }
                      }

                      // 3. Fallback: match typical high-urgency keywords ONLY if NOT explicitly determined as an old post
                      if (!isNew && !isOldItem) {
                          const lowerTitle = title.toLowerCase();
                          if (
                              lowerTitle.includes('extend') || 
                              lowerTitle.includes('start') || 
                              lowerTitle.includes('out') || 
                              lowerTitle.includes('now') || 
                              lowerTitle.includes('postpone') || 
                              lowerTitle.includes('vacancy details') ||
                              lowerTitle.includes('released')
                          ) {
                              isNew = true;
                          }
                      }

                      // 4. Check for "OUT" tag logic for admit card, result, answer key categories (3 days duration)
                      const lowerTitle = title.toLowerCase();
                      const lowerPath = path.toLowerCase();
                      
                      // Determine category from path
                      let currentCategory = '';
                      if (lowerPath.includes('admit-card') || lowerPath.includes('admit card')) {
                          currentCategory = 'admit-card';
                      } else if (lowerPath.includes('result') || lowerPath.includes('results')) {
                          currentCategory = 'result';
                      } else if (lowerPath.includes('answer-key') || lowerPath.includes('answer key')) {
                          currentCategory = 'answer-key';
                      }
                      
                      if (
                          (currentCategory === 'admit-card' || currentCategory === 'result' || currentCategory === 'answer-key') &&
                          (lowerTitle.includes('out') || lowerTitle.includes('released') || lowerTitle.includes('declared') || lowerTitle.includes('announced'))
                      ) {
                          const dbItemForOut = itemData || serverCache.get(`jobs_${id}`);
                          if (dbItemForOut) {
                              const timestamp = dbItemForOut.createdAt || dbItemForOut.updatedAt;
                              if (timestamp) {
                                  try {
                                      const createdTime = new Date(timestamp).getTime();
                                      const ageInHours = (Date.now() - createdTime) / (1000 * 60 * 60);
                                      if (ageInHours < 72) { // last 3 days for OUT tag
                                          isOut = true;
                                      }
                                  } catch (err) {}
                              }
                          }
                      }
                  }

                  let cleanSearchTitle = title || '';
                  cleanSearchTitle = cleanSearchTitle
                      .replace(/\(\s*Sarkari\s*Result(?:\s+Update|\s+Mirror|\s+Info|\s+Website)?\s*\)/gi, '')
                      .replace(/\s*[-\–\—]\s*Sarkari\s*Result(?:\s+Update|\s+Mirror|\s+Info|\s+Website)?/gi, '')
                      .replace(/Sarkari\s*Result/gi, '')
                      .replace(/SarkariResult/gi, '')
                      .replace(/\(\s*\)/g, '')
                      .replace(/\s+/g, ' ')
                      .replace(/\s*[-\–\—\s]+$/, '')
                      .replace(/^[-\–\—\s]+/, '')
                      .trim();

                  scoredLinks.push({
                      link: {
                          id,
                          title: cleanSearchTitle,
                          url: path, // Use clean URLs instead of ?path=
                          isNew,
                          isOut
                      },
                      score
                  });
              }
          };

          // 1. Add matching links from local database/cache
          jobsData.forEach((data) => {
              if (data.title && data.path) {
                  addCandidate(data.id, data.title, data.path, data);
              }
          });

          // Live search scraping disabled - user manually adds jobs
          // Previously scraped sarkariresult.com.cm for additional results

          // Sort the scored candidates by score (highest relevance first)
          scoredLinks.sort((a, b) => b.score - a.score);
          const sortedLinks = scoredLinks.map(item => item.link);

          return res.json({
              success: true,
              isHome: true,
              title: `Search Results for "${searchQuery}"`,
              data: [
                  {
                      id: 'search-results',
                      title: `Searched: ${searchQuery}`,
                      links: sortedLinks.length > 0 ? sortedLinks.slice(0, 50) : [],
                      viewAllUrl: '#'
                  }
              ],
              trending: []
          });
      } else {
          // Read Job post data
          let jobPaths = [targetPath];
          if (targetPath.endsWith('/')) {
              jobPaths.push(targetPath.slice(0, -1));
          } else {
              jobPaths.push(targetPath + '/');
          }
          
          let data: any = null;
          let foundJobId = '';

          // 1. Direct path/key lookup in memory first (extremely fast)
          for (const p of jobPaths) {
              const jobId = encodeURIComponent(p).replace(/\./g, '%2E');
              if (serverCache.has(`jobs_${jobId}`)) {
                  data = serverCache.get(`jobs_${jobId}`);
                  foundJobId = jobId;
                  break;
              }
          }

          // 2. High-fidelity scan of in-memory values by matching 'path' fields (resolves any key encoding or trailing slash mismatches instantly)
          if (!data) {
              const normTarget = targetPath.toLowerCase().trim().replace(/\/+$/, '');
              for (const [key, value] of serverCache.entries()) {
                  if (key.startsWith('jobs_') && value && value.path) {
                      const normPath = value.path.toLowerCase().trim().replace(/\/+$/, '');
                      if (normPath === normTarget) {
                          data = value;
                          foundJobId = key.substring(5);
                          console.log(`[PAGE_LOAD] Instant cache hit via path scan for: ${targetPath}`);
                          break;
                      }
                  }
              }
          }

          // 3. Fallback to Firestore network call only if completely missing from memory cache
          if (db && !data) {
              for (const p of jobPaths) {
                  const jobId = encodeURIComponent(p).replace(/\./g, '%2E');
                  try {
                      const jobDocRef = doc(db, 'jobs', jobId);
                      const jobDoc = await getDoc(jobDocRef);
                      if (jobDoc.exists()) {
                          data = jobDoc.data();
                          foundJobId = jobId;
                          syncJobToCacheAndAliases(jobId, data);
                          saveCache();
                          console.log(`[PAGE_LOAD] Firestore fallback loaded and synced for: ${targetPath}`);
                          break;
                      }
                  } catch (e: any) {
                      console.error(`Job fetch error for ${jobId}:`, e.message);
                  }
              }
          }
          
          if (!data) {
              console.log(`[INFO] Job post not found in DB: ${targetPath}`);
          }

          
          if (!data) {
              // Instead of error, return a helpful fallback content page
              const pathWords = targetPath.replace(/^\/|\/$/g, '').split(/[-_\/]/).filter(w => w.length > 0);
              const fallbackTitle = pathWords.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || 'Page Not Available';
              
              return res.json({
                success: true,
                isHome: false,
                title: fallbackTitle,
                content: `
                  <div style="padding: 24px 16px;">
                    <div style="background: linear-gradient(135deg, #f0f4ff 0%, #e8eeff 100%); border: 1px solid #c7d2fe; border-radius: 16px; padding: 40px 24px; text-align: center; max-width: 550px; margin: 0 auto;">
                      <div style="width: 64px; height: 64px; background: #104ba6; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                      </div>
                      <h2 style="color: #1e3a5f; font-size: 20px; font-weight: 800; margin-bottom: 12px; line-height: 1.3;">यह Page अभी Update हो रहा है</h2>
                      <p style="color: #475569; font-size: 14px; line-height: 1.7; margin-bottom: 8px;">
                        This page content is currently being synced. कृपया कुछ समय बाद दोबारा try करें।
                      </p>
                      <p style="color: #64748b; font-size: 13px; line-height: 1.6; margin-bottom: 28px;">
                        आप Homepage पर जाकर Latest Jobs, Syllabus, Admit Card और Results देख सकते हैं।
                      </p>
                      <div style="display: flex; flex-direction: column; gap: 12px; align-items: center;">
                        <a href="javascript:void(0)" onclick="if(window.history.length > 1){window.history.back()}else{window.location.href='/'}" style="display: inline-block; background: #104ba6; color: white; padding: 12px 36px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 14px; box-shadow: 0 2px 8px rgba(16,75,166,0.3); transition: background 0.2s;">← पिछले Page पर जाएं</a>
                        <a href="/" style="display: inline-block; background: white; color: #104ba6; padding: 10px 32px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 13px; border: 2px solid #104ba6;">🏠 Homepage पर जाएं</a>
                      </div>
                    </div>
                  </div>
                `
              });
          }
          
          let cleanContent = data.content || '';
          if (!cleanContent || cleanContent.trim() === '') {
              cleanContent = generateHtmlFromStructuredData(data);
          }
          cleanContent = sanitizePostContent(cleanContent);
          let cleanTitle = data.title || '';

          if (cleanContent) {
              cleanContent = cleanContent
                  .replace(/\(\s*Sarkari\s*Result(?:\s+Update|\s+Mirror|\s+Info|\s+Website)?\s*\)/gi, '')
                  .replace(/\s*[-\–\—]\s*Sarkari\s*Result(?:\s+Update|\s+Mirror|\s+Info|\s+Website)?/gi, '')
                  .replace(/Sarkari\s*Result/gi, '')
                  .replace(/SarkariResult/gi, '')
                  .replace(/\(\s*\)/g, '');
          }

          if (cleanTitle) {
              cleanTitle = cleanTitle
                  .replace(/\(\s*Sarkari\s*Result(?:\s+Update|\s+Mirror|\s+Info|\s+Website)?\s*\)/gi, '')
                  .replace(/\s*[-\–\—]\s*Sarkari\s*Result(?:\s+Update|\s+Mirror|\s+Info|\s+Website)?/gi, '')
                  .replace(/Sarkari\s*Result/gi, '')
                  .replace(/SarkariResult/gi, '')
                  .replace(/\(\s*\)/g, '')
                  .replace(/\s+/g, ' ')
                  .replace(/\s*[-\–\—\s]+$/, '')
                  .replace(/^[-\–\—\s]+/, '')
                  .trim();
          }
          
          return res.json({
             success: true,
             isHome: false,
             ...data,
             title: cleanTitle,
             content: cleanContent
          });
      }

    } catch (error: any) {
      console.error(error);
      res.status(500).json({ success: false, error: "Internal server error reading from database" });
    }
  });

  // Middleware for Admin APIs
  const verifyAdmin = (req: any, res: any, next: any) => {
    const adminKey = req.headers['x-admin-key'] || req.body?.admin_key;
    const secret = process.env.ADMIN_SECRET_KEY;
    
    // Security check: Make sure ADMIN_SECRET_KEY is actually set in .env
    if (!secret || secret.trim() === '') {
      console.error("[SECURITY WARNING] ADMIN_SECRET_KEY is missing in environment variables!");
      return res.status(500).json({ success: false, error: "Server Configuration Error" });
    }

    if (!adminKey || adminKey !== secret) {
      return res.status(403).json({ success: false, error: "Unauthorized: Invalid Admin Key" });
    }
    next();
  };

  // Rebuild home_data from Firebase jobs
  app.post("/api/admin/rebuild-home-data", verifyAdmin, async (req, res): Promise<any> => {
    try {
      console.log('[REBUILD] Starting home_data rebuild from Firebase jobs...');
      
      if (!adminDb) {
        return res.status(400).json({ success: false, error: "Firebase not available" });
      }

      // Load all jobs from Firebase
      const result = await safeFirestoreOp(async () => {
        const jobsCol = collection(adminDb, 'jobs');
        const snapshot = await getDocs(jobsCol);
        return snapshot.docs.map(d => ({
          id: d.id,
          ...d.data()
        }));
      }, [], 'rebuild home_data jobs');
      
      if (!result.success) {
        return res.status(500).json({ success: false, error: "Failed to load jobs from Firebase" });
      }

      const allDbData = result.value;
      console.log(`[REBUILD] Loaded ${allDbData.length} jobs from Firebase`);

      // Group jobs by category
      const categoryGroups: Record<string, any[]> = {};
      const CATEGORY_MAP = [
        { id: 'result', title: 'Result' },
        { id: 'admit-card', title: 'Admit Card' },
        { id: 'latest-job', title: 'Latest Jobs' },
        { id: 'answer-key', title: 'Answer Key' },
        { id: 'syllabus', title: 'Syllabus' },
        { id: 'admission', title: 'Admission' },
        { id: 'calendar', title: 'Calendar' },
        { id: 'documents', title: 'Documents' },
      ];

      CATEGORY_MAP.forEach(cat => {
        categoryGroups[cat.id] = [];
      });

      allDbData.forEach((job: any) => {
        const jobCat = job.category || 'latest-job';
        if (categoryGroups[jobCat]) {
          categoryGroups[jobCat].push(job);
        }
      });

      // Build homepage data
      const fiveDaysAgo = new Date();
      fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

      const homeDataIndex: any = {
        data: [],
        trending: []
      };

      CATEGORY_MAP.forEach(cat => {
        const catJobs = categoryGroups[cat.id] || [];
        // Sort jobs by updatedAt descending
        catJobs.sort((a: any, b: any) => {
          const dateA = new Date(a.updatedAt || a.createdAt || a.postDate || 0).getTime();
          const dateB = new Date(b.updatedAt || b.createdAt || b.postDate || 0).getTime();
          return dateB - dateA;
        });

        const catLinks = catJobs.map((job: any) => {
          const jobDate = new Date(job.updatedAt || job.createdAt || job.postDate || 0);
          const isRecent = jobDate >= fiveDaysAgo;

          return {
            id: job.id || `scraped-${Math.random().toString(36).substring(7)}`,
            title: job.title,
            url: job.path || job.url,
            path: job.path || job.url,
            postDate: job.postDate || new Date().toISOString().split('T')[0],
            createdAt: job.createdAt || job.scrapedAt || new Date().toISOString(),
            updatedAt: job.updatedAt || job.scrapedAt || new Date().toISOString(),
            isNew: isRecent ? (job.isNew || false) : false,
            isOut: isRecent ? (job.isOut || false) : false
          };
        });

        homeDataIndex.data.push({
          id: cat.id,
          title: cat.title,
          links: catLinks
        });

        console.log(`[REBUILD] Category ${cat.id}: ${catJobs.length} jobs`);
      });

      // Select top 15 trending jobs
      homeDataIndex.trending = allDbData
        .sort((a: any, b: any) => {
          const dateA = new Date(a.updatedAt || a.createdAt || a.postDate || 0).getTime();
          const dateB = new Date(b.updatedAt || b.createdAt || b.postDate || 0).getTime();
          return dateB - dateA;
        })
        .slice(0, 15)
        .map((job: any) => {
          const jobDate = new Date(job.updatedAt || job.createdAt || job.postDate || 0);
          const isRecent = jobDate >= fiveDaysAgo;

          return {
            id: job.id || `scraped-${Math.random().toString(36).substring(7)}`,
            title: job.title,
            url: job.path || job.url,
            path: job.path || job.url,
            postDate: job.postDate || new Date().toISOString().split('T')[0],
            createdAt: job.createdAt || job.scrapedAt || new Date().toISOString(),
            updatedAt: job.updatedAt || job.scrapedAt || new Date().toISOString(),
            isNew: isRecent ? (job.isNew || false) : false,
            isOut: isRecent ? (job.isOut || false) : false
          };
        });

      // Save to Firebase
      const saveResult = await safeFirestoreOp(async () => {
        const homeDocRef = doc(adminDb, 'home_data', 'index');
        await setDoc(homeDocRef, homeDataIndex);
      }, undefined, 'rebuild home_data save');

      if (!saveResult.success) {
        return res.status(500).json({ success: false, error: "Failed to save home_data to Firebase" });
      }

      // Update server cache
      serverCache.set('home_data_index', homeDataIndex);
      cache.set('home_data_index', { data: homeDataIndex, timestamp: Date.now() });

      console.log('[REBUILD] Successfully rebuilt home_data from Firebase jobs');
      res.json({ success: true, message: "Home data rebuilt successfully", stats: {
        totalJobs: allDbData.length,
        categories: homeDataIndex.data.map((c: any) => ({ title: c.title, count: c.links.length })),
        trendingCount: homeDataIndex.trending.length
      }});
    } catch (error: any) {
      console.error('[REBUILD] Error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get all jobs for admin dashboard
  app.get("/api/admin/jobs", verifyAdmin, async (req, res): Promise<any> => {
    try {
      let jobs: any[] = [];
      let usedCache = false;
      if (adminDb) {
        const result = await safeFirestoreOp(async () => {
          const jobsCol = collection(adminDb, 'jobs');
          // Add limit to prevent data exhaustion - fetch only 1000 jobs for admin panel
          const limitedQuery = firebaseQuery(jobsCol).limit(1000);
          const snapshot = await getDocs(limitedQuery);
          console.log(`[ADMIN JOBS] Found ${snapshot.docs.length} jobs in Firestore`);
          return snapshot.docs.map(d => {
            const data = d.data();
            return {
              id: d.id,
              title: data.title,
              path: data.path,
              category: data.category,
              updatedAt: data.updatedAt,
              createdAt: data.createdAt,
              lastCheckedAt: data.lastCheckedAt
            };
          });
        }, [] as any[], 'admin/jobs list');
        
        if (result.success) {
          jobs = result.value;
        } else {
          // Firestore failed (permission denied etc)
          usedCache = true;
        }
      } else {
        usedCache = true;
      }
      
      // ALWAYS read from serverCache to ensure we include jobs loaded from govexam_db.json
      // or jobs added in cache-only mode.
      console.log(`[ADMIN JOBS] Merging with serverCache (Central Source of Truth).`);
      const seenCleanIds = new Set<string>();
      
      for (const [key, item] of serverCache.entries()) {
        if (key.startsWith('jobs_')) {
          const id = key.substring('jobs_'.length);
          
          let decodedId = id;
          try {
            decodedId = decodeURIComponent(id);
          } catch (e) {}
          const cleanId = decodedId.replace(/^\/+|\/+$/g, '');
          
          // Prevent duplicate alias keys from pushing multiple list entries
          if (seenCleanIds.has(cleanId)) {
            continue;
          }
          seenCleanIds.add(cleanId);
          
          const data = item.data || item;
          
          let jobPath = data.path;
          if (!jobPath && data.originalUrl) {
              try {
                  const urlObj = new URL(data.originalUrl);
                  jobPath = urlObj.pathname;
              } catch (e) {
                  jobPath = data.originalUrl;
              }
          }
          if (!jobPath) jobPath = '/' + cleanId + '/'; // Fallback if no path exists

          jobs.push({
            id: cleanId, // Return normalized clean ID
            title: data.title || 'Untitled Job',
            path: jobPath,
            category: data.category,
            updatedAt: data.updatedAt || data.createdAt || data.postDate,
            createdAt: data.createdAt || data.postDate,
            lastCheckedAt: data.lastCheckedAt
          });
        }
      }
      
      // Deduplicate jobs by path (keep the newest one if duplicates exist)
      const uniqueJobsMap = new Map<string, any>();
      jobs.forEach(job => {
        const path = job.path?.toLowerCase().trim();
        if (path) {
          if (!uniqueJobsMap.has(path)) {
            uniqueJobsMap.set(path, job);
          } else {
            // Keep the one with the newer updatedAt timestamp
            const existingJob = uniqueJobsMap.get(path);
            const existingTime = new Date(existingJob.updatedAt || 0).getTime();
            const newTime = new Date(job.updatedAt || 0).getTime();
            if (newTime > existingTime) {
              uniqueJobsMap.set(path, job);
            }
          }
        }
      });
      
      const uniqueJobs = Array.from(uniqueJobsMap.values());
      uniqueJobs.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
      console.log(`[ADMIN JOBS] Returning ${uniqueJobs.length} jobs to admin panel`);
      res.json({ success: true, jobs: uniqueJobs, isCacheOnly: usedCache });
    } catch (error: any) {
      console.error(`[ADMIN JOBS ERROR] ${error.message}`);
      res.status(500).json({ success: false, error: "Failed to load jobs. Please try again." });
    }
  });

  // Get single job details for editing
  app.get("/api/admin/job", verifyAdmin, async (req, res): Promise<any> => {
    try {
      const id = req.query.id as string;
      if (!id) return res.status(400).json({ success: false, error: "ID required" });
      
      let decodedId = id;
      try {
        decodedId = decodeURIComponent(id);
      } catch (e) {}
      const cleanId = decodedId.replace(/^\/+|\/+$/g, '');
      
      let job: any = null;
      if (adminDb) {
        const result = await safeFirestoreOp(async () => {
          const jobDocRef = doc(adminDb, 'jobs', cleanId);
          const jobDoc = await getDoc(jobDocRef);
          if (jobDoc.exists()) {
            return { id: jobDoc.id, ...jobDoc.data() };
          }
          return null;
        }, null, `admin/job get ${cleanId}`);
        
        if (result.success) {
          job = result.value;
        }
      }
      
      // Fallback to cache if Firestore failed or returned null
      if (!job) {
        console.log(`[ADMIN GET JOB] Trying cache for ID: ${cleanId}`);
        const escapeDot = (s: string) => s.replace(/\./g, '%2E');
        const alt1 = `jobs_${cleanId}`;
        const alt2 = `jobs_${escapeDot(encodeURIComponent('/' + cleanId))}`;
        const alt3 = `jobs_${escapeDot(encodeURIComponent('/' + cleanId + '/'))}`;
        const alt4 = `jobs_${id}`;
        
        let cachedJob = null;
        if (serverCache.has(alt1)) cachedJob = serverCache.get(alt1);
        else if (serverCache.has(alt2)) cachedJob = serverCache.get(alt2);
        else if (serverCache.has(alt3)) cachedJob = serverCache.get(alt3);
        else if (serverCache.has(alt4)) cachedJob = serverCache.get(alt4);
        
        if (cachedJob) {
          job = { id: cleanId, ...(cachedJob.data || cachedJob) };
        }
      }
      
      if (!job) {
        console.log(`[ADMIN GET JOB] Job not found with ID: ${cleanId}`);
        return res.status(404).json({ success: false, error: "Not found" });
      }
      
      res.json({ success: true, job });
    } catch (error: any) {
      res.status(500).json({ success: false, error: "Failed to load job details. Please try again." });
    }
  });

  // Add job to Latest Jobs category manually
  app.post("/api/add-to-latest-jobs", verifyAdmin, async (req, res): Promise<any> => {
    try {
      const { title, url } = req.body;
      if (!title || !url) {
        return res.status(400).json({ success: false, error: "Title and URL are required" });
      }
      
      let homeData: any = null;
      let firestoreAvailable = false;
      if (adminDb) {
        const result = await safeFirestoreOp(async () => {
          const homeDocRef = doc(adminDb, 'home_data', 'index');
          const homeDoc = await getDoc(homeDocRef);
          if (homeDoc.exists()) return homeDoc.data();
          return null;
        }, null, 'add-to-latest-jobs read');
        if (result.success) {
          firestoreAvailable = true;
          homeData = result.value;
        }
      }
      if (!homeData) {
        homeData = serverCache.get('home_data_index');
      }
      
      if (!homeData) {
        return res.json({ success: false, error: "home_data/index not found" });
      }
      
      const titleLower = title.toLowerCase();
      let targetCategoryName = 'Latest Jobs';
      if (titleLower.includes('syllabus') || titleLower.includes('calendar') || titleLower.includes('calender') || titleLower.includes('pattern')) {
        targetCategoryName = 'Syllabus';
      } else if (titleLower.includes('admit card')) {
        targetCategoryName = 'Admit Card';
      } else if (titleLower.includes('result')) {
        targetCategoryName = 'Result';
      } else if (titleLower.includes('answer key')) {
        targetCategoryName = 'Answer Key';
      }
      
      // Find Target category
      if (Array.isArray(homeData.data)) {
        let targetCat = homeData.data.find((cat: any) => cat.title.toLowerCase().includes(targetCategoryName.toLowerCase()) || cat.id === targetCategoryName.toLowerCase().replace(' ', '-'));
        
        if (targetCat && Array.isArray(targetCat.links)) {
          const alreadyExists = targetCat.links.some((link: any) => 
            link.url.includes(url) || link.title === title
          );
          if (!alreadyExists) {
            const newLink = {
              id: `manual-${Math.random().toString(36).substring(7)}`,
              title: title,
              url: url,
              isNew: true
            };
            targetCat.links.unshift(newLink);
            
            if (adminDb && firestoreAvailable) {
              await safeFirestoreOp(async () => {
                const homeDocRef = doc(adminDb, 'home_data', 'index');
                await setDoc(homeDocRef, homeData);
              }, undefined, 'add-to-latest-jobs write');
            }
            
            serverCache.set('home_data_index', homeData);
            cache.set('home_data_index', { data: homeData, timestamp: Date.now() });
            saveCache();
            
            return res.json({ success: true, message: `Added to ${targetCategoryName} category` + (!firestoreAvailable ? " (saved to cache)" : "") });
          }
          return res.json({ success: false, error: `Already exists in ${targetCategoryName}` });
        }
      }
      
      return res.json({ success: false, error: "Target category not found" });
    } catch (err: any) {
      res.status(500).json({ success: false, error: "Failed to add to latest jobs. Please try again." });
    }
  });

  // Delete a job
  app.delete("/api/admin/job", verifyAdmin, async (req, res): Promise<any> => {
    try {
      const id = req.query.id as string;
      if (!id) return res.status(400).json({ success: false, error: "ID required" });
      
      let decodedId = id;
      try {
        decodedId = decodeURIComponent(id);
      } catch (e) {}
      const cleanId = decodedId.replace(/^\/+|\/+$/g, '');
      
      let jobData: any = null;
      let firestoreAvailable = false;
      if (adminDb) {
        const result = await safeFirestoreOp(async () => {
          const jobDocRef = doc(adminDb, 'jobs', cleanId);
          const jobDoc = await getDoc(jobDocRef);
          if (jobDoc.exists()) {
            const data = jobDoc.data();
            await deleteDoc(jobDocRef);
            return data;
          }
          return null;
        }, null, `admin/job delete ${cleanId}`);
        
        if (result.success && result.value) {
          firestoreAvailable = true;
          jobData = result.value;
        }
      }
      
      // Fallback: check cache with cleanId and alternate aliases
      if (!jobData) {
        const escapeDot = (s: string) => s.replace(/\./g, '%2E');
        const alt1 = `jobs_${cleanId}`;
        const alt2 = `jobs_${escapeDot(encodeURIComponent('/' + cleanId))}`;
        const alt3 = `jobs_${escapeDot(encodeURIComponent('/' + cleanId + '/'))}`;
        const alt4 = `jobs_${id}`;
        
        let cachedJob = null;
        if (serverCache.has(alt1)) cachedJob = serverCache.get(alt1);
        else if (serverCache.has(alt2)) cachedJob = serverCache.get(alt2);
        else if (serverCache.has(alt3)) cachedJob = serverCache.get(alt3);
        else if (serverCache.has(alt4)) cachedJob = serverCache.get(alt4);
        
        if (cachedJob) {
          jobData = cachedJob.data || cachedJob;
        }
      }
      
      if (!jobData) {
        return res.status(404).json({ success: false, error: "Job not found" });
      }
      
      // Compute safe job path
      let jobPath = jobData.path || '';
      if (!jobPath) {
        jobPath = '/' + cleanId + '/';
      }
      jobPath = jobPath.trim();
      
      console.log(`[DELETE] Deleting job: ${jobData.title} (ID: ${cleanId}, Path: ${jobPath})`);
      
      // Clean up cache by path & ID to ensure all duplicate aliases are completely purged
      for (const [key, item] of serverCache.entries()) {
        if (key.startsWith('jobs_')) {
          const keyId = key.substring(5);
          let decodedKeyId = keyId;
          try {
            decodedKeyId = decodeURIComponent(keyId);
          } catch (e) {}
          const cleanKeyId = decodedKeyId.replace(/^\/+|\/+$/g, '');
          
          let match = false;
          if (cleanKeyId === cleanId) {
            match = true;
          } else {
            const itemData = item.data || item;
            const itemPath = (itemData?.path || '').toLowerCase().trim();
            if (jobPath && itemPath === jobPath.toLowerCase().trim()) {
              match = true;
            }
          }
          
          if (match) {
            serverCache.delete(key);
            cache.delete(key);
          }
        }
      }
      
      // Clean up homepage references
      try {
        let homeData: any = null;
        if (adminDb && firestoreAvailable) {
          const homeResult = await safeFirestoreOp(async () => {
            const homeDocRef = doc(adminDb, 'home_data', 'index');
            const homeDoc = await getDoc(homeDocRef);
            if (homeDoc.exists()) return homeDoc.data();
            return null;
          }, null, 'delete cleanup home_data read');
          if (homeResult.success) homeData = homeResult.value;
        }
        if (!homeData) {
          homeData = serverCache.get('home_data_index');
        }
        
        if (homeData) {
          let changed = false;
          const encodedPath = encodeURIComponent(jobPath);
          
          if (Array.isArray(homeData.data)) {
            homeData.data.forEach((cat: any) => {
              if (Array.isArray(cat.links)) {
                const before = cat.links.length;
                cat.links = cat.links.filter((link: any) => {
                  const url = link.url || '';
                  return !url.includes(encodedPath) && !url.includes(jobPath);
                });
                if (cat.links.length !== before) changed = true;
              }
            });
          }
          if (Array.isArray(homeData.trending)) {
            const before = homeData.trending.length;
            homeData.trending = homeData.trending.filter((link: any) => {
              const url = link.url || '';
              return !url.includes(encodedPath) && !url.includes(jobPath);
            });
            if (homeData.trending.length !== before) changed = true;
          }
          if (changed) {
            if (adminDb && firestoreAvailable) {
              await safeFirestoreOp(async () => {
                const homeDocRef = doc(adminDb, 'home_data', 'index');
                await setDoc(homeDocRef, homeData);
              }, undefined, 'delete cleanup home_data write');
            }
            serverCache.set('home_data_index', homeData);
            cache.set('home_data_index', { data: homeData, timestamp: Date.now() });
            console.log(`[DELETE] Cleaned up homepage references for: ${jobPath}`);
          }
        }
      } catch (cleanErr: any) {
        console.error(`[DELETE CLEANUP] ${cleanErr.message}`);
      }
      
      saveCache();
      console.log(`[DELETE] Successfully deleted job: ${cleanId}`);
      res.json({ success: true, message: "Job deleted successfully" + (!firestoreAvailable ? " (saved to cache)" : "") });
    } catch (error: any) {
      console.error(`[DELETE ERROR] ${error.message}`);
      res.status(500).json({ success: false, error: "Failed to delete job. Please try again." });
    }
  });

  // Update a job content manually
  app.put("/api/admin/job", verifyAdmin, async (req, res): Promise<any> => {
    try {
      const { id, content, title, path, category } = req.body;
      if (!id) return res.status(400).json({ success: false, error: "ID required" });
      
      let decodedId = id;
      try {
        decodedId = decodeURIComponent(id);
      } catch (e) {}
      const cleanId = decodedId.replace(/^\/+|\/+$/g, '');
      
      console.log(`[UPDATE] Attempting to update job with ID: ${cleanId}`);
      
      let existingJobData: any = null;
      let firestoreAvailable = false;
      if (adminDb) {
        const result = await safeFirestoreOp(async () => {
          const jobDocRef = doc(adminDb, 'jobs', cleanId);
          const jobDoc = await getDoc(jobDocRef);
          if (jobDoc.exists()) {
            return jobDoc.data();
          }
          return null;
        }, null, `admin/job update get ${cleanId}`);
        
        if (result.success && result.value) {
          firestoreAvailable = true;
          existingJobData = result.value;
        }
      }
      
      // Fallback: check cache with cleanId and alternate aliases
      if (!existingJobData) {
        console.log(`[UPDATE] Looking for job in cache with ID: ${cleanId}`);
        console.log(`[UPDATE] Original ID from request: ${id}`);
        
        // Log all jobs_ cache keys for debugging
        const allJobKeys = Array.from(serverCache.keys()).filter(k => k.startsWith('jobs_'));
        console.log(`[UPDATE] All jobs_ cache keys (${allJobKeys.length}):`, allJobKeys.slice(0, 10));
        
        const escapeDot = (s: string) => s.replace(/\./g, '%2E');
        const alt1 = `jobs_${cleanId}`;
        const alt2 = `jobs_${escapeDot(encodeURIComponent('/' + cleanId))}`;
        const alt3 = `jobs_${escapeDot(encodeURIComponent('/' + cleanId + '/'))}`;
        const alt4 = `jobs_${id}`;
        
        console.log(`[UPDATE] Trying cache keys: ${alt1}, ${alt2}, ${alt3}, ${alt4}`);
        
        let cachedJob = null;
        if (serverCache.has(alt1)) cachedJob = serverCache.get(alt1);
        else if (serverCache.has(alt2)) cachedJob = serverCache.get(alt2);
        else if (serverCache.has(alt3)) cachedJob = serverCache.get(alt3);
        else if (serverCache.has(alt4)) cachedJob = serverCache.get(alt4);
        
        console.log(`[UPDATE] Cached job found: ${cachedJob ? 'YES' : 'NO'}`);
        
        if (cachedJob) {
          existingJobData = cachedJob.data || cachedJob;
        }
      }
      
      if (!existingJobData) {
        console.log(`[UPDATE] Job not found with ID: ${cleanId}`);
        return res.status(404).json({ success: false, error: "Job not found" });
      }
      
      console.log(`[UPDATE] Updating job: ${title} with ID: ${cleanId}`);
      const updateData: any = { 
        content, 
        title,
        updatedAt: new Date().toISOString()
      };
      if (path) {
        updateData.path = path;
      }
      if (category) {
        updateData.category = category;
      }
      
      // Try Firestore save (non-blocking - will fall back to cache)
      if (adminDb && firestoreAvailable) {
        await safeFirestoreOp(async () => {
          const jobDocRef = doc(adminDb, 'jobs', cleanId);
          await setDoc(jobDocRef, updateData, { merge: true });
        }, undefined, `admin/job update save ${cleanId}`);
      }
      
      // Always update cache for all matching aliases
      const escapeDot = (s: string) => s.replace(/\./g, '%2E');
      const aliases = [
        `jobs_${cleanId}`,
        `jobs_${escapeDot(encodeURIComponent('/' + cleanId))}`,
        `jobs_${escapeDot(encodeURIComponent('/' + cleanId + '/'))}`,
        `jobs_${id}`
      ];
      
      for (const aliasKey of aliases) {
        let cached = serverCache.get(aliasKey) || {};
        if (cached.data) cached = cached.data;
        cached = { ...cached, ...updateData };
        serverCache.set(aliasKey, cached);
        cache.set(aliasKey, { data: cached, timestamp: Date.now() });
      }
      
      // SYNC TITLE TO HOMEPAGE AND CATEGORY PAGES
      try {
          const jobPath = path || existingJobData.path;
          const encodedPathStr = encodeURIComponent(jobPath);
          
          // Helper to check if link matches the job path
          const matchesPath = (linkUrl: string) => {
              if (!linkUrl) return false;
              return linkUrl.includes(encodedPathStr) || linkUrl.includes(jobPath);
          };

          // 1. Update Home Data
          let homeData: any = null;
          if (adminDb && firestoreAvailable) {
              const homeResult = await safeFirestoreOp(async () => {
                  const homeDocRef = doc(adminDb, 'home_data', 'index');
                  const homeDoc = await getDoc(homeDocRef);
                  if (homeDoc.exists()) return homeDoc.data();
                  return null;
              }, null, 'sync home_data read');
              if (homeResult.success) homeData = homeResult.value;
          }
          if (!homeData) {
              homeData = serverCache.get('home_data_index');
          }
          
          if (homeData) {
              let updatedHome = false;
              if (Array.isArray(homeData.data)) {
                  homeData.data.forEach((cat: any) => {
                      if (Array.isArray(cat.links)) {
                          cat.links.forEach((link: any) => {
                              if (matchesPath(link.url) && link.title !== title) {
                                  link.title = title;
                                  updatedHome = true;
                              }
                          });
                      }
                  });
              }
              if (Array.isArray(homeData.trending)) {
                  homeData.trending.forEach((link: any) => {
                      if (matchesPath(link.url) && link.title !== title) {
                          link.title = title;
                          updatedHome = true;
                      }
                  });
              }
              if (updatedHome) {
                  if (adminDb && firestoreAvailable) {
                      await safeFirestoreOp(async () => {
                          const homeDocRef = doc(adminDb, 'home_data', 'index');
                          await setDoc(homeDocRef, homeData);
                      }, undefined, 'sync home_data write');
                  }
                  serverCache.set('home_data_index', homeData);
                  cache.set('home_data_index', { data: homeData, timestamp: Date.now() });
                  console.log(`[SYNC] Updated job title in home_data/index`);
              }
          }
          
          // 2. Update Category Pages
          if (adminDb && firestoreAvailable) {
              const catResult = await safeFirestoreOp(async () => {
                  const catDocs = await getDocs(collection(adminDb, 'category_pages'));
                  for (const catDoc of catDocs.docs) {
                      const catData = catDoc.data();
                      let updatedCat = false;
                      if (Array.isArray(catData.data)) {
                          catData.data.forEach((link: any) => {
                              if (matchesPath(link.url) && link.title !== title) {
                                  link.title = title;
                                  updatedCat = true;
                              }
                          });
                      }
                      if (updatedCat) {
                          await setDoc(catDoc.ref, catData);
                          serverCache.set(`category_pages_${catDoc.id}`, catData);
                          cache.set(`category_pages_${catDoc.id}`, { data: catData, timestamp: Date.now() });
                          console.log(`[SYNC] Updated job title in category_pages/${catDoc.id}`);
                      }
                  }
              }, undefined, 'sync category_pages');
              
              if (!catResult.success) {
                  // Fall back to cache-only category sync
                  const categories = ['latest-job', 'result', 'admit-card', 'answer-key', 'syllabus', 'admission'];
                  for (const categoryId of categories) {
                      let catData = serverCache.get(`category_pages_${categoryId}`);
                      if (catData) {
                          let updatedCat = false;
                          if (Array.isArray(catData.data)) {
                              catData.data.forEach((link: any) => {
                                  if (matchesPath(link.url) && link.title !== title) {
                                      link.title = title;
                                      updatedCat = true;
                                  }
                              });
                          }
                          if (updatedCat) {
                              serverCache.set(`category_pages_${categoryId}`, catData);
                              cache.set(`category_pages_${categoryId}`, { data: catData, timestamp: Date.now() });
                              console.log(`[SYNC] Updated job title in cached category_pages/${categoryId}`);
                          }
                      }
                  }
              }
          } else {
              // Cache-only category page sync
              const categories = ['latest-job', 'result', 'admit-card', 'answer-key', 'syllabus', 'admission'];
              for (const categoryId of categories) {
                  let catData = serverCache.get(`category_pages_${categoryId}`);
                  if (catData) {
                      let updatedCat = false;
                      if (Array.isArray(catData.data)) {
                          catData.data.forEach((link: any) => {
                              if (matchesPath(link.url) && link.title !== title) {
                                  link.title = title;
                                  updatedCat = true;
                              }
                          });
                      }
                      if (updatedCat) {
                          serverCache.set(`category_pages_${categoryId}`, catData);
                          cache.set(`category_pages_${categoryId}`, { data: catData, timestamp: Date.now() });
                          console.log(`[SYNC] Updated job title in cached category_pages/${categoryId}`);
                      }
                  }
              }
          }
      } catch (syncErr: any) {
          console.error(`[SYNC ERROR] Failed to sync job titles: ${syncErr.message}`);
      }
      
      saveCache();
      console.log(`[UPDATE] Successfully updated job: ${id}`);
      res.json({ success: true, message: "Job updated successfully" + (!firestoreAvailable ? " (saved to cache)" : "") });
    } catch (error: any) {
      console.error(`[UPDATE ERROR] ${error.message}`);
      res.status(500).json({ success: false, error: "Failed to update job. Please try again." });
    }
  });

  // Create a new job manually
  app.post("/api/admin/job", verifyAdmin, async (req, res): Promise<any> => {
    try {
      const { title, path, content, category } = req.body;
      if (!title || !path || !content) {
        return res.status(400).json({ success: false, error: "Title, path, and content are required" });
      }
      
      let targetCategory = category;
      
      const titleLower = title.toLowerCase();
      if (!targetCategory || targetCategory === 'latest-job') {
          if (titleLower.includes('syllabus') || titleLower.includes('calendar') || titleLower.includes('calender') || titleLower.includes('pattern')) {
              targetCategory = 'syllabus';
          } else if (titleLower.includes('admit card')) {
              targetCategory = 'admit-card';
          } else if (titleLower.includes('result')) {
              targetCategory = 'result';
          } else if (titleLower.includes('answer key')) {
              targetCategory = 'answer-key';
          }
      }
      
      if (!targetCategory) targetCategory = 'latest-job';
      
      const categoryTitles: Record<string, string> = {
        'latest-job': 'Latest Jobs',
        'result': 'Results',
        'admit-card': 'Admit Cards',
        'answer-key': 'Answer Keys',
        'syllabus': 'Syllabus',
        'admission': 'Admissions'
      };
      
      const targetCategoryTitle = categoryTitles[targetCategory] || 'Latest Jobs';
      
      // Ensure path always starts with / and ends with / for exact matching
      let targetPath = path;
      if (!targetPath.startsWith('/')) targetPath = '/' + targetPath;
      if (!targetPath.endsWith('/') && targetPath !== '/') targetPath = targetPath + '/';
      
      // Safe document ID for Firebase
      const jobId = encodeURIComponent(targetPath).replace(/\./g, '%2E');
      
      console.log(`[CREATE JOB] Creating manual job: ${title} with path: ${path}, Category: ${targetCategory}`);
      const jobData = { 
        title,
        path,
        content,
        category: targetCategory,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString()
      };
      
      // Try Firestore save (non-blocking)
      let firestoreAvailable = false;
      if (adminDb) {
        const result = await safeFirestoreOp(async () => {
          const docRef = doc(adminDb, 'jobs', jobId);
          await setDoc(docRef, jobData);
        }, undefined, `admin/job create ${jobId}`);
        firestoreAvailable = result.success;
      }
      
      // Always add to cache and sync aliases
      syncJobToCacheAndAliases(jobId, jobData);
      console.log(`[CREATE JOB] Added and synced to server cache`);
      
      // ADD TO HOMEPAGE (TARGET CATEGORY & TRENDING)
      try {
          let homeData: any = null;
          if (adminDb && firestoreAvailable) {
              const homeResult = await safeFirestoreOp(async () => {
                  const homeDocRef = doc(adminDb, 'home_data', 'index');
                  const homeDoc = await getDoc(homeDocRef);
                  if (homeDoc.exists()) return homeDoc.data();
                  return null;
              }, null, 'create job home_data read');
              if (homeResult.success) homeData = homeResult.value;
          }
          if (!homeData) {
              homeData = serverCache.get('home_data_index');
          }
          
          if (homeData) {
              const newLinkObj = {
                  id: `manual-${Math.random().toString(36).substring(7)}`,
                  title: title,
                  url: path,
                  isNew: true
              };
              
              // 1. Add to Trending (Marquee)
              if (Array.isArray(homeData.trending)) {
                  homeData.trending.unshift({ ...newLinkObj, id: `trend-manual-${Math.random().toString(36).substring(7)}` });
                  // Keep only top 10 in trending to avoid overcrowding
                  if (homeData.trending.length > 10) homeData.trending.length = 10;
              } else {
                  homeData.trending = [{ ...newLinkObj, id: `trend-manual-${Math.random().toString(36).substring(7)}` }];
              }
              
              // 2. Add to Selected Category
              if (Array.isArray(homeData.data)) {
                  // Find existing category - match by ID first, then by title (case-insensitive)
                  const targetCatData = homeData.data.find((c: any) => {
                      if (c.id === targetCategory) return true;
                      if (c.title && targetCategoryTitle) {
                          const catTitleLower = c.title.toLowerCase().trim();
                          const targetLower = targetCategoryTitle.toLowerCase().trim();
                          // Match exact title or title without trailing 's'
                          return catTitleLower === targetLower || 
                                 catTitleLower === targetLower + 's' || 
                                 catTitleLower + 's' === targetLower ||
                                 catTitleLower.replace(/s$/, '') === targetLower.replace(/s$/, '');
                      }
                      return false;
                  });
                  if (targetCatData) {
                      if (Array.isArray(targetCatData.links)) {
                          targetCatData.links.unshift(newLinkObj);
                      } else {
                          targetCatData.links = [newLinkObj];
                      }
                  } else {
                      console.log(`[CREATE JOB] WARNING: Category "${targetCategoryTitle}" not found on homepage.`);
                  }
              }
              
              if (adminDb && firestoreAvailable) {
                  await safeFirestoreOp(async () => {
                      const homeDocRef = doc(adminDb, 'home_data', 'index');
                      await setDoc(homeDocRef, homeData);
                  }, undefined, 'create job home_data write');
              }
              serverCache.set('home_data_index', homeData);
              cache.set('home_data_index', { data: homeData, timestamp: Date.now() });
              console.log(`[CREATE JOB] Added to Homepage ${targetCategoryTitle} & Trending Marquee`);
              
              // 3. Add to Category Page
              let catData = serverCache.get(`category_pages_${targetCategory}`);
              if (!catData && adminDb && firestoreAvailable) {
                  const catResult = await safeFirestoreOp(async () => {
                      const catDocRef = doc(adminDb, 'category_pages', targetCategory);
                      const catDoc = await getDoc(catDocRef);
                      if (catDoc.exists()) return catDoc.data();
                      return null;
                  }, null, 'create job category_page read');
                  if (catResult.success && catResult.value) {
                      catData = catResult.value;
                  }
              }
              
              if (!catData) {
                  catData = { data: [] };
              }
              
              if (Array.isArray(catData.data)) {
                  const exists = catData.data.some((l: any) => (l.url || l.path) === path);
                  if (!exists) {
                      catData.data.unshift(newLinkObj);
                  }
              }
              
              serverCache.set(`category_pages_${targetCategory}`, catData);
              cache.set(`category_pages_${targetCategory}`, { data: catData, timestamp: Date.now() });
              
              if (adminDb && firestoreAvailable) {
                  await safeFirestoreOp(async () => {
                      const catDocRef = doc(adminDb, 'category_pages', targetCategory);
                      await setDoc(catDocRef, catData);
                  }, undefined, 'create job category_page write');
              }
          }
      } catch (homeAddErr: any) {
          console.error(`[CREATE JOB] Error adding to homepage: ${homeAddErr.message}`);
      }
      
      saveCache();
      res.json({ success: true, message: "Job created successfully" + (!firestoreAvailable ? " (saved to cache)" : "") });
    } catch (error: any) {
      console.error(`[CREATE JOB ERROR] ${error.message}`);
      res.status(500).json({ success: false, error: "Failed to create job. Please try again." });
    }
  });

  // Auto-scrape and AI rewrite from sarkariresult.com.cm using Groq
  app.post("/api/admin/auto-scrape", verifyAdmin, async (req, res): Promise<any> => {
    try {
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ success: false, error: "URL is required" });
      }

      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) {
        return res.status(400).json({ success: false, error: "GROQ_API_KEY environment variable is not defined. Please add it to your settings or .env file." });
      }

      console.log(`[AUTO-SCRAPE] Fetching URL: ${url}`);
      const htmlResponse = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });

      if (!htmlResponse.ok) {
        return res.status(400).json({ success: false, error: `Failed to fetch page from external source. HTTP Status: ${htmlResponse.status}` });
      }

      const html = await htmlResponse.text();
      const $ = cheerio.load(html);

      // Clean known noise tags and SVG assets
      $('script, style, iframe, header, footer, nav, .sidebar, .comments, .ads, .advertisement, noscript, svg, path, symbol').remove();

      // Extract raw title
      let sourceTitle = $('.entry-title').first().text() || $('h1').first().text() || $('title').text() || '';
      sourceTitle = sourceTitle.trim();

      // Get entry content wrapper
      let mainContentEl = $('.entry-content').first();
      if (mainContentEl.length === 0) mainContentEl = $('main').first();
      if (mainContentEl.length === 0) mainContentEl = $('article').first();
      if (mainContentEl.length === 0) mainContentEl = $('.post-content').first();
      if (mainContentEl.length === 0) mainContentEl = $('#content').first();
      if (mainContentEl.length === 0) mainContentEl = $('body').first();

      // Strip known non-content classes/containers often found inside main
      mainContentEl.find('.social-buttons, .social-button, .entry-meta, .post-navigation, .sharedaddy, .related-posts, .author-info, #comments').remove();

      // Filter forbidden links programmatically
      const forbiddenKeywords = [
        't.me',
        'telegram',
        'whatsapp',
        'sarkariresult.com.cm',
        'play.google.com/store/apps',
        'com.vinod.sarkarinaukri',
        'com.vinod',
        'sarkarinaukri',
        'com.cm',
        'vocab',
        'vocab app',
        'english vocab'
      ];

      mainContentEl.find('a').each((i, el) => {
        const text = $(el).text().toLowerCase();
        const href = ($(el).attr('href') || '').toLowerCase();

        const isForbidden = forbiddenKeywords.some(keyword => text.includes(keyword) || href.includes(keyword));
        if (isForbidden) {
          // Check if inside a table row, delete the row
          const parentTr = $(el).closest('tr');
          if (parentTr.length > 0) {
            parentTr.remove();
          } else {
            const parentLi = $(el).closest('li');
            if (parentLi.length > 0) {
              parentLi.remove();
            } else {
              $(el).remove();
            }
          }
        }
      });

      // Extract tables and format them programmatically with beautiful Tailwind styles
      const extractedTables: string[] = [];
      mainContentEl.find('table').each((i, el) => {
        const tableEl = $(el);
        tableEl.attr('class', 'w-full border-collapse border-2 border-black my-6 text-sm md:text-base bg-white shadow-sm');
        
        tableEl.find('th, td').each((j, cell) => {
          const cellEl = $(cell);
          cellEl.removeAttr('style');
          cellEl.removeAttr('width');
          cellEl.removeAttr('height');
          cellEl.addClass('border-2 border-black p-2 text-center');
          
          const text = cellEl.text().toLowerCase();
          if (cell.name === 'th' || text.includes('important dates') || text.includes('application fee') || text.includes('vacancy details') || text.includes('post name') || text.includes('eligibility')) {
            cellEl.addClass('bg-[#104ba6] text-white font-bold');
          }
        });

        const tableHtml = $.html(el);
        extractedTables.push(tableHtml);
        $(el).replaceWith(`[TABLE_${i}]`);
      });

      // Strip all attributes from non-table tags EXCEPT href, src
      mainContentEl.find('*').each((i, el) => {
        if (el.name === 'table' || el.name === 'tr' || el.name === 'td' || el.name === 'th') return;
        const attribs = el.attribs;
        if (attribs) {
          const keep: Record<string, string> = {};
          if (attribs.href) keep.href = attribs.href;
          if (attribs.src) keep.src = attribs.src;
          el.attribs = keep;
        }
      });

      let contentHtml = mainContentEl.html() || '';
      // Collapse whitespace
      contentHtml = contentHtml.replace(/\s+/g, ' ').trim();

      if (!contentHtml.trim()) {
        return res.status(400).json({ success: false, error: "No content found in the scraped page." });
      }

      // Initialize Groq SDK
      const groq = new Groq({ apiKey });

      const systemPrompt = `You are a professional content writer and SEO expert for a leading job portal "Official Exam Notification" (https://ais-dev-7iqpmhrzyh47jg46x5xt4n-947562001125.asia-east1.run.app).
Your task is to rewrite the job details from a scraped post into extremely clean, clear, simple English.

Follow these strict rules:
1. Translate any Hindi words, Hinglish expressions, or local terms (e.g. "Apply Kaise Kare", "Bharti", "Naukri", "Sarkari Result") into high-quality, professional English (e.g. "How to Apply", "Recruitment", "Job", "Official Result").
2. Brand Sanitization: Remove ALL brand names of other websites, such as "Sarkari Result", "SarkariResult", "Sarkari Exam", "SarkariExam", "Sarkari", "sarkariresult.com.cm", etc. Never output these names under any circumstance!
3. Retain ALL table placeholders exactly as they are in the input, such as "[TABLE_0]", "[TABLE_1]", etc. Do not remove, translate, or modify these placeholders!
4. Remove any sections or links offering external social group joins like "Join Telegram", "Join WhatsApp", or similar if they point to third-party accounts.
5. Completely exclude and remove any sections, headings, lists, or content blocks titled "Important Question", "Important Questions", "FAQ", "Frequently Asked Questions", or similar, including all the question-and-answer text under them.
6. External Links & App Promotion: Completely exclude, clean up, or remove any Google Play Store links (especially those containing com.vinod or sarkarinaukri), com.cm references, and any references, buttons, headings, or links to downloading an "English Vocab App" or similar external apps. Do not mention them anywhere in the title or content.
7. Provide the response as a JSON object with exactly three fields:
   - "title": a polished, SEO-friendly title in simple English (e.g., "MP CPCT Exam Online Form 2026").
   - "category": the detected category of this post (must be exactly one of: "latest-job", "result", "admit-card", "answer-key", "syllabus", "admission").
   - "content": the completely rewritten, professional HTML body content inside a single container <div>, containing the restored "[TABLE_X]" placeholders.

Return ONLY the JSON. Do not wrap in markdown tags or add any conversational text. Just return the JSON object.`;

      console.log("[AUTO-SCRAPE] Invoking Groq API for rewrite with table placeholders...");
      let response;
      try {
        response = await groq.chat.completions.create({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Title to rewrite: "${sourceTitle}"\n\nContent to rewrite:\n${contentHtml}` }
          ],
          model: "llama-3.3-70b-versatile",
          response_format: { type: "json_object" },
          max_tokens: 2000
        });
      } catch (groqErr: any) {
        console.warn(`Primary model failed, trying fallback: ${groqErr.message}`);
        response = await groq.chat.completions.create({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Title to rewrite: "${sourceTitle}"\n\nContent to rewrite:\n${contentHtml}` }
          ],
          model: "llama-3.1-8b-instant",
          response_format: { type: "json_object" },
          max_tokens: 2000
        });
      }

      const rawResult = response.choices[0]?.message?.content || "";
      let parsedData;
      try {
        parsedData = JSON.parse(rawResult);
      } catch (parseErr: any) {
        console.error("Failed to parse Groq response as JSON:", rawResult);
        return res.status(500).json({ success: false, error: "The AI did not return a valid JSON format. Please try again." });
      }

      let { title: finalTitle, category: finalCategory, content: finalContent } = parsedData;
      if (!finalTitle || !finalContent) {
        return res.status(500).json({ success: false, error: "AI returned incomplete data (missing title or content)." });
      }

      // Re-insert formatted tables programmatically
      extractedTables.forEach((tableHtml, i) => {
        finalContent = finalContent.replace(`[TABLE_${i}]`, tableHtml);
      });

      // Safe category list validation
      const validCategories = ['latest-job', 'result', 'admit-card', 'answer-key', 'syllabus', 'admission'];
      let targetCategory = (finalCategory || '').toLowerCase().trim();
      if (!validCategories.includes(targetCategory)) {
        targetCategory = determineJobCategory(finalTitle, url);
      }

      const categoryTitles: Record<string, string> = {
        'latest-job': 'Latest Jobs',
        'result': 'Results',
        'admit-card': 'Admit Cards',
        'answer-key': 'Answer Keys',
        'syllabus': 'Syllabus',
        'admission': 'Admissions'
      };
      const targetCategoryTitle = categoryTitles[targetCategory] || 'Latest Jobs';

      // Parse slug path from URL
      let targetPath = '';
      try {
        const parsedUrl = new URL(url);
        targetPath = parsedUrl.pathname;
      } catch (e) {
        targetPath = url.substring(url.indexOf('.cm') + 3);
      }
      if (!targetPath.startsWith('/')) targetPath = '/' + targetPath;
      if (!targetPath.endsWith('/') && targetPath !== '/') targetPath = targetPath + '/';

      const jobId = encodeURIComponent(targetPath).replace(/\./g, '%2E');
      console.log(`[AUTO-SCRAPE SUCCESS] AI Title: "${finalTitle}" under "${targetCategory}", saving to path: ${targetPath}`);

      // Sanitize final content programmatically before saving
      finalContent = sanitizePostContent(finalContent);

      const jobData = {
        title: finalTitle,
        path: targetPath,
        content: finalContent,
        category: targetCategory,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString()
      };

      // Save to Firestore
      let firestoreAvailable = false;
      if (adminDb) {
        const result = await safeFirestoreOp(async () => {
          const docRef = doc(adminDb, 'jobs', jobId);
          await setDoc(docRef, jobData);
        }, undefined, `auto-scrape create ${jobId}`);
        firestoreAvailable = result.success;
      }

      // Add to server cache and all aliases
      syncJobToCacheAndAliases(jobId, jobData);

      // ADD TO HOMEPAGE INDEX (Trending & Categories)
      try {
        let homeData: any = null;
        if (adminDb && firestoreAvailable) {
          const homeResult = await safeFirestoreOp(async () => {
            const homeDocRef = doc(adminDb, 'home_data', 'index');
            const homeDoc = await getDoc(homeDocRef);
            if (homeDoc.exists()) return homeDoc.data();
            return null;
          }, null, 'auto-scrape home_data read');
          if (homeResult.success) homeData = homeResult.value;
        }
        if (!homeData) {
          homeData = serverCache.get('home_data_index');
        }

        if (homeData) {
          const newLinkObj = {
            id: `scrape-${Math.random().toString(36).substring(7)}`,
            title: finalTitle,
            url: targetPath,
            isNew: true
          };

          // Update trending
          if (Array.isArray(homeData.trending)) {
            homeData.trending.unshift({ ...newLinkObj, id: `trend-scrape-${Math.random().toString(36).substring(7)}` });
            if (homeData.trending.length > 10) homeData.trending.length = 10;
          } else {
            homeData.trending = [{ ...newLinkObj, id: `trend-scrape-${Math.random().toString(36).substring(7)}` }];
          }

          // Update Category on Homepage
          if (Array.isArray(homeData.data)) {
            const targetCatData = homeData.data.find((c: any) => {
              if (c.id === targetCategory) return true;
              if (c.title && targetCategoryTitle) {
                const catTitleLower = c.title.toLowerCase().trim();
                const targetLower = targetCategoryTitle.toLowerCase().trim();
                return catTitleLower === targetLower || 
                       catTitleLower === targetLower + 's' || 
                       catTitleLower + 's' === targetLower ||
                       catTitleLower.replace(/s$/, '') === targetLower.replace(/s$/, '');
              }
              return false;
            });

            if (targetCatData) {
              if (Array.isArray(targetCatData.links)) {
                // Ensure no duplicates exist in same category
                const exists = targetCatData.links.some((l: any) => l.url === targetPath);
                if (!exists) {
                  targetCatData.links.unshift(newLinkObj);
                }
              } else {
                targetCatData.links = [newLinkObj];
              }
            }
          }

          if (adminDb && firestoreAvailable) {
            await safeFirestoreOp(async () => {
              const homeDocRef = doc(adminDb, 'home_data', 'index');
              await setDoc(homeDocRef, homeData);
            }, undefined, 'auto-scrape home_data write');
          }
          serverCache.set('home_data_index', homeData);
          cache.set('home_data_index', { data: homeData, timestamp: Date.now() });
        }
      } catch (homeErr: any) {
        console.error(`[AUTO-SCRAPE] Failed to update homepage index: ${homeErr.message}`);
      }

      // ADD TO CATEGORY PAGE
      try {
        const newLinkObj = {
          id: `scrape-${Math.random().toString(36).substring(7)}`,
          title: finalTitle,
          url: targetPath,
          isNew: true
        };

        let catData = serverCache.get(`category_pages_${targetCategory}`);
        if (!catData && db && firestoreAvailable) {
          const catResult = await safeFirestoreOp(async () => {
            const catDocRef = doc(db, 'category_pages', targetCategory);
            const catDoc = await getDoc(catDocRef);
            if (catDoc.exists()) return catDoc.data();
            return null;
          }, null, 'auto-scrape category_page read');
          if (catResult.success && catResult.value) {
            catData = catResult.value;
          }
        }

        if (!catData) {
          catData = { data: [] };
        }

        if (Array.isArray(catData.data)) {
          const exists = catData.data.some((l: any) => (l.url || l.path) === targetPath);
          if (!exists) {
            catData.data.unshift(newLinkObj);
          }
        }

        serverCache.set(`category_pages_${targetCategory}`, catData);
        cache.set(`category_pages_${targetCategory}`, { data: catData, timestamp: Date.now() });

        if (adminDb && firestoreAvailable) {
          await safeFirestoreOp(async () => {
            const catDocRef = doc(adminDb, 'category_pages', targetCategory);
            await setDoc(catDocRef, catData);
          }, undefined, 'auto-scrape category_page write');
        }
      } catch (catErr: any) {
        console.error(`[AUTO-SCRAPE] Failed to update category pages: ${catErr.message}`);
      }

      saveCache();
      res.json({
        success: true,
        message: `Job scraped, AI-rewritten, and published successfully under "${targetCategoryTitle}"!`,
        job: jobData
      });

    } catch (error: any) {
      console.error(`[AUTO-SCRAPE ERROR] ${error.message}`);
      res.status(500).json({ success: false, error: error.message || "Failed to auto-scrape and process job post." });
    }
  });

  // Upload APK file endpoint (with multer error handling wrapper)
  app.post("/api/admin/upload-apk", verifyAdmin, (req: any, res: any, next: any) => {
    // Wrap multer in a manual call so we can catch its errors and return JSON
    upload.single('apk')(req, res, (multerErr: any) => {
      if (multerErr) {
        console.error(`[APK UPLOAD] Multer error: ${multerErr.message}`);
        if (multerErr.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ success: false, error: "File size exceeds the 50MB limit." });
        }
        return res.status(400).json({ success: false, error: multerErr.message || "File upload failed." });
      }
      next();
    });
  }, async (req: any, res: any): Promise<any> => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: "No file uploaded. Please select an APK file." });
      }
      
      console.log(`[APK UPLOAD] File received in memory: ${req.file.originalname}, Size: ${req.file.size} bytes`);
      
      // Write the file from memory buffer to disk
      const publicDir = path.join(process.cwd(), 'public');
      const apkFilePath = path.join(publicDir, 'govexam-app.apk');
      
      try {
        // Ensure public directory exists
        if (!fs.existsSync(publicDir)) {
          fs.mkdirSync(publicDir, { recursive: true });
        }
        fs.writeFileSync(apkFilePath, req.file.buffer);
        console.log(`[APK UPLOAD] File written to: ${apkFilePath}`);
      } catch (writeErr: any) {
        console.error(`[APK UPLOAD] Failed to write file to disk: ${writeErr.message}`);
        // On serverless platforms (Vercel etc.), disk write may fail — that's OK, we still save version info
        console.log(`[APK UPLOAD] Continuing without disk write (serverless environment)`);
      }
      
      // Update app version info in Firestore
      const { versionCode, versionName, releaseNotes, isMandatory } = req.body;
      
      if (versionCode && versionName) {
        const versionData = {
          versionCode: parseInt(versionCode),
          versionName: versionName,
          downloadUrl: 'https://govexamnotification.online/govexam-app.apk',
          releaseNotes: releaseNotes || 'Bug fixes and performance improvements.',
          isMandatory: isMandatory === 'true' || isMandatory === true,
          updatedAt: new Date().toISOString()
        };
        
        if (db) {
          await safeFirestoreOp(async () => {
            const appUpdateRef = doc(db, 'app_updates', 'android');
            await setDoc(appUpdateRef, versionData, { merge: true });
            console.log(`[APK UPLOAD] Updated app version info in Firestore: v${versionName} (${versionCode})`);
          }, undefined, 'upload-apk version update');
        }
        
        // Always save to cache
        serverCache.set('app_updates_android', versionData);
        cache.set('app_updates_android', { data: versionData, timestamp: Date.now() });
        saveCache();
      }
      
      res.json({ 
        success: true, 
        message: "APK file uploaded successfully",
        filename: 'govexam-app.apk',
        size: req.file.size
      });
    } catch (error: any) {
      console.error(`[APK UPLOAD ERROR] ${error.message}`);
      res.status(500).json({ success: false, error: "Failed to upload APK. Please try again." });
    }
  });
  // Rebuild home_data manually from jobs collection (Admin only)
  app.get("/api/admin/rebuild-home", async (req, res): Promise<any> => {
    try {
      if (!db) return res.status(500).json({ success: false, error: "Database not available" });
      
      console.log('[REBUILD] Starting home_data rebuild...');
      
      // 1. Fetch ALL jobs with limit to prevent data exhaustion
      const jobsQuery = firebaseQuery(collection(db, 'jobs')).limit(2000);
      const jobsSnapshot = await getDocs(jobsQuery);
      
      const allJobs: any[] = [];
      jobsSnapshot.forEach(doc => {
          const job = { id: doc.id, ...doc.data() as any };
          const jobPath = (job.path || job.url || '').toLowerCase().trim();
          if (jobPath) {
              allJobs.push({
                  id: job.id,
                  title: job.title || 'Untitled',
                  url: jobPath,
                  path: jobPath,
                  updatedAt: job.updatedAt || job.createdAt || job.postDate || ''
              });
          }
      });
      
      // Sort newest first
      allJobs.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
      
      // 2. Initialize default categories
      const newHomeData = {
          data: [
              { id: 'result', title: 'Result', links: [] },
              { id: 'admit-card', title: 'Admit Card', links: [] },
              { id: 'latest-job', title: 'Latest Jobs', links: [] },
              { id: 'answer-key', title: 'Answer Key', links: [] },
              { id: 'syllabus', title: 'Syllabus', links: [] },
              { id: 'admission', title: 'Admission', links: [] },
              { id: 'calendar', title: 'Calendar', links: [] },
              { id: 'documents', title: 'Documents', links: [] }
          ],
          trending: []
      };
      
      // 3. Map jobs to categories
      const categoryMap = new Map<string, any[]>();
      newHomeData.data.forEach((c: any) => categoryMap.set(c.id, []));
      
      const getBucketForCat = (catId: string) => {
          for (const [key] of categoryMap.entries()) {
              if (key === catId) return key;
              if (key.includes(catId) || catId.includes(key)) return key;
          }
          return null;
      };
      
      allJobs.forEach(job => {
          let trueCat = determineJobCategory(job.title, job.url);
          let bucketKey = getBucketForCat(trueCat) || getBucketForCat('latest-job');
          if (bucketKey && categoryMap.has(bucketKey)) {
              if (categoryMap.get(bucketKey)!.length < 30) {
                  categoryMap.get(bucketKey)!.push(job);
              }
          }
      });
      
      // 4. Update buckets
      newHomeData.data.forEach((category: any) => {
          let bucketKey = getBucketForCat(category.id);
          if (bucketKey && categoryMap.has(bucketKey)) {
              category.links = categoryMap.get(bucketKey);
              categoryMap.delete(bucketKey);
          }
      });
      
      // 5. Update trending (top 10 overall)
      newHomeData.trending = allJobs.slice(0, 10).map((job, idx) => ({ ...job, id: `trend-${job.id}-${idx}` }));
      
      // 6. Save to Firestore
      const homeDocRef = doc(db, 'home_data', 'index');
      await setDoc(homeDocRef, newHomeData);
      
      // Update Cache
      serverCache.set('home_data_index', newHomeData);
      cache.set('home_data_index', { data: newHomeData, timestamp: Date.now() });
      saveCache();
      
      console.log('[REBUILD] Successfully rebuilt home_data');
      return res.json({ success: true, message: "Homepage rebuilt successfully", totalJobsAssigned: allJobs.length });
    } catch (err: any) {
      console.error('[REBUILD ERROR]', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get app version info endpoint
  app.get("/api/app-version", async (req, res): Promise<any> => {
    try {
      const defaultVersion = {
        success: true,
        versionCode: 1,
        versionName: "1.0",
        downloadUrl: 'https://govexamnotification.online/govexam-app.apk',
        releaseNotes: 'Initial release',
        isMandatory: false,
        updatedAt: new Date().toISOString()
      };
      
      // Try cache first
      const cachedVersion = serverCache.get('app_updates_android');
      
      if (db) {
        const result = await safeFirestoreOp(async () => {
          const appUpdateRef = doc(db, 'app_updates', 'android');
          const appUpdateDoc = await getDoc(appUpdateRef);
          if (appUpdateDoc.exists()) {
            return appUpdateDoc.data();
          }
          return null;
        }, null, 'app-version read');
        
        if (result.success && result.value) {
          const data = result.value;
          return res.json({
            success: true,
            versionCode: data.versionCode,
            versionName: data.versionName,
            downloadUrl: data.downloadUrl,
            releaseNotes: data.releaseNotes,
            isMandatory: data.isMandatory,
            updatedAt: data.updatedAt
          });
        }
      }
      
      // Fallback to cache
      if (cachedVersion) {
        return res.json({ success: true, ...cachedVersion });
      }
      
      // Return default
      res.json(defaultVersion);
    } catch (error: any) {
      console.error(`[APP VERSION ERROR] ${error.message}`);
      res.status(500).json({ success: false, error: "Failed to get app version info." });
    }
  });

  // 301 redirect for old ?path= URLs to clean URLs
  app.use((req, res, next) => {
    if (req.query.path && typeof req.query.path === 'string') {
      const oldPath = req.query.path;
      // Redirect to clean URL
      return res.redirect(301, oldPath);
    }
    next();
  });

  // Serve static files from public directory (for APK, images, etc.)
  const publicPath = path.join(process.cwd(), 'public');
  app.use(express.static(publicPath));

  // Vite middleware for development
  const distPath = path.join(process.cwd(), 'dist');
  const hasDist = fs.existsSync(path.join(distPath, 'index.html'));

  if (process.env.NODE_ENV !== "production" || process.env.DISABLE_HMR === "true" || !hasDist) {
    console.log(`[SERVER_START] Starting in dev/fallback mode (dist exists: ${hasDist}). Using Vite development middleware.`);
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log(`[SERVER_START] Starting in production mode. Serving static files from ${distPath}.`);
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
