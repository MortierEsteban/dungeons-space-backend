import type { CompendiumEntry, ItemEntry, MonsterEntry, SpellEntry } from '@ds/rules';
import { useState } from 'react';
import { num, RARITY_COLORS } from '../../shared/format';
import { useDice } from '../../shared/dice/DiceProvider';
import { useDebounced } from '../../shared/hooks';
import { Button, Chip, cx, Empty, Input, Panel, Rule, Select } from '../../shared/ui/components';
import { useToast } from '../../shared/ui/toast';
import { useCurrentCampaign } from '../campaigns/CampaignContext';
import { useMyCharacters } from '../character/api';
import { useCharacterActionById } from './useGive';
import { useCompendium, useCreations } from './api';
import s from './sanctuary.module.css';

const KINDS: { value: CompendiumEntry['kind'] | 'all'; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'spell', label: 'Sorts' },
  { value: 'monster', label: 'Monstres' },
  { value: 'item', label: 'Objets' },
];
const KIND_COLOR = { spell: 'var(--arcane-light)', monster: 'var(--magenta-light)', item: 'var(--gold-light)' };
const KIND_LABEL = { spell: 'Sort', monster: 'Monstre', item: 'Objet' };

function meta(e: CompendiumEntry): string {
  if (e.kind === 'spell') return e.level === 0 ? 'Tour' : `Niv. ${e.level}`;
  if (e.kind === 'monster') return `FP ${e.cr}`;
  return e.rarity;
}

function props(e: CompendiumEntry): [string, string][] {
  if (e.kind === 'spell') {
    const sp = e as SpellEntry;
    return [['École', sp.school], ['Incantation', sp.castingTime], ['Portée', sp.range], ['Durée', `${sp.concentration ? 'Concentration, ' : ''}${sp.duration}`], ['Composantes', sp.components.join(', ')], ['Classes', sp.classes.join(', ')]];
  }
  if (e.kind === 'monster') {
    const m = e as MonsterEntry;
    return [['Type', `${m.type}, taille ${m.size}`], ['CA', String(m.ac)], ['PV', `${m.hp} (${m.hpDice})`], ['Vitesse', `${num(m.speed)} m`], ['Carac.', `FOR ${m.abilities.str} · DEX ${m.abilities.dex} · CON ${m.abilities.con} · INT ${m.abilities.int} · SAG ${m.abilities.wis} · CHA ${m.abilities.cha}`], ...m.attacks.map((a) => [a.name, `+${a.bonus}, ${a.damage} ${a.damageType} (${a.reach})`] as [string, string]), ...(m.traits.length ? [['Traits', m.traits.join(', ')] as [string, string]] : [])];
  }
  const it = e as ItemEntry;
  return [['Catégorie', it.category], ...(it.damage ? [['Dégâts', `${it.damage} ${it.damageType ?? ''}`] as [string, string]] : []), ...(it.armorClass ? [['CA', it.armorClass] as [string, string]] : []), ...(it.properties?.length ? [['Propriétés', it.properties.join(', ')] as [string, string]] : []), ['Poids', `${num(it.weight)} kg`], ['Prix', `${num(it.price)} po`], ...(it.requiresAttunement ? [['Harmonisation', 'requise'] as [string, string]] : [])];
}

function rollOf(e: CompendiumEntry): string | null {
  if (e.kind === 'spell') return e.roll ?? null;
  if (e.kind === 'monster') return e.attacks[0]?.damage ?? null;
  return e.roll ?? e.damage ?? null;
}

