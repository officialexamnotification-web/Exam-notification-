import fs from 'fs';
import path from 'path';

async function cleanJobContent() {
  try {
    console.log('[CLEAN_JOBS] Starting to clean job content...');
    
    // Read govexam_db.json
    const dbPath = path.join(process.cwd(), 'govexam_db.json');
    const dbData = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    
    console.log(`[CLEAN_JOBS] Loaded ${dbData.length} jobs from govexam_db.json`);
    
    let cleanedCount = 0;
    
    // Clean each job's content
    dbData.forEach((job: any) => {
      if (job.content) {
        const originalContent = job.content;
        
        // Remove boxes that appear after "Useful Links" section
        // Pattern: Remove content after "Useful Links" that contains specific box structures
        let cleanedContent = job.content;
        
        // Remove boxes that match the pattern: "AIIMS NORCET 10th Nursing Officer CBT-II Result 2026 :"
        // and similar box structures that appear after useful links
        
        // Pattern 1: Remove boxes with format like "Title : " at the end of content
        cleanedContent = cleanedContent.replace(/<div[^>]*class="[^"]*short-info-box[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');
        
        // Pattern 2: Remove boxes with format like "Title :" followed by content
        cleanedContent = cleanedContent.replace(/<div[^>]*class="[^"]*overflow-x-auto[^"]*"[^>]*>[\s\S]*?<table[^>]*>[\s\S]*?<\/table>[\s\S]*?<\/div>/gi, (match) => {
          // Only remove if it appears to be a summary box (not main content tables)
          if (match.includes('Short Details') || match.includes('Important Links') || match.includes('Useful Links')) {
            return match; // Keep these
          }
          // Remove boxes that look like summary boxes at the end
          if (match.match(/<h\d[^>]*>.*?:\s*<\/h\d>/i)) {
            return '';
          }
          return match;
        });
        
        // Pattern 3: Remove specific box structures that appear after useful links
        // Look for boxes with format: "Title :" followed by a table or div
        cleanedContent = cleanedContent.replace(/<div[^>]*class="[^"]*cta-injected-blue-box[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');
        
        // Pattern 4: Remove boxes with heading format "Title :" at the end of content
        cleanedContent = cleanedContent.replace(/<h\d[^>]*>([^:]+):\s*<\/h\d>\s*<div[^>]*>[\s\S]*?<\/div>/gi, (match, title) => {
          // Keep if it's a main section heading
          const mainSections = ['Important Dates', 'Application Fee', 'Age Limit', 'Vacancy Details', 'How to Apply', 'Important Links'];
          if (mainSections.some(section => title.toLowerCase().includes(section.toLowerCase()))) {
            return match;
          }
          // Remove if it's a summary box
          return '';
        });
        
        // Pattern 5: Remove boxes that appear after "Useful Links" section
        const usefulLinksIndex = cleanedContent.toLowerCase().indexOf('useful links');
        if (usefulLinksIndex > -1) {
          const beforeUsefulLinks = cleanedContent.substring(0, usefulLinksIndex);
          const afterUsefulLinks = cleanedContent.substring(usefulLinksIndex);
          
          // Remove gb-container divs that appear after useful links
          let afterCleaned = afterUsefulLinks.replace(/<div[^>]*class="[^"]*gb-container[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');
          
          // Remove ads and other unwanted elements after useful links
          afterCleaned = afterCleaned.replace(/<ins[^>]*adsbygoogle[^>]*>[\s\S]*?<\/ins>/gi, '');
          afterCleaned = afterCleaned.replace(/<!--\s*SarkariResult\s*-->[\s\S]*?$/gi, '');
          
          cleanedContent = beforeUsefulLinks + afterCleaned;
        }
        
        if (cleanedContent !== originalContent) {
          job.content = cleanedContent;
          cleanedCount++;
        }
      }
    });
    
    console.log(`[CLEAN_JOBS] Cleaned ${cleanedCount} jobs`);
    
    // Save cleaned data back to govexam_db.json
    fs.writeFileSync(dbPath, JSON.stringify(dbData, null, 2));
    console.log(`[CLEAN_JOBS] Saved cleaned data to ${dbPath}`);
    
    return cleanedCount;
  } catch (error: any) {
    console.error('[CLEAN_JOBS] Error:', error.message);
    throw error;
  }
}

cleanJobContent()
  .then((count) => {
    console.log(`[CLEAN_JOBS] Completed! Cleaned ${count} jobs.`);
    process.exit(0);
  })
  .catch((error) => {
    console.error('[CLEAN_JOBS] Failed:', error);
    process.exit(1);
  });
