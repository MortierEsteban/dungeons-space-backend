import { CREATION_KINDS, type CreationKind, type SharedCreationDto } from '@ds/shared';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { errorMessage } from '../../shared/api/client';
import { RARITY_COLORS } from '../../shared/format';
import { useDebounced } from '../../shared/hooks';
import { Button, Chip, cx, Empty, Input, Loading, Panel, Select } from '../../shared/ui/components';
import { useToast } from '../../shared/ui/toast';
import { useCampaigns } from '../campaigns/api';
import { useCurrentCampaign } from '../campaigns/CampaignContext';
import { useImportCreations, useSharedCreations } from './api';
import { CreationCard } from './Forge';
import s from './sanctuary.module.css';

/**
 * La bibliothèque partagée : objets, sorts, créatures et classes publiés par les autres tables.
 * On coche, on choisit la campagne de destination, on importe tout d'un coup (une copie par création).
 */
export function SharedLibrary() {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<CreationKind | 'all'>('all');
  const query = useDebounced(q, 250);
  const { data: entries = [], isLoading, isFetching } = useSharedCreations(query, kind === 'all' ? undefined : kind);
  const { campaignId } = useCurrentCampaign();
  const { data: campaigns = [] } = useCampaigns();
  const [target, setTarget] = useState<string>(campaignId ?? '');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState<string | null>(null);
  const importer = useImportCreations();
  const toast = useToast();
  const navigate = useNavigate();

  const available = useMemo(() => entries.filter((e) => !e.owned), [entries]);
  const shown = entries.find((e) => e.id === focus) ?? entries[0];
  const toggle = (id: string) => setPicked((p) => {
    const next = new Set(p);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const allPicked = available.length > 0 && available.every((e) => picked.has(e.id));
  const count = [...picked].filter((id) => available.some((e) => e.id === id)).length;

  const run = () =>
    importer.mutate(
      { ids: [...picked], campaignId: target || null },
      {
        onSuccess: (created) => {
          setPicked(new Set());
          toast(created.length ? `${created.length} création${created.length > 1 ? 's' : ''} importée${created.length > 1 ? 's' : ''} dans la Forge.` : 'Déjà dans vos créations : rien à importer.', created.length ? 'success' : 'info');
        },
        onError: (e) => toast(errorMessage(e), 'error'),
      },
    );

  return (
    <div className={s.shared}>
      <div className="ds-stack" style={{ gap: 14 }}>
        <Input className={s.search} placeholder="Rechercher dans la bibliothèque partagée…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher dans la bibliothèque partagée" />
        <div className="ds-row" style={{ gap: 6 }}>
          <Chip active={kind === 'all'} onClick={() => setKind('all')}>
            Tout
          </Chip>
          {CREATION_KINDS.map((k) => (
            <Chip key={k} active={kind === k} onClick={() => setKind(k)}>
              {k}
            </Chip>
          ))}
        </div>
        <div className={s.importBar}>
          <label className="ds-row" style={{ gap: 6 }}>
            <input type="checkbox" checked={allPicked} disabled={!available.length} onChange={() => setPicked(allPicked ? new Set() : new Set(available.map((e) => e.id)))} />
            <span className="ds-help">Tout cocher ({available.length})</span>
          </label>
          <span className="ds-grow" />
          <Select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Campagne de destination" style={{ width: 'auto' }}>
            <option value="">Mes créations (sans campagne)</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Button variant="primary" disabled={!count || importer.isPending} onClick={run}>
            Importer {count || ''}
          </Button>
        </div>
        <div className="ds-help">
          {entries.length} création{entries.length > 1 ? 's' : ''} partagée{entries.length > 1 ? 's' : ''}
          {isFetching ? '…' : ''} · cochez-en plusieurs pour les importer en une fois.
        </div>
        {isLoading ? (
          <Loading />
        ) : (
          <div className={s.sharedList} role="list">
            {entries.map((e: SharedCreationDto) => (
              <div key={e.id} role="listitem" className={cx(s.sharedRow, shown?.id === e.id && s.resultOn)}>
                <input type="checkbox" aria-label={`Sélectionner ${e.name}`} checked={e.owned || picked.has(e.id)} disabled={e.owned} onChange={() => toggle(e.id)} />
                <button type="button" className={s.sharedMain} onClick={() => setFocus(e.id)}>
                  <span className={s.creationGem} style={{ background: RARITY_COLORS[e.rarity] }} />
                  <span className="ds-grow">
                    <strong>{e.name}</strong>
                    <span className="ds-help">
                      {' '}
                      · {e.kind} · par {e.ownerName}
                      {e.campaignName ? ` (${e.campaignName})` : ''}
                    </span>
                  </span>
                  <span className="ds-help">{e.owned ? 'Déjà à vous' : e.imports ? `${e.imports} import${e.imports > 1 ? 's' : ''}` : ''}</span>
                </button>
              </div>
            ))}
            {entries.length === 0 && (
              <Empty title="Rien de partagé pour l’instant.">
                Publiez vos créations depuis la Forge (« Partager dans la bibliothèque commune ») pour qu’elles apparaissent ici.
              </Empty>
            )}
          </div>
        )}
      </div>
      {shown && (
        <Panel className={s.previewCol}>
          <CreationCard d={shown} />
          <div className="ds-row">
            <Button variant="ghost" onClick={() => navigate('/sanctuaire?onglet=forge')}>
              Ouvrir la Forge
            </Button>
          </div>
        </Panel>
      )}
    </div>
  );
}
