import * as cheerio from "cheerio";

async function testUPSCRecruitment() {
  try {
    console.log("Testing UPSC recruitment section...");
    const targetUrl = "https://upsc.gov.in/recruitment";
    
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      }
    });

    if (!response.ok) {
      console.error(`Failed to fetch: ${response.status}`);
      return;
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    
    console.log("Page title:", $('title').text());
    console.log("H2 headings:", $('h2').length);
    
    // Look for recruitment advertisements
    const jobs = [];
    
    // Try to find links with recruitment-related text
    $('a').each((i, el) => {
      const text = $(el).text().trim();
      const href = $(el).attr('href');
      
      if (text.length > 10 && text.length < 200 && 
          (text.includes('Advertisement') || text.includes('Vacancy') || 
           text.includes('Recruitment') || text.includes('Post'))) {
        
        jobs.push({
          title: text,
          url: href ? (href.startsWith('http') ? href : `https://upsc.gov.in${href}`) : null
        });
      }
    });
    
    console.log(`\nFound ${jobs.length} recruitment-related items`);
    if (jobs.length > 0) {
      console.log("Sample items:");
      jobs.slice(0, 8).forEach((job, i) => {
        console.log(`${i + 1}. ${job.title}`);
        console.log(`   URL: ${job.url}`);
      });
    }
    
  } catch (error) {
    console.error("Error:", error);
  }
}

testUPSCRecruitment();
