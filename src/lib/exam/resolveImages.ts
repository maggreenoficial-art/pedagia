import type { CatalogImage, ExamModel, ImageAssetRef } from './types';

export function cleanB64(b64: string): string {
  return String(b64 || '').replace(/^data:image\/\w+;base64,/, '');
}

export function imgB64Type(b64: string): 'png' | 'jpg' {
  const s = String(b64 || '');
  if (s.startsWith('iVBOR')) return 'png';
  if (s.startsWith('/9j/')) return 'jpg';
  return 'jpg';
}

export function b64ToUint8(b64: string): Uint8Array {
  const bin = atob(cleanB64(b64));
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

export function getImageB64(img?: CatalogImage | ImageAssetRef | null): string {
  if (!img) return '';
  const raw = (img as CatalogImage).base64;
  if (raw) return cleanB64(raw);
  const uri =
    (img as CatalogImage).dataUri ||
    img.previewUrl ||
    (img as CatalogImage).dataUrl ||
    '';
  return uri.includes(',') ? uri.split(',')[1] : '';
}

export async function fetchUrlToB64(url: string): Promise<string> {
  if (!url) return '';
  if (url.startsWith('data:')) return cleanB64(url);
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const blob = await resp.blob();
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(cleanB64(String(fr.result)));
    fr.onerror = () => reject(fr.error || new Error('Falha ao ler imagem'));
    fr.readAsDataURL(blob);
  });
}

export type ImageResolver = (imageId: string, ref?: ImageAssetRef) => Promise<string>;

/** Resolve todas as imagens do ExamModel via callback (PedagiaCloud / storage) */
/** Garante data URI no catálogo para HTML/PDF/DOCX (evita CORS em URLs assinadas). */
export function embedCatalogDataUris(catalog: CatalogImage[]): void {
  for (const img of catalog) {
    const b64 = getImageB64(img);
    if (!b64) continue;
    const uri = imgDataUriFromB64(b64);
    img.base64 = cleanB64(b64);
    img.dataUri = uri;
    img.previewUrl = uri;
    img.dataUrl = uri;
  }
}

export async function resolveExamModelImages(
  exam: ExamModel,
  catalog: CatalogImage[],
  resolveB64: (imageId: string, img?: CatalogImage) => Promise<string>,
): Promise<void> {
  for (const q of exam.questions) {
    if (!q.imageId) continue;
    const ci = catalog.findIndex((c) => c.imageId === q.imageId);
    const cat = ci >= 0 ? catalog[ci] : undefined;
    const merged = { ...cat, ...q.image, imageId: q.imageId } as CatalogImage;
    let b64 = getImageB64(merged);
    if (!b64) b64 = await resolveB64(q.imageId, merged);
    if (!b64) continue;

    const clean = cleanB64(b64);
    const uri = imgDataUriFromB64(clean);
    merged.base64 = clean;
    merged.dataUri = uri;
    merged.previewUrl = uri;
    merged.dataUrl = uri;

    if (ci >= 0) {
      catalog[ci] = { ...catalog[ci], ...merged };
    }
    q.image = {
      imageId: q.imageId,
      storagePath: merged.storagePath,
      previewUrl: uri,
      w: merged.w,
      h: merged.h,
      type: merged.type,
      description: merged.description,
      usefulnessScore: merged.usefulnessScore,
      recommendedForQuestion: merged.recommendedForQuestion,
      isFullPage: merged.isFullPage,
    };
  }
  embedCatalogDataUris(catalog);
}

export async function resolveImageBytesForExport(
  imageId: string,
  catalog: CatalogImage[],
  resolveB64: (imageId: string, img?: CatalogImage) => Promise<string>,
): Promise<{ data: Uint8Array; type: 'png' | 'jpg'; w?: number; h?: number } | null> {
  const img = catalog.find((c) => c.imageId === imageId);
  if (!img) return null;
  let b64 = getImageB64(img);
  if (!b64) b64 = await resolveB64(imageId, img);
  if (!b64) return null;
  const clean = cleanB64(b64);
  const bytes = b64ToUint8(clean);
  return {
    data: bytes,
    type: imgB64Type(clean),
    w: img.w,
    h: img.h,
  };
}

export function imgDataUriFromB64(b64: string): string {
  const clean = cleanB64(b64);
  if (!clean) return '';
  const mime = imgB64Type(clean) === 'png' ? 'image/png' : 'image/jpeg';
  return `data:${mime};base64,${clean}`;
}

export function getImageSrcForRender(
  imageId: string,
  catalog: CatalogImage[],
): string {
  const img = catalog.find((c) => c.imageId === imageId);
  if (!img) return '';
  const b64 = getImageB64(img);
  if (b64) return imgDataUriFromB64(b64);
  const url = img.previewUrl || img.dataUri || img.dataUrl || '';
  if (url.startsWith('http') || url.startsWith('data:')) return url;
  return '';
}
