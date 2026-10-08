import type { CharacterDto, NpcData } from '@ds/shared';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, Chip, Field, Input, Panel, Portrait, Rule, TextArea, Toggle } from '../../shared/ui/components';
import { ImageDrop } from '../../shared/ui/ImageDrop';
import { useCharacterMutations } from './api';
import { CharacterEvents } from './CharacterEvents';
import { useSheet } from './useSheet';
import s from './character.module.css';

const FIELDS: { key: keyof NpcData; label: string; gmOnly?: boolean; long?: boolean }[] = [
  { key: 'species', label: 'Espèce' },
  { key: 'job', label: 'Métier' },
  { key: 'trait', label: 'Trait' },
  { key: 'goal', label: 'Motivation' },
  { key: 'secret', label: 'Secret · MJ', gmOnly: true, long: true },
  { key: 'notes', label: 'Notes du MJ', gmOnly: true, long: true },
];

/** Fiche simplifiée de PNJ (FND-30) : identité, attitude, secret réservé au MJ. */
export function NpcSheet({ character }: { character: CharacterDto }) {
  const sh = useSheet(character);
  const m = useCharacterMutations(character.id);
  const navigate = useNavigate();
  const [draft, setDraft] = useState<NpcData>(character.npc!);
  useEffect(() => setDraft(character.npc!), [character.npc]);
  const isGm = character.canEdit;
  const dirty = JSON.stringify(draft) !== JSON.stringify(character.npc);

  return (
    <div className={s.npc}>
      <Panel pad={false} style={{ padding: 6 }}>
        {isGm ? <ImageDrop value={character.portraitUrl} onChange={sh.setPortrait} label="Portrait du PNJ" height={380} /> : <Portrait src={character.portraitUrl} name={character.name} height={380} />}
      </Panel>
      <Panel className="ds-stack" style={{ gap: 14 }}>
        <div className="ds-label">
          {[draft.species, draft.job].filter(Boolean).join(' · ') || 'PNJ'}
        </div>
        <h1 className="ds-h1">{character.name}</h1>
        <div className="ds-row" style={{ gap: 6 }}>
          {(['amical', 'neutre', 'hostile'] as const).map((a) => (
            <Chip key={a} active={draft.attitude === a} disabled={!isGm} color={a === 'amical' ? '#4fb3ff' : a === 'hostile' ? '#b0306a' : '#c9a96a'} onClick={() => setDraft({ ...draft, attitude: a })}>
              {a}
            </Chip>
          ))}
        </div>
        <Rule />
        <div className={s.npcGrid}>
          {FIELDS.filter((f) => isGm || !f.gmOnly).map((f) => (
            <Field key={f.key} label={f.label} htmlFor={`npc-${f.key}`} className={f.long ? s.span2 : undefined}>
              {f.long ? (
                <TextArea id={`npc-${f.key}`} rows={3} readOnly={!isGm} value={String(draft[f.key])} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} />
              ) : (
                <Input id={`npc-${f.key}`} readOnly={!isGm} value={String(draft[f.key])} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} />
              )}
            </Field>
          ))}
        </div>
        {isGm && (
          <div className="ds-row">
            <Button variant="primary" disabled={!dirty} onClick={() => sh.updateNpc(draft)}>
              Enregistrer
            </Button>
            <Toggle checked={character.visibleToPlayers} onChange={(v) => m.update.mutate({ visibleToPlayers: v })}>
              Visible des joueurs
            </Toggle>
            <Button variant="ghost" onClick={() => navigate('/explorer?vue=constellation')}>
              Voir dans la Constellation
            </Button>
          </div>
        )}
      </Panel>
      <div className={s.span2}>
        <CharacterEvents character={character} />
      </div>
    </div>
  );
}
