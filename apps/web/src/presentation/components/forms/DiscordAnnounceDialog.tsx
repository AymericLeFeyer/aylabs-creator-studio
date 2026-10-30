import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useIntegrations } from '../../../application/integration/usecases/useIntegrations.ts';
import { useAnnounceOnDiscord } from '../../../application/production/usecases/useProductions.ts';
import type { Production } from '../../../domain/production/entities/Production.ts';
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

const ANNOUNCE_FIELDS = ['botToken', 'announceChannelId', 'announceRoleId'];

const longDate = (date: string): string =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });

interface DiscordAnnounceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  production: Production;
}

/**
 * Relit l'annonce avant de la publier : elle part sur un serveur public et ne se retire
 * pas d'ici. La date proposée est la **sortie visée** avant `videoDate`, qui vaut le jour
 * d'upload sur une vidéo programmée — or c'est le jour « pour tous » qu'on annonce.
 */
export const DiscordAnnounceDialog = ({
  open,
  onOpenChange,
  production,
}: DiscordAnnounceDialogProps) => {
  const { data: integrations } = useIntegrations();
  const announce = useAnnounceOnDiscord();
  const [date, setDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDate(production.plannedDate ?? production.videoDate ?? '');
      setError(null);
    }
  }

  const discord = integrations?.providers.find((provider) => provider.id === 'discord');
  const configured = ANNOUNCE_FIELDS.every((key) =>
    discord?.fields.some((field) => field.key === key && field.source !== null),
  );

  const submit = async () => {
    setError(null);
    try {
      await announce.mutateAsync({ id: production.id, date });
      onOpenChange(false);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : 'Annonce impossible');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Annoncer sur Discord</DialogTitle>
          <DialogDescription>
            Crée un post dans le salon d'annonces. Il ne pourra pas être retiré depuis le studio.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="discord-date">Disponible pour tous le</Label>
            <Input
              id="discord-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>

          <div className="space-y-2 rounded-md border border-border p-3 text-sm">
            <p className="font-medium">{production.videoTitle ?? production.title}</p>
            <p className="text-muted-foreground">
              Disponible dès maintenant pour les membres, et le{' '}
              <strong>{date ? longDate(date) : '…'}</strong> pour tous !
            </p>
            {production.videoThumbnailUrl && (
              <img
                src={production.videoThumbnailUrl}
                alt=""
                className="aspect-video w-full rounded-md object-cover"
              />
            )}
          </div>

          {integrations && !configured && (
            <p className="text-sm text-muted-foreground">
              Il manque le jeton du bot, le salon ou le rôle :{' '}
              <Link to="/parametres?onglet=discord" className="underline underline-offset-2">
                Paramètres → Audience → Discord
              </Link>
              .
            </p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button disabled={!date || !configured || announce.isPending} onClick={submit}>
            {announce.isPending ? 'Publication…' : 'Publier l’annonce'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
