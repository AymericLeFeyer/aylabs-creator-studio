import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAiSpend, useUpdateAiSettings } from '../../../application/ai/usecases/useAi.ts';
import {
  useThumbnailSettings,
  useUpdateThumbnailSettings,
} from '../../../application/thumbnail/usecases/useThumbnails.ts';
import type { AiProviderView } from '../../../domain/ai/entities/Ai.ts';
import {
  THUMBNAIL_MODELS,
  THUMBNAIL_QUALITIES,
  type ThumbnailQuality,
  type ThumbnailSettingsView,
} from '../../../domain/thumbnail/entities/Thumbnail.ts';
import { Button } from '../ui/button.tsx';
import { Input } from '../ui/input.tsx';
import { Label } from '../ui/label.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select.tsx';

const adminPlaceholder = (view: AiProviderView, secretsKeyConfigured: boolean): string => {
  if (view.adminKeySource === 'env') return 'Définie par OPENAI_ADMIN_KEY';
  if (view.adminKeySource === 'unreadable') return 'Illisible (SECRETS_KEY a changé) : à ressaisir';
  if (view.adminKeySource === 'app') return '•••••••• (enregistrée)';
  return secretsKeyConfigured ? 'sk-admin-…' : 'SECRETS_KEY requise';
};

/**
 * La clé admin d'OpenAI : la seule qui puisse lire la dépense réelle de l'organisation
 * (OpenAI n'a pas d'API de solde). Facultative.
 */
export const AdminKeyField = ({
  view,
  secretsKeyConfigured,
}: {
  view: AiProviderView;
  secretsKeyConfigured: boolean;
}) => {
  const update = useUpdateAiSettings();
  const spend = useAiSpend(view.adminKeySource !== null);
  const [adminKey, setAdminKey] = useState('');
  const locked = view.adminKeySource === 'env' || !secretsKeyConfigured;

  return (
    <div className="space-y-1.5 border-t pt-4">
      <Label htmlFor="ai-admin-key">Clé admin OpenAI (facultative)</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id="ai-admin-key"
          type="password"
          autoComplete="off"
          disabled={locked}
          value={adminKey}
          className="max-w-sm"
          onChange={(event) => setAdminKey(event.target.value)}
          placeholder={adminPlaceholder(view, secretsKeyConfigured)}
        />
        <Button
          variant="outline"
          disabled={!adminKey || update.isPending}
          onClick={() =>
            update.mutate({ provider: 'openai', adminKey }, { onSuccess: () => setAdminKey('') })
          }
        >
          Enregistrer
        </Button>
        {view.adminKeySource === 'app' && (
          <button
            type="button"
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => update.mutate({ provider: 'openai', adminKey: null })}
          >
            Effacer
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        OpenAI ne rend aucun solde par l’API. Avec une clé <em>admin</em> (créée dans les réglages
        de l’organisation), le studio lit la dépense réelle et en déduit ce qu’il reste du solde
        noté ci-dessous.
      </p>
      {spend.data?.error && <p className="text-xs text-destructive">{spend.data.error}</p>}
      {update.error && <p className="text-sm text-destructive">{update.error.message}</p>}
    </div>
  );
};

const ThumbnailForm = ({ view }: { view: ThumbnailSettingsView }) => {
  const update = useUpdateThumbnailSettings();
  const [model, setModel] = useState(view.model);
  const [quality, setQuality] = useState<ThumbnailQuality>(view.quality);

  return (
    <div className="space-y-3 border-t pt-4">
      <div>
        <h4 className="text-sm font-medium">Miniatures (images)</h4>
        <p className="text-xs text-muted-foreground">
          La même clé génère les miniatures. Les images et le script d’une vidéo ne partent chez
          OpenAI qu’au clic sur « Générer ».
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="thumb-model">Modèle d’image</Label>
          <Input
            id="thumb-model"
            list="thumb-models"
            value={model}
            onChange={(event) => setModel(event.target.value)}
          />
          <datalist id="thumb-models">
            {THUMBNAIL_MODELS.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </datalist>
        </div>
        <div className="space-y-1.5">
          <Label>Qualité</Label>
          <Select value={quality} onValueChange={(value) => setQuality(value as ThumbnailQuality)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {THUMBNAIL_QUALITIES.map((entry) => (
                <SelectItem key={entry.id} value={entry.id}>
                  {entry.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          disabled={update.isPending}
          onClick={() => update.mutate({ model, quality })}
        >
          {update.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Enregistrer
        </Button>
        {update.error && <span className="text-sm text-destructive">{update.error.message}</span>}
      </div>
    </div>
  );
};

export const ThumbnailSettingsBlock = () => {
  const { data } = useThumbnailSettings();
  return data ? <ThumbnailForm view={data} /> : null;
};
