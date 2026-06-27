import express from "express";
import path from "path";
import * as cheerio from "cheerio";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { startCronScheduler, serverCache } from "./src/lib/scheduler";
import fs from "fs";

// Initialize Firebase Admin for FCM
let adminApp: any = null;

async function initFirebaseAdmin() {
  try {
    const admin = await import("firebase-admin");
    if (!admin.getApps().length) {
      let credential;
      // Check if GOOGLE_APPLICATION_CREDENTIALS is a JSON string (for AI Studio Secrets)
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS && process.env.GOOGLE_APPLICATION_CREDENTIALS.trim().startsWith('{')) {
        credential = admin.cert(JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS));
      } else {
        credential = admin.applicationDefault();
      }
      adminApp = admin.initializeApp({ credential });
    }
  } catch (e) {
    console.log("Firebase admin initialization skipped or failed", e);
  }
}
initFirebaseAdmin();

// Persistent cache storage using JSON file
const CACHE_FILE = path.join(__dirname, 'cache.json');
const CACHE_DURATION_MS = 6 * 60 * 60 * 1000; // 6 hours in milliseconds

// Load cache from file on startup
let cache = new Map<string, { data: any, timestamp: number }>();
try {
  if (fs.existsSync(CACHE_FILE)) {
    const cacheData = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    cache = new Map(Object.entries(cacheData));
    console.log(`[CACHE] Loaded ${cache.size} items from ${CACHE_FILE}`);
  }
} catch (e) {
  console.log('[CACHE] No existing cache file found, starting fresh');
}

// Save cache to file
const saveCache = () => {
  try {
    const cacheObj = Object.fromEntries(cache);
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheObj, null, 2));
  } catch (e) {
    console.error('[CACHE] Failed to save cache:', e);
  }
};

const inFlightRequests = new Map<string, Promise<any>>();

