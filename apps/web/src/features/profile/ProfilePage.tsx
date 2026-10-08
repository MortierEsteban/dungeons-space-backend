import { useEffect, useState } from 'react';
import { errorMessage } from '../../shared/api/client';
import { Button, Field, Input, Loading, Panel, Segmented } from '../../shared/ui/components';
import { useToast } from '../../shared/ui/toast';
import { useMe, useUpdateProfile } from '../auth/api';

/** Profil et préférences (FND-05) : nom, langue, style d'accueil. */
export default function ProfilePage() {
  const { data: me } = useMe();
  const update = useUpdateProfile();
  const toast = useToast();
  const [name, setName] = useState('');
  useEffect(() => setName(me?.displayName ?? ''), [me]);
  if (!me) return <Loading />;
  const onError = (e: unknown) => toast(errorMessage(e), 'error');

  return (
    <div className="ds-page" style={{ maxWidth: 760 }}>
      <div>
        <div className="ds-label">Profil</div>
        <h1 className="ds-h1">{me.displayName}</h1>
        <p className="ds-help">{me.email}</p>
      </div>
      <Panel className="ds-stack" style={{ gap: 18 }}>
        <Field label="Nom d'aventurier" htmlFor="p-name">
          <div className="ds-row">
            <Input id="p-name" style={{ flex: 1 }} value={name} onChange={(e) => setName(e.target.value)} />
            <Button disabled={name.trim() === me.displayName || name.trim().length < 2} onClick={() => update.mutate({ displayName: name.trim() }, { onSuccess: () => toast('Nom mis à jour.', 'success'), onError })}>
              Enregistrer
            </Button>
          </div>
        </Field>
        <div className="ds-stack" style={{ gap: 8 }}>
          <span className="ds-label">Langue de l’interface</span>
          <Segmented label="Langue" value={me.locale} onChange={(locale) => update.mutate({ locale }, { onError })} options={[{ value: 'fr', label: 'Français' }, { value: 'en', label: 'English' }]} />
          <span className="ds-help">Le contenu de règles (SRD) reste en français ; la navigation suit la langue choisie.</span>
        </div>
        <div className="ds-stack" style={{ gap: 8 }}>
          <span className="ds-label">Accueil sur grand écran</span>
          <Segmented label="Style d'accueil" value={me.homeStyle} onChange={(homeStyle) => update.mutate({ homeStyle }, { onError })} options={[{ value: 'immersive', label: 'Immersif' }, { value: 'classic', label: 'Classique' }]} />
        </div>
      </Panel>
    </div>
  );
}
