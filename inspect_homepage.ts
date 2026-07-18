import * as cheerio from 'cheerio';

async function test() {
  const res = await fetch('https://sarkariresult.com.cm/');
  const html = await res.text();
  const $ = cheerio.load(html);
  
  console.log("=== HEADLINES ===");
  $('p.gb-headline, h1, h2, h3, h4').each((i, el) => {
    const text = $(el).text().trim();
    if (text) {
      console.log(`Tag: ${el.tagName}, Text: "${text}"`);
    }
  });

  console.log("\n=== ALL LATEST POSTS LISTS ===");
  $('.wp-block-latest-posts__list').each((i, el) => {
    // Find the nearest heading or preceding headline
    let heading = $(el).prevAll('p.gb-headline').first().text().trim();
    if (!heading) heading = $(el).parent().prevAll().find('p.gb-headline').first().text().trim();
    if (!heading) heading = $(el).prevAll('h2, h3, h4, p').first().text().trim();
    
    console.log(`\nList index: ${i}, Heading detected: "${heading}"`);
    $(el).find('a').slice(0, 5).each((j, link) => {
      console.log(`  - ${$(link).text().trim()} (${$(link).attr('href')})`);
    });
  });
}

test();
