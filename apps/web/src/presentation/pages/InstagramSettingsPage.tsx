import { Archive, ArchiveRestore, Trash2 } from 'lucide-react';
import {
  useDeleteInstagramAccount,
  useInstagramAccounts,
  useUpdateInstagramAccount,
} from '../../application/instagram/usecases/useInstagram.ts';
import { formatCount } from '../../domain/instagram/entities/Instagram.ts';
import { ProviderCredentialsCard } from '../components/integration/ProviderCredentialsCard.tsx';
import { Badge } from '../components/ui/badge.tsx';
import { Button } from '../components/ui/button.tsx';
import { Card } from '../components/ui/card.tsx';
import { cn } from '../../shared/cn.ts';

/**
 * Les profils Instagram suivis.
 *
 * **Uniquement par le profil public** : le nom d'utilisateur se renseigne juste en
 * dessous, et le relevé quotidien crée le compte ici au premier passage. La connexion par
 * l'API Graph (identifiant 178414…, jeton longue durée) a été retirée de l'écran tant
 * qu'elle ne fonctionne pas — les routes existent toujours côté API.
 *
 * Ce que le studio en publie vers Home Assistant (activer la source, choisir les comptes
 * à exporter, collecter) reste dans Paramètres → API : cette page ne parle que de ce qui
 * entre, pas de ce qui sort.
 */
export const InstagramSettingsPage = () => {
  const { data: accounts = [] } = useInstagramAccounts(true);
  const update = useUpdateInstagramAccount();
  const remove = useDeleteInstagramAccount();

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold">Instagram</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Les abonnés et les publications sont relevés une fois par jour sur le profil public, sans
          compte Meta.
        </p>
      </div>

      <ProviderCredentialsCard provider="instagram" title="Profil public à suivre" />

      {accounts.length === 0 && (
        <Card className="p-4 text-sm text-muted-foreground">
          Aucun profil suivi pour l’instant : il apparaîtra ici après le premier relevé.
        </Card>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {accounts.map((account) => (
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

            <div className="flex flex-wrap gap-2 border-t border-border pt-3">
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
                  // Plus définitif qu'ailleurs : un relevé d'abonnés ne se recollecte pas
                  // dans le passé.
                  if (
                    window.confirm(
                      `Supprimer @${account.username} ? Tout son historique d’abonnés part avec, et il ne pourra pas être reconstitué. L’archivage suffit pour arrêter le suivi.`,
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
        ))}
      </div>
    </div>
  );
};
