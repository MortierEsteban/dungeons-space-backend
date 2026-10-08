import { ABILITY_KEYS, ABILITY_LABELS, describeEffect, type AbilityKey, type DerivedTrait, type Effect } from '@ds/rules';
import type { CharacterDto } from '@ds/shared';
import { useState } from 'react';
import { signed } from '../../shared/format';
import { Button, cx, Input, Panel, PanelTitle, Select, Stepper, Tag } from '../../shared/ui/components';
import { EffectsEditor } from './EffectsEditor';
import { useSheet } from './useSheet';
import s from './character.module.css';

/** Ressources de classe et d'espèce (rage, ki, conduit divin…) : cases à cocher ou réserve. */
function Resources({ character }: { character: CharacterDto }) {
  const sh = useSheet(character);
  const d = character.derived!;
  if (d.resources.length === 0) return null;
  return (
    <Panel className={s.span2}>
      <PanelTitle>Ressources</PanelTitle>
      <div className={s.resources}>
        {d.resources.map((r) => (
          <div key={r.id} className={s.resource}>
            <span className="ds-grow">
              <strong>{r.name}</strong>
              <span className="ds-help">
                {' '}
                · {r.source} · {r.recharge === 'short' ? 'repos court' : r.recharge === 'long' ? 'repos long' : 'recharge manuelle'}
              </span>
            </span>
            {r.pool || r.max > 10 ? (
              <strong className={s.hpValue} style={{ fontSize: 20 }}>
                {r.max - r.used} <span className="ds-muted">/ {r.max}</span>
              </strong>
            ) : (
              Array.from({ length: r.max }, (_, i) => <span key={i} className={cx(s.resourcePip, i < r.max - r.used && s.resourcePipOn)} />)
            )}
            {sh.canEdit && (
              <>
                <Button size="sm" variant="ghost" disabled={r.used >= r.max} onClick={() => sh.act({ type: 'use_resource', resourceId: r.id, amount: r.pool ? Math.min(5, r.max - r.used) : 1 })}>
                  {r.pool ? '−5' : 'Utiliser'}
                </Button>
                {r.pool && (
                  <Button size="sm" variant="ghost" disabled={r.used >= r.max} onClick={() => sh.act({ type: 'use_resource', resourceId: r.id, amount: 1 })}>
                    −1
                  </Button>
                )}
                <Button size="sm" variant="ghost" disabled={r.used <= 0} onClick={() => sh.act({ type: 'use_resource', resourceId: r.id, amount: -r.used })}>
                  Restaurer
                </Button>
              </>
            )}
          </div>
        ))}
      </div>
    </Panel>
  );
}

/** Traits et aptitudes, avec leurs passifs ; en mode « Ajuster », les passifs se modifient et on ajoute des traits (dons, bénédictions…). */
function Traits({ character, adjust }: { character: CharacterDto; adjust: boolean }) {
  const sh = useSheet(character);
  const d = character.derived!;
  const [name, setName] = useState('');
  const save = (t: DerivedTrait, effects: Effect[]) =>
    sh.edit((x) => {
      const i = x.traits.findIndex((y) => y.name === t.name && y.source === t.source);
      if (i >= 0) x.traits[i] = { ...x.traits[i]!, effects };
      else x.traits.push({ name: t.name, source: t.source, description: t.description, effects });
    });
  const remove = (t: DerivedTrait) => sh.edit((x) => void (x.traits = x.traits.filter((y) => !(y.name === t.name && y.source === t.source))));
  return (
    <Panel className={s.span2}>
      <PanelTitle>Capacités & traits</PanelTitle>
      <div className={s.traits}>
        {d.traits.map((t, i) => (
          <div key={`${t.name}${i}`} className={s.trait}>
            <div className="ds-row">
              <strong className="ds-grow">{t.name}</strong>
              <span className="ds-help">{t.source}</span>
              {adjust && sh.canEdit && !t.fromCatalog && !t.source.includes(' ') && t.source !== character.sheet!.species && (
                <Button size="sm" variant="link" onClick={() => remove(t)}>
                  Retirer
                </Button>
              )}
            </div>
            {t.description && <p>{t.description}</p>}
            {adjust && sh.canEdit ? (
              <EffectsEditor effects={t.effects} onChange={(effects) => save(t, effects)} />
            ) : (
              t.effects.length > 0 && (
                <div className={s.effectTags}>
                  {t.effects.map((e, k) => (
                    <Tag key={k} color="var(--arcane-light)">
                      {describeEffect(e)}
                    </Tag>
                  ))}
                </div>
              )
            )}
          </div>
        ))}
        {d.traits.length === 0 && <p className="ds-help">Aucun trait consigné.</p>}
      </div>
      {adjust && sh.canEdit && (
        <div className="ds-row" style={{ marginTop: 12 }}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nouveau trait (don, bénédiction, malédiction…)" aria-label="Nom du trait" style={{ flex: 1 }} />
          <Button
            size="sm"
            disabled={!name.trim()}
            onClick={() => {
              sh.edit((x) => void x.traits.push({ name: name.trim(), source: 'Personnel', description: '', effects: [] }));
              setName('');
            }}
          >
            Ajouter
          </Button>
        </div>
      )}
      {adjust && <p className="ds-help">Les passifs (résistances, avantages, CA, vitesse…) sont appliqués automatiquement sur la fiche et en combat.</p>}
    </Panel>
  );
}

