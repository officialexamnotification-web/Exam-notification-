import * as cheerio from "cheerio";

async function testIBPSScraping() {
  try {
    console.log("Testing IBPS website scraping...");
    const targetUrl = "https://ibps.in";
    
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      }
    });

    if (!response.ok) {
      console.error(`Failed to fetch IBPS: ${response.status}`);
      return;
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    
    console.log("Page title:", $('title').text());
    console.log("Total links found:", $('a').length);
    
    // Look for job/recruitment related links
    const jobLinks = [];
    $('a').each((i, el) => {
      const text = $(el).text().trim().toLowerCase();
      const href = $(el).attr('href');
      
      if (href && (text.includes('recruitment') || text.includes('vacancy') || text.includes('exam') || text.includes('notification') || text.includes(' CWE'))) {
        jobLinks.push({
          text: $(el).text().trim(),
          href: href.startsWith('http') ? href : `${targetUrl}${href}`
        });
      }
    });
    
    console.log(`Found ${jobLinks.length} job-related links`);
    if (jobLinks.length > 0) {
      console.log("Sample job links:", jobLinks.slice(0, 5));
    }
    
  } catch (error) {
    console.error("Error scraping IBPS:", error);
  }
}

testIBPSScraping();
