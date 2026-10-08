import { XP_THRESHOLDS } from '@ds/rules';
import type { CharacterDto } from '@ds/shared';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { initials, num, signed } from '../../shared/format';
import { useDice } from '../../shared/dice/DiceProvider';
import { useLocalPref } from '../../shared/hooks';
import { Bar, Button, Chip, cx, Empty, Loading, Panel, Portrait, Stat, Stepper, Tabs } from '../../shared/ui/components';
import { ImageDrop } from '../../shared/ui/ImageDrop';
import { ModelDrop } from '../combat/ModelDrop';
import { useCurrentCampaign } from '../campaigns/CampaignContext';
import { useCampaignCharacters, useCharacter, useMyCharacters } from './api';
import { CharacterEvents } from './CharacterEvents';
import { InventoryTab } from './InventoryTab';
import { NotesTab } from './NotesTab';
import { NpcSheet } from './NpcSheet';
import { SheetOverview } from './SheetOverview';
import { SpellsTab } from './SpellsTab';
import { useSheet } from './useSheet';
import s from './character.module.css';

type Tab = 'apercu' | 'sorts' | 'inv' | 'notes' | 'events' | 'apparence';

function HpPanel({ character }: { character: CharacterDto }) {
  const sh = useSheet(character);
  const [amount, setAmount] = useState(5);
  const hp = character.sheet!.hp;
  return (
    <Panel className={s.hpPanel}>
      <div className="ds-row" style={{ alignItems: 'baseline' }}>
        <span className="ds-label ds-grow">Points de vie</span>
        <strong className={s.hpValue}>{hp.current}</strong>
        <span className="ds-muted">/ {hp.max}</span>
        {hp.temp > 0 && <span className={s.temp}>+{hp.temp}</span>}
      </div>
      <Bar value={hp.current} max={hp.max} label="Points de vie" />
      {sh.canEdit && (
        <div className={s.hpControls}>
          <Button variant="damage" onClick={() => sh.act({ type: 'damage', amount })} disabled={sh.busy}>
            Dégâts
          </Button>
          <Stepper label="Montant" value={amount} onChange={setAmount} min={0} max={999} />
          <Button variant="heal" onClick={() => sh.act({ type: 'heal', amount })} disabled={sh.busy}>
            Soins
          </Button>
          <Button variant="ghost" size="sm" onClick={() => sh.act({ type: 'temp_hp', amount })} disabled={sh.busy}>
            Temp.
          </Button>
        </div>
      )}
    </Panel>
  );
}

