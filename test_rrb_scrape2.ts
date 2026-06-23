import * as cheerio from "cheerio";
import fs from "fs";

async function run() {
  const html = fs.readFileSync('rrb_full_body.html', 'utf8');
  const $ = cheerio.load(html);
  
  // Find all tables and print their parent classes
  const tables = $('table');
  const parents = new Set();
  tables.each((i, el) => {
      let parent = $(el).parent();
      parents.add(parent[0]?.attribs?.class || Object.keys(parent[0]?.attribs || {}).join(' '));
  });
  console.log("Table Parent classes:", Array.from(parents));
  
  const contentTests = ['.gb-container', '.entry-content', '#content', '.gb-grid-column'];
  for (const c of contentTests) {
     console.log(`Selector ${c} has ${$(c).find('table').length} tables`);
  }
}
run();
