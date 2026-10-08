import { ABILITY_KEYS, ABILITY_LABELS, CONDITIONS, DAMAGE_TYPES, RARITIES } from '@ds/rules';
import { CREATION_KINDS, type Creation, type CreationDto, type CreationEffect, type CreationKind } from '@ds/shared';
import { useEffect, useState, type CSSProperties } from 'react';
import { errorMessage } from '../../shared/api/client';
import { num, RARITY_COLORS } from '../../shared/format';
import { Button, Chip, cx, Field, IconButton, Input, Panel, Select, Stepper, TextArea, Toggle } from '../../shared/ui/components';
import { ImageDrop } from '../../shared/ui/ImageDrop';
import { useToast } from '../../shared/ui/toast';
import { useCurrentCampaign } from '../campaigns/CampaignContext';
import { useCampaignCharacters } from '../character/api';
import { useCreationMutations, useCreations } from './api';
import { CLASS_MECH0, ClassEditor, type ClassMech } from './ClassEditor';
import s from './sanctuary.module.css';

const KIND_HINT: Record<CreationKind, string> = {
  Arme: 'Épées, arcs, bâtons',
  Armure: 'Armures et boucliers',
  'Objet merveilleux': 'Anneaux, capes, reliques',
  Potion: 'Consommables',
  Sort: 'Magie personnalisée',
  Créature: 'PNJ et monstres',
  Classe: 'Classes homebrew',
};
const MECH0: Record<CreationKind, Record<string, unknown>> = {
  Arme: { n: 1, f: 8, dtype: 'Tranchant', bonus: 1, props: ['Polyvalente'] },
  Armure: { ca: 14, atype: 'Intermédiaire', bonus: 0, stealth: false },
  'Objet merveilleux': { slot: 'Cou', conso: false },
  Potion: { n: 2, f: 4, mod: 2, ptype: 'Soins' },
  Sort: { lvl: 3, school: 'Évocation', cast: '1 action', range: '45 m', dur: 'Instantanée', comps: ['V', 'S'], conc: false, ritual: false },
  Créature: { cr: '2', ac: 13, hp: 45, spd: '9 m', stats: [16, 12, 14, 8, 10, 6] },
  Classe: CLASS_MECH0 as unknown as Record<string, unknown>,
};
const AREAS = [
  ['', 'Aucune (cibles)'],
  ['sphere', 'Sphère'],
  ['cube', 'Cube'],
  ['cone', 'Cône'],
  ['line', 'Ligne'],
  ['cylinder', 'Cylindre'],
] as const;
const CASTER_LABEL: Record<string, string> = { full: 'Lanceur complet', half: 'Demi-lanceur', third: 'Tiers de lanceur', pact: 'Magie de pacte' };
const DTYPES = ['Tranchant', 'Perforant', 'Contondant', 'Feu', 'Froid', 'Foudre', 'Nécrotique', 'Radiant', 'Force', 'Poison', 'Psychique', 'Acide', 'Tonnerre'];
const WEAPON_PROPS = ['Finesse', 'Légère', 'Lourde', 'Polyvalente', 'À deux mains', 'Lancer', 'Allonge', 'Munitions'];
const TRIG_P = ['Toujours', 'Quand équipé', 'Quand harmonisé', 'En présence de morts-vivants', 'En dessous de la moitié des PV'];
const TRIG_A = ['Action', 'Action bonus', 'Réaction', 'Sur un coup critique', 'Au toucher', 'Mot de commande'];
const EFFECTS = ['Dégâts supplémentaires', 'Soins', 'Bonus de CA', 'Bonus de caractéristique', 'Résistance', 'Immunité', 'Condition infligée', 'Lance un sort', 'Lumière', 'Vitesse', 'Avantage'];
const RECH = ['Aube', 'Repos court', 'Repos long', 'Jamais'];
const SCHOOLS = ['Abjuration', 'Divination', 'Enchantement', 'Évocation', 'Illusion', 'Invocation', 'Nécromancie', 'Transmutation'];
const STAT_KEYS = ['FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA'];

