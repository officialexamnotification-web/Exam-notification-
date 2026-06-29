import * as cheerio from "cheerio";
async function run() {
  const html = await fetch('https://sarkariresult.com.cm/').then(r=>r.text());
  const $ = cheerio.load(html);
  
  const categories: any[] = [];
  $('.wp-block-group, .wp-block-columns .wp-block-column, .gb-container, #post-25, #post-31, #post-33, .box, .post').each((i, el) => {
      const container = $(el);
      let title = container.find('h2, h3, .wp-block-heading, .title').first().text().trim();
      
      if (!title) {
          if (container.attr('id') === 'post-25') title = "Result";
          else if (container.attr('id') === 'post-31') title = "Admit Card";
          else if (container.attr('id') === 'post-33') title = "Latest Job";
      }

      if (!title) return;
      
      const links: any[] = [];
      container.find('a').each((j, a)=>{ 
          let txt = $(a).text().trim();
          if (txt && txt !== title) {
             links.push(txt);
          }
      });
      if (links.length > 2) {
          categories.push({title, count: links.length, samples: links.slice(0, 3)});
      }
  });
  console.log(categories);
}
run();
