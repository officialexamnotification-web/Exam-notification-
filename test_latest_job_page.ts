import * as cheerio from "cheerio";
async function run() {
  const html = await fetch('https://sarkariresult.com.cm/latest-job/').then(r=>r.text());
  const $ = cheerio.load(html);
  
  console.log('ul li a count:', $("#content ul li a, .entry-content ul li a").length);
}
run();
