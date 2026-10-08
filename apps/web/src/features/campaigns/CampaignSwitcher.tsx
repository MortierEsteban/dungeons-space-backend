import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router';
import { errorMessage } from '../../shared/api/client';
import { campaignColor } from '../../shared/format';
import { useDismiss } from '../../shared/hooks';
import { Button, cx, Input } from '../../shared/ui/components';
import { useToast } from '../../shared/ui/toast';
import { useAcceptInvitation, useInvitations, useJoinCampaign } from './api';
import { useCurrentCampaign } from './CampaignContext';
import { NewCampaignModal } from './NewCampaignModal';
import s from './campaigns.module.css';

/** Sélecteur de campagne (barre supérieure) : changer, rejoindre par code, fonder. */
export function CampaignSwitcher() {
  const { campaigns, current, select } = useCurrentCampaign();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [joinOpen, setJoinOpen] = useState(false);
  const [code, setCode] = useState('');
  const [creating, setCreating] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useDismiss<HTMLDivElement>(open, close);
  const join = useJoinCampaign();
  const { data: invitations = [] } = useInvitations();
  const accept = useAcceptInvitation();
  const toast = useToast();
  const navigate = useNavigate();

  const filtered = campaigns.filter((c) => !q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase()));

  const submitJoin = () => {
    if (!code.trim()) return;
    join.mutate(code.trim(), {
      onSuccess: (c) => {
        select(c.id);
        setCode('');
        setJoinOpen(false);
        setOpen(false);
        toast(`Bienvenue dans « ${c.name} »`, 'success');
      },
      onError: (e) => toast(errorMessage(e), 'error'),
    });
  };

  return (
    <div className={s.switcher} ref={ref}>
      <button type="button" className={cx(s.trigger, open && s.triggerOpen)} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className={s.dot} style={{ background: current ? campaignColor(current.id) : 'var(--muted)' }} />
        <span className={s.triggerText}>
          <span className={s.triggerLabel}>Campagne{current ? ` · ${current.role === 'gm' ? 'MJ' : 'Joueur'}` : ''}</span>
          <span className={s.triggerName}>{current?.name ?? 'Aucune campagne'}</span>
        </span>
        <span className={s.chevron} style={{ transform: open ? 'rotate(180deg)' : undefined }} aria-hidden>
          ▾
        </span>
        {invitations.length > 0 && <span className={s.badge}>{invitations.length}</span>}
      </button>
      {open && (
        <div className={s.menu}>
          {invitations.length > 0 && (
            <div className={s.invites}>
              <span className="ds-label">Invitations</span>
              {invitations.map((inv) => (
                <div key={inv.id} className={s.invite}>
                  <span className="ds-grow">
                    <strong>{inv.campaignName}</strong>
                    <span className="ds-help"> — par {inv.invitedBy}</span>
                  </span>
                  <Button
                    size="sm"
                    variant="heal"
                    onClick={() =>
                      accept.mutate(inv.id, {
                        onSuccess: (c) => {
                          select(c.id);
                          toast(`Vous rejoignez « ${c.name} »`, 'success');
                        },
                      })
                    }
                  >
                    Accepter
                  </Button>
                </div>
              ))}
            </div>
          )}
          {campaigns.length > 4 && <Input placeholder="Rechercher une campagne…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher une campagne" />}
          <div className={s.list} role="listbox" aria-label="Mes campagnes">
            {filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                role="option"
                aria-selected={c.id === current?.id}
                className={cx(s.option, c.id === current?.id && s.optionOn)}
                onClick={() => {
                  select(c.id);
                  setOpen(false);
                }}
              >
                <span className={s.dot} style={{ background: campaignColor(c.id) }} />
                <span className="ds-grow">
                  <span className={s.optName}>{c.name}</span>
                  <span className={s.optMeta}>
                    {c.status === 'finished' ? `Terminée · ${c.sessionCount} sessions` : `Session ${c.sessionCount} · ${c.playerCount} joueur${c.playerCount > 1 ? 's' : ''} · niv. ${c.level}`}
                  </span>
                </span>
                <span className={cx(s.roleTag, c.role === 'gm' && s.roleTagGm)}>{c.role === 'gm' ? 'MJ' : 'Joueur'}</span>
              </button>
            ))}
            {filtered.length === 0 && <p className="ds-help" style={{ margin: 8 }}>Aucune campagne. Fondez la vôtre ou rejoignez une table.</p>}
          </div>
          {joinOpen ? (
            <div className="ds-row">
              <Input className="ds-grow" placeholder="CODE" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === 'Enter' && submitJoin()} aria-label="Code d'invitation" autoFocus style={{ flex: 1, letterSpacing: '0.3em', fontFamily: 'var(--font-title)' }} />
              <Button size="sm" onClick={submitJoin} disabled={join.isPending}>
                Rejoindre
              </Button>
            </div>
          ) : null}
          <div className={s.menuActions}>
            <Button variant="ghost" size="sm" onClick={() => setJoinOpen(!joinOpen)}>
              Rejoindre avec un code
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setOpen(false);
                setCreating(true);
              }}
            >
              + Fonder une campagne
            </Button>
          </div>
          <Button variant="link" size="sm" onClick={() => { setOpen(false); navigate('/explorer?vue=campagnes'); }}>
            Découvrir les campagnes publiques →
          </Button>
        </div>
      )}
      <NewCampaignModal open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
