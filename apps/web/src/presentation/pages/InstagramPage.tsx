import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Instagram, KeyRound, RefreshCw, Settings } from 'lucide-react';
import {
  useCollectInstagram,
  useInstagramOverview,
} from '../../application/instagram/usecases/useInstagram.ts';
import { useFilters } from '../hooks/useFilters.tsx';
import { formatCount, tokenWarning, variation } from '../../domain/instagram/entities/Instagram.ts';
import { InstagramChart } from '../components/instagram/InstagramChart.tsx';
import { StoriesCalendar } from '../components/instagram/StoriesCalendar.tsx';
import { InstagramMediaTable } from '../components/instagram/InstagramMediaTable.tsx';
import { Button } from '../components/ui/button.tsx';
import { Card } from '../components/ui/card.tsx';
import { StatCard } from '../components/StatCard.tsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs.tsx';
import { cn } from '../../shared/cn.ts';

/**
 * Instagram : le rythme de publication, et ce que ça rapporte en audience.
 *
 * Le chiffre de tête est le **nombre de stories**, parce que c'est celui qu'on ne trouve
 * nulle part ailleurs — ni dans l'app, ni dans aucun export. Instagram n'expose ses
 * stories que pendant 24 heures ; ce comptage n'existe que parce qu'on l'archive à chaque
 * collecte, et l'écran le dit franchement au lieu de laisser lire un mois vide comme un
 * mois sans activité.
 *
 * La période vient de la barre de filtres commune : Instagram est une source de plus, pas
 * un outil à part, et changer de période ne doit pas se faire à deux endroits.
 */
export const InstagramPage = () => {
  const filters = useFilters();
  const [tab, setTab] = useState<'stories' | 'publications'>('stories');

  const { data, isLoading } = useInstagramOverview({
    from: filters.from,
    to: filters.to,
    granularity: filters.effectiveGranularity,
  });
  const collect = useCollectInstagram();

  const accounts = data?.accounts ?? [];
  const totals = data?.totals;
  const previous = data?.previousTotals ?? null;

  // L'aveu que l'écran doit faire : avant la première collecte, un zéro ne veut pas dire
  // « rien publié ». Aucun rattrapage n'est possible, jamais.
  const truncated = data?.firstStoryDate != null && data.firstStoryDate > filters.from;

  const expiring = accounts.filter((account) => tokenWarning(account) !== null);

  if (!isLoading && accounts.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold">Instagram</h1>
        <Card className="space-y-3 p-6 text-center">
          <Instagram className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">Aucun compte Instagram connecté</p>
          <p className="mx-auto max-w-lg text-sm text-muted-foreground">
            Le suivi des stories ne peut pas être reconstitué après coup : Instagram ne les expose
            que pendant 24 heures. Chaque jour sans collecte est perdu — plus tôt le compte est
            connecté, plus l’historique sera complet.
          </p>
          <Button asChild size="sm">
            <Link to="/parametres?onglet=instagram">
              <Settings className="h-4 w-4" />
              Connecter un compte
            </Link>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
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
          title="Attraper les stories des dernières 24 h et rafraîchir les chiffres"
        >
          <RefreshCw className={cn('h-4 w-4', collect.isPending && 'animate-spin')} />
          {collect.isPending ? 'Collecte…' : 'Collecter'}
        </Button>
      </div>

      {/* Un jeton expiré arrête la collecte, donc fait perdre des stories définitivement.
          L'alerte passe avant les chiffres. */}
      {expiring.length > 0 && (
        <Card className="flex flex-wrap items-center gap-3 border-[var(--negative)]/40 p-3">
          <KeyRound className="h-4 w-4 shrink-0 text-[var(--negative)]" />
          <p className="min-w-0 flex-1 text-sm">
            {expiring
              .map((account) =>
                tokenWarning(account) === 'expired'
                  ? `Le jeton de @${account.username} a expiré`
                  : `Le jeton de @${account.username} expire dans ${account.tokenDaysLeft} jour(s)`,
              )
              .join(' · ')}
            . Sans jeton valable, la collecte s’arrête et les stories de ces jours-là seront perdues
            pour toujours.
          </p>
          <Button variant="outline" size="sm" asChild>
            <Link to="/parametres?onglet=instagram">Régler</Link>
          </Button>
        </Card>
      )}

      {truncated && (
        <Card className="flex items-center gap-3 p-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">
            Le suivi des stories commence le {data!.firstStoryDate}. Avant cette date, le compteur
            est à zéro parce que rien n’était collecté — l’API Instagram ne permet aucun rattrapage.
          </p>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <StatCard
          label="Stories"
          value={formatCount(totals?.stories ?? null)}
          hint={`${totals?.activeDays ?? 0} jour(s) avec au moins une story`}
          change={variation(totals?.stories ?? null, previous?.stories ?? null)}
        />
        <StatCard
          label="Stories / jour"
          value={totals ? String(totals.storiesPerDay) : '—'}
          hint={`Moyenne sur les ${totals?.days ?? 0} jours de la période`}
        />
        <StatCard
          label="Stories / semaine"
          value={totals ? String(totals.storiesPerWeek) : '—'}
          hint="Le même rythme, à la maille où on le pilote"
        />
        <StatCard
          label="Publications"
          value={formatCount(totals?.posts ?? null)}
          hint="Posts, carrousels et reels parus"
          change={variation(totals?.posts ?? null, previous?.posts ?? null)}
        />
        <StatCard
          label="Comptes touchés"
          value={formatCount(totals?.reach ?? null)}
          hint="Comptes uniques ayant vu du contenu"
          change={variation(totals?.reach ?? null, previous?.reach ?? null)}
        />
        <StatCard
          label="Abonnés"
          value={formatCount(totals?.followers ?? null)}
          hint={
            totals?.followersGained == null
              ? 'Pas encore de point de comparaison'
              : `${totals.followersGained >= 0 ? '+' : ''}${totals.followersGained} sur la période`
          }
        />
      </div>

      <Card className="p-4">
        <InstagramChart series={data?.series ?? []} granularity={filters.effectiveGranularity} />
      </Card>

      <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
        <TabsList>
          <TabsTrigger value="stories">Stories ({data?.stories.length ?? 0})</TabsTrigger>
          <TabsTrigger value="publications">Publications ({data?.media.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="stories">
          <StoriesCalendar
            stories={data?.stories ?? []}
            from={filters.from}
            to={filters.to}
            accounts={accounts}
          />
        </TabsContent>

        <TabsContent value="publications">
          <InstagramMediaTable media={data?.media ?? []} />
        </TabsContent>
      </Tabs>
    </div>
  );
};
