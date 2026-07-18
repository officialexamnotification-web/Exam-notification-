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
        let cleanedContent = job.content;
        
        // Remove all gb-container divs that appear to be summary boxes (with h6 headings)
        cleanedContent = cleanedContent.replace(/<div[^>]*class="[^"]*gb-container[^"]*"[^>]*>\s*<h6[^>]*>[^<]*<\/h6>\s*<\/div>/gi, '');
        
        // Remove all ads throughout the content
        cleanedContent = cleanedContent.replace(/<ins[^>]*adsbygoogle[^>]*>[\s\S]*?<\/ins>/gi, '');
        
        // Remove SarkariResult comments and content after them
        cleanedContent = cleanedContent.replace(/<!--\s*SarkariResult\s*-->[\s\S]*?$/gi, '');
        
        // Remove short-info-box divs throughout the content
        cleanedContent = cleanedContent.replace(/<div[^>]*class="[^"]*short-info-box[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');
        
        // Remove cta-injected-blue-box divs
        cleanedContent = cleanedContent.replace(/<div[^>]*class="[^"]*cta-injected-blue-box[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');
        
        // Remove boxes that appear after "Useful Links" section
        const usefulLinksIndex = cleanedContent.toLowerCase().indexOf('useful links');
        if (usefulLinksIndex > -1) {
          const beforeUsefulLinks = cleanedContent.substring(0, usefulLinksIndex);
          const afterUsefulLinks = cleanedContent.substring(usefulLinksIndex);
          
          // Remove any remaining gb-container divs after useful links
          let afterCleaned = afterUsefulLinks.replace(/<div[^>]*class="[^"]*gb-container[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');
          
          // Remove empty tables after useful links
          afterCleaned = afterCleaned.replace(/<table[^>]*>\s*<tbody>\s*<\/tbody>\s*<\/table>/gi, '');
          
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
