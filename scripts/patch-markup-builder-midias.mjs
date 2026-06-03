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

html = html.replace(
  '<p class="bd-hint">Opcional — figuras na nuvem com questão.</p>\n      <div id="bd-midias-grid" class="bd-pick-grid">',
  '<p class="bd-hint">Gere um exercício com IA para cada figura e <b>aprove ou rejeite</b> antes de incluir na prova (⑥).</p>\n      <div id="bd-midias-grid" class="bd-midias-list">',
);

html = html.replace(
  'Nenhum exercício salvo. Gere em Mídias com &quot;Sugerir questão&quot;.',
  'Nenhum exercício salvo. Aprove exercícios gerados em ④ Mídias.',
);

saveMarkup(html);
console.log('Markup: Mídias com gerar/aprovar aplicado.');
