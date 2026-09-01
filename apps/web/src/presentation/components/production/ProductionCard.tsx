import { Link } from 'react-router-dom';
import { CalendarClock, ChevronDown, ChevronUp, Gift, Handshake, Pause, Radio } from 'lucide-react';
import type { Production } from '../../../domain/production/entities/Production.ts';
import { STATUS_COLORS, STATUS_LABELS } from '../../../domain/production/entities/Production.ts';
import type { ProductionStep } from '../../../domain/production/entities/ProductionStep.ts';
import { formatDate, formatMoney } from '../../../shared/format.ts';
import { Badge } from '../ui/badge.tsx';
import { Button } from '../ui/button.tsx';
import { Card } from '../ui/card.tsx';
import { StepChips, StepProgress } from './StepChips.tsx';
import { cn } from '../../../shared/cn.ts';

interface ProductionCardProps {
  production: Production;
  steps: ProductionStep[];
  onToggleStep: (stepId: string, checked: boolean) => void;
  /** `null` quand la carte est en tête ou en queue : le bouton disparaît. */
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  /** Mise en avant de la prochaine vidéo à travailler. */
  highlighted?: boolean;
}

const days = (from: string): number =>
  Math.round((Date.parse(`${from}T00:00:00Z`) - Date.now()) / 86_400_000);

/** « dans 3 jours », « aujourd'hui », « il y a 2 jours » — plus lisible qu'une date seule. */
const relativeDay = (date: string): string => {
  const delta = days(date);
  if (delta === 0) return "aujourd'hui";
  if (delta === 1) return 'demain';
  if (delta === -1) return 'hier';
  return delta > 0 ? `dans ${delta} jours` : `il y a ${-delta} jours`;
};

/**
 * Une ligne de la file d'attente.
 *
 * Tout ce qui sert à décider si c'est bien celle-ci qu'on attaque maintenant tient sur
 * la carte : l'avancement, la date visée, ce qui bloque, et l'argent déjà engagé. La
 * fiche ne s'ouvre que quand on a décidé.
 */
export const ProductionCard = ({
  production,
  steps,
  onToggleStep,
  onMoveUp,
  onMoveDown,
  highlighted,
}: ProductionCardProps) => {
  const late =
    production.plannedDate !== null &&
    days(production.plannedDate) < 0 &&
    production.status !== 'done';

  return (
    <Card
      className={cn(
        'flex gap-3 p-4 transition-colors',
        highlighted && 'border-[var(--positive)]/50 bg-[var(--positive)]/5',
      )}
    >
      {/* L'ordre de la file est entièrement manuel : deux flèches, pas de tri déduit. */}
      <div className="flex flex-col justify-center gap-0.5">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          disabled={!onMoveUp}
          onClick={onMoveUp}
          title="Remonter dans la file"
        >
          <ChevronUp className="h-3.5 w-3.5" />
          <span className="sr-only">Remonter</span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          disabled={!onMoveDown}
          onClick={onMoveDown}
          title="Descendre dans la file"
        >
          <ChevronDown className="h-3.5 w-3.5" />
          <span className="sr-only">Descendre</span>
        </Button>
      </div>

      <div className="min-w-0 flex-1 space-y-2.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <Link
              to={`/production/${production.id}`}
              className="font-medium hover:underline"
              title={production.title}
            >
              <span className="line-clamp-1">{production.title}</span>
            </Link>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Radio className="h-3 w-3" aria-hidden />
                {production.channelName ?? 'Chaîne à décider'}
              </span>
              {production.plannedDate && (
                <span className={cn('flex items-center gap-1', late && 'text-[var(--negative)]')}>
                  <CalendarClock className="h-3 w-3" aria-hidden />
                  {formatDate(production.plannedDate)} · {relativeDay(production.plannedDate)}
                </span>
              )}
              {production.nextSlotDate && (
                <span className="flex items-center gap-1">
                  Créneau {relativeDay(production.nextSlotDate)}
                </span>
              )}
            </div>
          </div>

          <Badge
            variant="outline"
            style={{ color: STATUS_COLORS[production.status] }}
            className="shrink-0"
          >
            {STATUS_LABELS[production.status]}
          </Badge>
        </div>

        {production.status === 'paused' && (
          <p className="flex items-start gap-1.5 rounded-md bg-muted px-2 py-1.5 text-xs text-muted-foreground">
            <Pause className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            {production.pausedReason ?? 'En pause, sans raison notée'}
          </p>
        )}

        <StepChips production={production} steps={steps} onToggle={onToggleStep} />
        <StepProgress production={production} steps={steps} />

        {(production.productsCount > 0 || production.sponsorshipsCount > 0) && (
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {production.productsCount > 0 && (
              <span className="flex items-center gap-1">
                <Gift className="h-3 w-3" aria-hidden />
                {production.productsCount} produit(s)
                {production.productsPendingCount > 0 && (
                  <span className="text-[var(--expense)]">
                    · {production.productsPendingCount} en attente
                  </span>
                )}
              </span>
            )}
            {production.sponsorshipsCount > 0 && (
              <span className="flex items-center gap-1">
                <Handshake className="h-3 w-3" aria-hidden />
                {production.sponsorshipsCount} sponso(s)
                {production.sponsorshipsPendingCents > 0 && (
                  <span className="text-[var(--positive)]">
                    · {formatMoney(production.sponsorshipsPendingCents)} à encaisser
                  </span>
                )}
              </span>
            )}
          </div>
        )}
      </div>
    </Card>
  );
};
