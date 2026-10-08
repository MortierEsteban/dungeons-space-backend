import { Panel, Rule, Rune } from '../../shared/ui/components';
import { useRulesets } from '../sanctuary/api';

/** Crédits & licences : attribution exigée par la licence CC-BY-4.0 du SRD (CNT-02). */
export default function CreditsPage() {
  const { data: rulesets = [] } = useRulesets();
  return (
    <div className="ds-page" style={{ maxWidth: 860 }}>
      <div className="ds-stack" style={{ alignItems: 'center', textAlign: 'center', gap: 10 }}>
        <Rune size={20} />
        <h1 className="ds-display" style={{ fontSize: 'clamp(34px, 6vw, 56px)', margin: '10px 0 0' }}>
          DungeonSpace
        </h1>
        <div className="ds-label" style={{ letterSpacing: '0.42em' }}>
          Explore · Battle · Create
        </div>
        <p style={{ maxWidth: 620, color: 'var(--text-soft)' }}>
          La mémoire et le champ de bataille de vos campagnes : une Chronique où tout est événement, des combats rejouables, et la Constellation des
          relations qui lient vos personnages.
        </p>
      </div>
      <Rule />
      <Panel className="ds-stack" style={{ gap: 14 }}>
        <h2 className="ds-h2">Contenu de jeu & licences</h2>
        {rulesets.map((r) => (
          <div key={r.id} className="ds-stack" style={{ gap: 6 }}>
            <strong style={{ fontFamily: 'var(--font-title)', fontWeight: 500, color: 'var(--gold-light)' }}>
              {r.name} — version {r.version} · {r.license}
            </strong>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--text-soft)' }}>{r.attribution}</p>
          </div>
        ))}
        <p className="ds-help">
          Les noms français, résumés de sorts, d’objets et de créatures sont des rédactions originales fondées sur les mécaniques du SRD 5.1. Le contenu
          que vous créez dans la Forge reste le vôtre et n’est jamais mélangé au contenu officiel.
        </p>
      </Panel>
      <Panel className="ds-stack" style={{ gap: 8 }}>
        <h2 className="ds-h2">Typographies & illustrations</h2>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--text-soft)' }}>Cinzel, Cinzel Decorative et Spectral sont distribuées sous licence SIL Open Font License 1.1.</p>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--text-soft)' }}>Illustrations et pictogrammes : charte graphique DungeonSpace v1.0.</p>
      </Panel>
    </div>
  );
}
