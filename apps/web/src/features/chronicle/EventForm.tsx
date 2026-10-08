import { NARRATIVE_TYPES, type EntityRef, type EventDto } from '@ds/shared';
import { useState } from 'react';
import { errorMessage } from '../../shared/api/client';
import { Button, Chip, Field, Input, TextArea, Toggle } from '../../shared/ui/components';
import { useToast } from '../../shared/ui/toast';
import { useCurrentCampaign } from '../campaigns/CampaignContext';
import { useCampaignCharacters } from '../character/api';
import { useChronicleMutations } from './api';
import s from './chronicle.module.css';

interface Props {
  sessions: number;
  defaultSession: number | null;
  linkTo: string[];
  events: EventDto[];
  onCancel(): void;
  onCreated(e: EventDto): void;
}

const toggle = <T,>(xs: T[], x: T) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);

/** Saisie rapide d'un événement narratif (CHR-06) : 2 clics pour l'essentiel. */
export function EventForm({ sessions, defaultSession, linkTo, events, onCancel, onCreated }: Props) {
  const { campaignId, isGm } = useCurrentCampaign();
  const { data: characters = [] } = useCampaignCharacters(campaignId);
  const { create } = useChronicleMutations(campaignId!);
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [type, setType] = useState('narrative.discovery');
  const [session, setSession] = useState<number>(defaultSession ?? sessions);
  const [actors, setActors] = useState<string[]>([]);
  const [targets, setTargets] = useState<string[]>([]);
  const [links, setLinks] = useState<string[]>(linkTo);
  const [secret, setSecret] = useState(false);
  const [importance, setImportance] = useState<number | null>(null);

  const ref = (id: string): EntityRef => {
    const c = characters.find((x) => x.id === id)!;
    return { kind: 'character', id: c.id, name: c.name };
  };

  const submit = () => {
    if (!title.trim()) return toast('Un titre est requis.', 'error');
    create.mutate(
      {
        type,
        title: title.trim(),
        text,
        sessionNo: session,
        visibility: secret ? 'gm_only' : 'players',
        actors: actors.map(ref),
        targets: targets.map(ref),
        linkTo: links,
        ...(importance ? { importance } : {}),
      },
      { onSuccess: (e) => (toast('Inscrit dans la Chronique.', 'success'), onCreated(e)), onError: (e) => toast(errorMessage(e), 'error') },
    );
  };

  return (
    <div className="ds-stack" style={{ gap: 14 }}>
      <div>
        <div className="ds-label">Nouvel événement</div>
        <h2 className="ds-h2">Noter dans la Chronique</h2>
      </div>
      <Field label="Titre" htmlFor="ev-title">
        <Input id="ev-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="La cloche qui sonne seule" autoFocus onKeyDown={(e) => e.key === 'Enter' && submit()} />
      </Field>
      <div className="ds-stack" style={{ gap: 6 }}>
        <span className="ds-label">Type</span>
        <div className={s.chips}>
          {NARRATIVE_TYPES.map((t) => (
            <Chip key={t.type} color={t.color} active={type === t.type} onClick={() => setType(t.type)}>
              {t.label}
            </Chip>
          ))}
        </div>
      </div>
      <div className="ds-stack" style={{ gap: 6 }}>
        <span className="ds-label">Session</span>
        <div className={s.chips}>
          {Array.from({ length: sessions + 2 }, (_, i) => i).map((n) => (
            <Chip key={n} square active={session === n} onClick={() => setSession(n)}>
              {n === 0 ? 'Prologue' : n > sessions ? `+ ${n}` : n}
            </Chip>
          ))}
        </div>
      </div>
      {characters.length > 0 && (
        <>
          <div className="ds-stack" style={{ gap: 6 }}>
            <span className="ds-label">Acteurs</span>
            <div className={s.chips}>
              {characters.map((c) => (
                <Chip key={c.id} square active={actors.includes(c.id)} onClick={() => setActors(toggle(actors, c.id))}>
                  {c.name}
                </Chip>
              ))}
            </div>
          </div>
          <div className="ds-stack" style={{ gap: 6 }}>
            <span className="ds-label">Cibles · qui est affecté ?</span>
            <div className={s.chips}>
              {characters.map((c) => (
                <Chip key={c.id} square active={targets.includes(c.id)} onClick={() => setTargets(toggle(targets, c.id))}>
                  {c.name}
                </Chip>
              ))}
            </div>
          </div>
        </>
      )}
      <Field label="Récit" htmlFor="ev-text">
        <TextArea id="ev-text" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ce qui s'est passé, ce qui a été promis…" />
      </Field>
      <div className="ds-stack" style={{ gap: 6 }}>
        <span className="ds-label">Importance</span>
        <div className={s.chips}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Chip key={n} square active={importance === n} onClick={() => setImportance(importance === n ? null : n)} title={n === 1 ? 'Anecdote' : n === 5 ? 'Pivot de campagne' : undefined}>
              {'◆'.repeat(n)}
            </Chip>
          ))}
        </div>
      </div>
      {events.length > 0 && (
        <details className={s.linkPicker}>
          <summary className="ds-label">Relier à · {links.length}</summary>
          <div className={s.linkList}>
            {[...events]
              .sort((a, b) => b.seq - a.seq)
              .map((e) => (
                <label key={e.id} className={s.linkOption}>
                  <input type="checkbox" checked={links.includes(e.id)} onChange={() => setLinks(toggle(links, e.id))} />
                  <span className="ds-grow">{e.title}</span>
                  <span className={s.recentMeta}>S{e.sessionNo ?? 0}</span>
                </label>
              ))}
          </div>
        </details>
      )}
      {isGm && (
        <Toggle checked={secret} onChange={setSecret}>
          Secret du MJ (invisible des joueurs)
        </Toggle>
      )}
      <div className={s.actions}>
        <Button variant="ghost" onClick={onCancel}>
          Annuler
        </Button>
        <Button variant="primary" onClick={submit} disabled={create.isPending || !title.trim()}>
          Inscrire
        </Button>
      </div>
    </div>
  );
}
