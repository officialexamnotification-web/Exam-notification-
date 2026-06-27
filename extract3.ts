import { readFileSync, writeFileSync } from 'fs';
const html = readFileSync('jobs24.html', 'utf8');
const blocks = html.match(/<div class="gb-container[^>]*>[\s\S]*?<\/div>/g);
if (blocks && blocks.length) {
    writeFileSync('blocks.html', blocks.slice(0, 5).join('\n'));
} else {
    writeFileSync('blocks.html', html.substring(0, 10000));
}
