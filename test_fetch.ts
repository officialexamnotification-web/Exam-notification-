import * as cheerio from "cheerio";
async function run() {
  const t = await fetch('https://sarkariresult.com.cm/latest-jobs/').then(r=>r.text());
  const $ = cheerio.load(t);
  
  let href = $('a').eq(65).attr('href');
  console.log("Found URL:", href);
  
  const t2 = await fetch(href).then(r=>r.text());
  const $2 = cheerio.load(t2);
  
  $2('table').each((i, el) => {
     console.log("TABLE", i, $2(el).text().substring(0, 50).replace(/\n/g, " "));
  });
}
run();
