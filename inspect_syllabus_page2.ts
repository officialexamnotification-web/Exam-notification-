import * as cheerio from 'cheerio';

async function test() {
  const url = 'https://sarkariresult.com.cm/syllabus/page/2/';
  console.log(`Fetching page: ${url}`);
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    }
  });
  if (!res.ok) {
    console.error(`Failed: ${res.status}`);
    return;
  }
  const html = await res.text();
  const $ = cheerio.load(html);
  
  console.log("=== POSTS LISTED ON SYLLABUS PAGE 2 ===");
  $('a').each((i, el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().trim();
    if (href.startsWith('https://sarkariresult.com.cm/') && 
        !href.includes('/category/') && 
        !href.includes('/tag/') && 
        href !== 'https://sarkariresult.com.cm/' &&
        href !== 'https://sarkariresult.com.cm/syllabus/' &&
        !href.endsWith('/latest-jobs/') &&
        !href.endsWith('/admit-card/') &&
        !href.endsWith('/result/') &&
        !href.endsWith('/admission/') &&
        !href.endsWith('/answer-key/') &&
        !href.endsWith('/contact/') &&
        !href.endsWith('/privacy-policy/') &&
        !href.endsWith('/disclaimer/') &&
        text.length > 5) {
       console.log(`- Title: "${text}" | URL: ${href}`);
    }
  });
}

test();
