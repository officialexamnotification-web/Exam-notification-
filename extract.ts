import { readFileSync } from 'fs';
const html = readFileSync('jobs24.html', 'utf8');
const colors = html.match(/#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}/g) || [];
const counts: Record<string, number> = {};
colors.forEach(c => { counts[c.toLowerCase()] = (counts[c.toLowerCase()] || 0) + 1; });
const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
console.log(sorted.slice(0, 30));
