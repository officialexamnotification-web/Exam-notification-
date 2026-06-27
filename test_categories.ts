import * as cheerio from "cheerio";
async function run() {
  const getCount = async (path: string) => {
     const html = await fetch('https://sarkariresult.com.cm' + path).then(r=>r.text());
     const $ = cheerio.load(html);
     return $("#content ul li a, .entry-content ul li a").length;
  };
  
  console.log('syllabus:', await getCount('/syllabus/'));
  console.log('category/syllabus:', await getCount('/category/syllabus/'));
  console.log('admission:', await getCount('/admission/'));
  console.log('category/admission:', await getCount('/category/admission/'));
}
run();
