import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = 'https://sarkariresult.com.cm';
const DATA_DIR = path.join(process.cwd(), 'data');

const FILES = {
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

async function fetchPage(url: string) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0'
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
  console.log("Starting docs scraper...");
  const html = await fetchPage(BASE_URL);
  if (!html) return;

  const $ = cheerio.load(html);
  const categoriesToScrape: any[] = [];

  $('.wp-block-latest-posts__list').each((i, el) => {
    let heading = $(el).prevAll('.gb-headline').first().text().trim().toLowerCase();
    if (!heading) heading = $(el).parent().prevAll().find('.gb-headline').first().text().trim().toLowerCase();
    
    if (heading.includes('document')) {
      $(el).find('a').each((j, link) => {
        const href = $(link).attr('href');
        const title = $(link).text().trim().toLowerCase();
        
        if (href && href.startsWith(BASE_URL) && !EXCLUDED_URLS.includes(href)) {
          let finalCategory = 'documents';
          if (title.includes('calendar') || title.includes('time table') || title.includes('schedule')) {
            finalCategory = 'calendar';
          } else if (title.includes('syllabus') || title.includes('exam pattern')) {
            finalCategory = 'syllabus';
          }
          categoriesToScrape.push({ url: href, category: finalCategory });
        }
      });
    }
  });

  console.log(`Found ${categoriesToScrape.length} new jobs to scrape.`);
  
  let calendarData = [];
  let syllabusData = [];
  let docsData = [];

  for (const item of categoriesToScrape) {
    try {
      const jobData = await scrapeJob(item.url, item.category);
      if (jobData) {
        if (item.category === 'calendar') calendarData.push(jobData);
        else if (item.category === 'syllabus') syllabusData.push(jobData);
        else docsData.push(jobData);
        await new Promise(r => setTimeout(r, 500));
      }
    } catch (err) {}
  }
  
  fs.writeFileSync(FILES.calendar, JSON.stringify(calendarData, null, 2));
  fs.writeFileSync(FILES.syllabus, JSON.stringify(syllabusData, null, 2));
  fs.writeFileSync(FILES.documents, JSON.stringify(docsData, null, 2));
  console.log("Docs scraping completed!");
}

main();
