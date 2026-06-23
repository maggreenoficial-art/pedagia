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

const PF_STEPS = [
  { n: 1, label: 'Dados', desc: 'Disciplina, série e quantidade de questões' },
  { n: 2, label: 'Material', desc: 'PDF, páginas confirmadas e recortes' },
  { n: 3, label: 'Cabeçalho', desc: 'Identidade visual da avaliação' },
  { n: 4, label: 'Mídias', desc: 'Figuras com exercícios gerados por IA' },
  { n: 5, label: 'Salvos', desc: 'Exercícios do seu banco' },
  { n: 6, label: 'Montar', desc: 'Revisar, aprovar e gerar a prova' },
];

function flowRailHtml() {
  const nodes = PF_STEPS.map((s, i) => {
    const conn = i < PF_STEPS.length - 1 ? '<span class="pf-flow-connector" aria-hidden="true"></span>' : '';
    return `<button type="button" class="pf-flow-node" data-pf-step="${s.n}" onclick="builderFlowGoTo(${s.n})" aria-label="Etapa ${s.n}: ${s.label}">
      <span class="pf-flow-node-ring"><span class="pf-flow-node-num">${s.n}</span></span>
      <span class="pf-flow-node-label">${s.label}</span>
    </button>${conn}`;
  }).join('');
  return `<nav class="pf-flow-rail" id="pf-flow-rail" aria-label="Etapas ProfessorFlux">${nodes}</nav>`;
}

function journeyHtml() {
  const items = PF_STEPS.map(
    (s) =>
      `<li class="pf-journey-item" data-pf-step="${s.n}"><button type="button" class="pf-journey-btn" onclick="builderFlowGoTo(${s.n})"><span class="pf-journey-num">${String(s.n).padStart(2, '0')}</span><span class="pf-journey-text"><strong>${s.label}</strong><small>${s.desc}</small></span></button></li>`,
  ).join('');
  return `<aside class="pf-journey" id="pf-journey" aria-label="Jornada"><p class="pf-journey-kicker">Sua jornada</p><ul class="pf-journey-list" id="pf-journey-list">${items}</ul><div class="pf-journey-progress"><div class="pf-journey-progress-bar" id="pf-journey-progress"></div></div></aside>`;
}

function wrapStep(n, title, desc, body) {
  return `<div class="pf-flow-step" data-pf-step="${n}" id="pf-step-${n}">
      <header class="pf-step-banner">
        <span class="pf-step-badge">${String(n).padStart(2, '0')}</span>
        <div class="pf-step-banner-text">
          <h2 class="pf-step-title">${title}</h2>
          <p class="pf-step-desc">${desc}</p>
        </div>
      </header>
      ${body}
    </div>`;
}

function transformBuilderPage(html) {
  if (html.includes('pf-page')) {
    console.log('ProfessorFlux markup já aplicado.');
    return html;
  }

  const pageStart = html.indexOf('<div id="view-builder"');
  const pageEnd = html.indexOf('</div>\n\n<!--', pageStart);
  if (pageStart < 0) throw new Error('view-builder não encontrado');

  const footerIdx = html.indexOf('<footer class="bd-footer">', pageStart);
  if (footerIdx < 0) throw new Error('bd-footer não encontrado');

  const before = html.slice(0, pageStart);
  const after = html.slice(footerIdx);
  let body = html.slice(pageStart, footerIdx);

  body = body.replace(
    '<div class="bd-page">',
    '<div class="bd-page pf-page">',
  );

  body = body.replace(
    `<header class="bd-hero">
      <h1 class="bd-title">Montar prova ou atividade</h1>
      <p class="bd-sub">Confirme o material e as páginas, escolha quantas questões gerar e marque o que entra na avaliação.</p>
    </header>`,
    `<header class="pf-hero">
      <div class="pf-hero-main">
        <div class="pf-hero-brand">
          <span class="pf-logo" aria-hidden="true">⚡</span>
          <div>
            <p class="pf-hero-kicker">PedagIA</p>
            <h1 class="pf-hero-title">ProfessorFlux</h1>
          </div>
        </div>
        <p class="pf-hero-tagline">Do PDF à avaliação pronta — cada etapa guiada, sem scroll infinito.</p>
      </div>
      <div class="pf-hero-metrics" id="pf-hero-metrics">
        <div class="pf-metric"><span class="pf-metric-val" id="pf-metric-pages">—</span><span class="pf-metric-lbl">Páginas</span></div>
        <div class="pf-metric"><span class="pf-metric-val" id="pf-metric-figs">0</span><span class="pf-metric-lbl">Figuras</span></div>
        <div class="pf-metric"><span class="pf-metric-val" id="pf-metric-q">0</span><span class="pf-metric-lbl">Questões</span></div>
      </div>
    </header>`,
  );

  const parts = [];
  const splitRe = /(\s*<section class="bd-card[^"]*"[^>]*>[\s\S]*?<\/section>|\s*<div id="bd-questoes-gate"[\s\S]*?<\/div>\s*\n\s*<section class="bd-card bd-card-questoes"[\s\S]*?<\/section>)/g;
  const heroEnd = body.indexOf('</header>') + '</header>'.length;
  const footerPart = body.slice(heroEnd);
  const chunks = [];
  let m;
  while ((m = splitRe.exec(footerPart)) !== null) chunks.push(m[1]);

  if (chunks.length < 6) {
    throw new Error(`Esperadas 6 etapas, encontradas ${chunks.length}. Atualize o patch manualmente.`);
  }

  const stepBodies = chunks.map((chunk) => chunk.trim());
  stepBodies[5] = stepBodies[5]; // gate + montar já unidos pelo regex alternativo

  // Se gate e montar vieram separados (6 sections + gate)
  if (chunks.length === 7) {
    stepBodies[5] = `${chunks[5].trim()}\n${chunks[6].trim()}`;
  }

  const wrapped = PF_STEPS.map((s, i) => wrapStep(s.n, s.label, s.desc, stepBodies[i] || '')).join('\n');

  body =
    body.slice(0, heroEnd) +
    `\n    <div class="pf-layout" id="pf-layout">
      ${flowRailHtml()}
      <div class="pf-workspace">
        ${journeyHtml()}
        <div class="pf-stage-shell">
          <div class="pf-stage-head" id="pf-stage-head">
            <p class="pf-stage-kicker" id="pf-stage-kicker">Etapa 1 de 6</p>
            <h2 class="pf-stage-title" id="pf-stage-title">Dados</h2>
          </div>
          <div class="pf-stage" id="pf-flow-stage">
            ${wrapped}
          </div>
        </div>
      </div>
      <nav class="pf-flow-nav-bar" id="pf-flow-nav-bar" aria-label="Navegação entre etapas">
        <button type="button" class="pf-nav-btn pf-nav-prev" id="pf-flow-prev" onclick="builderFlowPrev()">← Anterior</button>
        <span class="pf-nav-indicator" id="pf-flow-indicator">1 / 6</span>
        <button type="button" class="pf-nav-btn pf-nav-next" id="pf-flow-next" onclick="builderFlowNext()">Próximo →</button>
      </nav>
    </div>\n`;

  return before + body + after;
}

let html = loadMarkup();
html = transformBuilderPage(html);

html = html.replace(
  '>Montar<',
  '>Flux<',
);

saveMarkup(html);
console.log('Markup: ProfessorFlux flow aplicado.');
