import { resolveImageBytesForExport } from '../resolveImages';
import type { CatalogImage, ExamHeader, ExamModel } from '../types';
import type { HeaderImageBytes } from './headerImage';

type DocxLib = {
  Document: new (opts: unknown) => unknown;
  Packer: { toBlob: (doc: unknown) => Promise<Blob> };
  Paragraph: new (opts: unknown) => unknown;
  TextRun: new (opts: unknown) => unknown;
  ImageRun: new (opts: unknown) => unknown;
  Table: new (opts: unknown) => unknown;
  TableRow: new (opts: unknown) => unknown;
  TableCell: new (opts: unknown) => unknown;
  WidthType: { PERCENTAGE: unknown; DXA: unknown };
  BorderStyle: { SINGLE: unknown; NONE: unknown };
  AlignmentType: { LEFT: unknown; CENTER: unknown };
  ShadingType: { CLEAR: unknown };
  VerticalAlign: { CENTER: unknown };
};

async function ensureDocxLib(): Promise<DocxLib> {
  const lib = (window as unknown as { docx?: DocxLib }).docx;
  if (!lib?.Document) throw new Error('Biblioteca docx não carregada.');
  return lib;
}

export async function renderExamDocx(
  exam: ExamModel,
  catalog: CatalogImage[],
  resolveB64: (imageId: string, img?: CatalogImage) => Promise<string>,
  opts: { headerImage?: HeaderImageBytes | null } = {},
): Promise<Blob> {
  const docxLib = await ensureDocxLib();
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    ImageRun,
    Table,
    TableRow,
    TableCell,
    WidthType,
    BorderStyle,
    AlignmentType,
    ShadingType,
    VerticalAlign,
  } = docxLib;

  const cab: ExamHeader = exam.header;
  const meta = exam.metadata;
  const sz = (n: number) => n * 2;
  const twip = (mm: number) => Math.round(mm * 56.7);

  const cellBorder = { style: BorderStyle.SINGLE, size: 6, color: '000000' };
  const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const allBorders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };
  const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

  const mkCell = (children: unknown[], opts: { width?: number; span?: number; noBorder?: boolean } = {}) =>
    new TableCell({
      children,
      width: opts.width ? { size: opts.width, type: WidthType.DXA } : undefined,
      columnSpan: opts.span,
      verticalAlign: VerticalAlign.CENTER,
      borders: opts.noBorder ? noBorders : allBorders,
    });

  const mkPara = (text: string, opts: { bold?: boolean; pt?: number; align?: unknown; indent?: number; before?: number; after?: number } = {}) =>
    new Paragraph({
      children: [
        new TextRun({
          text: text || '',
          bold: opts.bold,
          size: sz(opts.pt || 9),
          font: 'Times New Roman',
        }),
      ],
      alignment: opts.align || AlignmentType.LEFT,
      spacing: { before: opts.before || 0, after: opts.after || 0 },
      indent: opts.indent ? { left: twip(opts.indent) } : undefined,
    });

  const centerLines = [];
  if (cab.governo) centerLines.push(mkPara(cab.governo.toUpperCase(), { bold: true, pt: 8, align: AlignmentType.CENTER }));
  if (cab.secretaria) centerLines.push(mkPara(cab.secretaria.toUpperCase(), { bold: true, pt: 8, align: AlignmentType.CENTER }));
  centerLines.push(mkPara((cab.escola || 'ESCOLA').toUpperCase(), { bold: true, pt: 9.5, align: AlignmentType.CENTER }));
  if (cab.endereco) centerLines.push(mkPara(cab.endereco, { pt: 7, align: AlignmentType.CENTER }));
  if (cab.cidade || cab.fone) {
    const cLine = [cab.cidade, cab.fone ? 'Fone: ' + cab.fone : ''].filter(Boolean).join(' — ');
    centerLines.push(mkPara(cLine, { pt: 7, align: AlignmentType.CENTER }));
  }

  const MAX_HDR_W = 520;
  let headerBlock: unknown = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          mkCell([mkPara('MS', { bold: true, pt: 10, align: AlignmentType.CENTER })], { width: twip(21) }),
          mkCell(centerLines, { width: twip(142) }),
          mkCell([mkPara('RB', { bold: true, pt: 12, align: AlignmentType.CENTER })], { width: twip(21) }),
        ],
      }),
    ],
  });

  const hdrImg = opts.headerImage;
  if (hdrImg?.data?.length && hdrImg.w > 0 && hdrImg.h > 0) {
    const imgW = MAX_HDR_W;
    const imgH = Math.max(40, Math.round(imgW * (hdrImg.h / hdrImg.w)));
    const imgData =
      hdrImg.data instanceof Uint8Array
        ? hdrImg.data
        : new Uint8Array(hdrImg.data as ArrayLike<number>);
    headerBlock = new Paragraph({
      children: [
        new ImageRun({
          data: imgData,
          transformation: { width: imgW, height: imgH },
          type: hdrImg.type === 'png' ? 'png' : 'jpg',
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
    });
  }

  const bimStr = (meta.bimestre || '1º Bimestre').replace(' Bimestre', ' BIMESTRE');
  const avTxt = `"${(meta.tipo || 'Prova').toUpperCase()} ${bimStr}" (De 0 a ${meta.valor || '10,0'} pontos)`;

  const fieldsTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          mkCell([
            new Paragraph({
              children: [
                new TextRun({ text: 'PROFESSOR(A): ', bold: true, size: sz(9), font: 'Times New Roman' }),
                new TextRun({ text: cab.prof || '', size: sz(9), font: 'Times New Roman' }),
              ],
            }),
          ], { width: twip(91) }),
          mkCell([
            new Paragraph({
              children: [
                new TextRun({ text: 'DISCIPLINA: ', bold: true, size: sz(9), font: 'Times New Roman' }),
                new TextRun({ text: meta.disciplina, size: sz(9), font: 'Times New Roman' }),
              ],
            }),
          ], { width: twip(91) }),
        ],
      }),
      new TableRow({
        children: [
          mkCell([mkPara('ESTUDANTE:', { bold: true, pt: 9 })], { width: twip(101) }),
          mkCell([mkPara('Nº:', { bold: true, pt: 9 })], { width: twip(28) }),
          mkCell([
            new Paragraph({
              children: [
                new TextRun({ text: 'ANO/ENSINO: ', bold: true, size: sz(9), font: 'Times New Roman' }),
                new TextRun({ text: meta.serie, size: sz(9), font: 'Times New Roman' }),
              ],
            }),
          ], { width: twip(55) }),
        ],
      }),
      new TableRow({
        children: [
          mkCell([mkPara(avTxt, { bold: true, pt: 9, align: AlignmentType.CENTER })], { width: twip(151) }),
          mkCell([mkPara('NOTA:', { bold: true, pt: 9 })], { width: twip(33) }),
        ],
      }),
    ],
  });

  const qParagraphs: unknown[] = [];
  const MAX_IMG_W = 270;

  for (const q of exam.questions) {
    const stmt = q.statement.join(' ').trim();
    if (!stmt) continue;

    if (q.imageId) {
      const imgBytes = await resolveImageBytesForExport(q.imageId, catalog, resolveB64);
      if (imgBytes) {
        const imgH = imgBytes.h && imgBytes.w
          ? Math.round(MAX_IMG_W * (imgBytes.h / imgBytes.w))
          : Math.round(MAX_IMG_W * 0.65);
        const imgData =
          imgBytes.data instanceof Uint8Array
            ? imgBytes.data
            : new Uint8Array(imgBytes.data as ArrayLike<number>);
        qParagraphs.push(
          new Paragraph({
            children: [
              new ImageRun({
                data: imgData,
                transformation: { width: MAX_IMG_W, height: imgH },
                type: imgBytes.type === 'png' ? 'png' : 'jpg',
              }),
            ],
            spacing: { before: 160, after: 40 },
          }),
        );
      } else if (q.fromBlock) {
        throw new Error(`Questão ${q.number}: imagem (${q.imageId}) não disponível no storage.`);
      }
    }

    qParagraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `${q.number}. ${stmt}`,
            bold: true,
            size: sz(10),
            font: 'Times New Roman',
          }),
        ],
        spacing: { before: q.imageId ? 0 : 160, after: 60 },
      }),
    );

    for (const a of q.alternatives) {
      qParagraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `${a.letter}) ${a.text}`,
              size: sz(9),
              font: 'Times New Roman',
            }),
          ],
          spacing: { after: 40 },
          indent: { left: twip(4.5) },
        }),
      );
    }

    const lines = q.answerLines || 0;
    for (let i = 0; i < lines; i++) {
      qParagraphs.push(mkPara('______________________________________________', { pt: 9, after: 80 }));
    }
  }

  const docObj = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: twip(11), bottom: twip(13), left: twip(13), right: twip(13) },
          },
          column: { space: twip(5), count: 2, equalWidth: true, separate: true },
        },
        children: [headerBlock, fieldsTable, new Paragraph({ spacing: { after: 80 } }), ...qParagraphs],
      },
    ],
  });

  return Packer.toBlob(docObj);
}
