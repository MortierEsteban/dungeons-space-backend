import { useSearchParams } from 'react-router';
import { Empty, Panel, Segmented } from '../../shared/ui/components';
import { useCurrentCampaign } from '../campaigns/CampaignContext';
import { ChronicleView } from '../chronicle/ChronicleView';
import { Timeline } from '../chronicle/Timeline';
import { ConstellationView } from '../constellation/ConstellationView';
import { TranscriptsView } from '../recording/TranscriptsView';
import { SessionsView } from '../sessions/SessionsView';
import { DiscoverCampaigns } from './DiscoverCampaigns';

type View = 'chronique' | 'sessions' | 'transcriptions' | 'frise' | 'constellation' | 'campagnes';

const VIEWS: { value: View; label: string }[] = [
  { value: 'chronique', label: 'Chronique' },
  { value: 'sessions', label: 'Sessions' },
  { value: 'transcriptions', label: 'Transcriptions' },
  { value: 'frise', label: 'Frise' },
  { value: 'constellation', label: 'Constellation' },
  { value: 'campagnes', label: 'Campagnes' },
];

const TITLES: Record<View, string> = {
  chronique: 'La mémoire de la campagne',
  sessions: 'La trace de chaque session',
  transcriptions: 'Les paroles de la table',
  frise: 'Le fil des événements',
  constellation: 'Le réseau des destinées',
  campagnes: 'Campagnes & tables',
};

export default function ExplorePage() {
  const [params, setParams] = useSearchParams();
  const { current } = useCurrentCampaign();
  const view = (VIEWS.some((v) => v.value === params.get('vue')) ? params.get('vue') : 'chronique') as View;
  const needsCampaign = view !== 'campagnes' && !current;

  return (
    <div className="ds-page">
      <div className="ds-page-head">
        <div>
          <div className="ds-label">Explorer{current && view !== 'campagnes' ? ` · ${current.name}` : ''}</div>
          <h1 className="ds-h1">{TITLES[view]}</h1>
        </div>
        <Segmented label="Vue" value={view} options={VIEWS} onChange={(v) => setParams({ vue: v }, { replace: true })} />
      </div>
      {needsCampaign ? (
        <Panel>
          <Empty title="Aucune campagne sélectionnée.">Fondez une campagne ou rejoignez une table depuis le sélecteur en haut de l’écran.</Empty>
        </Panel>
      ) : view === 'chronique' ? (
        <ChronicleView key={current!.id} />
      ) : view === 'sessions' ? (
        <SessionsView key={current!.id} />
      ) : view === 'transcriptions' ? (
        <TranscriptsView key={current!.id} />
      ) : view === 'frise' ? (
        <Timeline key={current!.id} />
      ) : view === 'constellation' ? (
        <ConstellationView key={current!.id} />
      ) : (
        <DiscoverCampaigns />
      )}
    </div>
  );
}
