import { type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useLogout, useMe } from '../features/auth/api';
import { CampaignSwitcher } from '../features/campaigns/CampaignSwitcher';
import { useCurrentCampaign } from '../features/campaigns/CampaignContext';
import { RecordingBadge } from '../features/recording/RecordingBadge';
import { useT } from '../shared/i18n/i18n';
import { useSocketStatus } from '../shared/realtime/socket';
import { cx, Diamond } from '../shared/ui/components';
import { iconSrc, PRIMARY_NAV, SECONDARY_NAV, titleFor } from './navigation';
import { UserMenu } from './UserMenu';
import s from './shell.module.css';

function NavEntry({ to, icon, label, compact }: { to: string; icon: string; label: string; compact?: boolean }) {
  return (
    <NavLink to={to} end={to === '/'} className={({ isActive }) => cx(compact ? s.tab : s.navItem, isActive && s.active)}>
      <img src={iconSrc(icon)} alt="" className={s.navIcon} />
      <span>{label}</span>
    </NavLink>
  );
}

/**
 * Coquille responsive : barre latérale (bureau/tablette), barre d'onglets en bas (mobile),
 * barre supérieure avec sélecteur de campagne, rôle et état de la connexion temps réel.
 */
export function AppShell({ children }: { children?: ReactNode }) {
  const t = useT();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const logout = useLogout();
  const { data: me } = useMe();
  const { role } = useCurrentCampaign();
  const online = useSocketStatus();

  return (
    <div className={s.shell}>
      <a className={s.skip} href="#contenu">
        Aller au contenu
      </a>
      <nav className={s.sidebar} aria-label="Navigation principale">
        <NavLink to="/" className={s.brandStar} aria-label="Accueil DungeonSpace">
          <img src="/assets/ui/logo-star.webp" alt="" />
        </NavLink>
        {PRIMARY_NAV.map((n) => (
          <NavEntry key={n.to} to={n.to} icon={n.icon} label={t(n.labelKey)} />
        ))}
        <div className={s.sep} aria-hidden>
          <span />
          <Diamond size={5} />
          <span />
        </div>
        {SECONDARY_NAV.map((n) => (
          <NavEntry key={n.to} to={n.to} icon={n.icon} label={t(n.labelKey)} />
        ))}
        <div className={s.grow} />
        <button
          type="button"
          className={s.quit}
          onClick={() => logout.mutate(undefined, { onSettled: () => navigate('/connexion') })}
        >
          {t('nav.quit')}
        </button>
      </nav>

      <div className={s.main}>
        <header className={s.topbar}>
          <NavLink to="/" className={s.mobileLogo} aria-label="Accueil">
            <img src="/assets/ui/logo-star.webp" alt="" />
          </NavLink>
          <div className={s.heading}>
            <NavLink to="/" className={cx('ds-display', s.wordmark)}>
              DungeonSpace
            </NavLink>
            <Diamond size={6} />
            <div className={s.screenTitle}>{titleFor(pathname)}</div>
          </div>
          <div className={s.grow} />
          <CampaignSwitcher />
          <RecordingBadge />
          {role && <span className={cx(s.role, role === 'gm' && s.roleGm)}>{role === 'gm' ? 'MJ' : 'Joueur'}</span>}
          <span className={cx(s.live, online && s.liveOn)} title={online ? 'Synchronisé en temps réel' : 'Reconnexion…'} aria-label={online ? 'En ligne' : 'Hors ligne'} />
          {me && <UserMenu user={me} />}
        </header>
        <main id="contenu" className={s.content}>
          {children ?? <Outlet />}
        </main>
      </div>

      <nav className={s.bottomNav} aria-label="Navigation principale (mobile)">
        {PRIMARY_NAV.map((n) => (
          <NavEntry key={n.to} to={n.to} icon={n.icon} label={t(n.labelKey)} compact />
        ))}
      </nav>
    </div>
  );
}
