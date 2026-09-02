import { Link } from 'react-router-dom';
import { ArrowRight, Clapperboard, Gift, Handshake } from 'lucide-react';
import type { Production } from '../../../domain/production/entities/Production.ts';
import {
  STATUS_COLORS,
  STATUS_LABELS,
  partnerCounts,
  stepProgress,
} from '../../../domain/production/entities/Production.ts';
import { formatDate, formatMoney } from '../../../shared/format.ts';
import { Card, CardHeader, CardTitle } from '../ui/card.tsx';

/** Au-delà, l'encart cesse d'être un aperçu : la file complète est sur /production. */
const MAX_ROWS = 6;

interface ProductionQueueCardProps {
  productions: Production[];
  totalSteps: number;
  title?: string;
}

/**
 * Aperçu de la file d'attente, pour les écrans qui ne sont pas /production.
 *
 * Il porte ce qui se lit en un regard — avancement, chaîne, date visée, partenaires
 * rattachés — et rien de ce qui se manipule : réordonner ou cocher une étape se fait
 * là où vit la file. Un aperçu qu'on peut modifier finit par diverger de l'écran qui
 * en est propriétaire.
 */
export const ProductionQueueCard = ({
  productions,
  totalSteps,
  title = 'Vidéos en production',
}: ProductionQueueCardProps) => {
  const shown = productions.slice(0, MAX_ROWS);
  const hidden = productions.length - shown.length;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle>{title}</CardTitle>
        <Link
          to="/production"
          className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          Tout voir
          <ArrowRight className="h-3 w-3" aria-hidden />
        </Link>
      </CardHeader>

      {shown.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-muted-foreground">
          Aucune vidéo en cours. Elles apparaîtront ici dès qu'une production sera lancée.
        </p>
      ) : (
        <div className="divide-y divide-border border-t border-border">
          {shown.map((production) => {
            const counts = partnerCounts(production);
            const progress = Math.round(stepProgress(production, totalSteps) * 100);
            return (
              <Link
                key={production.id}
                to={`/production/${production.id}`}
                className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-muted/60"
              >
                <span
                  className="h-8 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: production.channelColor ?? 'var(--muted-foreground)' }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{production.title}</span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span style={{ color: STATUS_COLORS[production.status] }}>
                      {STATUS_LABELS[production.status]}
                    </span>
                    {production.plannedDate && <span>· {formatDate(production.plannedDate)}</span>}
                    {/* Un compteur dit combien : les fiches disent lesquels. */}
                    {counts.products > 0 && (
                      <span className="flex items-center gap-0.5">
                        <Gift className="h-3 w-3" aria-hidden />
                        {counts.products}
                      </span>
                    )}
                    {counts.sponsorships > 0 && (
                      <span className="flex items-center gap-0.5">
                        <Handshake className="h-3 w-3" aria-hidden />
                        {counts.sponsorshipsPendingCents > 0
                          ? formatMoney(counts.sponsorshipsPendingCents)
                          : counts.sponsorships}
                      </span>
                    )}
                  </span>
                </span>
                <span className="shrink-0 text-xs tabular text-muted-foreground">{progress} %</span>
              </Link>
            );
          })}
        </div>
      )}

      {hidden > 0 && (
        <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
          et {hidden} autre(s) vidéo(s) dans la file.
        </p>
      )}

      {shown.length === 0 && (
        <p className="flex items-center gap-1.5 border-t border-border px-4 py-2 text-xs text-muted-foreground">
          <Clapperboard className="h-3 w-3" aria-hidden />
          La file d'attente se pilote depuis l'onglet Production.
        </p>
      )}
    </Card>
  );
};
