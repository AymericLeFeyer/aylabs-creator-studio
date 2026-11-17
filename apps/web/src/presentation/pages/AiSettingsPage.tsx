import { useAiSettings } from '../../application/ai/usecases/useAi.ts';
import { ProviderCard } from '../components/ai/ProviderCard.tsx';
import { TaskRouting } from '../components/ai/TaskRouting.tsx';

/**
 * Paramètres → API → Assistant IA : tout ce qui touche aux IA du studio, au même endroit.
 * Les fournisseurs (clé, modèle, crédits, images), puis qui fait quoi.
 */
export const AiSettingsPage = () => {
  const { data } = useAiSettings();
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Assistant IA</h2>
        <p className="text-sm text-muted-foreground">
          Utilisé par la boîte mail (résumés, traductions, brouillons, vérification des dates), par
          les fiches de vidéo (script, titres, tags, description) et, côté OpenAI, par les
          miniatures. Le contenu concerné est transmis au fournisseur lors de la demande. L’envoi
          d’un mail demande toujours ta confirmation.
        </p>
      </div>
      {data ? (
        <>
          <div className="grid items-start gap-4 lg:grid-cols-2">
            {data.providers.map((provider) => (
              <ProviderCard
                key={provider.provider}
                view={provider}
                secretsKeyConfigured={data.secretsKeyConfigured}
                isDefault={provider.provider === data.defaultProvider}
              />
            ))}
          </div>
          <TaskRouting view={data} />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      )}
    </div>
  );
};
