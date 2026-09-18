import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Instagram, Plus, RefreshCw } from 'lucide-react';
import {
  useAddInstagramPost,
  useCollectInstagram,
  useInstagramOverview,
} from '../../application/instagram/usecases/useInstagram.ts';
import { useFilters } from '../hooks/useFilters.tsx';
import { formatCount } from '../../domain/instagram/entities/Instagram.ts';
import { Input } from '../components/ui/input.tsx';
import { InstagramChart } from '../components/instagram/InstagramChart.tsx';
import { PostsCalendar } from '../components/instagram/PostsCalendar.tsx';
import { ActivityChart } from '../components/instagram/ActivityChart.tsx';
import { StoryCounter } from '../components/instagram/StoryCounter.tsx';
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
    // Toujours au jour, quelle que soit la maille de la barre de filtres : le calendrier
    // compte une case par jour, et le gain d'abonnés se lit jour par jour.
    granularity: 'day',
  });
  const collect = useCollectInstagram();
  const addPost = useAddInstagramPost();
  const [postUrl, setPostUrl] = useState('');

  const accounts = data?.accounts ?? [];
  const totals = data?.totals;
  const media = data?.media ?? [];
  const reading = data?.publicReading ?? null;
  // La voie `page` ne liste aucune publication : sans ce bandeau, un tableau vide et des
  // j'aime à « — » se liraient comme une panne de collecte.
  const listBlocked = reading?.source === 'page';

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

      {/* En tête, avant les chiffres : la saisie des stories (un clic après chaque story) et
          l'activité du jour par jour — ce qu'on fait, et ce que ça rapporte en abonnés. */}
      <div className="grid gap-3 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <StoryCounter />
        <Card className="min-w-0 space-y-2 p-4">
          <h2 className="text-sm font-semibold">Activité par jour</h2>
          <ActivityChart series={data?.series ?? []} />
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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

      <Card className="space-y-2 p-4">
        <h2 className="text-sm font-semibold">Publications</h2>
        <PostsCalendar
          series={data?.series ?? []}
          media={media}
          from={filters.from}
          to={filters.to}
        />
      </Card>

      {/* Deux graphiques côte à côte plutôt qu'un seul à deux axes : un total de quelques
          centaines et un gain de quelques unités n'ont pas la même échelle. */}
      <div className="grid gap-3 xl:grid-cols-2">
        <Card className="space-y-2 p-4">
          <h2 className="text-sm font-semibold">Abonnés</h2>
          <InstagramChart series={data?.series ?? []} kind="followers" />
        </Card>
        <Card className="space-y-2 p-4">
          <h2 className="text-sm font-semibold">Gain d’abonnés par jour</h2>
          <InstagramChart series={data?.series ?? []} kind="gained" />
        </Card>
      </div>

      {listBlocked && (
        <Card className="flex items-start gap-3 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">
            Instagram refuse au serveur la liste des publications (lecture limitée par adresse IP) :
            seuls les abonnés et le nombre de publications sont relevés. Colle ci-dessous le lien
            d’une publication pour la suivre — ses j’aime et commentaires seront relus à chaque
            relevé
            {reading.postsRefreshed > 0 && ` (${reading.postsRefreshed} relue(s) au dernier)`}. Une
            clé SearchAPI dans{' '}
            <Link to="/parametres?onglet=api" className="underline underline-offset-2">
              Paramètres → API
            </Link>{' '}
            rend la liste automatique.
          </p>
        </Card>
      )}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Publications ({media.length})</h2>
          <form
            className="flex w-full gap-2 sm:w-auto"
            onSubmit={(event) => {
              event.preventDefault();
              const url = postUrl.trim();
              if (!url) return;
              addPost.mutate(url, { onSuccess: () => setPostUrl('') });
            }}
          >
            <Input
              value={postUrl}
              onChange={(event) => setPostUrl(event.target.value)}
              placeholder="Lien d’une publication"
              className="h-8 sm:w-72"
              aria-label="Lien d’une publication Instagram à suivre"
            />
            <Button
              type="submit"
              size="sm"
              variant="outline"
              disabled={addPost.isPending || !postUrl.trim()}
            >
              <Plus className="h-4 w-4" />
              {addPost.isPending ? 'Lecture…' : 'Suivre'}
            </Button>
          </form>
        </div>
        {addPost.error && <p className="text-sm text-destructive">{addPost.error.message}</p>}
        <InstagramMediaTable media={media} />
      </div>
    </div>
  );
};
