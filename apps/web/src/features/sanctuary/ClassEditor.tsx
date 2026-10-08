import { ABILITY_KEYS, ABILITY_LABELS, describeEffect, RECHARGE_LABELS, SKILLS, spellSlotsFor, tryFormula, type AbilityKey, type CasterType, type ClassDefInput, type Effect, type Recharge } from '@ds/rules';
import { useState } from 'react';
import { Button, Chip, cx, Field, IconButton, Input, Select, Stepper, TextArea, Toggle } from '../../shared/ui/components';
import { EffectsEditor } from '../character/EffectsEditor';
import s from './sanctuary.module.css';

/** Mécaniques d'une classe homebrew, stockées dans `mech` (sans id ni nom, portés par la création). */
export type ClassMech = Omit<ClassDefInput, 'id' | 'name'>;

export const CLASS_MECH0: ClassMech = {
  hitDie: 8,
  primary: ['str'],
  saves: ['str', 'con'],
  caster: null,
  skillChoices: { count: 2, from: 'any' },
  features: [{ level: 1, name: 'Aptitude de départ', summary: '', effects: [] }],
  resources: [],
};

const CASTERS: { value: Exclude<CasterType, null> | ''; label: string }[] = [
  { value: '', label: 'Aucune magie' },
  { value: 'full', label: 'Lanceur complet (magicien, clerc…)' },
  { value: 'half', label: 'Demi-lanceur (paladin, rôdeur)' },
  { value: 'third', label: 'Tiers de lanceur (chevalier occulte)' },
  { value: 'pact', label: 'Magie de pacte (occultiste)' },
];

const PRESETS: { label: string; max: string; recharge: Recharge; pool?: boolean }[] = [
  { label: 'Points = niveau (ki)', max: 'level', recharge: 'short', pool: true },
  { label: 'Paliers (rage)', max: '1:2, 3:3, 6:4, 12:5, 17:6', recharge: 'long' },
  { label: 'Modificateur de CHA', max: 'max(1, cha)', recharge: 'long' },
  { label: 'Bonus de maîtrise', max: 'pb', recharge: 'long' },
  { label: 'Réserve 5 × niveau', max: '5 * level', recharge: 'long', pool: true },
];

const ctx = (level: number) => ({ level, pb: 2 + Math.floor((level - 1) / 4), mods: { str: 3, dex: 3, con: 2, int: 3, wis: 3, cha: 3 } });

