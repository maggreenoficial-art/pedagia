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

const newBuilder = `<div id="view-builder" style="display:none">
  <div class="bd-page">
    <header class="bd-hero">
      <h1 class="bd-title">Montar prova ou atividade</h1>
      <p class="bd-sub">Confirme o material e as páginas, escolha quantas questões gerar e marque o que entra na avaliação.</p>
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
      <label class="fl" style="margin-top:14px">Quantidade de questões (IA)</label>
      <p class="bd-hint">A IA gera exatamente esta quantidade de sugestões após você confirmar as páginas.</p>
      <div class="stepper" style="margin-top:6px">
        <button type="button" class="sb" onclick="builderChNumQ(-1)">−</button>
        <span class="sv" id="bd-numq">10</span>
        <button type="button" class="sb" onclick="builderChNumQ(1)">+</button>
      </div>
      <div class="bd-adapt-box" style="margin-top:14px">
        <label class="bd-adapt-label"><input type="checkbox" id="bd-adaptada" onchange="builderOnAdaptadaToggle()"> Gerar também <b>versão adaptada</b> (aluno com deficiência / PAEE)</label>
        <textarea id="bd-adapt-notas" rows="2" placeholder="Ex.: dislexia — comandos curtos; ou TDAH — uma questão por bloco; baixa visão — descrição das figuras." style="display:none;margin-top:8px"></textarea>
      </div>
    </section>

    <section class="bd-card">
      <h2 class="bd-card-title">② Material e páginas do livro</h2>
      <p class="bd-hint">Escolha o PDF e as páginas. Só depois de <b>confirmar</b> a IA pode gerar questões.</p>
      <select id="bd-material" class="bd-select" onchange="builderOnMaterialChange(this.value)"></select>
      <p id="bd-material-hint" class="bd-hint">—</p>
      <div class="pgrow" style="margin-top:10px">
        <input type="number" id="bd-pag-from" min="1" placeholder="Pág. início" inputmode="numeric" style="width:100px">
        <input type="number" id="bd-pag-to" min="1" placeholder="Pág. fim" inputmode="numeric" style="width:100px">
        <button type="button" class="btn-ir" onclick="builderApplyPages()">Aplicar intervalo</button>
      </div>
      <div id="bd-page-chips" class="pchips" style="margin-top:8px"></div>
      <p id="bd-page-count" class="bd-hint">0 páginas</p>
      <details class="bd-details" style="margin-top:10px">
        <summary>Ou conteúdo escrito (sem PDF)</summary>
        <textarea id="bd-topicos" rows="4" placeholder="Tópicos ou texto-base…" oninput="builderOnTopicosInput()"></textarea>
      </details>
      <div class="bd-confirm-pages-row">
        <button type="button" class="btn-ir bd-confirm-pages-btn" id="bd-btn-confirm-pages" onclick="builderConfirmPages()">✓ Confirmar páginas para a IA</button>
        <button type="button" class="chip" id="bd-btn-change-pages" style="display:none" onclick="builderResetPagesConfirm()">Alterar páginas</button>
      </div>
      <p id="bd-pages-status" class="bd-pages-status bd-pages-pending">Aguardando confirmação das páginas.</p>
      <button type="button" class="chip" style="margin-top:8px" onclick="goTo('material')">📚 Biblioteca de livros</button>
    </section>

    <section class="bd-card">
      <h2 class="bd-card-title">③ Cabeçalho da escola</h2>
      <select id="bd-header" class="bd-select" onchange="builderOnHeaderChange(this.value)"></select>
    </section>

    <section class="bd-card">
      <h2 class="bd-card-title">④ Mídias <span id="bd-midias-count" class="bd-badge">0</span></h2>
      <p class="bd-hint">Opcional — figuras na nuvem com questão.</p>
      <div id="bd-midias-grid" class="bd-pick-grid"><div class="bd-empty">Carregando…</div></div>
    </section>

    <section class="bd-card">
      <h2 class="bd-card-title">⑤ Exercícios salvos <span id="bd-ex-count" class="bd-badge">0</span></h2>
      <div id="bd-ex-list" class="bd-pick-list"><div class="bd-empty">Carregando…</div></div>
    </section>

    <div id="bd-questoes-gate" class="bd-questoes-gate">
      <p>🔒 Confirme as páginas (passo ②) para gerar e escolher questões com a IA.</p>
    </div>

    <section class="bd-card bd-card-questoes" id="bd-questoes-block" style="display:none">
      <div class="bd-card-head-row">
        <h2 class="bd-card-title">⑥ Montar a avaliação</h2>
        <button type="button" class="btn-ir" id="bd-btn-gerar" onclick="builderGerarQuestoes()" disabled>✦ Gerar questões do material</button>
      </div>
      <p id="bd-pool-summary" class="bd-hint">Marque as questões que entram na prova ou atividade.</p>
      <div class="rev-toolbar bd-pool-tabs">
        <button type="button" class="chip bd-pool-tab on" data-bd-pool="turma" onclick="builderSetPoolTab('turma')">Turma</button>
        <button type="button" class="chip bd-pool-tab" data-bd-pool="adaptada" onclick="builderSetPoolTab('adaptada')">Versão adaptada</button>
        <button type="button" class="chip bd-pool-tab" data-bd-pool="all" onclick="builderSetPoolTab('all')">Todas</button>
      </div>
      <div id="bd-pool" class="bd-pool"></div>
    </section>

    <footer class="bd-footer">
      <button type="button" class="gbtn bd-montar-btn" id="bd-montar-btn" onclick="builderMontarProva('turma')" disabled>Montar prova (turma)</button>
      <button type="button" class="btn-ir bd-montar-adapt-btn" id="bd-montar-adapt-btn" onclick="builderMontarProva('adaptada')" disabled style="margin-top:8px;width:100%">Montar versão adaptada (individual)</button>
      <p class="bd-footer-hint">Exporte Word/PDF depois na tela de resultado.</p>
    </footer>
  </div>
</div><!-- /view-builder -->`;

if (html.includes('id="view-builder"')) {
  html = html.replace(/<div id="view-builder"[\s\S]*?<!-- \/view-builder -->/, newBuilder);
}

saveMarkup(html);
console.log('builder v2', html.includes('bd-btn-confirm-pages'));
