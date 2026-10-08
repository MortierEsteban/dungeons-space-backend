import { ABILITY_KEYS, ABILITY_LABELS, CONDITIONS, DAMAGE_TYPES, describeEffect, EFFECT_LABELS, SKILLS, type Effect, type EffectType } from '@ds/rules';
import { IconButton, Input, Select, Toggle } from '../../shared/ui/components';
import s from './character.module.css';

/** Effet par défaut de chaque type, quand on le choisit dans la liste. */
const DEFAULTS: Record<EffectType, Effect> = {
  resistance: { type: 'resistance', damage: 'feu' },
  immunity: { type: 'immunity', damage: 'poison' },
  vulnerability: { type: 'vulnerability', damage: 'contondant' },
  condition_immunity: { type: 'condition_immunity', condition: 'Charmé' },
  advantage: { type: 'advantage', roll: 'save', against: '' },
  skill: { type: 'skill', skill: 'perception', level: 1 },
  save_proficiency: { type: 'save_proficiency', ability: 'con' },
  speed: { type: 'speed', bonus: 3 },
  darkvision: { type: 'darkvision', range: 18 },
  unarmored_ac: { type: 'unarmored_ac', base: 10, abilities: ['dex'], shield: true },
  ac_bonus: { type: 'ac_bonus', value: 1 },
  initiative: { type: 'initiative', bonus: 2 },
  hp_per_level: { type: 'hp_per_level', value: 1 },
  jack_of_all_trades: { type: 'jack_of_all_trades' },
};

const small = { minHeight: 32, padding: '4px 28px 4px 8px', fontSize: 13 } as const;

