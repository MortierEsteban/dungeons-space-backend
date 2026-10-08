import { useEffect, useId, useRef, type ButtonHTMLAttributes, type CSSProperties, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import s from './ui.module.css';

export const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(' ');

// ───────────────────────────── Boutons ─────────────────────────────

type Variant = 'primary' | 'secondary' | 'ghost' | 'damage' | 'heal' | 'link' | 'danger';

export function Button({
  variant = 'secondary',
  size,
  block,
  className,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'lg'; block?: boolean }) {
  return <button type={type} className={cx(s.btn, s[variant], size && s[size], block && s.block, className)} {...rest} />;
}

export function IconButton({ label, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button type="button" aria-label={label} title={label} className={cx(s.iconBtn, className)} {...rest} />;
}

// ───────────────────────────── Panneaux ─────────────────────────────

export function Panel({ className, pad = true, ...rest }: HTMLAttributes<HTMLDivElement> & { pad?: boolean }) {
  return <div className={cx(s.panel, pad && s.panelPad, className)} {...rest} />;
}

export function PanelTitle({ children, actions, as: As = 'h2' }: { children: ReactNode; actions?: ReactNode; as?: 'h2' | 'h3' }) {
  return (
    <div className={s.panelTitle}>
      <As className="ds-h3">{children}</As>
      {actions}
    </div>
  );
}

export function Inset({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx(s.inset, className)} {...rest} />;
}

// ───────────────────────────── Puces ─────────────────────────────

export function Chip({
  active,
  square,
  color,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; square?: boolean; color?: string }) {
  return (
    <button type="button" aria-pressed={active} className={cx(s.chip, square && s.chipSquare, active && s.chipActive, className)} {...rest}>
      {color && <span className={s.chipDot} style={{ background: color }} />}
      {children}
    </button>
  );
}

export function Tag({ children, color, style }: { children: ReactNode; color?: string; style?: CSSProperties }) {
  return (
    <span className={s.chip} style={{ minHeight: 0, padding: '3px 10px', fontSize: 10, ...(color ? { color, borderColor: color } : {}), ...style }}>
      {children}
    </span>
  );
}

// ───────────────────────────── Formulaires ─────────────────────────────

export function Field({ label, error, children, htmlFor, className }: { label: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string; className?: string }) {
  return (
    <div className={cx(s.field, className)}>
      <label className="ds-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error && (
        <span className={s.fieldError} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(s.input, className)} {...rest} />;
}

export function TextArea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(s.input, className)} {...rest} />;
}

export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx(s.input, className)} {...rest} />;
}

export function Toggle({ checked, onChange, children, disabled }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled} className={cx(s.toggle, checked && s.toggleOn)} onClick={() => onChange(!checked)}>
      <span className={s.track}>
        <span className={s.knob} />
      </span>
      <span>{children}</span>
    </button>
  );
}

export function Stepper({ value, onChange, step = 1, min = 0, max = Number.MAX_SAFE_INTEGER, format, label }: { value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; format?: (v: number) => string; label: string }) {
  const clamp = (v: number) => Math.max(min, Math.min(max, Math.round(v * 100) / 100));
  return (
    <div className={s.stepper}>
      <button type="button" aria-label={`${label} : diminuer`} onClick={() => onChange(clamp(value - step))}>
        −
      </button>
      <input aria-label={label} value={format ? format(value) : value} onChange={(e) => {
        const n = Number(e.target.value.replace(',', '.').replace(/[^\d.-]/g, ''));
        if (!Number.isNaN(n)) onChange(clamp(n));
      }} />
      <button type="button" aria-label={`${label} : augmenter`} onClick={() => onChange(clamp(value + step))}>
        +
      </button>
    </div>
  );
}

// ───────────────────────────── Ornements ─────────────────────────────

export function Rule({ className }: { className?: string }) {
  return (
    <div className={cx(s.rule, className)} aria-hidden>
      <span className={s.ruleLine} />
      <span className={s.diamond} />
      <span className={s.ruleLine} />
    </div>
  );
}

/** Le Losange : signature de la marque (favicon, chargement, séparateurs). */
export function Rune({ size = 18, glow = true }: { size?: number; glow?: boolean }) {
  return (
    <span className={s.rune} style={{ width: size, height: size, boxShadow: glow ? undefined : 'none' }} aria-hidden>
      <span className={s.runeCore} style={{ width: size / 3, height: size / 3 }} />
    </span>
  );
}

export function Diamond({ color = 'var(--gold)', size = 6 }: { color?: string; size?: number }) {
  return <span className={s.diamond} style={{ background: color, width: size, height: size }} aria-hidden />;
}

export function Bar({ value, max, color, label, className }: { value: number; max: number; color?: string; label?: string; className?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const fill = color ?? (pct < 34 ? 'var(--magenta)' : 'var(--arcane)');
  return (
    <div className={cx(s.bar, className)} role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
      <div className={s.barFill} style={{ width: `${pct}%`, background: fill }} />
    </div>
  );
}

export function Stat({ label, value, accent, overridden, onClick, title }: { label: string; value: ReactNode; accent?: boolean; overridden?: boolean; onClick?: () => void; title?: string }) {
  const className = cx(s.stat, accent && s.statAccent, overridden && s.override);
  const content = (
    <>
      <span className={s.statLabel}>{label}</span>
      <span className={s.statValue}>{value}</span>
    </>
  );
  return onClick ? (
    <button type="button" className={className} onClick={onClick} title={title}>
      {content}
    </button>
  ) : (
    <div className={className} title={overridden ? 'Valeur forcée' : title}>
      {content}
    </div>
  );
}

export function Portrait({ src, name, height = 220, className }: { src?: string | null; name: string; height?: number | string; className?: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return (
    <div className={cx(s.portrait, src && s.portraitFilled, className)} style={{ height }}>
      {src ? <img src={src} alt={`Portrait de ${name}`} loading="lazy" /> : <span className={s.monogram} style={{ fontSize: typeof height === 'number' ? height / 3.5 : 48 }}>{initials || '?'}</span>}
    </div>
  );
}

// ───────────────────────────── Onglets ─────────────────────────────

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className={s.segmented} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({ value, tabs, onChange, label }: { value: T; tabs: { value: T; label: string; count?: number }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className={s.tabs} role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button key={t.value} type="button" role="tab" aria-selected={t.value === value} className={s.tab} onClick={() => onChange(t.value)}>
          {t.label}
          {t.count !== undefined && <span className={s.count}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ───────────────────────────── Modale ─────────────────────────────

export function Modal({ open, onClose, title, children, width = 560 }: { open: boolean; onClose: () => void; title: string; children: ReactNode; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      previous?.focus();
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className={s.backdrop} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={s.modal} style={{ maxWidth: width }} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <IconButton label="Fermer" className={s.modalClose} onClick={onClose}>
          ×
        </IconButton>
        <h2 id={titleId} className="ds-h2" style={{ marginBottom: 18, paddingRight: 40 }}>
          {title}
        </h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}

// ───────────────────────────── États ─────────────────────────────

export function Loading({ label = 'Les dés roulent…' }: { label?: string }) {
  return (
    <div className={s.centered} role="status">
      <span className={s.spinner}>
        <span className={s.spinnerGem} />
        {label}
      </span>
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className={s.empty}>
      <Rune size={16} />
      <strong>{title}</strong>
      {children && <span className="ds-help">{children}</span>}
      {action}
    </div>
  );
}

export const uiStyles = s;
