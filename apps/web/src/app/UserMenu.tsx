import type { UserDto } from '@ds/shared';
import { useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useLogout } from '../features/auth/api';
import { initials } from '../shared/format';
import { useDismiss } from '../shared/hooks';
import s from './menu.module.css';

export function UserMenu({ user }: { user: UserDto }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useDismiss<HTMLDivElement>(open, close);
  const logout = useLogout();
  const navigate = useNavigate();

  return (
    <div className={s.wrap} ref={ref}>
      <button type="button" className={s.avatar} aria-haspopup="menu" aria-expanded={open} aria-label={`Menu de ${user.displayName}`} onClick={() => setOpen(!open)}>
        {initials(user.displayName)}
      </button>
      {open && (
        <div className={s.menu} role="menu">
          <div className={s.who}>
            <strong>{user.displayName}</strong>
            <span className="ds-help">{user.email}</span>
          </div>
          <Link role="menuitem" to="/profil" onClick={close}>
            Profil & préférences
          </Link>
          <Link role="menuitem" to="/generation" onClick={close}>
            Génération
          </Link>
          <Link role="menuitem" to="/campagne" onClick={close}>
            Campagne & sessions
          </Link>
          <Link role="menuitem" to="/credits" onClick={close}>
            Crédits & licences
          </Link>
          <button type="button" role="menuitem" onClick={() => logout.mutate(undefined, { onSettled: () => navigate('/connexion') })}>
            Quitter le royaume
          </button>
        </div>
      )}
    </div>
  );
}
