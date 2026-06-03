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

const panel = `
      <div id="cloud-images-section" class="cloud-images-section" style="margin-top:22px;padding-top:18px;border-top:1px solid var(--line)">
        <div class="img-sec-lbl" style="flex-wrap:wrap">
          ☁️ Imagens salvas na nuvem
          <span id="cloud-images-status" style="font-size:11px">—</span>
          <button type="button" class="chip" style="margin-left:auto;font-size:11px;padding:6px 12px" onclick="refreshCloudImagesDashboard()">↻ Atualizar</button>
        </div>
        <p class="img-builder-hint" style="margin-top:0">
          Pasta <b>pedagia → seu usuário → images</b> no Supabase Storage. Clique para usar na prova ou nomear.
        </p>
        <div id="cloud-images-grid" class="cloud-images-grid">
          <div class="img-no-img" style="grid-column:1/-1">Faça login para ver as imagens da nuvem.</div>
        </div>
      </div>`;

if (!html.includes('id="cloud-images-section"')) {
  if (!html.includes('id="view-material"')) {
    throw new Error('view-material não encontrado — rode patch-markup-material-tab.mjs antes');
  }
  html = html.replace(
    '<div id="img-review-panel"',
    panel + '\n      <div id="img-review-panel"',
  );
}

saveMarkup(html);
console.log('patched cloud-images-section:', html.includes('cloud-images-section'));
