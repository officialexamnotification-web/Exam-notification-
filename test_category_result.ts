import * as cheerio from "cheerio";
async function run() {
  const resultHtml = await fetch('https://sarkariresult.com.cm/result/').then(r=>r.text());
  const $ = cheerio.load(resultHtml);
  
  console.log('Result Page Selectors:');
  console.log('gb-query-loop:', $(".gb-query-loop-item .gb-headline a").length);
  console.log('ul li a fallback:', $("#content ul li a, .entry-content ul li a").length);
  console.log('post a tags:', $("#content a").length);
  const items: string[] = [];
  $("#content ul li a, .entry-content ul li a").slice(0, 5).each((i, el) => {
     items.push($(el).text().trim());
  });
  console.log("fallback samples:", items);
  
}
run();
