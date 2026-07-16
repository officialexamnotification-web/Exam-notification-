import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from 'url';
import multer from 'multer';
import dotenv from 'dotenv';
import * as cheerio from 'cheerio';
import Groq from 'groq-sdk';

// Load environment variables from .env file immediately so they are available for initialization
dotenv.config();

// Firebase removed - using local database only

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

// Firebase removed - using local database only

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

// ALWAYS load the database from govexam_db.json only
const loadGovExamDb = () => {
  try {
    const DB_FILE = path.join(process.cwd(), 'govexam_db.json');
    
    const CATEGORY_MAP = [
      { id: 'result', title: 'Result' },
      { id: 'latest-job', title: 'Latest Jobs' },
      { id: 'answer-key', title: 'Answer Key' },
      { id: 'exam-notice', title: 'Exam Notice' },
      { id: 'admit-card', title: 'Admit Card' },
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

    if (fs.existsSync(DB_FILE)) {
      console.log(`[GOVEXAM_DB] Loading database from ${DB_FILE}`);
      
      try {
        const dbData = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
        allDbData = dbData;
        console.log(`[GOVEXAM_DB] Loaded ${dbData.length} total jobs from govexam_db.json`);
        
        // Group jobs by category for homepage
        const categoryGroups: Record<string, any[]> = {};
        CATEGORY_MAP.forEach(cat => {
          categoryGroups[cat.id] = [];
        });
        
        dbData.forEach((job: any) => {
          const jobCat = job.category || 'latest-job';
          if (categoryGroups[jobCat]) {
            categoryGroups[jobCat].push(job);
          }
        });
        
        // Build homepage data from grouped jobs
        CATEGORY_MAP.forEach(cat => {
          const catJobs = categoryGroups[cat.id] || [];
          const catLinks = catJobs.map((job: any) => ({
            id: job.id || `scraped-${Math.random().toString(36).substring(7)}`,
            title: job.title,
            url: job.path || job.url,
            path: job.path || job.url,
            postDate: job.postDate || new Date().toISOString().split('T')[0],
            createdAt: job.createdAt || job.scrapedAt || new Date().toISOString(),
            updatedAt: job.updatedAt || job.scrapedAt || new Date().toISOString(),
            isNew: job.isNew !== undefined ? job.isNew : false,
            isOut: job.isOut !== undefined ? job.isOut : false,
            content: job.content || '',
            manuallyEdited: job.manuallyEdited || false,
            category: job.category || 'latest-job',
            department: job.department || '',
            shortInfo: job.shortInfo || '',
            importantLinks: job.importantLinks || [],
            originalUrl: job.originalUrl || job.url,
            tags: job.tags || [],
            isHot: job.isHot || false,
            importantDates: job.importantDates || {},
            applicationFee: job.applicationFee || {},
            vacancies: job.vacancies || []
          }));
          
          homeDataIndex.data.push({
            id: cat.id,
            title: cat.title,
            links: catLinks
          });
          
          console.log(`[GOVEXAM_DB] Category ${cat.id}: ${catJobs.length} jobs`);
        });
        
      } catch (e) {
        console.error(`[GOVEXAM_DB] Error reading govexam_db.json:`, e);
      }
    } else {
      console.log(`[GOVEXAM_DB] govexam_db.json not found, using empty database`);
    }
    
    // Select top 15 jobs across all categories for Trending
    homeDataIndex.trending = allDbData
        .slice(0, 15)
        .map((job: any) => ({
          id: job.id || `scraped-${Math.random().toString(36).substring(7)}`,
          title: job.title,
          url: job.path || job.url,
          path: job.path || job.url,
          postDate: job.postDate || new Date().toISOString().split('T')[0],
          createdAt: job.scrapedAt || new Date().toISOString(),
          updatedAt: job.scrapedAt || new Date().toISOString(),
          isNew: job.isNew !== undefined ? job.isNew : false,
          isOut: job.isOut !== undefined ? job.isOut : false,
          content: job.content || '',
          manuallyEdited: job.manuallyEdited || false,
          category: job.category || 'latest-job',
          department: job.department || '',
          shortInfo: job.shortInfo || '',
          importantLinks: job.importantLinks || [],
          originalUrl: job.originalUrl || job.url,
          tags: job.tags || [],
          isHot: job.isHot || false,
          importantDates: job.importantDates || {},
          applicationFee: job.applicationFee || {},
          vacancies: job.vacancies || []
        }));

      // Cache the home data
      serverCache.set('home_data_index', homeDataIndex);
      cache.set('home_data_index', { data: homeDataIndex, timestamp: Date.now() });

      // Store individual jobs in serverCache for quick access
      for (const job of allDbData) {
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
loadGovExamDb();

// Save cache to file
const saveCache = () => {
  try {
    const cacheObj = Object.fromEntries(cache);
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheObj, null, 2));
    
    // Auto-sync cache.json content to govexam_db.json
    try {
      const GOVEXAM_DB_FILE = path.join(process.cwd(), 'govexam_db.json');
      const jobsList: any[] = [];
      
      // Load current govexam_db.json to preserve any existing fields (like originalUrl, structures) if any
      let existingDbJobs: any[] = [];
      if (fs.existsSync(GOVEXAM_DB_FILE)) {
        try {
          existingDbJobs = JSON.parse(fs.readFileSync(GOVEXAM_DB_FILE, 'utf-8'));
        } catch (e) {
          console.error('[GOVEXAM_DB] Error reading existing govexam_db.json, starting fresh:', e);
        }
      }
      
      // Map of existing jobs by normalized path for easy lookup/merging
      const existingJobsMap = new Map<string, any>();
      for (const job of existingDbJobs) {
        let p = (job.path || '').trim().toLowerCase().replace(/^\/+|\/+$/g, '');
        if (!p && job.originalUrl) {
          try {
            const urlObj = new URL(job.originalUrl);
            p = urlObj.pathname.trim().toLowerCase().replace(/^\/+|\/+$/g, '');
          } catch (e) {
            p = job.originalUrl.trim().toLowerCase().replace(/^\/+|\/+$/g, '');
          }
        }
        if (p) {
          existingJobsMap.set(p, job);
        }
      }

      for (const [key, value] of cache.entries()) {
        if (key.startsWith('jobs_')) {
          const item = value.data || value;
          if (item && typeof item === 'object') {
            const jobId = key.substring(5);
            let decodedId = jobId;
            try {
              decodedId = decodeURIComponent(jobId);
            } catch (e) {}
            
            const cleanId = decodedId.replace(/^\/+|\/+$/g, '');
            
            // Normalize path to have leading and trailing slash
            let pathVal = item.path || '/' + cleanId + '/';
            if (!pathVal.startsWith('/')) pathVal = '/' + pathVal;
            if (!pathVal.endsWith('/') && pathVal !== '/') pathVal = pathVal + '/';
            
            const normPath = pathVal.trim().toLowerCase().replace(/^\/+|\/+$/g, '');
            const existingJob = existingJobsMap.get(normPath) || {};

            // Merge cache data with existing job data to preserve structural details like applicationFee, vacancies, etc.
            const mergedJob = {
              id: existingJob.id || item.id || cleanId,
              title: item.title || existingJob.title || '',
              category: item.category || existingJob.category || 'latest-job',
              postDate: item.postDate || existingJob.postDate || item.createdAt?.substring(0, 10) || existingJob.createdAt?.substring(0, 10) || new Date().toISOString().substring(0, 10),
              department: item.department || existingJob.department || '',
              shortInfo: item.shortInfo || existingJob.shortInfo || '',
              importantLinks: item.importantLinks || existingJob.importantLinks || [],
              originalUrl: item.originalUrl || existingJob.originalUrl || item.url || pathVal,
              tags: item.tags || existingJob.tags || [],
              isNew: item.isNew !== undefined ? item.isNew : (existingJob.isNew !== undefined ? existingJob.isNew : true),
              isHot: item.isHot !== undefined ? item.isHot : (existingJob.isHot !== undefined ? existingJob.isHot : false),
              importantDates: { ...(existingJob.importantDates || {}), ...(item.importantDates || {}) },
              applicationFee: { ...(existingJob.applicationFee || {}), ...(item.applicationFee || {}) },
              vacancies: item.vacancies && item.vacancies.length ? item.vacancies : (existingJob.vacancies || []),
              content: item.content || existingJob.content || '',
              path: pathVal,
              createdAt: item.createdAt || existingJob.createdAt || item.postDate || existingJob.postDate || new Date().toISOString(),
              updatedAt: item.updatedAt || new Date().toISOString()
            };
            
            jobsList.push(mergedJob);
          }
        }
      }
      
      // Deduplicate unique jobs
      const uniqueJobs: any[] = [];
      const seenPaths = new Set<string>();
      
      // Sort jobs list by updatedAt descending (newest first)
      jobsList.sort((a, b) => {
        const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return dateB - dateA;
      });
      
      for (const job of jobsList) {
        const normPath = (job.path || '').trim().toLowerCase().replace(/^\/+|\/+$/g, '');
        if (normPath && !seenPaths.has(normPath)) {
          seenPaths.add(normPath);
          uniqueJobs.push(job);
        }
      }
      
      lastWriteTime = Date.now();
      fs.writeFileSync(GOVEXAM_DB_FILE, JSON.stringify(uniqueJobs, null, 2));
      console.log(`[GOVEXAM_DB] Synced ${uniqueJobs.length} unique jobs to ${GOVEXAM_DB_FILE}`);
    } catch (dbErr: any) {
      console.error('[GOVEXAM_DB] Failed to auto-sync to govexam_db.json:', dbErr);
    }
  } catch (e) {
    console.error('[CACHE] Failed to save cache:', e);
  }
};

const syncJobToCacheAndAliases = (id: string, jobData: any) => {
  if (!id) return;
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

// Firebase removed - using local database only

// Clean FAQs About CEE Result 2026 box from all jobs dynamically
async function cleanAllJobsCEEFAQ() {
  const cleanHtmlContent = (html: string) => {
    if (!html) return html;
    
    // Broad matching for divs containing CEE FAQs
    const regexEscaped = /<div class=\\"overflow-x-auto w-full max-w-full my-6\\">[^]*?<table[^]*?>[^]*?FAQs About CEE Result 2026[^]*?<\/table>[^]*?<\/div>/gi;
    const regexNormal = /<div class="overflow-x-auto w-full max-w-full my-6">[^]*?<table[^]*?>[^]*?FAQs About CEE Result 2026[^]*?<\/table>[^]*?<\/div>/gi;
    const regexTableEscaped = /<table[^]*?>[^]*?FAQs About CEE Result 2026[^]*?<\/table>/gi;
    const regexTableNormal = /<table[^]*?>[^]*?FAQs About CEE Result 2026[^]*?<\/table>/gi;

    let cleaned = html.replace(regexEscaped, '');
    cleaned = cleaned.replace(regexNormal, '');
    cleaned = cleaned.replace(regexTableEscaped, '');
    cleaned = cleaned.replace(regexTableNormal, '');
    
    return cleaned;
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
        console.log(`[CACHE_CLEAN] Cleaned CEE FAQ from local cache key: ${key}`);
      }
    }
  }

  if (localCleanedCount > 0) {
    saveCache();
    console.log(`[CACHE_CLEAN] Saved ${localCleanedCount} cleaned jobs back to cache.json`);
  }

  // Firebase clean removed - using local database only
}

async function startServer() {
  // Run dynamic cleanup of FAQs box
  cleanAllJobsCEEFAQ().catch(err => {
    console.error('[CACHE_CLEAN] Background cleanup task failed:', err);
  });

  const app = express();
  const PORT = 3000;

  // Firebase config endpoint removed - using local database only

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

  // Firebase subscribe endpoint removed - using local database only

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

      // Firebase removed from sitemap - using local database only

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

  // Helper to remove forbidden links, table rows, list items or phrases from job content
  const sanitizePostContent = (html: string): string => {
      if (!html) return '';
      try {
          const $ = cheerio.load(html, null, false);

          // Identify target elements to remove
          $("*").each((i, el) => {
              const $el = $(el);
              const text = $el.text().trim();
              const tagName = ($(el).prop("tagName") || "").toUpperCase();

              // 1. Remove <a> tags if their href or text has unwanted things
              if (tagName === "A") {
                  const href = $el.attr("href") || "";
                  if (
                      /com\.vinod|sarkarinaukri|com\.cm|vocab|play\.google\.com|telegram|whatsapp|t\.me/i.test(href) ||
                      /vocab|english\s+vocab|sarkarinaukri|com\.cm|com\.vinod|telegram|whatsapp/i.test(text)
                  ) {
                      $el.remove();
                      return;
                  }
              }

              // 2. Remove table rows (tr) or list items (li) or paragraphs (p) or headings (h1-h6) or divs if they are the direct holder of Q&A
              if (["TR", "LI", "P", "H1", "H2", "H3", "H4", "H5", "H6", "DIV"].includes(tagName)) {
                  const isQA = /^(Question|Answer)\s*:/i.test(text) || 
                               (text.includes("Question:") && text.includes("Answer:") && text.length < 500);
                  
                  if (isQA) {
                      $el.remove();
                      return;
                  }
              }

              // 3. Remove Disclaimer paragraphs or small blocks (restrict to P, DIV of length < 1500)
              if (["P", "DIV"].includes(tagName) && text.length < 1500) {
                  if (
                      text.includes("Disclaimer:") && 
                      (text.includes("legal document") || text.includes("immediate information") || text.includes("inadvertent errors"))
                  ) {
                      $el.remove();
                      return;
                  }
              }

              // 4. Remove Trademark blocks
              if (["P", "DIV"].includes(tagName) && text.length < 1000) {
                  if (
                      text.includes("Official Website of") && 
                      (text.includes("Trademark") || text.includes("Patent") || text.includes("Since 2009"))
                  ) {
                      $el.remove();
                      return;
                  }
              }

              // 5. Footer and social/app promotion elements
              if (["P", "DIV", "SPAN"].includes(tagName) && text.length < 500) {
                  if (text.includes("Copyright ©") || text.includes("™ ( Since 2009 )")) {
                      $el.remove();
                      return;
                  }
                  if (text.includes("Home Contact Privacy Policy Disclaimer")) {
                      $el.remove();
                      return;
                  }
                  if (text.includes("Connect With Us") || text.includes("@Telegram") || text.includes("@WhatsApp")) {
                      $el.remove();
                      return;
                  }
                  if (text.includes("Search for:") || text.includes("Search …")) {
                      $el.remove();
                      return;
                  }
                  if (
                      text.includes("Download English Vocab App") || 
                      text.includes("Download SarkariResult App") ||
                      text.includes("English Vocab App") ||
                      text.includes("Vocab App")
                  ) {
                      $el.remove();
                      return;
                  }
              }
          });

          // 6. Slice content to start exactly from "Important Dates" heading
          let importantDatesNode: any = null;
          $('*').each((i, el) => {
              const text = $(el).text().trim().toLowerCase();
              if (text === 'important dates' || text === 'important date') {
                  const tagName = ((el as any).tagName || '').toUpperCase();
                  if (['H1','H2','H3','H4','H5','H6','STRONG','B'].includes(tagName)) {
                      importantDatesNode = el;
                      return false; // break
                  }
              }
          });

          if (!importantDatesNode) {
              $('*').each((i, el) => {
                  const text = $(el).text().trim().toLowerCase();
                  if (text.includes('important dates') && ['H1','H2','H3','H4','H5','H6'].includes(((el as any).tagName || '').toUpperCase())) {
                      importantDatesNode = el;
                      return false; // break
                  }
              });
          }

          if (importantDatesNode) {
              let current = $(importantDatesNode);
              while (current.length && current[0].name && !['body', 'html', 'root'].includes(current[0].name.toLowerCase())) {
                  current.prevAll().remove();
                  current = current.parent();
              }
          }

          let cleaned = $.html();
          
          // Final cleanups of empty tags
          cleaned = cleaned
              .replace(/<a>\s*<\/a>/gi, "")
              .replace(/<p>\s*<\/p>/gi, "")
              .replace(/<li>\s*<\/li>/gi, "")
              .replace(/<div>\s*<\/div>/gi, "");

          return cleaned.trim();
      } catch (e) {
          console.error('[SANITIZER] Error in sanitizePostContent:', e);
          return html;
      }
  };

  // Helper to determine job category from title and path
  const determineJobCategory = (title: string, path: string): string => {
      const text = ((path || '') + ' ' + (title || '')).toLowerCase();
      
      // Exam Notice - highest priority
      if (text.includes('notice') || text.includes('exam city details') || text.includes('city details') || text.includes('pe & mt notice') || text.includes('pet/pst notice')) return 'exam-notice';
      
      // Admit Card - but exclude exam city details
      if (text.includes('admit-card') || text.includes('admit card') || text.includes('hall ticket')) return 'admit-card';
      
      // Answer Key
      if (text.includes('answer-key') || text.includes('answer key') || text.includes('key solution') || text.includes('answer sheet') || text.includes('omr')) return 'answer-key';
      
      // Calendar
      if (text.includes('calendar') || text.includes('calender') || text.includes('time table') || text.includes('schedule')) return 'calendar';
      
      // Syllabus
      if (text.includes('syllabus') || text.includes('pattern')) return 'syllabus';
      
      // Documents
      if (text.includes('pan card') || text.includes('aadhar') || text.includes('certificate') || text.includes('voter id') || text.includes('dakhil kharij')) return 'documents';
      
      // Result
      if (text.includes('result') || text.includes('merit list') || text.includes('score card')) return 'result';
      
      // Admission
      if (text.includes('admission')) return 'admission';
      
      // Latest Jobs - only recruitment/online form
      if (text.includes('recruitment') || text.includes('online form') || text.includes('vacancy') || text.includes('bharti')) return 'latest-job';
      
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

      // Check fields from dbItem first (as it contains the full accurate properties from govexam_db.json)
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
      if (!links || !Array.isArray(links) || links.length <= 1) return links || [];
      
      try {
          const sorted = [...links].sort((a, b) => {
              const timeA = getLinkTimestamp(a);
              const timeB = getLinkTimestamp(b);
              return timeB - timeA; // Descending order: newest/latest first
          });
          return sorted;
      } catch (err) {
          console.error("Error sorting links chronologically:", err);
          return links;
      }
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

          // Determine if the post is recent (within last 5 days)
          const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;
          let isRecent = false;
          
          let referenceDateStr = link.updatedAt || link.createdAt;
          if (!referenceDateStr && dbItem) {
              referenceDateStr = dbItem.updatedAt || dbItem.createdAt || dbItem.scrapedAt || dbItem.postDate;
          }
          if (!referenceDateStr) {
              referenceDateStr = link.scrapedAt || link.postDate;
          }
          
          if (referenceDateStr) {
              const updatedDate = new Date(referenceDateStr).getTime();
              if (!isNaN(updatedDate) && (Date.now() - updatedDate) <= FIVE_DAYS_MS) {
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
              
              // 1.1 If Category is "admission", tag it as "isNew = true"
              if (itemCat === 'admission') {
                  isNew = true;
              }
              
              // 1.2 If Category is "documents", tag it as "isNew = true"
              if (itemCat === 'documents') {
                  isNew = true;
              }

              // 2. If Category is admit-card, result, answer-key, syllabus, or exam-notice, and has keywords, tag it as "isOut = true"
              if (
                  (itemCat === 'admit-card' || itemCat === 'result' || itemCat === 'answer-key' || itemCat === 'syllabus' || itemCat === 'exam-notice') &&
                  (lowerTitle.includes('out') || lowerTitle.includes('released') || lowerTitle.includes('declared') || lowerTitle.includes('announced') || lowerTitle.includes('result') || lowerTitle.includes('admit card') || lowerTitle.includes('answer key') || lowerTitle.includes('exam city') || lowerTitle.includes('notice') || lowerTitle.includes('city details'))
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
              
              // Debug logging for first few items
              if (Math.random() < 0.05) { // Log ~5% of items to avoid spam
                  console.log(`[TAG_DEBUG] ${cleanTitle.substring(0, 30)}... - Category: ${itemCat}, isNew: ${isNew}, isOut: ${isOut}, isRecent: ${isRecent}`);
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
              { id: 'latest-job', title: 'Latest Jobs', links: [] },
              { id: 'answer-key', title: 'Answer Key', links: [] },
              { id: 'exam-notice', title: 'Exam Notice', links: [] },
              { id: 'admit-card', title: 'Admit Card', links: [] },
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
                          category: job.category,
                          postDate: job.postDate || (job.scrapedAt ? job.scrapedAt.split('T')[0] : new Date().toISOString().split('T')[0]),
                          createdAt: job.createdAt || job.scrapedAt || new Date().toISOString(),
                          updatedAt: job.updatedAt || job.scrapedAt || new Date().toISOString()
                      });
                  }
              }
          }
          
          // Sort all jobs by newest first using prioritized date logic
          allJobs.sort((a, b) => {
              const getPriorityTime = (j: any) => {
                  if (j.postDate) {
                      const t = new Date(j.postDate).getTime();
                      if (!isNaN(t)) return t;
                  }
                  if (j.createdAt) {
                      const t = new Date(j.createdAt).getTime();
                      if (!isNaN(t)) return t;
                  }
                  if (j.updatedAt) {
                      const t = new Date(j.updatedAt).getTime();
                      if (!isNaN(t)) return t;
                  }
                  return 0;
              };
              return getPriorityTime(b) - getPriorityTime(a);
          });
          
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
                      if (title.includes('exam notice') && !categoryMap.has('exam-notice')) categoryMap.set('exam-notice', []);
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
          
          // 2. Sort allJobs by date (most recent first) before distribution
          allJobs.sort((a, b) => {
              const dateA = new Date(a.scrapedAt || a.updatedAt || a.createdAt || a.postDate).getTime();
              const dateB = new Date(b.scrapedAt || b.updatedAt || b.createdAt || b.postDate).getTime();
              return dateB - dateA; // Most recent first
          });
          
          // 3. Re-distribute jobs based on stored category or strict determination
          allJobs.forEach(job => {
              let trueCat = job.category || determineJobCategory(job.title, job.url || job.path);
              let bucketKey = getBucketForCat(trueCat) || getBucketForCat('latest-job');
              if (bucketKey && categoryMap.has(bucketKey)) {
                  // Show all items per category (removed limit)
                  categoryMap.get(bucketKey)!.push(job);
              }
          });
          
          // 4. Update the copiedData with the newly generated links while preserving manual edits
          copiedData.data.forEach((category: any) => {
              if (category && category.id) {
                  let bucketKey = getBucketForCat(category.id);
                  if (bucketKey && categoryMap.has(bucketKey)) {
                      const newLinks = categoryMap.get(bucketKey);
                      const existingLinks = category.links || [];
                      
                      // Create a map of existing links by path for quick lookup
                      const existingLinksMap = new Map();
                      existingLinks.forEach((link: any) => {
                          const path = (link.path || link.url || '').trim().toLowerCase().replace(/^\/+|\/+$/g, '');
                          if (path) existingLinksMap.set(path, link);
                      });
                      
                      // Merge new links with existing links, preserving manual edits
                      const mergedLinks = newLinks.map((newLink: any) => {
                          const path = (newLink.path || newLink.url || '').trim().toLowerCase().replace(/^\/+|\/+$/g, '');
                          const existingLink = existingLinksMap.get(path);
                          
                          if (existingLink) {
                              // Preserve manually edited fields if they are more recent
                              const existingTime = new Date(existingLink.updatedAt || existingLink.createdAt || 0).getTime();
                              const newTime = new Date(newLink.updatedAt || newLink.createdAt || 0).getTime();
                              const isManualEditMoreRecent = existingTime > newTime;
                              
                              return {
                                  ...newLink,
                                  title: isManualEditMoreRecent ? existingLink.title : newLink.title,
                                  content: isManualEditMoreRecent ? (existingLink.content || newLink.content) : newLink.content,
                                  isNew: existingLink.isNew !== undefined ? existingLink.isNew : newLink.isNew,
                                  isOut: existingLink.isOut !== undefined ? existingLink.isOut : newLink.isOut,
                                  manuallyEdited: existingLink.manuallyEdited || false,
                                  category: existingLink.category || newLink.category,
                                  department: existingLink.department || newLink.department,
                                  shortInfo: existingLink.shortInfo || newLink.shortInfo,
                                  importantLinks: existingLink.importantLinks || newLink.importantLinks,
                                  originalUrl: existingLink.originalUrl || newLink.originalUrl,
                                  tags: existingLink.tags || newLink.tags,
                                  isHot: existingLink.isHot !== undefined ? existingLink.isHot : newLink.isHot,
                                  importantDates: existingLink.importantDates || newLink.importantDates,
                                  applicationFee: existingLink.applicationFee || newLink.applicationFee,
                                  vacancies: existingLink.vacancies && existingLink.vacancies.length ? existingLink.vacancies : newLink.vacancies,
                                  updatedAt: isManualEditMoreRecent ? existingLink.updatedAt : newLink.updatedAt
                              };
                          }
                          return newLink;
                      });
                      
                      category.links = mergedLinks;
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
              updatedAt: job.updatedAt,
              content: job.content || '',
              manuallyEdited: job.manuallyEdited || false,
              category: job.category,
              department: job.department || '',
              shortInfo: job.shortInfo || '',
              importantLinks: job.importantLinks || [],
              originalUrl: job.originalUrl || job.url,
              tags: job.tags || [],
              isHot: job.isHot || false,
              importantDates: job.importantDates || {},
              applicationFee: job.applicationFee || {},
              vacancies: job.vacancies || []
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
          console.log('[HOME] Dynamically compiling from serverCache (Local Mode)');
          console.log('BEFORE enforce:', copiedData.data.map((c:any)=>c.title)); console.log('BEFORE enforce:', copiedData.data.map((c:any)=>c.title)); copiedData = enforceHomepageCategories(copiedData); console.log('AFTER enforce:', copiedData.data.map((c:any)=>c.title)); console.log('AFTER enforce:', copiedData.data.map((c:any)=>c.title));
          
          if (copiedData.data && Array.isArray(copiedData.data)) {
              copiedData.data.forEach((category: any) => {
                  if (category && category.links) {
                      console.log(`[TAG_DEBUG] Processing category: ${category.title} with ${category.links.length} links`);
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
                      
                      // Count tags in this category
                      const newTags = category.links.filter((l: any) => l.isNew).length;
                      const outTags = category.links.filter((l: any) => l.isOut).length;
                      console.log(`[TAG_DEBUG] Category ${category.title}: ${newTags} NEW tags, ${outTags} OUT tags`);
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
      // --- READ ONLY FROM LOCAL DATABASE ---
      if (targetPath === '/' || targetPath === '') {
          // Read Home index data - Self-initializing Hybrid Cache
          if (!serverCache.has('home_data_index')) {
              const defaultHomeData = {
                  data: [
                      { id: 'result', title: 'Result', links: [] },
                      { id: 'latest-job', title: 'Latest Jobs', links: [] },
                      { id: 'answer-key', title: 'Answer Key', links: [] },
                      { id: 'exam-notice', title: 'Exam Notice', links: [] },
                      { id: 'admit-card', title: 'Admit Card', links: [] },
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
          // Serve Category Page from Local Database Only
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
                  
                  // First check serverCache
                  if (serverCache.has(`category_pages_${categoryId}`)) {
                      data = serverCache.get(`category_pages_${categoryId}`);
                      
                      // Sort cached data by newest first
                      if (data.data && Array.isArray(data.data)) {
                          data.data.sort((a: any, b: any) => {
                              const getPriorityTime = (j: any) => {
                                  if (j.postDate) {
                                      const t = new Date(j.postDate).getTime();
                                      if (!isNaN(t)) return t;
                                  }
                                  if (j.createdAt) {
                                      const t = new Date(j.createdAt).getTime();
                                      if (!isNaN(t)) return t;
                                  }
                                  if (j.updatedAt) {
                                      const t = new Date(j.updatedAt).getTime();
                                      if (!isNaN(t)) return t;
                                  }
                                  return 0;
                              };
                              return getPriorityTime(b) - getPriorityTime(a);
                          });
                      }
                  }
                  
                  // If not in cache, build from govexam_db.json data
                  if (!data || !data.data || !Array.isArray(data.data) || data.data.length === 0) {
                      const fallbackLinks: any[] = [];
                      const seenPaths = new Set<string>(); // Deduplication by path
                      
                      // Scan serverCache jobs (loaded from govexam_db.json)
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
                                      updatedAt: job.updatedAt,
                                      content: job.content || '',
                                      manuallyEdited: job.manuallyEdited || false,
                                      department: job.department || '',
                                      shortInfo: job.shortInfo || '',
                                      importantLinks: job.importantLinks || [],
                                      originalUrl: job.originalUrl || job.url,
                                      tags: job.tags || [],
                                      isHot: job.isHot || false,
                                      importantDates: job.importantDates || {},
                                      applicationFee: job.applicationFee || {},
                                      vacancies: job.vacancies || []
                                  });
                              }
                          }
                      }
                      
                      // Sort by newest first using prioritized date logic
                      fallbackLinks.sort((a, b) => {
                          const getPriorityTime = (j: any) => {
                              if (j.postDate) {
                                  const t = new Date(j.postDate).getTime();
                                  if (!isNaN(t)) return t;
                              }
                              if (j.createdAt) {
                                  const t = new Date(j.createdAt).getTime();
                                  if (!isNaN(t)) return t;
                              }
                              if (j.updatedAt) {
                                  const t = new Date(j.updatedAt).getTime();
                                  if (!isNaN(t)) return t;
                              }
                              return 0;
                          };
                          return getPriorityTime(b) - getPriorityTime(a);
                      });

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
                          
                          // Cache the built data
                          serverCache.set(`category_pages_${categoryId}`, data);
                          cache.set(`category_pages_${categoryId}`, { data, timestamp: Date.now() });
                          saveCache();
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
                                  links: maskSequence(applyHomepageTags(data.data || data.links || [], categoryId)),
                                  viewAllUrl: targetPath
                              }
                          ],
                          trending: []
                      });
                  }

                  // Fallback if not found in local database
                  console.log(`[INFO] Category ${categoryId} not found in local database.`);
                  
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
              let homeData: any = serverCache.get('home_data_index');
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
                  
                  // Check tags from local database
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

                      // 2. Is the item in local database created or updated recently?
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

          // 3. Firebase fallback removed - using local database only
          
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
          let cleanTitle = data.title || '';

          if (cleanContent) {
              cleanContent = cleanContent
                  .replace(/\(\s*Sarkari\s*Result(?:\s+Update|\s+Mirror|\s+Info|\s+Website)?\s*\)/gi, '')
                  .replace(/\s*[-\–\—]\s*Sarkari\s*Result(?:\s+Update|\s+Mirror|\s+Info|\s+Website)?/gi, '')
                  .replace(/Sarkari\s*Result/gi, '')
                  .replace(/SarkariResult/gi, '')
                  .replace(/\(\s*\)/g, '');
              cleanContent = sanitizePostContent(cleanContent);
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

  // Get all jobs for admin dashboard
  app.get("/api/admin/jobs", verifyAdmin, async (req, res): Promise<any> => {
    try {
      let jobs: any[] = [];
      let usedCache = true; // Always use cache - Firebase removed
      
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
      
      // Always use cache - Firebase removed
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
      
      let homeData: any = serverCache.get('home_data_index');
      
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
              isNew: true,
              manuallyEdited: true,
              content: '',
              category: targetCategoryName.toLowerCase().replace(' ', '-'),
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };
            targetCat.links.unshift(newLink);
            
            // Firebase write removed - using local cache only
            serverCache.set('home_data_index', homeData);
            cache.set('home_data_index', { data: homeData, timestamp: Date.now() });
            saveCache();
            
            return res.json({ success: true, message: `Added to ${targetCategoryName} category` });
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
      
      // Check cache with cleanId and alternate aliases (Local Only)
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
      
      // Clean up homepage references (Local Only)
      try {
        let homeData: any = serverCache.get('home_data_index');
        
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
      res.json({ success: true, message: "Job deleted successfully" });
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
      
      // Always use cache - Firebase removed
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
        updatedAt: new Date().toISOString(),
        manuallyEdited: true
      };
      if (path) {
        updateData.path = path;
      }
      if (category) {
        updateData.category = category;
      }
      
      // Firebase save removed - using local cache only
      
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

          // 1. Update Home Data (Local Only)
          let homeData: any = serverCache.get('home_data_index');
          
          if (homeData) {
              let updatedHome = false;
              if (Array.isArray(homeData.data)) {
                  homeData.data.forEach((cat: any) => {
                      if (Array.isArray(cat.links)) {
                          cat.links.forEach((link: any) => {
                              if (matchesPath(link.url)) {
                                  if (link.title !== title) {
                                      link.title = title;
                                      updatedHome = true;
                                  }
                                  if (content && link.content !== content) {
                                      link.content = content;
                                      updatedHome = true;
                                  }
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
                  serverCache.set('home_data_index', homeData);
                  cache.set('home_data_index', { data: homeData, timestamp: Date.now() });
                  console.log(`[SYNC] Updated job title in home_data/index`);
              }
          }
          
          // 2. Update Category Pages (Local Only)
          const categories = ['latest-job', 'result', 'admit-card', 'answer-key', 'syllabus', 'admission'];
          for (const categoryId of categories) {
              let catData = serverCache.get(`category_pages_${categoryId}`);
              if (catData) {
                  let updatedCat = false;
                  if (Array.isArray(catData.data)) {
                      catData.data.forEach((link: any) => {
                          if (matchesPath(link.url)) {
                              if (link.title !== title) {
                                  link.title = title;
                                  updatedCat = true;
                              }
                              if (content && link.content !== content) {
                                  link.content = content;
                                  updatedCat = true;
                              }
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
      } catch (syncErr: any) {
          console.error(`[SYNC ERROR] Failed to sync job titles: ${syncErr.message}`);
      }
      
      saveCache();
      console.log(`[UPDATE] Successfully updated job: ${id}`);
      res.json({ success: true, message: "Job updated successfully" });
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
      
      // Safe document ID for local cache
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
      
      // Firebase save removed - using local cache only
      
      // Always add to cache and sync aliases
      syncJobToCacheAndAliases(jobId, jobData);
      console.log(`[CREATE JOB] Added and synced to server cache`);
      
      // ADD TO HOMEPAGE (TARGET CATEGORY & TRENDING)
      try {
          let homeData: any = serverCache.get('home_data_index');
          
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
              
              // Firebase write removed - using local cache only
              serverCache.set('home_data_index', homeData);
              cache.set('home_data_index', { data: homeData, timestamp: Date.now() });
              console.log(`[CREATE JOB] Added to Homepage ${targetCategoryTitle} & Trending Marquee`);
              
              // 3. Add to Category Page (Local Only)
              let catData = serverCache.get(`category_pages_${targetCategory}`);
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
          }
      } catch (homeAddErr: any) {
          console.error(`[CREATE JOB] Error adding to homepage: ${homeAddErr.message}`);
      }
      
      saveCache();
      res.json({ success: true, message: "Job created successfully" });
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

      // Firebase save removed - using local cache only

      // Add to server cache and all aliases
      syncJobToCacheAndAliases(jobId, jobData);

      // ADD TO HOMEPAGE INDEX (Trending & Categories) - Local Only
      try {
        let homeData: any = serverCache.get('home_data_index');

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

          // Firebase write removed - using local cache only
          serverCache.set('home_data_index', homeData);
          cache.set('home_data_index', { data: homeData, timestamp: Date.now() });
        }
      } catch (homeErr: any) {
        console.error(`[AUTO-SCRAPE] Failed to update homepage index: ${homeErr.message}`);
      }

      // ADD TO CATEGORY PAGE (Local Only)
      try {
        const newLinkObj = {
          id: `scrape-${Math.random().toString(36).substring(7)}`,
          title: finalTitle,
          url: targetPath,
          isNew: true
        };

        let catData = serverCache.get(`category_pages_${targetCategory}`);
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
      
      // Update app version info in local cache
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
        
        // Firebase removed - using local cache only
        
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
      console.log('[REBUILD] Starting home_data rebuild...');
      
      // 1. Fetch ALL jobs from serverCache (local only)
      const allJobs: any[] = [];
      for (const [key, item] of serverCache.entries()) {
          if (key.startsWith('jobs_')) {
              const job = item.data || item;
              const jobPath = (job.path || job.url || '').toLowerCase().trim();
              if (jobPath) {
                  allJobs.push({
                      id: job.id || key.substring(5),
                      title: job.title || 'Untitled',
                      url: jobPath,
                      path: jobPath,
                      updatedAt: job.updatedAt || job.createdAt || job.postDate || ''
                  });
              }
          }
      }
      
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
      newHomeData.trending = allJobs.slice(0, 10).map((job, idx) => ({ 
          ...job, 
          id: `trend-${job.id}-${idx}`,
          content: job.content || '',
          manuallyEdited: job.manuallyEdited || false,
          category: job.category,
          department: job.department || '',
          shortInfo: job.shortInfo || '',
          importantLinks: job.importantLinks || [],
          originalUrl: job.originalUrl || job.url,
          tags: job.tags || [],
          isHot: job.isHot || false,
          importantDates: job.importantDates || {},
          applicationFee: job.applicationFee || {},
          vacancies: job.vacancies || []
      }));
      
      // Firebase save removed - using local cache only
      
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
      
      // Try cache first - Firebase removed
      const cachedVersion = serverCache.get('app_updates_android');
      
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
