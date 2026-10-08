import {
  ABILITY_KEYS,
  ABILITY_LABELS,
  abilityModifier,
  CLASSES,
  generateLoot,
  generateNpc,
  getClass,
  getSpecies,
  ITEMS,
  LOOT_TIERS,
  maxHpFor,
  POINT_BUY_BUDGET,
  pointBuyCost,
  rollAbilityScores,
  scoresFromArray,
  SKILLS,
  SPECIES,
  STANDARD_ARRAY,
  systemRng,
  type AbilityKey,
  type AbilityScores,
  type GeneratedLoot,
  type GeneratedNpc,
  type LootTier,
} from '@ds/rules';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { errorMessage, http } from '../../shared/api/client';
import { RARITY_COLORS, signed } from '../../shared/format';
import { Button, Chip, Empty, Field, Input, Panel, Segmented, Select, Stepper } from '../../shared/ui/components';
import { ImageDrop } from '../../shared/ui/ImageDrop';
import { useToast } from '../../shared/ui/toast';
import { useCampaign } from '../campaigns/api';
import { useCurrentCampaign } from '../campaigns/CampaignContext';
import { useCampaignCharacters, useCreateCharacter } from '../character/api';
import s from './generation.module.css';

type Method = 'roll' | 'point_buy' | 'standard_array';

