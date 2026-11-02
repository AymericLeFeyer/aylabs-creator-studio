import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { Check, Download, ImagePlus, Loader2, Plus, Trash2, X } from 'lucide-react';
import { useProductions } from '../../application/production/usecases/useProductions.ts';
import {
  useDeleteThumbnail,
  useGenerateThumbnail,
  useThumbnailAssets,
  useThumbnails,
  useThumbnailSettings,
} from '../../application/thumbnail/usecases/useThumbnails.ts';
import {
  MAX_THUMBNAIL_IMAGES,
  THUMBNAIL_FORMATS,
  thumbnailAssetUrl,
  thumbnailUrl,
  type Thumbnail,
  type ThumbnailFormat,
} from '../../domain/thumbnail/entities/Thumbnail.ts';
import { cn } from '../../shared/cn.ts';
import { formatDateTime } from '../../shared/format.ts';
import { fromSelectValue, NONE, toSelectValue } from '../components/forms/selectNone.ts';
import { prepareImage } from '../components/thumbnails/prepareImage.ts';
import { Button } from '../components/ui/button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.tsx';
import { Textarea } from '../components/ui/input.tsx';
import { Label } from '../components/ui/label.tsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select.tsx';

const RATIO: Record<ThumbnailFormat, string> = {
  '16:9': 'aspect-video',
  '9:16': 'aspect-[9/16]',
};

