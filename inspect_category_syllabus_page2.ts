async function test() {
  const url = 'https://sarkariresult.com.cm/category/syllabus/page/2/';
  console.log(`Checking category page 2: ${url}`);
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    }
  });
  console.log(`Status code: ${res.status}`);
}

test();
