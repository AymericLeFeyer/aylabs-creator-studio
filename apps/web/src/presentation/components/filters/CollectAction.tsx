import { RefreshCw } from 'lucide-react';
import { useCollectAll } from '../../../application/analytics/usecases/useAnalytics.ts';
import { Button } from '../ui/button.tsx';
import { cn } from '../../../shared/cn.ts';

/**
 * Le déclenchement d'une collecte, et son compte-rendu.
 *
 * Extrait de `FiltersBar` parce qu'il vit désormais à **deux endroits** : dans la barre
 * de filtres sur grand écran, et dans la barre d'application sur mobile, où il est
 * l'action de droite — la place d'une action dans une barre de titre, et la seule qui
 * reste à portée de pouce quand le reste des filtres est replié dans une modale.
 *
 * Les deux exemplaires sont montés en même temps et masqués en CSS ; chacun porte donc sa
 * propre mutation. C'est sans conséquence : un seul est visible, donc un seul est
 * cliquable, et le compte-rendu s'affiche là où on a cliqué.
 */
export const CollectAction = ({ compact = false }: { compact?: boolean }) => {
  const collectAll = useCollectAll();

  /**
   * Un message n'est jamais une bonne nouvelle ici : c'est soit une erreur, soit un volet
   * de la collecte qui n'a pas abouti. Le gris le faisait passer pour un compte-rendu de
   * routine qu'on cesse de lire.
   */
  const failed =
    collectAll.data?.results.some(
      (result) => result.status === 'error' || result.revenueAvailable === false,
    ) ?? false;

  const report = collectAll.data?.results
    .map((result) => `${result.channelName} : ${result.message ?? 'ok'}`)
    .join('\n');

  if (compact) {
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={() => collectAll.mutate()}
        disabled={collectAll.isPending}
        // Sur mobile le compte-rendu n'a pas de place : il passe en infobulle, et
        // l'icône vire au rouge pour qu'un échec ne soit pas silencieux.
        title={report ?? 'Collecter'}
        aria-label="Collecter"
        className={cn(failed && !collectAll.isPending && 'text-[var(--negative)]')}
      >
        <RefreshCw className={cn('h-4 w-4', collectAll.isPending && 'animate-spin')} />
      </Button>
    );
  }

  return (
    <div className="flex min-w-0 flex-col items-end gap-1">
      <Button
        variant="outline"
        size="sm"
        onClick={() => collectAll.mutate()}
        disabled={collectAll.isPending}
      >
        <RefreshCw className={cn('h-4 w-4', collectAll.isPending && 'animate-spin')} />
        Collecter
      </Button>

      {collectAll.data && (
        <p
          className={cn(
            'max-w-full truncate text-xs',
            failed ? 'text-[var(--negative)]' : 'text-muted-foreground',
          )}
          title={report}
        >
          {collectAll.data.results
            .map(
              (result) =>
                `${result.channelName} : ${result.message ?? `${result.daysUpserted ?? 0} jour(s)`}`,
            )
            .join(' · ')}
        </p>
      )}
    </div>
  );
};
