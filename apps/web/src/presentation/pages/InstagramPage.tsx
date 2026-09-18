import { Link } from 'react-router-dom';
import { Instagram, RefreshCw } from 'lucide-react';
import {
  useCollectInstagram,
  useInstagramOverview,
} from '../../application/instagram/usecases/useInstagram.ts';
import { useFilters } from '../hooks/useFilters.tsx';
import { formatCount, variation } from '../../domain/instagram/entities/Instagram.ts';
import { InstagramChart } from '../components/instagram/InstagramChart.tsx';
import { InstagramMediaTable } from '../components/instagram/InstagramMediaTable.tsx';
import { Button } from '../components/ui/button.tsx';
import { Card } from '../components/ui/card.tsx';
import { StatCard } from '../components/StatCard.tsx';
import { cn } from '../../shared/cn.ts';
import { usePrivacy } from '../hooks/usePrivacy.tsx';
import { MASKED_TEXT } from '../../domain/privacy/entities/Privacy.ts';

/**
 * Instagram : **uniquement ce que le profil public laisse voir** — abonnés, publications,
 * et les j'aime, commentaires et vues de chaque publication.
 *
 * La connexion par l'API Graph (stories, portée, interactions) est retirée de l'écran tant
 * qu'elle ne fonctionne pas : des cartes qui restent à zéro se liraient comme un compte
 * inactif. Le code de collecte est toujours là, côté API, pour le jour où elle revient.
 *
 * Aucune donnée de préparation ici : les brouillons de publication vivent dans
 * Production → Publications. Cet écran ne montre que ce qui est réellement paru.
 *
 * La période vient de la barre de filtres commune : Instagram est une source de plus, pas
 * un outil à part, et changer de période ne doit pas se faire à deux endroits.
 */
export const InstagramPage = () => {
  const filters = useFilters();
  const privacy = usePrivacy();

  const { data, isLoading } = useInstagramOverview({
    from: filters.from,
    to: filters.to,
    granularity: filters.effectiveGranularity,
  });
  const collect = useCollectInstagram();

  const accounts = data?.accounts ?? [];
  const totals = data?.totals;
  const previous = data?.previousTotals ?? null;
  const media = data?.media ?? [];

  // Le nombre de publications affiché sur le profil, hors période : c'est lui qu'on
  // connaît même quand aucune publication n'a encore pu être datée.
  const profilePosts = accounts.reduce<number | null>((sum, account) => {
    const count = account.latestSnapshot?.mediaCount;
    return count == null ? sum : (sum ?? 0) + count;
  }, null);

  const sumOf = (pick: (item: (typeof media)[number]) => number | null): number | null =>
    media.reduce<number | null>((sum, item) => {
      const value = pick(item);
      return value === null ? sum : (sum ?? 0) + value;
    }, null);
  const likes = sumOf((item) => item.likes);
  const comments = sumOf((item) => item.comments);
  const average = (total: number | null) =>
    total === null || media.length === 0 ? null : Math.round(total / media.length);

  const views = (value: number | null) =>
    privacy.isMasked('views') ? MASKED_TEXT : formatCount(value);

  if (!isLoading && accounts.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="hidden text-lg font-semibold lg:block">Instagram</h1>
        <Card className="space-y-3 p-6 text-center">
          <Instagram className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">Aucun profil Instagram suivi</p>
          <p className="mx-auto max-w-lg text-sm text-muted-foreground">
            Renseigne ton nom d’utilisateur : abonnés et publications sont relevés chaque jour sur
            ton profil public, sans compte Meta.
          </p>
          <Button asChild size="sm">
            <Link to="/parametres?onglet=api">Suivre le profil public</Link>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="hidden lg:block">
          <h1 className="text-lg font-semibold">Instagram</h1>
          <p className="text-sm text-muted-foreground">
            {accounts.map((account) => `@${account.username}`).join(', ') || 'Aucun compte'}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={collect.isPending}
          onClick={() => collect.mutate(undefined)}
          title="Relire le profil public maintenant"
        >
          <RefreshCw className={cn('h-4 w-4', collect.isPending && 'animate-spin')} />
          {collect.isPending ? 'Collecte…' : 'Collecter'}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Abonnés"
          value={
            privacy.isMasked('subscribers') ? MASKED_TEXT : formatCount(totals?.followers ?? null)
          }
          hint={
            privacy.isMasked('subscribers')
              ? 'Gain masqué'
              : totals?.followersGained == null
                ? 'Pas encore de point de comparaison'
                : `${totals.followersGained >= 0 ? '+' : ''}${totals.followersGained} sur la période`
          }
        />
        <StatCard
          label="Publications"
          value={formatCount(totals?.posts ?? null)}
          hint={
            profilePosts === null
              ? 'Posts, carrousels et reels parus sur la période'
              : `Parues sur la période · ${formatCount(profilePosts)} sur le profil`
          }
          change={variation(totals?.posts ?? null, previous?.posts ?? null)}
        />
        <StatCard
          label="J’aime"
          value={views(likes)}
          hint={
            media.length === 0
              ? 'Sur les publications de la période'
              : `${views(average(likes))} en moyenne par publication`
          }
        />
        <StatCard
          label="Commentaires"
          value={views(comments)}
          hint={
            media.length === 0
              ? 'Sur les publications de la période'
              : `${views(average(comments))} en moyenne par publication`
          }
        />
      </div>

      <Card className="p-4">
        <InstagramChart series={data?.series ?? []} granularity={filters.effectiveGranularity} />
      </Card>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Publications ({media.length})</h2>
        <InstagramMediaTable media={media} />
      </div>
    </div>
  );
};
