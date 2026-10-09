import { CATEGORIES, eventConfidence, eventOrigin, eventTypeDef, eventWeight, type EventCategory, type EventDto } from '@ds/shared';
import { useMemo, useState } from 'react';
import { shortDate } from '../../shared/format';
import { useDebounced } from '../../shared/hooks';
import { Button, Chip, Empty, Input, Loading, Panel, Select, Tag } from '../../shared/ui/components';
import { useCurrentCampaign } from '../campaigns/CampaignContext';
import { useCampaignCharacters } from '../character/api';
import { useTimeline } from './api';
import { bundleMinor } from './density';
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
  const [origin, setOrigin] = useState<'' | 'manual' | 'recording'>('');
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const query = useDebounced(q, 300);
  const filters = useMemo(
    () => ({
      q: query || undefined,
      categories: categories.join(','),
      characterId: characterId || undefined,
      minImportance: minImportance > 1 ? minImportance : undefined,
      origin: origin || undefined,
      limit: 60,
    }),
    [query, categories, characterId, minImportance, origin],
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
          <Select value={origin} onChange={(e) => setOrigin(e.target.value as typeof origin)} aria-label="Origine des événements">
            <option value="">Toutes origines</option>
            <option value="manual">Notés par la table</option>
            <option value="recording">Déduits des enregistrements</option>
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
            {/* Les suites de détails déduits de l'enregistrement sont repliées : la frise reste lisible. */}
            {bundleMinor(g.events, (e) => eventOrigin(e) === 'recording' && eventWeight(e) < 0.4).map((b) =>
              b.kind === 'item' || opened.has(b.id) ? (
                (b.kind === 'item' ? [b.item] : b.items).map((e) => <Entry key={e.id} e={e} isGm={isGm} />)
              ) : (
                <button key={b.id} type="button" className={s.bundle} onClick={() => setOpened((xs) => new Set(xs).add(b.id))}>
                  + {b.items.length} détails déduits de l’enregistrement
                  <span className="ds-help">{b.items.slice(0, 3).map((e) => e.title).join(' · ')}…</span>
                </button>
              ),
            )}
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

function Entry({ e, isGm }: { e: EventDto; isGm: boolean }) {
  const def = eventTypeDef(e.type);
  return (
    <article className={s.entry} style={{ borderLeftColor: def.color, opacity: e.retracted ? 0.5 : 1 }}>
      <div className="ds-row" style={{ gap: 8 }}>
        <span className="ds-label" style={{ color: def.color }}>
          {def.label}
        </span>
        <span className="ds-help">
          {shortDate(e.occurredAt)} · {e.author?.name ?? (eventOrigin(e) === 'recording' ? 'Enregistrement' : 'Système')}
        </span>
        {eventOrigin(e) === 'recording' && <Tag color="var(--arcane-light)">Auto · {Math.round(eventConfidence(e) * 100)} %</Tag>}
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
          {e.actors.map((a, i) => (
            <Tag key={`a${i}`} color="var(--arcane-light)">
              {a.name}
            </Tag>
          ))}
          {e.targets.map((t, i) => (
            <Tag key={`t${i}`} color="var(--magenta-light)">
              → {t.name}
            </Tag>
          ))}
        </div>
      )}
    </article>
  );
}
