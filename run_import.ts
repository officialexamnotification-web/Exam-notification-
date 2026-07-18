import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const BASE_URL = 'https://sarkariresult.com.cm';
const DB_PATH = path.join(process.cwd(), 'govexam_db.json');

const EXCLUDED_URLS = [
  'https://sarkariresult.com.cm/',
  'https://sarkariresult.com.cm/latest-jobs/',
  'https://sarkariresult.com.cm/admit-card/',
  'https://sarkariresult.com.cm/result/',
  'https://sarkariresult.com.cm/admission/',
  'https://sarkariresult.com.cm/syllabus/',
  'https://sarkariresult.com.cm/answer-key/',
  'https://sarkariresult.com.cm/contact/',
  'https://sarkariresult.com.cm/privacy-policy/',
  'https://sarkariresult.com.cm/disclaimer/',
  'https://sarkariresulttools.net/',
  'https://t.me/SarkariExam_info',
  'https://whatsapp.com/channel/0029VaAbQf01NCrYADMLt00L',
  'https://www.whatsapp.com/channel/0029VaAbQf01NCrYADMLt00L'
];

const FORBIDDEN_TEXT = [
  'Join WhatsApp Channel',
  'SarkariResult Tools',
  'Sarkari Result @Instagram',
  'Sarkari Result @Facebook',
  'Sarkari Result @YouTube',
  'Sarkari Result @Mobile App',
  'Sarkari Result @X',
  'Important Question',
  'Important Links',
  'Official Website of ™.com.cm',
  'Disclaimer: Information regarding',
  'Connect With Us',
  '@Telegram @WhatsApp',
  'Copyright © 2009',
  '™ ( Since 2009 )'
];

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
  db = getFirestore();
} catch (fbErr: any) {
  console.error("Firebase admin init failed:", fbErr.message);
}

async function loadExistingDB() {
  if (fs.existsSync(DB_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
      if (Array.isArray(data)) return data;
    } catch (e) {
      console.error("Corrupt DB, starting fresh.");
    }
  }
  return [];
}

async function fetchPage(url: string) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });
    if (!response.ok) return null;
    return await response.text();
  } catch (e) {
    return null;
  }
}

