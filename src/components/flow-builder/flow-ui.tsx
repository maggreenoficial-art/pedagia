'use client';

/** Campos e botões com tipografia grande — pensado para professores. */

export function FlowField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="mb-5 block">
      <span className="flow-field-label mb-2 block">{label}</span>
      {children}
      {hint ? <span className="mt-2 block text-[15px] leading-snug text-white/45">{hint}</span> : null}
    </label>
  );
}

export const flowInputCls =
  'flow-input w-full rounded-xl border border-white/12 bg-[var(--flow-surface-2)] px-4 py-3 text-[17px] text-white outline-none transition-colors focus:border-[var(--flow-accent)] focus:ring-2 focus:ring-[var(--flow-accent)]/25';

export const flowTextareaCls = `${flowInputCls} min-h-[120px] resize-y leading-relaxed`;

export const flowSelectCls = flowInputCls;

export function FlowBtnPrimary({
  children,
  disabled,
  onClick,
  type = 'button',
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className="flow-btn flow-btn-primary w-full rounded-xl bg-[var(--flow-accent)] px-5 py-3.5 text-[17px] font-extrabold text-black transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
    >
      {children}
    </button>
  );
}

export function FlowBtnSecondary({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flow-btn flow-btn-secondary w-full rounded-xl border border-white/12 bg-[var(--flow-surface-2)] px-5 py-3.5 text-[16px] font-bold text-white transition-colors hover:border-[var(--flow-accent)]/35 hover:bg-[var(--flow-surface)] disabled:cursor-not-allowed disabled:opacity-45"
    >
      {children}
    </button>
  );
}

export function FlowBtnAccent({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flow-btn w-full rounded-xl border border-[var(--flow-accent)]/45 bg-[var(--flow-accent-soft)] px-5 py-3.5 text-[16px] font-extrabold text-[var(--flow-accent)] transition-colors hover:bg-[var(--flow-accent)]/20 disabled:cursor-not-allowed disabled:opacity-45"
    >
      {children}
    </button>
  );
}

export function FlowTabs({
  tabs,
  active,
  onChange,
  variant = 'pills',
}: {
  tabs: { id: string; label: React.ReactNode; accent?: boolean }[];
  active: string;
  onChange: (id: string) => void;
  variant?: 'pills' | 'segment';
}) {
  if (variant === 'segment') {
    return (
      <div className="flow-segment-tabs mb-6" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active === tab.id}
            onClick={() => onChange(tab.id)}
            className={`flow-segment-tab ${active === tab.id ? 'is-active' : ''} ${tab.accent ? 'is-accent' : ''}`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="mb-6 flex flex-wrap gap-2">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`rounded-full px-5 py-2.5 text-[15px] font-bold transition-colors ${
            active === tab.id
              ? 'bg-[var(--flow-accent)] text-black'
              : 'border border-white/12 bg-[var(--flow-surface-2)] text-white/70 hover:border-[var(--flow-accent)]/30'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
