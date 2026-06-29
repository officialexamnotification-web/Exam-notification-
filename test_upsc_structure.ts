import * as cheerio from "cheerio";
import fs from "fs";

async function testUPSCStructure() {
  try {
    console.log("Analyzing UPSC website structure...");
    const targetUrl = "https://upsc.gov.in/examinations/active-exams";
    
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
    
    // Save HTML for inspection
    fs.writeFileSync('upsc_structure.html', html);
    console.log("HTML saved to upsc_structure.html");
    
    // Analyze structure
    console.log("\n=== PAGE STRUCTURE ANALYSIS ===");
    console.log("Title:", $('title').text());
    console.log("H1:", $('h1').text());
    console.log("H2 count:", $('h2').length);
    console.log("Table count:", $('table').length);
    console.log("Div count:", $('div').length);
    console.log("Link count:", $('a').length);
    
    // Show all H2 headings
    console.log("\n=== H2 HEADINGS ===");
    $('h2').each((i, el) => {
      console.log(`${i + 1}. ${$(el).text().trim()}`);
    });
    
    // Show table structures
    console.log("\n=== TABLE STRUCTURES ===");
    $('table').each((i, table) => {
      const $table = $(table);
      const rows = $table.find('tr').length;
      const cols = $table.find('tr').first().find('td, th').length;
      console.log(`Table ${i + 1}: ${rows} rows, ${cols} columns`);
      
      // Show first row content
      const firstRowText = $table.find('tr').first().text().trim();
      console.log(`  First row: ${firstRowText.substring(0, 100)}...`);
    });
    
    // Look for any text containing "exam", "recruitment", "vacancy"
    console.log("\n=== JOB-RELATED TEXT ===");
    $('*:contains("Exam"), *:contains("Recruitment"), *:contains("Vacancy")').each((i, el) => {
      const text = $(el).text().trim();
      if (text.length > 5 && text.length < 200) {
        console.log(`${i + 1}. ${text}`);
      }
    });
    
  } catch (error) {
    console.error("Error:", error);
  }
}

testUPSCStructure();
