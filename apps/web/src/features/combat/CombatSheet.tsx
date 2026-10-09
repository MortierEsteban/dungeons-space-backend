import { ABILITY_LABELS, describeEffect, ITEMS, itemActive, spellMechanics, weaponAttack, type Combatant, type KnownSpell, type SpellMechanics, type WeaponAttack } from '@ds/rules';
import type { CharacterDto } from '@ds/shared';
import { useState } from 'react';
import { num, RARITY_COLORS, signed } from '../../shared/format';
import { useDice } from '../../shared/dice/DiceProvider';
import { Button, Chip, cx, Loading, Select, Tag } from '../../shared/ui/components';
import { useToast } from '../../shared/ui/toast';
import { useCharacter } from '../character/api';
import { useSheet } from '../character/useSheet';
import s from './combat.module.css';

export interface CastRequest {
  casterId: string;
  spell: KnownSpell;
  mech: SpellMechanics;
  slotLevel: number;
}

type Tab = 'sorts' | 'objets' | 'aptitudes';

const AREA_LABEL = { sphere: 'Sphère', cylinder: 'Cylindre', cube: 'Cube', cone: 'Cône', line: 'Ligne' } as const;

/** Résumé mécanique d'un sort : gabarit, attaque ou sauvegarde, dégâts. */
function SpellTags({ m }: { m: SpellMechanics }) {
  return (
    <span className={s.spellTags}>
      {m.area && <Tag color="var(--magenta-light)">{`${AREA_LABEL[m.area.shape]} ${num(m.area.size)} m`}</Tag>}
      {m.attack && <Tag color="var(--arcane-light)">Attaque</Tag>}
      {m.save && <Tag color="var(--gold-light)">{`JS ${ABILITY_LABELS[m.save].short}${m.half ? ' · ½' : ''}`}</Tag>}
      {m.roll && <Tag>{`${m.roll}${m.damageType ? ` ${m.damageType}` : m.heal ? ' PV' : ''}`}</Tag>}
      {m.condition && <Tag color="var(--arcane-pale)">{m.condition}</Tag>}
      {m.concentration && <Tag color="var(--arcane-light)">C</Tag>}
      {m.cost === 'bonus' && <Tag>Bonus</Tag>}
      {m.cost === 'reaction' && <Tag>Réaction</Tag>}
    </span>
  );
}

