/** Caminho canônico da logo Professor Flux (PNG real do brandbook). */
export const BRAND_LOGO_SRC = '/branding/professor-flux-logo.png';
export const BRAND_LOGO_FALLBACK = '/branding/professor-flux-logo.svg';

export function onBrandLogoError(e: { currentTarget: HTMLImageElement }) {
  const img = e.currentTarget;
  if (img.src.includes(BRAND_LOGO_FALLBACK)) return;
  img.src = BRAND_LOGO_FALLBACK;
}
