import { Link } from 'react-router-dom';
import { ImagePlus } from 'lucide-react';
import { useThumbnails } from '../../../application/thumbnail/usecases/useThumbnails.ts';
import { Button } from '../ui/button.tsx';
import { Card, CardContent } from '../ui/card.tsx';
import { ThumbnailCard } from '../thumbnails/ThumbnailCard.tsx';

/**
 * L'onglet Miniatures d'une fiche : les miniatures **enregistrées** pour cette vidéo, la
 * plus récemment gardée d'abord. On les génère et on les enregistre depuis Production →
 * Miniatures (le bouton y ouvre l'écran sur cette vidéo) ; ici on les retrouve, on les
 * télécharge, on en retire. Pas de limite de nombre.
 */
export const ProductionThumbnailsPanel = ({ productionId }: { productionId: string }) => {
  const { data: thumbnails = [], isLoading } = useThumbnails(productionId, { saved: true });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Enregistrer une miniature coche l’étape « Miniature » de la vidéo.
        </p>
        <Button asChild variant="outline" size="sm">
          <Link to={`/miniatures?video=${productionId}`}>
            <ImagePlus className="h-4 w-4" />
            Générer une miniature
          </Link>
        </Button>
      </div>

      {!isLoading && thumbnails.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Aucune miniature enregistrée pour cette vidéo.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {thumbnails.map((thumbnail) => (
            <ThumbnailCard key={thumbnail.id} thumbnail={thumbnail} variant="saved" />
          ))}
        </div>
      )}
    </div>
  );
};
