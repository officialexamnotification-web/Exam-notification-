import * as cheerio from 'cheerio';

async function test() {
  const url = 'https://sarkariresult.com.cm/category/syllabus/';
  console.log(`Fetching category syllabus URL: ${url}`);
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    }
  });
  console.log(`Status code: ${res.status}`);
  if (res.ok) {
     const html = await res.text();
     const $ = cheerio.load(html);
     const links: {text: string, href: string}[] = [];
     $('a').each((i, el) => {
       const href = $(el).attr('href');
       const text = $(el).text().trim();
       if (href && href.startsWith('https://sarkariresult.com.cm/') && !href.includes('/category/') && !href.includes('/tag/')) {
          links.push({ text, href });
       }
     });
     console.log(`Found ${links.length} potential links on category page.`);
     links.slice(0, 30).forEach((l, idx) => {
        console.log(`${idx + 1}. "${l.text}" -> ${l.href}`);
     });
  }
}

test();