function CharacterForge() {
  const { campaignId, isGm } = useCurrentCampaign();
  const { data: campaign } = useCampaign(campaignId);
  const create = useCreateCharacter(campaignId!);
  const navigate = useNavigate();
  const toast = useToast();
  const [method, setMethod] = useState<Method>(campaign?.settings.statMethod ?? 'roll');
  const [species, setSpecies] = useState('elf');
  const [cls, setCls] = useState('ranger');
  const [name, setName] = useState('');
  const [background, setBackground] = useState('');
  const [portrait, setPortrait] = useState<string | null>(null);
  const [pool, setPool] = useState<number[]>(() => rollAbilityScores(systemRng));
  const [assign, setAssign] = useState<Record<AbilityKey, number>>({ str: 0, dex: 1, con: 2, int: 3, wis: 4, cha: 5 });
  const [buy, setBuy] = useState<AbilityScores>(scoresFromArray([8, 8, 8, 8, 8, 8]));
  const [skills, setSkills] = useState<string[]>([]);
  const [ownerId, setOwnerId] = useState('');

  const classDef = getClass(cls)!;
  const speciesDef = getSpecies(species)!;
  const values = method === 'standard_array' ? [...STANDARD_ARRAY] : pool;
  const base: AbilityScores = method === 'point_buy' ? buy : (Object.fromEntries(ABILITY_KEYS.map((k) => [k, values[assign[k]] ?? 10])) as AbilityScores);
  const final = Object.fromEntries(ABILITY_KEYS.map((k) => [k, Math.min(20, base[k] + (speciesDef.abilityBonuses[k] ?? 0))])) as AbilityScores;
  const level = campaign?.settings.startLevel ?? 1;
  const hp = maxHpFor(classDef.hitDie, level, abilityModifier(final.con));
  const spent = pointBuyCost(buy) ?? 99;
  const allowed = classDef.skillChoices.from === 'any' ? SKILLS.map((x) => x.key) : classDef.skillChoices.from;

  // Une valeur du tirage ne peut servir qu'une fois : on échange les affectations.
  const pick = (k: AbilityKey, index: number) => {
    const other = ABILITY_KEYS.find((x) => assign[x] === index)!;
    setAssign({ ...assign, [k]: index, [other]: assign[k] });
  };

  const submit = () => {
    if (!name.trim()) return toast('Nommez votre personnage.', 'error');
    if (method === 'point_buy' && spent > POINT_BUY_BUDGET) return toast(`Budget dépassé : ${spent} / ${POINT_BUY_BUDGET} points.`, 'error');
    create.mutate(
      {
        kind: 'pc', name: name.trim(), species: speciesDef.name, className: classDef.name, background, alignment: '', abilities: base,
        skills, ...(portrait ? { portraitUrl: portrait } : {}), ...(ownerId ? { ownerId } : {}),
      },
      { onSuccess: (c) => (toast(`${c.name} est forgé·e !`, 'success'), navigate(`/personnage/${c.id}`)), onError: (e) => toast(errorMessage(e), 'error') },
    );
  };

  return (
    <div className={s.forge}>
      <Panel className="ds-stack" style={{ gap: 22 }}>
        <div className="ds-stack" style={{ gap: 10 }}>
          <span className="ds-label">I · Espèce</span>
          <div className={s.chips}>
            {SPECIES.map((sp) => (
              <Chip key={sp.id} square active={species === sp.id} onClick={() => setSpecies(sp.id)}>
                {sp.name}
              </Chip>
            ))}
          </div>
          <span className="ds-help">{speciesDef.traits.map((t) => `${t.name} : ${t.summary}`).join(' · ')}</span>
        </div>
        <div className="ds-stack" style={{ gap: 10 }}>
          <span className="ds-label">II · Classe</span>
          <div className={s.chips}>
            {CLASSES.map((c) => (
              <Chip key={c.id} square active={cls === c.id} onClick={() => (setCls(c.id), setSkills([]))}>
                {c.name}
              </Chip>
            ))}
          </div>
        </div>
        <div className="ds-stack" style={{ gap: 12 }}>
          <div className="ds-row">
            <span className="ds-label ds-grow">III · Caractéristiques</span>
            <Segmented
              label="Méthode"
              value={method}
              onChange={setMethod}
              options={[
                { value: 'roll', label: '4d6' },
                { value: 'point_buy', label: 'Points' },
                { value: 'standard_array', label: 'Tableau' },
              ]}
            />
            {method === 'roll' && (
              <Button size="sm" onClick={() => setPool(rollAbilityScores(systemRng))}>
                Lancer les dés
              </Button>
            )}
          </div>
          {method === 'point_buy' && (
            <span className="ds-help" style={{ color: spent > POINT_BUY_BUDGET ? 'var(--magenta-light)' : undefined }}>
              {spent} / {POINT_BUY_BUDGET} points dépensés (scores de 8 à 15).
            </span>
          )}
          {method === 'roll' && <span className="ds-help">4d6, on garde les 3 meilleurs. Répartissez les valeurs obtenues.</span>}
          <div className={s.stats}>
            {ABILITY_KEYS.map((k) => (
              <div key={k} className={s.stat}>
                <span className="ds-label">{ABILITY_LABELS[k].short}</span>
                <strong>{final[k]}</strong>
                <span className={s.mod}>{signed(abilityModifier(final[k]))}</span>
                {method === 'point_buy' ? (
                  <Stepper label={ABILITY_LABELS[k].name} value={buy[k]} min={8} max={15} onChange={(v) => setBuy({ ...buy, [k]: v })} />
                ) : (
                  <Select value={assign[k]} onChange={(e) => pick(k, Number(e.target.value))} aria-label={`Valeur de ${ABILITY_LABELS[k].name}`}>
                    {values.map((v, i) => (
                      <option key={i} value={i}>
                        {v}
                      </option>
                    ))}
                  </Select>
                )}
                {speciesDef.abilityBonuses[k] ? <span className="ds-help">+{speciesDef.abilityBonuses[k]} espèce</span> : <span className="ds-help">&nbsp;</span>}
              </div>
            ))}
          </div>
        </div>
        <div className="ds-stack" style={{ gap: 10 }}>
          <span className="ds-label">
            IV · Compétences ({skills.length} / {classDef.skillChoices.count})
          </span>
          <div className={s.chips}>
            {SKILLS.filter((sk) => allowed.includes(sk.key)).map((sk) => (
              <Chip
                key={sk.key}
                square
                active={skills.includes(sk.key)}
                onClick={() => setSkills((xs) => (xs.includes(sk.key) ? xs.filter((x) => x !== sk.key) : xs.length < classDef.skillChoices.count ? [...xs, sk.key] : xs))}
              >
                {sk.name}
              </Chip>
            ))}
          </div>
        </div>
      </Panel>
      <Panel pad={false} className={s.preview}>
        <div style={{ padding: 6 }}>
          <ImageDrop value={portrait} onChange={setPortrait} label="Portrait du personnage" height={240} />
        </div>
        <div className="ds-stack" style={{ padding: '6px 22px 22px', gap: 10 }}>
          <span className="ds-label">Aperçu</span>
          <Input placeholder="Nom du héros" value={name} onChange={(e) => setName(e.target.value)} aria-label="Nom du personnage" />
          <Input placeholder="Historique (ex. Exilée)" value={background} onChange={(e) => setBackground(e.target.value)} aria-label="Historique" />
          <div className="ds-h2" style={{ color: 'var(--gold-light)' }}>
            {speciesDef.name} · {classDef.name}
          </div>
          <div style={{ color: 'var(--text-soft)', fontSize: 14 }}>
            Niveau {level} · PV {hp} · Dé de vie d{classDef.hitDie} · Vitesse {String(speciesDef.speed).replace('.', ',')} m
          </div>
          <span className="ds-help">Sauvegardes maîtrisées : {classDef.saves.map((k) => ABILITY_LABELS[k].short).join(', ')}</span>
          {isGm && campaign && (
            <Field label="Joueur" htmlFor="gen-owner">
              <Select id="gen-owner" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
                <option value="">Moi (MJ)</option>
                {campaign.members
                  .filter((m) => m.role === 'player')
                  .map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.displayName}
                    </option>
                  ))}
              </Select>
            </Field>
          )}
          <Button variant="primary" size="lg" block onClick={submit} disabled={create.isPending}>
            Forger la fiche
          </Button>
        </div>
      </Panel>
    </div>
  );
}

