import { Link } from 'react-router-dom';
import { useIntegrations } from '../../application/integration/usecases/useIntegrations.ts';
import { ProviderCredentialsCard } from '../components/integration/ProviderCredentialsCard.tsx';

/**
 * L'invitation Discord à suivre.
 *
 * Ancien emplacement : Paramètres → API. Une fois le code renseigné et la source activée
 * (Paramètres → API), le tableau de bord dédié apparaît dans le menu — il ne montre rien
 * tant que rien n'est configuré, une pastille vide se lisant comme une panne.
 */
export const DiscordSettingsPage = () => {
  const { data } = useIntegrations();
  const discord = data?.providers.find((provider) => provider.id === 'discord');

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold">Discord</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Nombre de membres et de membres en ligne, lus depuis une invitation — sans bot ni jeton.
          Active la source et collecte-la depuis{' '}
          <Link to="/parametres?onglet=api" className="underline underline-offset-2">
            Paramètres → API
          </Link>
          .
        </p>
      </div>

      <ProviderCredentialsCard provider="discord" />

      {discord?.configured && (
        <p className="text-sm text-muted-foreground">
          Le serveur est configuré : son tableau de bord est visible dans le menu, sous{' '}
          <Link to="/discord" className="underline underline-offset-2">
            Audience → Discord
          </Link>
          .
        </p>
      )}
    </div>
  );
};
