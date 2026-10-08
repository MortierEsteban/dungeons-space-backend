import type { SpellEntry } from '@ds/rules';
import type { CharacterDto } from '@ds/shared';
import { useState } from 'react';
import { useDice } from '../../shared/dice/DiceProvider';
import { useDebounced } from '../../shared/hooks';
import { Button, Chip, cx, Input, Modal, Panel, PanelTitle, Tag } from '../../shared/ui/components';
import { useCompendium } from '../sanctuary/api';
import { useSheet } from './useSheet';
import s from './character.module.css';

type Filter = 'all' | 'prepared' | 'favorite';

function AddSpell({ character, open, onClose }: { character: CharacterDto; open: boolean; onClose(): void }) {
  const sh = useSheet(character);
  const [q, setQ] = useState('');
  const query = useDebounced(q, 200);
  const { data: entries = [] } = useCompendium(query, 'spell');
  const known = new Set(character.sheet!.spellcasting?.spells.map((x) => x.ref));
  const spells = (entries as SpellEntry[]).filter((e) => e.classes.includes(character.sheet!.className) || q);
  return (
    <Modal open={open} onClose={onClose} title="Apprendre un sort" width={620}>
      <div className="ds-stack">
        <Input placeholder="Rechercher un sort…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus aria-label="Rechercher un sort" />
        <p className="ds-help">{q ? 'Tous les sorts du SRD.' : `Sorts accessibles à la classe ${character.sheet!.className}.`}</p>
        <div className={s.pickList}>
          {spells.map((sp) => (
            <div key={sp.id} className={s.pickRow}>
              <div className="ds-grow">
                <strong>{sp.name}</strong>
                <span className="ds-help">
                  {' '}
                  · {sp.level === 0 ? 'Tour de magie' : `Niveau ${sp.level}`} · {sp.school}
                </span>
              </div>
              <Button
                size="sm"
                disabled={known.has(sp.id)}
                onClick={() =>
                  sh.act(
                    {
                      type: 'add_spell',
                      spell: {
                        ref: sp.id, name: sp.name, level: sp.level, school: sp.school, castingTime: sp.castingTime, range: sp.range, duration: sp.duration,
                        concentration: sp.concentration, ritual: sp.ritual, prepared: sp.level === 0, favorite: false, description: sp.summary, ...(sp.roll ? { roll: sp.roll } : {}),
                      },
                    },
                    `${sp.name} rejoint le grimoire.`,
                  )
                }
              >
                {known.has(sp.id) ? 'Connu' : 'Apprendre'}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

export function SpellsTab({ character }: { character: CharacterDto }) {
  const sh = useSheet(character);
  const dice = useDice();
  const sc = character.sheet!.spellcasting!;
  const d = character.derived!;
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const spells = sc.spells
    .filter((x) => filter === 'all' || (filter === 'prepared' ? x.prepared || x.level === 0 : x.favorite))
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  const levels = Object.entries(sc.slots).filter(([, v]) => v.max > 0);

  const cast = (id: string) => {
    const spell = sc.spells.find((x) => x.id === id)!;
    const slot = sc.slots[String(spell.level)];
    sh.act({ type: 'cast_spell', spellId: id, slotLevel: spell.level });
    const hasSlot = spell.level === 0 || (!!slot && slot.used < slot.max);
    if (spell.roll && hasSlot) void dice.roll(character.campaignId, spell.name, spell.roll, { characterId: character.id });
  };

  return (
    <Panel>
      <PanelTitle
        actions={
          <div className="ds-row">
            <span className="ds-help">
              DD {d.spellSaveDc} · attaque {d.spellAttack !== null && d.spellAttack >= 0 ? '+' : ''}
              {d.spellAttack}
            </span>
            {sh.canEdit && (
              <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
                + Apprendre
              </Button>
            )}
          </div>
        }
      >
        Grimoire
      </PanelTitle>
      <div className={s.slots}>
        {levels.map(([lvl, slot]) => (
          <div key={lvl} className="ds-row" style={{ gap: 6 }}>
            <span className="ds-label">Niv {lvl}</span>
            {Array.from({ length: slot.max }, (_, i) => {
              const used = i >= slot.max - slot.used;
              return (
                <button
                  key={i}
                  type="button"
                  className={cx(s.slot, !used && s.slotOn)}
                  disabled={!sh.canEdit}
                  aria-label={`Emplacement de niveau ${lvl} ${used ? 'dépensé' : 'disponible'}`}
                  onClick={() => sh.edit((x) => void (x.spellcasting!.slots[lvl]!.used = used ? slot.used - 1 : slot.used + 1))}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="ds-row" style={{ margin: '12px 0' }}>
        {(['all', 'prepared', 'favorite'] as Filter[]).map((f) => (
          <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>
            {f === 'all' ? 'Tous' : f === 'prepared' ? 'Préparés' : 'Favoris'}
          </Chip>
        ))}
      </div>
      <div className={s.spellList}>
        {spells.map((sp) => (
          <div key={sp.id} className={s.spell}>
            <div className={s.spellRow}>
              <button
                type="button"
                className={cx(s.prepDot, (sp.prepared || sp.level === 0) && s.prepOn)}
                title={sp.prepared ? 'Préparé' : 'Non préparé'}
                aria-label={`${sp.name} : ${sp.prepared ? 'préparé' : 'non préparé'}`}
                disabled={!sh.canEdit || sp.level === 0}
                onClick={() => sh.edit((x) => void (x.spellcasting!.spells.find((y) => y.id === sp.id)!.prepared = !sp.prepared))}
              />
              <button type="button" className={s.spellName} style={{ color: sp.prepared || sp.level === 0 ? 'var(--text-strong)' : 'var(--ash)' }} onClick={() => setOpen(open === sp.id ? null : sp.id)} aria-expanded={open === sp.id}>
                {sp.name}
              </button>
              <button type="button" className={cx(s.fav, sp.favorite && s.favOn)} aria-label="Favori" disabled={!sh.canEdit} onClick={() => sh.edit((x) => void (x.spellcasting!.spells.find((y) => y.id === sp.id)!.favorite = !sp.favorite))}>
                ★
              </button>
              <span className="ds-help">{sp.level === 0 ? 'Tour' : `Niveau ${sp.level}`}</span>
              {sh.canEdit && (
                <Button size="sm" variant="ghost" onClick={() => cast(sp.id)}>
                  Lancer
                </Button>
              )}
            </div>
            {open === sp.id && (
              <div className={s.spellBody}>
                <div className="ds-row" style={{ gap: 6 }}>
                  {sp.school && <Tag>{sp.school}</Tag>}
                  {sp.castingTime && <Tag>{sp.castingTime}</Tag>}
                  {sp.range && <Tag>{sp.range}</Tag>}
                  {sp.duration && <Tag>{sp.duration}</Tag>}
                  {sp.concentration && <Tag color="var(--arcane-light)">Concentration</Tag>}
                  {sp.ritual && <Tag color="var(--gold-light)">Rituel</Tag>}
                </div>
                {sp.description && <p>{sp.description}</p>}
              </div>
            )}
          </div>
        ))}
        {spells.length === 0 && <p className="ds-help">Le grimoire est encore vierge.</p>}
      </div>
      <p className="ds-help">● = sort préparé · lancer un sort consomme un emplacement du niveau correspondant.</p>
      <AddSpell character={character} open={adding} onClose={() => setAdding(false)} />
    </Panel>
  );
}