function SpellsList({ character, combatant, onCast }: { character: CharacterDto; combatant: Combatant; onCast(req: CastRequest): void }) {
  const sh = useSheet(character);
  const sc = character.sheet!.spellcasting!;
  const d = character.derived!;
  // Sans sort préparé (fiche peu tenue), on montre tout le grimoire plutôt qu'une liste vide.
  const [all, setAll] = useState(() => !sc.spells.some((x) => x.prepared && x.level > 0));
  const [upcast, setUpcast] = useState<Record<string, number>>({});
  const levels = Object.entries(sc.slots).filter(([, v]) => v.max > 0);
  const free = (lvl: number) => {
    const slot = sc.slots[String(lvl)];
    return !!slot && slot.used < slot.max;
  };
  const spells = sc.spells
    .filter((x) => all || x.prepared || x.level === 0)
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  return (
    <div className="ds-stack" style={{ gap: 10 }}>
      <div className="ds-row" style={{ gap: 6 }}>
        <span className="ds-help ds-grow">
          DD {d.spellSaveDc} · attaque {signed(d.spellAttack ?? 0)}
        </span>
        <Chip active={!all} onClick={() => setAll(false)}>
          Préparés
        </Chip>
        <Chip active={all} onClick={() => setAll(true)}>
          Tous
        </Chip>
      </div>
      {levels.length > 0 && (
        <div className={s.slotRows}>
          {levels.map(([lvl, slot]) => (
            <div key={lvl} className="ds-row" style={{ gap: 4 }}>
              <span className="ds-label" style={{ width: 46, whiteSpace: 'nowrap' }}>
                Niv {lvl}
              </span>
              {Array.from({ length: slot.max }, (_, i) => {
                const used = i >= slot.max - slot.used;
                return (
                  <button
                    key={i}
                    type="button"
                    className={cx(s.slotPip, !used && s.slotPipOn)}
                    disabled={!character.canEdit}
                    aria-label={`Emplacement de niveau ${lvl} ${used ? 'dépensé' : 'disponible'}`}
                    onClick={() => sh.edit((x) => void (x.spellcasting!.slots[lvl]!.used = used ? slot.used - 1 : slot.used + 1))}
                  />
                );
              })}
            </div>
          ))}
        </div>
      )}
      <div className={s.sheetList}>
        {spells.map((sp) => {
          const m = spellMechanics(sp);
          const higher = sp.level === 0 ? [] : levels.map(([l]) => Number(l)).filter((l) => l >= sp.level && free(l));
          const slotLevel = upcast[sp.id] ?? higher[0] ?? sp.level;
          const ready = sp.level === 0 || higher.length > 0;
          return (
            <div key={sp.id} className={s.sheetRow}>
              <div className="ds-grow" style={{ minWidth: 0 }}>
                <div className={s.sheetName} title={sp.description}>
                  {sp.name}
                  <span className="ds-help"> · {sp.level === 0 ? 'tour' : `niv. ${sp.level}`}</span>
                </div>
                <SpellTags m={m} />
              </div>
              <div className={s.sheetActions}>
                {higher.length > 1 && (
                  <Select value={slotLevel} onChange={(e) => setUpcast({ ...upcast, [sp.id]: Number(e.target.value) })} aria-label={`Niveau d'emplacement pour ${sp.name}`} className={s.slotSelect}>
                    {higher.map((l) => (
                      <option key={l} value={l}>
                        niv {l}
                      </option>
                    ))}
                  </Select>
                )}
                <Button size="sm" variant={m.area ? 'secondary' : 'ghost'} disabled={!character.canEdit || !ready} title={ready ? undefined : 'Plus d’emplacement disponible'} onClick={() => onCast({ casterId: combatant.id, spell: sp, mech: m, slotLevel })}>
                  Lancer
                </Button>
              </div>
            </div>
          );
        })}
        {spells.length === 0 && <span className="ds-help">{all ? 'Le grimoire est vide.' : 'Aucun sort préparé : affichez tous les sorts.'}</span>}
      </div>
    </div>
  );
}