function Fields({ e, set }: { e: Effect; set(next: Effect): void }) {
  const num = (v: string) => Number(v.replace(',', '.')) || 0;
  const when = 'when' in DEFAULTS[e.type] || ['resistance', 'immunity', 'vulnerability', 'condition_immunity', 'advantage', 'speed', 'ac_bonus'].includes(e.type);
  return (
    <>
      {(e.type === 'resistance' || e.type === 'immunity' || e.type === 'vulnerability') && (
        <Select value={e.damage} onChange={(ev) => set({ ...e, damage: ev.target.value })} aria-label="Type de dégâts" style={small}>
          {[...new Set([...DAMAGE_TYPES, e.damage])].map((d) => (
            <option key={d}>{d}</option>
          ))}
        </Select>
      )}
      {e.type === 'condition_immunity' && (
        <Select value={e.condition} onChange={(ev) => set({ ...e, condition: ev.target.value })} aria-label="État" style={small}>
          {[...new Set([...CONDITIONS.map((c) => c.name), 'Maladie', 'Sommeil magique', e.condition])].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
      )}
      {e.type === 'advantage' && (
        <>
          <Select value={e.roll} onChange={(ev) => set({ ...e, roll: ev.target.value as typeof e.roll })} aria-label="Jet concerné" style={small}>
            <option value="save">Sauvegardes</option>
            <option value="check">Tests</option>
            <option value="attack">Attaques</option>
            <option value="skill">Compétence</option>
          </Select>
          {e.roll === 'skill' ? (
            <Select value={e.skill ?? 'perception'} onChange={(ev) => set({ ...e, skill: ev.target.value as typeof e.skill })} aria-label="Compétence" style={small}>
              {SKILLS.map((k) => (
                <option key={k.key} value={k.key}>
                  {k.name}
                </option>
              ))}
            </Select>
          ) : (
            <Select value={e.ability ?? ''} onChange={(ev) => set({ ...e, ability: (ev.target.value || undefined) as typeof e.ability })} aria-label="Caractéristique" style={small}>
              <option value="">Toutes</option>
              {ABILITY_KEYS.map((k) => (
                <option key={k} value={k}>
                  {ABILITY_LABELS[k].short}
                </option>
              ))}
            </Select>
          )}
          <Input value={e.against ?? ''} onChange={(ev) => set({ ...e, against: ev.target.value || undefined })} placeholder="contre le poison…" aria-label="Situation" style={{ minHeight: 32, fontSize: 13 }} />
        </>
      )}
      {e.type === 'skill' && (
        <>
          <Select value={e.skill} onChange={(ev) => set({ ...e, skill: ev.target.value as typeof e.skill })} aria-label="Compétence" style={small}>
            {SKILLS.map((k) => (
              <option key={k.key} value={k.key}>
                {k.name}
              </option>
            ))}
          </Select>
          <Toggle checked={e.level === 2} onChange={(v) => set({ ...e, level: v ? 2 : 1 })}>
            Expertise
          </Toggle>
        </>
      )}
      {e.type === 'save_proficiency' && (
        <Select value={e.ability} onChange={(ev) => set({ ...e, ability: ev.target.value as typeof e.ability })} aria-label="Caractéristique" style={small}>
          {ABILITY_KEYS.map((k) => (
            <option key={k} value={k}>
              {ABILITY_LABELS[k].short}
            </option>
          ))}
        </Select>
      )}
      {e.type === 'speed' && <Input value={String(e.bonus).replace('.', ',')} onChange={(ev) => set({ ...e, bonus: num(ev.target.value) })} aria-label="Bonus de vitesse en mètres" style={{ width: 80, minHeight: 32 }} />}
      {e.type === 'darkvision' && <Input value={String(e.range).replace('.', ',')} onChange={(ev) => set({ ...e, range: num(ev.target.value) })} aria-label="Portée en mètres" style={{ width: 80, minHeight: 32 }} />}
      {(e.type === 'ac_bonus' || e.type === 'hp_per_level') && <Input value={String(e.value)} onChange={(ev) => set({ ...e, value: Math.trunc(num(ev.target.value)) })} aria-label="Valeur" style={{ width: 70, minHeight: 32 }} />}
      {e.type === 'initiative' && <Input value={String(e.bonus)} onChange={(ev) => set({ ...e, bonus: Math.trunc(num(ev.target.value)) })} aria-label="Bonus" style={{ width: 70, minHeight: 32 }} />}
      {e.type === 'unarmored_ac' && (
        <>
          <Input value={String(e.base)} onChange={(ev) => set({ ...e, base: Math.trunc(num(ev.target.value)) })} aria-label="CA de base" style={{ width: 60, minHeight: 32 }} />
          {ABILITY_KEYS.map((k) => (
            <Toggle key={k} checked={e.abilities.includes(k)} onChange={(v) => set({ ...e, abilities: v ? [...e.abilities, k].slice(0, 3) : e.abilities.filter((a) => a !== k) })}>
              {ABILITY_LABELS[k].short}
            </Toggle>
          ))}
        </>
      )}
      {when && (
        <Input
          value={'when' in e ? (e.when ?? '') : ''}
          onChange={(ev) => set({ ...e, when: ev.target.value || undefined } as Effect)}
          placeholder="Condition (ex. Rage)"
          aria-label="Actif seulement sous l'état"
          style={{ width: 150, minHeight: 32, fontSize: 13 }}
        />
      )}
    </>
  );
}

/**
 * Éditeur des passifs mécaniques (résistances, avantages, CA…) d'un trait, d'une aptitude de classe
 * ou d'un objet. Chaque effet est appliqué par le moteur de règles à la fiche et en combat.
 */
export function EffectsEditor({ effects, onChange, disabled }: { effects: Effect[]; onChange(next: Effect[]): void; disabled?: boolean }) {
  return (
    <div className="ds-stack" style={{ gap: 6 }}>
      {effects.map((e, i) => (
        <div key={i} className={s.effectRow}>
          <Select
            value={e.type}
            disabled={disabled}
            onChange={(ev) => onChange(effects.map((x, k) => (k === i ? DEFAULTS[ev.target.value as EffectType] : x)))}
            aria-label="Type d'effet"
            style={small}
          >
            {(Object.keys(EFFECT_LABELS) as EffectType[]).map((t) => (
              <option key={t} value={t}>
                {EFFECT_LABELS[t]}
              </option>
            ))}
          </Select>
          {!disabled && <Fields e={e} set={(next) => onChange(effects.map((x, k) => (k === i ? next : x)))} />}
          {disabled && <span className="ds-help">{describeEffect(e)}</span>}
          {!disabled && (
            <IconButton label="Retirer l'effet" onClick={() => onChange(effects.filter((_, k) => k !== i))}>
              ×
            </IconButton>
          )}
        </div>
      ))}
      {!disabled && (
        <button type="button" className={s.addEffect} onClick={() => onChange([...effects, DEFAULTS.resistance])}>
          + Passif
        </button>
      )}
    </div>
  );
}
