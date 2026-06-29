// DISABLED: SarkariResult scraping stopped due to trademark/copyright concerns
// Use official government sources instead: uppbpb.gov.in, upsc.gov.in, ssc.nic.in, ibps.in
/*
import * as cheerio from "cheerio";

async function run() {
  const targetUrl = `https://sarkariresult.com.cm/latest-job/`;
  const response = await fetch(targetUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const html = await response.text();
  const $ = cheerio.load(html);

  const matchingLinks: any[] = [];
  $("#content ul li a, .entry-content ul li a").each((i, el) => {
      const title = $(el).text().trim();
      let url = $(el).attr("href") || '';
      if (title.length < 5 || /[\u0900-\u097F]/.test(title)) return;
      if (title.toLowerCase() === 'sarkari result' || title.toLowerCase() === 'sarkari results') return;

      if (url.includes('sarkariresult.com.cm') || url.startsWith('/')) {
          let cleanedUrl = url.replace(/https?:\/\/(www\.)?sarkariresult\.com\.cm/i, '');
          matchingLinks.push({ title, rawUrl: url, cleanedUrl });
      }
  });

  console.log(`Total parsed: ${matchingLinks.length}`);
  console.log("First 5:", matchingLinks.slice(0, 5));
  console.log("Last 5:", matchingLinks.slice(-5));
}
run();

*/