import {
  CONDITIONS,
  describeCombatEvent,
  initiativeOrder,
  MONSTERS,
  OBJECT_KINDS,
  TERRAIN_KINDS,
  ZONE_SHAPES,
  type Combatant,
  type CombatState,
  type ZoneShape,
} from '@ds/rules';
import type { CharacterSummaryDto, CombatEventEnvelope } from '@ds/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { errorMessage, http, qk } from '../../shared/api/client';
import { num } from '../../shared/format';
import { Bar, Button, Chip, cx, IconButton, Input, Select, Stepper, Toggle } from '../../shared/ui/components';
import { ImageDrop } from '../../shared/ui/ImageDrop';
import { useToast } from '../../shared/ui/toast';
import { useCurrentCampaign } from '../campaigns/CampaignContext';
import type { CommandInput } from './api';
import { ModelDrop } from './ModelDrop';
import { conditionColor, OBJECT_META, TERRAIN_META, type Tool, type ToolOptions } from './Board';
import s from './combat.module.css';

type Send = (cmd: CommandInput) => void;

export const hpText = (c: Combatant) => (c.hp !== null ? `${c.hp} / ${c.maxHp}` : c.hpBand);
const pctOf = (c: Combatant) => (c.hp !== null && c.maxHp ? c.hp / c.maxHp : { Indemne: 1, Blessé: 0.7, Sanglant: 0.45, Agonisant: 0.2, 'À terre': 0 }[c.hpBand]);

// ───────────────────────────── Barre d'initiative ─────────────────────────────

export function InitiativeBar({ state, isGm, canEndTurn, onSelect, send }: { state: CombatState; isGm: boolean; canEndTurn: boolean; onSelect(id: string): void; send: Send }) {
  const order = initiativeOrder(state);
  return (
    <div className={s.initBar}>
      <div className={s.round}>
        <span className="ds-label">Round</span>
        <strong>{state.round || '—'}</strong>
      </div>
      <div className={s.initList}>
        {order.map((c) => {
          const active = c.id === state.activeId;
          return (
            <button key={c.id} type="button" className={cx(s.initItem, active && s.initActive, c.hpBand === 'À terre' && s.tokenDead)} onClick={() => onSelect(c.id)} title={`${c.name} · initiative ${c.initiative ?? '—'}`}>
              <span className={s.initDisc} style={{ borderColor: c.side === 'ally' ? 'var(--arcane)' : 'var(--magenta)', background: c.side === 'ally' ? '#1d2f4a' : '#3a1428' }}>
                {c.short}
                <em>{c.initiative ?? '·'}</em>
              </span>
              <span className={s.initName}>{c.name}</span>
              <span className={s.initHp}>
                <span style={{ width: `${pctOf(c) * 100}%`, background: pctOf(c) < 0.34 ? 'var(--magenta-light)' : c.side === 'ally' ? 'var(--arcane)' : 'var(--gold)' }} />
              </span>
            </button>
          );
        })}
      </div>
      {state.status === 'setup' && isGm && (
        <Button variant="primary" size="sm" onClick={() => send({ type: 'start' })}>
          Lancer l’initiative
        </Button>
      )}
      {state.status === 'active' && (isGm || canEndTurn) && (
        <Button variant="primary" size="sm" onClick={() => send({ type: 'next_turn' })}>
          {isGm ? 'Tour suivant' : 'Fin du tour'}
        </Button>
      )}
      {state.status === 'ended' && <span className="ds-label">Combat terminé</span>}
    </div>
  );
}

// ───────────────────────────── Inspecteur ─────────────────────────────

