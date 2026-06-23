import type { LucideIcon } from 'lucide-react';
import {
  BookOpen,
  ClipboardList,
  FileText,
  FolderOpen,
  GitBranch,
  GraduationCap,
  History,
  Home,
  Image,
  Layers,
  LayoutGrid,
  Loader2,
  PenLine,
  Sparkles,
  Star,
  Upload,
  Wand2,
  Zap,
} from 'lucide-react';

export const ICON_SIZE = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 28,
} as const;

export type IconName =
  | 'home'
  | 'builder'
  | 'material'
  | 'midias'
  | 'exercicios'
  | 'inteligente'
  | 'history'
  | 'fluxos'
  | 'config'
  | 'source'
  | 'header'
  | 'media'
  | 'output'
  | 'prova'
  | 'atividade'
  | 'avaliacao'
  | 'leitura'
  | 'visual'
  | 'upload'
  | 'sparkles'
  | 'star';

const MAP: Record<IconName, LucideIcon> = {
  home: Home,
  builder: Layers,
  material: BookOpen,
  midias: Image,
  exercicios: ClipboardList,
  inteligente: Zap,
  history: History,
  fluxos: GitBranch,
  config: FileText,
  source: FolderOpen,
  header: GraduationCap,
  media: Wand2,
  output: Sparkles,
  prova: FileText,
  atividade: PenLine,
  avaliacao: LayoutGrid,
  leitura: BookOpen,
  visual: Image,
  upload: Upload,
  sparkles: Sparkles,
  star: Star,
};

export function PfIcon({
  name,
  size = ICON_SIZE.md,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  const Icon = MAP[name];
  return <Icon size={size} className={className} aria-hidden />;
}

export { Loader2 };
