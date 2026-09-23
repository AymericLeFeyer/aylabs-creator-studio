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
import {
  formatCount,
  tokenWarning,
  type InstagramAccount,
  type InstagramAccountInput,
} from '../../domain/instagram/entities/Instagram.ts';
import { Badge } from '../components/ui/badge.tsx';
import { Button } from '../components/ui/button.tsx';
import { Card } from '../components/ui/card.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog.tsx';
import { Input } from '../components/ui/input.tsx';
import { Label } from '../components/ui/label.tsx';
import { cn } from '../../shared/cn.ts';

/**
 * Les comptes Instagram, connectés par l'**API Graph** (Meta for Developers).
 *
 * Un compte **Business ou Creator** est requis — l'API ne répond à aucune statistique
 * pour un compte personnel — et un jeton d'accès longue durée (60 jours, à rafraîchir).
 * Ce n'est pas une préférence, c'est un prérequis de Meta : l'écran le rappelle plutôt
 * que de laisser une collecte échouer sans explication.
 *
 * Ce que le studio publie vers Home Assistant (activer la source, choisir les comptes à
 * exporter) reste dans Paramètres → API : cette page ne parle que de ce qui entre.
 */
export const InstagramSettingsPage = () => {
  const { data: accounts = [] } = useInstagramAccounts(true);
  const update = useUpdateInstagramAccount();
  const remove = useDeleteInstagramAccount();
  const collectOne = useCollectInstagramAccount();
  const refreshToken = useRefreshInstagramToken();
  const [dialogAccount, setDialogAccount] = useState<InstagramAccount | 'new' | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Instagram</h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Un compte Business ou Creator, connecté par l’API Graph : abonnés, stories, portée et
            publications, relevés chaque heure.
          </p>
        </div>
        <Button size="sm" onClick={() => setDialogAccount('new')}>
          <Plus className="h-4 w-4" />
          Connecter un compte
        </Button>
      </div>

      {accounts.length === 0 && (
        <Card className="p-4 text-sm text-muted-foreground">
          Aucun compte connecté pour l’instant.
        </Card>
      )}

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
                {!account.hasToken && <Badge variant="outline">Sans jeton</Badge>}
                {warning === 'expired' && <Badge variant="negative">Jeton expiré</Badge>}
                {warning === 'soon' && (
                  <Badge variant="secondary">Jeton : {account.tokenDaysLeft} j</Badge>
                )}
              </div>

              <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!account.hasToken || collectOne.isPending}
                  onClick={() => collectOne.mutate(account.id)}
                  title={account.hasToken ? undefined : 'Renseigne un jeton pour collecter'}
                >
                  <RefreshCw className={cn('h-4 w-4', collectOne.isPending && 'animate-spin')} />
                  Collecter
                </Button>

                {account.hasToken && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={refreshToken.isPending}
                    onClick={() => refreshToken.mutate(account.id)}
                    title="Échange le jeton contre un neuf, valable 60 jours de plus"
                  >
                    <KeyRound className="h-4 w-4" />
                    Rafraîchir le jeton
                  </Button>
                )}

                <Button variant="ghost" size="sm" onClick={() => setDialogAccount(account)}>
                  Modifier
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
                    // Plus définitif qu'ailleurs : les stories ne se recollectent pas.
                    if (
                      window.confirm(
                        `Supprimer @${account.username} ? Tout son historique (stories, publications, abonnés) part avec, et il ne pourra pas être reconstitué. L’archivage suffit pour arrêter le suivi.`,
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

      <InstagramAccountDialog
        account={dialogAccount}
        onOpenChange={(open) => !open && setDialogAccount(null)}
      />
    </div>
  );
};

/**
 * Créer ou modifier un compte. Le jeton se saisit en clair et ne redescend jamais de
 * l'API : le champ reste vide à l'édition, comme un mot de passe — laisser vide conserve
 * celui déjà enregistré.
 */
const InstagramAccountDialog = ({
  account,
  onOpenChange,
}: {
  account: InstagramAccount | 'new' | null;
  onOpenChange: (open: boolean) => void;
}) => {
  const create = useCreateInstagramAccount();
  const update = useUpdateInstagramAccount();
  const isNew = account === 'new';
  const editing = account && account !== 'new' ? account : null;

  const [form, setForm] = useState<InstagramAccountInput>(() => ({
    username: editing?.username ?? '',
    igUserId: editing?.igUserId ?? '',
    accessToken: '',
    tokenExpiresAt: null,
  }));

  // Le formulaire se réinitialise à chaque ouverture sur un compte différent : dériver
  // pendant le rendu plutôt que dans un effet, même pattern que le reste du projet.
  const [openFor, setOpenFor] = useState(account);
  if (openFor !== account) {
    setOpenFor(account);
    setForm({
      username: editing?.username ?? '',
      igUserId: editing?.igUserId ?? '',
      accessToken: '',
      tokenExpiresAt: null,
    });
  }

  const mutation = editing ? update : create;
  const open = account !== null;

  const submit = () => {
    if (isNew) {
      create.mutate(
        { ...form, accessToken: form.accessToken || null },
        { onSuccess: () => onOpenChange(false) },
      );
      return;
    }
    if (!editing) return;
    const input: Partial<InstagramAccountInput> = {
      username: form.username,
      igUserId: form.igUserId,
    };
    // Un champ jeton laissé vide ne touche pas à celui déjà enregistré.
    if (form.accessToken) input.accessToken = form.accessToken;
    if (form.tokenExpiresAt) input.tokenExpiresAt = form.tokenExpiresAt;
    update.mutate({ id: editing.id, input }, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isNew ? 'Connecter un compte Instagram' : `Modifier @${editing?.username}`}
          </DialogTitle>
          <DialogDescription>
            Un compte Business ou Creator, l’identifiant Meta et un jeton d’accès longue durée.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ig-username">Nom d’utilisateur</Label>
            <Input
              id="ig-username"
              value={form.username}
              onChange={(event) => setForm({ ...form, username: event.target.value })}
              placeholder="aylabs"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ig-user-id">Identifiant du compte (Meta)</Label>
            <Input
              id="ig-user-id"
              value={form.igUserId}
              onChange={(event) => setForm({ ...form, igUserId: event.target.value })}
              placeholder="178414…"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ig-token">Jeton d’accès longue durée</Label>
            <Input
              id="ig-token"
              type="password"
              autoComplete="off"
              value={form.accessToken ?? ''}
              onChange={(event) => setForm({ ...form, accessToken: event.target.value })}
              placeholder={editing ? '•••••••• (laisser vide pour le conserver)' : ''}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ig-token-expires">Expiration du jeton</Label>
            <Input
              id="ig-token-expires"
              type="date"
              value={form.tokenExpiresAt?.slice(0, 10) ?? ''}
              onChange={(event) =>
                setForm({
                  ...form,
                  tokenExpiresAt: event.target.value ? `${event.target.value}T00:00:00.000Z` : null,
                })
              }
            />
          </div>
          {mutation.error && <p className="text-sm text-destructive">{mutation.error.message}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            disabled={!form.username.trim() || !form.igUserId.trim() || mutation.isPending}
            onClick={submit}
          >
            {mutation.isPending ? 'Enregistrement…' : isNew ? 'Connecter' : 'Enregistrer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
