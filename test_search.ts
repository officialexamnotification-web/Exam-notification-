import * as cheerio from "cheerio";
Object.assign(global, { cheerio });
fetch('https://sarkariresult.com.cm/?s=police').then(r=>r.text()).then(t => {
  const $ = cheerio.load(t);
  console.log('h1:', $('h1').text());
});