const fileName = (thumbnail: Thumbnail): string => {
  const slug = (thumbnail.title ?? 'miniature')
    .normalize('NFD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase();
  return `${slug || 'miniature'}.jpg`;
};

const ThumbnailCard = ({ thumbnail }: { thumbnail: Thumbnail }) => {
  const remove = useDeleteThumbnail();
  const url = thumbnailUrl(thumbnail.id);
  return (
    <figure className="min-w-0 space-y-1.5">
      <a href={url} target="_blank" rel="noreferrer">
        <img
          src={url}
          alt={thumbnail.title ?? 'Miniature'}
          loading="lazy"
          className={cn('w-full rounded-md border object-cover', RATIO[thumbnail.format])}
        />
      </a>
      <figcaption className="flex items-start gap-1">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{thumbnail.title ?? 'Sans vidéo'}</p>
          <p className="text-xs text-muted-foreground">
            {thumbnail.format} · {formatDateTime(thumbnail.createdAt)}
          </p>
          {thumbnail.prompt && (
            <p className="truncate text-xs text-muted-foreground" title={thumbnail.prompt}>
              {thumbnail.prompt}
            </p>
          )}
        </div>
        <Button asChild variant="ghost" size="icon" aria-label="Télécharger">
          <a href={url} download={fileName(thumbnail)}>
            <Download className="h-4 w-4" />
          </a>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Supprimer"
          onClick={() => {
            if (window.confirm('Supprimer cette miniature ?')) remove.mutate(thumbnail.id);
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </figcaption>
    </figure>
  );
};

/**
 * Production → Miniatures : une vidéo, un format, des images, un prompt, et le résultat dans
 * l'historique à côté. Choisir une vidéo restreint l'historique à ses miniatures, pour
 * comparer les essais entre eux.
 */
export const ThumbnailsPage = () => {
  const { data: settings } = useThumbnailSettings();
  const { data: assets = [] } = useThumbnailAssets();
  const { data: productions = [] } = useProductions();
  const generate = useGenerateThumbnail();

  const [productionId, setProductionId] = useState<string | null>(null);
  const [format, setFormat] = useState<ThumbnailFormat>('16:9');
  const [prompt, setPrompt] = useState('');
  // On retient les **écartées** : une image ajoutée à la banque arrive cochée.
  const [excluded, setExcluded] = useState<string[]>([]);
  const [images, setImages] = useState<string[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const { data: thumbnails = [] } = useThumbnails(productionId);

  // Ce qui reste à sortir d'abord : c'est pour ces vidéos-là qu'on cherche une miniature.
  const videos = useMemo(
    () =>
      [...productions].sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done')),
    [productions],
  );

  const assetIds = assets.map((asset) => asset.id).filter((id) => !excluded.includes(id));
  const total = assetIds.length + images.length;
  const tooMany = total > MAX_THUMBNAIL_IMAGES;
  const ready =
    Boolean(settings?.configured) && !tooMany && (Boolean(productionId) || Boolean(prompt.trim()));

  const toggleAsset = (id: string) =>
    setExcluded((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );

  const addImages = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = '';
    setFileError(null);
    try {
      const prepared = await Promise.all(files.map(prepareImage));
      setImages((current) => [...current, ...prepared]);
    } catch (failure) {
      setFileError(failure instanceof Error ? failure.message : 'Image illisible.');
    }
  };

  const submit = () => generate.mutate({ productionId, format, prompt, assetIds, images });

  return (
    <div className="flex flex-col gap-4">
      <div className="hidden lg:block">
        <h1 className="text-lg font-semibold">Miniatures</h1>
        <p className="text-sm text-muted-foreground">
          Le titre et le script de la vidéo, ta banque d’images et ton prompt général.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <Card className="min-w-0 self-start">
          <CardHeader>
            <CardTitle>Nouvelle miniature</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {settings && !settings.configured && (
              <p className="text-sm text-muted-foreground">
                Pour générer, ajoute ta clé dans{' '}
                <Link to="/parametres?onglet=openai" className="underline underline-offset-2">
                  Paramètres → API → OpenAI
                </Link>
                .
              </p>
            )}

            <div className="space-y-1.5">
              <Label>Vidéo</Label>
              <Select
                value={toSelectValue(productionId)}
                onValueChange={(value) => setProductionId(fromSelectValue(value))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sans vidéo</SelectItem>
                  {videos.map((production) => (
                    <SelectItem key={production.id} value={production.id}>
                      {production.publishTitle || production.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Format</Label>
              <div className="grid grid-cols-2 gap-2">
                {THUMBNAIL_FORMATS.map((entry) => (
                  <Button
                    key={entry.id}
                    type="button"
                    variant={format === entry.id ? 'default' : 'outline'}
                    aria-pressed={format === entry.id}
                    onClick={() => setFormat(entry.id)}
                  >
                    {entry.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>
                Images ({total}/{MAX_THUMBNAIL_IMAGES})
              </Label>
              <div className="grid grid-cols-5 gap-1.5">
                {assets.map((asset) => {
                  const selected = !excluded.includes(asset.id);
                  return (
                    <button
                      key={asset.id}
                      type="button"
                      aria-pressed={selected}
                      aria-label={asset.label}
                      onClick={() => toggleAsset(asset.id)}
                      className="relative aspect-square"
                    >
                      <img
                        src={thumbnailAssetUrl(asset.id)}
                        alt=""
                        className={cn(
                          'h-full w-full rounded-md border object-cover',
                          selected ? 'ring-2 ring-primary' : 'opacity-40',
                        )}
                      />
                      {selected && (
                        <Check className="absolute right-0.5 top-0.5 h-4 w-4 rounded-full bg-primary p-0.5 text-primary-foreground" />
                      )}
                    </button>
                  );
                })}
                {images.map((image, index) => (
                  <div key={`${index}-${image.length}`} className="relative aspect-square">
                    <img
                      src={image}
                      alt=""
                      className="h-full w-full rounded-md border object-cover"
                    />
                    <button
                      type="button"
                      aria-label="Retirer l’image"
                      className="absolute right-0.5 top-0.5 rounded-full bg-background/90 p-0.5 shadow-sm"
                      onClick={() =>
                        setImages((current) => current.filter((_, rank) => rank !== index))
                      }
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  aria-label="Ajouter des images"
                  onClick={() => input.current?.click()}
                  className="flex aspect-square items-center justify-center rounded-md border border-dashed text-muted-foreground hover:bg-muted"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <input
                ref={input}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(event) => void addImages(event)}
              />
              {assets.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Ta banque est vide :{' '}
                  <Link to="/parametres?onglet=miniatures" className="underline underline-offset-2">
                    ajoute des photos de toi
                  </Link>
                  .
                </p>
              )}
              {tooMany && (
                <p className="text-xs text-destructive">
                  OpenAI accepte {MAX_THUMBNAIL_IMAGES} images au maximum : retires-en
                  quelques-unes.
                </p>
              )}
              {fileError && <p className="text-xs text-destructive">{fileError}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="thumbnail-prompt">Prompt personnalisé</Label>
              <Textarea
                id="thumbnail-prompt"
                rows={4}
                maxLength={8000}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Moi surpris à gauche, le produit en grand à droite…"
              />
            </div>

            <Button className="w-full" onClick={submit} disabled={!ready || generate.isPending}>
              {generate.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ImagePlus className="h-4 w-4" />
              )}
              {generate.isPending ? 'Génération…' : 'Générer'}
            </Button>
            {generate.error && <p className="text-sm text-destructive">{generate.error.message}</p>}
          </CardContent>
        </Card>

        <div className="min-w-0">
          {thumbnails.length === 0 && !generate.isPending ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {productionId
                ? 'Aucune miniature pour cette vidéo.'
                : 'Aucune miniature pour l’instant.'}
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {generate.isPending && (
                <div
                  className={cn(
                    'flex items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground',
                    RATIO[format],
                  )}
                >
                  Jusqu’à deux minutes…
                </div>
              )}
              {thumbnails.map((thumbnail) => (
                <ThumbnailCard key={thumbnail.id} thumbnail={thumbnail} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
