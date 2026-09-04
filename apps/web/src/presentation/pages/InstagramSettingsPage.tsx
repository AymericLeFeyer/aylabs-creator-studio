import { useState } from 'react';
import { Archive, ArchiveRestore, KeyRound, Plus, RefreshCw, Trash2 } from 'lucide-react';
import {
  useCollectInstagramAccount,
  useCreateInstagramAccount,
  useDeleteInstagramAccount,
  useInstagramAccounts,
  useRefreshInstagramToken,
  useUpdateInstagramAccount,
} from '../../application/instagram/usecases/useInstagram.ts';
import { formatCount, tokenWarning } from '../../domain/instagram/entities/Instagram.ts';
import { Badge } from '../components/ui/badge.tsx';
import { Button } from '../components/ui/button.tsx';
import { Card } from '../components/ui/card.tsx';
import { Input } from '../components/ui/input.tsx';
import { Label } from '../components/ui/label.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog.tsx';
import { cn } from '../../shared/cn.ts';

/**
 * Les comptes Instagram suivis.
 *
 * L'écran porte deux avertissements que rien d'autre ne peut porter :
 *
 * - **le prérequis** — un compte personnel ne donne accès à aucune statistique, il faut
 *   un compte Business ou Creator relié à une Page. Le dire ici évite une collecte qui
 *   échoue sans que personne ne comprenne pourquoi ;
 * - **l'échéance du jeton** — Meta n'en délivre pas de perpétuel. Un jeton expiré arrête
 *   la collecte, et chaque jour sans collecte est un jour de stories perdu pour toujours.
 */
