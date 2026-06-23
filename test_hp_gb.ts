import * as cheerio from "cheerio";
async function run() {
  const html = await fetch('https://sarkariresult.com.cm/').then(r=>r.text());
  const $ = cheerio.load(html);
  
  $('.gb-container').each((i, el) => {
      const title = $(el).find('h2.gb-headline, h3.gb-headline').first().text().trim();
      const links = $(el).find('a').length;
      if (title && links > 0) {
          console.log(`Container ${i}: [${title}] has ${links} links.`);
      }
  });

}
run();
