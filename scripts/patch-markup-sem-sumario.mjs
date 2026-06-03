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
  '<button class="btn-ir" id="btn-ler" onclick="lerSum()">Ler sumário →</button>\n            </div>\n            <div id="sum-status"';

const insert = `<button class="btn-ir" id="btn-ler" onclick="lerSum()">Ler sumário →</button>
            </div>
            <button type="button" class="btn-ir sum-skip-btn" id="btn-sem-sumario" onclick="pularSumarioUsarTodasPaginas()">Sem sumário — usar todas as páginas do PDF</button>
            <div id="sum-status"`;

if (!html.includes('btn-sem-sumario')) {
  if (!html.includes(needle)) throw new Error('needle not found');
  html = html.replace(needle, insert);
  fs.writeFileSync(
    markupPath,
    `/* AUTO: markup do PedagIA */\nexport const LEGACY_MARKUP = ${JSON.stringify(html)};\n`,
  );
  console.log('patched sem-sumario button');
} else {
  console.log('already patched');
}
