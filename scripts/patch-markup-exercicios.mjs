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

if (!html.includes('id="np-exercicios"')) {
  html = html.replace(
    /<button class="np" id="np-midias" onclick="goTo\('midias'\)">🖼 Minhas mídias<\/button>/,
    `<button class="np" id="np-midias" onclick="goTo('midias')">🖼 Minhas mídias</button>
    <button class="np" id="np-exercicios" onclick="goTo('exercicios')">📌 Exercícios</button>`,
  );
}

if (!html.includes('id="view-exercicios"')) {
  const exerciciosView = `<!-- ════════ EXERCÍCIOS SALVOS ════════ -->
<div id="view-exercicios" style="display:none">
  <div class="card">
    <div class="card-body">
      <div class="sl">📌 Exercícios salvos</div>
      <p style="font-size:12px;color:var(--t2);margin:8px 0 14px;line-height:1.5">
        Questões geradas com &quot;Sugerir questão&quot; ficam aqui. Inclua na prova ou apague quando não precisar mais.
      </p>
      <input type="search" id="exercicios-search" class="midias-search" placeholder="Buscar por enunciado, disciplina ou imagem…" oninput="filterExercicios()" autocomplete="off">
      <span id="exercicios-status" class="midias-status" style="display:block;margin:10px 0 0">—</span>
    </div>
    <div id="exercicios-list" class="exercicios-list"></div>
  </div>
</div><!-- /view-exercicios -->
`;

  html = html.replace(
    '<!-- ════════ LOADING ════════ -->',
    exerciciosView + '\n\n<!-- ════════ LOADING ════════ -->',
  );
}

if (!html.includes('data-view="exercicios"')) {
  html = html.replace(
    /<button type="button" class="bn-item" data-view="midias" onclick="goTo\('midias'\)">/,
    `<button type="button" class="bn-item" data-view="exercicios" onclick="goTo('exercicios')"><span class="bn-icon" aria-hidden="true">📌</span><span class="bn-label">Exerc.</span></button>
  <button type="button" class="bn-item" data-view="midias" onclick="goTo('midias')">`,
  );
}

saveMarkup(html);
console.log('exercicios view', html.includes('view-exercicios'));
console.log('np-exercicios', html.includes('np-exercicios'));
console.log('bn-exercicios', html.includes('data-view="exercicios"'));
