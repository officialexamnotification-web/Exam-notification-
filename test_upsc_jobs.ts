import * as cheerio from "cheerio";

async function testUPSCJobs() {
  try {
    console.log("Testing UPSC job extraction...");
    const targetUrl = "https://upsc.gov.in/examinations/active-exams";
    
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      }
    });

    if (!response.ok) {
      console.error(`Failed to fetch UPSC active exams: ${response.status}`);
      return;
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    
    console.log("Page title:", $('title').text());
    
    // Look for examination table or list
    const jobs = [];
    
    // Try different selectors for UPSC exam listings
    const selectors = [
      'table tbody tr',
      '.exam-list tr',
      '.examination-table tr',
      'table tr',
      '.list-group-item'
    ];
    
    for (const selector of selectors) {
      const elements = $(selector);
      if (elements.length > 2) {
        console.log(`Found ${elements.length} elements with selector: ${selector}`);
        
        elements.each((i, el) => {
          const $row = $(el);
          const text = $row.text().trim();
          
          // Skip header rows
          if (text.toLowerCase().includes('examination') || text.toLowerCase().includes('date') || text.length < 10) {
            return;
          }
          
          const link = $row.find('a').first();
          const href = link.attr('href');
          const title = link.text().trim() || $row.find('td').eq(0).text().trim();
          
          if (title && title.length > 5) {
            jobs.push({
              title: title,
              url: href ? (href.startsWith('http') ? href : `https://upsc.gov.in${href}`) : null,
              rawText: text
            });
          }
        });
        
        if (jobs.length > 0) {
          break;
        }
      }
    }
    
    console.log(`\nTotal jobs found: ${jobs.length}`);
    if (jobs.length > 0) {
      console.log("Sample jobs:");
      jobs.slice(0, 5).forEach((job, i) => {
        console.log(`${i + 1}. ${job.title}`);
        console.log(`   URL: ${job.url}`);
        console.log(`   Details: ${job.rawText.substring(0, 100)}...`);
      });
    }
    
  } catch (error) {
    console.error("Error extracting UPSC jobs:", error);
  }
}

testUPSCJobs();