function ItemsList({ character, combatant, onWeapon, onHeal }: { character: CharacterDto; combatant: Combatant; onWeapon(attackerId: string, attack: WeaponAttack): void; onHeal(amount: number): void }) {
  const sh = useSheet(character);
  const dice = useDice();
  const toast = useToast();
  const sheet = character.sheet!;
  const items = [...sheet.inventory].sort((a, b) => Number(b.equipped) - Number(a.equipped) || a.name.localeCompare(b.name));
  // Potion : jet de l'objet (Forge) ou du compendium.
  const potionRoll = (it: (typeof items)[number]) => it.roll ?? ITEMS.find((e) => e.category === 'Potion' && (e.id === it.ref || e.name.toLowerCase() === it.name.toLowerCase()))?.roll;
  const drink = async (it: (typeof items)[number], roll: string) => {
    const r = await dice.roll(character.campaignId, `${it.name} — ${character.name.split(' ')[0]}`, roll, { characterId: character.id });
    if (!r) return toast('Jet impossible.', 'error');
    onHeal(r.total);
    sh.edit((x) => {
      const item = x.inventory.find((i) => i.id === it.id);
      if (item) item.qty = Math.max(0, item.qty - 1);
    });
  };
  return (
    <div className="ds-stack" style={{ gap: 10 }}>
      <div className="ds-row" style={{ gap: 10 }}>
        <span className="ds-help ds-grow">
          {num(character.derived!.carried)} / {num(character.derived!.capacity)} kg
        </span>
        <span className="ds-help">{(['pp', 'po', 'pa', 'pc'] as const).map((k) => `${sheet.coins[k]} ${k}`).join(' · ')}</span>
      </div>
      <div className={s.sheetList}>
        {items.map((it) => {
          const weapon = weaponAttack(sheet, it);
          const roll = potionRoll(it);
          const active = itemActive(it);
          return (
            <div key={it.id} className={s.sheetRow}>
              <button type="button" className={cx(s.equipDot, it.equipped && s.equipDotOn)} disabled={!character.canEdit} aria-label={it.equipped ? `Déséquiper ${it.name}` : `Équiper ${it.name}`} title={it.equipped ? 'Équipé' : 'Non équipé'} onClick={() => sh.edit((x) => void (x.inventory.find((i) => i.id === it.id)!.equipped = !it.equipped))} />
              <div className="ds-grow" style={{ minWidth: 0 }}>
                <div className={s.sheetName} style={{ color: it.rarity === 'Commun' ? undefined : RARITY_COLORS[it.rarity] }} title={it.description}>
                  {it.name}
                  {it.qty > 1 && <span className="ds-help"> ×{it.qty}</span>}
                </div>
                <span className={s.spellTags}>
                  {weapon && <Tag>{`${signed(weapon.bonus)} · ${weapon.damage} ${weapon.damageType}`}</Tag>}
                  {roll && <Tag color="var(--arcane-light)">{`${roll} PV`}</Tag>}
                  {it.requiresAttunement && <Tag color={it.attuned ? 'var(--gold-light)' : undefined}>{it.attuned ? 'Harmonisé' : 'Harmonisation'}</Tag>}
                  {active && it.effects?.map((e, i) => <Tag key={i} color="var(--arcane-pale)">{describeEffect(e)}</Tag>)}
                </span>
              </div>
              {weapon && character.canEdit && (
                <Button size="sm" variant="secondary" onClick={() => onWeapon(combatant.id, weapon)}>
                  Attaquer
                </Button>
              )}
              {roll && character.canEdit && it.qty > 0 && (
                <Button size="sm" variant="heal" onClick={() => void drink(it, roll)}>
                  Boire
                </Button>
              )}
            </div>
          );
        })}
        {items.length === 0 && <span className="ds-help">Inventaire vide.</span>}
      </div>
    </div>
  );
}

