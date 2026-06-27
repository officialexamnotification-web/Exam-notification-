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
  let missedByOld = [];
  $("#content ul li a, .entry-content ul li a").each((i, el) => {
      const title = $(el).text().trim();
      let url = $(el).attr("href") || '';
      
      const oldCheck = url.includes('sarkariresult.com.cm') || url.startsWith('/');
      if (oldCheck) c1++;
      else missedByOld.push(url);

      const newCheck = url.includes('sarkariresult') || url.startsWith('/');
      if (newCheck) c2++;
  });

  console.log(`Old check matched: ${c1}`);
  console.log(`New check matched: ${c2}`);
  if (missedByOld.length > 0) {
      console.log("Missed by old check:", missedByOld.slice(0, 5));
  }
}
run();
