// DISABLED: SarkariResult scraping stopped due to trademark/copyright concerns
// Use official government sources instead: uppbpb.gov.in, upsc.gov.in, ssc.nic.in, ibps.in
/*
import * as cheerio from "cheerio";
async function run() {
  const html = await fetch('https://sarkariresult.com.cm/category/latest-job/').then(r=>r.text());
  const $ = cheerio.load(html);
  
  // Let's print out the classes of the main link containers
  const classes: Record<string, number> = {};
  $("a").each((i, el) => {
      const parentClass = $(el).parent().attr('class') || 'no-class';
      classes[parentClass] = (classes[parentClass] || 0) + 1;
  });
  console.log(Object.entries(classes).sort((a,b)=>b[1]-a[1]).slice(0, 15));
}
run();

*/