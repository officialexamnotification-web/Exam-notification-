// DISABLED: SarkariResult scraping stopped due to trademark/copyright concerns
// Use official government sources instead: uppbpb.gov.in, upsc.gov.in, ssc.nic.in, ibps.in
/*
import * as cheerio from "cheerio";
async function run() {
  const t = await fetch('https://sarkariresult.com.cm/').then(r=>r.text());
  const $ = cheerio.load(t);
  
  const content = $('.entry-content').html();
  if (content) {
      console.log(content.substring(0, 500));
      console.log("length: ", content.length);
  } else {
      console.log("No entry content");
  }
}
run();
*/