/** Bibliothèque du Sanctuaire : le contenu SRD 5.1 (CC-BY-4.0), recherche sans accents. */
export function Library() {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<CompendiumEntry['kind'] | 'all'>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const query = useDebounced(q, 200);
  const { data: entries = [], isFetching } = useCompendium(query, kind === 'all' ? undefined : kind);
  const { data: creations = [] } = useCreations();
  const { campaignId } = useCurrentCampaign();
  const { data: mine = [] } = useMyCharacters();
  const [target, setTarget] = useState('');
  const give = useCharacterActionById();
  const dice = useDice();
  const toast = useToast();
  const entry = entries.find((e) => e.id === selected) ?? entries[0];
  const myChars = mine.filter((c) => c.campaignId === campaignId);
  const homebrew = creations.filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()));

  const addToSheet = () => {
    if (!entry || !target) return;
    if (entry.kind === 'item') {
      give(target, { type: 'add_item', item: { name: entry.name, ref: entry.id, qty: 1, weight: entry.weight, container: 'Sac à dos', equipped: false, rarity: entry.rarity, requiresAttunement: !!entry.requiresAttunement, attuned: false, description: entry.summary } }, `${entry.name} ajouté à l’inventaire.`);
    } else if (entry.kind === 'spell') {
      give(target, { type: 'add_spell', spell: { ref: entry.id, name: entry.name, level: entry.level, school: entry.school, castingTime: entry.castingTime, range: entry.range, duration: entry.duration, concentration: entry.concentration, ritual: entry.ritual, prepared: false, favorite: false, description: entry.summary, ...(entry.roll ? { roll: entry.roll } : {}) } }, `${entry.name} rejoint le grimoire.`);
    } else toast('Un monstre ne se range pas dans une fiche : ajoutez-le depuis un combat.', 'info');
  };

  const roll = entry ? rollOf(entry) : null;
  return (
    <div className={s.library}>
      <div className="ds-stack" style={{ gap: 14 }}>
        <Input className={s.search} placeholder="Rechercher un sort, un monstre, un objet…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher dans le Sanctuaire" />
        <div className="ds-row">
          {KINDS.map((k) => (
            <Chip key={k.value} active={kind === k.value} onClick={() => setKind(k.value)}>
              {k.label}
            </Chip>
          ))}
        </div>
        <div className="ds-help">
          {entries.length} entrée{entries.length > 1 ? 's' : ''} dans le Sanctuaire{isFetching ? '…' : ''}
        </div>
        <div className={s.results} role="listbox" aria-label="Résultats">
          {entries.map((e) => (
            <button key={e.id} type="button" role="option" aria-selected={entry?.id === e.id} className={cx(s.result, entry?.id === e.id && s.resultOn)} onClick={() => setSelected(e.id)}>
              <span className={s.resultName}>{e.name}</span>
              <span style={{ color: KIND_COLOR[e.kind] }}>{KIND_LABEL[e.kind]}</span>
              <span className={s.resultMeta}>{meta(e)}</span>
            </button>
          ))}
          {entries.length === 0 && <Empty title="Rien de tel dans les archives." />}
        </div>
        {homebrew.length > 0 && (
          <div className="ds-stack" style={{ gap: 8 }}>
            <span className="ds-label">Créations de la Forge · {homebrew.length}</span>
            <div className="ds-row" style={{ gap: 6 }}>
              {homebrew.map((c) => (
                <span key={c.id} className={s.homebrew} style={{ borderColor: RARITY_COLORS[c.rarity] }}>
                  {c.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
      {entry && (
        <Panel className={s.detail}>
          <div className="ds-label" style={{ color: KIND_COLOR[entry.kind] }}>
            {KIND_LABEL[entry.kind]} · {meta(entry)}
          </div>
          <h2 className="ds-h2" style={{ fontSize: 26, color: 'var(--gold-light)' }}>
            {entry.name}
          </h2>
          <Rule />
          {props(entry).map(([k, v]) => (
            <div key={k} className={s.prop}>
              <span className="ds-label">{k}</span>
              <span>{v}</span>
            </div>
          ))}
          <p className={s.summary}>{entry.summary}</p>
          <div className="ds-row">
            <Button disabled={!roll || !campaignId} onClick={() => roll && campaignId && void dice.roll(campaignId, entry.name, roll)}>
              {roll ? `Lancer ${roll}` : 'Aucun jet'}
            </Button>
          </div>
          {entry.kind !== 'monster' && myChars.length > 0 && (
            <div className="ds-row">
              <Select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Personnage" style={{ flex: 1 }}>
                <option value="">Ajouter à la fiche de…</option>
                {myChars.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              <Button variant="ghost" disabled={!target} onClick={addToSheet}>
                Ajouter
              </Button>
            </div>
          )}
          <span className="ds-help">
            Source : {entry.provenance.source} · licence {entry.provenance.license}
          </span>
        </Panel>
      )}
    </div>
  );
}
