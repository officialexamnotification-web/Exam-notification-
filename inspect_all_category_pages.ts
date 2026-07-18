import * as cheerio from 'cheerio';

const CATEGORIES = [
  { url: 'https://sarkariresult.com.cm/latest-jobs/', name: 'latest-job' },
  { url: 'https://sarkariresult.com.cm/admit-card/', name: 'admit-card' },
  { url: 'https://sarkariresult.com.cm/result/', name: 'result' },
  { url: 'https://sarkariresult.com.cm/admission/', name: 'admission' },
  { url: 'https://sarkariresult.com.cm/answer-key/', name: 'answer-key' },
  { url: 'https://sarkariresult.com.cm/syllabus/', name: 'syllabus' }
];

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
  'https://sarkariresult.com.cm/disclaimer/'
];

async function test() {
  for (const cat of CATEGORIES) {
    console.log(`\nFetching ${cat.name} page: ${cat.url}`);
    const res = await fetch(cat.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });
    if (!res.ok) {
       console.log(`Failed to fetch ${cat.name}: ${res.status}`);
       continue;
    }
    const html = await res.text();
    const $ = cheerio.load(html);
    const links: string[] = [];
    $('a').each((i, el) => {
      const href = $(el).attr('href');
      if (href && href.startsWith('https://sarkariresult.com.cm/') && !EXCLUDED_URLS.includes(href)) {
         links.push(href);
      }
    });
    console.log(`Found ${links.length} potential links for ${cat.name}.`);
    console.log("Sample of first 5 links:");
    links.slice(0, 5).forEach((l, idx) => console.log(`  ${idx + 1}. ${l}`));
  }
}

test();
