import { formatDistanceToNowStrict } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Hash, RefreshCw, Users, Wifi } from 'lucide-react';
import {
  useCollectIntegration,
  useDiscordHistory,
  useIntegrations,
} from '../../application/integration/usecases/useIntegrations.ts';
import { useFilters } from '../hooks/useFilters.tsx';
import { formatNumber } from '../../shared/format.ts';
import { cn } from '../../shared/cn.ts';
import { StatCard } from '../components/StatCard.tsx';
import { Button } from '../components/ui/button.tsx';
import { Card } from '../components/ui/card.tsx';
import { EmptyState } from '../components/EmptyState.tsx';
import { DiscordChart } from '../components/discord/DiscordChart.tsx';

interface DiscordData {
  name: string;
  members: number | null;
  members_online: number | null;
}

/**
 * Le serveur Discord, en un coup d'œil.
 *
 * N'apparaît dans le menu que si une invitation est configurée (`Paramètres → Audience →
 * Discord`) — sans ça l'écran n'a rien à montrer, et une entrée de menu qui mène à un vide
 * se lit comme une panne. Il reste accessible par adresse directe le temps que la
 * configuration se propage, d'où l'écran vide ci-dessous plutôt qu'une redirection.
 *
 * **Un point par collecte**, pas un bucket par jour : `discord_snapshots` archive
 * membres et connectés à **chaque** passage (`DiscordChart`), contrairement à Domadoo qui
 * n'en garde qu'un par jour — ici la variation d'une heure à l'autre est justement ce
 * qu'on veut voir.
 */
export const DiscordPage = () => {
  const { data } = useIntegrations();
  const filters = useFilters();
  const { data: history = [] } = useDiscordHistory({ from: filters.from, to: filters.to });
  const collect = useCollectIntegration();
  const discord = data?.providers.find((provider) => provider.id === 'discord');

  if (data && !discord?.configured) {
    return (
      <EmptyState
        title="Discord n'est pas configuré"
        description="Renseigne le code d'invitation du serveur dans Paramètres → Audience → Discord pour voir son tableau de bord ici."
        actionLabel="Configurer Discord"
        actionTo="/parametres?onglet=discord"
      />
    );
  }

  const payload = discord?.data as DiscordData | null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="hidden lg:block">
          <h1 className="text-lg font-semibold">Discord</h1>
          <p className="text-sm text-muted-foreground">
            {payload?.name || 'Le serveur suivi'} · un point à chaque collecte.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={collect.isPending}
          onClick={() => collect.mutate('discord')}
        >
          <RefreshCw className={cn('h-4 w-4', collect.isPending && 'animate-spin')} />
          {collect.isPending ? 'Collecte…' : 'Collecter'}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        {discord?.lastUpdate
          ? `Dernier relevé ${formatDistanceToNowStrict(new Date(discord.lastUpdate), {
              addSuffix: true,
              locale: fr,
            })}`
          : "Aucun relevé pour l'instant : la collecte horaire l'écrira."}
      </p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard
          label="Serveur"
          value={payload?.name || '—'}
          hint="nom lu depuis l'invitation"
          icon={<Hash className="h-4 w-4" />}
        />
        <StatCard
          label="Membres"
          value={payload?.members != null ? formatNumber(payload.members) : '—'}
          hint="total du serveur"
          icon={<Users className="h-4 w-4" />}
        />
        <StatCard
          label="En ligne"
          value={payload?.members_online != null ? formatNumber(payload.members_online) : '—'}
          hint="connectés au dernier relevé"
          icon={<Wifi className="h-4 w-4" />}
        />
      </div>

      {discord?.lastError && (
        <p className="text-sm text-destructive">
          Échec de la dernière collecte : {discord.lastError}
          {discord.lastUpdate && ' — la dernière valeur reste affichée.'}
        </p>
      )}

      <Card className="space-y-2 p-4">
        <div>
          <h3 className="text-sm font-semibold">Évolution</h3>
          <p className="text-xs text-muted-foreground">
            Sur la période choisie — un point par collecte, pas par jour.
          </p>
        </div>
        <DiscordChart snapshots={history} />
      </Card>
    </div>
  );
};