const blank = (kind: CreationKind, campaignId: string | null): Creation => ({
  kind, name: '', rarity: 'Peu commun', attune: false, weight: 1, price: 100, mech: structuredClone(MECH0[kind]),
  frame: 'Runique', halo: false, tint: null, imageUrl: null, effects: [], lore: '', campaignId, shared: false,
});

const hexA = (h: string, a: number) => {
  const n = parseInt(h.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};

/** Carte de l'objet telle qu'elle apparaîtra à la table (aperçu en direct). */
export function CreationCard({ d }: { d: Creation }) {
  const m = d.mech as Record<string, any>;
  const tint = d.tint ?? RARITY_COLORS[d.rarity] ?? '#c9a96a';
  const rar = `${d.rarity.toLowerCase()}${d.attune ? ' (harmonisation requise)' : ''}`;
  let stat = '';
  let sub = '';
  let tags: string[] = [];
  const lines: { k: string; v: string }[] = [];
  if (d.kind === 'Arme') {
    stat = `${m.n}d${m.f}${m.bonus ? ` + ${m.bonus}` : ''} ${String(m.dtype).toLowerCase()}`;
    sub = `Arme, ${rar}`;
    tags = (m.props as string[]) ?? [];
    if (m.bonus) lines.push({ k: 'Bonus', v: `+${m.bonus} aux jets d'attaque et de dégâts` });
  } else if (d.kind === 'Armure') {
    stat = `CA ${m.ca}${m.bonus ? ` + ${m.bonus}` : ''}`;
    sub = `Armure ${String(m.atype).toLowerCase()}, ${rar}`;
    if (m.stealth) tags = ['Désavantage en Discrétion'];
  } else if (d.kind === 'Objet merveilleux') {
    sub = `Objet merveilleux, ${rar}`;
    lines.push({ k: 'Emplacement', v: String(m.slot) });
    if (m.conso) tags = ['Consommable'];
  } else if (d.kind === 'Potion') {
    stat = `${m.n}d${m.f} + ${m.mod} · ${m.ptype}`;
    sub = `Potion, ${rar}`;
    tags = ['Consommable'];
  } else if (d.kind === 'Sort') {
    stat = m.lvl === 0 ? `Tour de magie · ${m.school}` : `Niveau ${m.lvl} · ${m.school}`;
    sub = `Sort ${String(m.school).toLowerCase()}`;
    lines.push({ k: 'Incantation', v: m.cast }, { k: 'Portée', v: m.range }, { k: 'Durée', v: `${m.conc ? 'Concentration, ' : ''}${m.dur}` }, { k: 'Composantes', v: (m.comps as string[]).join(', ') || '—' });
    if (m.dice) lines.push({ k: m.heal ? 'Soins' : 'Dégâts', v: `${m.dice}${m.dtype && !m.heal ? ` ${m.dtype}` : ''}` });
    if (m.save) lines.push({ k: 'Sauvegarde', v: `${ABILITY_LABELS[m.save as keyof typeof ABILITY_LABELS]?.name ?? m.save}${m.half ? ', moitié sur réussite' : ''}` });
    if (m.area) lines.push({ k: 'Zone', v: `${AREAS.find((a) => a[0] === m.area)?.[1]} de ${String(m.areaSize ?? 6).replace('.', ',')} m` });
    if (m.condition) lines.push({ k: 'État', v: m.condition });
    tags = [...(m.ritual ? ['Rituel'] : []), ...(m.attack ? ['Attaque de sort'] : [])];
  } else if (d.kind === 'Classe') {
    const c = m as ClassMech;
    stat = `d${c.hitDie} · ${(c.saves ?? []).map((k) => ABILITY_LABELS[k].short).join(' + ')}`;
    sub = `Classe homebrew${c.caster ? ` · ${CASTER_LABEL[c.caster]}` : ''}`;
    for (const r of c.resources ?? []) lines.push({ k: r.name, v: `${r.max} · ${r.recharge === 'short' ? 'repos court' : r.recharge === 'long' ? 'repos long' : 'manuelle'}` });
    for (const f of [...(c.features ?? [])].sort((a, b) => a.level - b.level).slice(0, 8)) lines.push({ k: `Niv ${f.level}`, v: f.name });
  } else {
    stat = `CA ${m.ac} · ${m.hp} PV · ${m.spd}`;
    sub = `Créature, FP ${m.cr}`;
    lines.push({ k: 'Carac.', v: (m.stats as number[]).map((v, i) => `${STAT_KEYS[i]} ${v}`).join(' · ') });
  }
  const shadow =
    d.frame === 'Simple'
      ? '0 14px 40px rgba(0,0,0,.55)'
      : d.frame === 'Runique'
        ? `inset 0 0 0 4px #120c18, inset 0 0 0 5px ${hexA(tint, 0.4)}, 0 14px 40px rgba(0,0,0,.55)`
        : `inset 0 0 0 5px #120c18, inset 0 0 0 6px ${hexA(tint, 0.6)}, inset 0 0 0 9px #120c18, inset 0 0 0 10px ${hexA(tint, 0.3)}, 0 14px 40px rgba(0,0,0,.55)`;
  return (
    <div className={s.card} style={{ border: `${d.frame === 'Orné' ? 2 : 1}px solid ${hexA(tint, 0.75)}`, boxShadow: shadow + (d.halo ? `, 0 0 46px ${hexA(tint, 0.45)}` : ''), '--tint': tint } as CSSProperties}>
      {d.frame === 'Orné' && <span className={s.cardGemTop} />}
      <div className={s.cardArt}>{d.imageUrl ? <img src={d.imageUrl} alt="" /> : <span>Illustration</span>}</div>
      <div className={s.cardName}>{d.name || 'Sans nom'}</div>
      <div className={s.cardSub}>{sub}</div>
      <div className={s.cardRule} />
      {stat && <div className={s.cardStat}>{stat}</div>}
      {lines.map((l) => (
        <div key={l.k} className={s.cardLine}>
          <span className="ds-label">{l.k}</span>
          <span>{l.v}</span>
        </div>
      ))}
      {tags.length > 0 && (
        <div className="ds-row" style={{ gap: 6 }}>
          {tags.map((t) => (
            <span key={t} className={s.cardTag}>
              {t}
            </span>
          ))}
        </div>
      )}
      {d.effects.map((e) => (
        <div key={e.id} className={cx(s.effect, e.mode === 'Actif' && s.effectActive)}>
          <div className="ds-row" style={{ gap: 8 }}>
            <span className="ds-label" style={{ color: e.mode === 'Actif' ? 'var(--arcane-light)' : 'var(--gold-light)' }}>
              {e.mode}
            </span>
            <span className="ds-help" style={{ fontStyle: 'normal' }}>
              {e.trigger}
              {e.mode === 'Actif' && e.charges ? ` · ${e.charges} charge${e.charges > 1 ? 's' : ''} / ${e.recharge.toLowerCase()}` : ''}
            </span>
          </div>
          <strong>
            {e.kind}
            {e.value ? ` — ${e.value}` : ''}
          </strong>
          {e.desc && <em>{e.desc}</em>}
        </div>
      ))}
      {d.lore && <p className={s.cardLore}>{d.lore}</p>}
      {d.kind !== 'Sort' && d.kind !== 'Créature' && d.kind !== 'Classe' && (
        <div className={s.cardFoot}>
          <span>{num(d.weight)} kg</span>
          <span>{num(d.price)} po</span>
        </div>
      )}
    </div>
  );
}

function Mechanics({ draft, set }: { draft: Creation; set: (fn: (d: Creation) => void) => void }) {
  const m = draft.mech as Record<string, any>;
  const mech = (key: string, value: unknown) => set((d) => void ((d.mech as Record<string, unknown>)[key] = value));
  const num2 = (key: string, label: string, min = 0, max = 99) => <Field label={label}><Stepper label={label} value={Number(m[key] ?? min)} min={min} max={max} onChange={(v) => mech(key, v)} /></Field>;
  switch (draft.kind) {
    case 'Arme':
      return (
        <div className={s.mechGrid}>
          {num2('n', 'Nombre de dés', 1, 20)}
          <Field label="Dé">
            <Select value={m.f} onChange={(e) => mech('f', Number(e.target.value))}>
              {[4, 6, 8, 10, 12].map((f) => <option key={f} value={f}>d{f}</option>)}
            </Select>
          </Field>
          <Field label="Type de dégâts">
            <Select value={m.dtype} onChange={(e) => mech('dtype', e.target.value)}>
              {DTYPES.map((t) => <option key={t}>{t}</option>)}
            </Select>
          </Field>
          {num2('bonus', 'Bonus magique', 0, 3)}
          <div className={s.span2}>
            <span className="ds-label">Propriétés</span>
            <div className="ds-row" style={{ gap: 6, marginTop: 6 }}>
              {WEAPON_PROPS.map((p) => (
                <Chip key={p} square active={(m.props as string[]).includes(p)} onClick={() => mech('props', (m.props as string[]).includes(p) ? (m.props as string[]).filter((x) => x !== p) : [...m.props, p])}>
                  {p}
                </Chip>
              ))}
            </div>
          </div>
        </div>
      );
    case 'Armure':
      return (
        <div className={s.mechGrid}>
          {num2('ca', 'CA de base', 10, 20)}
          <Field label="Type">
            <Select value={m.atype} onChange={(e) => mech('atype', e.target.value)}>
              {['Légère', 'Intermédiaire', 'Lourde', 'Bouclier'].map((t) => <option key={t}>{t}</option>)}
            </Select>
          </Field>
          {num2('bonus', 'Bonus magique', 0, 3)}
          <Toggle checked={!!m.stealth} onChange={(v) => mech('stealth', v)}>Désavantage en Discrétion</Toggle>
        </div>
      );
    case 'Objet merveilleux':
      return (
        <div className={s.mechGrid}>
          <Field label="Emplacement">
            <Select value={m.slot} onChange={(e) => mech('slot', e.target.value)}>
              {['Tête', 'Cou', 'Épaules', 'Torse', 'Mains', 'Main', 'Doigt', 'Taille', 'Pieds', 'Aucun'].map((t) => <option key={t}>{t}</option>)}
            </Select>
          </Field>
          <Toggle checked={!!m.conso} onChange={(v) => mech('conso', v)}>Consommable</Toggle>
        </div>
      );
    case 'Potion':
      return (
        <div className={s.mechGrid}>
          {num2('n', 'Nombre de dés', 1, 20)}
          <Field label="Dé">
            <Select value={m.f} onChange={(e) => mech('f', Number(e.target.value))}>
              {[4, 6, 8, 10, 12].map((f) => <option key={f} value={f}>d{f}</option>)}
            </Select>
          </Field>
          {num2('mod', 'Modificateur', 0, 50)}
          <Field label="Effet">
            <Input value={m.ptype} onChange={(e) => mech('ptype', e.target.value)} />
          </Field>
        </div>
      );
    case 'Sort':
      return (
        <div className={s.mechGrid}>
          {num2('lvl', 'Niveau (0 = tour)', 0, 9)}
          <Field label="École">
            <Select value={m.school} onChange={(e) => mech('school', e.target.value)}>
              {SCHOOLS.map((t) => <option key={t}>{t}</option>)}
            </Select>
          </Field>
          <Field label="Incantation"><Input value={m.cast} onChange={(e) => mech('cast', e.target.value)} /></Field>
          <Field label="Portée"><Input value={m.range} onChange={(e) => mech('range', e.target.value)} /></Field>
          <Field label="Durée"><Input value={m.dur} onChange={(e) => mech('dur', e.target.value)} /></Field>
          <div>
            <span className="ds-label">Composantes</span>
            <div className="ds-row" style={{ gap: 6, marginTop: 6 }}>
              {['V', 'S', 'M'].map((c) => (
                <Chip key={c} square active={(m.comps as string[]).includes(c)} onClick={() => mech('comps', (m.comps as string[]).includes(c) ? (m.comps as string[]).filter((x) => x !== c) : [...m.comps, c])}>
                  {c}
                </Chip>
              ))}
            </div>
          </div>
          <Toggle checked={!!m.conc} onChange={(v) => mech('conc', v)}>Concentration</Toggle>
          <Toggle checked={!!m.ritual} onChange={(v) => mech('ritual', v)}>Rituel</Toggle>
          <div className={s.span2}>
            <span className="ds-label">En combat</span>
          </div>
          <Field label="Jet (dégâts ou soins)"><Input value={m.dice ?? ''} onChange={(e) => mech('dice', e.target.value)} placeholder="8d6" /></Field>
          <Field label="Type de dégâts">
            <Select value={m.dtype ?? ''} onChange={(e) => mech('dtype', e.target.value)}>
              <option value="">—</option>
              {DAMAGE_TYPES.map((t) => <option key={t}>{t}</option>)}
            </Select>
          </Field>
          <Field label="Sauvegarde de la cible">
            <Select value={m.save ?? ''} onChange={(e) => mech('save', e.target.value)}>
              <option value="">Aucune</option>
              {ABILITY_KEYS.map((k) => <option key={k} value={k}>{ABILITY_LABELS[k].name}</option>)}
            </Select>
          </Field>
          <Field label="Zone">
            <Select value={m.area ?? ''} onChange={(e) => mech('area', e.target.value)}>
              {AREAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </Field>
          {m.area && <Field label="Taille de la zone (m)"><Stepper label="Taille de la zone" value={Number(m.areaSize ?? 6)} step={1.5} min={1.5} max={60} onChange={(v) => mech('areaSize', v)} /></Field>}
          <Field label="État infligé ou accordé">
            <Select value={m.condition ?? ''} onChange={(e) => mech('condition', e.target.value)}>
              <option value="">Aucun</option>
              {CONDITIONS.map((c) => <option key={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          {num2('targets', 'Cibles (rayons…)', 1, 10)}
          <Field label="Dés par niveau supérieur"><Input value={m.upcast ?? ''} onChange={(e) => mech('upcast', e.target.value)} placeholder="1d6" /></Field>
          <Toggle checked={!!m.attack} onChange={(v) => mech('attack', v)}>Attaque de sort (contre la CA)</Toggle>
          <Toggle checked={!!m.half} onChange={(v) => mech('half', v)}>Moitié des dégâts sur une sauvegarde réussie</Toggle>
          <Toggle checked={!!m.heal} onChange={(v) => mech('heal', v)}>Le jet soigne</Toggle>
        </div>
      );
    case 'Classe':
      return <ClassEditor mech={draft.mech as unknown as ClassMech} set={(fn) => set((d) => fn(d.mech as unknown as ClassMech))} />;
    case 'Créature':
      return (
        <div className={s.mechGrid}>
          <Field label="Facteur de puissance"><Input value={m.cr} onChange={(e) => mech('cr', e.target.value)} /></Field>
          {num2('ac', 'CA', 0, 30)}
          {num2('hp', 'PV', 1, 999)}
          <Field label="Vitesse"><Input value={m.spd} onChange={(e) => mech('spd', e.target.value)} /></Field>
          <div className={cx(s.span2, s.statsRow)}>
            {STAT_KEYS.map((k, i) => (
              <Field key={k} label={k}>
                <Stepper label={k} value={(m.stats as number[])[i]!} min={1} max={30} onChange={(v) => set((d) => void (((d.mech as Record<string, number[]>).stats!)[i] = v))} />
              </Field>
            ))}
          </div>
        </div>
      );
  }
}

/** La Forge : objets, sorts et créatures personnalisés, séparés du contenu officiel (CNT-04). */
export function Forge() {
  const { campaignId, isGm } = useCurrentCampaign();
  const { data: creations = [] } = useCreations();
  const { data: characters = [] } = useCampaignCharacters(campaignId);
  const m = useCreationMutations();
  const toast = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Creation>(() => blank('Arme', campaignId));
  const [saved, setSaved] = useState<string>(JSON.stringify(draft));
  const [giveTo, setGiveTo] = useState('');
  const dirty = JSON.stringify(draft) !== saved;

  const load = (c: CreationDto | null) => {
    const { id: _id, ownerId: _o, createdAt: _c, updatedAt: _u, ...data } = c ?? { ...blank('Arme', campaignId), id: '', ownerId: '', createdAt: '', updatedAt: '' };
    setEditingId(c?.id ?? null);
    setDraft(data);
    setSaved(JSON.stringify(data));
  };
  useEffect(() => {
    if (!editingId && creations[0] && !dirty && !draft.name) load(creations[0]);
  }, [creations.length]);

  const set = (fn: (d: Creation) => void) => setDraft((d) => {
    const next = structuredClone(d);
    fn(next);
    return next;
  });
  const onError = (e: unknown) => toast(errorMessage(e), 'error');

  const save = () => {
    if (!draft.name.trim()) return toast('Donnez un nom à votre création.', 'error');
    if (editingId) m.update.mutate({ id: editingId, ...draft }, { onSuccess: () => (setSaved(JSON.stringify(draft)), toast('Enregistré dans le Sanctuaire.', 'success')), onError });
    else m.create.mutate(draft, { onSuccess: (c) => (setEditingId(c.id), setSaved(JSON.stringify(draft)), toast('Création ajoutée au Sanctuaire.', 'success')), onError });
  };

  const addEffect = () =>
    set((d) => void d.effects.push({ id: `f${Date.now()}`, mode: 'Passif', trigger: 'Quand équipé', kind: 'Bonus de CA', value: '+1', charges: 0, recharge: 'Aube', desc: '' }));
  const effect = (id: string, patch: Partial<CreationEffect>) => set((d) => Object.assign(d.effects.find((e) => e.id === id)!, patch));
  const giveable = editingId && !dirty && draft.kind !== 'Créature' && draft.kind !== 'Classe';
  const physical = draft.kind !== 'Sort' && draft.kind !== 'Créature' && draft.kind !== 'Classe';

  return (
    <div className={s.forge}>
      <div className="ds-stack" style={{ gap: 10 }}>
        <Button variant="secondary" onClick={() => load(null)}>
          + Nouvelle création
        </Button>
        <span className="ds-label">Mes créations</span>
        {creations.map((c) => (
          <div key={c.id} className={cx(s.creation, c.id === editingId && s.creationOn)}>
            <button type="button" onClick={() => load(c)}>
              <span className={s.creationGem} style={{ background: RARITY_COLORS[c.rarity] }} />
              <span className="ds-grow">
                <strong>{c.name}</strong>
                <span className="ds-help"> {c.kind}</span>
              </span>
            </button>
            <IconButton label={`Supprimer ${c.name}`} onClick={() => window.confirm(`Supprimer « ${c.name} » ?`) && m.remove.mutate(c.id, { onSuccess: () => c.id === editingId && load(null) })}>
              ×
            </IconButton>
          </div>
        ))}
        {creations.length === 0 && <span className="ds-help">Aucune création pour l’instant.</span>}
      </div>

      <div className="ds-stack" style={{ gap: 14 }}>
        <div className={s.kinds}>
          {CREATION_KINDS.map((k) => (
            <button key={k} type="button" className={cx(s.kind, draft.kind === k && s.kindOn)} onClick={() => set((d) => void ((d.kind = k), (d.mech = structuredClone(MECH0[k]))))}>
              <strong>{k}</strong>
              <span>{KIND_HINT[k]}</span>
            </button>
          ))}
        </div>
        <Panel className="ds-stack" style={{ gap: 12 }}>
          <h3 className="ds-h3">
            <span className={s.roman}>I</span> Identité
          </h3>
          <Input className={s.bigName} value={draft.name} onChange={(e) => set((d) => void (d.name = e.target.value))} placeholder="Lame des Cendres" aria-label="Nom" />
          {draft.kind !== 'Classe' && (
            <>
              <span className="ds-label">Rareté</span>
              <div className="ds-row" style={{ gap: 6 }}>
                {RARITIES.map((r) => (
                  <Chip key={r} color={RARITY_COLORS[r]} active={draft.rarity === r} onClick={() => set((d) => void (d.rarity = r))}>
                    {r}
                  </Chip>
                ))}
              </div>
            </>
          )}
          {physical && (
            <div className={s.mechGrid}>
              <Field label="Poids">
                <Stepper label="Poids" value={draft.weight} step={0.5} min={0} max={1000} format={(v) => `${num(v)} kg`} onChange={(v) => set((d) => void (d.weight = v))} />
              </Field>
              <Field label="Prix">
                <Stepper label="Prix" value={draft.price} step={50} min={0} max={1_000_000} format={(v) => `${num(v)} po`} onChange={(v) => set((d) => void (d.price = v))} />
              </Field>
              <Toggle checked={draft.attune} onChange={(v) => set((d) => void (d.attune = v))}>
                Harmonisation requise
              </Toggle>
            </div>
          )}
        </Panel>
        <Panel className="ds-stack" style={{ gap: 12 }}>
          <h3 className="ds-h3">
            <span className={s.roman}>II</span> Mécaniques
          </h3>
          <Mechanics draft={draft} set={set} />
        </Panel>
        {draft.kind !== 'Classe' && (
        <Panel className="ds-stack" style={{ gap: 12 }}>
          <div className="ds-row">
            <h3 className="ds-h3 ds-grow">
              <span className={s.roman}>III</span> Effets
            </h3>
            <Button size="sm" variant="ghost" onClick={addEffect}>
              + Effet
            </Button>
          </div>
          {draft.effects.map((e) => (
            <div key={e.id} className={s.effectEdit}>
              <div className="ds-row">
                {(['Passif', 'Actif'] as const).map((mode) => (
                  <Chip key={mode} active={e.mode === mode} onClick={() => effect(e.id, { mode, trigger: mode === 'Passif' ? TRIG_P[1]! : TRIG_A[0]! })}>
                    {mode}
                  </Chip>
                ))}
                <span className="ds-grow" />
                <IconButton label="Retirer l'effet" onClick={() => set((d) => void (d.effects = d.effects.filter((x) => x.id !== e.id)))}>
                  ×
                </IconButton>
              </div>
              <div className={s.mechGrid}>
                <Field label="Déclencheur">
                  <Select value={e.trigger} onChange={(ev) => effect(e.id, { trigger: ev.target.value })}>
                    {(e.mode === 'Passif' ? TRIG_P : TRIG_A).map((t) => <option key={t}>{t}</option>)}
                  </Select>
                </Field>
                <Field label="Effet">
                  <Select value={e.kind} onChange={(ev) => effect(e.id, { kind: ev.target.value })}>
                    {EFFECTS.map((t) => <option key={t}>{t}</option>)}
                  </Select>
                </Field>
                <Field label="Valeur">
                  <Input value={e.value} onChange={(ev) => effect(e.id, { value: ev.target.value })} placeholder="2d6 feu" />
                </Field>
                {e.mode === 'Actif' && (
                  <>
                    <Field label="Charges">
                      <Stepper label="Charges" value={e.charges} min={0} max={50} onChange={(v) => effect(e.id, { charges: v })} />
                    </Field>
                    <Field label="Recharge">
                      <Select value={e.recharge} onChange={(ev) => effect(e.id, { recharge: ev.target.value })}>
                        {RECH.map((t) => <option key={t}>{t}</option>)}
                      </Select>
                    </Field>
                  </>
                )}
                <Field label="Description" className={s.span2}>
                  <Input value={e.desc} onChange={(ev) => effect(e.id, { desc: ev.target.value })} />
                </Field>
              </div>
            </div>
          ))}
          {draft.effects.length === 0 && <span className="ds-help">Aucun effet : un objet peut être simplement beau.</span>}
          <span className="ds-help">Les effets passifs « Résistance », « Immunité », « Bonus de CA », « Vitesse » et « Avantage » s’appliquent à la fiche de qui porte l’objet (équipé, ou harmonisé s’il l’exige).</span>
        </Panel>
        )}
        <Panel className="ds-stack" style={{ gap: 12 }}>
          <h3 className="ds-h3">
            <span className={s.roman}>IV</span> Apparence & légende
          </h3>
          <div className={s.mechGrid}>
            <ImageDrop value={draft.imageUrl} onChange={(url) => set((d) => void (d.imageUrl = url))} label="Illustration" height={140} />
            <div className="ds-stack">
              <span className="ds-label">Cadre</span>
              <div className="ds-row" style={{ gap: 6 }}>
                {(['Simple', 'Runique', 'Orné'] as const).map((f) => (
                  <Chip key={f} square active={draft.frame === f} onClick={() => set((d) => void (d.frame = f))}>
                    {f}
                  </Chip>
                ))}
              </div>
              <Toggle checked={draft.halo} onChange={(v) => set((d) => void (d.halo = v))}>
                Halo
              </Toggle>
              <div className="ds-row" style={{ gap: 6 }}>
                {[null, '#7cc6ff', '#e07aa8', '#e8d3a0', '#8fbf6a', '#b9a4e0'].map((c) => (
                  <button key={c ?? 'auto'} type="button" className={cx(s.tint, draft.tint === c && s.tintOn)} style={{ background: c ?? 'conic-gradient(#a79c8a, #7cc6ff, #c9a96a, #e07aa8, #a79c8a)' }} onClick={() => set((d) => void (d.tint = c))} aria-label={c ? `Teinte ${c}` : 'Teinte de la rareté'} />
                ))}
              </div>
            </div>
          </div>
          <Field label="Légende" htmlFor="forge-lore">
            <TextArea id="forge-lore" rows={3} value={draft.lore} onChange={(e) => set((d) => void (d.lore = e.target.value))} placeholder="Forgée dans la lave du volcan…" />
          </Field>
        </Panel>
      </div>

      <div className={s.previewCol}>
        <CreationCard d={draft} />
        <span className="ds-help" style={{ color: dirty ? 'var(--gold-light)' : 'var(--arcane-light)' }}>
          {dirty ? '◇ Modifications non enregistrées' : editingId ? '◆ Enregistré' : ''}
        </span>
        <Toggle checked={draft.shared} onChange={(v) => set((d) => void (d.shared = v))}>
          Partager dans la bibliothèque commune
        </Toggle>
        <span className="ds-help">{draft.shared ? 'Toutes les tables pourront l’importer (une copie, vos modifications restent les vôtres).' : 'Visible de vous et de votre campagne seulement.'}</span>
        <Button variant="primary" size="lg" block onClick={save} disabled={m.create.isPending || m.update.isPending}>
          Enregistrer dans le Sanctuaire
        </Button>
        {draft.kind === 'Classe' && editingId && !dirty && <span className="ds-help">Choisissez cette classe dans la Génération pour créer un personnage ; les fiches qui la suivent sont mises à jour à chaque enregistrement.</span>}
        <div className="ds-row">
          <Button variant="ghost" onClick={() => (setEditingId(null), set((d) => void (d.name = `${d.name} (copie)`)))} disabled={!editingId}>
            Dupliquer
          </Button>
        </div>
        {isGm && giveable && (
          <div className="ds-row">
            <Select value={giveTo} onChange={(e) => setGiveTo(e.target.value)} aria-label="Donner à" style={{ flex: 1 }}>
              <option value="">Donner à un joueur…</option>
              {characters
                .filter((c) => c.kind === 'pc')
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
            <Button
              variant="heal"
              disabled={!giveTo}
              onClick={() => m.give.mutate({ id: editingId!, characterId: giveTo }, { onSuccess: (c) => toast(`${draft.name} remis à ${c.name}.`, 'success'), onError })}
            >
              Donner
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
