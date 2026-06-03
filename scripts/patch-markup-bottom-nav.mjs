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
    `/* AUTO: markup do PedagIA */\nexport const LEGACY_MARKUP = ${JSON.stringify(html)};\n`,
  );
}

let html = loadMarkup();

const bottomNav = `
<nav class="bottom-nav" id="bottom-nav" style="display:none" aria-label="Navegação principal">
  <button type="button" class="bn-item on" data-view="form" onclick="goTo('form')"><span class="bn-icon" aria-hidden="true">✦</span><span class="bn-label">Prova</span></button>
  <button type="button" class="bn-item" data-view="material" onclick="goTo('material')"><span class="bn-icon" aria-hidden="true">📚</span><span class="bn-label">Material</span></button>
  <button type="button" class="bn-item" data-view="midias" onclick="goTo('midias')"><span class="bn-icon" aria-hidden="true">🖼</span><span class="bn-label">Mídias</span></button>
  <button type="button" class="bn-item" data-view="inteligente" onclick="goTo('inteligente')"><span class="bn-icon" aria-hidden="true">⚡</span><span class="bn-label">IA</span></button>
  <button type="button" class="bn-item" data-view="history" onclick="goTo('history')"><span class="bn-icon" aria-hidden="true">📋</span><span class="bn-label">Salvas</span></button>
</nav>`;

if (!html.includes('id="bottom-nav"')) {
  html = html.replace(
    '<div class="toast" id="toast"></div>',
    `<div class="toast" id="toast"></div>${bottomNav}`,
  );
}

saveMarkup(html);
console.log('bottom-nav', html.includes('bottom-nav'));
