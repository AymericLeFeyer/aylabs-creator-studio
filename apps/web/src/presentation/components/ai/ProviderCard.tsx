import { useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import { useUpdateAiSettings } from '../../../application/ai/usecases/useAi.ts';
import { AI_PROVIDERS, type AiProviderView } from '../../../domain/ai/entities/Ai.ts';
import { cn } from '../../../shared/cn.ts';
import { Badge } from '../ui/badge.tsx';
import { Button } from '../ui/button.tsx';
import { Card, CardContent } from '../ui/card.tsx';
import { Input } from '../ui/input.tsx';
import { Label } from '../ui/label.tsx';
import { Switch } from '../ui/switch.tsx';
import { CreditGauge, CreditNoteForm } from './CreditBlock.tsx';
import { AdminKeyField, ThumbnailSettingsBlock } from './OpenAiExtras.tsx';

const keyPlaceholder = (view: AiProviderView, secretsKeyConfigured: boolean): string => {
  const { keyExample } = AI_PROVIDERS[view.provider];
  if (view.keySource === 'env') return `Définie par ${view.envKey}`;
  if (view.keySource === 'unreadable') return 'Illisible (SECRETS_KEY a changé) : à ressaisir';
  if (view.keySource === 'app') return '•••••••• (enregistrée)';
  if (view.keySource === 'shared') return 'Clé des miniatures (déjà saisie)';
  return secretsKeyConfigured ? keyExample : 'SECRETS_KEY requise';
};

const Avatar = ({ provider, muted }: { provider: AiProviderView['provider']; muted: boolean }) => (
  <span
    aria-hidden
    className={cn(
      'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-white transition-opacity',
      muted && 'opacity-40 grayscale',
    )}
    style={{ backgroundColor: AI_PROVIDERS[provider].accent }}
  >
    {AI_PROVIDERS[provider].short[0]}
  </span>
);

/** Un fournisseur : son interrupteur, sa clé, son modèle, sa jauge de crédits. */
export const ProviderCard = ({
  view,
  secretsKeyConfigured,
  isDefault,
}: {
  view: AiProviderView;
  secretsKeyConfigured: boolean;
  isDefault: boolean;
}) => {
  const update = useUpdateAiSettings();
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(view.model);
  const [advanced, setAdvanced] = useState(false);
  const meta = AI_PROVIDERS[view.provider];
  const locked = view.keySource === 'env' || !secretsKeyConfigured;
  const isOpenAi = view.provider === 'openai';

  const save = () =>
    update.mutate(
      // Une clé laissée vide veut dire « je n'y touche pas », pas « efface-la ».
      { provider: view.provider, model, ...(apiKey ? { apiKey } : {}) },
      { onSuccess: () => setApiKey('') },
    );

  return (
    <Card className={cn(!view.enabled && 'bg-muted/30')}>
      <CardContent className="space-y-5 p-5">
        <div className="flex items-center gap-3">
          <Avatar provider={view.provider} muted={!view.enabled} />
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-semibold leading-tight">{meta.label}</h3>
            <p className="truncate text-xs text-muted-foreground">{view.model}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {view.enabled && isDefault && <Badge variant="outline">Par défaut</Badge>}
            {view.enabled && (
              <Badge variant={view.configured ? 'positive' : 'secondary'}>
                {view.configured ? 'Prêt' : 'Pas de clé'}
              </Badge>
            )}
            <Switch
              aria-label={`Utiliser ${meta.label}`}
              checked={view.enabled}
              disabled={update.isPending}
              onCheckedChange={(enabled) => update.mutate({ provider: view.provider, enabled })}
            />
          </div>
        </div>

        {!view.enabled ? (
          <p className="text-sm text-muted-foreground">
            Désactivé : {meta.short} n’est proposé ni utilisé nulle part
            {isOpenAi ? ', miniatures comprises' : ''}. La clé et les réglages sont conservés.
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`key-${view.provider}`}>Clé API</Label>
                <Input
                  id={`key-${view.provider}`}
                  type="password"
                  autoComplete="off"
                  disabled={locked}
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder={keyPlaceholder(view, secretsKeyConfigured)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`model-${view.provider}`}>Modèle</Label>
                <Input
                  id={`model-${view.provider}`}
                  list={`models-${view.provider}`}
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                />
                <datalist id={`models-${view.provider}`}>
                  {meta.models.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.label}
                    </option>
                  ))}
                </datalist>
              </div>
            </div>

            <div className="-mt-1 flex flex-wrap items-center gap-3">
              <Button onClick={save} disabled={update.isPending}>
                {update.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Enregistrer
              </Button>
              {view.keySource === 'app' && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                  disabled={update.isPending}
                  onClick={() => update.mutate({ provider: view.provider, apiKey: null })}
                >
                  Effacer la clé
                </button>
              )}
            </div>
            {isOpenAi && view.keySource === 'shared' && (
              <p className="text-xs text-muted-foreground">
                Une seule clé OpenAI sert au texte et aux images : celle des miniatures est
                réutilisée.
              </p>
            )}
            {!secretsKeyConfigured && view.keySource !== 'env' && (
              <p className="text-xs text-muted-foreground">
                <code>SECRETS_KEY</code> n’est pas définie côté serveur : la clé ne peut pas être
                enregistrée depuis l’écran. Ajoute-la à la stack, ou passe par{' '}
                <code>{view.envKey}</code>.
              </p>
            )}
            {update.error && <p className="text-sm text-destructive">{update.error.message}</p>}

            {view.configured && <CreditGauge view={view} />}

            <div className="border-t pt-3">
              <button
                type="button"
                aria-expanded={advanced}
                onClick={() => setAdvanced((open) => !open)}
                className="flex w-full items-center justify-between text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                Réglages avancés
                <ChevronDown
                  className={cn('h-4 w-4 transition-transform', advanced && 'rotate-180')}
                />
              </button>
              {advanced && (
                <div className="mt-4 space-y-5">
                  <CreditNoteForm view={view} />
                  {isOpenAi && (
                    <>
                      <AdminKeyField view={view} secretsKeyConfigured={secretsKeyConfigured} />
                      {view.configured && <ThumbnailSettingsBlock />}
                    </>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
