import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Copy, LogIn, Unplug } from 'lucide-react';
import {
  useCompleteTikTokOAuth,
  useDisconnectTikTok,
  useStartTikTokOAuth,
  useTikTokConnections,
} from '../../../application/tiktok/usecases/useTikTok.ts';
import { tiktokConnectionName } from '../../../domain/tiktok/entities/TikTok.ts';
import { formatDate } from '../../../shared/format.ts';
import { Badge } from '../ui/badge.tsx';
import { Button } from '../ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card.tsx';
import { Input } from '../ui/input.tsx';

/**
 * La connexion OAuth à TikTok, pour publier depuis Production → Publish.
 *
 * TikTok renvoie le navigateur sur l'adresse de retour déclarée dans son portail. Quand
 * c'est le studio, la connexion se termine toute seule (`?tiktok=connecte` au retour) ;
 * sinon, on colle ici l'adresse de la page où l'on a atterri, et le studio fait l'échange.
 */
export const TikTokConnectionCard = () => {
  const { data: status } = useTikTokConnections();
  const start = useStartTikTokOAuth();
  const complete = useCompleteTikTokOAuth();
  const disconnect = useDisconnectTikTok();
  const [searchParams] = useSearchParams();
  const [returnUrl, setReturnUrl] = useState('');
  const [waiting, setWaiting] = useState(false);
  const result = searchParams.get('tiktok');
  const message = searchParams.get('message');

  const connect = () => {
    start.mutate(undefined, {
      onSuccess: ({ url }) => {
        // Un nouvel onglet : si le retour n'arrive pas jusqu'au studio, cet écran reste
        // ouvert pour y coller l'adresse.
        window.open(url, '_blank', 'noopener');
        setWaiting(true);
      },
    });
  };

  if (!status) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Publier sur TikTok</CardTitle>
        <CardDescription>
          Connexion OAuth de ton app TikTok (sandbox), pour envoyer des vidéos depuis Production →
          Publish. Distincte du profil public suivi plus bas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {result === 'connecte' && <p className="text-[var(--positive)]">Compte TikTok connecté.</p>}
        {result === 'erreur' && (
          <p className="text-[var(--negative)]">Connexion refusée : {message ?? 'erreur'}</p>
        )}

        {!status.configured ? (
          <p className="text-muted-foreground">
            Renseigne TIKTOK_CLIENT_KEY et TIKTOK_CLIENT_SECRET (Client key / Client secret du
            sandbox) dans les variables de la stack, puis redéploie.
          </p>
        ) : !status.secretsKeyConfigured ? (
          <p className="text-muted-foreground">
            SECRETS_KEY absente : les jetons TikTok ne peuvent pas être enregistrés.
          </p>
        ) : (
          <>
            {status.redirectUri ? (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  Redirect URI à déclarer dans Login Kit, au caractère près :
                </p>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 truncate rounded bg-muted px-2 py-1 text-xs">
                    {status.redirectUri}
                  </code>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label="Copier l’adresse"
                    onClick={() => void navigator.clipboard?.writeText(status.redirectUri ?? '')}
                  >
                    <Copy className="size-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-[var(--negative)]">
                Adresse de retour inconnue : renseigne TIKTOK_REDIRECT_URI (ou PUBLIC_URL) en https.
              </p>
            )}

            {status.connections.length > 0 && (
              <ul className="divide-y rounded-md border">
                {status.connections.map((connection) => (
                  <li key={connection.id} className="flex items-center gap-3 p-2">
                    {connection.avatarUrl && (
                      <img
                        src={connection.avatarUrl}
                        alt=""
                        className="size-8 rounded-full object-cover"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{tiktokConnectionName(connection)}</p>
                      <p className="text-xs text-muted-foreground">
                        {connection.scopes.join(', ') || 'aucun scope'} · à reconnecter avant le{' '}
                        {formatDate(connection.refreshExpiresAt.slice(0, 10))}
                      </p>
                    </div>
                    {!connection.readable && <Badge variant="negative">Jetons illisibles</Badge>}
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label="Déconnecter"
                      disabled={disconnect.isPending}
                      onClick={() => {
                        if (window.confirm('Déconnecter ce compte TikTok du studio ?')) {
                          disconnect.mutate(connection.id);
                        }
                      }}
                    >
                      <Unplug className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            <Button
              type="button"
              size="sm"
              disabled={start.isPending || !status.redirectUri}
              onClick={connect}
            >
              <LogIn className="size-4" />
              {status.connections.length > 0 ? 'Connecter un autre compte' : 'Connecter TikTok'}
            </Button>
            {start.error && <p className="text-[var(--negative)]">{start.error.message}</p>}

            {waiting && (
              <form
                className="space-y-1"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!returnUrl.trim()) return;
                  complete.mutate(returnUrl, {
                    onSuccess: () => {
                      setReturnUrl('');
                      setWaiting(false);
                    },
                  });
                }}
              >
                <p className="text-xs text-muted-foreground">
                  Si la page de retour ne revient pas au studio, colle ici son adresse complète
                  (elle contient <code>code=</code> et <code>state=</code>), dans les minutes qui
                  suivent.
                </p>
                <div className="flex gap-2">
                  <Input
                    value={returnUrl}
                    placeholder="https://…?code=…&state=…"
                    onChange={(event) => setReturnUrl(event.target.value)}
                  />
                  <Button type="submit" size="sm" disabled={complete.isPending}>
                    Valider
                  </Button>
                </div>
                {complete.error && (
                  <p className="text-[var(--negative)]">{complete.error.message}</p>
                )}
              </form>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};
