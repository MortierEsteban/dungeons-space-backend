import { useState } from 'react';
import { useNavigate } from 'react-router';
import { errorMessage } from '../../shared/api/client';
import { shortDate } from '../../shared/format';
import { Button, Empty, Field, Input, Loading, Modal, Panel, Select, Tag, Toggle } from '../../shared/ui/components';
import { useToast } from '../../shared/ui/toast';
import { useCurrentCampaign } from '../campaigns/CampaignContext';
import { useEncounterAdmin, useEncounters } from './api';
import s from './combat.module.css';

const STATUS: Record<string, { label: string; color: string }> = {
  setup: { label: 'En préparation', color: 'var(--gold)' },
  active: { label: 'En cours', color: 'var(--arcane-light)' },
  ended: { label: 'Terminé', color: 'var(--ash)' },
};

function NewEncounter({ open, onClose }: { open: boolean; onClose(): void }) {
  const { campaignId } = useCurrentCampaign();
  const { create } = useEncounterAdmin(campaignId!);
  const navigate = useNavigate();
  const toast = useToast();
  const [name, setName] = useState('');
  const [size, setSize] = useState('24x15');
  const [party, setParty] = useState(true);
  const [hide, setHide] = useState(true);
  const submit = () => {
    const [cols, rows] = size.split('x').map(Number);
    create.mutate(
      { name: name.trim() || 'Nouvelle rencontre', cols, rows, includeParty: party, hideMonsterStats: hide },
      { onSuccess: (e) => navigate(`/combat/${e.id}`), onError: (e) => toast(errorMessage(e), 'error') },
    );
  };
  return (
    <Modal open={open} onClose={onClose} title="Préparer une rencontre">
      <div className="ds-stack" style={{ gap: 14 }}>
        <Field label="Nom de la scène" htmlFor="enc-name">
          <Input id="enc-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="La Crypte des Murmures · Salle 2" autoFocus />
        </Field>
        <Field label="Taille de la carte" htmlFor="enc-size">
          <Select id="enc-size" value={size} onChange={(e) => setSize(e.target.value)}>
            <option value="16x10">Petite · 16 × 10 cases</option>
            <option value="24x15">Moyenne · 24 × 15 cases</option>
            <option value="32x20">Grande · 32 × 20 cases</option>
            <option value="40x26">Vaste · 40 × 26 cases</option>
          </Select>
        </Field>
        <Toggle checked={party} onChange={setParty}>
          Placer les personnages du groupe
        </Toggle>
        <Toggle checked={hide} onChange={setHide}>
          Masquer PV et CA des créatures aux joueurs
        </Toggle>
        <div className="ds-row" style={{ justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="primary" onClick={submit} disabled={create.isPending}>
            Dresser le champ de bataille
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default function CombatPage() {
  const { campaignId, current, isGm } = useCurrentCampaign();
  const { data: encounters = [], isLoading } = useEncounters(campaignId);
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  return (
    <div className="ds-page">
      <div className="ds-page-head">
        <div>
          <div className="ds-label">Combattre{current ? ` · ${current.name}` : ''}</div>
          <h1 className="ds-h1">Champs de bataille</h1>
        </div>
        {isGm && (
          <Button variant="primary" onClick={() => setCreating(true)}>
            + Préparer une rencontre
          </Button>
        )}
      </div>
      {!current ? (
        <Panel>
          <Empty title="Aucune campagne sélectionnée." />
        </Panel>
      ) : isLoading ? (
        <Loading />
      ) : encounters.length === 0 ? (
        <Panel>
          <Empty title="Aucun combat pour l’instant." action={isGm ? <Button onClick={() => setCreating(true)}>Préparer une rencontre</Button> : undefined}>
            {isGm ? 'Dressez une carte, placez vos créatures et lancez l’initiative.' : 'Votre MJ n’a pas encore préparé de rencontre.'}
          </Empty>
        </Panel>
      ) : (
        <div className={s.encounterGrid}>
          {encounters.map((e) => (
            <Panel key={e.id} className={s.encounterCard} style={e.status === 'active' ? { boxShadow: 'var(--panel-shadow), var(--arcane-glow)' } : undefined}>
              <div className="ds-row">
                <Tag color={STATUS[e.status]!.color}>{STATUS[e.status]!.label}</Tag>
                <span className="ds-help">{shortDate(e.updatedAt)}</span>
              </div>
              <h2 className="ds-h3" style={{ color: 'var(--text-strong)' }}>
                {e.name}
              </h2>
              <div className="ds-help">
                {e.combatantCount} créature{e.combatantCount > 1 ? 's' : ''}
                {e.round > 0 ? ` · round ${e.round}` : ''}
              </div>
              <Button variant={e.status === 'active' ? 'primary' : 'ghost'} onClick={() => navigate(`/combat/${e.id}`)}>
                {e.status === 'active' ? 'Rejoindre le combat' : e.status === 'ended' ? 'Revoir (replay)' : 'Ouvrir'}
              </Button>
            </Panel>
          ))}
        </div>
      )}
      <NewEncounter open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
