import { Link } from 'react-router-dom';
import { AlertTriangle, Instagram, RefreshCw } from 'lucide-react';
import {
  useCollectInstagram,
  useInstagramOverview,
} from '../../application/instagram/usecases/useInstagram.ts';
import { useFilters } from '../hooks/useFilters.tsx';
import { tokenWarning } from '../../domain/instagram/entities/Instagram.ts';
import { Button } from '../components/ui/button.tsx';
import { Card } from '../components/ui/card.tsx';
import { cn } from '../../shared/cn.ts';
import { Block } from '../dashboard/Block.tsx';

/**
 * Instagram, connecté par l'**API Graph** (Meta for Developers) : abonnés, stories,
 * portée, interactions et publications des comptes Business/Creator connectés.
 *
 * Deux étages, de haut en bas :
 *
 * 1. les chiffres clés, sur une ligne, puis les dix dernières publications (au doigt) ;
 * 2. les graphiques (abonnés et portée liés, activité en onglets), puis le calendrier.
 *
 * Chaque morceau est un bloc du catalogue (`<Block>`), ajoutable au dashboard au survol.
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

  const { data, isLoading } = useInstagramOverview({
    from: filters.from,
    to: filters.to,
    granularity: 'day',
    accountIds: filters.instagramAccountIds,
  });
  const collect = useCollectInstagram();

  const accounts = data?.accounts ?? [];
  const expiringAccounts = accounts.filter((account) => tokenWarning(account) !== null);

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
        <Block id="instagram.stories" />
        <Block id="instagram.followers" />
        <Block id="instagram.posts" />
        <Block id="instagram.reach" />
        <Block id="instagram.interactions" />
      </div>

      {/* Comme la dernière sortie YouTube : hors période, les dix dernières au doigt. */}
      <Block id="instagram.latest" />

      {/* Abonnés et portée côte à côte, survol lié : deux blocs, un même SYNC_ID. */}
      <div className="grid gap-4 2xl:grid-cols-2">
        <Block id="instagram.followersChart" />
        <Block id="instagram.reachChart" />
      </div>

      <Block id="instagram.activity" />
      <Block id="instagram.calendar" />
    </div>
  );
};
