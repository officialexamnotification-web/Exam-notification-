import * as cheerio from "cheerio";

async function run() {
  const targetUrl = `https://sarkariresult.com.cm/latest-job/`;
  const response = await fetch(targetUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const html = await response.text();
  const $ = cheerio.load(html);

  let c1 = 0;
  let c2 = 0;
  $("#content ul li a, .entry-content ul li a").each((i, el) => {
      const title = $(el).text().trim();
      let url = $(el).attr("href") || '';
      
      if (url.includes('sarkariresult.com.cm') || url.startsWith('/')) c1++;
      if (url.includes('sarkariresult') || url.startsWith('/')) c2++;
  });

  console.log(`With sarkariresult.com.cm filter: ${c1}`);
  console.log(`With sarkariresult filter: ${c2}`);
}
run();
