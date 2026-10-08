import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { cx } from './components';
import s from './ui.module.css';

type Tone = 'info' | 'success' | 'error';
interface ToastItem {
  id: number;
  text: string;
  tone: Tone;
}

const ToastContext = createContext<(text: string, tone?: Tone) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((text: string, tone: Tone = 'info') => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs.slice(-3), { id, text, tone }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), tone === 'error' ? 5000 : 2800);
  }, []);
  const value = useMemo(() => push, [push]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className={s.toasts} aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={cx(s.toast, t.tone === 'error' && s.toastError, t.tone === 'success' && s.toastSuccess)}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