/** Éditeur de classe homebrew : dé de vie, sauvegardes, magie, ressources (ki, rage…) et aptitudes avec leurs passifs. */
export function ClassEditor({ mech, set }: { mech: ClassMech; set(fn: (m: ClassMech) => void): void }) {
  const [open, setOpen] = useState<number | null>(0);
  const features = [...(mech.features ?? [])].map((f, i) => ({ f, i })).sort((a, b) => a.f.level - b.f.level || a.i - b.i);
  const toggle = <T,>(list: T[], v: T, max = 99) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v].slice(-max));
  const slots = mech.caster ? spellSlotsFor(mech.caster, 5) : {};
  return (
    <div className="ds-stack" style={{ gap: 16 }}>
      <div className={s.mechGrid}>
        <Field label="Dé de vie">
          <Select value={mech.hitDie} onChange={(e) => set((m) => void (m.hitDie = Number(e.target.value)))}>
            {[6, 8, 10, 12].map((d) => (
              <option key={d} value={d}>
                d{d}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Magie">
          <Select value={mech.caster ?? ''} onChange={(e) => set((m) => void ((m.caster = (e.target.value || null) as CasterType), (m.spellAbility = e.target.value ? (m.spellAbility ?? 'int') : undefined)))}>
            {CASTERS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        {mech.caster && (
          <Field label="Caractéristique d'incantation">
            <Select value={mech.spellAbility ?? 'int'} onChange={(e) => set((m) => void (m.spellAbility = e.target.value as AbilityKey))}>
              {ABILITY_KEYS.map((k) => (
                <option key={k} value={k}>
                  {ABILITY_LABELS[k].name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {mech.caster && (
          <span className="ds-help" style={{ alignSelf: 'end' }}>
            Emplacements au niveau 5 : {Object.entries(slots).map(([l, n]) => `${n} × niv ${l}`).join(', ') || 'aucun'}
          </span>
        )}
      </div>
      <div className="ds-stack" style={{ gap: 6 }}>
        <span className="ds-label">Jets de sauvegarde maîtrisés (deux)</span>
        <div className="ds-row" style={{ gap: 6 }}>
          {ABILITY_KEYS.map((k) => (
            <Chip key={k} square active={mech.saves.includes(k)} onClick={() => set((m) => void (m.saves = toggle(m.saves, k, 2) as [AbilityKey, AbilityKey]))}>
              {ABILITY_LABELS[k].short}
            </Chip>
          ))}
        </div>
        <span className="ds-label">Caractéristiques principales</span>
        <div className="ds-row" style={{ gap: 6 }}>
          {ABILITY_KEYS.map((k) => (
            <Chip key={k} square active={(mech.primary ?? []).includes(k)} onClick={() => set((m) => void (m.primary = toggle(m.primary ?? [], k, 3)))}>
              {ABILITY_LABELS[k].short}
            </Chip>
          ))}
        </div>
      </div>
      <div className="ds-stack" style={{ gap: 6 }}>
        <div className="ds-row">
          <span className="ds-label ds-grow">Compétences au choix</span>
          <div style={{ width: 130 }}>
            <Stepper label="Nombre de compétences" value={mech.skillChoices.count} min={0} max={8} onChange={(v) => set((m) => void (m.skillChoices.count = v))} />
          </div>
          <Toggle checked={mech.skillChoices.from === 'any'} onChange={(v) => set((m) => void (m.skillChoices.from = v ? 'any' : ['athletics', 'perception']))}>
            Toutes
          </Toggle>
        </div>
        {mech.skillChoices.from !== 'any' && (
          <div className="ds-row" style={{ gap: 4 }}>
            {SKILLS.map((k) => {
              const from = mech.skillChoices.from as string[];
              return (
                <Chip key={k.key} square active={from.includes(k.key)} onClick={() => set((m) => void (m.skillChoices.from = toggle(m.skillChoices.from as typeof k.key[], k.key)))}>
                  {k.name}
                </Chip>
              );
            })}
          </div>
        )}
      </div>

      <div className="ds-stack" style={{ gap: 8 }}>
        <div className="ds-row">
          <span className="ds-label ds-grow">Ressources (ki, rage, charges…)</span>
          <Button size="sm" variant="ghost" onClick={() => set((m) => void (m.resources = [...(m.resources ?? []), { id: `r${Date.now().toString(36)}`, name: 'Nouvelle ressource', max: 'pb', recharge: 'long', fromLevel: 1, pool: false }]))}>
            + Ressource
          </Button>
        </div>
        {(mech.resources ?? []).map((r, i) => {
          const at = [1, 5, 10, 20].map((l) => tryFormula(r.max, ctx(l)));
          return (
            <div key={r.id} className={s.effectEdit}>
              <div className={s.mechGrid}>
                <Field label="Nom">
                  <Input value={r.name} onChange={(e) => set((m) => void (m.resources![i]!.name = e.target.value))} />
                </Field>
                <Field label="Maximum (formule ou paliers)" error={at.some((v) => v === null) ? 'Formule invalide : level, pb, str…cha, + − × /, min, max, floor ; ou « 1:2, 5:3 ».' : undefined}>
                  <Input value={r.max} onChange={(e) => set((m) => void (m.resources![i]!.max = e.target.value))} placeholder="level, pb, max(1, cha), 1:2, 6:3…" />
                </Field>
                <Field label="Récupération">
                  <Select value={r.recharge ?? 'long'} onChange={(e) => set((m) => void (m.resources![i]!.recharge = e.target.value as Recharge))}>
                    {(Object.keys(RECHARGE_LABELS) as Recharge[]).map((k) => (
                      <option key={k} value={k}>
                        {RECHARGE_LABELS[k]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Dès le niveau">
                  <Stepper label="Niveau d'obtention" value={r.fromLevel ?? 1} min={1} max={20} onChange={(v) => set((m) => void (m.resources![i]!.fromLevel = v))} />
                </Field>
              </div>
              <div className="ds-row" style={{ gap: 6 }}>
                <span className="ds-help ds-grow">Aux niveaux 1 / 5 / 10 / 20 : {at.map((v) => v ?? '?').join(' / ')} (caractéristiques à +3)</span>
                <Toggle checked={!!r.pool} onChange={(v) => set((m) => void (m.resources![i]!.pool = v))}>
                  Réserve de points
                </Toggle>
                <Select value="" onChange={(e) => { const p = PRESETS[Number(e.target.value)]; if (p) set((m) => void Object.assign(m.resources![i]!, { max: p.max, recharge: p.recharge, pool: !!p.pool })); }} aria-label="Modèle de ressource" style={{ width: 'auto', minHeight: 32, fontSize: 13 }}>
                  <option value="">Modèle…</option>
                  {PRESETS.map((p, k) => (
                    <option key={p.label} value={k}>
                      {p.label}
                    </option>
                  ))}
                </Select>
                <IconButton label="Retirer la ressource" onClick={() => set((m) => void (m.resources = m.resources!.filter((_, k) => k !== i)))}>
                  ×
                </IconButton>
              </div>
            </div>
          );
        })}
        {(mech.resources ?? []).length === 0 && <span className="ds-help">Aucune ressource : ajoutez des points de ki, des charges, une réserve de soins…</span>}
      </div>

      <div className="ds-stack" style={{ gap: 8 }}>
        <div className="ds-row">
          <span className="ds-label ds-grow">Aptitudes par niveau · {features.length}</span>
          <Button size="sm" variant="ghost" onClick={() => set((m) => void ((m.features = [...(m.features ?? []), { level: Math.min(20, (m.features?.at(-1)?.level ?? 0) + 1), name: 'Nouvelle aptitude', summary: '', effects: [] }]), setOpen(m.features.length - 1)))}>
            + Aptitude
          </Button>
        </div>
        {features.map(({ f, i }) => (
          <div key={i} className={cx(s.effectEdit, s.featureEdit)}>
            <div className="ds-row" style={{ gap: 8 }}>
              <span className={s.featureLevel}>{f.level}</span>
              <button type="button" className={s.featureTitle} onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
                {f.name || 'Sans nom'}
                {(f.effects ?? []).length > 0 && <span className="ds-help"> · {(f.effects ?? []).map((e) => describeEffect(e as Effect)).join(' · ')}</span>}
              </button>
              <IconButton label="Retirer l'aptitude" onClick={() => set((m) => void (m.features = m.features!.filter((_, k) => k !== i)))}>
                ×
              </IconButton>
            </div>
            {open === i && (
              <div className="ds-stack" style={{ gap: 8 }}>
                <div className={s.mechGrid}>
                  <Field label="Niveau">
                    <Stepper label="Niveau" value={f.level} min={1} max={20} onChange={(v) => set((m) => void (m.features![i]!.level = v))} />
                  </Field>
                  <Field label="Nom">
                    <Input value={f.name} onChange={(e) => set((m) => void (m.features![i]!.name = e.target.value))} />
                  </Field>
                </div>
                <Field label="Description">
                  <TextArea rows={2} value={f.summary ?? ''} onChange={(e) => set((m) => void (m.features![i]!.summary = e.target.value))} />
                </Field>
                <span className="ds-label">Passifs appliqués à la fiche et en combat</span>
                <EffectsEditor effects={(f.effects ?? []) as Effect[]} onChange={(effects) => set((m) => void (m.features![i]!.effects = effects))} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