function cleanContent(html: string) {
  const $ = cheerio.load(html, null, false);
  
  // Remove all images and vectors
  $('img, picture, source, svg, path, symbol').remove();
  $('script, style, iframe, header, footer, nav, .sidebar, .comments, .ads, .advertisement, noscript').remove();
    
  let mainContent = $('.entry-content').first();
  if (mainContent.length === 0) mainContent = $('main').first();
  if (mainContent.length === 0) mainContent = $('body');
    
  mainContent.find('.social-buttons, .social-button, .entry-meta, .post-navigation, .sharedaddy, .related-posts, .author-info, #comments').remove();
    
  // Remove Q&A Section completely
  mainContent.find('p, h2, h3, h4, div').each((i, el) => {
    const text = $(el).text().trim().toLowerCase();
    if (text.startsWith('question:') || text.startsWith('answer:') || text.startsWith('q.') || text.startsWith('ans.')) {
      $(el).remove();
    }
  });

  // Remove everything before Important Dates
  let importantHeading = mainContent.find("h1, h2, h3, h4, h5, h6, p, span, div, strong, b").filter((i, el) => { 
      return $(el).text().trim().toLowerCase() === "important dates" || $(el).text().trim().toLowerCase() === "important date"; 
  }).first();
  
  if (importantHeading.length > 0) {
      const gridWrapper = importantHeading.closest(".gb-grid-wrapper");
      if (gridWrapper.length > 0) {
          const allEls = mainContent.find("*");
          const wrapperIndex = allEls.index(gridWrapper);
          mainContent.find("p, span").each((i, el) => {
             const pIndex = allEls.index(el);
             if (pIndex !== -1 && pIndex < wrapperIndex && $(el).closest("h1").length === 0) {
                 $(el).remove();
             }
          });
      }
  }

  // Remove image links, play store links, telegram links
  mainContent.find('a').each((i, el) => {
    const href = ($(el).attr('href') || '').toLowerCase().trim();
    let shouldExclude = false;
    if (href.includes('t.me') || href.includes('whatsapp') || href.includes('play.google.com') || href.includes('facebook') || href.includes('instagram') || href.includes('twitter') || href.includes('youtube')) {
      shouldExclude = true;
    }

    const isImageLink = /(\.(png|jpg|jpeg|webp|gif|bmp))(\?|$)/i.test(href) || 
                        href.includes('fbcdn.net') || 
                        (href.includes('/uploads/') && href.match(/\.(png|jpg|jpeg|webp|gif)/i));

    if (shouldExclude || isImageLink) {
      const parentTr = $(el).closest('tr');
      if (parentTr.length > 0) {
        const rowText = parentTr.text().toLowerCase();
        if (rowText.includes('poster') || rowText.includes('notice') || rowText.includes('short info') || rowText.includes('download') || rowText.includes('click here') || isImageLink) {
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
  
  mainContent.find('p, div, span, tr, td').each((i, el) => {
     if ($(el).text().trim() === '' && $(el).children().length === 0) {
         $(el).remove();
     }
  });
  
  let textContent = mainContent.html() || '';
  
  for (const ft of FORBIDDEN_TEXT) {
    const regex = new RegExp(ft, 'gi');
    textContent = textContent.replace(regex, '');
  }
  
  textContent = textContent.replace(/<br\s*\/?>\s*<br\s*\/?>/gi, '<br/>');

  return textContent;
}

const MONTH_MAP: { [key: string]: number } = {
  january: 0, jan: 0,
  february: 1, feb: 1,
  march: 2, mar: 2,
  april: 3, apr: 3,
  may: 4,
  june: 5, jun: 5,
  july: 6, jul: 6,
  august: 7, aug: 7,
  september: 8, sep: 8, sept: 8,
  october: 9, oct: 9,
  november: 10, nov: 10,
  december: 11, dec: 11
};

function parseDateString(str: string): Date | null {
  if (!str) return null;
  let clean = str.toLowerCase().trim();

  const rangeIndicators = ['–', '-', ' to ', ' and '];
  for (const indicator of rangeIndicators) {
    if (clean.includes(indicator)) {
      const parts = clean.split(indicator);
      const lastPart = parts[parts.length - 1].trim();
      const parsedLast = parseDateString(lastPart);
      if (parsedLast) return parsedLast;
    }
  }

  clean = clean
    .replace(/\(extended\)/g, '')
    .replace(/\(postponed\)/g, '')
    .replace(/available now/g, '')
    .replace(/out/g, '')
    .replace(/declared/g, '')
    .replace(/announced/g, '')
    .replace(/click here/g, '')
    .replace(/active/g, '')
    .replace(/starts/g, '')
    .replace(/expected/g, '')
    .replace(/tentative/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const slashMatch = clean.match(/\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})\b/);
  if (slashMatch) {
    const day = parseInt(slashMatch[1]);
    const month = parseInt(slashMatch[2]) - 1;
    const year = parseInt(slashMatch[3]);
    if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
      return new Date(Date.UTC(year, month, day, 12, 0, 0));
    }
  }

  const yearMatch = clean.match(/\b(2018|2019|2020|2021|2022|2023|2024|2025|2026|2027)\b/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1]);
    let foundMonth: number | null = null;
    let monthNameMatched = '';
    for (const mName of Object.keys(MONTH_MAP)) {
      const regex = new RegExp(`\\b${mName}\\b`, 'i');
      if (regex.test(clean)) {
        foundMonth = MONTH_MAP[mName];
        monthNameMatched = mName;
        break;
      }
    }

    if (foundMonth !== null) {
      const dayStr = clean
        .replace(year.toString(), '')
        .replace(monthNameMatched, '')
        .replace(/[^0-9]/g, ' ')
        .trim()
        .split(/\s+/)[0];
      
      const day = parseInt(dayStr) || 1;
      if (day >= 1 && day <= 31) {
        return new Date(Date.UTC(year, foundMonth, day, 12, 0, 0));
      }
    }
  }

  return null;
}

function extractTrueEventDate(title: string, content: string, category: string, fallbackDateStr: string): string {
  if (!content) return fallbackDateStr;

  try {
    const $ = cheerio.load(content);
    const textLines: { label: string; date: Date }[] = [];

    $('li, p, tr, td').each((_, el) => {
      const text = $(el).text().trim();
      if (text.includes(':') || text.includes('–') || text.includes('-')) {
        const separator = text.includes(':') ? ':' : (text.includes('–') ? '–' : '-');
        const parts = text.split(separator);
        if (parts.length >= 2) {
          const label = parts[0].trim().toLowerCase();
          const value = parts.slice(1).join(separator).trim();
          
          if (label.length < 100 && /\b(2018|2019|2020|2021|2022|2023|2024|2025|2026|2027)\b/.test(value)) {
            const parsedDate = parseDateString(value);
            if (parsedDate) {
              textLines.push({ label, date: parsedDate });
            }
          }
        }
      }
    });

    if (textLines.length === 0) {
      const lines = content.replace(/<[^>]+>/g, '\n').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.includes(':')) {
          const parts = trimmed.split(':');
          const label = parts[0].trim().toLowerCase();
          const value = parts.slice(1).join(':').trim();
          if (label.length < 100 && /\b(2018|2019|2020|2021|2022|2023|2024|2025|2026|2027)\b/.test(value)) {
            const parsedDate = parseDateString(value);
            if (parsedDate) {
              textLines.push({ label, date: parsedDate });
            }
          }
        }
      }
    }

    if (textLines.length > 0) {
      const maxAllowedTime = new Date('2026-07-18T12:00:00Z').getTime();
      const validLines = textLines.filter(item => item.date.getTime() <= maxAllowedTime);

      if (validLines.length > 0) {
        let categoryKeywords: string[] = [];
        if (category === 'result') {
          categoryKeywords = ['result', 'marks', 'cutoff', 'score', 'merit', 'selection'];
        } else if (category === 'admit-card') {
          categoryKeywords = ['admit card', 'hall ticket', 'exam city', 'status', 'exam date', 're-exam date'];
        } else if (category === 'answer-key') {
          categoryKeywords = ['answer key', 'objection', 'key'];
        } else if (category === 'latest-job' || category === 'latest-jobs') {
          categoryKeywords = ['apply start', 'online start', 'form start', 'notification'];
        } else if (category === 'syllabus') {
          categoryKeywords = ['syllabus', 'exam pattern'];
        } else if (category === 'admission') {
          categoryKeywords = ['admission', 'counselling', 'allotment', 'seat allotment'];
        } else if (category === 'documents') {
          categoryKeywords = ['registration', 'apply online', 'verification'];
        }

        const matches = validLines.filter(item => 
          categoryKeywords.some(keyword => item.label.includes(keyword))
        );

        if (matches.length > 0) {
          const sortedMatches = matches.sort((a, b) => b.date.getTime() - a.date.getTime());
          return sortedMatches[0].date.toISOString();
        }

        const sortedAll = validLines.sort((a, b) => b.date.getTime() - a.date.getTime());
        return sortedAll[0].date.toISOString();
      }
    }
  } catch (err) {
    console.error(`Error in extractTrueEventDate for ${title}:`, err);
  }

  return fallbackDateStr;
}

