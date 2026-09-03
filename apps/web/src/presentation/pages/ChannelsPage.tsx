import { useState } from 'react';
import { Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import {
  useChannels,
  useCollectChannel,
  useDeleteChannel,
} from '../../application/channel/usecases/useChannels.ts';
import type { Channel } from '../../domain/channel/entities/Channel.ts';
import { CHANNEL_MODE_LABELS } from '../../domain/channel/entities/Channel.ts';
import { formatDate, formatNumber } from '../../shared/format.ts';
import { Button } from '../components/ui/button.tsx';
import { Badge } from '../components/ui/badge.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.tsx';
import { ChannelDialog } from '../components/forms/ChannelDialog.tsx';
import { ManualEntryDialog } from '../components/forms/ManualEntryDialog.tsx';
import { EmptyState } from '../components/EmptyState.tsx';
import { cn } from '../../shared/cn.ts';

export const ChannelsPage = () => {
  const { data: channels = [], isLoading } = useChannels(true);
  const collect = useCollectChannel();
  const remove = useDeleteChannel();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [selected, setSelected] = useState<Channel | null>(null);

  const openCreate = () => {
    setSelected(null);
    setDialogOpen(true);
  };

  if (!isLoading && channels.length === 0) {
    return (
      <>
        <EmptyState
          title="Aucune chaîne"
          description="Ajoute une chaîne publique (clé API), une chaîne OAuth pour l'historique complet et les revenus, ou une chaîne manuelle."
          actionLabel="Ajouter une chaîne"
          onAction={openCreate}
        />
        <ChannelDialog open={dialogOpen} onOpenChange={setDialogOpen} channel={null} />
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold">Chaînes</h2>
          <p className="text-sm text-muted-foreground">{channels.length} chaîne(s) suivie(s)</p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Ajouter une chaîne
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {channels.map((channel) => (
          <Card key={channel.id} className={cn(channel.isArchived && 'opacity-60')}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="flex items-center gap-2">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: channel.color }}
                    aria-hidden
                  />
                  {channel.name}
                </CardTitle>
                <div className="flex gap-1.5">
                  <Badge variant="secondary">{CHANNEL_MODE_LABELS[channel.mode]}</Badge>
                  {channel.isArchived && <Badge variant="outline">Archivée</Badge>}
                </div>
              </div>
              {channel.handle && <p className="text-xs text-muted-foreground">{channel.handle}</p>}
            </CardHeader>

            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Abonnés</p>
                  <p className="tabular font-semibold">
                    {channel.latestSnapshot
                      ? formatNumber(channel.latestSnapshot.subscribers)
                      : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Vues totales</p>
                  <p className="tabular font-semibold">
                    {channel.latestSnapshot ? formatNumber(channel.latestSnapshot.totalViews) : '—'}
                  </p>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                {channel.lastMetricDate
                  ? `Données jusqu'au ${formatDate(channel.lastMetricDate)}`
                  : 'Aucune donnée collectée'}
                {channel.mode === 'oauth' && !channel.hasCredentials && (
                  <span className="block text-destructive">Refresh token manquant</span>
                )}
              </p>

              <div className="flex flex-wrap gap-1.5">
                {channel.mode !== 'manual' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => collect.mutate(channel.id)}
                    disabled={collect.isPending}
                  >
                    <RefreshCw
                      className={cn(
                        'h-3.5 w-3.5',
                        collect.isPending && collect.variables === channel.id && 'animate-spin',
                      )}
                    />
                    Collecter
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelected(channel);
                    setManualOpen(true);
                  }}
                >
                  Saisie manuelle
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setSelected(channel);
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
                    if (
                      window.confirm(
                        `Supprimer « ${channel.name} » ? Son historique de statistiques sera perdu. Les revenus saisis seront conservés mais détachés de la chaîne.`,
                      )
                    ) {
                      remove.mutate(channel.id);
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  <span className="sr-only">Supprimer</span>
                </Button>
              </div>

              {collect.data?.channelId === channel.id && (
                <p
                  className={cn(
                    'text-xs',
                    collect.data.status === 'error' ? 'text-destructive' : 'text-muted-foreground',
                  )}
                >
                  {collect.data.message ??
                    `${collect.data.daysUpserted ?? 0} jour(s) mis à jour · ${
                      collect.data.videosUpserted ?? 0
                    } vidéo(s)`}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <ChannelDialog open={dialogOpen} onOpenChange={setDialogOpen} channel={selected} />
      <ManualEntryDialog open={manualOpen} onOpenChange={setManualOpen} channel={selected} />
    </div>
  );
};