function PcSheet({ character }: { character: CharacterDto }) {
  const sh = useSheet(character);
  const dice = useDice();
  const [tab, setTab] = useLocalPref<Tab>('sheetTab', 'apercu');
  const [name, setName] = useState(character.name);
  useEffect(() => setName(character.name), [character.name]);
  const sheet = character.sheet!;
  const d = character.derived!;
  const roll = (label: string, mod: number) => void dice.roll(character.campaignId, `${label} — ${character.name.split(' ')[0]}`, `1d20${mod >= 0 ? '+' : ''}${mod}`, { characterId: character.id });
  const xpNext = d.xpNext ?? sheet.xp;
  const prevXp = XP_THRESHOLDS[sheet.level - 1] ?? 0;
  const canLevel = d.levelFromXp > sheet.level;

  return (
    <>
      <Panel className={s.header}>
        <div className={s.portraitCol}>
          {sh.canEdit ? (
            <ImageDrop value={character.portraitUrl} onChange={sh.setPortrait} label="Portrait" height={170} />
          ) : (
            <Portrait src={character.portraitUrl} name={character.name} height={170} />
          )}
        </div>
        <div className={s.identity}>
          {sh.canEdit ? (
            <input className={s.nameInput} value={name} onChange={(e) => setName(e.target.value)} onBlur={() => sh.rename(name)} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} aria-label="Nom du personnage" />
          ) : (
            <h1 className={s.name}>{character.name}</h1>
          )}
          <div className={s.sub}>
            {sheet.species} · {sheet.className} niveau {sheet.level}
            {sheet.background && <em> · {sheet.background}</em>}
            {character.ownerName && <span className="ds-muted"> · joué par {character.ownerName}</span>}
          </div>
          <div className={s.statRow}>
            <Stat label="CA" value={d.armorClass} overridden={d.overridden.includes('armorClass')} />
            <Stat label="Initiative" value={signed(d.initiative)} accent onClick={() => roll('Initiative', d.initiative)} title="Lancer l'initiative" />
            <Stat label="Vitesse" value={`${num(sheet.speed)} m`} />
            <Stat label="Maîtrise" value={signed(d.proficiencyBonus)} />
            <Stat
              label="Inspiration"
              value={sheet.inspiration ? '◆' : '◇'}
              onClick={sh.canEdit ? () => sh.edit((x) => void (x.inspiration = !x.inspiration)) : undefined}
              title="Basculer l'inspiration"
            />
          </div>
          <div className={s.xp}>
            <span className="ds-label">XP</span>
            <Bar value={sheet.xp - prevXp} max={Math.max(1, xpNext - prevXp)} color="var(--gold)" label="Expérience" className="ds-grow" />
            <span className="ds-help">
              {num(sheet.xp)} / {num(xpNext)}
            </span>
            {canLevel && sh.canEdit && (
              <Button size="sm" variant="heal" onClick={() => sh.act({ type: 'level_up' }, 'Niveau supérieur !')}>
                Monter de niveau
              </Button>
            )}
          </div>
        </div>
        <HpPanel character={character} />
      </Panel>

      <Tabs
        label="Sections de la fiche"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'apercu', label: 'Aperçu' },
          ...(sheet.spellcasting ? [{ value: 'sorts' as const, label: 'Sorts', count: sheet.spellcasting.spells.length }] : []),
          { value: 'inv', label: 'Inventaire', count: sheet.inventory.length },
          { value: 'notes', label: 'Notes' },
          { value: 'events', label: 'Événements' },
          { value: 'apparence', label: 'Apparence 3D' },
        ]}
      />
      {tab === 'apercu' && <SheetOverview character={character} onRoll={roll} />}
      {tab === 'sorts' && sheet.spellcasting && <SpellsTab character={character} />}
      {tab === 'inv' && <InventoryTab character={character} />}
      {tab === 'notes' && <NotesTab character={character} />}
      {tab === 'events' && <CharacterEvents character={character} />}
      {tab === 'apparence' && (
        <Panel className="ds-stack">
          <span className="ds-label">Apparence sur le plateau de combat</span>
          <p className="ds-help" style={{ margin: 0 }}>
            Importez la figurine de votre héros au format .glb (glTF binaire, textures embarquées) : elle remplacera le jeton sur le plateau 3D, s’orientera
            dans le sens de la marche et jouera ses animations « idle », « walk » et « death » si elle en possède. Sans modèle, un jeton à vos couleurs est utilisé.
          </p>
          <ModelDrop value={character.modelUrl} onChange={sh.setModel} name={character.name} disabled={!sh.canEdit} />
        </Panel>
      )}
    </>
  );
}

/** Fiche de personnage (maquette « Fiche Personnage ») : mobile-first, lisible à table. */
export default function CharacterPage() {
  const { characterId } = useParams();
  const navigate = useNavigate();
  const { campaignId, isGm, current } = useCurrentCampaign();
  const { data: mine = [] } = useMyCharacters();
  const { data: campaignChars = [] } = useCampaignCharacters(campaignId);
  const inCampaign = mine.filter((c) => c.campaignId === campaignId);
  const roster = (isGm ? campaignChars : [...inCampaign, ...campaignChars.filter((c) => c.kind === 'npc')]).slice().sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'pc' ? -1 : 1));
  const fallback = (isGm ? campaignChars.find((c) => c.kind === 'pc') : inCampaign[0])?.id ?? null;
  const id = characterId ?? fallback;
  const { data: character, isLoading } = useCharacter(id);

  return (
    <div className="ds-page">
      <div className={s.roster}>
        <span className="ds-label">{isGm ? 'Personnages de la table' : 'Mes personnages'}</span>
        {roster.map((c) => (
          <Chip key={c.id} className={cx(s.rosterChip)} active={c.id === id} onClick={() => navigate(`/personnage/${c.id}`)}>
            <span className={s.rosterInit}>{initials(c.name)}</span>
            {c.name.length > 16 ? c.name.split(' ')[0] : c.name}
            <span className="ds-muted" style={{ textTransform: 'none', letterSpacing: 0 }}>
              {c.kind === 'npc' ? 'PNJ' : c.subtitle.split('·')[1]?.trim()}
            </span>
          </Chip>
        ))}
        <Button variant="ghost" size="sm" onClick={() => navigate('/generation')} disabled={!current}>
          + Nouveau personnage
        </Button>
      </div>
      {!id ? (
        <Panel>
          <Empty title="Aucun héros dans cette campagne." action={current ? <Button onClick={() => navigate('/generation')}>Forger un personnage</Button> : undefined}>
            {current ? 'Forgez votre personnage dans la Génération.' : 'Choisissez d’abord une campagne.'}
          </Empty>
        </Panel>
      ) : isLoading || !character ? (
        <Loading />
      ) : character.kind === 'npc' ? (
        <NpcSheet character={character} />
      ) : (
        <PcSheet key={character.id} character={character} />
      )}
    </div>
  );
}
