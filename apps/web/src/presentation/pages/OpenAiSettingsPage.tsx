import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  useThumbnailSettings,
  useUpdateThumbnailSettings,
} from '../../application/thumbnail/usecases/useThumbnails.ts';
import {
  THUMBNAIL_MODELS,
  THUMBNAIL_QUALITIES,
  type ThumbnailQuality,
  type ThumbnailSettingsView,
} from '../../domain/thumbnail/entities/Thumbnail.ts';
import { Button } from '../components/ui/button.tsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card.tsx';
import { Input } from '../components/ui/input.tsx';
import { Label } from '../components/ui/label.tsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select.tsx';

const keyPlaceholder = (view: ThumbnailSettingsView): string => {
  if (view.keySource === 'env') return 'Définie par OPENAI_API_KEY';
  if (view.keySource === 'unreadable') return 'Illisible (SECRETS_KEY a changé) : à ressaisir';
  if (view.keySource === 'app') return '•••••••• (enregistrée)';
  return view.secretsKeyConfigured ? 'sk-…' : 'SECRETS_KEY requise';
};

const Form = ({ view }: { view: ThumbnailSettingsView }) => {
  const update = useUpdateThumbnailSettings();
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(view.model);
  const [quality, setQuality] = useState(view.quality);
  const locked = view.keySource === 'env' || !view.secretsKeyConfigured;

  const save = () =>
    update.mutate(
      // Une clé laissée vide veut dire « je n'y touche pas », pas « efface-la ».
      { model, quality, ...(apiKey ? { apiKey } : {}) },
      { onSuccess: () => setApiKey('') },
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle>ChatGPT (OpenAI)</CardTitle>
        <CardDescription>
          Sert à générer les miniatures. Une clé API se crée sur la plateforme d’OpenAI et se
          facture à part de l’abonnement ChatGPT. Les images et le script d’une vidéo ne partent
          chez OpenAI qu’au clic sur « Générer ».
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="openai-key">Clé API</Label>
            <Input
              id="openai-key"
              type="password"
              autoComplete="off"
              disabled={locked}
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={keyPlaceholder(view)}
            />
            {view.keySource === 'app' && (
              <button
                type="button"
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                onClick={() => update.mutate({ apiKey: null })}
              >
                Effacer la clé
              </button>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="openai-model">Modèle</Label>
            <Input
              id="openai-model"
              list="openai-models"
              value={model}
              onChange={(event) => setModel(event.target.value)}
            />
            <datalist id="openai-models">
              {THUMBNAIL_MODELS.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label>Qualité</Label>
            <Select
              value={quality}
              onValueChange={(value) => setQuality(value as ThumbnailQuality)}
            >
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
        {!view.secretsKeyConfigured && view.keySource !== 'env' && (
          <p className="text-xs text-muted-foreground">
            <code>SECRETS_KEY</code> n’est pas définie côté serveur : la clé ne peut pas être
            enregistrée depuis l’écran. Ajoute-la à la stack, ou passe par{' '}
            <code>OPENAI_API_KEY</code>.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={save} disabled={update.isPending}>
            {update.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Enregistrer
          </Button>
          <span className="text-sm text-muted-foreground">
            {view.configured
              ? 'OpenAI est connecté.'
              : 'Aucune clé : la génération est désactivée.'}
          </span>
          {update.error && <span className="text-sm text-destructive">{update.error.message}</span>}
        </div>
      </CardContent>
    </Card>
  );
};

/** Paramètres → API → OpenAI. */
export const OpenAiSettingsPage = () => {
  const { data } = useThumbnailSettings();
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">OpenAI</h2>
        <p className="text-sm text-muted-foreground">La clé qui génère les miniatures.</p>
      </div>
      {data ? <Form view={data} /> : <p className="text-sm text-muted-foreground">Chargement…</p>}
    </div>
  );
};
