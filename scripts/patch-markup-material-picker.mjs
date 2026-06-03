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

const needle =
  '<p style="font-size:12px;color:var(--t2);margin:8px 0 14px;line-height:1.5">\n        Envie o PDF, escolha o capítulo e <b>recorte manualmente</b>';

const insert = `      <div class="material-toolbar" id="material-toolbar">
        <label class="fl" for="material-select">Material em uso</label>
        <div class="material-toolbar-row">
          <select id="material-select" class="material-select" onchange="switchMaterial(this.value)"></select>
          <button type="button" class="btn-ir material-add-btn" onclick="startNewMaterial()">+ Novo</button>
        </div>
        <p id="material-toolbar-hint" class="uzone-s" style="margin-top:6px"></p>
      </div>
`;

if (!html.includes('id="material-toolbar"')) {
  if (!html.includes(needle)) throw new Error('needle not found');
  html = html.replace(needle, insert + needle);
  fs.writeFileSync(
    markupPath,
    `/* AUTO: markup do PedagIA */\nexport const LEGACY_MARKUP = ${JSON.stringify(html)};\n`,
  );
  console.log('patched material picker');
} else {
  console.log('already patched');
}
