import { resolveImageBytesForExport } from '../resolveImages';
import type { CatalogImage, ExamModel } from '../types';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MAX_IMG_CX = 2571750;

type JSZipInstance = {
  file(name: string): { async(type: string): Promise<string> } | null;
  file(name: string, data: Uint8Array | string): void;
  files: Record<string, { name?: string; dir?: boolean }>;
  generateAsync(opts: { type: string; mimeType?: string }): Promise<Blob>;
};

type JSZipCtor = {
  loadAsync(data: ArrayBuffer): Promise<JSZipInstance>;
};

function getJSZip(): JSZipCtor {
  const z =
    (globalThis as unknown as { JSZip?: JSZipCtor }).JSZip ||
    (typeof window !== 'undefined' ? (window as unknown as { JSZip?: JSZipCtor }).JSZip : undefined);
  if (!z) throw new Error('JSZip não carregado.');
  return z;
}

function escXml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function maxRelNum(relsXml: string): number {
  let max = 0;
  for (const m of relsXml.matchAll(/Id="rId(\d+)"/g)) {
    max = Math.max(max, parseInt(m[1], 10));
  }
  return max;
}

function maxDocPrId(xml: string): number {
  let max = 0;
  for (const m of xml.matchAll(/wp:docPr id="(\d+)"/g)) {
    max = Math.max(max, parseInt(m[1], 10));
  }
  return max;
}

function nextMediaIndex(zip: JSZipInstance): number {
  let max = 0;
  for (const name of Object.keys(zip.files)) {
    const m = name.match(/^word\/media\/image(\d+)\./i);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max + 1;
}

function addImageRelationship(relsXml: string, rid: string, mediaFile: string): string {
  const rel = `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${mediaFile}"/>`;
  if (relsXml.includes('</Relationships>')) {
    return relsXml.replace('</Relationships>', `${rel}</Relationships>`);
  }
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    rel +
    '</Relationships>'
  );
}

function ensureContentType(ctXml: string, ext: 'png' | 'jpeg'): string {
  if (!ctXml) return ctXml;
  if (ext === 'png' && !ctXml.includes('ContentType="image/png"')) {
    return ctXml.replace('</Types>', '<Default Extension="png" ContentType="image/png"/></Types>');
  }
  if (ext === 'jpeg' && !ctXml.includes('ContentType="image/jpeg"')) {
    return ctXml.replace(
      '</Types>',
      '<Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="jpg" ContentType="image/jpeg"/></Types>',
    );
  }
  return ctXml;
}

function buildTextPara(
  text: string,
  opts: { bold?: boolean; before?: number; after?: number; indent?: number } = {},
): string {
  const { bold, before = 0, after = 80, indent } = opts;
  const ind = indent ? `<w:ind w:left="${indent}"/>` : '';
  return `<w:p><w:pPr><w:spacing w:before="${before}" w:after="${after}"/>${ind}</w:pPr><w:r><w:rPr>${
    bold ? '<w:b/><w:bCs/>' : ''
  }<w:sz w:val="24"/><w:szCs w:val="24"/><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/></w:rPr><w:t xml:space="preserve">${escXml(text)}</w:t></w:r></w:p>`;
}

function buildImagePara(relId: string, cx: number, cy: number, docPrId: number): string {
  return `<w:p><w:pPr><w:spacing w:before="160" w:after="40"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent t="0" r="0" b="0" l="0"/><wp:docPr id="${docPrId}" name="" descr="" title=""/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="" descr=""/><pic:cNvPicPr><a:picLocks noChangeAspect="1" noChangeArrowheads="1"/></pic:cNvPicPr></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relId}" cstate="none"/><a:srcRect/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr bwMode="auto"><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

/** Injeta questões (com figuras) no .docx da escola, preservando o cabeçalho original. */
export async function mergeExamIntoDocxTemplate(
  templateAb: ArrayBuffer,
  exam: ExamModel,
  catalog: CatalogImage[],
  resolveB64: (imageId: string, img?: CatalogImage) => Promise<string>,
  options: {
    fillFields?: (xml: string) => string;
    gabXml?: string;
  } = {},
): Promise<Blob> {
  const zip = await getJSZip().loadAsync(templateAb);
  const docPath = 'word/document.xml';
  const relsPath = 'word/_rels/document.xml.rels';
  const ctPath = '[Content_Types].xml';

  const docFile = zip.file(docPath);
  if (!docFile) throw new Error('Modelo Word inválido (sem document.xml).');

  let xml = await docFile.async('string');
  if (options.fillFields) xml = options.fillFields(xml);

  let relsXml = (await zip.file(relsPath)?.async('string')) || '';
  let ctXml = (await zip.file(ctPath)?.async('string')) || '';

  let relNum = maxRelNum(relsXml);
  let mediaIdx = nextMediaIndex(zip);
  let docPrId = maxDocPrId(xml);

  const parts: string[] = [];

  for (const q of exam.questions) {
    const stmt = q.statement.join(' ').trim();
    if (!stmt && !q.imageId) continue;

    if (q.imageId) {
      const imgBytes = await resolveImageBytesForExport(q.imageId, catalog, resolveB64);
      if (imgBytes?.data?.length) {
        const ext = imgBytes.type === 'png' ? 'png' : 'jpeg';
        const mediaName = `image${mediaIdx++}.${ext}`;
        zip.file(`word/media/${mediaName}`, imgBytes.data);
        ctXml = ensureContentType(ctXml, ext === 'png' ? 'png' : 'jpeg');
        relNum += 1;
        const rid = `rId${relNum}`;
        relsXml = addImageRelationship(relsXml, rid, mediaName);
        const cy =
          imgBytes.h && imgBytes.w
            ? Math.round(MAX_IMG_CX * (imgBytes.h / imgBytes.w))
            : 1428750;
        docPrId += 1;
        parts.push(buildImagePara(rid, MAX_IMG_CX, cy, docPrId));
      }
    }

    if (stmt) {
      parts.push(
        buildTextPara(`${q.number}. ${stmt}`, {
          bold: true,
          before: q.imageId ? 0 : 200,
          after: 60,
        }),
      );
    }

    for (const a of q.alternatives) {
      parts.push(buildTextPara(`${a.letter}) ${a.text}`, { after: 40, indent: 255 }));
    }

    const lines = q.answerLines || 0;
    for (let i = 0; i < lines; i++) {
      parts.push(buildTextPara('______________________________________________', { after: 80 }));
    }
  }

  let qXml = parts.join('');
  if (options.gabXml) qXml += options.gabXml;

  const si = xml.lastIndexOf('<w:sectPr');
  xml = si !== -1 ? xml.slice(0, si) + qXml + xml.slice(si) : xml.replace('</w:body>', qXml + '</w:body>');

  zip.file(docPath, xml);
  zip.file(relsPath, relsXml);
  if (ctXml) zip.file(ctPath, ctXml);

  return zip.generateAsync({ type: 'blob', mimeType: DOCX_MIME });
}
