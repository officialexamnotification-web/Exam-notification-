import * as cheerio from "cheerio";
async function run() {
  const html = await fetch('https://sarkariresult.com.cm/').then(r=>r.text());
  const $ = cheerio.load(html);
  
  let hpLatestCount = 0;
  // Based on the main site structure, .post or box titles
  $(".box, .post").each((i, el) => {
      const title = $(el).find('h2, h3, .title').first().text().trim().toLowerCase();
      if (title.includes('latest')) {
          hpLatestCount = $(el).find('ul li a').length;
      }
  });
  console.log("Homepage Latest Jobs count:", hpLatestCount);
}
run();
