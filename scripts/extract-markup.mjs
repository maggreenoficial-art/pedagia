import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
let body = bodyMatch[1];
// remove script tags
body = body.replace(/<script[\s\S]*?<\/script>/gi, '');
// remove toast duplicate if any
fs.mkdirSync(path.join(root, 'src/components/legacy'), { recursive: true });
const out = `/* AUTO: markup do PedagIA — importado do index.html */\nexport const LEGACY_MARKUP = ${JSON.stringify(body)};\n`;
fs.writeFileSync(path.join(root, 'src/components/legacy/markup.ts'), out);
console.log('markup bytes', body.length);
