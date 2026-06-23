'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BRAND_LOGO_FALLBACK, BRAND_LOGO_SRC } from '@/lib/brand';

declare global {
  interface Window {
    switchAuth?: (mode: 'login' | 'register') => void;
    doAuth?: () => void | Promise<void>;
  }
}

function isAuthVisible(): boolean {
  const el = document.getElementById('view-auth');
  if (!el) return false;
  return el.style.display !== 'none';
}

export function AuthHost({ enabled }: { enabled: boolean }) {
  const [show, setShow] = useState(false);
  const [mountEl, setMountEl] = useState<HTMLElement | null>(null);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const prepared = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const sync = () => {
      const visible = isAuthVisible();
      setShow(visible);
      const el = document.getElementById('view-auth');
      if (visible && el) {
        if (!prepared.current) {
          el.innerHTML = '';
          el.classList.add('pf-auth-react');
          prepared.current = true;
        }
        setMountEl(el);
      }
    };

    sync();
    window.addEventListener('pedagia:viewchange', sync);
    const target = document.getElementById('view-auth');
    const obs = target && new MutationObserver(sync);
    if (target && obs) obs.observe(target, { attributes: true, attributeFilter: ['style'] });

    return () => {
      window.removeEventListener('pedagia:viewchange', sync);
      obs?.disconnect();
    };
  }, [enabled]);

  const switchMode = (m: 'login' | 'register') => {
    setMode(m);
    setErr('');
    window.switchAuth?.(m);
  };

  const submit = async () => {
    setBusy(true);
    setErr('');
    try {
      await window.doAuth?.();
      const le = document.getElementById('auth-err');
      if (le && le.style.display !== 'none' && le.textContent) {
        setErr(le.textContent);
      }
    } finally {
      setBusy(false);
    }
  };

  if (!show || !mountEl) return null;

  return createPortal(
    <div className="auth-wrap pf-auth-page">
      <div className="auth-box">
        <div className="auth-logo auth-logo-img">
          <img
            src={BRAND_LOGO_SRC}
            alt="Professor Flux"
            width={200}
            height="auto"
            onError={(e) => {
              const img = e.target as HTMLImageElement;
              if (!img.src.includes(BRAND_LOGO_FALLBACK)) img.src = BRAND_LOGO_FALLBACK;
            }}
          />
        </div>
        <div className="auth-brand">
          <span className="brand-pro">Professor</span>{' '}
          <span className="brand-flux">Flux</span>
        </div>
        <div className="auth-tagline">O construtor de conhecimento com IA</div>
        <div className="auth-sub">Provas, atividades e materiais visuais para professores</div>

        <div className="auth-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            className={`auth-tab ${mode === 'login' ? 'on' : ''}`}
            onClick={() => switchMode('login')}
          >
            Entrar
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'register'}
            className={`auth-tab ${mode === 'register' ? 'on' : ''}`}
            onClick={() => switchMode('register')}
          >
            Criar conta
          </button>
        </div>

        {err ? (
          <div className="auth-err" role="alert">
            {err}
          </div>
        ) : (
          <div id="auth-err" className="auth-err" style={{ display: 'none' }} aria-hidden />
        )}

        <div className="field">
          <label className="fl" htmlFor="a-email">
            E-mail
          </label>
          <input
            type="email"
            id="a-email"
            autoComplete="email"
            placeholder="professor@escola.com.br"
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
          />
        </div>
        <div className="field">
          <label className="fl" htmlFor="a-pass">
            Senha
          </label>
          <input
            type="password"
            id="a-pass"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            placeholder="••••••••"
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
          />
        </div>
        <button type="button" className="auth-btn" id="auth-btn" disabled={busy} onClick={() => void submit()}>
          {busy ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Criar conta'}
        </button>
      </div>
    </div>,
    mountEl,
  );
}
