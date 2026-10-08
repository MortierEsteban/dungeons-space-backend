import { eventTypeDef, type EventDto, type EventLinkDto } from '@ds/shared';
import { useState } from 'react';
import { errorMessage, http } from '../../shared/api/client';
import { shortDate } from '../../shared/format';
import { Button, Field, IconButton, Input, Rule, Tag, TextArea } from '../../shared/ui/components';
import { useToast } from '../../shared/ui/toast';
import { useMe } from '../auth/api';
import { useCurrentCampaign } from '../campaigns/CampaignContext';
import { useChronicleMutations } from './api';
import s from './chronicle.module.css';

interface Props {
  event: EventDto;
  events: EventDto[];
  links: EventLinkDto[];
  linking: boolean;
  onLinking(on: boolean): void;
  onOpen(id: string): void;
  onClose(): void;
  onAddLinked(): void;
}

/** Détail d'un événement : contexte, liens, correction et ajout à la Constellation. */
export function EventDetail({ event, events, links, linking, onLinking, onOpen, onClose, onAddLinked }: Props) {
  const { campaignId, isGm } = useCurrentCampaign();
  const { data: me } = useMe();
  const { correct, unlink } = useChronicleMutations(campaignId!);
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(event.title);
  const [text, setText] = useState(event.text);
  const def = eventTypeDef(event.type);
  const canEdit = isGm || event.author?.id === me?.id;

  const related = links
    .filter((l) => l.fromId === event.id || l.toId === event.id)
    .map((l) => ({ link: l, other: events.find((e) => e.id === (l.fromId === event.id ? l.toId : l.fromId)) }))
    .filter((x): x is { link: EventLinkDto; other: EventDto } => !!x.other)
    .sort((a, b) => a.other.seq - b.other.seq);

  const saveCorrection = () =>
    correct.mutate(
      { id: event.id, title, text, reason: 'Correction' },
      { onSuccess: () => (setEditing(false), toast('Correction inscrite dans la Chronique.', 'success')), onError: (e) => toast(errorMessage(e), 'error') },
    );

  const addToConstellation = async () => {
    try {
      await http.post(`/campaigns/${campaignId}/constellation/nodes`, { kind: 'event', label: event.title, refType: 'event', refId: event.id, playerVisible: event.visibility === 'players' });
      toast('Ajouté à la Constellation.', 'success');
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  return (
    <div className="ds-stack" style={{ gap: 14 }}>
      <div className="ds-row" style={{ alignItems: 'flex-start' }}>
        <div className="ds-grow">
          <div className="ds-label" style={{ color: def.color }}>
            {def.label} · Session {event.sessionNo ?? 0}
          </div>
          {editing ? (
            <Input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Titre" style={{ marginTop: 6 }} />
          ) : (
            <h2 className="ds-h2" style={{ fontSize: 24, color: 'var(--gold-light)', marginTop: 4 }}>
              {event.title}
            </h2>
          )}
        </div>
        <IconButton label="Fermer le détail" onClick={onClose}>
          ×
        </IconButton>
      </div>
      <div className={s.byline}>
        <span className={s.avatarSm}>{event.author?.name[0] ?? '·'}</span>
        Noté par {event.author?.name ?? 'le système'} · {shortDate(event.occurredAt)}
        {event.visibility === 'gm_only' && <Tag color="var(--magenta-light)">Secret · MJ</Tag>}
        {event.corrected && <Tag>Corrigé</Tag>}
      </div>
      <Rule />
      {editing ? (
        <Field label="Récit" htmlFor="ev-text">
          <TextArea id="ev-text" rows={6} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
      ) : (
        <p className={s.story}>{event.text || <span className="ds-help">Aucun récit pour cet événement.</span>}</p>
      )}
      {(event.actors.length > 0 || event.targets.length > 0 || event.places.length > 0) && (
        <div className="ds-row" style={{ gap: 6 }}>
          {event.actors.map((a) => (
            <Tag key={`a${a.id ?? a.name}`} color="var(--arcane-light)">
              {a.name}
            </Tag>
          ))}
          {event.targets.map((t) => (
            <Tag key={`t${t.id ?? t.name}`} color="var(--magenta-light)">
              → {t.name}
            </Tag>
          ))}
          {event.places.map((p) => (
            <Tag key={p}>{p}</Tag>
          ))}
        </div>
      )}

      <div className="ds-stack" style={{ gap: 6 }}>
        <div className="ds-row">
          <span className="ds-label ds-grow">Événements liés · {related.length}</span>
          <Button size="sm" variant={linking ? 'heal' : 'ghost'} onClick={() => onLinking(!linking)}>
            {linking ? 'Terminer' : 'Relier'}
          </Button>
        </div>
        {linking && <p className="ds-help">Cliquez sur les événements de la carte pour les relier ou les délier.</p>}
        {related.map(({ link, other }) => (
          <div key={link.id} className={s.linked}>
            <span className={s.recentGem} style={{ background: eventTypeDef(other.type).color }} />
            <button type="button" className={s.linkedTitle} onClick={() => onOpen(other.id)}>
              {other.title}
              <span className={s.recentMeta}> · session {other.sessionNo ?? 0}</span>
            </button>
            <IconButton label={`Délier « ${other.title} »`} onClick={() => unlink.mutate(link.id)}>
              ×
            </IconButton>
          </div>
        ))}
      </div>

      <div className={s.actions}>
        {editing ? (
          <>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              Annuler
            </Button>
            <Button variant="primary" onClick={saveCorrection} disabled={correct.isPending}>
              Enregistrer la correction
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onAddLinked}>
              + Événement lié
            </Button>
            {canEdit && (
              <Button variant="ghost" onClick={() => setEditing(true)}>
                Corriger
              </Button>
            )}
            {isGm && (
              <Button variant="ghost" onClick={addToConstellation}>
                Vers la Constellation
              </Button>
            )}
            {canEdit && (
              <Button
                variant="danger"
                onClick={() => {
                  if (window.confirm('Retirer cet événement de la Chronique ? Il restera dans l’historique des corrections.'))
                    correct.mutate({ id: event.id, retract: true, reason: 'Retiré' }, { onSuccess: onClose });
                }}
              >
                Retirer
              </Button>
            )}
          </>
        )}
      </div>
      <p className="ds-help">Les événements sont immuables : une correction ajoute une entrée à l’historique sans effacer l’original.</p>
    </div>
  );
}
