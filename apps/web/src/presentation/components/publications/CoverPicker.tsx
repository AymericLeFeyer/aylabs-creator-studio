import { useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { useThumbnails } from '../../../application/thumbnail/usecases/useThumbnails.ts';
import type { CoverSource } from '../../../domain/postDraft/entities/PostDraft.ts';
import { thumbnailUrl } from '../../../domain/thumbnail/entities/Thumbnail.ts';
import { cn } from '../../../shared/cn.ts';

/** Ce que le formulaire retient : la source à envoyer, et de quoi l'afficher. */
export interface PickedCover {
  /** `null` : la couverture déjà posée, gardée telle quelle. */
  source: CoverSource | null;
  previewUrl: string;
}

/** Un short est vertical : 1080 × 1920 au plus. */
const MAX_WIDTH = 1080;
const MAX_HEIGHT = 1920;
/** YouTube refuse une miniature de plus de 2 Mo (Instagram en admet 8). */
const MAX_BYTES = 2 * 1024 ** 2;

/**
 * Ramène une image en JPEG (le seul format qu'Instagram admet en couverture) de 1 080 ×
 * 1 920 au plus, en baissant la qualité jusqu'à tenir sous 2 Mo.
 */
const toJpegDataUrl = async (file: File): Promise<string> => {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_WIDTH / bitmap.width, MAX_HEIGHT / bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  let url = '';
  for (const quality of [0.9, 0.8, 0.7, 0.6, 0.5]) {
    url = canvas.toDataURL('image/jpeg', quality);
    // base64 : 4 caractères pour 3 octets.
    if ((url.length - url.indexOf(',') - 1) * 0.75 <= MAX_BYTES) break;
  }
  return url;
};

/**
 * La couverture d'un short — miniature YouTube et couverture Instagram : une miniature de
 * Production → Miniatures (celles de la vidéo d'origine et les 9:16 d'abord), ou une image
 * importée. Un clic sur la sélection la retire.
 */
export const CoverPicker = ({
  value,
  onChange,
  productionId,
}: {
  value: PickedCover | null;
  onChange: (value: PickedCover | null) => void;
  productionId: string | null;
}) => {
  const { data: thumbnails = [] } = useThumbnails(null);
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const rank = (thumbnail: (typeof thumbnails)[number]) =>
    (productionId && thumbnail.productionId === productionId ? 0 : 2) +
    (thumbnail.format === '9:16' ? 0 : 1);
  const choices = [...thumbnails].sort((a, b) => rank(a) - rank(b)).slice(0, 12);
  const selectedId =
    value?.source && 'thumbnailId' in value.source ? value.source.thumbnailId : null;
  const own = value && !selectedId ? value : null;

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const image = await toJpegDataUrl(file);
      onChange({ source: { image }, previewUrl: image });
    } catch {
      setError('Image illisible');
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {own && (
          <button
            type="button"
            title="Retirer cette couverture"
            onClick={() => onChange(null)}
            className="relative h-24 overflow-hidden rounded-md ring-2 ring-primary"
          >
            <img src={own.previewUrl} alt="" className="h-full w-auto" />
            <X className="absolute right-1 top-1 h-4 w-4 rounded-full bg-background/80 p-0.5" />
          </button>
        )}
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            void importFile(event.dataTransfer.files[0]);
          }}
          className="flex h-24 w-16 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-[10px] text-muted-foreground hover:border-primary hover:text-foreground"
        >
          <ImagePlus className="h-4 w-4" />
          Importer
        </button>
        {choices.map((thumbnail) => {
          const selected = thumbnail.id === selectedId;
          return (
            <button
              key={thumbnail.id}
              type="button"
              title={thumbnail.title ?? 'Miniature générée'}
              onClick={() =>
                onChange(
                  selected
                    ? null
                    : {
                        source: { thumbnailId: thumbnail.id },
                        previewUrl: thumbnailUrl(thumbnail.id),
                      },
                )
              }
              className={cn(
                'h-24 overflow-hidden rounded-md border border-border',
                selected && 'ring-2 ring-primary',
              )}
            >
              <img
                src={thumbnailUrl(thumbnail.id)}
                alt=""
                loading="lazy"
                className="h-full w-auto"
              />
            </button>
          );
        })}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          void importFile(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
};
