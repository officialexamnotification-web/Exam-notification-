import * as cheerio from "cheerio";
async function run() {
  const html = await fetch('https://sarkariresult.com.cm/category/latest-job/page/2/').then(r=>r.text());
  const $ = cheerio.load(html);
  
  console.log('Page 2 gb-query-loop:', $(".gb-query-loop-item .gb-headline a").length);
}
run();
