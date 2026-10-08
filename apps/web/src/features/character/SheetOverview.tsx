import { ABILITY_KEYS, ABILITY_LABELS, type AbilityKey } from '@ds/rules';
import type { CharacterDto } from '@ds/shared';
import { useState } from 'react';
import { signed } from '../../shared/format';
import { Button, cx, Panel, PanelTitle, Select, Stepper } from '../../shared/ui/components';
import { useSheet } from './useSheet';
import s from './character.module.css';

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
            <button key={k} type="button" className={s.lineBtn} onClick={() => onRoll(`Sauvegarde de ${ABILITY_LABELS[k].short}`, d.saves[k].value)}>
              <span className={cx(s.profDot, d.saves[k].proficient && s.profOn)} />
              <span className="ds-grow">{ABILITY_LABELS[k].short}</span>
              <strong>{signed(d.saves[k].value)}</strong>
            </button>
          ))}
        </div>
      </Panel>

      <Panel>
        <PanelTitle>Défenses & survie</PanelTitle>
        <dl className={s.defs}>
          <dt className="ds-label">Résistances</dt>
          <dd>{sheet.defenses.resistances.join(', ') || '—'}</dd>
          <dt className="ds-label">Immunités</dt>
          <dd>{sheet.defenses.immunities.join(', ') || '—'}</dd>
          <dt className="ds-label">Sens</dt>
          <dd>
            {[sheet.defenses.senses, `Perception passive ${d.passivePerception}`].filter(Boolean).join(' · ')}
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

      <Panel className={s.span2}>
        <PanelTitle>Capacités & traits</PanelTitle>
        <div className={s.traits}>
          {sheet.traits.map((t, i) => (
            <div key={`${t.name}${i}`} className={s.trait}>
              <div className="ds-row">
                <strong className="ds-grow">{t.name}</strong>
                <span className="ds-help">{t.source}</span>
              </div>
              {t.description && <p>{t.description}</p>}
            </div>
          ))}
          {sheet.traits.length === 0 && <p className="ds-help">Aucun trait consigné.</p>}
        </div>
      </Panel>
    </div>
  );
}
