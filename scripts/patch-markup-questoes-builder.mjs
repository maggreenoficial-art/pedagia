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

const bnccBadge = `<div class="format-badge format-badge-bncc" style="margin-bottom:10px">
        <span class="format-badge-icon">📘</span>
        <div>
          <div class="format-badge-t">Base BNCC — editável</div>
          <div class="format-badge-s">Avaliação escolar alinhada ao capítulo · o professor ajusta habilidades e orientações abaixo</div>
        </div>
      </div>
      <div class="bncc-prefs">
        <div class="field">
          <label class="fl" for="f-bncc-hab">Habilidades / competências (BNCC)</label>
          <textarea id="f-bncc-hab" rows="2" placeholder="Ex.: EF69GE01, EF69GE02 — ou descreva em texto" oninput="onBnccPrefsChange()"></textarea>
        </div>
        <div class="field">
          <label class="fl" for="f-bncc-foco">Foco avaliativo</label>
          <input type="text" id="f-bncc-foco" value="compreensão, aplicação e análise" oninput="onBnccPrefsChange()">
        </div>
        <div class="field">
          <label class="fl" for="f-bncc-orient">Orientações pedagógicas (você pode editar antes de gerar)</label>
          <textarea id="f-bncc-orient" rows="5" oninput="onBnccPrefsChange()"></textarea>
        </div>
      </div>`;

if (!html.includes('id="f-bncc-orient"')) {
  if (html.includes('Padrão ENEM / Vestibular')) {
    html = html.replace(
      /<!-- Badge padrão ENEM -->[\s\S]*?<div class="format-badge-s">Contextualizador obrigatório[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/,
      bnccBadge.trim(),
    );
  } else {
    html = html.replace(
      '<div class="sl">Questões</div>',
      `<div class="sl">Questões</div>\n      ${bnccBadge}`,
    );
  }
}

const visualBuilder = `
      <div id="exam-visual-builder" class="exam-visual-builder">
        <div class="evb-head">
          <span class="img-sec-lbl" style="margin:0">🧩 Montagem visual da prova</span>
          <span id="evb-status" class="exam-preview-status"></span>
        </div>
        <p class="evb-hint">Arraste a ordem, marque o que entra na prova e veja o preview. Figuras vêm do builder; o restante será gerado pela IA conforme a BNCC.</p>
        <div id="evb-summary" class="evb-summary"></div>
        <div id="evb-list" class="evb-list"></div>
        <div class="evb-preview-wrap">
          <div class="img-sec-lbl" style="margin-top:12px">📄 Preview (como na impressão)</div>
          <iframe id="form-preview-iframe" class="exam-preview-frame evb-iframe" title="Preview da prova"></iframe>
        </div>
      </div>`;

if (!html.includes('id="exam-visual-builder"')) {
  html = html.replace(
    '<div id="form-preview-card"',
    `${visualBuilder}\n      <div id="form-preview-card" style="display:none"`,
  );
  html = html.replace(
    /<div id="form-preview-card" class="form-preview-card"[\s\S]*?<iframe id="form-preview-iframe"[\s\S]*?<\/iframe>\s*<\/div>/,
    '',
  );
}

saveMarkup(html);
console.log('bncc', html.includes('f-bncc-orient'));
console.log('evb', html.includes('exam-visual-builder'));