function Abilities({ character }: { character: CharacterDto }) {
  const sh = useSheet(character);
  const d = character.derived!;
  const [open, setOpen] = useState<string | null>(null);
  const defs = [
    ...d.resistances.map((r) => `Résistance ${r.damage}${r.when ? ` (${r.when})` : ''}`),
    ...d.immunities.map((r) => `Immunité ${r.damage}`),
    ...d.conditionImmunities.map((r) => `Immunité : ${r.condition}`),
  ];
  return (
    <div className="ds-stack" style={{ gap: 10 }}>
      {d.resources.length > 0 && (
        <div className="ds-stack" style={{ gap: 8 }}>
          {d.resources.map((r) => (
            <div key={r.id} className={s.resourceRow}>
              <span className="ds-grow">
                <strong>{r.name}</strong>
                <span className="ds-help"> · {r.recharge === 'short' ? 'repos court' : r.recharge === 'long' ? 'repos long' : 'manuelle'}</span>
              </span>
              {r.pool || r.max > 8 ? (
                <span className={s.hpText} style={{ fontSize: 16 }}>
                  {r.max - r.used} / {r.max}
                </span>
              ) : (
                Array.from({ length: r.max }, (_, i) => <span key={i} className={cx(s.slotPip, i < r.max - r.used && s.slotPipOn)} />)
              )}
              <Button size="sm" variant="ghost" disabled={!character.canEdit || r.used >= r.max} onClick={() => sh.act({ type: 'use_resource', resourceId: r.id, amount: 1 })} aria-label={`Dépenser ${r.name}`}>
                −1
              </Button>
              <Button size="sm" variant="ghost" disabled={!character.canEdit || r.used <= 0} onClick={() => sh.act({ type: 'use_resource', resourceId: r.id, amount: -1 })} aria-label={`Récupérer ${r.name}`}>
                +1
              </Button>
            </div>
          ))}
        </div>
      )}
      {defs.length > 0 && (
        <div className={s.spellTags}>
          {defs.map((t) => (
            <Tag key={t} color="var(--arcane-pale)">
              {t}
            </Tag>
          ))}
        </div>
      )}
      {d.advantages.length > 0 && <span className="ds-help">{d.advantages.map((a) => a.label).join(' · ')}</span>}
      <div className={s.sheetList}>
        {d.traits.map((t, i) => (
          <button key={`${t.name}${i}`} type="button" className={s.traitRow} onClick={() => setOpen(open === t.name ? null : t.name)} aria-expanded={open === t.name}>
            <span className="ds-row" style={{ gap: 6 }}>
              <strong className="ds-grow">{t.name}</strong>
              <span className="ds-help">{t.source}</span>
            </span>
            {open === t.name && t.description && <span className={s.traitText}>{t.description}</span>}
            {t.effects.length > 0 && (
              <span className={s.spellTags}>
                {t.effects.map((e, k) => (
                  <Tag key={k} color="var(--arcane-pale)">
                    {describeEffect(e)}
                  </Tag>
                ))}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Fiche du personnage pendant le combat : sorts (lancés sur le plateau avec leur gabarit),
 * objets (attaques d'arme, potions) et aptitudes (ressources, passifs).
 */
export function CombatSheet({ combatant, onCast, onWeapon, onHeal }: { combatant: Combatant; onCast(req: CastRequest): void; onWeapon(attackerId: string, attack: WeaponAttack): void; onHeal(combatantId: string, amount: number): void }) {
  const { data: character, isLoading } = useCharacter(combatant.characterId);
  const sheet = character?.sheet;
  const [tab, setTab] = useState<Tab | null>(null);
  if (isLoading || !character) return <Loading label="La fiche s’ouvre…" />;
  if (!sheet) return <span className="ds-help">Ce personnage n’a pas de fiche.</span>;
  // Par défaut : les sorts pour un lanceur de sorts, sinon les objets.
  const current = !tab || (tab === 'sorts' && !sheet.spellcasting) ? (sheet.spellcasting ? 'sorts' : 'objets') : tab;
  return (
    <div className="ds-stack" style={{ gap: 10 }}>
      <div className="ds-row" style={{ gap: 8 }}>
        <strong className="ds-grow" style={{ fontFamily: 'var(--font-title)', color: 'var(--text-strong)' }}>
          {character.name}
        </strong>
        <span className="ds-help">
          {sheet.className} {sheet.level} · CA {character.derived!.armorClass}
        </span>
      </div>
      <div className={s.subTabs} role="tablist" aria-label="Fiche">
        {sheet.spellcasting && (
          <button type="button" role="tab" aria-selected={current === 'sorts'} className={cx(current === 'sorts' && s.subTabOn)} onClick={() => setTab('sorts')}>
            Sorts
          </button>
        )}
        <button type="button" role="tab" aria-selected={current === 'objets'} className={cx(current === 'objets' && s.subTabOn)} onClick={() => setTab('objets')}>
          Objets · {sheet.inventory.length}
        </button>
        <button type="button" role="tab" aria-selected={current === 'aptitudes'} className={cx(current === 'aptitudes' && s.subTabOn)} onClick={() => setTab('aptitudes')}>
          Aptitudes
        </button>
      </div>
      {current === 'sorts' && <SpellsList character={character} combatant={combatant} onCast={onCast} />}
      {current === 'objets' && <ItemsList character={character} combatant={combatant} onWeapon={onWeapon} onHeal={(amount) => onHeal(combatant.id, amount)} />}
      {current === 'aptitudes' && <Abilities character={character} />}
    </div>
  );
}
