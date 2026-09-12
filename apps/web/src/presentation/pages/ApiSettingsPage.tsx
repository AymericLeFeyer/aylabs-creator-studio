import { useState } from 'react';
import { formatDistanceToNowStrict } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Check, Copy, KeyRound, Lock, Plus, RefreshCw, ShieldAlert, Trash2 } from 'lucide-react';
import {
  useCollectIntegration,
  useCreateExportKey,
  useDeleteExportKey,
  useExportKeys,
  useIntegrations,
  useUpdateIntegration,
} from '../../application/integration/usecases/useIntegrations.ts';
import {
  integrationStatus,
  type CreatedExportKey,
  type CredentialFieldView,
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

/**
 * Ce que l'aperçu JSON d'une source laisserait lire. Il est remplacé par un message dès
 * qu'une de ces familles est masquée : un bloc brut contournerait sinon toute la
 * confidentialité de l'outil, qui ne masque que ce qu'elle affiche elle-même.
 */
const PREVIEW_MASKS: Record<IntegrationProvider, PrivacyTarget[]> = {
  youtube: ['adsense', 'views', 'subscribers'],
  instagram: ['subscribers'],
  amazon: ['affiliation'],
  domadoo: ['affiliation'],
  discord: [],
};

const LOCAL_SOURCE_HINTS: Partial<Record<IntegrationProvider, { ok: string; empty: string }>> = {
  youtube: {
    ok: 'Alimentée par la collecte des chaînes, rien à configurer ici.',
    empty: 'Aucune chaîne suivie : ajoute-en une dans l’onglet Chaînes.',
  },
  instagram: {
    ok: 'Alimentée par la collecte Instagram, rien à configurer ici.',
    empty: 'Aucun compte connecté : ajoute-en un dans l’onglet Instagram.',
  },
};

/**
 * Paramètres → API : ce que le studio publie pour Home Assistant (ex
 * YouTube-Money-Exporter), et les comptes qu'il va chercher pour ça.
 *
 * Trois blocs, dans l'ordre où on les règle : la clé qui ouvre l'export, la façon dont
 * les secrets sont gardés, puis une carte par source.
 */
export const ApiSettingsPage = () => {
  const { data, isLoading, error } = useIntegrations();

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold">API</h2>
        <p className="text-sm text-muted-foreground">
          Ce que le studio publie pour Home Assistant ou un widget, et les comptes qu’il va chercher
          pour ça. Les sources distantes sont collectées toutes les heures.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ExportAccessCard />
        {data && <SecretsCard configured={data.secretsKeyConfigured} />}
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Chargement…</p>}
      {error && (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : 'Lecture impossible'}
        </p>
      )}

      {data && (
        <div className="grid gap-4 xl:grid-cols-2">
          {data.providers.map((integration) => (
            <ProviderCard
              key={integration.id}
              integration={integration}
              secretsKeyConfigured={data.secretsKeyConfigured}
            />
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
const ExportAccessCard = () => {
  const { data: keys = [] } = useExportKeys();
  const create = useCreateExportKey();
  const remove = useDeleteExportKey();
  const [label, setLabel] = useState('');
  const [created, setCreated] = useState<CreatedExportKey | null>(null);

  const endpoint = `${window.location.origin}/api/export`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Accès à l’export</CardTitle>
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
          <Label>Clés d’accès</Label>
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

/** Comment les secrets sont gardés — et ce qu'il manque quand ils ne peuvent pas l'être. */
const SecretsCard = ({ configured }: { configured: boolean }) => (
  <Card className={cn(!configured && 'border-[var(--negative)]/50')}>
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        {configured ? (
          <Lock className="h-4 w-4 text-[var(--positive)]" />
        ) : (
          <ShieldAlert className="h-4 w-4 text-[var(--negative)]" />
        )}
        Secrets
      </CardTitle>
      <CardDescription>
        {configured
          ? 'Les mots de passe saisis ici sont chiffrés (AES-256-GCM) avec SECRETS_KEY, qui vit dans l’environnement du serveur et jamais dans la base : une copie du fichier SQLite ne livre aucun mot de passe.'
          : 'SECRETS_KEY n’est pas définie : les champs secrets sont verrouillés, rien ne sera stocké en clair.'}
      </CardDescription>
    </CardHeader>
    <CardContent className="space-y-2 text-sm text-muted-foreground">
      {!configured && (
        <p>
          Deux voies : ajouter <code>SECRETS_KEY</code> (16 caractères minimum, par exemple le
          résultat de <code>openssl rand -base64 32</code>) à la stack puis redémarrer l’API, ou
          passer les identifiants directement en variables d’environnement — leur nom est indiqué
          sous chaque champ.
        </p>
      )}
      <p>
        Une variable d’environnement <strong>l’emporte toujours</strong> sur l’écran : le champ
        correspondant est alors verrouillé. Changer <code>SECRETS_KEY</code> rend illisibles les
        secrets déjà enregistrés, qui sont à ressaisir.
      </p>
    </CardContent>
  </Card>
);

const fieldPlaceholder = (field: CredentialFieldView, secretsKeyConfigured: boolean): string => {
  if (field.source === 'env') return `Défini par ${field.envVar}`;
  if (field.unreadable) return 'Illisible (SECRETS_KEY a changé) : à ressaisir';
  if (field.secret && field.source === 'app') return '•••••••• (enregistré)';
  if (field.secret && !secretsKeyConfigured) return 'SECRETS_KEY requise';
  return field.optional ? 'Facultatif' : '';
};

/**
 * Une source de l'export.
 *
 * Les identifiants s'éditent **localement jusqu'à l'enregistrement**, comme la semaine
 * type du planning, et seuls les champs touchés partent : un secret laissé vide est
 * conservé, exactement comme le jeton Home Assistant d'à côté.
 */
const ProviderCard = ({
  integration,
  secretsKeyConfigured,
}: {
  integration: IntegrationView;
  secretsKeyConfigured: boolean;
}) => {
  const update = useUpdateIntegration();
  const collect = useCollectIntegration();
  const privacy = usePrivacy();
  const [draft, setDraft] = useState<Record<string, string>>({});

  const status = integrationStatus(integration);
  const badge = STATUS_BADGES[status];
  const dirty = Object.keys(draft).length > 0;
  const previewMasked = PREVIEW_MASKS[integration.id].some((target) => privacy.isMasked(target));
  const localHint = LOCAL_SOURCE_HINTS[integration.id];

  const save = () => {
    const credentials: Record<string, string | null> = {};
    for (const field of integration.fields) {
      if (!(field.key in draft)) continue;
      const value = draft[field.key] ?? '';
      // Un secret vide veut dire « je n'y touche pas », pas « efface-le ».
      if (field.secret && value === '') continue;
      credentials[field.key] = value === '' ? null : value;
    }
    update.mutate(
      { provider: integration.id, input: { credentials } },
      { onSuccess: () => setDraft({}) },
    );
  };

  return (
    <Card className={cn(!integration.enabled && 'opacity-70')}>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <CardTitle className="flex flex-wrap items-center gap-2">
              {integration.label}
              <Badge variant={badge.variant}>{badge.label}</Badge>
            </CardTitle>
            <CardDescription>{integration.description}</CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Label htmlFor={`enabled-${integration.id}`} className="text-xs font-normal">
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
      </CardHeader>

      <CardContent className="space-y-4">
        {integration.kind === 'local' && localHint && (
          <p className="text-sm text-muted-foreground">
            {integration.configured ? localHint.ok : localHint.empty}
            {integration.lastUpdate && <> Dernier relevé {relative(integration.lastUpdate)}.</>}
          </p>
        )}

        {integration.fields.length > 0 && (
          <div className="space-y-3">
            {integration.fields.map((field) => {
              const locked = field.source === 'env' || (field.secret && !secretsKeyConfigured);
              const id = `${integration.id}-${field.key}`;
              return (
                <div key={field.key} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Label htmlFor={id}>{field.label}</Label>
                    {field.unreadable && <Badge variant="negative">illisible</Badge>}
                    {field.source === 'app' && !locked && (
                      <button
                        type="button"
                        className="ml-auto text-xs text-muted-foreground underline-offset-2 hover:underline"
                        onClick={() =>
                          update.mutate({
                            provider: integration.id,
                            input: { credentials: { [field.key]: null } },
                          })
                        }
                      >
                        Effacer
                      </button>
                    )}
                  </div>
                  <Input
                    id={id}
                    type={field.secret ? 'password' : 'text'}
                    autoComplete="off"
                    disabled={locked}
                    value={
                      field.key in draft
                        ? (draft[field.key] ?? '')
                        : field.secret
                          ? ''
                          : (field.value ?? '')
                    }
                    placeholder={fieldPlaceholder(field, secretsKeyConfigured)}
                    onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    {field.hint && <>{field.hint} </>}
                    Variable : <code>{field.envVar}</code>
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {integration.requiresBrowser && (
          <p className="text-xs text-muted-foreground">
            Lu dans un navigateur sans interface côté serveur : une vingtaine de secondes par
            collecte, et sensible à tout changement du site.
          </p>
        )}

        {integration.kind === 'remote' && (
          <div className="space-y-1 text-sm">
            {integration.lastUpdate && (
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

        <div className="flex flex-wrap gap-2">
          {dirty && (
            <>
              <Button size="sm" disabled={update.isPending} onClick={save}>
                {update.isPending ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDraft({})}>
                Annuler
              </Button>
            </>
          )}
          {integration.kind === 'remote' && (
            <Button
              variant="outline"
              size="sm"
              disabled={
                !integration.configured || !integration.enabled || dirty || collect.isPending
              }
              onClick={() => collect.mutate(integration.id)}
              title={dirty ? 'Enregistre d’abord les identifiants' : undefined}
            >
              <RefreshCw className={cn('h-4 w-4', collect.isPending && 'animate-spin')} />
              {collect.isPending ? 'Collecte…' : 'Collecter maintenant'}
            </Button>
          )}
        </div>

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
      </CardContent>
    </Card>
  );
};
