import { useState } from 'react';
import { Search } from 'lucide-react';
import {
  useCreateChannel,
  useResolveChannel,
  useUpdateChannel,
} from '../../../application/channel/usecases/useChannels.ts';
import type { Channel, ChannelMode } from '../../../domain/channel/entities/Channel.ts';
import {
  CHANNEL_MODE_HINTS,
  CHANNEL_MODE_LABELS,
} from '../../../domain/channel/entities/Channel.ts';
import { formatNumber } from '../../../shared/format.ts';
import { Button } from '../ui/button.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog.tsx';
import { Input } from '../ui/input.tsx';
import { Label } from '../ui/label.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select.tsx';

const MODES: ChannelMode[] = ['public', 'oauth', 'manual'];

interface ChannelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channel?: Channel | null;
}

export const ChannelDialog = ({ open, onOpenChange, channel }: ChannelDialogProps) => {
  const create = useCreateChannel();
  const update = useUpdateChannel();
  const resolve = useResolveChannel();
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    mode: 'public' as ChannelMode,
    externalId: '',
    handle: '',
    color: '#ef4444',
    refreshToken: '',
    search: '',
  });

  const [lastKey, setLastKey] = useState<string | null>(null);
  const key = `${open}-${channel?.id ?? 'new'}`;
  if (open && key !== lastKey) {
    setLastKey(key);
    setError(null);
    setForm({
      name: channel?.name ?? '',
      mode: channel?.mode ?? 'public',
      externalId: channel?.externalId ?? '',
      handle: channel?.handle ?? '',
      color: channel?.color ?? '#ef4444',
      refreshToken: '',
      search: '',
    });
  }

  /** Remplit nom et identifiant à partir d'un @handle ou d'une URL de chaîne. */
  const runSearch = async () => {
    setError(null);
    try {
      const found = await resolve.mutateAsync(form.search);
      setForm((f) => ({
        ...f,
        name: f.name || found.title,
        externalId: found.channelId,
        handle: found.handle ?? f.handle,
      }));
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : 'Chaîne introuvable');
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const payload = {
      name: form.name.trim(),
      mode: form.mode,
      externalId: form.externalId.trim() || null,
      handle: form.handle.trim() || null,
      color: form.color,
      // Chaîne vide en édition = on ne touche pas au token déjà enregistré.
      ...(form.refreshToken.trim() ? { refreshToken: form.refreshToken.trim() } : {}),
    };

    try {
      if (channel) await update.mutateAsync({ id: channel.id, input: payload });
      else await create.mutateAsync(payload);
      onOpenChange(false);
    } catch (mutationError) {
      setError(
        mutationError instanceof Error ? mutationError.message : 'Enregistrement impossible',
      );
    }
  };

  const pending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{channel ? 'Modifier la chaîne' : 'Nouvelle chaîne'}</DialogTitle>
          <DialogDescription>{CHANNEL_MODE_HINTS[form.mode]}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          {!channel && (
            <div className="space-y-1.5">
              <Label htmlFor="channel-search">Rechercher la chaîne</Label>
              <div className="flex gap-2">
                <Input
                  id="channel-search"
                  placeholder="@aylabs ou https://youtube.com/@aylabs"
                  value={form.search}
                  onChange={(event) => setForm((f) => ({ ...f, search: event.target.value }))}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void runSearch();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void runSearch()}
                  disabled={resolve.isPending || !form.search.trim()}
                >
                  <Search className="h-4 w-4" />
                </Button>
              </div>
              {resolve.data && (
                <p className="text-xs text-muted-foreground">
                  Trouvé : {resolve.data.title} · {formatNumber(resolve.data.subscribers)} abonnés
                </p>
              )}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="channel-name">Nom</Label>
              <Input
                id="channel-name"
                value={form.name}
                onChange={(event) => setForm((f) => ({ ...f, name: event.target.value }))}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="channel-mode">Mode de collecte</Label>
              <Select
                value={form.mode}
                onValueChange={(value) => setForm((f) => ({ ...f, mode: value as ChannelMode }))}
              >
                <SelectTrigger id="channel-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODES.map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {CHANNEL_MODE_LABELS[mode]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {form.mode !== 'manual' && (
            <div className="space-y-1.5">
              <Label htmlFor="channel-external">Identifiant de chaîne</Label>
              <Input
                id="channel-external"
                placeholder="UCxxxxxxxxxxxxxxxxxxxxxx"
                value={form.externalId}
                onChange={(event) => setForm((f) => ({ ...f, externalId: event.target.value }))}
                required={form.mode === 'public'}
              />
            </div>
          )}

          {form.mode === 'oauth' && (
            <div className="space-y-1.5">
              <Label htmlFor="channel-token">
                Refresh token {channel?.hasCredentials && '(déjà enregistré)'}
              </Label>
              <Input
                id="channel-token"
                type="password"
                autoComplete="off"
                placeholder={channel?.hasCredentials ? 'Laisser vide pour conserver' : '1//0g...'}
                value={form.refreshToken}
                onChange={(event) => setForm((f) => ({ ...f, refreshToken: event.target.value }))}
                required={!channel?.hasCredentials}
              />
              <p className="text-xs text-muted-foreground">
                Obtenu via OAuth Playground, avec les scopes YouTube Analytics (dont
                <code className="mx-1 rounded bg-muted px-1">yt-analytics-monetary.readonly</code>
                pour les revenus). GCP_CLIENT_ID et GCP_CLIENT_SECRET restent côté serveur.
              </p>
            </div>
          )}

          <div className="flex items-end gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="channel-color">Couleur</Label>
              <Input
                id="channel-color"
                type="color"
                className="h-9 w-20 p-1"
                value={form.color}
                onChange={(event) => setForm((f) => ({ ...f, color: event.target.value }))}
              />
            </div>
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="channel-handle">Handle</Label>
              <Input
                id="channel-handle"
                placeholder="@aylabs"
                value={form.handle}
                onChange={(event) => setForm((f) => ({ ...f, handle: event.target.value }))}
              />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
