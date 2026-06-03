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

if (!html.includes('id="np-midias"')) {
  html = html.replace(
    /<button class="np" id="np-material" onclick="goTo\('material'\)">📚 Material<\/button>/,
    `<button class="np" id="np-material" onclick="goTo('material')">📚 Material</button>
    <button class="np" id="np-midias" onclick="goTo('midias')">🖼 Minhas mídias</button>`,
  );
}

if (!html.includes('id="view-midias"')) {
  const midiasView = `<!-- ════════ MINHAS MÍDIAS ════════ -->
<div id="view-midias" style="display:none">
  <div class="card">
    <div class="card-body">
      <div class="sl">🖼 Minhas mídias</div>
      <p style="font-size:12px;color:var(--t2);margin:8px 0 14px;line-height:1.5">
        Figuras salvas na nuvem (Supabase). Adicione imagens do computador, nomeie, sugira questões ou apague.
      </p>
      <div class="midias-toolbar">
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
      </div>
      <div id="midias-grid" class="cloud-images-grid midias-grid">
        <div class="img-no-img" style="grid-column:1/-1">Carregando...</div>
      </div>
    </div>
  </div>
</div><!-- /view-midias -->
`;

  html = html.replace(
    '<!-- ════════ LOADING ════════ -->',
    midiasView + '\n\n<!-- ════════ LOADING ════════ -->',
  );
}

if (html.includes('id="cloud-images-section"')) {
  html = html.replace(
    /<div id="cloud-images-section"[\s\S]*?<\/div>\s*\n\s*<div id="img-review-panel"/,
    `<p class="img-builder-hint" style="margin-top:16px">
        Imagens na nuvem: abra <button type="button" class="chip" style="display:inline;padding:4px 10px" onclick="goTo('midias')">🖼 Minhas mídias</button>
      </p>
      <div id="img-review-panel"`,
  );
}

saveMarkup(html);
console.log('patched', {
  midias: html.includes('view-midias'),
  nav: html.includes('np-midias'),
});
