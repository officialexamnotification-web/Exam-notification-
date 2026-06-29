import * as cheerio from "cheerio";
async function run() {
  const t = await fetch('https://sarkariresult.com.cm/').then(r=>r.text());
  const $ = cheerio.load(t);
  
  const categories: Record<string, {title: string, url: string}[]> = {};
  
  // Each category block usually has an h2/h3 as title
  $('h2, h3').each((i, heading) => {
      const title = $(heading).text().trim();
      if(!title || title.length > 40) return; // ignore long meta headings
      
      const links: {title: string, url: string}[] = [];
      // find next list of links
      let nextEl = $(heading).next();
      // traverse siblings until next heading
      while(nextEl.length > 0 && !['H2', 'H3'].includes(nextEl[0].name.toUpperCase())) {
          nextEl.find('a').each((j, a) => {
             const txt = $(a).text().trim();
             const href = $(a).attr('href');
             if(txt && href) links.push({title: txt, url: href});
          });
          
          if(nextEl[0].tagName === 'A') {
              const txt = $(nextEl).text().trim();
              const href = $(nextEl).attr('href');
              if(txt && href) links.push({title: txt, url: href});
          }
          
          nextEl = nextEl.next();
      }
      
      if(links.length > 0) {
          categories[title] = links;
      }
  });

  console.log(Object.keys(categories));
}
run();
