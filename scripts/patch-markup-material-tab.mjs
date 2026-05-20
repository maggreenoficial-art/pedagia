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

const livroMatch = html.match(
  /<div class="fpanel show" id="fp-livro">([\s\S]*?)<\/motion>\s*\n\s*<!-- DESCRIÇÃO -->/,
);
const livroMatch2 = livroMatch || html.match(
  /<div class="fpanel show" id="fp-livro">([\s\S]*?)<\/div>\s*\n\s*<!-- DESCRIÇÃO -->/,
);
if (!livroMatch2) throw new Error('fp-livro não encontrado');
const livroInner = livroMatch2[1];
const livroFull = livroMatch2[0];

if (!html.includes('id="view-material"')) {
  html = html.replace(
    /<button class="np on" id="np-form" onclick="goTo\('form'\)">Nova prova<\/button>/,
    `<button class="np on" id="np-form" onclick="goTo('form')">Nova prova</button>
    <button class="np" id="np-material" onclick="goTo('material')">📚 Material</button>`,
  );

  html = html.replace(
    livroFull,
    `<div class="fpanel show" id="fp-livro">
        <div class="ibox" style="margin:0">
          <p>O upload e a extração de imagens ficam na aba <b>Material</b>.</p>
          <button type="button" class="btn-ir" style="width:100%;margin-top:10px" onclick="goTo('material')">Abrir Material →</button>
        </div>
      </div>

      <!-- DESCRIÇÃO -->`,
  );

  const materialView = `<!-- ════════ MATERIAL (LIVRO) ════════ -->
<div id="view-material" style="display:none">
  <div class="card">
    <div class="card-body">
      <div class="sl">📚 Livro / Apostila</div>
      <p style="font-size:12px;color:var(--t2);margin:8px 0 14px;line-height:1.5">
        Envie o PDF, escolha o capítulo e extraia imagens com <b>fonte</b> para usar nas provas.
        Cada imagem é salva na nuvem para aparecer no Word (.docx).
      </p>
      <motion class="fpanel show" id="fp-livro">${livroInner}</div>
      <div id="img-review-panel" class="img-review-panel" style="display:none"></div>
    </div>
  </div>
</div><!-- /view-material -->
`.replace('<motion class="fpanel show" id="fp-livro">', '<div class="fpanel show" id="fp-livro">');

  html = html.replace(
    '<!-- ════════ LOADING ════════ -->',
    materialView + '\n\n<!-- ════════ LOADING ════════ -->',
  );
}

if (!html.includes('id="img-name-modal"')) {
  const modal = `<div id="img-name-modal" class="img-modal" style="display:none">
  <div class="img-modal-back" onclick="closeImageNameModal()"></div>
  <div class="img-modal-box">
    <div class="sl" style="margin-bottom:8px">Nomear imagem</div>
    <img id="img-modal-preview" alt="" style="width:100%;max-height:180px;object-fit:contain;border-radius:var(--rsm);background:var(--s2);margin-bottom:12px">
    <div class="field" style="margin-bottom:10px">
      <label class="fl">Nome (para identificar na prova)</label>
      <input type="text" id="img-modal-title" placeholder="Ex: Gráfico — desmatamento Amazônia">
    </div>
    <div class="field" style="margin-bottom:10px">
      <label class="fl">Fonte (como no livro — não invente)</label>
      <textarea id="img-modal-source" rows="3" placeholder="Fonte: IBGE, 2022. Adaptado."></textarea>
    </div>
    <p id="img-modal-desc" style="font-size:11px;color:var(--t3);margin-bottom:12px;line-height:1.4"></p>
    <div style="display:flex;gap:8px">
      <button type="button" class="btn-ir" style="flex:1" onclick="confirmImageCatalogEntry()">Salvar na nuvem</button>
      <button type="button" class="btn-ir" style="background:var(--s3);color:var(--t2)" onclick="closeImageNameModal()">Depois</button>
    </div>
  </div>
</div>`;
  html = html.replace('<div id="toast"', modal + '\n<div id="toast"');
}

saveMarkup(html);
console.log('patched', {
  material: html.includes('view-material'),
  modal: html.includes('img-name-modal'),
});