async function scrapeJob(url: string, category: string) {
  console.log(`Scraping ${url} for category ${category}`);
  const html = await fetchPage(url);
  if (!html) return null;
  const $ = cheerio.load(html);
  
  let title = $('.entry-title').first().text().trim() || $('h1').first().text().trim();
  if (!title) {
     title = $('title').text().trim().replace(/\|.*/, '').trim();
  }
  
  const content = cleanContent(html);
  const urlObj = new URL(url);
  let pathName = urlObj.pathname;
  if (!pathName.startsWith('/')) pathName = '/' + pathName;

  let finalCategory = category;
  if (title.toLowerCase().includes('syllabus') || title.toLowerCase().includes('exam pattern') || pathName.toLowerCase().includes('syllabus') || pathName.toLowerCase().includes('exam-pattern')) {
    finalCategory = 'syllabus';
  }

  // Extract precise publication date/time from the WordPress time tag if available
  let publicationDate = new Date().toISOString();
  try {
    const timeEl = $('time.entry-date, time');
    const datetimeAttr = timeEl.attr('datetime');
    if (datetimeAttr) {
      const d = new Date(datetimeAttr.trim());
      if (!isNaN(d.getTime())) {
        publicationDate = datetimeAttr.trim();
      }
    } else {
      const htmlMatch = html.match(/datetime="([^"]+)"/i);
      if (htmlMatch && htmlMatch[1]) {
        const d = new Date(htmlMatch[1].trim());
        if (!isNaN(d.getTime())) {
          publicationDate = htmlMatch[1].trim();
        }
      }
    }
  } catch (err) {
    console.error("Failed to extract publication date:", err);
  }

  // Resolve the true event/release date from the important dates list
  const trueEventDate = extractTrueEventDate(title, content, finalCategory, publicationDate);
    
  const job = {
    id: `scraped-${Math.random().toString(36).substring(7)}`,
    title,
    url: pathName,
    path: pathName,
    category: finalCategory,
    content,
    originalUrl: url,
    postDate: trueEventDate,
    createdAt: trueEventDate,
    updatedAt: trueEventDate,
    scrapedAt: trueEventDate
  };

  // Push to Firestore immediately if db is initialized
  if (db) {
    try {
       let cleanId = pathName.replace(/\//g, '_');
       if (cleanId.startsWith('_')) cleanId = cleanId.substring(1);
       if (cleanId.endsWith('_')) cleanId = cleanId.substring(0, cleanId.length - 1);
       if (!cleanId) cleanId = job.id;
       
       await db.collection('jobs').doc(cleanId).set(job, { merge: true });
       console.log(`[FIRESTORE SYNC] Pushed ${title} as doc: ${cleanId}`);
    } catch (fsErr: any) {
       console.error(`[FIRESTORE ERROR] Failed to push ${title}:`, fsErr.message);
    }
  }

  return job;
}

