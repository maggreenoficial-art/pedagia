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

if (!html.includes('f-pag-from')) {
  html = html.replace(
    '<div class="pchips" id="page-chips" style="margin-top:8px"></div>',
    `<div class="pgrow" style="margin-top:10px;flex-wrap:wrap;gap:8px">
              <input type="number" id="f-pag-from" min="1" placeholder="Pág. início" inputmode="numeric" style="width:100px">
              <input type="number" id="f-pag-to" min="1" placeholder="Pág. fim" inputmode="numeric" style="width:100px">
              <button type="button" class="btn-ir" onclick="selecionarIntervaloPaginas()">Selecionar intervalo</button>
            </div>
            <div class="pchips" id="page-chips" style="margin-top:8px"></div>`,
  );
}

if (!html.includes('id="view-revisao"')) {
  const revisaoView = `<!-- ════════ REVISÃO DE QUESTÕES ════════ -->
<div id="view-revisao" style="display:none">
  <div class="card">
    <div class="card-body">
      <div class="sl">✓ Monte sua prova</div>
      <p style="font-size:12px;color:var(--t2);margin:8px 0 12px;line-height:1.5">
        A IA sugeriu questões a partir do material selecionado. <b>Aprove</b> as que entram na prova ou <b>rejeite</b> as que não quiser. Depois toque em <b>Montar prova</b>.
      </p>
      <div class="rev-toolbar">
        <button type="button" class="chip rev-filter on" data-rev-filter="all" onclick="setReviewFilter('all')">Todas</button>
        <button type="button" class="chip rev-filter" data-rev-filter="pending" onclick="setReviewFilter('pending')">Pendentes</button>
        <button type="button" class="chip rev-filter" data-rev-filter="approved" onclick="setReviewFilter('approved')">Aprovadas</button>
        <button type="button" class="chip rev-filter" data-rev-filter="rejected" onclick="setReviewFilter('rejected')">Rejeitadas</button>
        <button type="button" class="chip" onclick="gerarMaisQuestoes()">+ Gerar mais</button>
        <button type="button" class="chip" onclick="goTo('form')">← Voltar ao formulário</button>
      </div>
      <div id="rev-summary" class="rev-summary">—</div>
      <p id="rev-ped-note" class="rev-ped-note" style="display:none"></p>
    </div>
    <div id="rev-list" class="rev-list"></div>
    <div class="rev-footer">
      <button type="button" class="btn-ir rev-montar-btn" id="rev-montar-btn" onclick="montarProvaAprovadas()" disabled>
        Montar prova (0 aprovadas)
      </button>
    </div>
  </div>
</div><!-- /view-revisao -->

`;

  html = html.replace(
    '<!-- ════════ LOADING ════════ -->',
    revisaoView + '\n<!-- ════════ LOADING ════════ -->',
  );
}

if (html.includes('Gerar Prova com IA')) {
  html = html.replace(
    '<span style="font-size:18px">✦</span> Gerar Prova com IA',
    '<span style="font-size:18px">✦</span> Gerar sugestões com IA',
  );
}

saveMarkup(html);
console.log('view-revisao', html.includes('view-revisao'));
console.log('f-pag-from', html.includes('f-pag-from'));
