import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, Outlet, useLocation } from 'react-router';
import { useMe } from '../features/auth/api';
import { LoginPage } from '../features/auth/LoginPage';
import { CampaignProvider } from '../features/campaigns/CampaignContext';
import { RecorderProvider } from '../features/recording/RecorderProvider';
import { LocaleProvider } from '../shared/i18n/i18n';
import { Loading } from '../shared/ui/components';
import { AppShell } from './AppShell';
import { RouteError } from './RouteError';

// Chaque rubrique est un module chargé à la demande (LCP < 2,5 s, NFR-01).
const HomePage = lazy(() => import('../features/home/HomePage'));
const ExplorePage = lazy(() => import('../features/explore/ExplorePage'));
const CombatPage = lazy(() => import('../features/combat/CombatPage'));
const BattlePage = lazy(() => import('../features/combat/BattlePage'));
const SanctuaryPage = lazy(() => import('../features/sanctuary/SanctuaryPage'));
const CharacterPage = lazy(() => import('../features/character/CharacterPage'));
const GenerationPage = lazy(() => import('../features/generation/GenerationPage'));
const CampaignPage = lazy(() => import('../features/campaigns/CampaignPage'));
const ProfilePage = lazy(() => import('../features/profile/ProfilePage'));
const CreditsPage = lazy(() => import('../features/profile/CreditsPage'));

const page = (node: ReactNode) => <Suspense fallback={<Loading />}>{node}</Suspense>;

/** Accès réservé aux aventuriers connectés ; fournit la campagne active à toute l'app. */
function RequireAuth() {
  const { data: me, isLoading } = useMe();
  const location = useLocation();
  if (isLoading) return <Loading label="Ouverture du portail…" />;
  if (!me) return <Navigate to="/connexion" replace state={{ from: location.pathname + location.search }} />;
  return (
    <LocaleProvider locale={me.locale}>
      <CampaignProvider>
        {/* Au-dessus de toutes les pages : naviguer n'interrompt jamais l'enregistrement de la session. */}
        <RecorderProvider>
          <Outlet />
        </RecorderProvider>
      </CampaignProvider>
    </LocaleProvider>
  );
}

export const router = createBrowserRouter([
  { path: '/connexion', element: <LoginPage />, errorElement: <RouteError /> },
  {
    element: <RequireAuth />,
    errorElement: <RouteError />,
    children: [
      // L'accueil immersif occupe tout l'écran et embarque sa propre navigation.
      { path: '/', element: page(<HomePage />) },
      {
        element: <AppShell />,
        errorElement: <RouteError />,
        children: [
          { path: '/explorer', element: page(<ExplorePage />) },
          { path: '/combat', element: page(<CombatPage />) },
          { path: '/combat/:encounterId', element: page(<BattlePage />) },
          { path: '/sanctuaire', element: page(<SanctuaryPage />) },
          { path: '/personnage', element: page(<CharacterPage />) },
          { path: '/personnage/:characterId', element: page(<CharacterPage />) },
          { path: '/generation', element: page(<GenerationPage />) },
          { path: '/campagne', element: page(<CampaignPage />) },
          { path: '/profil', element: page(<ProfilePage />) },
          { path: '/credits', element: page(<CreditsPage />) },
          { path: '*', element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
]);
