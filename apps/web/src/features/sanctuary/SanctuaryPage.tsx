import { useSearchParams } from 'react-router';
import { Segmented } from '../../shared/ui/components';
import { Forge } from './Forge';
import { Library } from './Library';

type Tab = 'bibliotheque' | 'forge';

/** Le Sanctuaire : compendium des règles (SRD) et Forge des créations personnalisées. */
export default function SanctuaryPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('onglet') === 'forge' ? 'forge' : 'bibliotheque';
  return (
    <div className="ds-page">
      <div className="ds-page-head">
        <div>
          <div className="ds-label">Sanctuaire</div>
          <h1 className="ds-h1">{tab === 'forge' ? 'La Forge' : 'La Bibliothèque'}</h1>
        </div>
        <Segmented
          label="Section"
          value={tab}
          onChange={(v) => setParams({ onglet: v }, { replace: true })}
          options={[
            { value: 'bibliotheque', label: 'Bibliothèque' },
            { value: 'forge', label: 'Forge · Créer' },
          ]}
        />
      </div>
      {tab === 'forge' ? <Forge /> : <Library />}
    </div>
  );
}
