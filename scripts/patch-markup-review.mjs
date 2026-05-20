import fs from 'fs';
const p = 'src/components/legacy/markup.ts';
let s = fs.readFileSync(p, 'utf8');
const needle = 'id=\\"img-gallery\\"';
if (!s.includes('img-review-panel')) {
  s = s.replace(
    needle,
    'id=\\"img-review-panel\\" class=\\"img-review-panel\\" style=\\"display:none;margin-top:12px;padding:12px;background:var(--s2);border-radius:var(--rsm);border:1px solid var(--line)\\"></motion><div ' +
      needle,
  );
  s = s.replace(
    '<motion><motion ',
    '<div ',
  );
  s = s.replace('</motion><motion ', '</motion><div ');
  s = s.replace(
    'class=\\"img-review-panel\\" style=\\"display:none;margin-top:12px;padding:12px;background:var(--s2);border-radius:var(--rsm);border:1px solid var(--line)\\"></motion>',
    'class=\\"img-review-panel\\" style=\\"display:none;margin-top:12px;padding:12px;background:var(--s2);border-radius:var(--rsm);border:1px solid var(--line)\\"></div>',
  );
}
fs.writeFileSync(p, s);
console.log('patched', s.includes('img-review-panel'));
