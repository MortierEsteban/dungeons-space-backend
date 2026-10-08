import type { CharacterDto, NoteDto } from '@ds/shared';
import { useEffect, useState } from 'react';
import { errorMessage } from '../../shared/api/client';
import { shortDate } from '../../shared/format';
import { Button, cx, Empty, Field, Input, Panel, Tag, TextArea, Toggle } from '../../shared/ui/components';
import { useToast } from '../../shared/ui/toast';
import { useMe } from '../auth/api';
import { useNoteMutations, useNotes } from './api';
import s from './character.module.css';

function Editor({ note, characterId, onSaved }: { note: NoteDto | null; characterId: string; onSaved(id: string | null): void }) {
  const m = useNoteMutations(characterId);
  const toast = useToast();
  const { data: me } = useMe();
  const [title, setTitle] = useState(note?.title ?? '');
  const [body, setBody] = useState(note?.body ?? '');
  const [pinned, setPinned] = useState(note?.pinned ?? false);
  const [shared, setShared] = useState(note?.shared ?? false);
  useEffect(() => {
    setTitle(note?.title ?? '');
    setBody(note?.body ?? '');
    setPinned(note?.pinned ?? false);
    setShared(note?.shared ?? false);
  }, [note]);
  const mine = !note || note.authorId === me?.id;
  const onError = (e: unknown) => toast(errorMessage(e), 'error');

  if (note && !mine) {
    return (
      <div className="ds-stack">
        <h3 className="ds-h3">{note.title}</h3>
        <span className="ds-help">Note partagée par {note.authorName}</span>
        <p className={s.noteBody}>{note.body}</p>
      </div>
    );
  }
  const save = () => {
    if (!title.trim()) return toast('Donnez un titre à la note.', 'error');
    const input = { title: title.trim(), body, pinned, shared };
    if (note) m.update.mutate({ id: note.id, ...input }, { onSuccess: () => toast('Note enregistrée.', 'success'), onError });
    else m.create.mutate(input, { onSuccess: ({ note: n }) => onSaved(n.id), onError });
  };
  return (
    <div className="ds-stack" style={{ gap: 12 }}>
      <Field label="Titre" htmlFor="note-title">
        <Input id="note-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Le vrai nom" />
      </Field>
      <Field label="Note" htmlFor="note-body">
        <TextArea id="note-body" rows={10} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Ce que votre personnage sait, soupçonne ou a promis…" />
      </Field>
      <div className="ds-row">
        <Toggle checked={pinned} onChange={setPinned}>
          Épinglée
        </Toggle>
        <Toggle checked={shared} onChange={setShared}>
          Partagée avec la table
        </Toggle>
      </div>
      <div className="ds-row">
        <Button variant="primary" onClick={save}>
          Enregistrer
        </Button>
        {note && (
          <Button variant="danger" onClick={() => window.confirm('Supprimer cette note ?') && m.remove.mutate(note.id, { onSuccess: () => onSaved(null) })}>
            Supprimer
          </Button>
        )}
      </div>
    </div>
  );
}

/** Notes personnelles (privées par défaut) ou partagées (FND-17). */
export function NotesTab({ character }: { character: CharacterDto }) {
  const { data: notes = [] } = useNotes(character.id);
  const [selected, setSelected] = useState<string | 'new' | null>(null);
  const [q, setQ] = useState('');
  const current = selected === 'new' ? null : (notes.find((n) => n.id === selected) ?? notes[0] ?? null);
  const filtered = notes.filter((n) => !q || `${n.title} ${n.body}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className={s.notes}>
      <Panel className="ds-stack" style={{ gap: 10 }}>
        <Input placeholder="Rechercher dans les notes…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher dans les notes" />
        <Button variant="secondary" onClick={() => setSelected('new')}>
          + Nouvelle note
        </Button>
        {filtered.map((n) => (
          <button key={n.id} type="button" className={cx(s.noteItem, current?.id === n.id && selected !== 'new' && s.noteItemOn)} onClick={() => setSelected(n.id)}>
            <span className="ds-row" style={{ gap: 6 }}>
              {n.pinned && <span aria-label="Épinglée">◆</span>}
              <strong className="ds-grow">{n.title}</strong>
              {n.shared && <Tag color="var(--arcane-light)">Partagée</Tag>}
            </span>
            <span className="ds-help">
              {n.sessionNo ? `Session ${n.sessionNo} · ` : ''}
              {shortDate(n.updatedAt)} · {n.authorName}
            </span>
          </button>
        ))}
        {notes.length === 0 && <Empty title="Aucune note.">Les notes sont privées tant que vous ne les partagez pas.</Empty>}
      </Panel>
      <Panel>
        {selected === 'new' || current ? <Editor note={current} characterId={character.id} onSaved={(id) => setSelected(id)} /> : <p className="ds-help">Choisissez ou créez une note.</p>}
      </Panel>
    </div>
  );
}
