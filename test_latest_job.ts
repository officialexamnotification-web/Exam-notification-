import * as cheerio from "cheerio";
async function run() {
  const html = await fetch('https://sarkariresult.com.cm/latest-job/').then(r=>r.text());
  const $ = cheerio.load(html);
  console.log('gb loop:', $(".gb-query-loop-item .gb-headline a").length);
}
run();