export function Inspector({ state, combatantId, objectId, isGm, userId, send, onClose, onAttack }: {
  state: CombatState;
  combatantId: string | null;
  objectId: string | null;
  isGm: boolean;
  userId: string;
  send: Send;
  onClose(): void;
  onAttack(attackerId: string): void;
}) {
  const [amount, setAmount] = useState(5);
  const { campaignId } = useCurrentCampaign();
  const client = useQueryClient();
  const toast = useToast();
  const c = combatantId ? state.combatants[combatantId] : null;
  const o = objectId ? state.map.objects.find((x) => x.id === objectId) : null;
  if (!c && !o) return null;

  if (o) {
    const meta = OBJECT_META[o.kind];
    return (
      <div className={s.inspector}>
        <div className="ds-row">
          <h3 className="ds-h3 ds-grow">{o.label || meta.label}</h3>
          <IconButton label="Fermer" onClick={onClose}>
            ×
          </IconButton>
        </div>
        <span className="ds-help">
          Case {o.position.x + 1}, {o.position.y + 1}
          {o.secret ? (o.revealed ? ' · révélé' : ' · secret') : ''}
        </span>
        <div className="ds-row">
          {(o.kind === 'door' || o.kind === 'chest') && (
            <Button size="sm" onClick={() => send({ type: 'update_object', objectId: o.id, patch: { open: !o.open } })}>
              {o.open ? 'Fermer' : 'Ouvrir'}
            </Button>
          )}
          {isGm && o.secret && (
            <Button size="sm" variant="heal" onClick={() => send({ type: 'update_object', objectId: o.id, patch: { revealed: !o.revealed } })}>
              {o.revealed ? 'Cacher' : 'Révéler'}
            </Button>
          )}
          {isGm && (
            <Button size="sm" variant="danger" onClick={() => (send({ type: 'remove_object', objectId: o.id }), onClose())}>
              Supprimer
            </Button>
          )}
        </div>
      </div>
    );
  }

  const cc = c!;
  const mine = isGm || cc.ownerUserId === userId;
  return (
    <div className={s.inspector}>
      <div className="ds-row" style={{ alignItems: 'flex-start' }}>
        <span className={s.initDisc} style={{ borderColor: cc.side === 'ally' ? 'var(--arcane)' : 'var(--magenta)', background: cc.side === 'ally' ? '#1d2f4a' : '#3a1428', width: 44, height: 44 }}>
          {cc.short}
        </span>
        <div className="ds-grow">
          <h3 className="ds-h3">{cc.name}</h3>
          <span className="ds-help">
            {cc.kind === 'pc' ? 'Personnage' : 'Créature'} · CA {cc.ac ?? '?'} · Init {cc.initiative ?? '—'} · {num(cc.speed)} m
          </span>
        </div>
        <IconButton label="Fermer" onClick={onClose}>
          ×
        </IconButton>
      </div>
      <div className="ds-row">
        <span className="ds-label ds-grow">Points de vie</span>
        <strong className={s.hpText}>{hpText(cc)}</strong>
        {cc.tempHp > 0 && <span className="ds-help">+{cc.tempHp} temp.</span>}
      </div>
      <Bar value={pctOf(cc)} max={1} color={pctOf(cc) < 0.34 ? 'var(--magenta)' : cc.side === 'ally' ? 'var(--arcane)' : 'var(--gold)'} label={`PV de ${cc.name}`} />
      {mine && (
        <div className={s.hpControls}>
          <Button variant="damage" onClick={() => send({ type: 'change_hp', combatantId: cc.id, amount, mode: 'damage' })}>
            Dégâts
          </Button>
          <Stepper label="Montant" value={amount} onChange={setAmount} min={0} max={999} />
          <Button variant="heal" onClick={() => send({ type: 'change_hp', combatantId: cc.id, amount, mode: 'heal' })}>
            Soins
          </Button>
        </div>
      )}
      {mine && cc.attack && state.status !== 'ended' && (
        <Button variant="secondary" block onClick={() => onAttack(cc.id)}>
          Attaquer · {cc.attack.name} ({cc.attack.bonus >= 0 ? '+' : ''}
          {cc.attack.bonus}, {cc.attack.damage})
        </Button>
      )}
      <div className="ds-stack" style={{ gap: 6 }}>
        <span className="ds-label">États</span>
        <div className={s.conditions}>
          {CONDITIONS.map((cond) => {
            const on = cc.conditions.find((x) => x.name === cond.name);
            if (!mine && !on) return null;
            return (
              <Chip key={cond.id} color={cond.color} active={!!on} disabled={!mine} title={cond.summary} onClick={() => send({ type: 'toggle_condition', combatantId: cc.id, name: cond.name, rounds: null })}>
                {cond.name}
                {on?.rounds ? ` · ${on.rounds}` : ''}
              </Chip>
            );
          })}
        </div>
      </div>
      {mine && (
        <details className={s.appearance}>
          <summary className="ds-label">Apparence 3D {cc.modelUrl ? '· modèle importé' : '· jeton'}</summary>
          <ModelDrop
            value={cc.modelUrl ?? null}
            name={cc.name}
            preview={false}
            onChange={(url) => {
              send({ type: 'set_model', combatantId: cc.id, modelUrl: url });
              // Pour un PJ, la fiche fait foi : tous les plateaux (et les combats suivants) la suivent.
              if (cc.characterId)
                http
                  .patch(`/characters/${cc.characterId}`, { modelUrl: url })
                  .then(() => void (campaignId && client.invalidateQueries({ queryKey: qk.characters(campaignId) })))
                  .catch((e: unknown) => toast(errorMessage(e), 'error'));
            }}
          />
        </details>
      )}
      {isGm && (
        <div className="ds-row">
          <Toggle checked={cc.hidden} onChange={(v) => send({ type: 'update_combatant', combatantId: cc.id, patch: { hidden: v } })}>
            Stats cachées aux joueurs
          </Toggle>
          <Button size="sm" variant="danger" onClick={() => (send({ type: 'remove_combatant', combatantId: cc.id }), onClose())}>
            Retirer
          </Button>
        </div>
      )}
    </div>
  );
}

