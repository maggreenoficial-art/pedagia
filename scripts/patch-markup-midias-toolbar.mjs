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

const newToolbar = `<div class="midias-toolbar">
        <label class="btn-ir midias-upload-btn" style="cursor:pointer;margin:0">
          + Adicionar imagem
          <input type="file" id="midias-file-input" accept="image/jpeg,image/png,image/webp" multiple hidden onchange="handleMidiasUpload(this)">
        </label>
        <button type="button" class="chip" onclick="refreshMidiasPage()">↻ Atualizar</button>
        <button type="button" class="chip" id="midias-select-all" onclick="selectAllMidiasVisible()">☑ Selecionar tudo</button>
        <button type="button" class="chip" onclick="clearMidiasSelection()">Limpar seleção</button>
        <button type="button" class="chip midias-del-chip" id="midias-delete-selected" style="display:none" onclick="deleteSelectedMidias()">🗑 Apagar selecionadas</button>
        <span id="midias-sel-count" class="midias-sel-count"></span>
        <span id="midias-status" class="midias-status">—</span>
      </div>
      <div class="midias-filter-row">
        <input type="search" id="midias-search" class="midias-search" placeholder="Buscar por nome, arquivo ou fonte…" oninput="filterMidiasByName(this.value)" autocomplete="off">
      </div>`;

if (html.includes('id="midias-toolbar"') || html.includes('class="midias-toolbar"')) {
  html = html.replace(/<div class="midias-toolbar">[\s\S]*?<\/div>\s*<div id="midias-grid"/, `${newToolbar}
      <div id="midias-grid"`);
} else if (html.includes('id="midias-grid"')) {
  html = html.replace(
    /<div id="midias-grid"/,
    `${newToolbar}
      <div id="midias-grid"`,
  );
}

saveMarkup(html);
console.log('toolbar', html.includes('midias-search'), html.includes('midias-select-all'));
