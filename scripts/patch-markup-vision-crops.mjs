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

if (!html.includes('bd-btn-gen-all-media')) {
  html = html.replace(
    '<p class="bd-hint">Gere um exercício com IA para cada figura e <b>aprove ou rejeite</b> antes de incluir na prova (⑥).</p>\n      <div id="bd-midias-grid"',
    '<p class="bd-hint">Recorte figuras no passo ② ou use mídias da nuvem. Gere exercícios com IA e <b>aprove ou rejeite</b> — rejeitadas geram nova sugestão automaticamente.</p>\n      <button type="button" class="btn-ir" id="bd-btn-gen-all-media" style="width:100%;margin-bottom:12px" onclick="builderGenerateAllMediaExercises()">✦ Gerar exercícios de todas as figuras</button>\n      <div id="bd-midias-grid"',
  );
}

if (!html.includes('bd-btn-gen-all-crops')) {
  html = html.replace(
    '<div id="bd-img-gallery" class="img-gallery" style="margin-top:8px"></div>\n      </div>\n      <details class="bd-details"',
    '<div id="bd-img-gallery" class="img-gallery" style="margin-top:8px"></div>\n        <button type="button" class="btn-ir" id="bd-btn-gen-all-crops" style="width:100%;margin-top:10px" onclick="builderGenerateAllMediaExercises()">✦ Gerar exercícios de todas as figuras recortadas</button>\n      </div>\n      <details class="bd-details"',
  );
}

saveMarkup(html);
console.log('Markup: OCR hint + gerar todos exercícios aplicado.');
