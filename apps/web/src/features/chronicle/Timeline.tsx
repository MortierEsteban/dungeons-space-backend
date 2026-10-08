import { CATEGORIES, eventTypeDef, type EventCategory, type EventDto } from '@ds/shared';
import { useMemo, useState } from 'react';
import { shortDate } from '../../shared/format';
import { useDebounced } from '../../shared/hooks';
import { Button, Chip, Empty, Input, Loading, Panel, Select, Tag } from '../../shared/ui/components';
import { useCurrentCampaign } from '../campaigns/CampaignContext';
import { useCampaignCharacters } from '../character/api';
import { useTimeline } from './api';
import s from './chronicle.module.css';

const CATEGORY_LABELS: Record<EventCategory, string> = {
  narrative: 'Récit',
  social: 'Social',
  session: 'Sessions',
  character: 'Personnages',
  item: 'Objets',
  dice: 'Dés',
  combat: 'Combat',
  system: 'Système',
};

/**
 * Frise chronologique : toute la mémoire de la campagne, filtrable côté serveur
 * (« quand a-t-on rencontré X ? » en quelques secondes).
 */
export function Timeline() {
  const { campaignId, isGm } = useCurrentCampaign();
  const { data: characters = [] } = useCampaignCharacters(campaignId);
  const [q, setQ] = useState('');
  const [categories, setCategories] = useState<EventCategory[]>(['narrative', 'social', 'session', 'character', 'item']);
  const [characterId, setCharacterId] = useState('');
  const [minImportance, setMinImportance] = useState(1);
  const query = useDebounced(q, 300);
  const filters = useMemo(
    () => ({ q: query || undefined, categories: categories.join(','), characterId: characterId || undefined, minImportance: minImportance > 1 ? minImportance : undefined, limit: 40 }),
    [query, categories, characterId, minImportance],
  );
  const timeline = useTimeline(campaignId, filters);
  const events = timeline.data?.pages.flatMap((p) => p.events) ?? [];

  const grouped = useMemo(() => {
    const out: { session: number; events: EventDto[] }[] = [];
    for (const e of events) {
      const n = e.sessionNo ?? 0;
      const last = out[out.length - 1];
      if (last && last.session === n) last.events.push(e);
      else out.push({ session: n, events: [e] });
    }
    return out;
  }, [events]);

  return (
    <div className={s.timelineLayout}>
      <Panel className={s.timelineFilters}>
        <Input placeholder="Rechercher : un nom, un lieu, une promesse…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher dans la Chronique" />
        <div className={s.chips}>
          {CATEGORIES.filter((c) => c !== 'system').map((c) => (
            <Chip key={c} active={categories.includes(c)} onClick={() => setCategories((xs) => (xs.includes(c) ? xs.filter((x) => x !== c) : [...xs, c]))}>
              {CATEGORY_LABELS[c]}
            </Chip>
          ))}
        </div>
        <div className={s.filterRow}>
          <Select value={characterId} onChange={(e) => setCharacterId(e.target.value)} aria-label="Filtrer par personnage">
            <option value="">Tous les personnages</option>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select value={minImportance} onChange={(e) => setMinImportance(Number(e.target.value))} aria-label="Importance minimale">
            <option value={1}>Toute importance</option>
            <option value={2}>◆◆ et plus</option>
            <option value={3}>◆◆◆ et plus</option>
            <option value={4}>Moments clés</option>
          </Select>
        </div>
      </Panel>

      <div className={s.timeline}>
        {timeline.isLoading && <Loading />}
        {!timeline.isLoading && events.length === 0 && <Empty title="Le coffre est encore scellé.">Aucun événement ne correspond à ces filtres.</Empty>}
        {grouped.map((g) => (
          <section key={`${g.session}-${g.events[0]!.id}`} className={s.sessionGroup}>
            <h3 className={s.sessionHead}>
              <span />
              {g.session === 0 ? 'Prologue' : `Session ${g.session}`}
              <span />
            </h3>
            {g.events.map((e) => {
              const def = eventTypeDef(e.type);
              return (
                <article key={e.id} className={s.entry} style={{ borderLeftColor: def.color, opacity: e.retracted ? 0.5 : 1 }}>
                  <div className="ds-row" style={{ gap: 8 }}>
                    <span className="ds-label" style={{ color: def.color }}>
                      {def.label}
                    </span>
                    <span className="ds-help">{shortDate(e.occurredAt)} · {e.author?.name ?? 'Système'}</span>
                    {e.importance >= 4 && <Tag color="var(--gold-light)">Moment clé</Tag>}
                    {e.visibility === 'gm_only' && isGm && <Tag color="var(--magenta-light)">Secret</Tag>}
                    {e.retracted && <Tag>Retiré</Tag>}
                    {e.corrected && !e.retracted && <Tag>Corrigé</Tag>}
                  </div>
                  <div className={s.entryTitle} style={{ textDecoration: e.retracted ? 'line-through' : undefined }}>
                    {e.title}
                  </div>
                  {e.text && <p className={s.entryText}>{e.text}</p>}
                  {(e.actors.length > 0 || e.targets.length > 0) && (
                    <div className="ds-row" style={{ gap: 6 }}>
                      {e.actors.map((a) => (
                        <Tag key={`a${a.id ?? a.name}`} color="var(--arcane-light)">
                          {a.name}
                        </Tag>
                      ))}
                      {e.targets.map((t) => (
                        <Tag key={`t${t.id ?? t.name}`} color="var(--magenta-light)">
                          → {t.name}
                        </Tag>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        ))}
        {timeline.hasNextPage && (
          <Button variant="ghost" block onClick={() => void timeline.fetchNextPage()} disabled={timeline.isFetchingNextPage}>
            {timeline.isFetchingNextPage ? 'Les pages se tournent…' : 'Remonter le temps'}
          </Button>
        )}
      </div>
    </div>
  );
}
