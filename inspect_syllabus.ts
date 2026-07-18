import * as cheerio from 'cheerio';

async function test() {
  const url = 'https://sarkariresult.com.cm/syllabus/';
  console.log(`Fetching syllabus page: ${url}`);
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    }
  });
  if (!res.ok) {
    console.error(`Failed to fetch with status: ${res.status}`);
    return;
  }
  const html = await res.text();
  const $ = cheerio.load(html);

  console.log("=== HEADING ===");
  console.log($('h1').text().trim());

  console.log("\n=== LINKS IN CONTENT ===");
  const links: {text: string, href: string}[] = [];
  $('a').each((i, el) => {
    const href = $(el).attr('href');
    const text = $(el).text().trim();
    if (href && href.startsWith('https://sarkariresult.com.cm/') && href !== 'https://sarkariresult.com.cm/syllabus/') {
      links.push({ text, href });
    }
  });

  console.log(`Found ${links.length} links on the syllabus page.`);
  console.log("First 30 links:");
  links.slice(0, 30).forEach((l, idx) => {
    console.log(`${idx + 1}. "${l.text}" -> ${l.href}`);
  });
}

test();
