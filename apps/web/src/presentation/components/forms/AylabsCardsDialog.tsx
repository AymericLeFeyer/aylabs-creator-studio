import { ExternalLink } from 'lucide-react';
import { useAylabsCardsProposal } from '../../../application/production/usecases/useProductions.ts';
import { productCardUrl, videoCardUrl } from '../../../domain/aylabs/services/contentStudioUrl.ts';
import type { Production } from '../../../domain/production/entities/Production.ts';
import { Button } from '../ui/button.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog.tsx';

const Row = ({
  title,
  details,
  url,
  label,
}: {
  title: string;
  details: string[];
  url: string;
  label: string;
}) => (
  <div className="flex items-center gap-3 rounded-lg border border-border p-3">
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-medium">{title}</p>
      <p className="truncate text-xs text-muted-foreground">
        {details.filter(Boolean).join(' · ')}
      </p>
    </div>
    <Button size="sm" asChild>
      <a href={url} target="_blank" rel="noreferrer">
        <ExternalLink className="h-4 w-4" />
        {label}
      </a>
    </Button>
  </div>
);

interface AylabsCardsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  production: Production;
}

/**
 * Les fiches du site aylabs.fr d'une vidéo publiée : ce que le studio sait est passé par
 * l'URL à l'Aylabs Content Studio, qui ouvre l'éditeur prérempli. Rien n'est écrit ici, et
 * c'est là-bas qu'on complète (image, avantages, verdict) et qu'on commite.
 */
export const AylabsCardsDialog = ({ open, onOpenChange, production }: AylabsCardsDialogProps) => {
  const { data, isLoading, error } = useAylabsCardsProposal(production.id, open);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Créer les fiches sur aylabs.fr</DialogTitle>
          <DialogDescription>
            Chaque bouton ouvre l'Aylabs Content Studio avec la fiche préremplie, à terminer là-bas.
          </DialogDescription>
        </DialogHeader>
        {isLoading && <p className="text-sm text-muted-foreground">Préparation des fiches…</p>}
        {error && (
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : 'Préparation impossible'}
          </p>
        )}
        {data && (
          <div className="space-y-2">
            <Row
              title={data.video.title}
              details={[data.video.pubDate, data.video.duration, data.video.code]}
              url={videoCardUrl(data.video)}
              label="Fiche vidéo"
            />
            {data.products.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Aucun produit n'est rattaché à cette vidéo.
              </p>
            )}
            {data.products.map((product) => (
              <Row
                key={product.sourceId}
                title={product.title}
                details={[product.price !== null ? `${product.price} €` : '', product.category]}
                url={productCardUrl(product)}
                label="Fiche produit"
              />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
