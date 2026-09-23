import { Link } from 'react-router-dom';
import { AlertTriangle, Instagram, RefreshCw } from 'lucide-react';
import {
  useCollectInstagram,
  useInstagramOverview,
} from '../../application/instagram/usecases/useInstagram.ts';
import { useFilters } from '../hooks/useFilters.tsx';
import { formatCount, tokenWarning } from '../../domain/instagram/entities/Instagram.ts';
import { InstagramChart } from '../components/instagram/InstagramChart.tsx';
import { InstagramLinkedCharts } from '../components/instagram/InstagramLinkedCharts.tsx';
import { PostsCalendar } from '../components/instagram/PostsCalendar.tsx';
import { Button } from '../components/ui/button.tsx';
import { Card } from '../components/ui/card.tsx';
import { StatCard } from '../components/StatCard.tsx';
import { cn } from '../../shared/cn.ts';
import { usePrivacy } from '../hooks/usePrivacy.tsx';
import { MASKED_TEXT } from '../../domain/privacy/entities/Privacy.ts';

/**
 * Instagram, connecté par l'**API Graph** (Meta for Developers) : abonnés, stories,
 * portée, interactions et publications des comptes Business/Creator connectés.
 *
 * Deux étages, de haut en bas :
 *
 * 1. les chiffres clés, sur une ligne ;
 * 2. **tous les graphiques ensemble, en onglets** (activité, abonnés, gain par jour), puis
 *    le calendrier des publications.
 *
 * **Aucune saisie manuelle de stories** : une story vit 24 h dans l'API, la collecte
 * horaire tourne toutes les heures (`Config.collectCron`), elle la voit donc forcément au
 * moins une fois tant que le serveur ne s'arrête pas une journée entière — `upsertStory`
 * dédoublonne par `ig_media_id`, donc chaque story n'est comptée qu'une fois quel que soit
 * le nombre de passages qui l'ont vue.
 *
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
    accountIds: filters.instagramAccountIds,
  });
  const collect = useCollectInstagram();

  const accounts = data?.accounts ?? [];
  const totals = data?.totals;
  const series = data?.series ?? [];
  const expiringAccounts = accounts.filter((account) => tokenWarning(account) !== null);

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
          <p className="text-sm font-medium">Aucun compte Instagram connecté</p>
          <p className="mx-auto max-w-lg text-sm text-muted-foreground">
            Connecte un compte Business ou Creator par l’API Graph (Meta for Developers) : abonnés,
            stories, portée et publications sont relevés chaque heure.
          </p>
          <Button asChild size="sm">
            <Link to="/parametres?onglet=instagram">Connecter un compte</Link>
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
          title="Relancer la collecte maintenant"
        >
          <RefreshCw className={cn('h-4 w-4', collect.isPending && 'animate-spin')} />
          {collect.isPending ? 'Collecte…' : 'Collecter'}
        </Button>
      </div>

      {expiringAccounts.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-[var(--negative)]/40 bg-[var(--negative)]/10 px-3 py-2 text-sm text-[var(--negative)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            {expiringAccounts
              .map((account) =>
                account.tokenDaysLeft !== null && account.tokenDaysLeft < 0
                  ? `Le jeton de @${account.username} a expiré`
                  : `Le jeton de @${account.username} expire dans ${account.tokenDaysLeft} jour(s)`,
              )
              .join(' · ')}
            . La collecte s’arrêtera sans un nouveau jeton —{' '}
            <Link to="/parametres?onglet=instagram" className="underline underline-offset-2">
              rafraîchis-le dans Paramètres → Instagram
            </Link>
            .
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <StatCard
          label="Stories"
          value={formatCount(totals?.stories ?? null)}
          hint={
            totals
              ? `${totals.storiesPerDay} par jour · ${totals.activeDays} jour(s) avec au moins une`
              : 'Archivées à la collecte horaire'
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
          label="Portée"
          value={formatCount(totals?.reach ?? null)}
          hint="comptes touchés sur la période"
        />
        <StatCard
          label="Interactions"
          value={formatCount(totals?.totalInteractions ?? null)}
          hint="j’aime, commentaires, partages, enregistrements"
        />
      </div>

      {data && <InstagramLinkedCharts data={data} />}

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
