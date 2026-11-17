import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useUpdateAiSettings } from '../../../application/ai/usecases/useAi.ts';
import { AI_PROVIDERS, type AiProviderView } from '../../../domain/ai/entities/Ai.ts';
import { Badge } from '../ui/badge.tsx';
import { Button } from '../ui/button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card.tsx';
import { Input } from '../ui/input.tsx';
import { Label } from '../ui/label.tsx';
import { CreditBlock } from './CreditBlock.tsx';
import { AdminKeyField, ThumbnailSettingsBlock } from './OpenAiExtras.tsx';

const keyPlaceholder = (view: AiProviderView, secretsKeyConfigured: boolean): string => {
  const { keyExample } = AI_PROVIDERS[view.provider];
  if (view.keySource === 'env') return `Définie par ${view.envKey}`;
  if (view.keySource === 'unreadable') return 'Illisible (SECRETS_KEY a changé) : à ressaisir';
  if (view.keySource === 'app') return '•••••••• (enregistrée)';
  if (view.keySource === 'shared') return 'Clé des miniatures (déjà saisie)';
  return secretsKeyConfigured ? keyExample : 'SECRETS_KEY requise';
};

/** Un fournisseur : sa clé, son modèle, ses crédits — et ce qui lui est propre. */
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
  const meta = AI_PROVIDERS[view.provider];
  const locked = view.keySource === 'env' || !secretsKeyConfigured;

  const save = () =>
    update.mutate(
      // Une clé laissée vide veut dire « je n'y touche pas », pas « efface-la ».
      { provider: view.provider, model, ...(apiKey ? { apiKey } : {}) },
      { onSuccess: () => setApiKey('') },
    );

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>{meta.label}</CardTitle>
        <div className="flex items-center gap-1.5">
          {isDefault && <Badge variant="outline">Par défaut</Badge>}
          <Badge variant={view.configured ? 'positive' : 'secondary'}>
            {view.configured ? 'Prêt' : 'Pas de clé'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
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
            {view.provider === 'openai' && view.keySource === 'shared' && (
              <p className="text-xs text-muted-foreground">
                Une seule clé OpenAI sert au texte et aux images : celle déjà saisie pour les
                miniatures est réutilisée.
              </p>
            )}
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
        {!secretsKeyConfigured && view.keySource !== 'env' && (
          <p className="text-xs text-muted-foreground">
            <code>SECRETS_KEY</code> n’est pas définie côté serveur : la clé ne peut pas être
            enregistrée depuis l’écran. Ajoute-la à la stack, ou passe par{' '}
            <code>{view.envKey}</code>.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={save} disabled={update.isPending}>
            {update.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Enregistrer
          </Button>
          {update.error && <span className="text-sm text-destructive">{update.error.message}</span>}
        </div>

        {view.configured && <CreditBlock view={view} />}
        {view.provider === 'openai' && (
          <>
            <AdminKeyField view={view} secretsKeyConfigured={secretsKeyConfigured} />
            {view.configured && <ThumbnailSettingsBlock />}
          </>
        )}
      </CardContent>
    </Card>
  );
};
