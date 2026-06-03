import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

const DOWNLOADS = 'C:/Users/HUMBERTO/Downloads';

async function extractText(filePath) {
  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;
  const parts = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const pageText = tc.items.map((it) => it.str).join(' ');
    parts.push(pageText);
  }
  return { text: parts.join('\n'), pages: doc.numPages };
}

function analyzeText(text, name, pages) {
  const full = text;

  const qMatches = [...full.matchAll(/(?:^|[\n\r])\s*(\d{1,2})\s*[\.\)]\s+([^\n\r]{10,200})/g)];
  const questionNums = [...new Set(qMatches.map((m) => Number(m[1])))].sort((a, b) => a - b);

  let mc = 0;
  let disc = 0;
  let vf = 0;
  let imageLinked = 0;

  const splitRe = /(?=\d{1,2}\s*[\.\)]\s+)/;
  const blocks = full.split(splitRe).filter((b) => /^\d{1,2}\s*[\.\)]/.test(b.trim()));

  for (const block of blocks) {
    const alts = (block.match(/\b[a-e]\)\s/gi) || []).length;
    const imgCue =
      /analise|observe|gráfico|grafico|mapa|tabela|imagem|figura|charge|foto|abaixo|acima|ilustra|conforme o|de acordo com o/i.test(
        block.slice(0, 500),
      );
    const discCue =
      /produza|discorra|explique|disserte|elabore|escreva|redija|justifique|____+|linhas\s+para|responda\s*:/i.test(
        block,
      );
    const vfCue = /verdadeiro|falso|\(V\)|\(F\)/i.test(block);

    if (vfCue && alts >= 2) vf++;
    else if (discCue && alts < 3) disc++;
    else if (alts >= 3) mc++;
    else if (discCue) disc++;
    else mc++;

    if (imgCue) imageLinked++;
  }

  const hasHeader = /professor|disciplina|geografia|bimestre|estudante|nota|escola/i.test(full);
  const bimMatch = full.match(/(\d{1,2}[º°]?\s*bimestre|av\d|avaliação)/i);
  const fonteCount = (full.match(/fonte\s*:/gi) || []).length;

  const samples = blocks.slice(0, 4).map((b) =>
    b.replace(/\s+/g, ' ').trim().slice(0, 160),
  );

  return {
    arquivo: name,
    paginasPdf: pages,
    questoesDetectadas: questionNums.length,
    numeracao: questionNums.length ? `${questionNums[0]} a ${questionNums[questionNums.length - 1]}` : '—',
    multiplaEscolha: mc,
    discursivas: disc,
    verdadeiroFalso: vf,
    comReferenciaFigura: imageLinked,
    alternativas: 'a) a e)',
    cabecalhoInstitucional: hasHeader,
    bimestreOuAvaliacao: bimMatch ? bimMatch[0] : 'AV / bimestre (padrão)',
    linhasFonte: fonteCount,
    amostrasEnunciados: samples,
  };
}

const files = fs
  .readdirSync(DOWNLOADS)
  .filter((f) => /AV1.*BGEO\.pdf$/i.test(f))
  .sort((a, b) => {
    const na = parseInt(a.match(/\d+/)?.[0] || '99', 10);
    const nb = parseInt(b.match(/\d+/)?.[0] || '99', 10);
    return na - nb;
  });

const results = [];
for (const file of files) {
  const fp = path.join(DOWNLOADS, file);
  const { text, pages } = await extractText(fp);
  results.push(analyzeText(text, file, pages));
}

console.log(JSON.stringify(results, null, 2));
