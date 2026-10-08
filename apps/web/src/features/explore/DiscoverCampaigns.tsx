import type { CampaignSummaryDto, DiscoverCampaignDto } from '@ds/shared';
import { useNavigate } from 'react-router';
import { errorMessage } from '../../shared/api/client';
import { Button, Empty, Loading, Panel } from '../../shared/ui/components';
import { useToast } from '../../shared/ui/toast';
import { useApplyCampaign, useDiscover } from '../campaigns/api';
import { useCurrentCampaign } from '../campaigns/CampaignContext';
import s from '../campaigns/campaigns.module.css';

type Card = Pick<DiscoverCampaignDto, 'id' | 'name' | 'synopsis' | 'coverUrl' | 'gmName' | 'playerCount' | 'level' | 'status'> & { recruiting: boolean; myRole: 'gm' | 'player' | null };

function badge(c: Card): { label: string; color: string } {
  if (c.status === 'finished') return { label: 'Terminée', color: 'var(--ash)' };
  if (c.recruiting) return { label: 'Recrute', color: 'var(--gold)' };
  return { label: 'En cours', color: 'var(--arcane-light)' };
}

function CampaignCard({ c, onOpen, onApply, applying }: { c: Card; onOpen(): void; onApply(): void; applying: boolean }) {
  const b = badge(c);
  return (
    <Panel pad={false} className={s.campCard}>
      <div className={s.campCover} style={c.coverUrl ? { backgroundImage: `url(${c.coverUrl})` } : undefined}>
        <span className={s.campBadge} style={{ color: b.color }}>
          {b.label}
        </span>
      </div>
      <div className={s.campBody}>
        <div className="ds-h3" style={{ color: 'var(--text-strong)' }}>
          {c.name}
        </div>
        <div style={{ fontSize: 14, color: 'var(--ash)', lineHeight: 1.45 }}>{c.synopsis || '—'}</div>
        <div className="ds-row" style={{ gap: 14, fontSize: 13, color: 'var(--text-soft)', marginTop: 'auto' }}>
          <span>MJ · {c.myRole === 'gm' ? 'Vous' : c.gmName}</span>
          <span>
            {c.playerCount} joueur{c.playerCount > 1 ? 's' : ''}
          </span>
          <span>Niv. {c.level}</span>
        </div>
        <div>
          {c.myRole ? (
            <Button variant="ghost" size="sm" onClick={onOpen}>
              {c.status === 'finished' ? 'Lire le récit' : 'Reprendre'}
            </Button>
          ) : c.recruiting ? (
            <Button variant="ghost" size="sm" onClick={onApply} disabled={applying}>
              Postuler
            </Button>
          ) : (
            <span className="ds-help">{c.status === 'finished' ? 'Récit réservé aux membres' : 'Table complète'}</span>
          )}
        </div>
      </div>
    </Panel>
  );
}

/** Explorer · Campagnes : mes tables et les campagnes publiques (maquette Explorer). */
export function DiscoverCampaigns() {
  const { campaigns, select } = useCurrentCampaign();
  const { data: publics = [], isLoading } = useDiscover();
  const apply = useApplyCampaign();
  const toast = useToast();
  const navigate = useNavigate();

  const open = (id: string) => {
    select(id);
    navigate('/explorer');
  };
  const mine: Card[] = campaigns.map((c: CampaignSummaryDto) => ({ ...c, recruiting: false, myRole: c.role }));
  const others = publics.filter((p) => !p.myRole);

  return (
    <div className="ds-stack" style={{ gap: 28 }}>
      <section className="ds-stack" style={{ gap: 14 }}>
        <h2 className="ds-h3">Mes campagnes</h2>
        {mine.length ? (
          <div className={s.cardGrid}>
            {mine.map((c) => (
              <CampaignCard key={c.id} c={c} onOpen={() => open(c.id)} onApply={() => undefined} applying={false} />
            ))}
          </div>
        ) : (
          <Panel>
            <Empty title="Votre grimoire de campagnes est vide.">Fondez votre propre campagne depuis le sélecteur, ou postulez à une table ci-dessous.</Empty>
          </Panel>
        )}
      </section>
      <section className="ds-stack" style={{ gap: 14 }}>
        <h2 className="ds-h3">Campagnes publiques</h2>
        {isLoading ? (
          <Loading />
        ) : others.length ? (
          <div className={s.cardGrid}>
            {others.map((c) => (
              <CampaignCard
                key={c.id}
                c={c}
                onOpen={() => open(c.id)}
                applying={apply.isPending}
                onApply={() =>
                  apply.mutate(c.id, {
                    onSuccess: (joined) => {
                      toast(`Bienvenue à la table « ${joined.name} »`, 'success');
                      open(joined.id);
                    },
                    onError: (e) => toast(errorMessage(e), 'error'),
                  })
                }
              />
            ))}
          </div>
        ) : (
          <Panel>
            <Empty title="Aucune autre table publique pour l’instant." />
          </Panel>
        )}
      </section>
    </div>
  );
}
