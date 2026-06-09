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

// Remove a pill "Nova prova" do topo (fluxo antigo unificado no Montar)
html = html.replace(
  `<button class="np" id="np-form" onclick="goTo('form')">Nova prova</button>\n    `,
  '',
);

// Remove o item "Prova" do bottom-nav
html = html.replace(
  `<button type="button" class="bn-item" data-view="form" onclick="goTo('form')"><span class="bn-icon" aria-hidden="true">✦</span><span class="bn-label">Prova</span></button>\n  `,
  '',
);

if (html.includes('id="np-form"') || html.includes('data-view="form"')) {
  console.warn('Aviso: alguma referência de navegação ao form antigo permanece.');
}

saveMarkup(html);
console.log('Markup: navegação unificada (Nova prova removida).');
