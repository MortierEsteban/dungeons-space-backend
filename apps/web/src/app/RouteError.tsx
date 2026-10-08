import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router';
import { Button, Empty, Panel } from '../shared/ui/components';

/** Écran d'erreur des routes : on reste dans l'univers, avec une issue de secours. */
export function RouteError() {
  const error = useRouteError();
  const navigate = useNavigate();
  const detail = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : error instanceof Error ? error.message : '';
  // Après un déploiement, un ancien découpage du code peut être introuvable : un rechargement suffit.
  const staleChunk = /dynamically imported module|Importing a module script failed/i.test(detail);
  return (
    <div className="ds-page" style={{ maxWidth: 640, paddingTop: 80 }}>
      <Panel>
        <Empty
          title={staleChunk ? 'Une nouvelle version du grimoire est disponible.' : 'Un sortilège a mal tourné.'}
          action={
            <div className="ds-row" style={{ justifyContent: 'center' }}>
              <Button variant="primary" onClick={() => window.location.reload()}>
                Recharger
              </Button>
              <Button variant="ghost" onClick={() => navigate('/')}>
                Retour à l’accueil
              </Button>
            </div>
          }
        >
          {staleChunk ? 'Rechargez la page pour continuer.' : detail}
        </Empty>
      </Panel>
    </div>
  );
}