async function collectCategoryLinksPaginated(categoryName: string, baseUrlPart: string, maxPages = 3) {
  console.log(`[PAGINATION] Collecting links for category ${categoryName} (max ${maxPages} pages)`);
  const links: {url: string, category: string}[] = [];
  const candidateUrlsSet = new Set<string>();
  
  for (let page = 1; page <= maxPages; page++) {
    const url = page === 1 
      ? `https://sarkariresult.com.cm/${baseUrlPart}/` 
      : `https://sarkariresult.com.cm/${baseUrlPart}/page/${page}/`;
      
    console.log(`[PAGINATION] Fetching ${categoryName} from page ${page}: ${url}`);
    const html = await fetchPage(url);
    if (!html) {
      console.log(`[PAGINATION] Page ${page} not found or failed. Stopping pagination for ${categoryName}.`);
      break;
    }
    
    const $ = cheerio.load(html);
    let addedOnThisPage = 0;
    $('a').each((i, el) => {
      const href = $(el).attr('href');
      const title = $(el).text().trim().toLowerCase();
      
      if (href && href.startsWith(BASE_URL) && !EXCLUDED_URLS.includes(href)) {
        if (!candidateUrlsSet.has(href)) {
          candidateUrlsSet.add(href);
          
          let finalCategory = categoryName;
          if (categoryName === 'syllabus') {
            if (title.includes('calendar') || title.includes('time table') || title.includes('schedule')) {
              finalCategory = 'calendar';
            } else if (title.includes('syllabus') || title.includes('exam pattern')) {
              finalCategory = 'syllabus';
            } else {
              finalCategory = 'documents';
            }
          }
          links.push({ url: href, category: finalCategory });
          addedOnThisPage++;
        }
      }
    });
    
    console.log(`[PAGINATION] Found ${addedOnThisPage} potential links on page ${page}.`);
    if (addedOnThisPage === 0) {
      console.log(`[PAGINATION] No new links found on page ${page}. Stopping.`);
      break;
    }
    
    await new Promise(r => setTimeout(r, 300));
  }
  
  return links;
}

