import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { formatDistanceToNowStrict } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  Check,
  ChevronRight,
  Copy,
  Hash,
  Instagram,
  KeyRound,
  PackageSearch,
  Plus,
  RefreshCw,
  ShoppingCart,
  Trash2,
  Youtube,
  type LucideIcon,
} from 'lucide-react';
import {
  useCollectIntegration,
  useCreateExportKey,
  useDeleteExportKey,
  useExportKeys,
  useIntegrations,
  useUpdateIntegration,
} from '../../application/integration/usecases/useIntegrations.ts';
import { useChannels, useUpdateChannel } from '../../application/channel/usecases/useChannels.ts';
import {
  useInstagramAccounts,
  useUpdateInstagramAccount,
} from '../../application/instagram/usecases/useInstagram.ts';
import {
  integrationStatus,
  type CreatedExportKey,
  type IntegrationProvider,
  type IntegrationStatus,
  type IntegrationView,
} from '../../domain/integration/entities/Integration.ts';
import { usePrivacy, type PrivacyTarget } from '../hooks/usePrivacy.tsx';
import { Badge, type BadgeProps } from '../components/ui/badge.tsx';
import { Button } from '../components/ui/button.tsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card.tsx';
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
import { Switch } from '../components/ui/switch.tsx';
import { cn } from '../../shared/cn.ts';

const relative = (iso: string): string =>
  formatDistanceToNowStrict(new Date(iso), { addSuffix: true, locale: fr });

const STATUS_BADGES: Record<IntegrationStatus, { label: string; variant: BadgeProps['variant'] }> =
  {
    disabled: { label: 'Désactivée', variant: 'outline' },
    unconfigured: { label: 'À configurer', variant: 'secondary' },
    empty: { label: 'Aucune donnée', variant: 'secondary' },
    error: { label: 'Erreur', variant: 'negative' },
    ok: { label: 'À jour', variant: 'positive' },
    never: { label: 'Jamais collectée', variant: 'secondary' },
  };

/** Ce que l'aperçu JSON d'une source laisserait lire, masqué comme partout ailleurs. */
const PREVIEW_MASKS: Record<IntegrationProvider, PrivacyTarget[]> = {
  youtube: ['adsense', 'views', 'subscribers'],
  instagram: ['subscribers'],
  amazon: ['affiliation'],
  domadoo: ['affiliation'],
  discord: [],
};

const LOCAL_SOURCE_HINTS: Partial<Record<IntegrationProvider, { ok: string; empty: string }>> = {
  youtube: {
    ok: 'Alimentée par la collecte des chaînes, rien à identifier ici.',
    empty: 'Aucune chaîne suivie : ajoute-en une dans Paramètres → Audience → YouTube.',
  },
  instagram: {
    ok: 'Alimentée par le profil public, relevé une fois par jour : abonnés et dernières publications.',
    empty: 'Aucun profil suivi : renseigne-le dans Paramètres → Audience → Instagram.',
  },
};

const PROVIDER_ICONS: Record<IntegrationProvider, LucideIcon> = {
  youtube: Youtube,
  instagram: Instagram,
  amazon: ShoppingCart,
  domadoo: PackageSearch,
  discord: Hash,
};

/**
 * Paramètres → API : ce que le studio publie pour Home Assistant (ex
 * YouTube-Money-Exporter), et les clés qui autorisent à le lire.
 *
 * Cette page ne parle plus que de ce qui **sort** du studio : activer une source, choisir
 * ce qu'elle publie, la collecter, vérifier ce qu'elle renvoie. Les identifiants
 * (Amazon, Domadoo, Discord, le profil Instagram) se règlent désormais avec le domaine
 * qu'ils alimentent — Paramètres → Revenus → Affiliation, → Audience → Instagram et
 * → Audience → Discord — et une source qui n'est pas encore configurée le dit avec un
 * lien plutôt que d'exposer ses champs ici une seconde fois.
 *
 * Chaque source est une **ligne dépliable** plutôt qu'une carte pleine largeur : cinq
 * cartes détaillées, dont trois ne concernent presque jamais l'écran (Amazon, Domadoo,
 * Discord n'ont plus rien à y saisir), faisaient défiler pour rien. Repliée, une ligne
 * dit déjà l'essentiel — statut, activée ou non.
 */
