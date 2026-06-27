import { readFileSync } from 'fs';
const html = readFileSync('jobs24.html', 'utf8');
const titles = html.match(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi);
console.log(titles);
