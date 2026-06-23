'use client';

import { useEffect, useRef } from 'react';
import { refreshLegacyUi } from '@/lib/legacy/bridge';

type LegacyUiScope = 'material' | 'header' | 'media' | 'output' | 'all';

type Props = {
  elementId: string;
  refreshScope?: LegacyUiScope;
  className?: string;
  onReady?: () => void;
};

/**
 * Teleporta um bloco DOM legado (bd-*) para dentro do modal Flow.
 * Ao fechar, devolve o elemento ao lugar original.
 */
export function LegacyEmbed({ elementId, refreshScope = 'all', className, onReady }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const movedRef = useRef<{ el: HTMLElement; placeholder: Comment } | null>(null);

  useEffect(() => {
    const el = document.getElementById(elementId);
    const host = hostRef.current;
    if (!el || !host || movedRef.current) return;

    const parent = el.parentNode;
    if (!parent) return;

    const placeholder = document.createComment(`flow-legacy-${elementId}`);
    parent.insertBefore(placeholder, el);
    host.appendChild(el);
    el.style.removeProperty('display');
    el.classList.add('flow-legacy-embedded');
    movedRef.current = { el, placeholder };

    refreshLegacyUi(refreshScope);
    onReady?.();

    return () => {
      const moved = movedRef.current;
      if (!moved) return;
      const { el: node, placeholder: ph } = moved;
      if (ph.parentNode && node.parentNode === host) {
        ph.parentNode.insertBefore(node, ph.nextSibling);
        ph.remove();
      }
      node.classList.remove('flow-legacy-embedded');
      movedRef.current = null;
    };
  }, [elementId, refreshScope, onReady]);

  return <div ref={hostRef} className={`flow-legacy-embed ${className ?? ''}`} data-legacy-id={elementId} />;
}
