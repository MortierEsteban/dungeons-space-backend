import type { RollResultDto } from '@ds/shared';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { errorMessage, http, qk } from '../api/client';
import { IconButton } from '../ui/components';
import s from './dice.module.css';

interface DiceView {
  label: string;
  notation: string;
  rolling: boolean;
  value: string;
  total: number | null;
  natural: number | null;
  error?: string;
  rot: number;
}

interface DiceApi {
  /** Jet autoritaire côté serveur, journalisé dans la Chronique de la campagne. */
  roll(campaignId: string, label: string, notation: string, opts?: { secret?: boolean; characterId?: string }): Promise<RollResultDto | null>;
  /** Affiche un résultat déjà calculé (ex. attaque résolue par le moteur de combat). */
  show(label: string, notation: string, total: number, natural?: number | null): void;
}

const DiceContext = createContext<DiceApi | null>(null);

export function DiceProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<DiceView | null>(null);
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);
  const hide = useRef<ReturnType<typeof setTimeout>>(undefined);
  const client = useQueryClient();

  useEffect(() => () => {
    clearInterval(timer.current);
    clearTimeout(hide.current);
  }, []);

  /** Animation : le dé tourne ~0,8 s puis affiche le résultat. */
  const animate = useCallback((label: string, notation: string, result: Promise<{ total: number; natural: number | null }>) => {
    clearInterval(timer.current);
    clearTimeout(hide.current);
    const sides = Number(/d(\d+)/.exec(notation)?.[1] ?? 20);
    setView({ label, notation, rolling: true, value: '?', total: null, natural: null, rot: 0 });
    const started = Date.now();
    timer.current = setInterval(() => {
      setView((v) => (v && v.rolling ? { ...v, value: String(1 + Math.floor(Math.random() * sides)), rot: v.rot + 53 } : v));
    }, 55);
    result
      .then(async (r) => {
        await new Promise((ok) => setTimeout(ok, Math.max(0, 780 - (Date.now() - started))));
        clearInterval(timer.current);
        setView((v) => v && { ...v, rolling: false, value: String(r.natural ?? r.total), total: r.total, natural: r.natural, rot: v.rot + 20 });
        hide.current = setTimeout(() => setView(null), 6000);
      })
      .catch((e) => {
        clearInterval(timer.current);
        setView((v) => v && { ...v, rolling: false, value: '—', error: errorMessage(e) });
      });
  }, []);

  const api: DiceApi = {
    roll: async (campaignId, label, notation, opts = {}) => {
      const p = http.post<RollResultDto>(`/campaigns/${campaignId}/rolls`, { notation, label, ...opts });
      animate(label, notation, p);
      try {
        const r = await p;
        void client.invalidateQueries({ queryKey: qk.events(campaignId) });
        return r;
      } catch {
        return null;
      }
    },
    show: (label, notation, total, natural = null) => animate(label, notation, Promise.resolve({ total, natural })),
  };

  const crit = view && !view.rolling && view.natural === 20 && /d20/.test(view.notation);
  const fumble = view && !view.rolling && view.natural === 1 && /d20/.test(view.notation);
  const color = !view || view.rolling ? 'var(--ash)' : crit ? 'var(--arcane-light)' : fumble ? 'var(--magenta-light)' : 'var(--text-strong)';
  const text = !view
    ? ''
    : view.rolling
      ? 'Les dés roulent…'
      : view.error
        ? view.error
        : crit
          ? `Critique ! Total ${view.total}`
          : fumble
            ? `Échec critique · ${view.total}`
            : `Total : ${view.total}`;

  return (
    <DiceContext.Provider value={api}>
      {children}
      {view && (
        <div className={s.tray} role="status" aria-live="polite">
          <IconButton label="Fermer le jet" className={s.close} onClick={() => setView(null)}>
            ×
          </IconButton>
          <div className="ds-label" style={{ textAlign: 'center' }}>
            {view.label}
          </div>
          <div className={s.die}>
            <div className={s.gem} style={{ transform: `rotate(${45 + view.rot}deg)` }} />
            <span className={s.value} style={{ color }}>
              {view.value}
            </span>
          </div>
          <div className={s.total}>{text}</div>
          <div className="ds-help">{view.notation}</div>
        </div>
      )}
    </DiceContext.Provider>
  );
}

export function useDice(): DiceApi {
  const ctx = useContext(DiceContext);
  if (!ctx) throw new Error('useDice hors DiceProvider');
  return ctx;
}
