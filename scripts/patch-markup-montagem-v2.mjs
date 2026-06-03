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

const bnccCollapsed = `<details class="bncc-details" id="bncc-details-panel">
        <summary class="bncc-details-sum">📘 Base BNCC (toque para editar)</summary>
        <div class="bncc-prefs">
          <div class="field">
            <label class="fl" for="f-bncc-hab">Habilidades / competências</label>
            <textarea id="f-bncc-hab" rows="2" placeholder="Ex.: EF69GE01 — ou descreva em texto" oninput="onBnccPrefsChange()"></textarea>
          </div>
          <div class="field">
            <label class="fl" for="f-bncc-foco">Foco avaliativo</label>
            <input type="text" id="f-bncc-foco" value="compreensão, aplicação e análise" oninput="onBnccPrefsChange()">
          </div>
          <div class="field">
            <label class="fl" for="f-bncc-orient">Orientações para a IA</label>
            <textarea id="f-bncc-orient" rows="4" oninput="onBnccPrefsChange()"></textarea>
          </div>
        </div>
      </details>`;

if (html.includes('class="bncc-prefs"') && !html.includes('bncc-details')) {
  html = html.replace(
    /<div class="format-badge format-badge-bncc"[\s\S]*?<\/div>\s*<div class="bncc-prefs">[\s\S]*?<\/div>\s*<\/div>/,
    bnccCollapsed,
  );
} else if (!html.includes('bncc-details')) {
  html = html.replace(
    '<div class="sl">Questões</div>',
    `<div class="sl">Questões</div>\n      ${bnccCollapsed}`,
  );
}

const visualBuilderV2 = `<div id="exam-visual-builder" class="exam-visual-builder">
        <div class="evb-head">
          <div>
            <div class="sl" style="margin:0">🧩 Montar a prova</div>
            <p class="evb-hint">Passo a passo: escolha o total, inclua exercícios com figura e use Gerar para o restante.</p>
          </div>
          <span id="evb-status" class="evb-status-badge">0/0</span>
        </div>
        <div class="evb-progress-wrap">
          <div class="evb-progress-bar"><div id="evb-progress-fill" class="evb-progress-fill" style="width:0%"></div></div>
          <span id="evb-progress-label" class="evb-progress-label">Defina o número de questões abaixo</span>
        </div>
        <div class="evb-steps">
          <span class="evb-step on" data-step="1">① Total</span>
          <span class="evb-step" data-step="2">② Suas figuras</span>
          <span class="evb-step" data-step="3">③ Ordem</span>
          <span class="evb-step" data-step="4">④ Preview</span>
        </div>
        <div id="evb-summary" class="evb-summary"></div>
        <div class="evb-toolbar">
          <button type="button" class="chip cy" onclick="evbSelectAllBlocks()">☑ Incluir todas as figuras</button>
          <button type="button" class="chip" onclick="evbClearAllBlocks()">○ Tirar figuras</button>
          <button type="button" class="chip" onclick="evbSuggestOrder()">↕ Ordem sugerida</button>
          <button type="button" class="chip" onclick="goTo('midias')">🖼 Buscar mídias</button>
        </div>
        <div class="evb-filters" role="tablist">
          <button type="button" class="evb-filter on" data-evb-filter="all" onclick="evbSetFilter('all')">Todas</button>
          <button type="button" class="evb-filter" data-evb-filter="block" onclick="evbSetFilter('block')">Com figura</button>
          <button type="button" class="evb-filter" data-evb-filter="slot" onclick="evbSetFilter('slot')">IA vai gerar</button>
          <button type="button" class="evb-filter" data-evb-filter="text" onclick="evbSetFilter('text')">Já na prova</button>
        </div>
        <div id="evb-list" class="evb-list"></div>
        <details class="evb-preview-details" id="evb-preview-details" open>
          <summary>📄 Ver preview da prova</summary>
          <iframe id="form-preview-iframe" class="exam-preview-frame evb-iframe" title="Preview da prova"></iframe>
        </details>
      </div>`;

if (html.includes('id="exam-visual-builder"')) {
  html = html.replace(
    /<div id="exam-visual-builder" class="exam-visual-builder">[\s\S]*?<\/div>\s*(?=<div id="form-preview-card"|<\/div>\s*<\/div>\s*<\/div>\s*<!--)/,
    visualBuilderV2,
  );
}

saveMarkup(html);
console.log('montagem v2', html.includes('evb-progress-fill'));
