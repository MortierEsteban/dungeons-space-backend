import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router';
import { errorMessage } from '../../shared/api/client';
import { useT } from '../../shared/i18n/i18n';
import { Button, Field, Input, Rune } from '../../shared/ui/components';
import { useLogin, useMe, useRegister } from './api';
import s from './login.module.css';

/** Comptes de démonstration (voir apps/api/src/seed.ts) — proposés en développement uniquement. */
const DEMO = import.meta.env.DEV
  ? [
      { label: 'MJ démo', email: 'mj@dungeonspace.demo', password: 'valombre-mj' },
      { label: 'Joueuse démo', email: 'lyra@dungeonspace.demo', password: 'valombre-joueur' },
    ]
  : [];

export function LoginPage() {
  const t = useT();
  const { data: me } = useMe();
  const location = useLocation();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [preference, setPreference] = useState<'play' | 'lead'>('play');
  const login = useLogin();
  const register = useRegister();
  const pending = login.isPending || register.isPending;
  const error = login.error ?? register.error;

  if (me) return <Navigate to={(location.state as { from?: string } | null)?.from ?? '/'} replace />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (mode === 'login') login.mutate({ email, password });
    else register.mutate({ displayName, email, password, preference });
  };

  return (
    <main className={s.screen}>
      <div className={s.backdrop} aria-hidden />
      <div className={s.veil} aria-hidden />
      <form className={s.card} onSubmit={submit} noValidate>
        <div className={s.brand}>
          <Rune size={18} />
          <h1 className={`ds-display ${s.logo}`}>DungeonSpace</h1>
          <div className={s.tagline}>{t('tagline')}</div>
        </div>
        <div className={s.switch} role="tablist" aria-label="Mode d'accès">
          <button type="button" role="tab" aria-selected={mode === 'login'} onClick={() => setMode('login')}>
            {t('auth.login')}
          </button>
          <button type="button" role="tab" aria-selected={mode === 'signup'} onClick={() => setMode('signup')}>
            {t('auth.signup')}
          </button>
        </div>
        {mode === 'signup' && (
          <Field label={t('auth.name')} htmlFor="displayName">
            <Input id="displayName" autoComplete="nickname" placeholder="Elowen" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
          </Field>
        )}
        <Field label={t('auth.email')} htmlFor="email">
          <Input id="email" type="email" autoComplete="email" placeholder="vous@royaume.fr" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label={t('auth.password')} htmlFor="password">
          <Input
            id="password"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={mode === 'signup' ? 8 : undefined}
          />
        </Field>
        {mode === 'signup' && (
          <div className="ds-stack" style={{ gap: 8 }}>
            <span className="ds-label">{t('auth.preference')}</span>
            <div className={s.prefs}>
              <Button variant={preference === 'play' ? 'secondary' : 'ghost'} aria-pressed={preference === 'play'} onClick={() => setPreference('play')}>
                {t('auth.play')}
              </Button>
              <Button variant={preference === 'lead' ? 'secondary' : 'ghost'} aria-pressed={preference === 'lead'} onClick={() => setPreference('lead')}>
                {t('auth.lead')}
              </Button>
            </div>
          </div>
        )}
        {error && (
          <p className={s.error} role="alert">
            {errorMessage(error)}
          </p>
        )}
        <Button type="submit" variant="primary" size="lg" block disabled={pending}>
          {pending ? 'Les dés roulent…' : mode === 'login' ? t('auth.loginCta') : t('auth.signupCta')}
        </Button>
        {DEMO.length > 0 && mode === 'login' && (
          <div className={s.demo}>
            <span className="ds-help">Démo locale :</span>
            {DEMO.map((d) => (
              <Button
                key={d.email}
                variant="link"
                onClick={() => {
                  setEmail(d.email);
                  setPassword(d.password);
                }}
              >
                {d.label}
              </Button>
            ))}
          </div>
        )}
      </form>
    </main>
  );
}