export const ApiSettingsPage = () => {
  const { data, isLoading, error } = useIntegrations();

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold">API</h2>
        <p className="text-sm text-muted-foreground">
          Ce que le studio publie pour Home Assistant ou un widget. Les sources distantes sont
          collectées toutes les heures.
        </p>
      </div>

      <ApiKeysCard />

      {data && !data.secretsKeyConfigured && (
        <p className="text-xs text-muted-foreground">
          <code>SECRETS_KEY</code> n’est pas définie côté serveur : les identifiants secrets
          (Amazon, Domadoo, SearchAPI…) ne peuvent pas être enregistrés depuis les écrans de
          réglages tant qu’elle manque.
        </p>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">Chargement…</p>}
      {error && (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : 'Lecture impossible'}
        </p>
      )}

      {data && (
        <div className="space-y-2">
          {data.providers.map((integration) => (
            <ProviderRow key={integration.id} integration={integration} />
          ))}
        </div>
      )}
    </div>
  );
};

/** Un champ en lecture seule et son bouton de copie. */
const CopyField = ({ value, label }: { value: string; label: string }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className="flex gap-2">
      <Input readOnly value={value} aria-label={label} className="font-mono text-xs" />
      <Button variant="outline" size="icon" onClick={copy} title="Copier">
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        <span className="sr-only">Copier {label}</span>
      </Button>
    </div>
  );
};

/**
 * L'adresse de l'export et les clés qui l'ouvrent.
 *
 * **Une clé par client**, et pas une clé unique : révoquer celle d'un widget abandonné ne
 * doit pas couper Home Assistant. Le jeton n'est montré qu'une fois, dans la modale qui
 * suit la création — l'API n'en garde que l'empreinte, il n'y a donc rien à « réafficher ».
 */
