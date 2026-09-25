import { Link } from 'react-router-dom';
import { Music2, RefreshCw } from 'lucide-react';
import {
  useCollectIntegration,
  useIntegrations,
} from '../../application/integration/usecases/useIntegrations.ts';
import { useTikTokOverview } from '../../application/tiktok/usecases/useTikTok.ts';
import { useFilters } from '../hooks/useFilters.tsx';
import { Button } from '../components/ui/button.tsx';
import { Card } from '../components/ui/card.tsx';
import { cn } from '../../shared/cn.ts';
import { Block } from '../dashboard/Block.tsx';

/**
 * TikTok, profil public uniquement — même mode qu'Instagram avant le passage à l'API
 * Graph : TikTok n'ouvre son API officielle qu'à des partenaires validés. Deux étages :
 * chiffres clés (Abonnés, Coeurs), puis leur historique en graphique.
 *
 * **Pas de suivi des vidéos** : TikTok ne renvoie plus la liste des vidéos dans le HTML de
 * la page publique (vérifié sur plusieurs comptes) — un compteur ou une liste qui resterait
 * figée à zéro pour toujours ferait plus mal que ne rien montrer.
 *
 * La période vient de la barre de filtres commune ; la maille, elle, est **toujours le
 * jour** — pas d'intérêt à agréger sur si peu de comptes.
 */
export const TikTokPage = () => {
  const filters = useFilters();

  const { data, isLoading } = useTikTokOverview({
    from: filters.from,
    to: filters.to,
    granularity: 'day',
    accountIds: filters.tiktokAccountIds,
  });
  const { data: integrations } = useIntegrations();
  const collect = useCollectIntegration();

  const accounts = data?.accounts ?? [];
  const tiktok = integrations?.providers.find((provider) => provider.id === 'tiktok');

  // Configuré (un pseudo est renseigné) mais pas encore collecté : le lien vers les
  // réglages ne mènerait nulle part de neuf, la personne vient d'en revenir. Proposer de
  // collecter tout de suite évite l'aller-retour, et le message dit qu'il ne s'agit pas
  // d'une panne — juste du premier relevé qui n'a pas encore eu lieu.
  if (!isLoading && accounts.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="hidden text-lg font-semibold lg:block">TikTok</h1>
        <Card className="space-y-3 p-6 text-center">
          <Music2 className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">
            {tiktok?.configured ? 'Aucun relevé pour l’instant' : 'Aucun profil TikTok suivi'}
          </p>
          <p className="mx-auto max-w-lg text-sm text-muted-foreground">
            {tiktok?.configured
              ? 'Le profil est configuré, mais rien n’a encore été collecté. La collecte tourne toutes les heures — ou lance-la maintenant.'
              : 'Renseigne ton nom d’utilisateur : abonnés et coeurs sont relevés chaque jour sur ton profil public, sans compte développeur.'}
          </p>
          {tiktok?.configured ? (
            <>
              <Button
                size="sm"
                disabled={collect.isPending}
                onClick={() => collect.mutate('tiktok')}
              >
                <RefreshCw className={cn('h-4 w-4', collect.isPending && 'animate-spin')} />
                {collect.isPending ? 'Collecte…' : 'Collecter maintenant'}
              </Button>
              {(tiktok.lastError || collect.error) && (
                <p className="text-sm text-destructive">
                  {collect.error?.message ?? tiktok.lastError}
                </p>
              )}
            </>
          ) : (
            <Button asChild size="sm">
              <Link to="/parametres?onglet=tiktok">Suivre un profil</Link>
            </Button>
          )}
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

      <div className="grid gap-3 sm:grid-cols-2">
        <Block id="tiktok.followers" />
        <Block id="tiktok.hearts" />
      </div>

      <Block id="tiktok.latest" />

      <Block id="tiktok.chart" />
    </div>
  );
};
