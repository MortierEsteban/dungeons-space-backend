import { TONES, VARIANT_KEYS, VARIANT_LABELS, type VariantKey } from '@ds/shared';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { errorMessage } from '../../shared/api/client';
import { Button, Chip, cx, Field, Input, Modal, Rune, Select, TextArea, Toggle } from '../../shared/ui/components';
import { ImageDrop } from '../../shared/ui/ImageDrop';
import { useToast } from '../../shared/ui/toast';
import { useCreateCampaign } from './api';
import { useCurrentCampaign } from './CampaignContext';
import s from './campaigns.module.css';

const STEPS = ['Univers', 'Règles', 'Joueurs', 'Récapitulatif'];
const ROMAN = ['I', 'II', 'III', 'IV'];

interface FormState {
  name: string;
  synopsis: string;
  tone: (typeof TONES)[number];
  coverUrl: string | null;
  visibility: 'private' | 'public';
  recruiting: boolean;
  invites: string[];
  settings: {
    startLevel: number;
    statMethod: 'roll' | 'point_buy' | 'standard_array';
    variants: Partial<Record<VariantKey, boolean>>;
    diagonalRule: 'simple' | 'alternate';
    playerConstellation: boolean;
  };
}

const initial = (): FormState => ({
  name: '',
  synopsis: '',
  tone: 'Héroïque',
  coverUrl: null,
  visibility: 'private',
  recruiting: false,
  invites: [],
  settings: { startLevel: 1, statMethod: 'roll', variants: { maxCrits: true }, diagonalRule: 'simple', playerConstellation: false },
});

