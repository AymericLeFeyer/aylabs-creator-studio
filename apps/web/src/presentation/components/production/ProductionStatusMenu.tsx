import { Check, ChevronDown } from 'lucide-react';
import { useUpdateProduction } from '../../../application/production/usecases/useProductions.ts';
import type { Production } from '../../../domain/production/entities/Production.ts';
import {
  PRODUCTION_STATUSES,
  STATUS_COLORS,
  STATUS_HINTS,
  STATUS_LABELS,
} from '../../../domain/production/entities/Production.ts';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu.tsx';
import { cn } from '../../../shared/cn.ts';

/**
 * Le badge de statut d'une carte de file, **et le moyen d'en changer**.
 *
 * C'était un badge mort : on lisait « Idée » sur une vidéo qu'on venait de commencer, et
 * la corriger demandait d'ouvrir la fiche, de trouver le formulaire, de changer un
 * sélecteur et d'enregistrer — quatre gestes pour une information qu'on met à jour en
 * passant. Le statut est ce qui bouge le plus souvent sur une carte, et il se règle
 * maintenant là où on le lit.
 *
 * **« Terminée » y figure comme les autres**, mais elle ne rattache aucune sortie : c'est
 * `PublishDialog`, depuis la fiche, qui relie la vidéo collectée sur YouTube et coche
 * l'étape de publication. L'infobulle de l'entrée le dit — une vidéo peut légitimement
 * être terminée sans rattachement, et refuser le raccourci obligerait à passer par la
 * fiche pour une correction de statut qui n'a rien à voir avec une publication.
 *
 * Le déclencheur reprend **exactement** l'apparence du badge qu'il remplace : le chevron
 * est la seule chose ajoutée, et c'est lui qui dit que c'est cliquable.
 */
export const ProductionStatusMenu = ({
  production,
  className,
}: {
  production: Production;
  className?: string;
}) => {
  const update = useUpdateProduction();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={update.isPending}
          title="Changer l’état de cette vidéo"
          style={{ color: STATUS_COLORS[production.status] }}
          className={cn(
            'inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-0.5',
            'text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50',
            'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
            className,
          )}
        >
          {STATUS_LABELS[production.status]}
          <ChevronDown className="h-3 w-3 opacity-60" aria-hidden />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-72">
        {PRODUCTION_STATUSES.map((status) => (
          <DropdownMenuItem
            key={status}
            className="items-start gap-2"
            onSelect={() => {
              // Reposer le statut déjà en place déclencherait une écriture et un
              // rafraîchissement de tout le module pour rien.
              if (status !== production.status) {
                update.mutate({ id: production.id, input: { status } });
              }
            }}
          >
            <Check
              className={cn(
                'mt-0.5 h-3.5 w-3.5 shrink-0',
                status === production.status ? 'opacity-100' : 'opacity-0',
              )}
              aria-hidden
            />
            <span className="min-w-0">
              <span className="block font-medium" style={{ color: STATUS_COLORS[status] }}>
                {STATUS_LABELS[status]}
              </span>
              <span className="block text-xs whitespace-normal text-muted-foreground">
                {status === 'done'
                  ? 'Publiée. Depuis ici, la sortie YouTube n’est pas rattachée — ça se fait sur la fiche.'
                  : STATUS_HINTS[status]}
              </span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
