import { useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { AppShell } from '../../app/AppShell';
import { UserMenu } from '../../app/UserMenu';
import { sessionWhen } from '../../shared/format';
import { useMediaQuery } from '../../shared/hooks';
import { Button, Panel, Rule, Rune } from '../../shared/ui/components';
import { useLogout, useMe, useUpdateProfile } from '../auth/api';
import { useCurrentCampaign } from '../campaigns/CampaignContext';
import { CampaignSwitcher } from '../campaigns/CampaignSwitcher';
import { useEncounters } from '../combat/api';
import s from './home.module.css';

/** Bandeau « prochaine session » : rejoint le combat en cours, sinon la Chronique. */
function useNextSession() {
  const { current, campaignId } = useCurrentCampaign();
  const { data: encounters = [] } = useEncounters(campaignId);
  const active = encounters.find((e) => e.status === 'active');
  const when = current?.nextSessionAt ? sessionWhen(current.nextSessionAt) : current ? `SESSION ${current.sessionCount}` : null;
  return {
    current,
    label: current ? `${when} · ${active ? active.name : current.name}` : null,
    to: active ? `/combat/${active.id}` : '/explorer',
  };
}

const SIDE = [
  { label: 'Accueil', icon: 'accueil', top: '19.434%', to: '/' },
  { label: 'Explorer', icon: 'explorer', top: '32.129%', to: '/explorer' },
  { label: 'Combattre', icon: 'combattre', top: '44.336%', to: '/combat' },
  { label: 'Sanctuaire', icon: 'sanctuaire', top: '56.543%', to: '/sanctuaire' },
  { label: 'Mon profil', icon: 'profil', top: '68.750%', to: '/personnage' },
];

const TILES = [
  { id: 'gen', label: 'Génération', src: '/assets/ui/tile2-generation.webp', l: '27.276%', t: '44.423%', w: '15.891%', h: '15.450%', to: '/generation' },
  { id: 'war', label: 'Guerre', src: '/assets/ui/tile2-guerre.webp', l: '43.661%', t: '44.577%', w: '16.453%', h: '15.143%', to: '/combat' },
  { id: 'comp', label: 'Informations Sanctuaires', src: '/assets/ui/tile2-sanctuaires.webp', l: '60.854%', t: '45.545%', w: '16.313%', h: '13.206%', to: '/sanctuaire' },
];

/** Lucioles, brumes et runes animées (purement décoratives). */
function Ambient() {
  const fireflies = useMemo(
    () =>
      Array.from({ length: 55 }, (_, i) => {
        const r = (a: number, b: number) => a + Math.random() * (b - a);
        return { i, blue: Math.random() < 0.25, size: r(2, 5), left: r(2, 98), top: r(30, 98), dx: r(-60, 60), dy: r(-50, 30), fly: r(6, 14), delay: r(0, 14), blink: r(2.5, 6), blinkDelay: r(0, 6) };
      }),
    [],
  );
  const runes = [[767, 178, 90], [1063, 700, 120], [1418, 655, 130], [1425, 760, 120], [990, 812, 70], [1400, 840, 80]] as const;
  return (
    <div className={s.ambient} aria-hidden>
      <div className={s.fog1} />
      <div className={s.fog2} />
      {runes.map(([x, y, size], i) => (
        <div key={i} className={s.runeGlow} style={{ left: `${x / 15.36}%`, top: `${y / 10.24}%`, width: `${size / 15.36}%`, animationDuration: `${3 + (i % 3)}s`, animationDelay: `${-i}s` }} />
      ))}
      <div className={s.horse} />
      {fireflies.map((f) => (
        <div key={f.i} className={s.fly} style={{ left: `${f.left}%`, top: `${f.top}%`, '--dx': `${f.dx}px`, '--dy': `${f.dy}px`, animationDuration: `${f.fly}s`, animationDelay: `${-f.delay}s` } as CSSProperties}>
          <div className={f.blue ? s.flyBlue : s.flyGold} style={{ width: f.size, height: f.size, animationDuration: `${f.blink}s`, animationDelay: `${-f.blinkDelay}s` }} />
        </div>
      ))}
    </div>
  );
}

function ImmersiveHome({ onClassic }: { onClassic: () => void }) {
  const navigate = useNavigate();
  const logout = useLogout();
  const { data: me } = useMe();
  const next = useNextSession();
  const [px, setPx] = useState({ x: 0, y: 0 });
  const [tilt, setTilt] = useState<{ id: string; rx: number; ry: number; mx: number; my: number } | null>(null);
  const raf = useRef<number | null>(null);

  const onMove = (e: MouseEvent<HTMLElement>) => {
    if (raf.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 2 - 1;
    const y = ((e.clientY - r.top) / r.height) * 2 - 1;
    raf.current = requestAnimationFrame(() => {
      raf.current = null;
      setPx({ x, y });
    });
  };

  return (
    <section className={s.immersive} onMouseMove={onMove} aria-label="Accueil">
      <div className={s.blurBg} aria-hidden />
      <div className={s.stage}>
        <div className={s.layer} style={{ transform: `scale(1.02) translate(${-px.x * 6}px, ${-px.y * 4}px)` }}>
          <img className={s.art} src="/assets/accueil.webp" srcSet="/assets/accueil-960.webp 960w, /assets/accueil.webp 1920w" sizes="min(100vw, 150vh)" alt="DungeonSpace — forêt enchantée, cheval astral et pierres runiques" />
          <div className={s.sideMask} aria-hidden />
          <nav className={s.sideNav} aria-label="Navigation principale">
            {SIDE.map((b) => (
              <Link key={b.label} to={b.to} className={b.to === '/' ? s.sideOn : s.side} style={{ top: b.top }}>
                <img src={`/assets/ui/ico2-${b.icon}.webp`} alt="" />
                <span>{b.label}</span>
              </Link>
            ))}
          </nav>
          {TILES.map((t) => {
            const on = tilt?.id === t.id;
            return (
              <div key={t.id} className={s.tileWrap} style={{ left: t.l, top: t.t, width: t.w, height: t.h }}>
                <div className={s.tileSocket} style={{ opacity: on ? 0.9 : 0 }} />
                <button
                  type="button"
                  className={s.tile}
                  aria-label={t.label}
                  onClick={() => navigate(t.to)}
                  onMouseMove={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    const x = (e.clientX - r.left) / r.width;
                    const y = (e.clientY - r.top) / r.height;
                    setTilt({ id: t.id, rx: (0.5 - y) * 16, ry: (x - 0.5) * 20, mx: x * 100, my: y * 100 });
                  }}
                  onMouseLeave={() => setTilt(null)}
                  style={{
                    transform: on ? `translateY(-8px) translateZ(30px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg) scale(1.07)` : 'none',
                    transition: on ? 'transform .08s linear, filter .3s' : 'transform .5s cubic-bezier(.2,.8,.2,1), filter .3s',
                    filter: on ? 'brightness(1.15) drop-shadow(0 0 14px rgba(79,179,255,.55)) drop-shadow(0 22px 22px rgba(0,0,0,.7))' : 'drop-shadow(0 8px 14px rgba(0,0,0,.5))',
                  }}
                >
                  <img src={t.src} alt="" />
                  <span
                    className={s.sheen}
                    style={{
                      background: on ? `radial-gradient(circle at ${tilt.mx}% ${tilt.my}%, rgba(180,220,255,.3), transparent 55%)` : 'transparent',
                      maskImage: `url(${t.src})`,
                      WebkitMaskImage: `url(${t.src})`,
                    }}
                  />
                </button>
              </div>
            );
          })}
          <button type="button" className={s.hotspotRound} style={{ left: '95.44%', top: '82.62%' }} aria-label="Paramètres — accueil classique" title="Accueil classique" onClick={onClassic} />
          <button type="button" className={s.hotspotRound} style={{ left: '95.44%', top: '86.52%' }} aria-label="Déconnexion" title="Déconnexion" onClick={() => logout.mutate(undefined, { onSettled: () => navigate('/connexion') })} />
          <button type="button" className={s.hotspot} style={{ left: '41.67%', width: '4.95%' }} aria-label="À propos" onClick={() => navigate('/credits')} />
          <button type="button" className={s.hotspot} style={{ left: '47.92%', width: '3.91%' }} aria-label="Règles" onClick={() => navigate('/sanctuaire')} />
          <button type="button" className={s.hotspot} style={{ left: '53.13%', width: '4.95%' }} aria-label="Contact" onClick={() => navigate('/credits')} />
        </div>
        <div className={s.layer} style={{ transform: `translate(${-px.x * 22}px, ${-px.y * 14}px)`, pointerEvents: 'none' }}>
          <Ambient />
        </div>
        <div className={s.vignette} aria-hidden />
        {next.label && (
          <button type="button" className={s.nextSession} onClick={() => navigate(next.to)}>
            <span className={s.liveDot} />
            <span className={s.nextText}>{next.label}</span>
            <span className={s.nextCta}>Rejoindre →</span>
          </button>
        )}
      </div>
      <div className={s.corner}>
        <CampaignSwitcher />
        {me && <UserMenu user={me} />}
      </div>
    </section>
  );
}

function ClassicHome({ onImmersive, canImmersive }: { onImmersive: () => void; canImmersive: boolean }) {
  const navigate = useNavigate();
  const next = useNextSession();
  const cards = [
    { label: 'Génération', sub: 'Héros, PNJ, trésors', to: '/generation' },
    { label: 'Guerre', sub: 'Initiative & combats', to: '/combat' },
    { label: 'Informations Sanctuaires', sub: 'Compendium des règles', to: '/sanctuaire' },
  ];
  return (
    <section className={s.classic}>
      <div className={s.classicBg} aria-hidden />
      <div className={s.classicFrame} aria-hidden />
      <div className={s.hero}>
        <div className={s.heroRule}>
          <span />
          <Rune size={22} />
          <span />
        </div>
        <h1 className={`ds-display ${s.heroTitle}`}>DungeonSpace</h1>
        <div className={s.heroTagline}>Explore · Battle · Create</div>
      </div>
      <div className={s.cards}>
        {cards.map((c) => (
          <button key={c.label} type="button" className={s.card} onClick={() => navigate(c.to)}>
            <span className={s.cardGem}>
              <span />
            </span>
            <span className={s.cardLabel}>{c.label}</span>
            <span className="ds-help">{c.sub}</span>
          </button>
        ))}
      </div>
      {next.label ? (
        <Panel className={s.sessionBar} pad={false}>
          <span className={s.liveDot} />
          <div className="ds-grow">
            <div className="ds-label">Prochaine session</div>
            <div className={s.sessionName}>{next.label}</div>
          </div>
          <Button onClick={() => navigate(next.to)}>Rejoindre la table</Button>
        </Panel>
      ) : (
        <Panel className={s.sessionBar} pad={false}>
          <Rune size={14} />
          <div className="ds-grow">
            <div className="ds-label">Votre première table</div>
            <div className={s.sessionName}>Fondez une campagne ou rejoignez-en une depuis le sélecteur en haut de l’écran.</div>
          </div>
          <Button onClick={() => navigate('/explorer?vue=campagnes')}>Explorer</Button>
        </Panel>
      )}
      <Rule className={s.footRule} />
      <footer className={s.footer}>
        <Link to="/credits">À propos</Link>
        <Link to="/sanctuaire">Règles</Link>
        <Link to="/credits">Crédits</Link>
        {canImmersive && (
          <button type="button" onClick={onImmersive}>
            Vue immersive
          </button>
        )}
      </footer>
    </section>
  );
}

export default function HomePage() {
  const { data: me } = useMe();
  const update = useUpdateProfile();
  const wide = useMediaQuery('(min-width: 1024px) and (min-height: 560px)');
  const immersive = wide && me?.homeStyle !== 'classic';
  if (immersive) return <ImmersiveHome onClassic={() => update.mutate({ homeStyle: 'classic' })} />;
  return (
    <AppShell>
      <ClassicHome canImmersive={wide} onImmersive={() => update.mutate({ homeStyle: 'immersive' })} />
    </AppShell>
  );
}
