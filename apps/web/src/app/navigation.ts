import type { MessageKey } from '../shared/i18n/i18n';

export interface NavItem {
  to: string;
  labelKey: MessageKey;
  icon: string;
  /** Titre affiché dans la barre supérieure. */
  title: string;
  gmOnly?: boolean;
}

/** Rubriques principales (charte : Accueil · Explorer · Combattre · Sanctuaire · Personnage). */
export const PRIMARY_NAV: NavItem[] = [
  { to: '/', labelKey: 'nav.home', icon: 'accueil', title: 'Accueil' },
  { to: '/explorer', labelKey: 'nav.explore', icon: 'explorer', title: 'Explorer' },
  { to: '/combat', labelKey: 'nav.combat', icon: 'combattre', title: 'Combattre' },
  { to: '/sanctuaire', labelKey: 'nav.sanctuary', icon: 'sanctuaire', title: 'Sanctuaire' },
  { to: '/personnage', labelKey: 'nav.character', icon: 'profil', title: 'Personnage' },
];

export const SECONDARY_NAV: NavItem[] = [
  { to: '/generation', labelKey: 'nav.generation', icon: 'generation', title: 'Génération' },
  { to: '/campagne', labelKey: 'nav.campaign', icon: 'campagne', title: 'Campagne' },
];

export const iconSrc = (icon: string) => `/assets/ui/ico2-${icon}.webp`;

export function titleFor(pathname: string): string {
  const all = [...PRIMARY_NAV, ...SECONDARY_NAV, { to: '/credits', title: 'Crédits & licences' }, { to: '/profil', title: 'Profil' }];
  const match = all.filter((n) => (n.to === '/' ? pathname === '/' : pathname.startsWith(n.to))).sort((a, b) => b.to.length - a.to.length)[0];
  return match?.title ?? '';
}
