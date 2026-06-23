import * as cheerio from "cheerio";
async function run() {
  const html = await fetch('https://sarkariresult.com.cm/').then(r=>r.text());
  const $ = cheerio.load(html);
  
  const blocks = {
    result: $("#post-25 ul li a").length,
    admitCard: $("#post-31 ul li a").length,
    latestJob: $("#post-33 ul li a").length,
  };
  
  console.log("Homepage boxes count:", blocks);
  
  // also check category pages total count on page 1
  const latestHtml = await fetch('https://sarkariresult.com.cm/category/latest-job/').then(r=>r.text());
  const $2 = cheerio.load(latestHtml);
  
  // Let's print all `a` tags in the main content container to see if there's any other container than gb-query-loop
  const mainContentLinks = $2("main#main a").length;
  console.log("Latest Jobs page 1 main content links:", mainContentLinks);
}
run();
