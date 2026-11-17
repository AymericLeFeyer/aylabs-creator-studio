import { useAiSettings } from '../../application/ai/usecases/useAi.ts';
import { ProviderCard } from '../components/ai/ProviderCard.tsx';
import { TaskRouting } from '../components/ai/TaskRouting.tsx';

/**
 * Paramètres → API → Assistant IA : tout ce qui touche aux IA du studio, au même endroit.
 * Les fournisseurs (activation, clé, modèle, crédits, images), puis qui fait quoi.
 */
export const AiSettingsPage = () => {
  const { data } = useAiSettings();
  return (
    <div className="space-y-5">
      <div className="max-w-3xl">
        <h2 className="text-lg font-semibold">Assistant IA</h2>
        <p className="text-sm text-muted-foreground">
          Sert à la boîte mail, aux fiches de vidéo et aux miniatures. Le contenu concerné n’est
          transmis au fournisseur qu’à la demande, et l’envoi d’un mail demande toujours ta
          confirmation. Désactive un fournisseur que tu n’utilises pas : il disparaît des choix.
        </p>
      </div>
      {data ? (
        <>
          <div className="grid items-start gap-4 xl:grid-cols-2">
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
