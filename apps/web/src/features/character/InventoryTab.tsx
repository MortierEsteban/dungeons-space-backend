import { MAX_ATTUNED, type Coins, type ItemEntry } from '@ds/rules';
import type { CharacterDto } from '@ds/shared';
import { useState } from 'react';
import { num, RARITY_COLORS } from '../../shared/format';
import { useDebounced } from '../../shared/hooks';
import { Bar, Button, cx, IconButton, Input, Modal, Panel, Select } from '../../shared/ui/components';
import { useToast } from '../../shared/ui/toast';
import { useCompendium } from '../sanctuary/api';
import { useSheet } from './useSheet';
import s from './character.module.css';

const CONTAINERS = ['Équipé', 'Ceinture', 'Sac à dos'];
const COINS: (keyof Coins)[] = ['pc', 'pa', 'pe', 'po', 'pp'];

function FromSanctuary({ character, open, onClose }: { character: CharacterDto; open: boolean; onClose(): void }) {
  const sh = useSheet(character);
  const [q, setQ] = useState('');
  const query = useDebounced(q, 200);
  const { data = [] } = useCompendium(query, 'item');
  return (
    <Modal open={open} onClose={onClose} title="Ajouter depuis le Sanctuaire" width={620}>
      <div className="ds-stack">
        <Input placeholder="Épée, potion, cape…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus aria-label="Rechercher un objet" />
        <div className={s.pickList}>
          {(data as ItemEntry[]).map((it) => (
            <div key={it.id} className={s.pickRow}>
              <div className="ds-grow">
                <strong style={{ color: RARITY_COLORS[it.rarity] }}>{it.name}</strong>
                <span className="ds-help">
                  {' '}
                  · {it.category} · {num(it.weight)} kg · {num(it.price)} po
                </span>
              </div>
              <Button
                size="sm"
                onClick={() =>
                  sh.act(
                    {
                      type: 'add_item',
                      item: { name: it.name, ref: it.id, qty: 1, weight: it.weight, container: 'Sac à dos', equipped: false, rarity: it.rarity, requiresAttunement: !!it.requiresAttunement, attuned: false, description: it.summary, ...(it.roll ? { roll: it.roll } : {}) },
                    },
                    `${it.name} ajouté à l’inventaire.`,
                  )
                }
              >
                Ajouter
              </Button>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

export function InventoryTab({ character }: { character: CharacterDto }) {
  const sh = useSheet(character);
  const toast = useToast();
  const sheet = character.sheet!;
  const d = character.derived!;
  const [name, setName] = useState('');
  const [container, setContainer] = useState('Sac à dos');
  const [picking, setPicking] = useState(false);
  const containers = [...new Set([...CONTAINERS, ...sheet.inventory.map((i) => i.container)])];
  const attuned = sheet.inventory.filter((i) => i.attuned);

  const add = () => {
    if (!name.trim()) return;
    sh.act({ type: 'add_item', item: { name: name.trim(), qty: 1, weight: 0, container, equipped: container === 'Équipé', rarity: 'Commun', requiresAttunement: false, attuned: false } });
    setName('');
  };
  const edit = (id: string, fn: (item: (typeof sheet.inventory)[number]) => void) => sh.edit((x) => fn(x.inventory.find((i) => i.id === id)!));

  return (
    <div className={s.inventory}>
      <div className="ds-stack" style={{ gap: 14 }}>
        {sh.canEdit && (
          <div className={s.addRow}>
            <Input placeholder="Ajouter un objet (Entrée)…" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} aria-label="Nouvel objet" />
            <Select value={container} onChange={(e) => setContainer(e.target.value)} aria-label="Conteneur">
              {containers.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
            <Button onClick={add}>Ajouter</Button>
            <Button variant="ghost" onClick={() => setPicking(true)}>
              Sanctuaire…
            </Button>
          </div>
        )}
        {containers.map((c) => {
          const items = sheet.inventory.filter((i) => i.container === c);
          if (items.length === 0) return null;
          const weight = items.reduce((a, i) => a + i.qty * i.weight, 0);
          return (
            <Panel key={c} pad={false} className={s.container}>
              <div className={s.containerHead}>
                <span className="ds-label ds-grow">{c}</span>
                <span className="ds-help">{num(weight)} kg</span>
              </div>
              {items.map((it) => (
                <div key={it.id} className={s.itemRow}>
                  <button type="button" className={cx(s.equip, it.equipped && s.equipOn)} disabled={!sh.canEdit} aria-label={it.equipped ? 'Déséquiper' : 'Équiper'} title={it.equipped ? 'Équipé' : 'Non équipé'} onClick={() => edit(it.id, (x) => void (x.equipped = !x.equipped))} />
                  <span className={s.itemName} style={{ color: RARITY_COLORS[it.rarity] === '#a79c8a' ? 'var(--text-strong)' : RARITY_COLORS[it.rarity] }} title={it.description}>
                    {it.name}
                    {it.requiresAttunement && (
                      <button
                        type="button"
                        className={cx(s.attune, it.attuned && s.attuneOn)}
                        disabled={!sh.canEdit}
                        onClick={() => {
                          if (!it.attuned && attuned.length >= MAX_ATTUNED) return toast(`Harmonisation limitée à ${MAX_ATTUNED} objets.`, 'error');
                          edit(it.id, (x) => void (x.attuned = !x.attuned));
                        }}
                      >
                        {it.attuned ? 'Harmonisé' : 'Harmoniser'}
                      </button>
                    )}
                  </span>
                  <div className={s.qty}>
                    <button type="button" disabled={!sh.canEdit || it.qty <= 0} onClick={() => edit(it.id, (x) => void (x.qty = Math.max(0, x.qty - 1)))} aria-label="Retirer un">
                      −
                    </button>
                    <span>{it.qty}</span>
                    <button type="button" disabled={!sh.canEdit} onClick={() => edit(it.id, (x) => void (x.qty += 1))} aria-label="Ajouter un">
                      +
                    </button>
                  </div>
                  <span className={s.itemWeight}>{num(it.qty * it.weight)} kg</span>
                  <Select className={s.itemContainer} value={it.container} disabled={!sh.canEdit} onChange={(e) => edit(it.id, (x) => void ((x.container = e.target.value), (x.equipped = e.target.value === 'Équipé')))} aria-label="Déplacer vers">
                    {containers.map((cc) => (
                      <option key={cc}>{cc}</option>
                    ))}
                  </Select>
                  {sh.canEdit && (
                    <IconButton label={`Retirer ${it.name}`} onClick={() => sh.act({ type: 'remove_item', itemId: it.id })}>
                      ×
                    </IconButton>
                  )}
                </div>
              ))}
            </Panel>
          );
        })}
        {sheet.inventory.length === 0 && <p className="ds-help">Le coffre est encore scellé.</p>}
      </div>
      <div className="ds-stack" style={{ gap: 14 }}>
        <Panel>
          <span className="ds-label">Bourse</span>
          <div className={s.coins}>
            {COINS.map((k) => (
              <label key={k} className={s.coin}>
                <span className="ds-label">{k.toUpperCase()}</span>
                <input
                  key={sheet.coins[k]}
                  inputMode="numeric"
                  defaultValue={sheet.coins[k]}
                  disabled={!sh.canEdit}
                  onBlur={(e) => {
                    const v = Math.max(0, Math.trunc(Number(e.target.value) || 0));
                    if (v !== sheet.coins[k]) sh.edit((x) => void (x.coins[k] = v));
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                  aria-label={`Pièces ${k}`}
                />
              </label>
            ))}
          </div>
        </Panel>
        <Panel>
          <div className="ds-row">
            <span className="ds-label ds-grow">Charge</span>
            <span style={{ color: d.carried > d.capacity ? 'var(--magenta-light)' : 'var(--arcane-light)' }}>
              {num(d.carried)} / {num(d.capacity)} kg
            </span>
          </div>
          <Bar value={d.carried} max={d.capacity} color={d.carried > d.capacity ? 'var(--magenta)' : 'var(--arcane)'} label="Charge" />
        </Panel>
        <Panel>
          <span className="ds-label">
            Harmonisation · {attuned.length} / {MAX_ATTUNED}
          </span>
          <div className="ds-stack" style={{ gap: 6, marginTop: 10 }}>
            {Array.from({ length: MAX_ATTUNED }, (_, i) => (
              <div key={i} className={cx(s.attuneSlot, attuned[i] && s.attuneSlotOn)}>
                {attuned[i] ? `◆ ${attuned[i]!.name}` : 'Emplacement libre'}
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <FromSanctuary character={character} open={picking} onClose={() => setPicking(false)} />
    </div>
  );
}