async function main() {
  console.log("Starting full deep crawler for Sarkari Result CMS...");
  const existingJobs = await loadExistingDB();
  const existingUrls = new Set(existingJobs.map((j: any) => j.path || j.originalUrl || j.url));
  
  console.log(`Loaded ${existingJobs.length} existing jobs.`);
  
  // 1. Collect all target candidate links from paginated pages
  const candidates: {url: string, category: string}[] = [];
  const candidateUrlsSet = new Set<string>();

  const landingPages = [
    { baseUrlPart: 'latest-jobs', category: 'latest-job', maxPages: 2 },
    { baseUrlPart: 'admit-card', category: 'admit-card', maxPages: 2 },
    { baseUrlPart: 'result', category: 'result', maxPages: 2 },
    { baseUrlPart: 'admission', category: 'admission', maxPages: 2 },
    { baseUrlPart: 'answer-key', category: 'answer-key', maxPages: 2 },
    // Syllabus gets extra pages because user specifically pointed out missing items there!
    { baseUrlPart: 'syllabus', category: 'syllabus', maxPages: 5 }
  ];

  for (const page of landingPages) {
    try {
      const pageLinks = await collectCategoryLinksPaginated(page.category, page.baseUrlPart, page.maxPages);
      for (const item of pageLinks) {
        if (!candidateUrlsSet.has(item.url)) {
          candidateUrlsSet.add(item.url);
          candidates.push(item);
        }
      }
    } catch (e: any) {
      console.error(`Error loading page links for ${page.baseUrlPart}:`, e.message);
    }
  }

  // 1.5 Collect additional syllabus links from search page to catch older ones
  console.log("Collecting syllabus links from search page...");
  try {
    const searchHtml = await fetchPage('https://sarkariresult.com.cm/?s=syllabus');
    if (searchHtml) {
      const $ = cheerio.load(searchHtml);
      $('a').each((i, el) => {
        const href = $(el).attr('href');
        const title = $(el).text().trim().toLowerCase();
        if (href && href.startsWith(BASE_URL) && !EXCLUDED_URLS.includes(href)) {
          if (!candidateUrlsSet.has(href)) {
            if (title.includes('syllabus') || title.includes('exam pattern') || href.includes('syllabus') || href.includes('exam-pattern')) {
              candidateUrlsSet.add(href);
              candidates.push({ url: href, category: 'syllabus' });
              console.log(`[DISCOVERY] Found search result syllabus: ${title} -> ${href}`);
            }
          }
        }
      });
    }
  } catch (searchErr: any) {
    console.error("Error fetching search page:", searchErr.message);
  }

  // 2. Also check the homepage list elements
  console.log("Collecting links from main homepage...");
  const homeHtml = await fetchPage(BASE_URL);
  if (homeHtml) {
    const $ = cheerio.load(homeHtml);
    $('.wp-block-latest-posts__list').each((i, el) => {
      let heading = $(el).prevAll('p.gb-headline').first().text().trim().toLowerCase();
      if (!heading) heading = $(el).parent().prevAll().find('p.gb-headline').first().text().trim().toLowerCase();
          
      let category = '';
      if (heading.includes('result')) category = 'result';
      else if (heading.includes('admit card')) category = 'admit-card';
      else if (heading.includes('latest job')) category = 'latest-job';
      else if (heading.includes('admission')) category = 'admission';
      else if (heading.includes('answer key')) category = 'answer-key';
      else if (heading.includes('document') || heading.includes('syllabus')) category = 'syllabus'; 
      
      if (category) {
        $(el).find('a').each((j, link) => {
          const href = $(link).attr('href');
          const title = $(link).text().trim().toLowerCase();
                  
          if (href && href.startsWith(BASE_URL) && !EXCLUDED_URLS.includes(href)) {
            if (!candidateUrlsSet.has(href)) {
              candidateUrlsSet.add(href);
              
              let finalCategory = category;
              if (category === 'syllabus') {
                if (title.includes('calendar') || title.includes('time table') || title.includes('schedule')) {
                  finalCategory = 'calendar';
                } else if (title.includes('syllabus') || title.includes('exam pattern')) {
                  finalCategory = 'syllabus';
                } else {
                  finalCategory = 'documents';
                }
              }
              candidates.push({ url: href, category: finalCategory });
            }
          }
        });
      }
    });
  }

  // 3. Filter candidates to only keep ones we haven't scraped yet
  const toScrape = candidates.filter(c => {
    const urlObj = new URL(c.url);
    let pathName = urlObj.pathname;
    if (!pathName.startsWith('/')) pathName = '/' + pathName;
    return !existingUrls.has(pathName) && !existingUrls.has(c.url);
  });

  // Prioritize syllabus category so they are scraped first
  toScrape.sort((a, b) => {
    if (a.category === 'syllabus' && b.category !== 'syllabus') return -1;
    if (a.category !== 'syllabus' && b.category === 'syllabus') return 1;
    return 0;
  });

  console.log(`Discovered ${candidates.length} total post links. ${toScrape.length} are new. Starting scrape...`);
  
  let added = 0;
  for (const item of toScrape) {
    try {
      const jobData = await scrapeJob(item.url, item.category);
      if (jobData) {
        existingJobs.push(jobData);
        existingUrls.add(jobData.path);
        added++;
        // Write to local DB incrementally so progress is preserved
        fs.writeFileSync(DB_PATH, JSON.stringify(existingJobs, null, 2));
        await new Promise(r => setTimeout(r, 600));
      }
    } catch (err: any) {
      console.error(`Error scraping ${item.url}:`, err.message);
    }
  }
  
  console.log(`Scraping completed! Added ${added} new jobs to govexam_db.json and Firestore.`);
}

main();
