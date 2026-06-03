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

const panel = `      <div class="midia-gen-panel" id="midia-gen-panel">
        <div class="sl" style="margin-bottom:8px">✨ Gerar recurso visual (IA)</div>
        <p class="uzone-s" style="margin-bottom:10px;line-height:1.5">
          Mapas, diagramas anatômicos, reconstruções históricas, cenas arquitetônicas e ilustrações didáticas
          (OpenRouter · GPT Image 2).
        </p>
        <div class="midia-gen-cats" id="midia-gen-cats">
          <button type="button" class="chip midia-gen-cat on" data-cat="mapa" onclick="setMidiaGenCategory('mapa')">🗺 Mapa</button>
          <button type="button" class="chip midia-gen-cat" data-cat="anatomia" onclick="setMidiaGenCategory('anatomia')">🫀 Anatomia</button>
          <button type="button" class="chip midia-gen-cat" data-cat="historia" onclick="setMidiaGenCategory('historia')">🏛 História</button>
          <button type="button" class="chip midia-gen-cat" data-cat="arquitetura" onclick="setMidiaGenCategory('arquitetura')">🏗 Arquitetura</button>
          <button type="button" class="chip midia-gen-cat" data-cat="educativo" onclick="setMidiaGenCategory('educativo')">📊 Didático</button>
        </div>
        <textarea id="midia-gen-prompt" class="midia-gen-prompt" rows="3" placeholder="Descreva o que precisa gerar…"></textarea>
        <div class="midia-gen-row">
          <div class="field" style="flex:1;min-width:120px;margin:0">
            <label class="fl" for="midia-gen-aspect">Proporção</label>
            <select id="midia-gen-aspect" class="midia-gen-aspect">
              <option value="4:3" selected>4:3 (livro)</option>
              <option value="16:9">16:9 (paisagem)</option>
              <option value="3:4">3:4 (retrato)</option>
              <option value="1:1">1:1 (quadrado)</option>
              <option value="3:2">3:2</option>
            </select>
          </div>
          <div class="field" style="flex:2;min-width:140px;margin:0">
            <label class="fl" for="midia-gen-title">Nome na galeria (opcional)</label>
            <input type="text" id="midia-gen-title" class="midia-gen-title" placeholder="Ex.: Mapa — biomas do Brasil">
          </div>
        </div>
        <div class="midia-gen-actions">
          <button type="button" class="btn-ir" id="btn-midia-gen" onclick="generateMidiaVisual()">✨ Gerar imagem</button>
          <button type="button" class="btn-ir midia-gen-save-btn" id="btn-midia-gen-save" style="display:none" onclick="saveGeneratedMidiaToCloud()">💾 Salvar na nuvem</button>
        </div>
        <p id="midia-gen-status" class="midia-gen-status uzone-s"></p>
        <img id="midia-gen-preview" class="midia-gen-preview" alt="Prévia da imagem gerada" style="display:none">
      </div>
`;

if (!html.includes('id="midia-gen-panel"')) {
  const needle = '<div class="midias-filter-row">';
  if (!html.includes(needle)) throw new Error('midias-filter-row not found');
  html = html.replace(needle, panel + '\n      ' + needle);

  html = html.replace(
    'Figuras salvas na nuvem (Supabase). Adicione imagens do computador, nomeie, sugira questões ou apague.',
    'Figuras na nuvem: envie do computador, gere mapas e ilustrações com IA, sugira questões ou apague.',
  );

  fs.writeFileSync(
    markupPath,
    `/* AUTO: markup do PedagIA */\nexport const LEGACY_MARKUP = ${JSON.stringify(html)};\n`,
  );
  console.log('patched midia-gen panel');
} else {
  console.log('already patched');
}
