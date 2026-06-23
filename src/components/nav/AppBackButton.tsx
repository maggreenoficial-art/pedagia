'use client';

export function AppBackButton({
  label = 'Início',
  className = '',
}: {
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`app-back-btn ${className}`.trim()}
      onClick={() => window.goTo?.('home')}
      aria-label="Voltar ao início"
    >
      <span aria-hidden>←</span>
      <span className="app-back-btn-label">{label}</span>
    </button>
  );
}

declare global {
  interface Window {
    goTo?: (view: string) => void;
  }
}
