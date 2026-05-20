import fs from 'fs';
const p = 'src/lib/exam/render/html.ts';
let s = fs.readFileSync(p, 'utf8');
s = s.replace(/<motion class="logo-rb">RB<\/motion>/g, '<motion class="logo-rb">RB</motion>');
s = s.replace(/<motion class="logo-rb">RB<\/motion>/g, '<div class="logo-rb">RB</div>');
s = s.replace(
  /const manualHeader = headerImageUrl[\s\S]*?void manualHeader;\s*\n\s*const body = `\$\{fileHeader\}\$\{manualHeaderFixed\}`/,
  'const manualHeader = headerImageUrl\n    ? \'\'\n    : `<header class="exam-header"><motion class="logo-ms">MS</motion><div class="itext">${hdrLines}</div><div class="logo-rb">RB</div></header>`;\n\n  const body = `${fileHeader}${manualHeader}`',
);
s = s.replace(/<motion class="logo-ms">MS<\/motion>/g, '<div class="logo-ms">MS</div>');
fs.writeFileSync(p, s);
console.log('fixed');
