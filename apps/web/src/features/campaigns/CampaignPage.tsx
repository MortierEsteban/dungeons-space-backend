import { TONES, VARIANT_KEYS, VARIANT_LABELS } from '@ds/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { errorMessage, http } from '../../shared/api/client';
import { initials, shortDate } from '../../shared/format';
import { Button, Chip, Empty, Field, IconButton, Input, Loading, Panel, PanelTitle, Rule, TextArea, Toggle } from '../../shared/ui/components';
import { ImageDrop } from '../../shared/ui/ImageDrop';
import { useToast } from '../../shared/ui/toast';
import { useMe } from '../auth/api';
import { useCampaign, useCampaignAdmin, useSessions, useUpdateCampaign } from './api';
import { useCurrentCampaign } from './CampaignContext';
import s from './campaigns.module.css';

function Recap({ campaignId, number }: { campaignId: string; number: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['campaign', campaignId, 'recap', number],
    queryFn: () => http.get<{ text: string }>(`/campaigns/${campaignId}/sessions/${number}/recap`),
  });
  if (isLoading) return <span className="ds-help">Les pages se tournent…</span>;
  return <p style={{ margin: 0, whiteSpace: 'pre-wrap', color: 'var(--text-soft)', fontSize: 14 }}>{data?.text}</p>;
}

