import fs from 'fs';
import { execSync } from 'child_process';

const docxPath = process.argv[2];
const pdfPath = process.argv[3];

function analyzeDocx(p) {
  if (!fs.existsSync(p)) return { error: 'docx not found', path: p };
  const buf = fs.readFileSync(p);
  const xml = execSync(
    `powershell -NoProfile -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; $z=[IO.Compression.ZipFile]::OpenRead('${p.replace(/'/g, "''")}'); $e=$z.GetEntry('word/document.xml'); $r=New-Object IO.StreamReader($e.Open()); $t=$r.ReadToEnd(); $r.Close(); $z.Dispose(); $t"`,
    { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
  );
  const rels = execSync(
    `powershell -NoProfile -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; $z=[IO.Compression.ZipFile]::OpenRead('${p.replace(/'/g, "''")}'); $e=$z.GetEntry('word/_rels/document.xml.rels'); $r=New-Object IO.StreamReader($e.Open()); $t=$r.ReadToEnd(); $r.Close(); $z.Dispose(); $t"`,
    { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 },
  );
  const media = (rels.match(/Target="media\/[^"]+"/g) || []).map((m) => m.replace('Target="', '').replace('"', ''));
  return {
    path: p,
    size: buf.length,
    drawings: (xml.match(/<w:drawing/g) || []).length,
    mediaFiles: media,
    hasImage1: xml.includes('image1'),
    textLen: xml.replace(/<[^>]+>/g, '').length,
  };
}

function analyzePdf(p) {
  if (!fs.existsSync(p)) return { error: 'pdf not found', path: p };
  const buf = fs.readFileSync(p);
  const str = buf.toString('latin1');
  return {
    path: p,
    size: buf.length,
    embeddedImages: (str.match(/\/Subtype\s*\/Image/g) || []).length,
    jpeg: str.includes('/DCTDecode'),
    pages: (str.match(/\/Type\s*\/Page[^s]/g) || []).length,
  };
}

console.log(JSON.stringify({ docx: analyzeDocx(docxPath), pdf: analyzePdf(pdfPath) }, null, 2));
