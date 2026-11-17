import { useRef, useState, type ChangeEvent } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import {
  useRemoveWorkspaceImage,
  useSetWorkspaceImage,
  useThumbnailWorkspace,
} from '../../../application/thumbnail/usecases/useThumbnails.ts';
import {
  WORKSPACE_SLOTS,
  workspaceImageUrl,
  type WorkspaceSlot,
} from '../../../domain/thumbnail/entities/Thumbnail.ts';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card.tsx';
import { prepareImage } from './prepareImage.ts';

/**
 * L'espace de travail d'une vidéo : sa tête et la photo du produit. Les deux images sont
 * **envoyées par défaut** à chaque génération de miniature de cette vidéo (avec leur rôle
 * dans le prompt) ; elles restent sur la vidéo, à portée de main d'une génération à l'autre.
 */
export const WorkspaceCard = ({ productionId }: { productionId: string }) => {
  const { data: workspace } = useThumbnailWorkspace(productionId);
  const set = useSetWorkspaceImage(productionId);
  const remove = useRemoveWorkspaceImage(productionId);
  const [error, setError] = useState<string | null>(null);
  const inputs = useRef<Partial<Record<WorkspaceSlot, HTMLInputElement | null>>>({});

  const pick = async (slot: WorkspaceSlot, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(null);
    try {
      set.mutate({ slot, image: await prepareImage(file) });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Image illisible.');
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Espace de travail</CardTitle>
        <p className="text-xs text-muted-foreground">
          Envoyées par défaut pour générer la miniature de cette vidéo.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid grid-cols-2 gap-3">
          {WORKSPACE_SLOTS.map((slot) => {
            const entry = workspace?.[slot.id] ?? null;
            const busy =
              (set.isPending && set.variables?.slot === slot.id) ||
              (remove.isPending && remove.variables === slot.id);
            return (
              <div key={slot.id} className="space-y-1">
                <span className="text-xs font-medium">{slot.label}</span>
                <div className="relative aspect-square">
                  {entry ? (
                    <img
                      src={workspaceImageUrl(productionId, slot.id, entry.version)}
                      alt={slot.label}
                      className="h-full w-full rounded-md border bg-muted object-contain"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => inputs.current[slot.id]?.click()}
                      className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed px-2 text-center text-xs text-muted-foreground hover:bg-muted"
                    >
                      <ImagePlus className="h-5 w-5" />
                      {slot.hint}
                    </button>
                  )}
                  {entry && (
                    <>
                      <button
                        type="button"
                        aria-label={`Retirer : ${slot.label}`}
                        className="absolute right-1 top-1 rounded-full bg-background/90 p-1 shadow-sm"
                        onClick={() => remove.mutate(slot.id)}
                      >
                        <X className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        className="absolute inset-x-1 bottom-1 rounded bg-background/90 px-2 py-0.5 text-xs shadow-sm"
                        onClick={() => inputs.current[slot.id]?.click()}
                      >
                        Remplacer
                      </button>
                    </>
                  )}
                  {busy && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-md bg-background/60">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  )}
                  <input
                    ref={(element) => {
                      inputs.current[slot.id] = element;
                    }}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(event) => void pick(slot.id, event)}
                  />
                </div>
              </div>
            );
          })}
        </div>
        {(error || set.error) && (
          <p className="text-xs text-destructive">{error ?? set.error?.message}</p>
        )}
      </CardContent>
    </Card>
  );
};