// ───────────────────────────── Outils du MJ ─────────────────────────────

const ZONE_LABELS: Record<ZoneShape, string> = { circle: 'Sphère', square: 'Cube', cone: 'Cône', line: 'Ligne' };
const DIRS = ['E', 'SE', 'S', 'SO', 'O', 'NO', 'N', 'NE'];

export function Toolbar({ tool, setTool, isGm }: { tool: Tool; setTool(t: Tool): void; isGm: boolean }) {
  const tools: { id: Tool; label: string; glyph: string; gm?: boolean }[] = [
    { id: 'select', label: 'Sélection', glyph: '◇' },
    { id: 'terrain', label: 'Terrain', glyph: '▦', gm: true },
    { id: 'zone', label: 'Zones', glyph: '◎' },
    { id: 'object', label: 'Objets', glyph: '▣', gm: true },
    { id: 'measure', label: 'Règle', glyph: '⟷' },
  ];
  return (
    <div className={s.toolbar} role="toolbar" aria-label="Outils du plateau">
      {tools
        .filter((t) => isGm || !t.gm)
        .map((t) => (
          <button key={t.id} type="button" aria-pressed={tool === t.id} className={cx(s.tool, tool === t.id && s.toolOn)} onClick={() => setTool(tool === t.id ? 'select' : t.id)}>
            <span aria-hidden>{t.glyph}</span>
            {t.label}
          </button>
        ))}
    </div>
  );
}

