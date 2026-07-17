import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = 'https://sarkariresult.com.cm';
const DB_PATH = path.join(process.cwd(), 'govexam_db.json');
const DATA_DIR = path.join(process.cwd(), 'data');

// Category files
const FILES = {
  result: path.join(DATA_DIR, 'result.json'),
  admit_card: path.join(DATA_DIR, 'admit_card.json'),
  latest_jobs: path.join(DATA_DIR, 'latest_jobs.json'),
  admission: path.join(DATA_DIR, 'admission.json'),
  answer_key: path.join(DATA_DIR, 'answer_key.json'),
  syllabus: path.join(DATA_DIR, 'syllabus.json'),
  calendar: path.join(DATA_DIR, 'calendar.json'),
  documents: path.join(DATA_DIR, 'documents.json')
};

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

async function loadExistingDB() {
  if (fs.existsSync(DB_PATH)) {
    const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    return new Set(data.map((job: any) => job.path || job.originalUrl || job.url));
  }
  return new Set();
}

function initFiles() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  for (const [key, filepath] of Object.entries(FILES)) {
    if (!fs.existsSync(filepath)) {
      fs.writeFileSync(filepath, JSON.stringify([], null, 2));
    }
  }
}

async function fetchPage(url: string) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    if (!response.ok) return null;
    return await response.text();
  } catch (e) {
    return null;
  }
}

function cleanContent(html: string) {
  const $ = cheerio.load(html);
  $('script, style, iframe, header, footer, nav, .sidebar, .comments, .ads, .advertisement, noscript, svg, path, symbol').remove();
  
  let mainContent = $('.entry-content').first();
  if (mainContent.length === 0) mainContent = $('main').first();
  
  mainContent.find('.social-buttons, .social-button, .entry-meta, .post-navigation, .sharedaddy, .related-posts, .author-info, #comments').remove();
  
  // Remove links
  mainContent.find('a').each((i, el) => {
    const text = $(el).text().toLowerCase();
    const href = ($(el).attr('href') || '').toLowerCase();
    if (href.includes('t.me') || href.includes('whatsapp') || href.includes('sarkariresult.com.cm')) {
      const parentTr = $(el).closest('tr');
      if (parentTr.length > 0) parentTr.remove();
      else $(el).closest('li').remove() || $(el).remove();
    }
  });

  let textContent = mainContent.html() || '';
  
  // Remove forbidden texts
  for (const ft of FORBIDDEN_TEXT) {
    const regex = new RegExp(ft, 'gi');
    textContent = textContent.replace(regex, '');
  }

  return textContent;
}

async function scrapeJob(url: string, category: string) {
  console.log(`Scraping ${url} for category ${category}`);
  const html = await fetchPage(url);
  if (!html) return null;

  const $ = cheerio.load(html);
  const title = $('.entry-title').first().text().trim() || $('h1').first().text().trim();
  const content = cleanContent(html);
  
  const urlObj = new URL(url);
  const path = urlObj.pathname;
  
  return {
    id: `scraped-${Math.random().toString(36).substring(7)}`,
    title,
    url: path,
    path,
    content,
    originalUrl: url,
    scrapedAt: new Date().toISOString()
  };
}

async function main() {
  console.log("Starting scraper...");
  initFiles();
  const existingJobs = await loadExistingDB();
  console.log(`Loaded ${existingJobs.size} existing jobs to prevent duplicates.`);

  const html = await fetchPage(BASE_URL);
  if (!html) {
    console.error("Failed to load homepage");
    return;
  }

  const $ = cheerio.load(html);
  
  // We need to map boxes to our categories. Let's find all the lists.
  // sarkariresult.com.cm usually has blocks like Result, Admit Card, etc.
  const categoriesToScrape: any[] = [];

  $('.wp-block-latest-posts__list').each((i, el) => {
    // Find the heading right above this list
    let heading = $(el).prevAll('p.gb-headline').first().text().trim().toLowerCase();
    if (!heading) heading = $(el).parent().prevAll().find('p.gb-headline').first().text().trim().toLowerCase();
    
    let category = '';
    if (heading.includes('result')) category = 'result';
    else if (heading.includes('admit card')) category = 'admit_card';
    else if (heading.includes('latest job')) category = 'latest_jobs';
    else if (heading.includes('admission')) category = 'admission';
    else if (heading.includes('answer key')) category = 'answer_key';
    else if (heading.includes('document')) category = 'syllabus'; // We will split this further

    if (category) {
      $(el).find('a').each((j, link) => {
        const href = $(link).attr('href');
        const title = $(link).text().trim().toLowerCase();
        
        if (href && href.startsWith(BASE_URL) && !EXCLUDED_URLS.includes(href)) {
          const pathName = new URL(href).pathname;
          
          if (!existingJobs.has(pathName) && !existingJobs.has(href)) {
            let finalCategory = category;
            
            // Logic to split syllabus box
            if (category === 'syllabus') {
              if (title.includes('calendar') || title.includes('time table') || title.includes('schedule')) {
                finalCategory = 'calendar';
              } else if (title.includes('syllabus') || title.includes('exam pattern')) {
                finalCategory = 'syllabus';
              } else {
                finalCategory = 'documents'; // Everything else in syllabus box like Certificates, PAN, Aadhar
              }
            }
            
            categoriesToScrape.push({ url: href, category: finalCategory });
          }
        }
      });
    }
  });

  console.log(`Found ${categoriesToScrape.length} new jobs to scrape.`);
  
  // We will scrape sequentially to avoid overwhelming
  for (const item of categoriesToScrape) {
    try {
      const jobData = await scrapeJob(item.url, item.category);
      if (jobData) {
        // Read, update and save the specific category file
        const fileKey = item.category as keyof typeof FILES;
        const filePath = FILES[fileKey];
        const existingData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        existingData.push(jobData);
        fs.writeFileSync(filePath, JSON.stringify(existingData, null, 2));
        console.log(`Saved to ${item.category}.json`);
        
        // Also save to main DB to avoid future duplicates in this run
        existingJobs.add(jobData.path);
        
        // Let's be polite
        await new Promise(r => setTimeout(r, 1000));
      }
    } catch (err) {
      console.error(`Error scraping ${item.url}:`, err);
    }
  }
  
  console.log("Scraping completed!");
}

main();
