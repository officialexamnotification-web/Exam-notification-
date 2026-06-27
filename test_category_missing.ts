import * as cheerio from "cheerio";

async function run() {
  const targetUrl = `https://sarkariresult.com.cm/latest-job/`;
  const response = await fetch(targetUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const html = await response.text();
  const $ = cheerio.load(html);

  console.log(".gb-query-loop-item .gb-headline a count:", $(".gb-query-loop-item .gb-headline a").length);
  console.log("#content ul li a count:", $("#content ul li a").length);
  console.log(".entry-content ul li a count:", $(".entry-content ul li a").length);
  console.log("Just ul li a anywhere count:", $("ul li a").length);
  
  // also what about other typical sarkariresult wrappers?
  console.log("#post ul li a count:", $("#post ul li a").length);
}
run();
