/**
 * Ponte Strangler Fig — Flow Builder React ⟷ runtime.js / PedagiaCore / window.*
 */

import type { ExamFields, LegacyFlowSnapshot } from '@/components/flow-builder/flow-types';

type LegacyUiScope = 'material' | 'header' | 'media' | 'output' | 'all';

type LegacyWindow = Window & {
  getLegacyFlowSnapshot?: () => LegacyFlowSnapshot;
  pushFlowStoreToLegacy?: (partial: { exam?: Partial<ExamFields> }) => void;
  refreshLegacyBuilderUi?: (scope?: LegacyUiScope) => void;
  builderConfirmPages?: () => Promise<void>;
  builderApplyPages?: () => Promise<void>;
  builderApplyPagesWithRange?: (from: string, to: string) => Promise<{ count: number; pages: number[] }>;
  builderOnMaterialChange?: (materialId: string) => Promise<void>;
  builderOnHeaderChange?: (id: string) => Promise<void>;
  builderLoadCropPages?: () => Promise<void>;
  builderSetPoolTab?: (tab: 'turma' | 'adaptada') => void;
  builderGerarQuestoes?: () => Promise<void>;
    builderMontarProva?: (variant: 'turma' | 'adaptada') => Promise<void>;
    builderSetInlineResult?: (enabled: boolean) => void;
  builderToggleFigureSelection?: (imageId: string) => void;
  builderSelectAllFigures?: () => void;
  builderClearFigureSelection?: () => void;
  builderFlowGenerateAndSaveImage?: (opts: {
    prompt: string;
    title?: string;
    category?: string;
    aspectRatio?: string;
  }) => Promise<{ imageId: string; previewUrl: string; title: string }>;
  builderFlowUploadPdf?: (file: File) => Promise<{
    materialId: string | null;
    fileName: string;
    totalPages: number;
  }>;
  builderFlowRefreshMaterials?: () => Promise<void>;
  builderFlowSaveManualHeader?: (opts: {
    name?: string;
    escola?: string;
    prof?: string;
  }) => Promise<{ activeHeaderId: string | null }>;
  saveBuilderManual?: () => Promise<{ ok: boolean; savedAt?: number; error?: string; cloud?: boolean }>;
  setFlowTitle?: (title: string) => void;
  resumeBuilderFlow?: (materialId: string | null) => Promise<{ ok: boolean }>;
  deleteMaterialFromLibrary?: (id: string) => Promise<void>;
  deleteHeaderFromLibrary?: (id: string) => Promise<void>;
  toast?: (msg: string, kind?: string, ms?: number) => void;
  PedagiaCore?: Record<string, unknown>;
};

function legacyWin(): LegacyWindow {
  return typeof window !== 'undefined' ? (window as LegacyWindow) : ({} as LegacyWindow);
}

export function isLegacyBooted(): boolean {
  return typeof legacyWin().getLegacyFlowSnapshot === 'function';
}

export function fetchLegacySnapshot(): LegacyFlowSnapshot | null {
  const fn = legacyWin().getLegacyFlowSnapshot;
  if (!fn) return null;
  try {
    return fn();
  } catch {
    return null;
  }
}

export function syncExamFieldsToLegacy(exam: ExamFields): void {
  legacyWin().pushFlowStoreToLegacy?.({ exam });
}

export function refreshLegacyUi(scope: LegacyUiScope = 'all'): void {
  legacyWin().refreshLegacyBuilderUi?.(scope);
}

export function legacySetPageInputs(from: string, to: string): void {
  const set = (id: string, val: string) => {
    const el = document.getElementById(id);
    if (el && 'value' in el) (el as HTMLInputElement).value = val;
  };
  set('bd-pag-from', from);
  set('bd-pag-to', to);
}

export async function legacyConfirmPages(): Promise<void> {
  const wasConfirmed = fetchLegacySnapshot()?.builderPagesConfirmed;
  await legacyWin().builderConfirmPages?.();
  const snap = fetchLegacySnapshot();
  if (!snap?.builderPagesConfirmed && !wasConfirmed) {
    throw new Error(
      snap?.selectedPages?.length
        ? 'Não foi possível confirmar. Aguarde o PDF carregar ou tente marcar as páginas de novo.'
        : 'Marque as páginas ou escreva o conteúdo antes de confirmar.',
    );
  }
}

