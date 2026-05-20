import fs from 'fs';
import path from 'path';

import { fileURLToPath } from 'url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
const start = html.indexOf('<script>', html.indexOf('pedagia-cloud'));
const end = html.lastIndexOf('</script>');
let js = html.slice(start + 8, end);
js = js.replace(
  "document.addEventListener('DOMContentLoaded', init);",
  'export function bootPedagiaLegacy() { init(); }',
);

fs.mkdirSync(path.join(root, 'src/styles'), { recursive: true });
fs.mkdirSync(path.join(root, 'src/lib/legacy'), { recursive: true });
fs.mkdirSync(path.join(root, 'legacy'), { recursive: true });
fs.writeFileSync(path.join(root, 'src/styles/globals.css'), css);
fs.writeFileSync(path.join(root, 'src/lib/legacy/runtime.js'), js);
fs.copyFileSync(path.join(root, 'public/index.html'), path.join(root, 'legacy/index.html.bak'));
console.log('Extracted', js.length, 'bytes JS');
