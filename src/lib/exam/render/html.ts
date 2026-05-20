import { getImageSrcForRender } from '../resolveImages';
import type { CatalogImage, ExamModel } from '../types';

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function renderExamHtml(
  exam: ExamModel,
  catalog: CatalogImage[],
  opts: { headerImageUrl?: string | null; pdfExport?: boolean } = {},
): string {
  const cab = exam.header;
  const { metadata } = exam;
  const headerImageUrl = opts.headerImageUrl || null;
  const eh = escHtml;
  const disc = metadata.disciplina;
  const serie = metadata.serie;
  const tipo = metadata.tipo || 'Prova';
  const valor = metadata.valor || '10,0';
  const bim = (metadata.bimestre || '1º Bimestre').replace(' Bimestre', ' BIMESTRE');

  const hdrLines = [
    cab.governo ? `<div>${eh(cab.governo.toUpperCase())}</div>` : '',
    cab.secretaria ? `<div>${eh(cab.secretaria.toUpperCase())}</div>` : '',
    `<div><strong>${eh((cab.escola || 'ESCOLA').toUpperCase())}</strong></div>`,
    cab.endereco ? `<div class="addr">${eh(cab.endereco)}</div>` : '',
    cab.cidade || cab.fone
      ? `<div class="addr">${eh([cab.cidade, cab.fone ? 'Fone: ' + cab.fone : ''].filter(Boolean).join(' – '))}</div>`
      : '',
  ]
    .filter(Boolean)
    .join('');

  const questionsHtml = exam.questions
    .map((q) => {
      const stmt = q.statement.join(' ').trim();
      const imgUri = q.imageId ? getImageSrcForRender(q.imageId, catalog) : '';
      const imgHtml = imgUri ? `<img class="q-img" src="${imgUri}" alt="">` : '';
      const altsHtml = q.alternatives
        .map((a) => `<div class="alt">${a.letter}) ${eh(a.text)}</div>`)
        .join('');
      const ansHtml =
        (q.answerLines || 0) > 0
          ? Array(Math.max(q.answerLines || 0, 5))
              .fill('<div class="ans-line"></div>')
              .join('')
          : '';
      return `<section class="q">${imgHtml}<div class="qs"><b>${q.number}.</b> ${eh(stmt)}</div>${altsHtml}${ansHtml}</section>`;
    })
    .join('\n');

  const css = `@page { size: A4 portrait; margin: 7mm; }
body { font-family: "Times New Roman", Times, serif; font-size: 10.5px; line-height: 1.12; }
.exam-shell { max-width: 18.5cm; margin: 0 auto; border: 3px double #000; padding: 4mm; }
.exam-header-file img { width: 100%; max-height: 150px; object-fit: contain; }
.exam-header { display: grid; grid-template-columns: 70px 1fr 70px; margin-bottom: 6px; }
.logo-ms,.logo-rb { display:flex;align-items:center;justify-content:center;font-weight:900;height:56px;border:2px solid #000; }
.itext { text-align:center; font-size:9px; font-weight:700; }
.id-table { width:100%; border-collapse:collapse; font-size:9px; margin-bottom:6px; }
.id-table td { border:1px solid #000; padding:2px 4px; }
.questions { column-count:${opts.pdfExport ? 1 : 2}; column-gap:8px; column-rule:1px solid #000; }
.q { break-inside:avoid; margin-bottom:8px; page-break-inside:avoid; }
.q-img { display:block; max-width:100%; max-height:${opts.pdfExport ? 200 : 110}px; margin:4px auto 6px; object-fit:contain; }
.alt { padding-left:8px; }`;

  const fileHeader = headerImageUrl
    ? `<div class="exam-header-file"><img src="${headerImageUrl}" alt=""></div>`
    : '';
  const manualHeader = headerImageUrl
    ? ''
    : `<header class="exam-header"><div class="logo-ms">MS</div><div class="itext">${hdrLines}</div><div class="logo-rb">RB</div></header>`.replace(
        /<motion class="logo-rb">RB<\/motion>/,
        '<div class="logo-rb">RB</div>',
      );

  const manualHeaderFixed = headerImageUrl
    ? ''
    : `<header class="exam-header"><div class="logo-ms">MS</div><div class="itext">${hdrLines}</div><div class="logo-rb">RB</div></header>`;

  void manualHeader;

  const body = `${fileHeader}${manualHeaderFixed}
<table class="id-table">
<tr><td colspan="3"><b>PROFESSOR(A):</b> ${eh(cab.prof || '')}</td><td colspan="2"><b>DISCIPLINA:</b> ${eh(disc)}</td></tr>
<tr><td colspan="3"><b>ESTUDANTE:</b></td><td><b>Nº:</b></td><td><b>ANO/ENSINO:</b> ${eh(serie)}</td></tr>
<tr><td colspan="4" style="text-align:center"><b>"${eh(tipo.toUpperCase())} ${eh(bim)}"</b> (De 0 a ${eh(valor)} pontos)</td><td><b>NOTA:</b></td></tr>
</table>
<main class="questions">${questionsHtml}</main>`;

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><style>${css}</style></head><body><div class="exam-shell">${body}</div></body></html>`;
}

export function renderGabaritoHtml(exam: ExamModel): string {
  const eh = escHtml;
  const lines = exam.gabarito.length
    ? exam.gabarito
        .map((g) => `<div><b>${g.number}.</b> ${eh(g.letter || '—')} — ${eh(g.justification || '')}</div>`)
        .join('')
    : '<p>Gabarito não disponível.</p>';
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="font-family:Times New Roman;padding:20px">
<h1>GABARITO</h1><p>${eh(exam.metadata.disciplina)} · ${eh(exam.metadata.serie)}</p>${lines}</body></html>`;
}
