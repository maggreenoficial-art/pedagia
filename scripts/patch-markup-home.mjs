import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const markupPath = path.join(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  'src/components/legacy/markup.ts',
);

function loadMarkup() {
  const src = fs.readFileSync(markupPath, 'utf8');
  const prefix = 'export const LEGACY_MARKUP = ';
  const start = src.indexOf(prefix) + prefix.length;
  const end = src.lastIndexOf(';\n');
  return JSON.parse(src.slice(start, end));
}

function saveMarkup(html) {
  fs.writeFileSync(
    markupPath,
    `/* AUTO: markup do PedagIA / Professor Flux */\nexport const LEGACY_MARKUP = ${JSON.stringify(html)};\n`,
  );
}

const LOGO_PNG = '/branding/professor-flux-logo.png';
const LOGO_FALLBACK = '/branding/professor-flux-logo.svg';

function logoImg(w, h, alt = 'Professor Flux') {
  return `<img src="${LOGO_PNG}" alt="${alt}" width="${w}" height="${h}" onerror="this.onerror=null;this.src='${LOGO_FALLBACK}'" />`;
}

let html = loadMarkup();

if (!html.includes('view-home')) {
  html = html.replace(
    '<div class="wrap" id="main-wrap" style="display:none">',
    `<div class="wrap" id="main-wrap" style="display:none">\n<div id="view-home" style="display:none"></div>`,
  );
}

if (!html.includes('np-home')) {
  html = html.replace(
    '<div class="navpills">',
    `<div class="navpills">\n    <button class="np on" id="np-home" onclick="goTo('home')">🏠 Início</button>`,
  );
  html = html.replace('class="np on" id="np-builder"', 'class="np" id="np-builder"');
}

if (!html.includes('data-view="home"')) {
  html = html.replace(
    '<nav class="bottom-nav" id="bottom-nav"',
    `<nav class="bottom-nav" id="bottom-nav"`,
  );
  html = html.replace(
    '<button type="button" class="bn-item on" data-view="builder"',
    `<button type="button" class="bn-item on" data-view="home" onclick="goTo('home')"><span class="bn-icon" aria-hidden="true">🏠</span><span class="bn-label">Início</span></button>\n  <button type="button" class="bn-item" data-view="builder"`,
  );
}

html = html.replace(/\/branding\/professor-flux-logo\.svg/g, LOGO_PNG);
html = html.replace(
  /<div class="auth-logo auth-logo-img">[\s\S]*?<\/div>/,
  `<div class="auth-logo auth-logo-img">${logoImg(200, 'auto')}</div>`,
);
html = html.replace(
  /<div class="logo">[\s\S]*?<\/div>/,
  `<div class="logo">${logoImg(46, 46, '')}</div>`,
);

saveMarkup(html);
console.log('Markup: view-home + navegação Início aplicados.');
