import * as cheerio from "cheerio";
import fs from "fs";

async function run() {
  const targetUrl = `https://sarkariresult.com.cm/railway-rrb-group-d-2026-chk-now/`;
  const response = await fetch(targetUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    }
  });

  const html = await response.text();
  const $ = cheerio.load(html);
  
  fs.writeFileSync('rrb_full_body.html', $('body').html() || '');
  console.log("Dumped full body to rrb_full_body.html");
}
run();
