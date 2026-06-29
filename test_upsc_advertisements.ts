import * as cheerio from "cheerio";

async function testUPSCAdvertisements() {
  try {
    console.log("Testing UPSC recruitment advertisements...");
    const targetUrl = "https://upsc.gov.in/recruitment/recruitment-advertisement";
    
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
    console.log("Tables:", $('table').length);
    
    // Look for actual job advertisements
    const jobs = [];
    
    // Check tables first
    $('table tr').each((i, row) => {
      const $row = $(row);
      const cells = $row.find('td');
      
      if (cells.length >= 2) {
        const title = cells.eq(0).text().trim();
        const link = cells.eq(0).find('a').first();
        const href = link.attr('href');
        const date = cells.eq(1).text().trim();
        
        if (title.length > 10 && !title.toLowerCase().includes('advertisement')) {
          jobs.push({
            title: title,
            url: href ? (href.startsWith('http') ? href : `https://upsc.gov.in${href}`) : null,
            date: date
          });
        }
      }
    });
    
    // If no jobs in tables, try other structures
    if (jobs.length === 0) {
      console.log("No jobs in tables, trying other structures...");
      
      $('a').each((i, el) => {
        const text = $(el).text().trim();
        const href = $(el).attr('href');
        
        // Look for PDF links or detailed job postings
        if (text.length > 15 && text.length < 300 && 
            (text.includes('No.') || text.includes('Vacancy') || 
             text.includes('Post') || text.includes('Examination'))) {
          
          jobs.push({
            title: text,
            url: href ? (href.startsWith('http') ? href : `https://upsc.gov.in${href}`) : null,
            date: ''
          });
        }
      });
    }
    
    console.log(`\nFound ${jobs.length} job advertisements`);
    if (jobs.length > 0) {
      console.log("Job advertisements:");
      jobs.slice(0, 10).forEach((job, i) => {
        console.log(`${i + 1}. ${job.title}`);
        if (job.date) console.log(`   Date: ${job.date}`);
        console.log(`   URL: ${job.url}`);
      });
    }
    
  } catch (error) {
    console.error("Error:", error);
  }
}

testUPSCAdvertisements();