const ApiKeysCard = () => {
  const { data: keys = [] } = useExportKeys();
  const create = useCreateExportKey();
  const remove = useDeleteExportKey();
  const [label, setLabel] = useState('');
  const [created, setCreated] = useState<CreatedExportKey | null>(null);

  const endpoint = `${window.location.origin}/api/export`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>API Keys</CardTitle>
        <CardDescription>
          Une seule adresse pour toutes les sources, protégée par une clé. Même format JSON que
          YouTube-Money-Exporter : une configuration Home Assistant existante n’a qu’à changer
          d’adresse et à ajouter l’en-tête.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label>Adresse</Label>
          <CopyField value={endpoint} label="l’adresse de l’export" />
          <p className="text-xs text-muted-foreground">
            Une source seule : <code>/api/export/amazon</code>, <code>/api/export/youtube</code>… La
            clé passe dans l’en-tête <code>Authorization: Bearer …</code>.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Clés</Label>
          {keys.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Aucune clé : l’export refuse toute requête tant qu’il n’en existe pas.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {keys.map((key) => (
                <li key={key.id} className="flex items-center gap-3 px-3 py-2">
                  <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{key.label}</div>
                    <div className="text-xs text-muted-foreground">
                      <code>{key.prefix}…</code> · créée {relative(key.createdAt)} ·{' '}
                      {key.lastUsedAt ? `utilisée ${relative(key.lastUsedAt)}` : 'jamais utilisée'}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title="Révoquer"
                    disabled={remove.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Révoquer « ${key.label} » ? Le client qui s’en sert recevra une erreur 401 dès sa prochaine requête.`,
                        )
                      ) {
                        remove.mutate(key.id);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                    <span className="sr-only">Révoquer {key.label}</span>
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate(label.trim(), {
                onSuccess: (result) => {
                  setCreated(result);
                  setLabel('');
                },
              });
            }}
          >
            <Input
              placeholder="Nom du client (ex. Home Assistant)"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              maxLength={60}
            />
            <Button type="submit" size="sm" disabled={!label.trim() || create.isPending}>
              <Plus className="h-4 w-4" />
              Créer
            </Button>
          </form>
          {create.error && <p className="text-sm text-destructive">{create.error.message}</p>}
        </div>
      </CardContent>

      <CreatedKeyDialog created={created} endpoint={endpoint} onClose={() => setCreated(null)} />
    </Card>
  );
};

const CreatedKeyDialog = ({
  created,
  endpoint,
  onClose,
}: {
  created: CreatedExportKey | null;
  endpoint: string;
  onClose: () => void;
}) => {
  const snippet = created
    ? [
        'rest:',
        `  - resource: "${endpoint}"`,
        '    headers:',
        `      Authorization: "Bearer ${created.token}"`,
        '    scan_interval: 3600',
        '    timeout: 30',
      ].join('\n')
    : '';

  return (
    <Dialog open={created !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Clé « {created?.key.label} » créée</DialogTitle>
          <DialogDescription>
            Copie-la maintenant : elle ne sera plus jamais affichée. Seule son empreinte est
            conservée, et une clé perdue se remplace, elle ne se retrouve pas.
          </DialogDescription>
        </DialogHeader>

        {created && (
          <div className="space-y-4">
            <CopyField value={created.token} label="la clé" />
            <div className="space-y-1.5">
              <Label>Pour Home Assistant (configuration.yaml)</Label>
              <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">{snippet}</pre>
              <p className="text-xs text-muted-foreground">
                Mieux encore : range la ligne <code>Bearer …</code> dans <code>secrets.yaml</code>{' '}
                et écris <code>Authorization: !secret creator_studio</code>. Les capteurs existants
                (<code>value_json.youtube.thisMonth.views</code>…) restent valables.
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button onClick={onClose}>C’est copié</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/** Les chaînes YouTube incluses dans l'export, une bascule chacune. */
const ChannelExportList = () => {
  const { data: channels = [] } = useChannels(false);
  const update = useUpdateChannel();
  const queryClient = useQueryClient();

  if (channels.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aucune chaîne configurée : ajoute-en une dans{' '}
        <Link to="/parametres?onglet=youtube" className="underline underline-offset-2">
          Paramètres → Audience → YouTube
        </Link>
        .
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      <p className="text-sm text-muted-foreground">Chaînes incluses dans l’export :</p>
      <ul className="divide-y divide-border rounded-md border border-border">
        {channels.map((channel) => (
          <li key={channel.id} className="flex items-center gap-3 px-3 py-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: channel.color }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-sm">{channel.name}</span>
            <Switch
              checked={channel.exportEnabled}
              onCheckedChange={(exportEnabled) =>
                update.mutate(
                  { id: channel.id, input: { exportEnabled } },
                  {
                    onSuccess: () =>
                      void queryClient.invalidateQueries({ queryKey: ['integrations'] }),
                  },
                )
              }
            />
          </li>
        ))}
      </ul>
    </div>
  );
};

/** Les comptes Instagram inclus dans l'export, une bascule chacun. */
const InstagramExportList = () => {
  const { data: accounts = [] } = useInstagramAccounts(false);
  const update = useUpdateInstagramAccount();
  const queryClient = useQueryClient();

  if (accounts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aucun compte suivi : renseigne un profil dans{' '}
        <Link to="/parametres?onglet=instagram" className="underline underline-offset-2">
          Paramètres → Audience → Instagram
        </Link>
        .
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      <p className="text-sm text-muted-foreground">Comptes inclus dans l’export :</p>
      <ul className="divide-y divide-border rounded-md border border-border">
        {accounts.map((account) => (
          <li key={account.id} className="flex items-center gap-3 px-3 py-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: account.color }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-sm">@{account.username}</span>
            <Switch
              checked={account.exportEnabled}
              onCheckedChange={(exportEnabled) =>
                update.mutate(
                  { id: account.id, input: { exportEnabled } },
                  {
                    onSuccess: () =>
                      void queryClient.invalidateQueries({ queryKey: ['integrations'] }),
                  },
                )
              }
            />
          </li>
        ))}
      </ul>
    </div>
  );
};

/** Où sont réglés les identifiants d'une source qui n'en montre plus ici. */
const CONFIG_POINTERS: Partial<Record<IntegrationProvider, { to: string; label: string }>> = {
  amazon: { to: '/parametres?onglet=affiliation', label: 'Paramètres → Revenus → Affiliation' },
  domadoo: { to: '/parametres?onglet=affiliation', label: 'Paramètres → Revenus → Affiliation' },
  discord: { to: '/parametres?onglet=discord', label: 'Paramètres → Audience → Discord' },
};

/**
 * Une source de l'export, en ligne dépliable.
 *
 * Repliée, elle dit l'essentiel (statut, activée ou non) ; dépliée, elle donne accès à ce
 * qui reste propre à l'export — quoi publier, tester la collecte, voir ce qui en sort.
 */
const ProviderRow = ({ integration }: { integration: IntegrationView }) => {
  const [open, setOpen] = useState(false);
  const update = useUpdateIntegration();
  const collect = useCollectIntegration();
  const privacy = usePrivacy();

  const status = integrationStatus(integration);
  const badge = STATUS_BADGES[status];
  const previewMasked = PREVIEW_MASKS[integration.id].some((target) => privacy.isMasked(target));
  const localHint = LOCAL_SOURCE_HINTS[integration.id];
  const pointer = CONFIG_POINTERS[integration.id];
  const Icon = PROVIDER_ICONS[integration.id];

  return (
    <div className={cn('rounded-lg border border-border', !integration.enabled && 'opacity-70')}>
      <div className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          <ChevronRight
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-90',
            )}
          />
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="font-medium">{integration.label}</span>
            <Badge variant={badge.variant}>{badge.label}</Badge>
          </span>
        </button>

        <div
          className="flex shrink-0 items-center gap-2"
          onClick={(event) => event.stopPropagation()}
        >
          <Label
            htmlFor={`enabled-${integration.id}`}
            className="text-xs font-normal text-muted-foreground"
          >
            Publier
          </Label>
          <Switch
            id={`enabled-${integration.id}`}
            checked={integration.enabled}
            onCheckedChange={(enabled) =>
              update.mutate({ provider: integration.id, input: { enabled } })
            }
          />
        </div>
      </div>

      {open && (
        <div className="space-y-4 border-t border-border px-3 py-3 sm:px-4 sm:py-4">
          <p className="text-sm text-muted-foreground">{integration.description}</p>

          {integration.kind === 'local' && localHint && (
            <p className="text-sm text-muted-foreground">
              {integration.configured ? localHint.ok : localHint.empty}
              {integration.lastUpdate && <> Dernier relevé {relative(integration.lastUpdate)}.</>}
            </p>
          )}

          {integration.id === 'youtube' && <ChannelExportList />}
          {integration.id === 'instagram' && <InstagramExportList />}

          {pointer && (
            <p className="text-sm text-muted-foreground">
              Identifiants gérés dans{' '}
              <Link to={pointer.to} className="underline underline-offset-2">
                {pointer.label}
              </Link>
              .
            </p>
          )}

          {integration.requiresBrowser && (
            <p className="text-xs text-muted-foreground">
              Lu dans un navigateur sans interface côté serveur : une vingtaine de secondes par
              collecte, et sensible à tout changement du site.
            </p>
          )}

          {integration.collectable && (
            <div className="space-y-1 text-sm">
              {integration.kind === 'remote' && integration.lastUpdate && (
                <p className="text-muted-foreground">
                  Dernière collecte réussie {relative(integration.lastUpdate)}
                  {integration.durationMs !== null && status === 'ok' && (
                    <> ({Math.max(1, Math.round(integration.durationMs / 1000))} s)</>
                  )}
                  .
                </p>
              )}
              {status === 'error' && integration.lastAttemptAt && (
                <p className="text-destructive">
                  Échec {relative(integration.lastAttemptAt)} : {integration.lastError}
                  {integration.lastUpdate && ' — la dernière valeur reste publiée.'}
                </p>
              )}
            </div>
          )}

          {(update.error || collect.error) && (
            <p className="text-sm text-destructive">{(update.error ?? collect.error)?.message}</p>
          )}

          {integration.collectable && (
            <Button
              variant="outline"
              size="sm"
              disabled={
                !integration.configured ||
                (integration.kind === 'remote' && !integration.enabled) ||
                collect.isPending
              }
              onClick={() => collect.mutate(integration.id)}
            >
              <RefreshCw className={cn('h-4 w-4', collect.isPending && 'animate-spin')} />
              {collect.isPending ? 'Collecte…' : 'Collecter maintenant'}
            </Button>
          )}

          {integration.data !== null && (
            <details className="rounded-md border border-border">
              <summary className="cursor-pointer px-3 py-2 text-sm">Données publiées</summary>
              {previewMasked ? (
                <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                  Masquées par la confidentialité (Paramètres → Application).
                </p>
              ) : (
                <pre className="max-h-72 overflow-auto border-t border-border bg-muted/40 p-3 text-xs">
                  {JSON.stringify(integration.data, null, 2)}
                </pre>
              )}
            </details>
          )}
        </div>
      )}
    </div>
  );
};