export const InstagramSettingsPage = () => {
  const { data: accounts = [] } = useInstagramAccounts(true);
  const create = useCreateInstagramAccount();
  const update = useUpdateInstagramAccount();
  const remove = useDeleteInstagramAccount();
  const collect = useCollectInstagramAccount();
  const refresh = useRefreshInstagramToken();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ username: '', igUserId: '', accessToken: '' });
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await create.mutateAsync({
        username: form.username.trim().replace(/^@/, ''),
        igUserId: form.igUserId.trim(),
        accessToken: form.accessToken.trim() || null,
      });
      setForm({ username: '', igUserId: '', accessToken: '' });
      setDialogOpen(false);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : 'Ajout impossible');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Instagram</h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Un compte <strong>Business ou Creator</strong> relié à une Page Facebook est obligatoire
            : l’API ne donne aucune statistique sur un compte personnel. La conversion est gratuite
            et instantanée dans l’application Instagram.
          </p>
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          Connecter un compte
        </Button>
      </div>

      <Card className="p-4">
        <p className="text-sm font-medium">Pourquoi collecter tous les jours</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Instagram n’expose les stories que pendant <strong>24 heures</strong> — ni archivées, ni à
          la une. Le comptage « combien de stories ce mois-ci » n’existe que parce que l’outil les
          archive au fil de l’eau, et une journée sans collecte est perdue définitivement. La
          collecte tourne toutes les heures ; c’est le jeton, s’il expire, qui fait courir le vrai
          risque.
        </p>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        {accounts.map((account) => {
          const warning = tokenWarning(account);
          return (
            <Card
              key={account.id}
              className={cn('space-y-3 p-4', account.isArchived && 'opacity-60')}
            >
              <div className="flex items-center gap-3">
                {account.profilePicture ? (
                  <img
                    src={account.profilePicture}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                    style={{ backgroundColor: account.color }}
                  >
                    {account.username.slice(0, 1).toUpperCase()}
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">@{account.username}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {account.latestSnapshot?.followersCount != null
                      ? `${formatCount(account.latestSnapshot.followersCount)} abonnés`
                      : 'Aucun relevé'}
                    {account.lastCollectedAt &&
                      ` · collecté le ${account.lastCollectedAt.slice(0, 10)}`}
                  </p>
                </div>

                {account.isArchived && <Badge variant="outline">Archivé</Badge>}
              </div>

              {warning && (
                <p
                  className={cn(
                    'flex items-start gap-1.5 rounded-md px-2 py-1.5 text-xs',
                    'bg-[var(--negative)]/10 text-[var(--negative)]',
                  )}
                >
                  <KeyRound className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                  {warning === 'expired'
                    ? 'Jeton expiré : la collecte est arrêtée, les stories de chaque jour qui passe sont perdues.'
                    : `Jeton valable encore ${account.tokenDaysLeft} jour(s).`}
                </p>
              )}

              {!account.hasToken && (
                <p className="rounded-md bg-muted px-2 py-1.5 text-xs text-muted-foreground">
                  Aucun jeton enregistré : rien ne sera collecté.
                </p>
              )}

              <div className="space-y-1.5">
                <Label htmlFor={`token-${account.id}`} className="text-xs">
                  Remplacer le jeton
                </Label>
                <div className="flex gap-2">
                  <Input
                    id={`token-${account.id}`}
                    type="password"
                    autoComplete="off"
                    placeholder={account.hasToken ? '•••••••• (enregistré)' : 'Colle le jeton ici'}
                    className="h-8"
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter') return;
                      const value = event.currentTarget.value.trim();
                      if (!value) return;
                      update.mutate({ id: account.id, input: { accessToken: value } });
                      event.currentTarget.value = '';
                    }}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Entrée pour enregistrer. Un jeton longue durée vit 60 jours.
                </p>
              </div>

              <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!account.hasToken || collect.isPending}
                  onClick={() => collect.mutate(account.id)}
                >
                  <RefreshCw className={cn('h-4 w-4', collect.isPending && 'animate-spin')} />
                  Collecter
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  disabled={!account.hasToken || refresh.isPending}
                  onClick={() => refresh.mutate(account.id)}
                  title="Échanger le jeton contre un neuf, valable 60 jours de plus (demande META_APP_ID et META_APP_SECRET)"
                >
                  <KeyRound className="h-4 w-4" />
                  Prolonger le jeton
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    update.mutate({ id: account.id, input: { isArchived: !account.isArchived } })
                  }
                >
                  {account.isArchived ? (
                    <ArchiveRestore className="h-4 w-4" />
                  ) : (
                    <Archive className="h-4 w-4" />
                  )}
                  {account.isArchived ? 'Réactiver' : 'Archiver'}
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto"
                  onClick={() => {
                    // Plus définitif qu'ailleurs : les stories ne se recollectent pas, et
                    // ce qui part ici ne pourra jamais être reconstitué.
                    if (
                      window.confirm(
                        `Supprimer @${account.username} ? Tout son historique de stories part avec — et il ne pourra jamais être récupéré, l’API ne remonte pas dans le passé. L’archivage suffit pour arrêter la collecte.`,
                      )
                    ) {
                      remove.mutate(account.id);
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connecter un compte Instagram</DialogTitle>
            <DialogDescription>
              Les deux identifiants se récupèrent dans l’explorateur d’API de Meta. Le récap
              d’installation détaille la marche à suivre.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ig-username">Nom d’utilisateur</Label>
              <Input
                id="ig-username"
                placeholder="aylabs"
                value={form.username}
                onChange={(event) => setForm((f) => ({ ...f, username: event.target.value }))}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ig-user-id">Identifiant du compte (IG User ID)</Label>
              <Input
                id="ig-user-id"
                placeholder="17841400000000000"
                value={form.igUserId}
                onChange={(event) => setForm((f) => ({ ...f, igUserId: event.target.value }))}
                required
              />
              <p className="text-[11px] text-muted-foreground">
                Un long nombre commençant par 178414. C’est lui que portent tous les appels, pas le
                nom d’utilisateur.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ig-token">Jeton d’accès longue durée</Label>
              <Input
                id="ig-token"
                type="password"
                autoComplete="off"
                value={form.accessToken}
                onChange={(event) => setForm((f) => ({ ...f, accessToken: event.target.value }))}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? 'Ajout…' : 'Connecter'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