/** « Fonder une campagne » : assistant en 4 étapes (maquette Création de campagne). */
export function NewCampaignModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(initial);
  const [invite, setInvite] = useState('');
  const create = useCreateCampaign();
  const { select } = useCurrentCampaign();
  const navigate = useNavigate();
  const toast = useToast();
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const setSettings = (patch: Partial<typeof form.settings>) => setForm((f) => ({ ...f, settings: { ...f.settings, ...patch } }));

  const addInvite = () => {
    const mail = invite.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(mail) || form.invites.includes(mail)) return;
    set({ invites: [...form.invites, mail] });
    setInvite('');
  };

  const close = () => {
    onClose();
    setStep(0);
    setForm(initial());
    create.reset();
  };

  const next = () => {
    if (step === 0 && form.name.trim().length < 2) return toast('Donnez un nom à votre campagne.', 'error');
    if (step < 3) return setStep(step + 1);
    create.mutate(form, {
      onSuccess: (c) => {
        select(c.id);
        toast(`« ${c.name} » est fondée. Code d’invitation : ${c.joinCode}`, 'success');
        close();
        navigate('/explorer');
      },
    });
  };

  return (
    <Modal open={open} onClose={close} title="Fonder une campagne" width={820}>
      <div className={s.steps}>
        {STEPS.map((label, i) => (
          <button key={label} type="button" className={cx(s.step, i === step && s.stepOn, i < step && s.stepDone)} onClick={() => i <= step && setStep(i)}>
            <span className={s.stepGem} />
            {ROMAN[i]} · {label}
          </button>
        ))}
      </div>

      {step === 0 && (
        <div className={s.wizardGrid}>
          <div className="ds-stack" style={{ gap: 16 }}>
            <Field label="Nom de la campagne" htmlFor="camp-name">
              <Input id="camp-name" value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Les Cendres de Valombre" autoFocus />
            </Field>
            <Field label="Synopsis" htmlFor="camp-syn">
              <TextArea id="camp-syn" rows={5} value={form.synopsis} onChange={(e) => set({ synopsis: e.target.value })} placeholder="Une cité engloutie par les cendres d'un volcan éteint depuis mille ans… qui vient de se réveiller." />
            </Field>
            <div className="ds-stack" style={{ gap: 8 }}>
              <span className="ds-label">Tonalité</span>
              <div className="ds-row" style={{ gap: 8 }}>
                {TONES.map((t) => (
                  <Chip key={t} active={form.tone === t} onClick={() => set({ tone: t })}>
                    {t}
                  </Chip>
                ))}
              </div>
            </div>
          </div>
          <ImageDrop value={form.coverUrl} onChange={(url) => set({ coverUrl: url })} label="Couverture de campagne" height={300} />
        </div>
      )}

      {step === 1 && (
        <div className={s.rulesGrid}>
          <Field label="Niveau de départ" htmlFor="camp-lvl">
            <Select id="camp-lvl" value={form.settings.startLevel} onChange={(e) => setSettings({ startLevel: Number(e.target.value) })}>
              {[1, 3, 5, 10].map((l) => (
                <option key={l} value={l}>
                  Niveau {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Caractéristiques" htmlFor="camp-stats">
            <Select id="camp-stats" value={form.settings.statMethod} onChange={(e) => setSettings({ statMethod: e.target.value as typeof form.settings.statMethod })}>
              <option value="roll">4d6 (garder 3)</option>
              <option value="point_buy">Achat de points</option>
              <option value="standard_array">Tableau standard</option>
            </Select>
          </Field>
          <Field label="Règle des diagonales" htmlFor="camp-diag">
            <Select id="camp-diag" value={form.settings.diagonalRule} onChange={(e) => setSettings({ diagonalRule: e.target.value as 'simple' | 'alternate' })}>
              <option value="simple">Simple (1,5 m par case)</option>
              <option value="alternate">Variante 1,5 / 3 / 1,5 m</option>
            </Select>
          </Field>
          {VARIANT_KEYS.map((k) => (
            <Toggle key={k} checked={!!form.settings.variants[k]} onChange={(v) => setSettings({ variants: { ...form.settings.variants, [k]: v } })}>
              {VARIANT_LABELS[k]}
            </Toggle>
          ))}
          <Toggle checked={form.settings.playerConstellation} onChange={(v) => setSettings({ playerConstellation: v })}>
            Vue joueur de la Constellation
          </Toggle>
          <Toggle checked={form.visibility === 'public'} onChange={(v) => set({ visibility: v ? 'public' : 'private', recruiting: v && form.recruiting })}>
            Campagne publique (Explorer)
          </Toggle>
          {form.visibility === 'public' && (
            <Toggle checked={form.recruiting} onChange={(v) => set({ recruiting: v })}>
              Recrute des joueurs
            </Toggle>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="ds-stack" style={{ gap: 14 }}>
          <div className="ds-row">
            <Input className="ds-grow" style={{ flex: 1 }} type="email" placeholder="courriel d'un joueur" value={invite} onChange={(e) => setInvite(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addInvite())} aria-label="Courriel à inviter" />
            <Button onClick={addInvite}>Inviter</Button>
          </div>
          {form.invites.map((mail) => (
            <div key={mail} className={s.inviteRow}>
              <span className={s.inviteGem} />
              <span className="ds-grow">{mail}</span>
              <span className="ds-help">invitation à l’ouverture</span>
              <Button variant="danger" size="sm" onClick={() => set({ invites: form.invites.filter((m) => m !== mail) })}>
                Retirer
              </Button>
            </div>
          ))}
          <p className="ds-help">Les invités verront la campagne dans leur sélecteur à leur prochaine connexion. Un code d’invitation sera aussi généré pour la partager de vive voix.</p>
        </div>
      )}

      {step === 3 && (
        <div className={s.recap}>
          <Rune size={22} />
          <div className="ds-h1" style={{ marginTop: 10 }}>
            {form.name || 'Sans nom'}
          </div>
          <div style={{ color: 'var(--text-soft)' }}>
            Ton {form.tone.toLowerCase()} · niveau {form.settings.startLevel} · {form.invites.length} joueur{form.invites.length > 1 ? 's' : ''} invité{form.invites.length > 1 ? 's' : ''} · D&D 5e (SRD 5.1)
          </div>
          {form.synopsis && <p className="ds-help" style={{ maxWidth: 520 }}>{form.synopsis}</p>}
          {create.error && <p style={{ color: 'var(--magenta-light)' }}>{errorMessage(create.error)}</p>}
        </div>
      )}

      <div className={s.wizardFoot}>
        <Button variant="ghost" onClick={() => (step === 0 ? close() : setStep(step - 1))}>
          {step === 0 ? 'Annuler' : 'Retour'}
        </Button>
        <Button variant="primary" onClick={next} disabled={create.isPending}>
          {step === 3 ? (create.isPending ? 'Les dés roulent…' : 'Ouvrir la table') : 'Continuer'}
        </Button>
      </div>
    </Modal>
  );
}
