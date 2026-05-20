import { b64ToUint8, cleanB64, imgB64Type } from '../resolveImages';

export type HeaderImageBytes = {
  data: Uint8Array;
  type: 'png' | 'jpg';
  w: number;
  h: number;
};

export function headerDataUrlToBytes(dataUrl: string): HeaderImageBytes {
  const clean = cleanB64(dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl);
  const type = imgB64Type(clean) === 'png' ? 'png' : 'jpg';
  return {
    data: b64ToUint8(clean),
    type,
    w: 0,
    h: 0,
  };
}

export async function measureHeaderImage(bytes: HeaderImageBytes): Promise<HeaderImageBytes> {
  if (bytes.w > 0 && bytes.h > 0) return bytes;
  const mime = bytes.type === 'png' ? 'image/png' : 'image/jpeg';
  const blob = new Blob([bytes.data as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ ...bytes, w: img.naturalWidth || 800, h: img.naturalHeight || 200 });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Não foi possível ler o cabeçalho.'));
    };
    img.src = url;
  });
}

export async function prepareHeaderImageFromDataUrl(dataUrl: string): Promise<HeaderImageBytes> {
  const base = headerDataUrlToBytes(dataUrl);
  return measureHeaderImage(base);
}
