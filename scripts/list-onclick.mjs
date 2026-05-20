import fs from 'fs';
const s = fs.readFileSync('src/components/legacy/markup.ts', 'utf8');
const start = s.indexOf('export const LEGACY_MARKUP = ') + 'export const LEGACY_MARKUP = '.length;
const body = s.slice(start);
const end = body.lastIndexOf('";');
const parsed = JSON.parse(body.slice(0, end + 1));
const names = new Set();
for (const m of parsed.matchAll(/on(?:click|change)="([^"]+)"/g)) {
  const fn = m[1].replace(/\(.*/, '').trim();
  if (fn && !fn.includes('document') && !fn.includes('this') && !fn.includes('event.')) names.add(fn);
}
console.log([...names].sort().join('\n'));