/** Campagne : table, code d'invitation, sessions et récapitulatifs, réglages du MJ. */
export default function CampaignPage() {
  const { campaignId, isGm } = useCurrentCampaign();
  const { data: campaign, isLoading } = useCampaign(campaignId);
  const { data: sessions = [] } = useSessions(campaignId);
  const { data: me } = useMe();
  const admin = useCampaignAdmin(campaignId ?? '');
  const update = useUpdateCampaign(campaignId ?? '');
  const toast = useToast();
  const navigate = useNavigate();
  const [invite, setInvite] = useState('');
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [recap, setRecap] = useState<number | null>(null);
  const [form, setForm] = useState({ name: '', synopsis: '', next: '' });
  useEffect(() => {
    if (campaign) setForm({ name: campaign.name, synopsis: campaign.synopsis, next: campaign.nextSessionAt ? campaign.nextSessionAt.slice(0, 16) : '' });
  }, [campaign]);
  const onError = (e: unknown) => toast(errorMessage(e), 'error');

  if (!campaignId) {
    return (
      <div className="ds-page">
        <Panel>
          <Empty title="Aucune campagne sélectionnée." />
        </Panel>
      </div>
    );
  }
  if (isLoading || !campaign) return <Loading />;

  const open = campaign.currentSession && !campaign.currentSession.endedAt ? campaign.currentSession : null;
  const settings = campaign.settings;

  return (
    <div className="ds-page">
      <div className="ds-page-head">
        <div>
          <div className="ds-label">{isGm ? 'Maître du jeu' : 'Campagne'}</div>
          <h1 className="ds-h1">{campaign.name}</h1>
          <p className="ds-help" style={{ marginTop: 6 }}>
            {campaign.tone} · {campaign.playerCount} joueur{campaign.playerCount > 1 ? 's' : ''} · niveau {campaign.level} · D&D 5e (SRD 5.1)
          </p>
        </div>
        <Button variant="ghost" onClick={() => navigate('/explorer')}>
          Ouvrir la Chronique
        </Button>
      </div>
      <div className={s.twoCol}>
        <div className="ds-stack" style={{ gap: 18 }}>
          <Panel>
            <PanelTitle>Sessions</PanelTitle>
            {isGm && (
              <div className="ds-stack" style={{ gap: 10, marginBottom: 14 }}>
                {open ? (
                  <>
                    <p style={{ margin: 0 }}>
                      Session <strong>{open.number}</strong> en cours{open.title ? ` — ${open.title}` : ''} (depuis le {shortDate(open.startedAt)}).
                    </p>
                    <TextArea rows={3} placeholder="Résumé de fin de session (facultatif)" value={summary} onChange={(e) => setSummary(e.target.value)} aria-label="Résumé de session" />
                    <Button variant="secondary" onClick={() => admin.endSession.mutate(summary, { onSuccess: () => (setSummary(''), toast('Session close et inscrite dans la Chronique.', 'success')), onError })}>
                      Clore la session
                    </Button>
                  </>
                ) : (
                  <div className="ds-row">
                    <Input style={{ flex: 1 }} placeholder="Titre de la prochaine session" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Titre de session" />
                    <Button variant="primary" onClick={() => admin.startSession.mutate(title, { onSuccess: () => (setTitle(''), toast('La session commence !', 'success')), onError })}>
                      Démarrer la session
                    </Button>
                  </div>
                )}
              </div>
            )}
            {sessions.length === 0 && <span className="ds-help">Aucune session jouée pour l’instant.</span>}
            {sessions.map((se) => (
              <div key={se.id} className={s.memberRow} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <div className="ds-row">
                  <strong className="ds-grow" style={{ fontFamily: 'var(--font-title)', fontWeight: 500 }}>
                    Session {se.number}
                    {se.title && se.title !== `Session ${se.number}` ? ` — ${se.title}` : ''}
                  </strong>
                  <span className="ds-help">{se.endedAt ? shortDate(se.startedAt) : 'en cours'}</span>
                  <Button size="sm" variant="link" onClick={() => setRecap(recap === se.number ? null : se.number)}>
                    {recap === se.number ? 'Masquer' : 'Récapitulatif'}
                  </Button>
                </div>
                {se.summary && <p className="ds-help" style={{ margin: '4px 0 0' }}>{se.summary}</p>}
                {recap === se.number && <Recap campaignId={campaign.id} number={se.number} />}
              </div>
            ))}
          </Panel>

          {isGm && (
            <Panel className="ds-stack" style={{ gap: 14 }}>
              <PanelTitle>Réglages</PanelTitle>
              <Field label="Nom" htmlFor="c-name">
                <Input id="c-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field label="Synopsis" htmlFor="c-syn">
                <TextArea id="c-syn" rows={4} value={form.synopsis} onChange={(e) => setForm({ ...form, synopsis: e.target.value })} />
              </Field>
              <Field label="Prochaine session" htmlFor="c-next">
                <Input id="c-next" type="datetime-local" value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} />
              </Field>
              <div className="ds-row">
                <Button
                  variant="primary"
                  onClick={() =>
                    update.mutate(
                      { name: form.name, synopsis: form.synopsis, nextSessionAt: form.next ? new Date(form.next).toISOString() : null },
                      { onSuccess: () => toast('Campagne mise à jour.', 'success'), onError },
                    )
                  }
                >
                  Enregistrer
                </Button>
              </div>
              <Rule />
              <span className="ds-label">Tonalité</span>
              <div className="ds-row" style={{ gap: 6 }}>
                {TONES.map((t) => (
                  <Chip key={t} active={campaign.tone === t} onClick={() => update.mutate({ tone: t })}>
                    {t}
                  </Chip>
                ))}
              </div>
              <div className={s.rulesGrid}>
                {VARIANT_KEYS.map((k) => (
                  <Toggle key={k} checked={!!settings.variants[k]} onChange={(v) => update.mutate({ settings: { ...settings, variants: { ...settings.variants, [k]: v } } })}>
                    {VARIANT_LABELS[k]}
                  </Toggle>
                ))}
                <Toggle checked={settings.diagonalRule === 'alternate'} onChange={(v) => update.mutate({ settings: { ...settings, diagonalRule: v ? 'alternate' : 'simple' } })}>
                  Diagonales 1,5 / 3 m
                </Toggle>
                <Toggle checked={settings.playerConstellation} onChange={(v) => update.mutate({ settings: { ...settings, playerConstellation: v } })}>
                  Vue joueur de la Constellation
                </Toggle>
                <Toggle checked={campaign.visibility === 'public'} onChange={(v) => update.mutate({ visibility: v ? 'public' : 'private' })}>
                  Campagne publique
                </Toggle>
                <Toggle checked={campaign.recruiting} onChange={(v) => update.mutate({ recruiting: v })}>
                  Recrute des joueurs
                </Toggle>
                <Toggle checked={campaign.status === 'finished'} onChange={(v) => update.mutate({ status: v ? 'finished' : 'active' })}>
                  Campagne terminée
                </Toggle>
              </div>
            </Panel>
          )}
        </div>

        <div className="ds-stack" style={{ gap: 18 }}>
          {isGm && (
            <Panel className="ds-stack" style={{ gap: 10 }}>
              <span className="ds-label">Code d’invitation</span>
              <div className="ds-row">
                <span className={s.code}>{campaign.joinCode}</span>
                <span className="ds-grow" />
                <Button size="sm" variant="ghost" onClick={() => campaign.joinCode && void navigator.clipboard?.writeText(campaign.joinCode).then(() => toast('Code copié.', 'success'))}>
                  Copier
                </Button>
                <Button size="sm" variant="ghost" onClick={() => admin.regenerateCode.mutate(undefined, { onError })}>
                  Renouveler
                </Button>
              </div>
              <span className="ds-help">Partagez ce code : vos joueurs le saisissent dans le sélecteur de campagne.</span>
            </Panel>
          )}
          <Panel>
            <PanelTitle>La table · {campaign.members.length}</PanelTitle>
            {campaign.members.map((m) => (
              <div key={m.userId} className={s.memberRow}>
                <span className={s.avatar}>{initials(m.displayName)}</span>
                <span className="ds-grow">
                  {m.displayName}
                  {m.userId === me?.id ? ' (vous)' : ''}
                </span>
                <span className={`${s.roleTag} ${m.role === 'gm' ? s.roleTagGm : ''}`}>{m.role === 'gm' ? 'MJ' : 'Joueur'}</span>
                {isGm && m.role !== 'gm' && (
                  <IconButton label={`Retirer ${m.displayName}`} onClick={() => window.confirm(`Retirer ${m.displayName} de la campagne ?`) && admin.removeMember.mutate(m.userId)}>
                    ×
                  </IconButton>
                )}
              </div>
            ))}
            {!isGm && (
              <Button
                variant="danger"
                size="sm"
                style={{ marginTop: 12 }}
                onClick={() => window.confirm('Quitter cette campagne ?') && admin.removeMember.mutate(me!.id, { onSuccess: () => navigate('/') })}
              >
                Quitter la campagne
              </Button>
            )}
          </Panel>
          {isGm && (
            <Panel className="ds-stack" style={{ gap: 10 }}>
              <span className="ds-label">Inviter par courriel</span>
              <div className="ds-row">
                <Input style={{ flex: 1 }} type="email" placeholder="courriel d'un joueur" value={invite} onChange={(e) => setInvite(e.target.value)} aria-label="Courriel" />
                <Button onClick={() => admin.invite.mutate(invite.trim(), { onSuccess: () => (setInvite(''), toast('Invitation enregistrée.', 'success')), onError })}>Inviter</Button>
              </div>
              {campaign.invitations.map((i) => (
                <div key={i.id} className={s.inviteRow}>
                  <span className={s.inviteGem} />
                  <span className="ds-grow">{i.email}</span>
                  <Button size="sm" variant="danger" onClick={() => admin.revokeInvite.mutate(i.id)}>
                    Retirer
                  </Button>
                </div>
              ))}
            </Panel>
          )}
          {isGm && (
            <Panel>
              <span className="ds-label">Couverture</span>
              <div style={{ marginTop: 10 }}>
                <ImageDrop value={campaign.coverUrl} onChange={(url) => update.mutate({ coverUrl: url })} label="Couverture de campagne" height={180} />
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
