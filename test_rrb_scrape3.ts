import * as cheerio from "cheerio";
import fs from "fs";

async function run() {
  const html = fs.readFileSync('rrb_full_body.html', 'utf8');
  const $ = cheerio.load(html);
  
  const selectors = ['div.entry-content', 'article', 'main', 'div#content', '.post-content', 'div.td-post-content'];
  for (const sel of selectors) {
     console.log(`Selector ${sel} count: ${$(sel).length}, tables inside: ${$(sel).find('table').length}`);
  }
}
run();
