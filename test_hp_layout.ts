import * as cheerio from "cheerio";
async function run() {
  const html = await fetch('https://sarkariresult.com.cm/').then(r=>r.text());
  const $ = cheerio.load(html);
  
  const h2Count = $("h2").length;
  console.log("h2 tags count:", h2Count);
  $("h2").each((i, el) => {
     console.log("h2:", $(el).text().trim(), "- Links Inside:", $(el).parent().find('a').length, "- Links NextSibling:", $(el).next().find('a').length);
  });
  
  // A generic way: find h2/h3 that contains latest jobs, then find ul li a near it
  $("h2, h3, .wp-block-heading").each((i, el) => {
      const heading = $(el).text().trim().toLowerCase();
      if (heading.includes('latest')) {
          let wrapper = $(el).closest('div');
          // look for ul
          let ulCount = wrapper.find('ul li a').length;
          console.log(`Heading '${heading}' has ${ulCount} links inside wrapper.`);
          if (ulCount === 0) {
             let nextUlCount = wrapper.next().find('ul li a').length;
             console.log(`Heading '${heading}' has ${nextUlCount} links in next wrapper.`);
          }
      }
  });

}
run();