// Initialize Firebase SDK
let db: any;
let config: any;
try {
  config = {
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  appId: process.env.VITE_FIREBASE_APP_ID,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
};
  
  // Override with environment variables if provided
  if (process.env.VITE_FIREBASE_PROJECT_ID) config.projectId = process.env.VITE_FIREBASE_PROJECT_ID;
  if (process.env.VITE_FIREBASE_API_KEY) config.apiKey = process.env.VITE_FIREBASE_API_KEY;
  if (process.env.VITE_FIREBASE_APP_ID) config.appId = process.env.VITE_FIREBASE_APP_ID;
  if (process.env.VITE_FIREBASE_MESSAGING_SENDER_ID) config.messagingSenderId = process.env.VITE_FIREBASE_MESSAGING_SENDER_ID;
  if (process.env.VITE_FIREBASE_AUTH_DOMAIN) config.authDomain = process.env.VITE_FIREBASE_AUTH_DOMAIN;
  if (process.env.VITE_FIREBASE_STORAGE_BUCKET) config.storageBucket = process.env.VITE_FIREBASE_STORAGE_BUCKET;

  const app = initializeApp(config);
  db = getFirestore(app);
  startCronScheduler(db);
} catch (e: any) {
  console.error('Firebase initialization failed:', e);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Serve dynamic firebase config for service worker
  app.get("/api/firebase-config.js", (req, res) => {
      res.setHeader("Content-Type", "application/javascript");
      res.send(`self.DYNAMIC_FIREBASE_CONFIG = ${JSON.stringify(config || {})};`);
  });

  app.use(express.json());

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

  // Helper to scramble sequences stable and deterministically within chunks
  const maskSequence = (links: any[]): any[] => {
      if (!links || !Array.isArray(links) || links.length <= 1) return links || [];
      
      const result = [...links];
      for (let i = 0; i < result.length - 1; i += 3) {
          const chunkLen = Math.min(3, result.length - i);
          if (chunkLen === 2) {
              const temp = result[i];
              result[i] = result[i + 1];
              result[i + 1] = temp;
          } else if (chunkLen === 3) {
              const temp = result[i];
              result[i] = result[i + 1];
              result[i + 1] = result[i + 2];
              result[i + 2] = temp;
          }
      }
      return result;
  };

  const maskDataSequence = (homeData: any): any => {
      if (!homeData) return homeData;
      
      try {
          const copiedData = JSON.parse(JSON.stringify(homeData));
          
          if (copiedData.data && Array.isArray(copiedData.data)) {
              copiedData.data.forEach((category: any) => {
                  if (category && category.links) {
                      category.links = maskSequence(category.links);
                  }
              });
          }
          
          if (copiedData.trending && Array.isArray(copiedData.trending)) {
              copiedData.trending = maskSequence(copiedData.trending);
          }
          
          return copiedData;
      } catch (err) {
          console.error("Failed to mask home data sequence", err);
          return homeData;
      }
  };

  // Helper to replace copyrighted "How to Fill/Check/Download" instruction blocks with a premium YouTube Video Guide search card
  const replaceHowToWithYouTubeCTA = (contentHtml: string, pageTitle: string): string => {
      if (!contentHtml) return contentHtml;
      
      try {
          const $ = cheerio.load(contentHtml);
          
          // Helper to generate the new blue banner
          const generateCtaHtml = (heading: string) => {
              const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(heading)}`;
              const lowerTitle = pageTitle.toLowerCase();
              const lowerHeading = heading.toLowerCase();

              let badgeText = "Form Fill-up Video Guide";
              let descriptionText = "Sarkari form bharne me koi dikkat aa rahi hai? Is video guide pe click karke YouTube par step-by-step tutorial video dekhen aur bina kisi galti ke apna form fill karein.";
              let btnText = "Watch Video Guide";

              if (lowerTitle.includes('result') || lowerHeading.includes('result')) {
                  badgeText = "Result Checking Guide";
                  descriptionText = "Sarkari exam result check karne me koi dikkat aa rahi hai? Is video guide pe click karke YouTube par result download karne ka live step-by-step tutorial video dekhein.";
                  btnText = "Watch Result Video";
              } else if (lowerTitle.includes('admit card') || lowerHeading.includes('admit card') || lowerTitle.includes('hall ticket') || lowerHeading.includes('hall ticket')) {
                  badgeText = "Admit Card Download Guide";
                  descriptionText = "Admit card download karne me koi mushkil ho rahi hai? Is video guide pe click karke YouTube par admit card direct download link aur step-by-step process ka live video dekhein.";
                  btnText = "Watch Admit Card Video";
              } else if (lowerTitle.includes('answer key') || lowerHeading.includes('answer key')) {
                  badgeText = "Answer Key Video Guide";
                  descriptionText = "Exam answer key link check karne aur response sheet download karne me koi dikqat hai? Is video guide pe click karke YouTube par step-by-step tutorial video dekhein.";
                  btnText = "Watch Answer Key Video";
              } else if (lowerTitle.includes('syllabus') || lowerHeading.includes('syllabus')) {
                  badgeText = "Syllabus Video Guide";
                  descriptionText = "Syllabus aur exam pattern samajhne me koi up-down lag raha hai? Is video guide pe click karke YouTube par detailed syllabus breakdown analysis aur tips ka video dekhein.";
                  btnText = "Watch Syllabus Video";
              } else if (lowerTitle.includes('admission') || lowerHeading.includes('admission')) {
                  badgeText = "Admission Form Filling Guide";
                  descriptionText = "College/University Admission registration form bharne me koi confusion hai? Click karke YouTube par full registration process ka real step-by-step guide video dekhein.";
                  btnText = "Watch Admission Guide";
              }

              return `
<div class="cta-injected-blue-box my-6 p-5 md:p-6 bg-[#f0f5ff] border-2 border-[#104ba6]/20 rounded-xl shadow-sm text-left max-w-full flex flex-col md:flex-row items-center gap-5 justify-between font-sans">
  <div class="flex items-start gap-4">
    <div class="flex-shrink-0 bg-red-600 text-white rounded-lg p-2.5 shadow-md flex items-center justify-center">
       <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="currentColor" class="text-white">
          <path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.11C19.517 3.545 12 3.545 12 3.545s-7.517 0-9.388.508a3.003 3.003 0 0 0-2.11 2.11C0 8.033 0 12 0 12s0 3.967.502 5.837a3.003 3.003 0 0 0 2.11 2.11C4.483 20.455 12 20.455 12 20.455s7.517 0 9.388-.508a3.003 3.003 0 0 0 2.11-2.11C24 15.967 24 12 24 12s0-3.967-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
       </svg>
    </div>
    <div class="flex-1">
       <span class="inline-block bg-[#104ba6] text-white text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded mb-1.5 shadow-sm font-sans">${badgeText}</span>
       <h4 class="text-[16px] md:text-lg font-black text-gray-900 leading-tight">${heading}</h4>
       <p class="text-[13px] text-gray-600 mt-1 leading-relaxed font-sans">
          ${descriptionText}
       </p>
    </div>
  </div>
  <div class="w-full md:w-auto flex-shrink-0">
     <a href="${searchUrl}" target="_blank" rel="noopener noreferrer" class="cta-btn w-full md:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 bg-white text-red-600 font-bold rounded-lg shadow-sm hover:bg-neutral-50 transition-all text-[13.5px] uppercase tracking-wider border border-red-200 font-sans">
        <span>${btnText}</span>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/></svg>
     </a>
  </div>
</div>`;
          };

          // 1. Extreme cleanup: find any DOM element that contains our known CTA text or is an old red box, and obliterate it
          // Known old red backgrounds: bg-red-50, bg-red-100, border-red-200, cta-btn
          let globalHeadingToUse = 'How To Apply/Check';
          
          const findAndDestroyOldBoxes = () => {
              let count = 0;
              
              $('div').each((_, el) => {
                  const $el = $(el);
                  const classStr = $el.attr('class') || '';
                  const textStr = $el.text() || '';
                  
                  // Identify old or new injected CTAs based on styling or text
                  const isRedBox = classStr.includes('bg-red-50') || classStr.includes('bg-red-100');
                  const isBlueBox = classStr.includes('bg-[#f0f5ff]') || classStr.includes('cta-injected-blue-box');
                  const hasVideoBtn = $el.find('.cta-btn').length > 0;
                  const hasOldBadgeText = textStr.includes('Video Guide') && textStr.includes('Step-by-step tutorial');
                  
                  const isObsoleteWrapper = isRedBox || isBlueBox || (hasVideoBtn && classStr.includes('rounded'));
                  
                  if (isObsoleteWrapper) {
                      // Capture the heading if we haven't already got a better one
                      const $h4 = $el.find('h4');
                      if ($h4.length > 0) {
                          globalHeadingToUse = $h4.text().trim();
                      } else {
                          const match = $el.find('a').attr('href')?.match(/search_query=([^&]+)/);
                          if (match && match[1]) {
                              globalHeadingToUse = decodeURIComponent(match[1]).replace(/\+/g, ' ');
                          }
                      }
                      
                      $el.remove();
                      count++;
                  }
              });
              return count;
          };

          const removedCount = findAndDestroyOldBoxes();

          // If we removed ANY boxes (red or blue), it means the CTA was already in the document.
          // We'll just generate ONE pristine blue box and insert it at the very top of the article, OR just return if we already injected.
          // Wait, better yet, just reconstruct exactly ONE blue box and put it before the first table, or at the end.
          // If we removed old boxes, we MUST re-inject the unified blue box so they still get it.
          if (removedCount > 0) {
              const freshHtml = generateCtaHtml(globalHeadingToUse);
              // Just inject it before the first h2 or table
              const anchor = $('table').first().length > 0 ? $('table').first() : $('h2').first();
              if (anchor.length > 0) {
                  const parentT = anchor.parent('.overflow-x-auto');
                  if (parentT.length > 0) {
                      parentT.before(freshHtml);
                  } else {
                      anchor.before(freshHtml);
                  }
              } else {
                  // fallback
                  $.root().append(freshHtml);
              }
              return $.html();
          }

          let replacedAny = false;

          const cleanPageTitle = pageTitle
              .replace(/(Official\s+Sarkari\s+Result\s+Website|Sarkari\s*Result|\.com|\.cm|\|)/gi, 'Official GOVEXAM NOTIFICATION Website')
              .replace(/\s+/g, ' ')
              .trim();

          // 1. Process all tables
          $('table').each((idx, table) => {
              const $table = $(table);
              const text = $table.text();
              const lowerText = text.toLowerCase();

              // Check if this table is the "How to Fill" or "How to Check/Download" table
              const isHowToMatch = (
                  lowerText.includes('how to fill') || 
                  lowerText.includes('how to check') || 
                  lowerText.includes('how to download') || 
                  lowerText.includes('how to apply') || 
                  lowerText.includes('how to register') ||
                  lowerText.includes('how to online form') ||
                  lowerText.includes('how to check result') ||
                  lowerText.includes('how to download admit') ||
                  lowerText.includes('how to download syllabus') ||
                  lowerText.includes('how to download answer key')
              );

              // Also check for standard keywords in instruction blocks to avoid false positives
              const hasInstructKeywords = (
                  lowerText.includes('candidate') ||
                  lowerText.includes('photo') ||
                  lowerText.includes('signature') ||
                  lowerText.includes('eligibility') ||
                  lowerText.includes('document') ||
                  lowerText.includes('thumb impression') ||
                  lowerText.includes('recruitment details') ||
                  lowerText.includes('print out') ||
                  lowerText.includes('application form mun') ||
                  lowerText.includes('re-checked') ||
                  lowerText.includes('result') ||
                  lowerText.includes('admit card') ||
                  lowerText.includes('download') ||
                  lowerText.includes('registration number') ||
                  lowerText.includes('password') ||
                  lowerText.includes('roll number') ||
                  lowerText.includes('date of birth') ||
                  lowerText.includes('official website') ||
                  lowerText.includes('click on') ||
                  lowerText.includes('link') ||
                  lowerText.includes('scroll down') ||
                  lowerText.includes('enter your')
              );

              if (isHowToMatch && hasInstructKeywords) {
                  // Find the header or heading row's text to make a precise search query
                  let extractedHeading = '';
                  $table.find('tr').slice(0, 3).each((_, row) => {
                      const rowText = $(row).text().replace(/\s+/g, ' ').trim();
                      if (rowText.toLowerCase().includes('how to') && rowText.length > 10 && rowText.length < 150) {
                          extractedHeading = rowText;
                          return false; // break
                      }
                  });

                  if (!extractedHeading) {
                      const lowerTitle = cleanPageTitle.toLowerCase();
                      if (lowerTitle.includes('result')) {
                          extractedHeading = `How To Check ${cleanPageTitle} Result`;
                      } else if (lowerTitle.includes('admit card') || lowerTitle.includes('hall ticket')) {
                          extractedHeading = `How To Download ${cleanPageTitle} Admit Card`;
                      } else if (lowerTitle.includes('answer key')) {
                          extractedHeading = `How To Check ${cleanPageTitle} Answer Key`;
                      } else if (lowerTitle.includes('syllabus')) {
                          extractedHeading = `How To Download ${cleanPageTitle} Syllabus`;
                      } else {
                          extractedHeading = `How To Fill ${cleanPageTitle} Online Form`;
                      }
                  } else {
                      // Clean reference if any
                      extractedHeading = extractedHeading
                          .replace(/(Sarkari\s*Result|SarkariResult|Sarkari\s*Naukri|\.com|\.cm|\|)/gi, '')
                          .replace(/\s+/g, ' ')
                          .trim();
                  }

                  const ctaHtml = generateCtaHtml(extractedHeading);

                  // If the table was in an overflow-x wrapper, replace or insert outside
                  const parent = $table.parent('.overflow-x-auto');
                  if (!replacedAny) {
                      if (parent.length > 0) {
                          parent.replaceWith(ctaHtml);
                      } else {
                          $table.replaceWith(ctaHtml);
                      }
                      replacedAny = true;
                  }
                  // Don't remove other tables - they might contain legitimate links
              }
          });

          // 2. Fallback: Process plain lists or paragraphs if they contain instructions
          if (!replacedAny) {
              // If there's no table, inspect fallback headers/paragraphs
              let processedParagraphs = false;
              
              $('h1, h2, h3, h4, h5, p, div').each((_, el) => {
                  const $el = $(el);
                  const text = $el.text().replace(/\s+/g, ' ').trim();
                  const lowerText = text.toLowerCase();

                  const isHeadingMatch = (
                      lowerText.startsWith('how to fill') || 
                      lowerText.startsWith('how to check') || 
                      lowerText.startsWith('how to download') ||
                      lowerText.startsWith('how to apply')
                  ) && text.length > 10 && text.length < 150;

                  if (isHeadingMatch) {
                      const extractedHeading = text.replace(/(Sarkari\s*Result|SarkariResult|Sarkari\s*Naukri|\.com|\.cm|\|)/gi, '').trim();
                      const ctaHtml = generateCtaHtml(extractedHeading);

                      // Remove siblings that look like instruction lists/paragraphs
                      let current = $el.next();
                      while (current.length > 0) {
                          const tag = current[0].tagName.toLowerCase();
                          if (tag === 'table' || tag === 'h1' || tag === 'h2') {
                              break;
                          }
                          if (tag === 'p' || tag === 'ul' || tag === 'ol' || tag === 'div') {
                              const nextSibling = current.next();
                              current.remove();
                              current = nextSibling;
                          } else {
                              break;
                          }
                      }

                      $el.replaceWith(ctaHtml);
                      processedParagraphs = true;
                      return false; // break the loop
                  }
              });
          }

          return $.html();
      } catch (e: any) {
          console.error("Error in replaceHowToWithYouTubeCTA:", e.message);
          return contentHtml;
      }
  };

  // Simple in-memory rate limiting structure
  const rateLimitMap = new Map<string, { count: number, resetTime: number }>();
  const RATE_LIMIT_SEC = 60 * 1000; // 1 minute
  const MAX_REQUESTS_PER_MIN = 30; // Max requests per user IP

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
          // Read Home index data
          try {
              const homeDocRef = doc(db, 'home_data', 'index');
              const homeDoc = await getDoc(homeDocRef);
              if (homeDoc.exists()) {
                  const homeData = homeDoc.data();
                  cache.set('home_data_index', { data: homeData, timestamp: Date.now() });
                  saveCache();
                  return res.json(maskDataSequence(homeData));
              }
          } catch (e: any) {
              console.error('Home doc fetch failed:', e.message);
          }
          
          if (serverCache.has('home_data_index')) {
              return res.json(maskDataSequence(serverCache.get('home_data_index')));
          }
          
          if (cache.has('home_data_index')) {
              const cached = cache.get('home_data_index');
              if (Date.now() - cached.timestamp < CACHE_DURATION_MS) {
                  return res.json(maskDataSequence(cached.data));
              }
          }

          return res.status(503).json({
            success: false,
            error: "Data source under maintenance or synchronizing. Please try again later."
          });
      } else if (
          targetPath.startsWith('/category/') ||
          targetPath.startsWith('/result') ||
          targetPath.startsWith('/admit-card') ||
          targetPath.startsWith('/latest-job') ||
          targetPath.startsWith('/answer-key') ||
          targetPath.startsWith('/syllabus') ||
          targetPath.startsWith('/admission')
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

              if (categoryId) {
                  let data: any = null;
                  try {
                      const catDocRef = doc(db, 'category_pages', categoryId);
                      const catDoc = await getDoc(catDocRef);
                      if (catDoc.exists()) {
                          data = catDoc.data();
                          cache.set(`category_pages_${categoryId}`, { data, timestamp: Date.now() });
                          saveCache();
                      }
                  } catch (e: any) {
                      console.error(`Category doc fetch failed for ${categoryId}:`, e.message);
                  }

                  if (!data && serverCache.has(`category_pages_${categoryId}`)) {
                      data = serverCache.get(`category_pages_${categoryId}`);
                  }
                  
                  if (!data && cache.has(`category_pages_${categoryId}`)) {
                      const cached = cache.get(`category_pages_${categoryId}`);
                      if (Date.now() - cached.timestamp < CACHE_DURATION_MS) {
                          data = cached.data;
                      }
                  }
                  
                  if (data) {
                      return res.json({
                          success: true,
                          isHome: true, // Reuse the search layout in frontend
                          title: data.title,
                          data: [
                              {
                                  id: 'category-results',
                                  title: data.title,
                                  links: maskSequence(data.links || []),
                                  viewAllUrl: '#'
                              }
                          ],
                          trending: []
                      });
                  }
              }

              // Fallback if not found in db or not matching explicitly
              return res.status(404).json({ success: false, error: 'Category data not found or still syncing. Please check back later.' });
          } catch (error) {
              console.error("Category fetch error:", error);
              return res.status(500).json({ success: false, error: 'Failed to load category data' });
          }
      } else if (targetPath.includes('?s=') || targetPath.includes('&s=') || targetPath.includes('/search') || req.query.s) {
          // Search logic
          let q = '';
          if (targetPath.includes('s=')) {
              const queryPart = targetPath.includes('?') ? targetPath.split('?')[1] : targetPath;
              const params = new URLSearchParams(queryPart);
              q = params.get('s') || '';
          }
          if (!q && req.query.s) {
              q = req.query.s as string;
          }

          if (!q || !q.trim()) {
              let homeData: any = null;
              try {
                  const homeDocRef = doc(db, 'home_data', 'index');
                  const homeDoc = await getDoc(homeDocRef);
                  if (homeDoc.exists()) homeData = homeDoc.data();
              } catch (e: any) {
                  console.error("Home doc fetch logic failed during empty search:", e.message);
              }
              if (!homeData && serverCache.has('home_data_index')) {
                  homeData = serverCache.get('home_data_index');
              }
              return res.json(homeData ? maskDataSequence(homeData) : { success: false, error: "No data" });
          }

          const searchString = q.toLowerCase().trim();
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

// Search only from memory cache
for (const [key, value] of serverCache.entries()) {
    if (key.startsWith('jobs_')) {
        jobsData.push(value);
    }
}
          
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
                  // 1. Is it currently marked as isNew on the homepage categories or trending?
                  if (newHomepagePaths.has(normalizedPath)) {
                      isNew = true;
                  }

                  // 2. Is the item in Firestore/cache created or updated recently?
                  const dbItem = itemData || serverCache.get(`jobs_${id}`);
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

                  scoredLinks.push({
                      link: {
                          id,
                          title,
                          url: path, // Use clean URLs instead of ?path=
                          isNew
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

          // 2. Query target website's live search page to index fresh/matching endpoints dynamically
          try {
              console.log(`[LIVE SEARCH] Querying target website: https://sarkariresult.com.cm/?s=${encodeURIComponent(q)}`);
              const liveSearchResponse = await fetch(`https://sarkariresult.com.cm/?s=${encodeURIComponent(q)}`, {
                  headers: {
                      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                  }
              });

              if (liveSearchResponse.ok) {
                  const liveHtml = await liveSearchResponse.text();
                  const $ = cheerio.load(liveHtml);

                  // Extract all links in articles / lists / query loop posts
                  $('article, .gb-query-loop-item, .post, h2, h3, #content, main').find('a').each((i, el) => {
                      const $el = $(el);
                      let text = $el.text().replace(/\s+/g, ' ').trim();
                      const href = $el.attr('href') || '';

                      if (href && text.length > 5) {
                          try {
                              const urlObj = new URL(href, 'https://sarkariresult.com.cm');
                              const pathName = urlObj.pathname;

                              // Ensure we only collect actual individual post URLs
                              if (
                                  pathName !== '/' &&
                                  !pathName.startsWith('/category/') &&
                                  !pathName.startsWith('/tag/') &&
                                  !pathName.startsWith('/page/') &&
                                  !pathName.includes('?s=')
                              ) {
                                  // De-brand the title text to conform with instructions
                                  const cleanTitle = text
                                      .replace(/sarkari\s*result(?:s)?(?:\.com\.cm|\.com|\.info|\.net|\.org)?/ig, 'Sarkari Naukri')
                                      .replace(/sarkariresult/ig, 'SarkariNaukri')
                                      .replace(/sarkarinaukri\.com\.cm/ig, 'Sarkari Naukri');

                                  addCandidate(
                                      encodeURIComponent(pathName).replace(/\./g, '%2E'),
                                      cleanTitle,
                                      pathName
                                  );
                              }
                          } catch (e) {}
                      }
                  });
              }
          } catch (liveErr: any) {
              console.error("[LIVE SEARCH ERROR]:", liveErr.message);
          }

          // Sort the scored candidates by score (highest relevance first)
          scoredLinks.sort((a, b) => b.score - a.score);
          const sortedLinks = scoredLinks.map(item => item.link);

          return res.json({
              success: true,
              isHome: true,
              title: `Search Results for "${q}"`,
              data: [
                  {
                      id: 'search-results',
                      title: `Searched: ${q}`,
                      links: sortedLinks.length > 0 ? sortedLinks.slice(0, 50) : [],
                      viewAllUrl: '#'
                  }
              ],
              trending: []
          });
      } else {
          // Read Job post data
          const jobId = encodeURIComponent(targetPath).replace(/\./g, '%2E');
          let data: any = null;

          try {
              const jobDocRef = doc(db, 'jobs', jobId);
              const jobDoc = await getDoc(jobDocRef);
              if (jobDoc.exists()) data = jobDoc.data();
          } catch (e: any) {
              console.error(`Job fetch error for ${jobId}:`, e.message);
          }

          if (!data && serverCache.has(`jobs_${jobId}`)) {
              data = serverCache.get(`jobs_${jobId}`);
          }
          
          if (!data) {
              console.log(`[ON-DEMAND SCRAPE] Job post not found in DB: ${targetPath}. Scraping on-the-fly...`);
              try {
                  const { scrapeJobPost } = await import("./src/lib/scheduler");
                  await scrapeJobPost(db, targetPath, true);
                  
                  // Re-fetch from db after scraping
                  const jobDocRef = doc(db, 'jobs', jobId);
                  const jobDoc = await getDoc(jobDocRef);
                  if (jobDoc.exists()) {
                      data = jobDoc.data();
                  }
              } catch (scrapeErr: any) {
                  console.error('[ON-DEMAND SCRAPE ERROR]:', scrapeErr.message);
              }
          }
          
          if (!data) {
              return res.status(404).json({
                success: false,
                error: "Job detail not found or currently syncing."
              });
          }
          
          let cleanContent = data.content;
          if (cleanContent) {
              cleanContent = replaceHowToWithYouTubeCTA(cleanContent, data.title || '');
              // Apply cleanText to entire HTML as final safety net
              const cleanText = (text: string) => {
                if (!text) return text;
                return text.replace(/official\s+sarkari\s+result\s+website/ig, 'Official GOVEXAM NOTIFICATION Website')
                           .replace(/sarkari\s*result/ig, 'Official GOVEXAM NOTIFICATION Website')
                           .replace(/sarkari\s*naukri/ig, 'GOVEXAM NOTIFICATION')
                           .replace(/exam\s+notification/ig, 'GOVEXAM NOTIFICATION')
                           .replace(/©\s*2008\s+Exam\s+Notification/ig, '© 2008 GOVEXAM NOTIFICATION')
                           .replace(/official\.sarkarinaukarijob@gmail\.com/ig, 'official.examnotification@gmail.com');
              };
              cleanContent = cleanText(cleanContent);
          }
          
          return res.json({
             success: true,
             isHome: false,
             ...data,
             content: cleanContent
          });
      }

    } catch (error: any) {
      console.error(error);
      res.status(500).json({ success: false, error: "Internal server error reading from database" });
    }
  });

  // Admin-only manual re-scrape endpoint
  app.post("/api/admin/rescrape", async (req, res): Promise<any> => {
    try {
      const { admin_key, path } = req.body;
      
      // Verify admin key
      const SECRET_ADMIN_KEY = 'exam_notification_admin_secret_2024_secure_key';
      if (admin_key !== SECRET_ADMIN_KEY) {
        return res.status(403).json({ success: false, error: "Unauthorized" });
      }
      
      if (!path) {
        return res.status(400).json({ success: false, error: "Path is required" });
      }
      
      let targetPath = path;
      if (!targetPath.startsWith('/')) {
        targetPath = '/' + targetPath;
      }
      
      console.log(`[ADMIN RESCRAPE] Re-scraping post: ${targetPath}`);
      
      const { scrapeJobPost } = await import("./src/lib/scheduler");
      await scrapeJobPost(db, targetPath, true);
      
      return res.json({ 
        success: true, 
        message: `Successfully re-scraped: ${targetPath}` 
      });
    } catch (error: any) {
      console.error("[ADMIN RESCRAPE ERROR]:", error.message);
      res.status(500).json({ success: false, error: "Re-scrape failed" });
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

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
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
