import { Link } from 'react-router-dom';
import { ProviderCredentialsCard } from '../components/integration/ProviderCredentialsCard.tsx';

/**
 * Les identifiants Amazon Partenaires et Domadoo — les deux sources d'affiliation que le
 * studio collecte lui-même, plutôt que rattachées à la main sur un revenu.
 *
 * Ancien emplacement : Paramètres → API, où elles cohabitaient avec des identifiants qui
 * n'ont rien à voir (Discord, le profil Instagram). Elles vivent désormais avec le domaine
 * qu'elles alimentent — juste à côté de l'écran `/affiliations` qui en affiche l'historique.
 *
 * Activer la source, la collecter et voir ce qu'elle publie reste dans Paramètres → API :
 * cette page ne parle que des identifiants.
 */
export const AffiliationSettingsPage = () => (
  <div className="space-y-4">
    <div>
      <h2 className="font-semibold">Affiliation</h2>
      <p className="max-w-2xl text-sm text-muted-foreground">
        Amazon Partenaires et Domadoo sont collectés automatiquement toutes les heures. Une fois les
        identifiants enregistrés, active la source et lance une première collecte depuis{' '}
        <Link to="/parametres?onglet=api" className="underline underline-offset-2">
          Paramètres → API
        </Link>
        . L'historique se lit ensuite dans{' '}
        <Link to="/affiliations" className="underline underline-offset-2">
          Affiliations
        </Link>
        .
      </p>
    </div>

    <div className="grid gap-4 xl:grid-cols-2">
      <ProviderCredentialsCard provider="amazon" />
      <ProviderCredentialsCard provider="domadoo" />
    </div>
  </div>
);