export function ToolOptionsPanel({ tool, options, setOptions, state, send }: { tool: Tool; options: ToolOptions; setOptions(o: ToolOptions): void; state: CombatState; send: Send }) {
  if (tool === 'terrain') {
    return (
      <div className={s.flyout}>
        <span className="ds-label">Pinceau de terrain</span>
        <div className={s.conditions}>
          {TERRAIN_KINDS.map((t) => (
            <Chip key={t} square active={options.brush === t} onClick={() => setOptions({ ...options, brush: t })}>
              <span className={s.swatch} style={{ background: TERRAIN_META[t].bg }} />
              {TERRAIN_META[t].label}
            </Chip>
          ))}
          <Chip square active={options.brush === 'erase'} onClick={() => setOptions({ ...options, brush: 'erase' })}>
            Gomme
          </Chip>
        </div>
        <span className="ds-help">Glissez sur la carte pour peindre.</span>
        <Button
          size="sm"
          variant="danger"
          onClick={() => {
            const cells = Object.keys(state.map.terrain).map((k) => {
              const [x, y] = k.split(',').map(Number) as [number, number];
              return { x, y };
            });
            if (cells.length && window.confirm('Effacer tout le terrain ?')) send({ type: 'paint_terrain', cells, terrain: null });
          }}
        >
          Effacer tout le terrain
        </Button>
      </div>
    );
  }
  if (tool === 'zone') {
    const z = options.zone;
    const set = (patch: Partial<ToolOptions['zone']>) => setOptions({ ...options, zone: { ...z, ...patch } });
    return (
      <div className={s.flyout}>
        <span className="ds-label">Gabarit de zone</span>
        <div className={s.conditions}>
          {ZONE_SHAPES.map((sh) => (
            <Chip key={sh} square active={z.shape === sh} onClick={() => set({ shape: sh })}>
              {ZONE_LABELS[sh]}
            </Chip>
          ))}
        </div>
        <span className="ds-label">{z.shape === 'circle' ? 'Rayon' : z.shape === 'square' ? 'Côté' : 'Longueur'} · {num(z.size * 1.5)} m</span>
        <Stepper label="Taille en cases" value={z.size} onChange={(v) => set({ size: v })} min={1} max={30} />
        {(z.shape === 'cone' || z.shape === 'line') && (
          <>
            <span className="ds-label">Orientation · {DIRS[z.direction]}</span>
            <div className={s.conditions}>
              {DIRS.map((d, i) => (
                <Chip key={d} square active={z.direction === i} onClick={() => set({ direction: i })}>
                  {d}
                </Chip>
              ))}
            </div>
          </>
        )}
        <div className={s.conditions}>
          {['#7cc6ff', '#e07aa8', '#e8d3a0', '#8fbf6a', '#f08a50'].map((c) => (
            <button key={c} type="button" className={cx(s.colorDot, z.color === c && s.colorDotOn)} style={{ background: c }} onClick={() => set({ color: c })} aria-label={`Teinte ${c}`} />
          ))}
        </div>
        <Input placeholder="Nom (ex. Boule de feu)" value={z.label} onChange={(e) => set({ label: e.target.value })} aria-label="Nom de la zone" />
        <span className="ds-help">Cliquez sur la carte pour poser le gabarit.</span>
        {state.map.zones.length > 0 && (
          <div className="ds-stack" style={{ gap: 4 }}>
            <span className="ds-label">Zones posées</span>
            {state.map.zones.map((zz) => (
              <div key={zz.id} className="ds-row">
                <span className={s.colorDot} style={{ background: zz.color }} />
                <span className="ds-grow">{zz.label || ZONE_LABELS[zz.shape]}</span>
                <IconButton label="Retirer la zone" onClick={() => send({ type: 'remove_zone', zoneId: zz.id })}>
                  ×
                </IconButton>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
  if (tool === 'object') {
    return (
      <div className={s.flyout}>
        <span className="ds-label">Objets & décor</span>
        <div className={s.conditions}>
          {OBJECT_KINDS.map((k) => (
            <Chip key={k} square active={options.objectKind === k} onClick={() => setOptions({ ...options, objectKind: k })}>
              {OBJECT_META[k].label}
            </Chip>
          ))}
        </div>
        <span className="ds-help">Cliquez sur une case pour placer. Les pièges sont secrets jusqu’à leur révélation.</span>
      </div>
    );
  }
  if (tool === 'measure') {
    return (
      <div className={s.flyout}>
        <span className="ds-label">Règle de distance</span>
        <span className="ds-help">Glissez d’une case à l’autre. Règle des diagonales : {state.settings.diagonalRule === 'simple' ? 'simple (1,5 m)' : 'variante 1,5 / 3 m'}.</span>
      </div>
    );
  }
  return null;
}

// ───────────────────────────── Créatures & carte (MJ) ─────────────────────────────

/** Carte importée : on garde les colonnes et on cale les lignes sur le format de l'image. */
function fitGridToImage(state: CombatState, send: Send) {
  if (!state.map.background) return;
  const img = new Image();
  img.onload = () => {
    const rows = Math.max(4, Math.min(80, Math.round((state.map.cols * img.naturalHeight) / img.naturalWidth)));
    if (rows !== state.map.rows) send({ type: 'resize_map', cols: state.map.cols, rows });
  };
  img.src = state.map.background;
}

export function GmSetup({ state, party, send }: { state: CombatState; party: CharacterSummaryDto[]; send: Send }) {
  const [q, setQ] = useState('');
  const [count, setCount] = useState(1);
  const present = new Set(Object.values(state.combatants).map((c) => c.characterId));
  const monsters = MONSTERS.filter((m) => !q || m.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className={s.flyout}>
      <span className="ds-label">Ajouter des créatures</span>
      <div className="ds-row">
        <Input style={{ flex: 1 }} placeholder="Bestiaire…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher dans le bestiaire" />
        <Select value={count} onChange={(e) => setCount(Number(e.target.value))} aria-label="Nombre" style={{ width: 76 }}>
          {[1, 2, 3, 4, 6].map((n) => (
            <option key={n} value={n}>
              × {n}
            </option>
          ))}
        </Select>
      </div>
      <div className={s.bestiary}>
        {monsters.map((m) => (
          <button key={m.id} type="button" className={s.bestiaryRow} onClick={() => send({ type: 'add_monster', monsterId: m.id, count })}>
            <span className="ds-grow">{m.name}</span>
            <span className="ds-help">
              FP {m.cr} · CA {m.ac} · {m.hp} PV
            </span>
          </button>
        ))}
      </div>
      {party.some((p) => !present.has(p.id)) && (
        <>
          <span className="ds-label">Personnages absents</span>
          <div className={s.conditions}>
            {party
              .filter((p) => !present.has(p.id))
              .map((p) => (
                <Chip key={p.id} square onClick={() => send({ type: 'add_character', characterId: p.id })}>
                  + {p.name}
                </Chip>
              ))}
          </div>
        </>
      )}
      <span className="ds-label">Carte</span>
      <ImageDrop value={state.map.background} onChange={(url) => send({ type: 'set_background', url })} label="Carte de bataille (vue de dessus)" height={110} />
      {state.map.background && (
        <Button size="sm" variant="ghost" onClick={() => fitGridToImage(state, send)} title="Garde le nombre de colonnes et ajuste les lignes aux proportions de l’image (plus de recadrage)">
          Adapter la grille à l’image
        </Button>
      )}
      <div className="ds-row">
        <span className="ds-help ds-grow">
          {state.map.cols} × {state.map.rows} cases
        </span>
        <Button size="sm" variant="ghost" onClick={() => send({ type: 'resize_map', cols: Math.min(80, state.map.cols + 4), rows: Math.min(80, state.map.rows + 2) })}>
          Agrandir
        </Button>
        <Button size="sm" variant="ghost" onClick={() => send({ type: 'resize_map', cols: Math.max(8, state.map.cols - 4), rows: Math.max(6, state.map.rows - 2) })}>
          Réduire
        </Button>
      </div>
      {state.status !== 'ended' && (
        <Button size="sm" variant="danger" onClick={() => window.confirm('Clore ce combat ?') && send({ type: 'end', summary: '' })}>
          Clore le combat
        </Button>
      )}
    </div>
  );
}

// ───────────────────────────── Barre d'actions (joueur / créature active) ─────────────────────────────

export function ActionBar({ state, combatant, isGm, send, onAttack, onRoll }: { state: CombatState; combatant: Combatant; isGm: boolean; send: Send; onAttack(): void; onRoll(): void }) {
  const r = combatant.resources;
  const myTurn = state.activeId === combatant.id && state.status === 'active';
  const movement = Math.max(0, combatant.speed - r.movementUsed);
  const quick = (name: string, resource: 'action' | 'bonus', condition?: string) => () => {
    send({ type: 'use_resource', combatantId: combatant.id, resource });
    if (condition && !combatant.conditions.some((c) => c.name === condition)) send({ type: 'toggle_condition', combatantId: combatant.id, name: condition, rounds: 1 });
  };
  return (
    <div className={s.actionBar}>
      <div className={s.economy} aria-label="Économie d'action">
        <span className={cx(s.eco, s.ecoAction, r.action && s.ecoUsed)} title="Action" />
        <span className={cx(s.eco, s.ecoBonus, r.bonus && s.ecoUsed)} title="Action bonus" />
        <span className={cx(s.eco, s.ecoReaction, r.reaction && s.ecoUsed)} title="Réaction" />
        <span className={s.move}>
          <span className="ds-label">Mouvement</span>
          <strong>{num(movement)} m</strong>
        </span>
      </div>
      <div className={s.actions}>
        <Button variant="secondary" size="sm" disabled={!combatant.attack} onClick={onAttack}>
          Attaquer
        </Button>
        <Button variant="ghost" size="sm" disabled={r.action} onClick={quick('Esquiver', 'action', 'Esquive')}>
          Esquiver
        </Button>
        <Button variant="ghost" size="sm" disabled={r.action} onClick={quick('Se désengager', 'action', 'Désengagé')}>
          Se désengager
        </Button>
        <Button variant="ghost" size="sm" disabled={r.action} onClick={() => send({ type: 'use_resource', combatantId: combatant.id, resource: 'action' })}>
          Foncer
        </Button>
        <Button variant="ghost" size="sm" disabled={r.bonus} onClick={() => send({ type: 'use_resource', combatantId: combatant.id, resource: 'bonus' })}>
          Action bonus
        </Button>
        <Button variant="ghost" size="sm" onClick={onRoll}>
          Lancer un dé
        </Button>
      </div>
      {myTurn && !isGm && (
        <Button variant="primary" size="sm" onClick={() => send({ type: 'next_turn' })}>
          Fin du tour
        </Button>
      )}
    </div>
  );
}

// ───────────────────────────── Tracker (mode « théâtre de l'esprit », mobile) ─────────────────────────────

export function TrackerList({ state, isGm, userId, send, onAttack }: { state: CombatState; isGm: boolean; userId: string; send: Send; onAttack(id: string): void }) {
  const [amount, setAmount] = useState(5);
  const order = initiativeOrder(state);
  return (
    <div className="ds-stack" style={{ gap: 10 }}>
      <div className="ds-row">
        <span className="ds-label ds-grow">Montant</span>
        <div style={{ width: 150 }}>
          <Stepper label="Montant" value={amount} onChange={setAmount} min={0} max={999} />
        </div>
      </div>
      {order.map((c) => {
        const active = c.id === state.activeId;
        const mine = isGm || c.ownerUserId === userId;
        return (
          <div key={c.id} className={cx(s.trackRow, active && s.trackActive)}>
            <div className={s.trackInit}>
              <span className="ds-label">Init</span>
              <strong>{c.initiative ?? '—'}</strong>
            </div>
            <span className={s.initDisc} style={{ borderColor: c.side === 'ally' ? 'var(--arcane)' : 'var(--magenta)', background: c.side === 'ally' ? '#1d2f4a' : '#3a1428', width: 48, height: 48 }}>
              {c.short}
            </span>
            <div className={s.trackName}>
              <strong>{c.name}</strong>
              <span className="ds-help">
                {c.kind === 'pc' ? 'Personnage' : 'Créature'} · CA {c.ac ?? '?'} {active ? '· À son tour' : ''}
              </span>
              {c.conditions.length > 0 && (
                <span className={s.trackConds}>
                  {c.conditions.map((x) => (
                    <span key={x.name} style={{ color: conditionColor(x.name) }}>
                      {x.name}
                    </span>
                  ))}
                </span>
              )}
            </div>
            <div className={s.trackHp}>
              <div className="ds-row" style={{ justifyContent: 'space-between' }}>
                <span className="ds-label">PV</span>
                <span style={{ color: pctOf(c) < 0.34 ? 'var(--magenta-light)' : 'var(--text-soft)', fontSize: 13 }}>{hpText(c)}</span>
              </div>
              <Bar value={pctOf(c)} max={1} color={pctOf(c) < 0.34 ? 'var(--magenta)' : c.side === 'ally' ? 'var(--arcane)' : 'var(--gold)'} />
            </div>
            {mine && (
              <div className={s.trackActions}>
                <Button size="sm" variant="damage" onClick={() => send({ type: 'change_hp', combatantId: c.id, amount, mode: 'damage' })}>
                  − PV
                </Button>
                <Button size="sm" variant="heal" onClick={() => send({ type: 'change_hp', combatantId: c.id, amount, mode: 'heal' })}>
                  + PV
                </Button>
                {c.attack && (
                  <Button size="sm" variant="ghost" onClick={() => onAttack(c.id)}>
                    Attaque
                  </Button>
                )}
              </div>
            )}
          </div>
        );
      })}
      {!isGm && <p className="ds-help">Vue joueur : les PV exacts des créatures sont masqués par le MJ.</p>}
    </div>
  );
}

// ───────────────────────────── Journal ─────────────────────────────

export function CombatLog({ log, state }: { log: CombatEventEnvelope[]; state: CombatState }) {
  const lines = useMemo(
    () =>
      log
        .filter((e) => !['combat.resource_used', 'combat.terrain_painted', 'combat.token_moved', 'combat.initiative_set'].includes(e.event.type))
        .slice(0, 60)
        .map((e) => {
          const t = e.event.type;
          const color =
            t === 'combat.hp_changed'
              ? (e.event.payload as { mode: string }).mode === 'damage'
                ? 'var(--magenta-pale)'
                : 'var(--arcane-pale)'
              : t === 'combat.turn_started' || t === 'combat.started'
                ? 'var(--gold)'
                : t === 'combat.attack_rolled' && (e.event.payload as { crit: boolean }).crit
                  ? 'var(--arcane-light)'
                  : 'var(--text-soft)';
          return { key: e.seq, text: describeCombatEvent(e.event, state), color };
        }),
    [log, state],
  );
  return (
    <div className={s.log} aria-live="polite">
      {lines.map((l) => (
        <div key={l.key} className={s.logLine} style={{ color: l.color }}>
          {l.text}
        </div>
      ))}
      {lines.length === 0 && <span className="ds-help">Le combat n’a pas encore commencé.</span>}
    </div>
  );
}
