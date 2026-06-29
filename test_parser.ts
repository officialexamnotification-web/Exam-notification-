// DISABLED: SarkariResult scraping stopped due to trademark/copyright concerns
// Use official government sources instead: uppbpb.gov.in, upsc.gov.in, ssc.nic.in, ibps.in
/*
import * as cheerio from "cheerio";
async function run() {
  const t = await fetch('https://sarkariresult.com.cm/').then(r=>r.text());
  const $ = cheerio.load(t);
  
  const results: any[] = [];
  $('.gb-headline').each((i, el)=>{ 
    const title = $(el).text().trim(); 
    if(title.length < 3 || title.length > 50) return; 

    // Find the closest container
    let container = $(el).closest('.gb-container, .gb-grid-column');
    const links: any[] = [];
    
    container.find('a').each((j, a)=>{ 
        const txt = $(a).text().trim();
        const url = $(a).attr('href');
        
        // Exclude tags or read more if needed
        if (txt && url && txt !== title && !txt.includes('Read More')) {
            links.push({title: txt, url});
        }
    }); 
    
    if(links.length > 2) {
        // Find existing to prevent duplicates
        if (!results.find(r => r.title === title)) {
            results.push({title, links});
        }
    } 
  }); 

  // Output part of the JSON to verify
  console.log(JSON.stringify(results, null, 2).substring(0, 1500));
}
run();
*/
