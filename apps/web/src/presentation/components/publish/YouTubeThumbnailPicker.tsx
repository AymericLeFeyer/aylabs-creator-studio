import { useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { useThumbnails } from '../../../application/thumbnail/usecases/useThumbnails.ts';
import type { YouTubeThumbnailSource } from '../../../domain/publish/entities/Publish.ts';
import { thumbnailUrl } from '../../../domain/thumbnail/entities/Thumbnail.ts';
import { cn } from '../../../shared/cn.ts';

/** Ce que l'écran retient : la source à envoyer, et de quoi l'afficher. */
export interface PickedThumbnail {
  source: YouTubeThumbnailSource;
  previewUrl: string;
}

/** YouTube recommande 1280 × 720 et refuse plus de 2 Mo. */
const MAX_WIDTH = 1280;
const MAX_HEIGHT = 1280;

/**
 * Ramène une image en JPEG (YouTube refuse le WebP) de 1 280 px au plus : une photo de
 * téléphone dépasserait sinon les 2 Mo.
 */
const toJpegDataUrl = async (file: File): Promise<string> => {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_WIDTH / bitmap.width, MAX_HEIGHT / bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.9);
};

/**
 * La miniature d'un envoi YouTube : une des dernières miniatures générées dans
 * Production → Miniatures, ou une image importée. Un clic sur la sélection la retire.
 */
export const YouTubeThumbnailPicker = ({
  value,
  onChange,
}: {
  value: PickedThumbnail | null;
  onChange: (value: PickedThumbnail | null) => void;
}) => {
  const { data: thumbnails = [] } = useThumbnails(null);
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const recent = thumbnails.slice(0, 11);
  const selectedId = value && 'thumbnailId' in value.source ? value.source.thumbnailId : null;
  const imported = value && 'image' in value.source ? value : null;

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
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">Miniature</span>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="inline-flex items-center gap-0.5 text-muted-foreground hover:text-foreground"
          >
            <X className="size-3" /> Aucune
          </button>
        )}
      </div>
      <div className="grid grid-cols-4 gap-1">
        <button
          type="button"
          onClick={() => input.current?.click()}
          className={cn(
            'flex aspect-video items-center justify-center overflow-hidden rounded border border-dashed text-muted-foreground hover:bg-muted/50',
            imported && 'ring-2 ring-primary',
          )}
          aria-label="Importer une image"
          title="Importer une image"
        >
          {imported ? (
            <img src={imported.previewUrl} alt="" className="size-full object-cover" />
          ) : (
            <ImagePlus className="size-4" />
          )}
        </button>
        {recent.map((thumbnail) => (
          <button
            key={thumbnail.id}
            type="button"
            title={thumbnail.title ?? 'Miniature générée'}
            onClick={() =>
              onChange(
                selectedId === thumbnail.id
                  ? null
                  : {
                      source: { thumbnailId: thumbnail.id },
                      previewUrl: thumbnailUrl(thumbnail.id),
                    },
              )
            }
            className={cn(
              'aspect-video overflow-hidden rounded border',
              selectedId === thumbnail.id && 'ring-2 ring-primary',
            )}
          >
            <img
              src={thumbnailUrl(thumbnail.id)}
              alt=""
              loading="lazy"
              className="size-full object-cover"
            />
          </button>
        ))}
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
      {error && <p className="text-xs text-[var(--negative)]">{error}</p>}
    </div>
  );
};
