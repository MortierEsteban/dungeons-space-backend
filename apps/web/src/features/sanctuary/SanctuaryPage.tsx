import { useSearchParams } from 'react-router';
import { Segmented } from '../../shared/ui/components';
import { Forge } from './Forge';
import { Library } from './Library';
import { SharedLibrary } from './SharedLibrary';

type Tab = 'bibliotheque' | 'partagee' | 'forge';

const TITLES: Record<Tab, string> = { bibliotheque: 'La Bibliothèque', partagee: 'La Bibliothèque partagée', forge: 'La Forge' };

/** Le Sanctuaire : compendium des règles (SRD), créations partagées par les autres tables, et Forge. */
export default function SanctuaryPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('onglet');
  const tab: Tab = raw === 'forge' || raw === 'partagee' ? raw : 'bibliotheque';
  return (
    <div className="ds-page">
      <div className="ds-page-head">
        <div>
          <div className="ds-label">Sanctuaire</div>
          <h1 className="ds-h1">{TITLES[tab]}</h1>
        </div>
        <Segmented
          label="Section"
          value={tab}
          onChange={(v) => setParams({ onglet: v }, { replace: true })}
          options={[
            { value: 'bibliotheque', label: 'Bibliothèque' },
            { value: 'partagee', label: 'Partagée' },
            { value: 'forge', label: 'Forge · Créer' },
          ]}
        />
      </div>
      {tab === 'forge' ? <Forge /> : tab === 'partagee' ? <SharedLibrary /> : <Library />}
    </div>
  );
}
