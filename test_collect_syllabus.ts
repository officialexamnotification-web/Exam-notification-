import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';

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

async function collectCategoryLinksPaginated(categoryName: string, baseUrlPart: string, maxPages = 1) {
  const links: {url: string, category: string, title: string}[] = [];
  const candidateUrlsSet = new Set<string>();
  
  for (let page = 1; page <= maxPages; page++) {
    const url = page === 1 
      ? `https://sarkariresult.com.cm/${baseUrlPart}/` 
      : `https://sarkariresult.com.cm/${baseUrlPart}/page/${page}/`;
      
    const html = await fetchPage(url);
    if (!html) break;
    
    const $ = cheerio.load(html);
    $('a').each((i, el) => {
      const href = $(el).attr('href');
      const title = $(el).text().trim();
      const titleLower = title.toLowerCase();
      
      if (href && href.startsWith(BASE_URL) && !EXCLUDED_URLS.includes(href)) {
        if (!candidateUrlsSet.has(href)) {
          candidateUrlsSet.add(href);
          
          let finalCategory = categoryName;
          if (categoryName === 'syllabus') {
            if (titleLower.includes('calendar') || titleLower.includes('time table') || titleLower.includes('schedule')) {
              finalCategory = 'calendar';
            } else if (titleLower.includes('syllabus') || titleLower.includes('exam pattern')) {
              finalCategory = 'syllabus';
            } else {
              finalCategory = 'documents';
            }
          }
          links.push({ url: href, category: finalCategory, title });
        }
      }
    });
  }
  return links;
}

async function main() {
  const links = await collectCategoryLinksPaginated('syllabus', 'syllabus', 1);
  console.log("=== COLLECTED LINKS FOR SYLLABUS ===");
  links.forEach(l => {
     console.log(`Title: "${l.title}" | Category: "${l.category}" | URL: ${l.url}`);
  });
}

main();
