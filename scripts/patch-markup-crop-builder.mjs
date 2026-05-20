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

const oldBlock =
  '<div id="img-section" style="display:none;margin-top:18px">\n              <div class="img-sec-lbl">\n                🖼 Imagens detectadas\n                <span id="img-status">Extraindo imagens...</span>\n              </div>\n              <div id="img-review-panel"';

const newBlock =
  '<div id="img-section" style="display:none;margin-top:18px">\n              <div class="img-sec-lbl">\n                ✂ Builder de figuras\n                <span id="img-status">Selecione o capítulo</span>\n              </div>\n              <p id="img-builder-hint" class="img-builder-hint" style="font-size:12px;color:var(--t2);line-height:1.5;margin:0 0 12px">Abra cada página e <b>recorte</b> mapas, gráficos e tabelas (inclua título e Fonte). Depois use <b>Sugerir questão</b> — a IA só monta o enunciado sobre a figura que você escolheu.</p>\n              <div id="img-page-grid" class="img-page-grid"></div>\n              <div class="img-sec-lbl" style="margin-top:14px">Figuras recortadas <span id="img-crop-count" style="font-size:11px;color:var(--t3)"></span></div>\n              <div id="img-review-panel"';

if (!html.includes('id="img-page-grid"')) {
  if (!html.includes('img-section')) {
    throw new Error('Bloco img-section não encontrado para patch');
  }
  html = html.replace(oldBlock, newBlock);
}

html = html.replace(
  'Envie o PDF, escolha o capítulo e extraia imagens com <b>fonte</b> para usar nas provas.',
  'Envie o PDF, escolha o capítulo e <b>recorte manualmente</b> as figuras no builder. A IA só sugere questões sobre o que você recortou.',
);

saveMarkup(html);
console.log('markup.ts atualizado (crop builder)');
