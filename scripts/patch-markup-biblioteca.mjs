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

if (!html.includes('id="material-library-list"')) {
  html = html.replace(
    '<div class="sl">📚 Livro / Apostila</div>',
    `<div class="sl">📚 Biblioteca de livros</div>
      <p style="font-size:12px;color:var(--t2);margin:8px 0 10px;line-height:1.5">
        Seus PDFs ficam salvos aqui (lista na nuvem). Em <b>Montar</b> você escolhe o material e as páginas. Use esta tela para enviar ou apagar livros.
      </p>
      <div class="mat-lib-toolbar">
        <button type="button" class="btn-ir" onclick="materialLibraryAddNew()">+ Adicionar PDF</button>
        <button type="button" class="chip" onclick="fetchMaterialsList().then(() => renderMaterialLibrary())">↻ Atualizar</button>
      </div>
      <div id="material-library-list" class="mat-lib-list"></div>
      <details class="mat-lib-details" id="mat-lib-editor" style="margin-top:16px">
        <summary id="mat-lib-editor-summary">Recortes e capítulos (opcional)</summary>
      <div class="sl" style="margin-top:14px;font-size:13px">Detalhes do material selecionado</div>`,
  );
}

html = html.replace(
  'Toque para enviar o PDF (fica salvo no builder)',
  'Toque para enviar o PDF (entra na biblioteca)',
);

html = html.replace(
  /<div id="livro-builder-hint"[^>]*>[^<]*<\/div>/,
  '<div id="livro-builder-hint" class="uzone-s" style="display:none;color:var(--G);font-weight:700">✓ Na biblioteca — use em Montar</div>',
);

html = html.replace(
  'onclick="event.stopPropagation();clearBuilderData()"',
  'onclick="event.stopPropagation();deleteMaterialFromLibrary()"',
);

html = html.replace(
  '>✕ Limpar builder<',
  '>🗑 Apagar da biblioteca<',
);

if (!html.includes('</details>') && html.includes('mat-lib-details')) {
  html = html.replace(
    '</div><!-- /view-material -->',
    '      </details>\n</div><!-- /view-material -->',
  );
}

saveMarkup(html);
console.log('library', html.includes('material-library-list'));
