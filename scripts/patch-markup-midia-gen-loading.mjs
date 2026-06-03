import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const markupPath = path.join(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  'src/components/legacy/markup.ts',
);

const src = fs.readFileSync(markupPath, 'utf8');
const prefix = 'export const LEGACY_MARKUP = ';
const start = src.indexOf(prefix) + prefix.length;
const end = src.lastIndexOf(';\n');
let html = JSON.parse(src.slice(start, end));

const loadingBlock = `        <div class="midia-gen-loading" id="midia-gen-loading" style="display:none" aria-live="polite">
          <div class="midia-gen-loading-inner">
            <div class="midia-gen-spinner" aria-hidden="true"></div>
            <p class="midia-gen-loading-title" id="midia-gen-loading-title">Gerando imagem…</p>
            <div class="midia-gen-progress"><div class="midia-gen-progress-bar" id="midia-gen-progress-bar"></div></div>
            <div class="midia-gen-log-wrap">
              <div class="midia-gen-log" id="midia-gen-log"></div>
            </div>
          </div>
        </div>
`;

if (!html.includes('id="midia-gen-loading"')) {
  html = html.replace(
    '<div class="midia-gen-panel" id="midia-gen-panel">',
    `<div class="midia-gen-panel" id="midia-gen-panel">\n${loadingBlock}`,
  );
  fs.writeFileSync(
    markupPath,
    `/* AUTO: markup do PedagIA */\nexport const LEGACY_MARKUP = ${JSON.stringify(html)};\n`,
  );
  console.log('patched loading overlay');
} else {
  console.log('already has loading');
}