function NpcForge() {
  const { campaignId, isGm } = useCurrentCampaign();
  const create = useCreateCharacter(campaignId!);
  const toast = useToast();
  const navigate = useNavigate();
  const [npc, setNpc] = useState<GeneratedNpc>(() => generateNpc(systemRng));
  const [portrait, setPortrait] = useState<string | null>(null);
  return (
    <div className={s.npc}>
      <Panel pad={false} style={{ padding: 6 }}>
        <ImageDrop value={portrait} onChange={setPortrait} label="Portrait du PNJ" height={380} />
      </Panel>
      <Panel className="ds-stack" style={{ gap: 16 }}>
        <span className="ds-label">
          {npc.species} · {npc.job}
        </span>
        <Input className={s.npcName} value={npc.name} onChange={(e) => setNpc({ ...npc, name: e.target.value })} aria-label="Nom du PNJ" />
        <div className={s.npcCards}>
          <div className={s.npcCard}>
            <span className="ds-label">Trait</span>
            <p>{npc.trait}</p>
          </div>
          <div className={s.npcCard}>
            <span className="ds-label">Motivation</span>
            <p>{npc.goal}</p>
          </div>
          {isGm && (
            <div className={s.npcCard} style={{ borderColor: 'rgba(176,48,106,.5)' }}>
              <span className="ds-label" style={{ color: 'var(--magenta-light)' }}>
                Secret · MJ
              </span>
              <p>{npc.secret}</p>
            </div>
          )}
        </div>
        <div className="ds-row">
          <Button onClick={() => setNpc(generateNpc(systemRng))}>Invoquer un autre PNJ</Button>
          {isGm && (
            <Button
              variant="ghost"
              disabled={create.isPending}
              onClick={() =>
                create.mutate(
                  {
                    kind: 'npc', name: npc.name, visibleToPlayers: false, addToConstellation: true, ...(portrait ? { portraitUrl: portrait } : {}),
                    npc: { species: npc.species, job: npc.job, trait: npc.trait, goal: npc.goal, secret: npc.secret, attitude: 'neutre', notes: '' },
                  },
                  { onSuccess: (c) => (toast(`${c.name} rejoint la campagne (et la Constellation).`, 'success'), navigate(`/personnage/${c.id}`)), onError: (e) => toast(errorMessage(e), 'error') },
                )
              }
            >
              Ajouter à la campagne
            </Button>
          )}
        </div>
        {!isGm && <p className="ds-help">Seul le MJ peut inscrire un PNJ dans la campagne.</p>}
      </Panel>
    </div>
  );
}