const PROF_LABEL = { 0: 'Non maîtrisée', 0.5: 'Touche-à-tout', 1: 'Maîtrise', 2: 'Expertise' } as const;

export function SheetOverview({ character, onRoll }: { character: CharacterDto; onRoll(label: string, mod: number): void }) {
  const sh = useSheet(character);
  const sheet = character.sheet!;
  const d = character.derived!;
  const [adjust, setAdjust] = useState(false);
  const [hitDice, setHitDice] = useState(1);
  const remainingHd = sheet.hitDice.total - sheet.hitDice.used;

  return (
    <div className={s.overview}>
      <Panel className={s.span2}>
        <PanelTitle
          actions={
            sh.canEdit && (
              <Button size="sm" variant={adjust ? 'heal' : 'ghost'} onClick={() => setAdjust(!adjust)}>
                {adjust ? 'Terminer' : 'Ajuster'}
              </Button>
            )
          }
        >
          Caractéristiques
        </PanelTitle>
        <div className={s.abilities}>
          {ABILITY_KEYS.map((k) => (
            <div key={k} className={s.ability}>
              <button type="button" className={s.abilityBtn} onClick={() => onRoll(`Test de ${ABILITY_LABELS[k].short}`, d.modifiers[k])} title={`Test de ${ABILITY_LABELS[k].name}`}>
                <span className="ds-label">{ABILITY_LABELS[k].short}</span>
                <strong>{signed(d.modifiers[k])}</strong>
                <span className={s.score}>{sheet.abilities[k]}</span>
              </button>
              {adjust && <Stepper label={`Score de ${ABILITY_LABELS[k].name}`} value={sheet.abilities[k]} min={1} max={30} onChange={(v) => sh.edit((x) => void (x.abilities[k] = v))} />}
            </div>
          ))}
        </div>
        {adjust && (
          <div className={s.adjustRow}>
            <span className="ds-label">Classe d’armure</span>
            <Stepper label="Classe d'armure" value={sheet.armorClass} min={0} max={40} onChange={(v) => sh.edit((x) => void (x.armorClass = v))} />
            <span className="ds-label">Vitesse (m)</span>
            <Stepper label="Vitesse" value={sheet.speed} step={1.5} min={0} max={100} onChange={(v) => sh.edit((x) => void (x.speed = v))} />
          </div>
        )}
        <p className="ds-help">Cliquez sur une caractéristique pour lancer un test (d20 + modificateur).</p>
      </Panel>

      <Panel>
        <PanelTitle>Jets de sauvegarde</PanelTitle>
        <div className={s.saves}>
          {ABILITY_KEYS.map((k) => (
            <button key={k} type="button" className={s.lineBtn} onClick={() => onRoll(`Sauvegarde de ${ABILITY_LABELS[k].short}`, d.saves[k].value)} title={d.saves[k].advantages?.length ? `Avantage : ${d.saves[k].advantages.join(' ; ')}` : undefined}>
              <span className={cx(s.profDot, d.saves[k].proficient && s.profOn)} />
              <span className="ds-grow">
                {ABILITY_LABELS[k].short}
                {d.saves[k].advantages?.length ? <span className={s.catalogTag}> · avantage</span> : null}
              </span>
              <strong>{signed(d.saves[k].value)}</strong>
            </button>
          ))}
        </div>
      </Panel>

      <Panel>
        <PanelTitle>Défenses & survie</PanelTitle>
        <dl className={s.defs}>
          <dt className="ds-label">Résistances</dt>
          <dd>{d.resistances?.map((r) => `${r.damage}${r.when ? ` (${r.when})` : ''}`).join(', ') || '—'}</dd>
          <dt className="ds-label">Immunités</dt>
          <dd>{[...(d.immunities ?? []).map((r) => r.damage), ...(d.conditionImmunities ?? []).map((r) => r.condition)].join(', ') || '—'}</dd>
          {d.vulnerabilities?.length > 0 && (
            <>
              <dt className="ds-label">Vulnérabilités</dt>
              <dd>{d.vulnerabilities.map((r) => r.damage).join(', ')}</dd>
            </>
          )}
          {d.advantages?.length > 0 && (
            <>
              <dt className="ds-label">Avantages</dt>
              <dd>{d.advantages.map((a) => a.label).join(' · ')}</dd>
            </>
          )}
          <dt className="ds-label">Sens</dt>
          <dd>
            {[d.senses ?? sheet.defenses.senses, `Perception passive ${d.passivePerception}`].filter(Boolean).join(' · ')}
          </dd>
          <dt className="ds-label">Dés de vie</dt>
          <dd className="ds-row" style={{ gap: 4 }}>
            {Array.from({ length: sheet.hitDice.total }, (_, i) => (
              <span key={i} className={cx(s.hd, i < remainingHd && s.hdOn)}>
                d{sheet.hitDice.die}
              </span>
            ))}
          </dd>
          <dt className="ds-label">Jets contre la mort</dt>
          <dd className="ds-row" style={{ gap: 6 }}>
            {[0, 1, 2].map((i) => (
              <button key={`s${i}`} type="button" aria-label="Succès" disabled={!sh.canEdit || sheet.hp.current > 0} className={cx(s.death, s.deathOk, i < sheet.deathSaves.successes && s.deathOn)} onClick={() => sh.act({ type: 'death_save', success: true })} />
            ))}
            <span style={{ width: 10 }} />
            {[0, 1, 2].map((i) => (
              <button key={`f${i}`} type="button" aria-label="Échec" disabled={!sh.canEdit || sheet.hp.current > 0} className={cx(s.death, s.deathKo, i < sheet.deathSaves.failures && s.deathOn)} onClick={() => sh.act({ type: 'death_save', success: false })} />
            ))}
          </dd>
        </dl>
        {sh.canEdit && (
          <div className={s.rest}>
            <Select value={hitDice} onChange={(e) => setHitDice(Number(e.target.value))} aria-label="Dés de vie à dépenser" style={{ width: 'auto' }}>
              {Array.from({ length: remainingHd + 1 }, (_, i) => (
                <option key={i} value={i}>
                  {i} dé{i > 1 ? 's' : ''}
                </option>
              ))}
            </Select>
            <Button size="sm" variant="ghost" onClick={() => sh.act({ type: 'short_rest', hitDice }, 'Repos court terminé.')}>
              Repos court
            </Button>
            <Button size="sm" variant="secondary" onClick={() => sh.act({ type: 'long_rest' }, 'Repos long : forces restaurées.')}>
              Repos long
            </Button>
          </div>
        )}
      </Panel>

      <Panel className={s.span2}>
        <PanelTitle>Compétences</PanelTitle>
        <div className={s.skills}>
          {d.skills.map((sk) => (
            <div key={sk.key} className={s.skill}>
              <button
                type="button"
                className={cx(s.profDot, sk.level > 0 && s.profOn, sk.level === 2 && s.profExpert)}
                title={PROF_LABEL[sk.level]}
                disabled={!sh.canEdit}
                aria-label={`${sk.name} : ${PROF_LABEL[sk.level]} (cliquer pour changer)`}
                onClick={() => sh.edit((x) => void (x.skills[sk.key] = sk.level === 0 ? 1 : sk.level === 1 ? 2 : 0))}
              />
              <button type="button" className={s.skillName} onClick={() => onRoll(sk.name, sk.value)}>
                {sk.name} <span className="ds-muted">({ABILITY_LABELS[sk.ability as AbilityKey].short})</span>
              </button>
              <strong>{signed(sk.value)}</strong>
            </div>
          ))}
        </div>
      </Panel>

      <Resources character={character} />
      <Traits character={character} adjust={adjust} />
    </div>
  );
}
