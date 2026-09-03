import { useState } from 'react';
import { Archive, ArchiveRestore, ExternalLink, Link2, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  useDeletePlatform,
  usePlatforms,
  useUpdatePlatform,
} from '../../../application/affiliate/usecases/usePlatforms.ts';
import type { AffiliatePlatform } from '../../../domain/affiliate/entities/AffiliatePlatform.ts';
import { faviconOf, hostOf } from '../../../domain/legal/entities/Legal.ts';
import { useFilters } from '../../hooks/useFilters.tsx';
import { formatMoney } from '../../../shared/format.ts';
import { readableTextColor } from '../../../shared/contrast.ts';
import { Badge } from '../ui/badge.tsx';
import { Button } from '../ui/button.tsx';
import { Card } from '../ui/card.tsx';
import { EmptyState } from '../EmptyState.tsx';
import { PlatformDialog } from './PlatformDialog.tsx';
import { cn } from '../../../shared/cn.ts';

/**
 * Le logo d'une plateforme, avec ses deux replis — mêmes règles que les liens utiles de
 * l'écran Légal : l'image saisie, sinon le favicon du site (demandé au site lui-même,
 * jamais à un service tiers), sinon l'initiale sur la couleur.
 */
const PlatformLogo = ({ platform }: { platform: AffiliatePlatform }) => {
  const [failed, setFailed] = useState(false);
  const source = failed
    ? null
    : (platform.imageUrl ?? (platform.url ? faviconOf(platform.url) : null));

  if (source) {
    return (
      <img
        src={source}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className="h-10 w-10 shrink-0 rounded-lg border border-border bg-background object-contain p-1"
      />
    );
  }

  return (
    <span
      aria-hidden
      style={{ backgroundColor: platform.color, color: readableTextColor(platform.color) }}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-base font-semibold uppercase"
    >
      {platform.name.trim().charAt(0) || '?'}
    </span>
  );
};

/**
 * Les plateformes d'affiliation : où est gérée l'affiliation, et laquelle rapporte le plus.
 *
 * Le classement se fait sur les **gains de la période** et non sur le cumul de toujours :
 * une plateforme qui a bien marché il y a deux ans mais ne rapporte plus rien doit
 * descendre, c'est justement ce qu'on vient vérifier. Le cumul reste affiché en dessous,
 * parce qu'il dit autre chose — s'il vaut encore la peine de garder le compte ouvert.
 *
 * Les montants viennent des revenus **rattachés** (champ « Plateforme » du formulaire de
 * revenu) : une plateforme à 0 € n'a pas forcément rien rapporté, elle n'a peut-être
 * simplement aucun revenu rattaché. Le sous-titre le dit plutôt que de laisser conclure.
 */
export const PlatformsPanel = () => {
  const filters = useFilters();
  const { data: platforms = [], isLoading } = usePlatforms({
    includeArchived: true,
    from: filters.from,
    to: filters.to,
  });
  const update = useUpdatePlatform();
  const remove = useDeletePlatform();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AffiliatePlatform | null>(null);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  // Les mieux classées d'abord, sur la période. À égalité (souvent zéro), l'ordre manuel
  // puis le nom reprennent la main plutôt qu'un tri arbitraire.
  const sorted = [...platforms].sort((a, b) => {
    if (a.isArchived !== b.isArchived) return a.isArchived ? 1 : -1;
    if (b.earnedCents !== a.earnedCents) return b.earnedCents - a.earnedCents;
    return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
  });

  const periodTotal = platforms.reduce((sum, platform) => sum + platform.earnedCents, 0);
  const best = sorted.find((platform) => !platform.isArchived && platform.earnedCents > 0);

  if (!isLoading && platforms.length === 0) {
    return (
      <>
        <EmptyState
          title="Aucune plateforme d'affiliation"
          description="Note Amazon Partenaires, Awin, Effiliation… puis rattache tes revenus d'affiliation à leur plateforme : tu sauras laquelle te rapporte le plus."
          actionLabel="Ajouter une plateforme"
          onAction={openCreate}
        />
        <PlatformDialog open={dialogOpen} onOpenChange={setDialogOpen} platform={editing} />
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <span className="text-muted-foreground">Sur la période : </span>
          <span className="tabular font-semibold">{formatMoney(periodTotal)}</span>
          {best && (
            <span className="ml-3 text-xs text-muted-foreground">
              {best.name} en tête ({formatMoney(best.earnedCents)})
            </span>
          )}
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Nouvelle plateforme
        </Button>
      </div>

      <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        {sorted.map((platform) => (
          <Card
            key={platform.id}
            className={cn('flex flex-col gap-3 p-4', platform.isArchived && 'opacity-60')}
          >
            <div className="flex items-start gap-3">
              <PlatformLogo platform={platform} />

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 font-medium">
                    <span className="truncate">{platform.name}</span>
                    {platform.isArchived && (
                      <Badge variant="outline" className="ml-2">
                        Archivée
                      </Badge>
                    )}
                  </p>
                  <span className="shrink-0 text-right">
                    <span className="block tabular font-semibold text-[var(--positive)]">
                      {formatMoney(platform.earnedCents)}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      {platform.entriesCount} revenu(s) · {formatMoney(platform.totalEarnedCents)}{' '}
                      au total
                    </span>
                  </span>
                </div>

                {platform.description && (
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {platform.description}
                  </p>
                )}

                {platform.url && (
                  <a
                    href={platform.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground hover:underline"
                  >
                    {hostOf(platform.url)}
                    <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                )}
              </div>
            </div>

            {/* Les marques couvertes : c'est ce qui répond à « où est gérée
                l'affiliation de telle marque », l'autre moitié de la question. */}
            {platform.brands.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <Link2 className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
                {platform.brands.map((brand) => (
                  <span
                    key={brand.id}
                    className="rounded-full border border-transparent px-2 py-0.5 text-[11px] font-medium"
                    style={{ backgroundColor: `${brand.color}26` }}
                  >
                    {brand.name}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-auto flex justify-end gap-1 border-t border-border pt-2">
              <Button
                variant="ghost"
                size="icon"
                title={platform.isArchived ? 'Réactiver' : 'Archiver'}
                onClick={() =>
                  update.mutate({ id: platform.id, input: { isArchived: !platform.isArchived } })
                }
              >
                {platform.isArchived ? (
                  <ArchiveRestore className="h-3.5 w-3.5" />
                ) : (
                  <Archive className="h-3.5 w-3.5" />
                )}
                <span className="sr-only">{platform.isArchived ? 'Réactiver' : 'Archiver'}</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setEditing(platform);
                  setDialogOpen(true);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
                <span className="sr-only">Modifier</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  // Les revenus rattachés sont détachés, jamais supprimés : ils restent
                  // dans le chiffre d'affaires, sans plateforme.
                  if (
                    window.confirm(
                      `Supprimer « ${platform.name} » ? Ses ${platform.entriesCount} revenu(s) rattaché(s) seront conservés, mais perdront leur plateforme.`,
                    )
                  ) {
                    remove.mutate(platform.id);
                  }
                }}
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                <span className="sr-only">Supprimer</span>
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Les montants viennent des revenus rattachés à chaque plateforme, via le champ « Plateforme »
        du formulaire de revenu. Une plateforme à 0 € n'a pas forcément rien rapporté : elle n'a
        peut-être aucun revenu rattaché.
      </p>

      <PlatformDialog open={dialogOpen} onOpenChange={setDialogOpen} platform={editing} />
    </div>
  );
};
