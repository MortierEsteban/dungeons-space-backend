import { eventTypeDef, type CharacterDto } from '@ds/shared';
import { useMemo } from 'react';
import { shortDate } from '../../shared/format';
import { Button, Empty, Loading, Panel } from '../../shared/ui/components';
import { useTimeline } from '../chronicle/api';
import s from './character.module.css';

/** Ce que la Chronique retient de ce personnage (acteur ou cible). */
export function CharacterEvents({ character }: { character: CharacterDto }) {
  const filters = useMemo(() => ({ characterId: character.id, categories: 'narrative,social,character,item,combat', minImportance: 2, limit: 40 }), [character.id]);
  const timeline = useTimeline(character.campaignId, filters);
  const events = timeline.data?.pages.flatMap((p) => p.events) ?? [];
  if (timeline.isLoading) return <Loading />;
  return (
    <Panel className="ds-stack" style={{ gap: 10 }}>
      {events.length === 0 && <Empty title="Aucun fait marquant pour l’instant." />}
      {events.map((e) => {
        const def = eventTypeDef(e.type);
        return (
          <div key={e.id} className={s.eventRow} style={{ borderLeftColor: def.color }}>
            <div className="ds-row" style={{ gap: 8 }}>
              <span className="ds-label" style={{ color: def.color }}>
                {def.label}
              </span>
              <span className="ds-help">
                Session {e.sessionNo ?? 0} · {shortDate(e.occurredAt)}
              </span>
            </div>
            <strong>{e.title}</strong>
            {e.text && <p>{e.text}</p>}
          </div>
        );
      })}
      {timeline.hasNextPage && (
        <Button variant="ghost" onClick={() => void timeline.fetchNextPage()}>
          Plus ancien
        </Button>
      )}
    </Panel>
  );
}
