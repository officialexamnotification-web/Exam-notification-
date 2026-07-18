import * as cheerio from 'cheerio';

async function test() {
  const url = 'https://sarkariresult.com.cm/?s=syllabus';
  console.log(`Searching target website for "syllabus": ${url}`);
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    }
  });
  if (!res.ok) {
    console.error(`Search failed: ${res.status}`);
    return;
  }
  const html = await res.text();
  const $ = cheerio.load(html);
  
  console.log("=== SEARCH RESULTS FOR SYLLABUS ===");
  const results: {title: string, href: string}[] = [];
  $('a').each((i, el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().trim();
    if (href.startsWith('https://sarkariresult.com.cm/') && 
        !href.includes('/category/') && 
        !href.includes('/tag/') && 
        href !== 'https://sarkariresult.com.cm/' &&
        !href.endsWith('/syllabus/') &&
        !href.endsWith('/latest-jobs/') &&
        !href.endsWith('/admit-card/') &&
        !href.endsWith('/result/') &&
        !href.endsWith('/admission/') &&
        !href.endsWith('/answer-key/') &&
        text.length > 5) {
       if (!results.some(r => r.href === href)) {
         results.push({ title: text, href });
       }
    }
  });
  
  console.log(`Found ${results.length} search results.`);
  results.forEach((r, idx) => {
    console.log(`${idx + 1}. "${r.title}" -> ${r.href}`);
  });
}

test();
