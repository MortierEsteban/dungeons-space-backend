import { createContext, useCallback, useContext, type ReactNode } from 'react';

/**
 * i18n minimaliste : clés typées, FR complet, EN de repli (NFR « FR + EN dès la structure »).
 * Les écrans migrent leurs libellés vers ces dictionnaires au fil de l'eau.
 */
const fr = {
  'nav.home': 'Accueil',
  'nav.explore': 'Explorer',
  'nav.combat': 'Combattre',
  'nav.sanctuary': 'Sanctuaire',
  'nav.character': 'Personnage',
  'nav.profile': 'Mon profil',
  'nav.generation': 'Génération',
  'nav.campaign': 'Campagne',
  'nav.quit': 'Quitter',
  'role.gm': 'Maître du jeu',
  'role.player': 'Joueur',
  'auth.login': 'Connexion',
  'auth.signup': 'Inscription',
  'auth.loginCta': 'Franchir le portail',
  'auth.signupCta': 'Créer mon grimoire',
  'auth.name': "Nom d'aventurier",
  'auth.email': 'Courriel',
  'auth.password': 'Mot de passe',
  'auth.preference': 'Je viens surtout pour',
  'auth.play': 'Jouer',
  'auth.lead': 'Mener',
  'common.loading': 'Les dés roulent…',
  'common.save': 'Enregistrer',
  'common.cancel': 'Annuler',
  'common.close': 'Fermer',
  'common.delete': 'Supprimer',
  'common.search': 'Rechercher',
  'common.noCampaign': 'Aucune campagne sélectionnée',
  'tagline': 'Explore · Battle · Create',
} as const;

export type MessageKey = keyof typeof fr;

const en: Partial<Record<MessageKey, string>> = {
  'nav.home': 'Home',
  'nav.explore': 'Explore',
  'nav.combat': 'Battle',
  'nav.sanctuary': 'Sanctuary',
  'nav.character': 'Character',
  'nav.profile': 'Profile',
  'nav.generation': 'Generation',
  'nav.campaign': 'Campaign',
  'nav.quit': 'Leave',
  'role.gm': 'Game master',
  'role.player': 'Player',
  'auth.login': 'Sign in',
  'auth.signup': 'Sign up',
  'auth.loginCta': 'Cross the portal',
  'auth.signupCta': 'Create my grimoire',
  'auth.name': 'Adventurer name',
  'auth.email': 'Email',
  'auth.password': 'Password',
  'auth.preference': 'I mostly come to',
  'auth.play': 'Play',
  'auth.lead': 'Lead',
  'common.loading': 'Rolling the dice…',
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.close': 'Close',
  'common.delete': 'Delete',
  'common.search': 'Search',
  'common.noCampaign': 'No campaign selected',
};

export type Locale = 'fr' | 'en';
const LocaleContext = createContext<Locale>('fr');

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useT() {
  const locale = useContext(LocaleContext);
  return useCallback((key: MessageKey) => (locale === 'en' ? en[key] : undefined) ?? fr[key], [locale]);
}
