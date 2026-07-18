import fs from 'fs';
import path from 'path';

async function checkJobContent() {
  try {
    console.log('[CHECK_JOBS] Examining job content structure...');
    
    // Read govexam_db.json
    const dbPath = path.join(process.cwd(), 'govexam_db.json');
    const dbData = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    
    console.log(`[CHECK_JOBS] Loaded ${dbData.length} jobs from govexam_db.json`);
    
    // Check first few jobs
    for (let i = 0; i < Math.min(3, dbData.length); i++) {
      const job = dbData[i];
      console.log(`\n[CHECK_JOBS] Job ${i + 1}: ${job.title}`);
      console.log(`[CHECK_JOBS] Path: ${job.path}`);
      
      if (job.content) {
        const content = job.content;
        
        // Find "Useful Links" section
        const usefulLinksIndex = content.toLowerCase().indexOf('useful links');
        if (usefulLinksIndex > -1) {
          console.log(`[CHECK_JOBS] Found "Useful Links" at position ${usefulLinksIndex}`);
          const afterUsefulLinks = content.substring(usefulLinksIndex);
          console.log(`[CHECK_JOBS] Content after Useful Links (first 500 chars):`);
          console.log(afterUsefulLinks.substring(0, 500));
          
          // Look for boxes after useful links
          const boxPattern = /<div[^>]*class="[^"]*"[^>]*>/g;
          const boxes = afterUsefulLinks.match(boxPattern);
          if (boxes) {
            console.log(`[CHECK_JOBS] Found ${boxes.length} div elements after Useful Links`);
            boxes.slice(0, 5).forEach((box, idx) => {
              console.log(`[CHECK_JOBS] Box ${idx + 1}: ${box.substring(0, 100)}`);
            });
          }
        } else {
          console.log(`[CHECK_JOBS] No "Useful Links" section found`);
        }
        
        // Look for specific pattern mentioned by user
        const titlePattern = /<h\d[^>]*>([^:]+):\s*<\/h\d>/g;
        const titles = content.match(titlePattern);
        if (titles) {
          console.log(`[CHECK_JOBS] Found ${titles.length} title patterns with colons`);
          titles.slice(-5).forEach((title, idx) => {
            console.log(`[CHECK_JOBS] Title ${idx + 1}: ${title}`);
          });
        }
      }
    }
    
  } catch (error: any) {
    console.error('[CHECK_JOBS] Error:', error.message);
    throw error;
  }
}

checkJobContent()
  .then(() => {
    console.log('[CHECK_JOBS] Completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('[CHECK_JOBS] Failed:', error);
    process.exit(1);
  });
