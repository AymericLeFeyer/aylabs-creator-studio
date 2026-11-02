import { useRef, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Plus, X } from 'lucide-react';
import {
  useAddThumbnailAsset,
  useDeleteThumbnailAsset,
  useThumbnailAssets,
  useThumbnailSettings,
  useUpdateThumbnailSettings,
} from '../../application/thumbnail/usecases/useThumbnails.ts';
import { thumbnailAssetUrl } from '../../domain/thumbnail/entities/Thumbnail.ts';
import { prepareImage } from '../components/thumbnails/prepareImage.ts';
import { Button } from '../components/ui/button.tsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card.tsx';
import { Textarea } from '../components/ui/input.tsx';

const GeneralPrompt = ({ initial }: { initial: string }) => {
  const update = useUpdateThumbnailSettings();
  const [value, setValue] = useState(initial);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Prompt général</CardTitle>
        <CardDescription>
          Ajouté à chaque génération : ton style, tes couleurs, ce que tu veux toujours ou jamais.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          rows={7}
          maxLength={8000}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Style très contrasté, fond sombre, peu de texte, expression marquée…"
        />
        <div className="flex items-center gap-2">
          <Button
            onClick={() => update.mutate({ generalPrompt: value })}
            disabled={update.isPending || value === initial}
          >
            Enregistrer
          </Button>
          {update.error && <span className="text-sm text-destructive">{update.error.message}</span>}
        </div>
      </CardContent>
    </Card>
  );
};

const Bank = () => {
  const { data: assets = [] } = useThumbnailAssets();
  const add = useAddThumbnailAsset();
  const remove = useDeleteThumbnailAsset();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = '';
    setBusy(true);
    setError(null);
    try {
      for (const file of files) {
        await add.mutateAsync({ label: file.name, image: await prepareImage(file) });
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'L’envoi a échoué.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Banque d’images</CardTitle>
        <CardDescription>
          Des photos de ta tête, plusieurs angles et expressions. Toutes sont proposées à chaque
          génération, et tu peux en écarter avant de lancer.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
          {assets.map((asset) => (
            <div key={asset.id} className="group relative aspect-square">
              <img
                src={thumbnailAssetUrl(asset.id)}
                alt={asset.label}
                className="h-full w-full rounded-md border object-cover"
              />
              <button
                type="button"
                aria-label={`Retirer ${asset.label}`}
                className="absolute right-1 top-1 rounded-full bg-background/90 p-1 shadow-sm"
                onClick={() => remove.mutate(asset.id)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            className="flex aspect-square items-center justify-center rounded-md border border-dashed text-muted-foreground hover:bg-muted"
            aria-label="Ajouter des images"
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
          </button>
        </div>
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(event) => void upload(event)}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
};

/** Paramètres → Production → Miniatures. */
export const ThumbnailSettingsPage = () => {
  const { data } = useThumbnailSettings();
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Miniatures</h2>
        <p className="text-sm text-muted-foreground">
          Ce qui sert à toutes les générations.
          {data && !data.configured && (
            <>
              {' '}
              La clé se renseigne dans{' '}
              <Link to="/parametres?onglet=openai" className="underline underline-offset-2">
                API → OpenAI
              </Link>
              .
            </>
          )}
        </p>
      </div>
      <Bank />
      {data && <GeneralPrompt key={data.generalPrompt} initial={data.generalPrompt} />}
    </div>
  );
};
