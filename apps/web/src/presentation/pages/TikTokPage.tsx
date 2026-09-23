import { Link } from 'react-router-dom';
import { ExternalLink, Heart, Music2, RefreshCw, Video } from 'lucide-react';
import {
  useCollectIntegration,
  useIntegrations,
} from '../../application/integration/usecases/useIntegrations.ts';
import { useTikTokOverview } from '../../application/tiktok/usecases/useTikTok.ts';
import { useFilters } from '../hooks/useFilters.tsx';
import { usePrivacy } from '../hooks/usePrivacy.tsx';
import { formatCount } from '../../domain/tiktok/entities/TikTok.ts';
import { MASKED_TEXT } from '../../domain/privacy/entities/Privacy.ts';
import { TikTokChart } from '../components/tiktok/TikTokChart.tsx';
import { StatCard } from '../components/StatCard.tsx';
import { Button } from '../components/ui/button.tsx';
import { Card } from '../components/ui/card.tsx';
import { formatDate } from '../../shared/format.ts';
import { cn } from '../../shared/cn.ts';

/**
 * TikTok, profil public uniquement — même mode qu'Instagram avant le passage à l'API
 * Graph : TikTok n'ouvre son API officielle qu'à des partenaires validés. Trois étages,
 * comme Instagram : chiffres clés, graphique (abonnés / vidéos), dernières vidéos.
 *
 * La période vient de la barre de filtres commune ; la maille, elle, est **toujours le
 * jour** — pas d'intérêt à agréger sur si peu de comptes.
 */
export const TikTokPage = () => {
  const filters = useFilters();
  const privacy = usePrivacy();

  const { data, isLoading } = useTikTokOverview({
    from: filters.from,
    to: filters.to,
    granularity: 'day',
  });
  const { data: integrations } = useIntegrations();
  const collect = useCollectIntegration();

  const accounts = data?.accounts ?? [];
  const totals = data?.totals;
  const tiktok = integrations?.providers.find((provider) => provider.id === 'tiktok');

  if (!isLoading && accounts.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="hidden text-lg font-semibold lg:block">TikTok</h1>
        <Card className="space-y-3 p-6 text-center">
          <Music2 className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">Aucun profil TikTok suivi</p>
          <p className="mx-auto max-w-lg text-sm text-muted-foreground">
            Renseigne ton nom d’utilisateur : abonnés, coeurs et dernières vidéos sont relevés
            chaque jour sur ton profil public, sans compte développeur.
          </p>
          <Button asChild size="sm">
            <Link to="/parametres?onglet=tiktok">Suivre un profil</Link>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="hidden lg:block">
          <h1 className="text-lg font-semibold">TikTok</h1>
          <p className="text-sm text-muted-foreground">
            {accounts.map((account) => `@${account.username}`).join(', ') || 'Aucun compte'}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={collect.isPending || !tiktok?.configured}
          onClick={() => collect.mutate('tiktok')}
          title="Relire le profil public maintenant"
        >
          <RefreshCw className={cn('h-4 w-4', collect.isPending && 'animate-spin')} />
          {collect.isPending ? 'Collecte…' : 'Collecter'}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
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
          icon={<Music2 className="h-4 w-4" />}
        />
        <StatCard
          label="Coeurs"
          value={formatCount(totals?.hearts ?? null)}
          hint="au dernier relevé"
          icon={<Heart className="h-4 w-4" />}
        />
        <StatCard
          label="Vidéos"
          value={formatCount(totals?.videos ?? 0)}
          hint="listées sur la période"
          icon={<Video className="h-4 w-4" />}
        />
      </div>

      <Card className="p-4">
        <TikTokChart series={data?.series ?? []} />
      </Card>

      <Card className="space-y-2 p-4">
        <h2 className="text-sm font-semibold">Dernières vidéos</h2>
        {(data?.videos ?? []).length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Aucune vidéo listée pour l’instant.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {(data?.videos ?? []).map((video) => (
              <li key={video.id} className="flex items-center gap-3 py-2 text-sm">
                {video.thumbnailUrl ? (
                  <img
                    src={video.thumbnailUrl}
                    alt=""
                    className="h-12 w-9 shrink-0 rounded object-cover"
                  />
                ) : (
                  <span className="flex h-12 w-9 shrink-0 items-center justify-center rounded bg-muted">
                    <Video className="h-4 w-4 text-muted-foreground" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate">
                    {video.description?.split('\n')[0] || '(sans légende)'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(video.date)} · {formatCount(video.views)} vues ·{' '}
                    {formatCount(video.likes)} j’aime
                  </p>
                </div>
                {video.permalink && (
                  <a
                    href={video.permalink}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    title="Ouvrir sur TikTok"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
};
