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

const cropBlock = `<div id="bd-crop-section" class="bd-crop-section" style="display:none;margin-top:14px">
        <p class="bd-hint" style="margin-top:0">Recorte mapas, gráficos e fotos das páginas selecionadas (inclua título e fonte na área).</p>
        <p id="bd-crop-status" class="bd-hint">—</p>
        <button type="button" class="btn-ir" style="width:100%;margin-bottom:10px" onclick="builderLoadCropPages()">✂ Carregar páginas para recorte</button>
        <div id="bd-img-page-grid" class="img-page-grid"></div>
        <p class="bd-hint" style="margin-top:12px;font-weight:800;color:var(--t1)">Figuras recortadas <span id="bd-crop-count"></span></p>
        <div id="bd-img-gallery" class="img-gallery" style="margin-top:8px"></div>
      </div>`;

if (!html.includes('id="bd-crop-section"')) {
  const anchor = '<p id="bd-page-count" class="bd-hint">0 páginas</p>';
  if (!html.includes(anchor)) {
    throw new Error('Âncora bd-page-count não encontrada');
  }
  html = html.replace(anchor, `${anchor}\n      ${cropBlock}`);
}

if (!html.includes('revise cada uma')) {
  html = html.replace(
    'Marque as questões que entram na prova ou atividade.',
    'Gere questões e revise cada uma (aprovar ou rejeitar) antes de montar.',
  );
}

saveMarkup(html);
console.log('Markup: recorte no Montar (②) aplicado.');