export async function legacyApplyPages(): Promise<void> {
  await legacyWin().builderApplyPages?.();
}

export async function legacyApplyPagesRange(from: string, to: string): Promise<void> {
  const fn = legacyWin().builderApplyPagesWithRange;
  if (!fn) {
    legacySetPageInputs(from, to);
    await legacyApplyPages();
    const snap = fetchLegacySnapshot();
    if (!(snap?.selectedPages?.length ?? 0)) {
      throw new Error('Não foi possível marcar as páginas. Verifique o intervalo e o PDF selecionado.');
    }
    return;
  }
  await fn(from, to);
}

export async function legacyOnMaterialChange(materialId: string): Promise<void> {
  await legacyWin().builderOnMaterialChange?.(materialId);
}

export async function legacyOnHeaderChange(id: string): Promise<void> {
  await legacyWin().builderOnHeaderChange?.(id);
}

export async function legacyLoadCropPages(): Promise<void> {
  await legacyWin().builderLoadCropPages?.();
}

export async function legacySetPoolTab(tab: 'turma' | 'adaptada'): Promise<void> {
  legacyWin().builderSetPoolTab?.(tab);
}

export async function legacyGenerateQuestions(): Promise<void> {
  await legacyWin().builderGerarQuestoes?.();
}

export async function legacyMontarProva(variant: 'turma' | 'adaptada' = 'turma'): Promise<void> {
  await legacyWin().builderMontarProva?.(variant);
}

export function legacySetInlineResult(enabled: boolean): void {
  legacyWin().builderSetInlineResult?.(enabled);
}

export function legacyToggleFigureSelection(imageId: string): void {
  legacyWin().builderToggleFigureSelection?.(imageId);
}

export function legacySelectAllFigures(): void {
  legacyWin().builderSelectAllFigures?.();
}

export function legacyClearFigureSelection(): void {
  legacyWin().builderClearFigureSelection?.();
}

export async function legacyFlowGenerateImage(opts: {
  prompt: string;
  title?: string;
  category?: string;
  aspectRatio?: string;
}): Promise<{ imageId: string; previewUrl: string; title: string } | undefined> {
  return legacyWin().builderFlowGenerateAndSaveImage?.(opts);
}

export async function legacyUploadBookPdf(file: File) {
  return legacyWin().builderFlowUploadPdf?.(file);
}

export async function legacyRefreshMaterials(): Promise<void> {
  await legacyWin().builderFlowRefreshMaterials?.();
}

export async function legacyDeleteMaterial(id: string): Promise<void> {
  await legacyWin().deleteMaterialFromLibrary?.(id);
}

export async function legacyDeleteHeader(id: string): Promise<void> {
  await legacyWin().deleteHeaderFromLibrary?.(id);
}

export async function legacySaveManualHeader(opts: {
  name?: string;
  escola?: string;
  prof?: string;
}): Promise<{ activeHeaderId: string | null } | undefined> {
  return legacyWin().builderFlowSaveManualHeader?.(opts);
}

export function legacyToast(msg: string, kind: 'ok' | 'err' = 'ok'): void {
  legacyWin().toast?.(msg, kind);
}

export async function legacySaveBuilder(): Promise<{
  ok: boolean;
  savedAt?: number;
  error?: string;
  cloud?: boolean;
}> {
  const res = await legacyWin().saveBuilderManual?.();
  return res || { ok: false, error: 'Runtime não carregado' };
}

export function legacySetFlowTitle(title: string): void {
  legacyWin().setFlowTitle?.(title);
}

export async function legacyResumeBuilderFlow(materialId: string | null): Promise<void> {
  await legacyWin().resumeBuilderFlow?.(materialId);
}

export function getPedagiaCore(): Record<string, unknown> | undefined {
  return legacyWin().PedagiaCore;
}
