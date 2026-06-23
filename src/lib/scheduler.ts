import * as cheerio from "cheerio";
import { doc, setDoc, getDoc } from "firebase/firestore";
import cron from "node-cron";

const targetUrlBase = "https://sarkariresult.com.cm";

const cleanText = (text: string) => {
  if (!text) return text;
  return text.replace(/sarkari\s*result(?:s)?(?:\.com\.cm|\.com|\.info|\.net|\.org)?/ig, 'Sarkari Naukri')
             .replace(/sarkariresult/ig, 'SarkariNaukri')
             .replace(/sarkarinaukri\.com\.cm/ig, 'Sarkari Naukri');
};

const replaceHowToWithYouTubeCTA = (contentHtml: string, pageTitle: string): string => {
  if (!contentHtml) return contentHtml;

  try {
      const $ = cheerio.load(contentHtml);
      
      let overallReplaced = false;

      // Helper to generate the new blue banner
      const generateCtaHtml = (heading: string) => {
          const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(heading)}`;
          const lowerTitle = pageTitle.toLowerCase();
          const lowerHeading = heading.toLowerCase();

          let badgeText = "Form Fill-up Video Guide";
          let descriptionText = "Sarkari form bharne me koi dikkat aa rahi hai? Is video guide pe click karke YouTube par step-by-step tutorial video dekhen aur bina kisi galti ke apna form fill karein.";
          let btnText = "Watch Video Guide";

          if (lowerTitle.includes('result') || lowerHeading.includes('result')) {
              badgeText = "Result Checking Guide";
              descriptionText = "Sarkari exam result check karne me koi dikkat aa rahi hai? Is video guide pe click karke YouTube par result download karne ka live step-by-step tutorial video dekhein.";
              btnText = "Watch Result Video";
          } else if (lowerTitle.includes('admit card') || lowerHeading.includes('admit card') || lowerTitle.includes('hall ticket') || lowerHeading.includes('hall ticket')) {
              badgeText = "Admit Card Download Guide";
              descriptionText = "Admit card download karne me koi mushkil ho rahi hai? Is video guide pe click karke YouTube par admit card direct download link aur step-by-step process ka live video dekhein.";
              btnText = "Watch Admit Card Video";
          } else if (lowerTitle.includes('answer key') || lowerHeading.includes('answer key')) {
              badgeText = "Answer Key Video Guide";
              descriptionText = "Exam answer key link check karne aur response sheet download karne me koi dikqat hai? Is video guide pe click karke YouTube par step-by-step tutorial video dekhein.";
              btnText = "Watch Answer Key Video";
          } else if (lowerTitle.includes('syllabus') || lowerHeading.includes('syllabus')) {
              badgeText = "Syllabus Video Guide";
              descriptionText = "Syllabus aur exam pattern samajhne me koi up-down lag raha hai? Is video guide pe click karke YouTube par detailed syllabus breakdown analysis aur tips ka video dekhein.";
              btnText = "Watch Syllabus Video";
          } else if (lowerTitle.includes('admission') || lowerHeading.includes('admission')) {
              badgeText = "Admission Form Filling Guide";
              descriptionText = "College/University Admission registration form bharne me koi confusion hai? Click karke YouTube par full registration process ka real step-by-step guide video dekhein.";
              btnText = "Watch Admission Guide";
          }

          return `
<div class="cta-injected-blue-box my-6 p-5 md:p-6 bg-[#f0f5ff] border-2 border-[#104ba6]/20 rounded-xl shadow-sm text-left max-w-full flex flex-col md:flex-row items-center gap-5 justify-between font-sans">
<div class="flex items-start gap-4">
<div class="flex-shrink-0 bg-red-600 text-white rounded-lg p-2.5 shadow-md flex items-center justify-center">
   <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="currentColor" class="text-white">
      <path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.11C19.517 3.545 12 3.545 12 3.545s-7.517 0-9.388.508a3.003 3.003 0 0 0-2.11 2.11C0 8.033 0 12 0 12s0 3.967.502 5.837a3.003 3.003 0 0 0 2.11 2.11C4.483 20.455 12 20.455 12 20.455s7.517 0 9.388-.508a3.003 3.003 0 0 0 2.11-2.11C24 15.967 24 12 24 12s0-3.967-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
   </svg>
</div>
<div class="flex-1">
   <span class="inline-block bg-[#104ba6] text-white text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded mb-1.5 shadow-sm font-sans">${badgeText}</span>
   <h4 class="text-[16px] md:text-lg font-black text-gray-900 leading-tight">${heading}</h4>
   <p class="text-[13px] text-gray-600 mt-1 leading-relaxed font-sans">
      ${descriptionText}
   </p>
</div>
</div>
<div class="w-full md:w-auto flex-shrink-0">
 <a href="${searchUrl}" target="_blank" rel="noopener noreferrer" class="cta-btn w-full md:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 bg-white text-red-600 font-bold rounded-lg shadow-sm hover:bg-neutral-50 transition-all text-[13.5px] uppercase tracking-wider border border-red-200 font-sans">
    <span>${btnText}</span>
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/></svg>
 </a>
</div>
</div>`;
      };

      // 1. Extreme cleanup: find any DOM element that contains our known CTA text or is an old red box, and obliterate it
      // Known old red backgrounds: bg-red-50, bg-red-100, border-red-200, cta-btn
      let globalHeadingToUse = 'How To Apply/Check';
      
      const findAndDestroyOldBoxes = () => {
          let count = 0;
          
          $('div').each((_, el) => {
              const $el = $(el);
              const classStr = $el.attr('class') || '';
              const textStr = $el.text() || '';
              
              // Identify old or new injected CTAs based on styling or text
              const isRedBox = classStr.includes('bg-red-50') || classStr.includes('bg-red-100');
              const isBlueBox = classStr.includes('bg-[#f0f5ff]') || classStr.includes('cta-injected-blue-box');
              const hasVideoBtn = $el.find('.cta-btn').length > 0;
              const hasOldBadgeText = textStr.includes('Video Guide') && textStr.includes('Step-by-step tutorial');
              
              const isObsoleteWrapper = isRedBox || isBlueBox || (hasVideoBtn && classStr.includes('rounded'));
              
              if (isObsoleteWrapper) {
                  // Capture the heading if we haven't already got a better one
                  const $h4 = $el.find('h4');
                  if ($h4.length > 0) {
                      globalHeadingToUse = $h4.text().trim();
                  } else {
                      const match = $el.find('a').attr('href')?.match(/search_query=([^&]+)/);
                      if (match && match[1]) {
                          globalHeadingToUse = decodeURIComponent(match[1]).replace(/\+/g, ' ');
                      }
                  }
                  
                  $el.remove();
                  count++;
              }
          });
          return count;
      };

      const removedCount = findAndDestroyOldBoxes();

      // If we removed ANY boxes (red or blue), it means the CTA was already in the document.
      // We'll just generate ONE pristine blue box and insert it at the very top of the article, OR just return if we already injected.
      // Wait, better yet, just reconstruct exactly ONE blue box and put it before the first table, or at the end.
      // If we removed old boxes, we MUST re-inject the unified blue box so they still get it.
      if (removedCount > 0) {
          const freshHtml = generateCtaHtml(globalHeadingToUse);
          // Just inject it before the first h2 or table
          const anchor = $('table').first().length > 0 ? $('table').first() : $('h2').first();
          if (anchor.length > 0) {
              const parentT = anchor.parent('.overflow-x-auto');
              if (parentT.length > 0) {
                  parentT.before(freshHtml);
              } else {
                  anchor.before(freshHtml);
              }
          } else {
              // fallback
              $.root().append(freshHtml);
          }
          return $.html();
      }

      // 2. Normal flow for FRESH, non-injected pages
      let replacedAny = false;

      const cleanPageTitle = pageTitle
          .replace(/(Sarkari\s*Result|SarkariResult|\.com|\.cm|\|)/gi, '')
          .replace(/\s+/g, ' ')
          .trim();

      // 1. Process all tables
      $('table').each((idx, table) => {
          const $table = $(table);
          const text = $table.text();
          const lowerText = text.toLowerCase();

          // Check if this table is the "How to Fill" or "How to Check/Download" table
          const isHowToMatch = (
              lowerText.includes('how to fill') || 
              lowerText.includes('how to check') || 
              lowerText.includes('how to download') || 
              lowerText.includes('how to apply') || 
              lowerText.includes('how to register') ||
              lowerText.includes('how to online form') ||
              lowerText.includes('how to check result') ||
              lowerText.includes('how to download admit') ||
              lowerText.includes('how to download syllabus') ||
              lowerText.includes('how to download answer key')
          );

          // Also check for standard keywords in instruction blocks to avoid false positives
          const hasInstructKeywords = (
              lowerText.includes('candidate') ||
              lowerText.includes('photo') ||
              lowerText.includes('signature') ||
              lowerText.includes('eligibility') ||
              lowerText.includes('document') ||
              lowerText.includes('thumb impression') ||
              lowerText.includes('recruitment details') ||
              lowerText.includes('print out') ||
              lowerText.includes('application form mun') ||
              lowerText.includes('re-checked') ||
              lowerText.includes('result') ||
              lowerText.includes('admit card') ||
              lowerText.includes('download') ||
              lowerText.includes('registration number') ||
              lowerText.includes('password') ||
              lowerText.includes('roll number') ||
              lowerText.includes('date of birth') ||
              lowerText.includes('official website') ||
              lowerText.includes('click on') ||
              lowerText.includes('link') ||
              lowerText.includes('scroll down') ||
              lowerText.includes('enter your')
          );

          if (isHowToMatch && hasInstructKeywords) {
              // Find the header or heading row's text to make a precise search query
              let extractedHeading = '';
              $table.find('tr').slice(0, 3).each((_, row) => {
                  const rowText = $(row).text().replace(/\s+/g, ' ').trim();
                  if (rowText.toLowerCase().includes('how to') && rowText.length > 10 && rowText.length < 150) {
                      extractedHeading = rowText;
                      return false; // break
                  }
              });

              if (!extractedHeading) {
                  const lowerTitle = cleanPageTitle.toLowerCase();
                  if (lowerTitle.includes('result')) {
                      extractedHeading = `How To Check ${cleanPageTitle} Result`;
                  } else if (lowerTitle.includes('admit card') || lowerTitle.includes('hall ticket')) {
                      extractedHeading = `How To Download ${cleanPageTitle} Admit Card`;
                  } else if (lowerTitle.includes('answer key')) {
                      extractedHeading = `How To Check ${cleanPageTitle} Answer Key`;
                  } else if (lowerTitle.includes('syllabus')) {
                      extractedHeading = `How To Download ${cleanPageTitle} Syllabus`;
                  } else {
                      extractedHeading = `How To Fill ${cleanPageTitle} Online Form`;
                  }
              } else {
                  // Clean reference if any
                  extractedHeading = extractedHeading
                      .replace(/(Sarkari\s*Result|SarkariResult|Sarkari\s*Naukri|\.com|\.cm|\|)/gi, '')
                      .replace(/\s+/g, ' ')
                      .trim();
              }

              const ctaHtml = generateCtaHtml(extractedHeading);

              // If the table was in an overflow-x wrapper, replace or insert outside
              const parent = $table.parent('.overflow-x-auto');
              if (!replacedAny) {
                  if (parent.length > 0) {
                      parent.replaceWith(ctaHtml);
                  } else {
                      $table.replaceWith(ctaHtml);
                  }
                  replacedAny = true;
              } else {
                  if (parent.length > 0) {
                      parent.remove();
                  } else {
                      $table.remove();
                  }
              }
          }
      });

      // 2. Fallback: Process plain lists or paragraphs if they contain instructions
      if (!replacedAny) {
          // If there's no table, inspect fallback headers/paragraphs
          let processedParagraphs = false;
          
          $('h1, h2, h3, h4, h5, p, div').each((_, el) => {
              const $el = $(el);
              const text = $el.text().replace(/\s+/g, ' ').trim();
              const lowerText = text.toLowerCase();

              const isHeadingMatch = (
                  lowerText.startsWith('how to fill') || 
                  lowerText.startsWith('how to check') || 
                  lowerText.startsWith('how to download') ||
                  lowerText.startsWith('how to apply')
              ) && text.length > 10 && text.length < 150;

              if (isHeadingMatch) {
                  const extractedHeading = text.replace(/(Sarkari\s*Result|SarkariResult|Sarkari\s*Naukri|\.com|\.cm|\|)/gi, '').trim();
                  const ctaHtml = generateCtaHtml(extractedHeading);

                  // Remove siblings that look like instruction lists/paragraphs
                  let current = $el.next();
                  while (current.length > 0) {
                      const tag = current[0].tagName.toLowerCase();
                      if (tag === 'table' || tag === 'h1' || tag === 'h2') {
                          break;
                      }
                      if (tag === 'p' || tag === 'ul' || tag === 'ol' || tag === 'div') {
                          const nextSibling = current.next();
                          current.remove();
                          current = nextSibling;
                      } else {
                          break;
                      }
                  }

                  $el.replaceWith(ctaHtml);
                  processedParagraphs = true;
                  return false; // break the loop
              }
          });
      }

      return $.html();
  } catch (e: any) {
      console.error("Error in replaceHowToWithYouTubeCTA:", e.message);
      return contentHtml;
  }
};

function isJobPath(pathStr: string): boolean {
  if (!pathStr || pathStr === '/') return false;
  const p = pathStr.split('?')[0].replace(/\/$/, '') + '/';
  const invalidDirs = [
      '/result/', '/admit-card/', '/latest-job/', '/answer-key/',
      '/syllabus/', '/admission/', '/important/', '/category/',
      '/sarkari-result-2024/', '/sarkari-result-2025/',
      '/privacy-policy/', '/contact-us/', '/about-us/', '/disclaimer/'
  ];
  return !invalidDirs.some(inv => p.includes(inv) || p === inv);
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function sendFCMNotification(title: string, path: string, db: any, content: string, status: '[FCM UPDATED JOB]' | '[FCM NEW JOB]') {
  try {
    const admin = await import("firebase-admin");
    if (!admin.getApps().length) return;

    // Use a safe valid document ID with content hash
    const crypto = await import('node:crypto');
    const hash = crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
    const notifId = encodeURIComponent(path + '_' + hash).replace(/\./g, '%2E');
    
    const docRef = doc(db, 'fcm_history', notifId);
    const snap = await getDoc(docRef);
    // Anti-duplicate layer
    if (snap.exists()) {
      console.log(`[FCM SKIPPED DUPLICATE] ${status} for ${path}`);
      return;
    }
    
    await setDoc(docRef, { path, title, sentAt: new Date().toISOString() });
    
    const { getMessaging } = await import("firebase-admin/messaging");
    await getMessaging().send({
      topic: "broadcast_alerts",
      data: {
        title: "Latest Update: " + title,
        body: "Tap to view full details",
        url: "/?path=" + encodeURIComponent(path)
      }
    });
    console.log(`[FCM SENT] ${status} for: ${path}`);
  } catch (err: any) {
    if (err.message && (err.message.includes("has not been used") || err.message.includes("disabled"))) {
      console.log(`[FCM] Notification skipped because FCM API is not enabled on this GCP project yet.`);
    } else {
      console.log(`[FCM] Broadcast skip info: ${err.message}`);
    }
  }
}

export async function scrapeJobPost(db: any, path: string, isNew: boolean = true, existingContent: string | null = null) {
  try {
    const targetUrl = `${targetUrlBase}${path}`;
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      }
    });

    if (!response.ok) {
       console.warn(`Skipping job post ${targetUrl} (Status: ${response.status})`);
       return;
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    let title = cleanText($('title').text());
    let h1Title = $('h1').first().text();
    if (h1Title && h1Title.length > 5) {
       title = cleanText(h1Title);
    }

    // Extract the main body content
    let $content: any = null;
    const selectors = ['div.entry-content', 'article', 'main', 'div#content', '#content', '.post-content', 'div.td-post-content'];
    
    // 1. Try to find defined container wrappers containing tables first
    for (const sel of selectors) {
      if ($(sel).length > 0 && $(sel).find('table').length > 0) {
        $content = $(sel).first().clone();
        break;
      }
    }

    // 2. Fallback: try to find defined container wrappers even without tables
    if (!$content) {
      for (const sel of selectors) {
        if ($(sel).length > 0) {
          $content = $(sel).first().clone();
          break;
        }
      }
    }

    // 3. Absolute Fallback: use body
    if (!$content) {
      $content = $('body').first().clone();
    }

    // Process content
    $content.find('script, style, iframe, .ad-section, .share-buttons, form, header, footer, nav, .comments-area').remove();
    
    // Create a container to hold only the cleaned, beautifully formatted content
    const $factory = cheerio.load('<div class="scraper-content-view"></div>');
    const $finalContent = $factory('div');
    
    const tables = $content.find('table');

    if (tables.length > 0) {
      // Identify the index of the last Links table containing active download/apply/website action items
      let lastLinksTableIndex = -1;
      tables.each((i, table) => {
        const text = $(table).text().toLowerCase();
        if ($(table).find('a').length > 0 && 
            (text.includes('apply') || text.includes('click') || text.includes('download') || text.includes('official website') || text.includes('important links') || text.includes('useful links'))) {
          lastLinksTableIndex = i;
        }
      });

      tables.each((i, table) => {
        const textForKeywords = $(table).text().toLowerCase();
        
        // SKIP the "Important Question" / FAQ box altogether as requested
        if (textForKeywords.includes('important question') || textForKeywords.includes('frequently asked questions') || textForKeywords.includes('faq')) {
           return; // Skip processing this table
        }

        const $table = $(table).clone();
        
        // Clean up physical layout restraints to keep tables responsive
        $table.removeAttr('width');
        $table.removeAttr('height');
        $table.removeAttr('align');
        $table.find('*').removeAttr('width').removeAttr('height').removeAttr('align');

        // Clear problematic inline styles
        $table.find('*').each((idx, child) => {
           const style = $(child).attr('style');
           if (style) {
               const newStyle = style
                  .replace(/text-align\s*:\s*(center|right|left)[^;]*;?/gi, '')
                  .replace(/background-color\s*:[^;]*;?/gi, '')
                  .replace(/background\s*:[^;]*;?/gi, '')
                  .replace(/color\s*:[^;]*;?/gi, '');
                  
               if (newStyle.trim() === '') {
                   $(child).removeAttr('style');
               } else {
                   $(child).attr('style', newStyle);
               }
           }
           if (child.tagName.toLowerCase() === 'center') {
               child.tagName = 'div';
           }
           $(child).removeAttr('bgcolor');
           $(child).removeAttr('color');
        });

        $table.removeAttr('bgcolor');
        $table.removeAttr('color');
        // Clean leading empty space / br / p in table cells
        $table.find('td, th').each((_, cell) => {
             while (cell.firstChild) {
                  const child = cell.firstChild;
                  if (child.nodeType === 3) { // TEXT_NODE
                       if ((child.nodeValue || '').trim().replace(/\u00a0/g, '') === '') {
                            cell.removeChild(child);
                       } else {
                            break;
                       }
                  } else if (child.nodeType === 1) { // ELEMENT_NODE
                       const el = child as HTMLElement;
                       if (el.tagName.toLowerCase() === 'br') {
                            cell.removeChild(child);
                       } else if (el.tagName.toLowerCase() === 'p') {
                            const pText = el.textContent || '';
                            if (pText.trim().replace(/\u00a0/g, '') === '' && !el.querySelector('img')) {
                                 cell.removeChild(child);
                            } else {
                                 break;
                            }
                       } else {
                            break;
                       }
                  } else {
                       break;
                  }
             }
        });

        // Apply the precise high contrast table specifications
        $table.addClass('w-full border-collapse border-2 border-black my-6 text-sm md:text-base bg-white shadow-sm table-auto');
        $table.find('td, th').addClass('border-2 border-black p-2 md:p-3');

        // Set table headings
        const firstRow = $table.find('tr').first();
        const isRelatedPostsTable = textForKeywords.includes('latest posts') || textForKeywords.includes('related posts');
        
        if (isRelatedPostsTable) {
           $table.find('h1, h2, h3, h4, h5').addClass('primary-table-heading text-center p-2 rounded');
        } else {
           firstRow.find('td, th').addClass('primary-table-heading');
        }

        // Format actions and titles for useful/important links table
        if (i === lastLinksTableIndex) {
           const hasAction = textForKeywords.includes('apply') || textForKeywords.includes('website') || textForKeywords.includes('click') || textForKeywords.includes('notification');
           if (hasAction && !textForKeywords.includes('important links') && !textForKeywords.includes('useful links')) {
               const headingRow = `<tr><td colspan="100%" class="important-links-heading font-bold text-center text-lg text-white bg-[#104ba6] p-2 border-2 border-black border-collapse">Some Useful Important Links</td></tr>`;
               const tbody = $table.find('tbody');
               if (tbody.length) {
                   tbody.first().prepend(headingRow);
               } else {
                   $table.prepend(headingRow);
               }
               firstRow.find('td, th').removeClass('primary-table-heading');
           } else {
               // Keep first links-container heading row uncolored/plain
               firstRow.find('td, th').removeClass('primary-table-heading');
               firstRow.find('td, th').css('background-color', 'transparent');
               firstRow.find('td, th').removeAttr('bgcolor');
               firstRow.find('*').css('background-color', 'transparent');
               firstRow.find('*').removeAttr('bgcolor');
               firstRow.find('*').css('color', 'black');
               firstRow.find('*').removeAttr('color');
               firstRow.css('background-color', 'transparent').removeAttr('bgcolor').css('color', 'black').removeAttr('color');
           }
        }

        // Map links
        $table.find('a').each((lnkIdx, lnk) => {
           const href = $(lnk).attr('href');
           if (href) {
              if (href.includes('whatsapp.com') || href.includes('t.me') || href.includes('play.google.com') || href.includes('youtube.com')) {
                 $(lnk).remove();
              } else {
                 try {
                    const urlObj = new URL(href, targetUrl);
                    if (urlObj.hostname.includes('sarkariresult')) {
                       $(lnk).attr('href', `/?path=${encodeURIComponent(urlObj.pathname + urlObj.search)}`);
                    } else {
                       $(lnk).attr('href', urlObj.toString());
                       $(lnk).attr('target', '_blank');
                    }
                 } catch (e) {}
              }
           }
        });

        // Wrap item for beautiful mobile overflow layouts
        const wrap = $('<div class="overflow-x-auto w-full max-w-full my-6"></div>');
        wrap.append($table);
        $finalContent.append(wrap);
      });
    } else {
      // Robust text-based or list-based page fallback if there are no tables
      const $fallbackContainer = $('<div class="px-4 py-3 md:px-6 md:py-4 bg-white rounded border border-gray-200 shadow-sm leading-relaxed text-gray-800"></div>');
      
      $content.find('p, h1, h2, h3, h4, h5, h6, ul, ol').each((idx, el) => {
         const $el = $(el);
         const text = $el.text().trim();
         if (!text) return;

         const tagName = el.tagName.toLowerCase();
         const cleanVal = cleanText(text);

         if (tagName.startsWith('h')) {
            $fallbackContainer.append(`<h3 class="text-xl font-bold text-gray-900 mt-6 mb-3 pb-1 border-b border-gray-200">${cleanVal}</h3>`);
         } else if (tagName === 'p') {
            $fallbackContainer.append(`<p class="my-3 text-base text-gray-700 font-sans leading-relaxed">${cleanVal}</p>`);
         } else if (tagName === 'ul' || tagName === 'ol') {
            const $list = $el.clone();
            $list.addClass('list-disc list-inside my-3 pl-2 space-y-1.5 text-base text-gray-700 font-sans');
            $list.find('li').each((liIdx, li) => {
               $(li).text(cleanText($(li).text().trim()));
            });
            $fallbackContainer.append($list);
         }
      });

      // Safely process and map all anchor links inside the fallback block
      $fallbackContainer.find('a').each((lnkIdx, lnk) => {
         const href = $(lnk).attr('href');
         if (href) {
            if (href.includes('whatsapp.com') || href.includes('t.me') || href.includes('play.google.com') || href.includes('youtube.com')) {
               $(lnk).remove();
            } else {
               try {
                  const urlObj = new URL(href, targetUrl);
                  if (urlObj.hostname.includes('sarkariresult')) {
                     $(lnk).attr('href', `/?path=${encodeURIComponent(urlObj.pathname + urlObj.search)}`);
                  } else {
                     $(lnk).attr('href', urlObj.toString());
                     $(lnk).attr('target', '_blank');
                  }
               } catch (e) {}
            }
         }
      });

      $finalContent.append($fallbackContainer);
    }

    let finalHtmlResult = $finalContent.html();
    if (finalHtmlResult) {
        finalHtmlResult = replaceHowToWithYouTubeCTA(finalHtmlResult, title);
    }
    if (!finalHtmlResult || finalHtmlResult.trim() === '') {
        console.warn(`[ERROR] Parsed empty content or layout changed at ${targetUrl}. Not overwriting data.`);
        return;
    }

    if (!isNew && existingContent) {
        if (finalHtmlResult === existingContent) {
            console.log(`[NO CHANGE] ${path}`);
            try {
                const checkJobId = encodeURIComponent(path).replace(/\./g, '%2E');
                await setDoc(doc(db, 'jobs', checkJobId), { 
                    lastCheckedAt: new Date().toISOString(),
                    lastChecked: new Date().toISOString()
                }, { merge: true });
            } catch (e) {}
            return;
        }
        console.log(`[UPDATED] Changes detected for ${path}. Updating database.`);
        sendFCMNotification(title, path, db, finalHtmlResult, '[FCM UPDATED JOB]');
    }

    // Save to Firestore
    const jobId = encodeURIComponent(path).replace(/\./g, '%2E'); // Safe document ID
    const jobDoc: any = {
       title,
       content: finalHtmlResult,
       path,
       updatedAt: new Date().toISOString(),
       lastCheckedAt: new Date().toISOString(),
       lastChecked: new Date().toISOString()
    };
    if (isNew) {
       jobDoc.createdAt = new Date().toISOString();
       sendFCMNotification(title, path, db, finalHtmlResult, '[FCM NEW JOB]');
    }

    serverCache.set(`jobs_${jobId}`, jobDoc);

    try {
        await setDoc(doc(db, 'jobs', jobId), jobDoc, { merge: true });
    } catch (e: any) {
        console.error(`[ERROR] Failed to save job ${path} to Firestore: ${e.message}`);
    }
  } catch (err: any) {
    console.error(`[ERROR] Failed to scrape job post ${path}: ${err.message}`);
  }
}

export const serverCache = new Map<string, any>();

export async function runScraper(db: any) {
  try {
    console.log("Starting hourly background scrape...");
    
    let totalRequests = 1; // 1 request for the current homepage fetch
    let newJobsFound = 0;
    let existingJobsSkipped = 0;
    let pagesRechecked = 0;

    const response = await fetch(targetUrlBase + '/', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch home page: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const categories: any[] = [];
    const jobTargets = new Map<string, { isSignificant: boolean, isNew: boolean, title: string }>();

    $('.gb-headline').each((i, el)=>{ 
        let title = cleanText($(el).text().trim()); 
        if(title.length < 3 || title.length > 50) return; 
    
        let container = $(el).closest('.gb-container, .gb-grid-column');
        const links: any[] = [];
        let viewAllUrl = '#';
        
        container.find('a').each((j, a)=>{ 
            let txt = cleanText($(a).text().trim());
            let rawUrl = $(a).attr('href');
            let url = rawUrl;
            let pathPart = rawUrl;

            if (rawUrl) {
                try {
                  const uObj = new URL(rawUrl, targetUrlBase);
                  if (uObj.hostname.includes('sarkariresult.com.cm') || uObj.hostname.includes('sarkariresult')) {
                    pathPart = uObj.pathname + uObj.search;
                    url = `/?path=${encodeURIComponent(pathPart)}`;
                  } else {
                    url = uObj.toString();
                  }
                } catch(e) {}
            }

            if (url) {
                if (txt && (txt.toLowerCase().includes('view more') || txt.toLowerCase().includes('read more'))) {
                    viewAllUrl = url;
                } else if (txt && txt !== title) {
                    let isNew = false;
                    const lowerTxt = txt.toLowerCase();
                    const isSignificantCategory = title.toLowerCase().includes('latest') || title.toLowerCase().includes('job') || title.toLowerCase().includes('admit') || title.toLowerCase().includes('result') || title.toLowerCase().includes('answer') || title.toLowerCase().includes('important') || title.toLowerCase().includes('exam date');
                    
                    if (isSignificantCategory) {
                        if (links.length < 5 || lowerTxt.includes('extend') || lowerTxt.includes('start') || lowerTxt.includes('out') || lowerTxt.includes('now') || lowerTxt.includes('postpone') || lowerTxt.includes('vacancy details')) {
                            isNew = true;
                        }
                    }
                    
                    links.push({id: j.toString() + "-" + Math.random().toString(36).substring(7), title: txt, url, isNew});
                    if (pathPart && pathPart.startsWith('/') && isJobPath(pathPart)) {
                        const existing = jobTargets.get(pathPart);
                        jobTargets.set(pathPart, {
                            isSignificant: existing?.isSignificant || isSignificantCategory,
                            isNew: existing?.isNew || isNew,
                            title: txt
                        });
                    }
                }
            }
        }); 
        
        if(links.length > 2) {
            links.sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0));
            if (!categories.find(c => c.title === title)) {
                categories.push({id: i.toString() + "-" + Math.random().toString(36).substring(7), title, links, viewAllUrl});
            }
        } 
    });

    let trendingLinks: any[] = [];
    $('marquee a').each((i, a) => {
        let txt = cleanText($(a).text().trim());
        let rawUrl = $(a).attr('href');
        let url = rawUrl;
        let pathPart = rawUrl;
        if (txt && rawUrl) {
            try {
              const uObj = new URL(rawUrl, targetUrlBase);
              if (uObj.hostname.includes('sarkariresult.com.cm') || uObj.hostname.includes('sarkariresult')) {
                pathPart = uObj.pathname + uObj.search;
                url = `/?path=${encodeURIComponent(pathPart)}`;
              } else {
                url = uObj.toString();
              }
            } catch(e) {}
            
            let isNew = false;
            const lowerTxt = txt.toLowerCase();
            if (i < 5 || lowerTxt.includes('extend') || lowerTxt.includes('start') || lowerTxt.includes('out') || lowerTxt.includes('now') || lowerTxt.includes('postpone') || lowerTxt.includes('vacancy details')) {
                isNew = true;
            }
            
            trendingLinks.push({ id: `trend-${i}`, title: txt, url, isNew });
            if (pathPart && pathPart.startsWith('/') && isJobPath(pathPart)) {
                const existing = jobTargets.get(pathPart);
                jobTargets.set(pathPart, {
                    isSignificant: true, // Trending is always significant
                    isNew: existing?.isNew || isNew,
                    title: txt
                });
            }
        }
    });

    trendingLinks.sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0));

    if (trendingLinks.length === 0 && categories.length > 0) {
        for (const cat of categories) {
           if (cat.links) {
              trendingLinks.push(...cat.links.slice(0, 2).map((l: any) => ({ ...l, isNew: true })));
           }
           if (trendingLinks.length >= 6) break;
        }
    }

    if (categories.length === 0 && trendingLinks.length === 0) {
        console.warn("No categories or trends found during scrape. Layout change?");
        return;
    }

    const homeData = {
        success: true,
        isHome: true,
        title: "Sarkari Naukri - Latest Jobs, Admit Cards, Results",
        data: categories,
        trending: trendingLinks,
        updatedAt: new Date().toISOString()
    };

    serverCache.set('home_data_index', homeData);

    try {
        await setDoc(doc(db, 'home_data', 'index'), homeData);
        console.log("Home data updated in Firestore.");
    } catch (e: any) {
        console.error("Failed to save home data to Firestore: " + e.message);
    }

    // Now uniquely scrape the job posts discovered
    const pathsToProcess = Array.from(jobTargets.entries());
    console.log(`Discovered ${pathsToProcess.length} unique job links from homepage. Checking for updates...`);

    // Process in batches
    const chunkSize = 20;
    for (let i = 0; i < pathsToProcess.length; i += chunkSize) {
       const chunk = pathsToProcess.slice(i, i + chunkSize);
       
       await Promise.all(chunk.map(async ([path, info]) => {
          const jobId = encodeURIComponent(path).replace(/\./g, '%2E');
          
          let jobData: any = null;
          let jobExists = false;
          try {
              const jobSnapshot = await getDoc(doc(db, 'jobs', jobId));
              if (jobSnapshot.exists()) {
                  jobExists = true;
                  jobData = jobSnapshot.data();
              }
          } catch(e) {
              console.error(`[ERROR] Failed to fetch job ${jobId} during scrape:`, e);
          }
          
          if (!jobExists) {
              console.log(`[NEW] Detected new job: ${path}. Scraping...`);
              newJobsFound++;
              totalRequests++;
              await scrapeJobPost(db, path, true);
              await delay(1500); // 1.5 sec delay to avoid rate limits
           } else {
              // Priority & Throttling System with strict 24 hours skip limit
              let hoursSinceCheck = 999999;
              const lastCheckedStr = jobData?.lastCheckedAt || jobData?.lastChecked;
              if (lastCheckedStr) {
                  const lastCheckedMillis = new Date(lastCheckedStr).getTime();
                  hoursSinceCheck = (new Date().getTime() - lastCheckedMillis) / (1000 * 60 * 60);
              }

              if (hoursSinceCheck < 24) {
                  console.log(`[SKIP] ${path} - checked ${hoursSinceCheck.toFixed(1)} hours ago`);
                  existingJobsSkipped++;
                  return; // Skip re-checking until 24 hours passed
              }

              console.log(`[CHECK] Re-checking existing job: ${path}`);
              pagesRechecked++;
              totalRequests++;
              await scrapeJobPost(db, path, false, jobData.content);
              await delay(2000); // 2 second delay between requests
           }
       }));
    }

    // 3. Scrape main category pages
    console.log("Scraping main category pages...");
    const categoryTargets = [
      { id: 'latest-job', path: '/latest-job/', title: 'Latest Jobs' },
      { id: 'result', path: '/result/', title: 'Results' },
      { id: 'admit-card', path: '/admit-card/', title: 'Admit Cards' },
      { id: 'answer-key', path: '/answer-key/', title: 'Answer Keys' },
      { id: 'syllabus', path: '/syllabus/', title: 'Syllabus' },
      { id: 'admission', path: '/admission/', title: 'Admissions' }
    ];

    for (const cat of categoryTargets) {
        try {
            const targetUrl = `${targetUrlBase}${cat.path}`;
            totalRequests++;
            const response = await fetch(targetUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
            });
            if (!response.ok) continue;
            
            const html = await response.text();
            const $ = cheerio.load(html);
            const matchingLinks: any[] = [];
            
            $(".gb-query-loop-item .gb-headline a").each((i, el) => {
                const title = $(el).text().trim();
                let url = $(el).attr("href") || '';
                if (title.length < 5 || /[\u0900-\u097F]/.test(title)) return;
                if (title.toLowerCase() === 'sarkari result' || title.toLowerCase() === 'sarkari results') return;
                
                try {
                  const uObj = new URL(url, targetUrlBase);
                  if (uObj.hostname.includes('sarkariresult')) {
                    url = uObj.pathname + uObj.search;
                  } else {
                    url = uObj.toString();
                  }
                } catch(e) {}
                
                const lowerTxt = title.toLowerCase();
                let isNew = false;
                if (i < 3 || lowerTxt.includes('extend') || lowerTxt.includes('start') || lowerTxt.includes('out') || lowerTxt.includes('now') || lowerTxt.includes('postpone') || lowerTxt.includes('vacancy details')) {
                    isNew = true;
                }

                matchingLinks.push({
                    id: encodeURIComponent(url),
                    title: title,
                    url: `/?path=${encodeURIComponent(url)}`,
                    isNew: isNew
                });
            });

            if (matchingLinks.length === 0) {
                $("#content ul li a, .entry-content ul li a").each((i, el) => {
                    const title = $(el).text().trim();
                    let url = $(el).attr("href") || '';
                    if (title.length < 5 || /[\u0900-\u097F]/.test(title)) return;
                    if (title.toLowerCase() === 'sarkari result' || title.toLowerCase() === 'sarkari results') return;

                    try {
                      const uObj = new URL(url, targetUrlBase);
                      if (uObj.hostname.includes('sarkariresult')) {
                        let pathPart = uObj.pathname + uObj.search;
                        
                        const lowerTxt = title.toLowerCase();
                        let isNew = false;
                        if (i < 5 || lowerTxt.includes('extend') || lowerTxt.includes('start') || lowerTxt.includes('out') || lowerTxt.includes('now') || lowerTxt.includes('postpone') || lowerTxt.includes('vacancy details')) {
                            isNew = true;
                        }

                        matchingLinks.push({
                            id: encodeURIComponent(pathPart),
                            title: title,
                            url: `/?path=${encodeURIComponent(pathPart)}`,
                            isNew: isNew
                        });
                      }
                    } catch(e) {}
                });
            }

            matchingLinks.sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0));

            // Merge any links from the homepage version of this category so they are never missing
            const homeCat = categories.find(c => c.title.toLowerCase().replace(/s/g, '').includes(cat.title.toLowerCase().replace(/s/g, '')) || cat.title.toLowerCase().replace(/s/g, '').includes(c.title.toLowerCase().replace(/s/g, '')));
            if (homeCat && homeCat.links) {
                // Prepend so they appear at top
                for (let j = homeCat.links.length - 1; j >= 0; j--) {
                    const hl = homeCat.links[j];
                    if (!matchingLinks.some(ml => ml.url === hl.url)) {
                        matchingLinks.unshift(hl);
                    }
                }
            }

            const catDoc = {
                id: cat.id,
                title: cat.title,
                links: matchingLinks,
                updatedAt: new Date().toISOString()
            };

            serverCache.set(`category_pages_${cat.id}`, catDoc);

            await setDoc(doc(db, 'category_pages', cat.id), catDoc);
            console.log(`Updated category: ${cat.title}`);
            await delay(1000);

        } catch (err: any) {
            console.error(`Failed to scrape category ${cat.id}: ${err.message}`);
        }
    }

    console.log(`Background scrape completed successfully.`);
    console.log(`[SCRAPER STATS] Cycle Completed:
    - Total Requests: ${totalRequests}
    - New Jobs Discovered & Scraped: ${newJobsFound}
    - Existing Jobs Skipped (< 24h ago): ${existingJobsSkipped}
    - Existing Jobs Checked (Rechecked): ${pagesRechecked}`);

  } catch (error: any) {
    // Log the error, keep existing data intact, don't crash
    console.error(`Cron Scrape Error: ${error.message}`);
  }
}

export function startCronScheduler(db: any) {

  // Server start hote hi scrape chalao
  runScraper(db);

  // Fir har 3 ghante baad
  cron.schedule("0 */3 * * *", () => {
    runScraper(db);
  });
}
