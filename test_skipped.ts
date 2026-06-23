import * as cheerio from "cheerio";
async function run() {
  const html = await fetch('https://sarkariresult.com.cm/result/').then(r=>r.text());
  const $ = cheerio.load(html);
  
  let matchCount = 0;
  let skippedCount = 0;
  $("#content ul li a, .entry-content ul li a").each((i, el) => {
      let url = $(el).attr("href") || '';
      if (url.includes('sarkariresult.com.cm') || url.startsWith('/')) {
         matchCount++;
      } else {
         skippedCount++;
         if (skippedCount <= 5) {
             console.log("Skipped URL:", url);
         }
      }
  });
  console.log(`Matched: ${matchCount}, Skipped: ${skippedCount}`);
}
run();
