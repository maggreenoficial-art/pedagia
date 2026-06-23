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

const LOGO_ICON = '<img src="/branding/professor-flux-logo.svg" alt="" width="46" height="46" />';
const LOGO_AUTH = '<img src="/branding/professor-flux-logo.svg" alt="Professor Flux" width="200" height="auto" />';
const LOGO_PF = '<img src="/branding/professor-flux-logo.svg" alt="" width="52" height="52" />';

const OWL_SVG = /<svg viewBox="0 0 24 24" fill="none">[\s\S]*?<\/svg>/g;

let html = loadMarkup();

// Auth logo
html = html.replace(
  /<div class="auth-logo">\s*<svg[\s\S]*?<\/svg>\s*<\/div>/,
  `<div class="auth-logo auth-logo-img">${LOGO_AUTH}</div>`,
);

// Auth brand + tagline
html = html.replace(
  /<div class="auth-brand">Pedag<span style="color:var\(--Y\)">IA<\/span><\/div>\s*<div class="auth-sub">Gerador de provas com IA para professores<\/div>/,
  `<div class="auth-brand"><span class="brand-pro">Professor</span> <span class="brand-flux">Flux</span></div>
    <div class="auth-tagline">O construtor de conhecimento com IA</div>
    <div class="auth-sub">Provas, atividades e materiais visuais para professores</div>`,
);

// Top bar logo + brand
html = html.replace(
  /<div class="logo">\s*<svg[\s\S]*?<\/svg>\s*<\/div>\s*<div class="brand">Pedag<span>IA<\/span><\/div>/,
  `<div class="logo">${LOGO_ICON}</div>
  <div class="brand"><span class="brand-pro">Professor</span> <span class="brand-flux">Flux</span></div>`,
);

// Montar hero
html = html.replace(
  /<span class="pf-logo" aria-hidden="true">⚡<\/span>\s*<div>\s*<p class="pf-hero-kicker">PedagIA<\/p>\s*<h1 class="pf-hero-title">ProfessorFlux<\/h1>\s*<\/div>/,
  `<span class="pf-logo pf-logo-img" aria-hidden="true">${LOGO_PF}</span>
          <div>
            <p class="pf-hero-kicker">Construtor com IA</p>
            <h1 class="pf-hero-title">Professor Flux</h1>
          </div>`,
);

saveMarkup(html);
console.log('Markup: marca Professor Flux aplicada.');