function LootForge() {
  const { campaignId, isGm } = useCurrentCampaign();
  const { data: characters = [] } = useCampaignCharacters(campaignId);
  const toast = useToast();
  const [tier, setTier] = useState<LootTier>('1–4');
  const [loot, setLoot] = useState<GeneratedLoot | null>(null);
  const [target, setTarget] = useState('');
  const pcs = useMemo(() => characters.filter((c) => c.kind === 'pc'), [characters]);

  const distribute = async () => {
    if (!loot || !target) return;
    try {
      for (const it of loot.items) {
        await http.post(`/characters/${target}/actions`, {
          type: 'add_item',
          item: { name: it.name, ref: it.id, qty: 1, weight: ITEMS.find((x) => x.id === it.id)?.weight ?? 0, container: 'Sac à dos', equipped: false, rarity: it.rarity, requiresAttunement: false, attuned: false },
        });
      }
      toast('Butin distribué et inscrit dans la Chronique.', 'success');
      setLoot(null);
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  return (
    <Panel className="ds-stack" style={{ gap: 18 }}>
      <div className="ds-row">
        <span className="ds-label">Niveau du trésor</span>
        {LOOT_TIERS.map((t) => (
          <Chip key={t} active={tier === t} onClick={() => setTier(t)}>
            Niv. {t}
          </Chip>
        ))}
        <span className="ds-grow" />
        <Button onClick={() => setLoot(generateLoot(tier, systemRng))}>Ouvrir le coffre</Button>
      </div>
      {loot ? (
        <>
          <div className="ds-h2" style={{ color: 'var(--gold-light)' }}>
            {loot.gold.toLocaleString('fr-FR')} pièces d’or
          </div>
          <div className={s.loot}>
            {loot.items.map((it, i) => (
              <div key={`${it.id}${i}`} className={s.lootItem} style={{ borderColor: RARITY_COLORS[it.rarity] }}>
                <strong>{it.name}</strong>
                <span style={{ color: RARITY_COLORS[it.rarity] }}>{it.rarity}</span>
              </div>
            ))}
          </div>
          {isGm && pcs.length > 0 && (
            <div className="ds-row">
              <Select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Personnage destinataire" style={{ width: 'auto' }}>
                <option value="">Donner les objets à…</option>
                {pcs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              <Button variant="heal" disabled={!target} onClick={() => void distribute()}>
                Distribuer
              </Button>
            </div>
          )}
        </>
      ) : (
        <Empty title="Le coffre est encore scellé." />
      )}
    </Panel>
  );
}

type Tab = 'pj' | 'pnj' | 'tresor';

/** « La Forge des Destins » : héros, PNJ et trésors (maquette Génération). */
export default function GenerationPage() {
  const { current } = useCurrentCampaign();
  const [tab, setTab] = useState<Tab>('pj');
  return (
    <div className="ds-page">
      <div className="ds-page-head">
        <div>
          <div className="ds-label">Génération</div>
          <h1 className="ds-h1">La Forge des Destins</h1>
        </div>
        <Segmented
          label="Que forger ?"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'pj', label: 'Personnage' },
            { value: 'pnj', label: 'PNJ' },
            { value: 'tresor', label: 'Trésor' },
          ]}
        />
      </div>
      {!current ? (
        <Panel>
          <Empty title="Choisissez d’abord une campagne." />
        </Panel>
      ) : tab === 'pj' ? (
        <CharacterForge key={current.id} />
      ) : tab === 'pnj' ? (
        <NpcForge />
      ) : (
        <LootForge />
      )}
    </div>
  );
}
