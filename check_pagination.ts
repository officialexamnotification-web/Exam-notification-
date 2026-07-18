async function test() {
  const pagesToCheck = [
    'https://sarkariresult.com.cm/syllabus/page/2/',
    'https://sarkariresult.com.cm/syllabus/page/3/',
    'https://sarkariresult.com.cm/syllabus/page/4/'
  ];
  
  for (const page of pagesToCheck) {
    console.log(`Checking page: ${page}`);
    const res = await fetch(page, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });
    console.log(`Status for ${page}: ${res.status}`);
    if (res.ok) {
       const text = await res.text();
       // Count links
       const count = (text.match(/href="https:\/\/sarkariresult\.com\.cm\/[^"\/]+\//g) || []).length;
       console.log(`Found around ${count} links on ${page}`);
    }
  }
}

test();
