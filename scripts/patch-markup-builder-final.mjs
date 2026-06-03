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

const builderView = `<!-- ════════ BUILDER FINAL (montar prova) ════════ -->
<div id="view-builder" style="display:none">
  <div class="bd-page">
    <header class="bd-hero">
      <h1 class="bd-title">Montar prova</h1>
      <p class="bd-sub">Escolha material, cabeçalho, mídias e exercícios. Gere sugestões e marque o que entra na prova.</p>
    </header>

    <section class="bd-card">
      <h2 class="bd-card-title">① Dados da avaliação</h2>
      <div class="g2">
        <div class="field"><label class="fl" for="bd-disc">Disciplina</label><input type="text" id="bd-disc" placeholder="Geografia" oninput="builderSyncFields()"></div>
        <div class="field"><label class="fl" for="bd-serie">Série / ano</label><input type="text" id="bd-serie" placeholder="1º ano EM" oninput="builderSyncFields()"></div>
      </div>
      <div class="g2" style="margin-top:10px">
        <div class="field"><label class="fl" for="bd-tipo">Tipo</label><input type="text" id="bd-tipo" value="Prova" oninput="builderSyncFields()"></div>
        <div class="field"><label class="fl" for="bd-valor">Valor</label><input type="text" id="bd-valor" value="10,0" oninput="builderSyncFields()"></div>
      </div>
      <label class="fl" style="margin-top:12px">Quantidade alvo (sugestões da IA)</label>
      <div class="stepper" style="margin-top:6px">
        <button type="button" class="sb" onclick="builderChNumQ(-1)">−</button>
        <span class="sv" id="bd-numq">10</span>
        <button type="button" class="sb" onclick="builderChNumQ(1)">+</button>
      </div>
    </section>

    <section class="bd-card">
      <h2 class="bd-card-title">② Material (PDF na nuvem)</h2>
      <p class="bd-hint">Selecione um livro já enviado. Depois marque o intervalo de páginas para a IA ler.</p>
      <select id="bd-material" class="bd-select" onchange="builderOnMaterialChange(this.value)"></select>
      <p id="bd-material-hint" class="bd-hint">—</p>
      <div class="pgrow" style="margin-top:10px">
        <input type="number" id="bd-pag-from" min="1" placeholder="Pág. início" inputmode="numeric" style="width:100px">
        <input type="number" id="bd-pag-to" min="1" placeholder="Pág. fim" inputmode="numeric" style="width:100px">
        <button type="button" class="btn-ir" onclick="builderApplyPages()">Usar páginas</button>
      </div>
      <div id="bd-page-chips" class="pchips" style="margin-top:8px"></div>
      <p id="bd-page-count" class="bd-hint">0 páginas</p>
      <details class="bd-details" style="margin-top:10px">
        <summary>Ou escreva o conteúdo (sem PDF)</summary>
        <textarea id="bd-topicos" rows="4" placeholder="Tópicos, trechos ou orientações para as questões…" oninput="builderSyncFields()"></textarea>
      </details>
      <button type="button" class="chip" style="margin-top:8px" onclick="goTo('material')">📚 Gerenciar materiais</button>
    </section>

    <section class="bd-card">
      <h2 class="bd-card-title">③ Cabeçalho da escola</h2>
      <select id="bd-header" class="bd-select" onchange="builderOnHeaderChange(this.value)"></select>
      <p class="bd-hint">O cabeçalho entra no Word/PDF exportado.</p>
      <button type="button" class="chip" onclick="goTo('form');setHtab('m')">✏️ Editar cabeçalho completo</button>
    </section>

    <section class="bd-card">
      <h2 class="bd-card-title">④ Mídias <span id="bd-midias-count" class="bd-badge">0</span></h2>
      <p class="bd-hint">Figuras salvas na nuvem — marque as que entram na prova (com imagem).</p>
      <div id="bd-midias-grid" class="bd-pick-grid"><div class="bd-empty">Carregando mídias…</div></div>
      <button type="button" class="chip" onclick="goTo('midias')">🖼 Abrir galeria completa</button>
    </section>

    <section class="bd-card">
      <h2 class="bd-card-title">⑤ Exercícios salvos <span id="bd-ex-count" class="bd-badge">0</span></h2>
      <p class="bd-hint">Questões que você já gerou antes — marque para incluir.</p>
      <div id="bd-ex-list" class="bd-pick-list"><div class="bd-empty">Carregando…</div></div>
    </section>

    <section class="bd-card bd-card-questoes">
      <div class="bd-card-head-row">
        <h2 class="bd-card-title">⑥ Questões na prova</h2>
        <button type="button" class="btn-ir" id="bd-btn-gerar" onclick="builderGerarQuestoes()">✦ Gerar do material</button>
      </div>
      <p id="bd-pool-summary" class="bd-hint">Marque as questões que entram na prova. Gere sugestões a partir do material ou use exercícios/mídias acima.</p>
      <div id="bd-pool" class="bd-pool"></div>
    </section>

    <footer class="bd-footer">
      <button type="button" class="gbtn bd-montar-btn" id="bd-montar-btn" onclick="builderMontarProva()" disabled>
        Montar prova final
      </button>
      <p class="bd-footer-hint">Abre a prova pronta para revisar, exportar Word/PDF e salvar.</p>
    </footer>
  </div>
</div><!-- /view-builder -->

`;

if (!html.includes('id="view-builder"')) {
  const anchor = '<div id="view-form"';
  if (html.includes(anchor)) {
    html = html.replace(anchor, builderView + '\n' + anchor);
  } else {
    html = html.replace('<div id="view-auth"', builderView + '\n<div id="view-auth"');
  }
}

if (!html.includes('data-view="builder"')) {
  html = html.replace(
    /<button type="button" class="bn-item on" data-view="form"/,
    `<button type="button" class="bn-item on" data-view="builder" onclick="goTo('builder')"><span class="bn-icon" aria-hidden="true">✦</span><span class="bn-label">Montar</span></button>
  <button type="button" class="bn-item" data-view="form"`,
  );
  html = html.replace(
    /<button class="np on" id="np-form"/,
    `<button class="np on" id="np-builder" onclick="goTo('builder')">✦ Montar</button>
    <button class="np" id="np-form"`,
  );
}

saveMarkup(html);
console.log('view-builder', html.includes('view-builder'));
console.log('bn-builder', html.includes('data-view="builder"'));
