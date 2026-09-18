import { Link } from 'react-router-dom';
import { Instagram, RefreshCw } from 'lucide-react';
import {
  useCollectInstagram,
  useInstagramOverview,
} from '../../application/instagram/usecases/useInstagram.ts';
import { useFilters } from '../hooks/useFilters.tsx';
import { formatCount } from '../../domain/instagram/entities/Instagram.ts';
import { InstagramChart } from '../components/instagram/InstagramChart.tsx';
import { PostsCalendar } from '../components/instagram/PostsCalendar.tsx';
import { StoryCounter } from '../components/instagram/StoryCounter.tsx';
import { Button } from '../components/ui/button.tsx';
import { Card } from '../components/ui/card.tsx';
import { StatCard } from '../components/StatCard.tsx';
import { cn } from '../../shared/cn.ts';
import { usePrivacy } from '../hooks/usePrivacy.tsx';
import { MASKED_TEXT } from '../../domain/privacy/entities/Privacy.ts';

/**
 * Instagram : le profil public (abonnés, publications) et les stories **déclarées à la
 * main**, le profil public ne les exposant pas.
 *
 * Trois étages, de haut en bas :
 *
 * 1. la saisie des stories et les chiffres clés, **sur la même ligne** — on déclare sa
 *    story du jour là où on lit le compteur qu'elle fait bouger ;
 * 2. **tous les graphiques ensemble, en onglets** (activité, abonnés, gain par jour) ;
 * 3. le calendrier des publications.
 *
 * La connexion par l'API Graph (stories collectées, portée, interactions) est retirée de
 * l'écran tant qu'elle ne fonctionne pas. Le code de collecte est toujours là, côté API.
 * Les brouillons de publication vivent dans Production → Publications : cet écran ne
 * montre que ce qui est réellement paru.
 *
 * La période vient de la barre de filtres commune ; la maille, elle, est **toujours le
 * jour** — le calendrier compte une case par jour, et le gain d'abonnés se lit jour par jour.
 */
export const InstagramPage = () => {
  const filters = useFilters();
  const privacy = usePrivacy();

  const { data, isLoading } = useInstagramOverview({
    from: filters.from,
    to: filters.to,
    granularity: 'day',
  });
  const collect = useCollectInstagram();

  const accounts = data?.accounts ?? [];
  const totals = data?.totals;
  const series = data?.series ?? [];

  // Le nombre de publications affiché sur le profil, hors période : c'est lui qu'on
  // connaît toujours, même quand aucune publication n'a pu être datée.
  const profilePosts = accounts.reduce<number | null>((sum, account) => {
    const count = account.latestSnapshot?.mediaCount;
    return count == null ? sum : (sum ?? 0) + count;
  }, null);

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

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[22rem_repeat(3,minmax(0,1fr))]">
        <StoryCounter />
        <StatCard
          label="Stories"
          value={formatCount(totals?.stories ?? null)}
          hint={
            totals
              ? `${totals.storiesPerDay} par jour · ${totals.activeDays} jour(s) avec au moins une`
              : 'Déclarées à la main'
          }
        />
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
        {/* Le total du profil en grand : c'est le chiffre qu'on connaît toujours. Le nombre
            de parutions de la période ne se compte qu'à partir des publications datées. */}
        <StatCard
          label="Publications"
          value={formatCount(profilePosts ?? totals?.posts ?? null)}
          hint={`${formatCount(totals?.posts ?? 0)} parue(s) sur la période`}
        />
      </div>

      <Card className="p-4">
        <InstagramChart series={series} />
      </Card>

      <Card className="space-y-2 p-4">
        <h2 className="text-sm font-semibold">Publications</h2>
        <PostsCalendar
          series={series}
          media={data?.media ?? []}
          from={filters.from}
          to={filters.to}
        />
      </Card>
    </div>
  );
};
