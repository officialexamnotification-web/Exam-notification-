import * as cheerio from "cheerio";
async function run() {
  const t = await fetch('https://sarkariresult.com.cm/').then(r=>r.text());
  const $ = cheerio.load(t);
  
  // Just dump element classes to understand structure
  const structure: string[] = [];
  $('div').each((i, div) => {
    const cls = $(div).attr('class');
    if(cls) structure.push(cls);
  });
  console.log([...new Set(structure)].slice(0, 30));
}
run();
