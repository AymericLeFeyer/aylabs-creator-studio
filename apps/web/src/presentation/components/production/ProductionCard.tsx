import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Gift,
  Handshake,
  Pause,
  Play,
  Radio,
  Timer,
} from 'lucide-react';
import type { Production } from '../../../domain/production/entities/Production.ts';
import {
  partnerCounts,
  progressCounts,
  STATUS_COLORS,
  STATUS_LABELS,
} from '../../../domain/production/entities/Production.ts';
import {
  PENDING_PRODUCT_STATUSES,
  PRODUCT_STATUS_LABELS,
} from '../../../domain/product/entities/Product.ts';
import {
  PENDING_SPONSORSHIP_STATUSES,
  SPONSORSHIP_STATUS_LABELS,
} from '../../../domain/sponsorship/entities/Sponsorship.ts';
import type { ProductionStep } from '../../../domain/production/entities/ProductionStep.ts';
import { formatDuration } from '../../../domain/production/entities/TimeEntry.ts';
import { formatDate, formatMoney } from '../../../shared/format.ts';
import { Badge } from '../ui/badge.tsx';
import { Button } from '../ui/button.tsx';
import { Card } from '../ui/card.tsx';
import { StepChips, StepProgress } from './StepChips.tsx';
import { PartnerHoverList } from './PartnerHoverList.tsx';
import { cn } from '../../../shared/cn.ts';

interface ProductionCardProps {
  production: Production;
  steps: ProductionStep[];
  /** Ouvre les tâches d'une étape. Cocher ne se fait plus depuis la carte. */
  onOpenStep: (step: ProductionStep) => void;
  /** Lance le chronomètre sur cette vidéo (l'étape est demandée dans la foulée). */
  onStartTimer: () => void;
  /** `null` quand la carte est en tête ou en queue : le bouton disparaît. */
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  /** Mise en avant de la prochaine vidéo à travailler. */
  /** La prochaine à travailler : un anneau la désigne, sans lui donner un fond de plus. */
  highlighted?: boolean;
  /** Le chronomètre tourne sur cette vidéo : le bouton devient un état, pas une action. */
  timerRunning?: boolean;
  /** Carte réduite à une ligne. */
  compact?: boolean;
  /** Bascule le repli de cette carte seule, par-dessus le réglage global. */
  onToggleCompact?: () => void;
}

/**
 * Écart en **jours de calendrier locaux**, jamais en heures écoulées.
 *
 * Les deux bornes sont ramenées à minuit avant d'être soustraites : comparer une date à
 * minuit UTC avec l'instant présent faisait basculer « aujourd'hui » en « hier » à partir
 * de 22 h à Paris, l'écart réel dépassant alors une demi-journée. Ce qu'on veut savoir
 * est de combien de nuits la date est séparée d'aujourd'hui, pas de combien d'heures.
 */
const days = (from: string): number => {
  const now = new Date();
  const startOfToday = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((Date.parse(`${from}T00:00:00Z`) - startOfToday) / 86_400_000);
};

/** « dans 3 jours », « aujourd'hui », « il y a 2 jours » — plus lisible qu'une date seule. */
const relativeDay = (date: string): string => {
  const delta = days(date);
  if (delta === 0) return "aujourd'hui";
  if (delta === 1) return 'demain';
  if (delta === -1) return 'hier';
  return delta > 0 ? `dans ${delta} jours` : `il y a ${-delta} jours`;
};

/**
 * La fenêtre de travail d'une vidéo : **début → sortie**.
 *
 * Les deux dates ensemble disent ce qu'aucune ne dit seule — la sortie donne l'échéance,
 * le début dit s'il reste du temps devant ou si on est déjà dedans. La flèche se lit
 * comme une durée, là où deux dates côte à côte se liraient comme deux échéances.
 *
 * Le relatif (« dans 3 jours ») est **au survol** et non dans le texte : il double la
 * longueur de la ligne alors qu'on ne le lit que sur la vidéo qu'on s'apprête à
 * attaquer — même parti pris que le détail de la barre de progression.
 */
const DateRange = ({
  startDate,
  plannedDate,
  late,
}: {
  startDate: string | null;
  plannedDate: string | null;
  late: boolean;
}) => {
  if (!startDate && !plannedDate) return null;

  return (
    <span className={cn('flex items-center gap-1', late && 'text-[var(--negative)]')}>
      <CalendarClock className="h-3 w-3" aria-hidden />
      {startDate && (
        <span className="tabular" title={`Début du travail ${relativeDay(startDate)}`}>
          {formatDate(startDate)}
        </span>
      )}
      {startDate && plannedDate && <ArrowRight className="h-3 w-3 opacity-60" aria-hidden />}
      {plannedDate && (
        <span className="tabular" title={`Sortie prévue ${relativeDay(plannedDate)}`}>
          {formatDate(plannedDate)}
        </span>
      )}
    </span>
  );
};

/**
 * Une ligne de la file d'attente.
 *
 * Tout ce qui sert à décider si c'est bien celle-ci qu'on attaque maintenant tient sur
 * la carte : l'avancement, la date visée, ce qui bloque, et l'argent déjà engagé. La
 * fiche ne s'ouvre que quand on a décidé.
 *
 * **En mode réduit, la carte tient sur une ligne** : titre, chaîne, date et avancement,
 * rien d'autre. Au-delà de cinq ou six vidéos en cours, la version détaillée oblige à
 * faire défiler pour voir sa propre file — le repli rend la vue d'ensemble à nouveau
 * possible, et le chevron rouvre la carte qu'on veut regarder de près.
 */
export const ProductionCard = ({
  production,
  steps,
  onOpenStep,
  onStartTimer,
  onMoveUp,
  onMoveDown,
  highlighted,
  timerRunning,
  compact,
  onToggleCompact,
}: ProductionCardProps) => {
  const counts = partnerCounts(production);
  const progress = progressCounts(production, steps.length);
  const late =
    production.plannedDate !== null &&
    days(production.plannedDate) < 0 &&
    production.status !== 'done';

  // Dérivé du statut plutôt que passé en prop : « en cours » est une propriété de la
  // vidéo, pas une décision de l'écran qui l'affiche.
  const inProgress = production.status === 'in_progress';

  const timerButton = (
    <Button
      variant={timerRunning ? 'secondary' : 'ghost'}
      size="icon"
      className={cn('h-7 w-7 shrink-0', timerRunning && 'text-[var(--positive)]')}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onStartTimer();
      }}
      title={timerRunning ? 'Le chronomètre tourne sur cette vidéo' : 'Démarrer le chronomètre'}
      disabled={timerRunning}
    >
      {timerRunning ? <Timer className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      <span className="sr-only">Démarrer le chronomètre</span>
    </Button>
  );

  if (compact) {
    return (
      <Card
        className={cn(
          'flex items-center gap-2 px-3 py-2 transition-colors',
          // Le fond vert marque **le travail en cours**, pas la prochaine vidéo : c'est
          // ce qu'on cherche des yeux en ouvrant la file, et une seule carte surlignée
          // ne disait pas où on en était sur les autres.
          inProgress && 'border-[var(--positive)]/40 bg-[var(--positive)]/10',
          highlighted && 'ring-1 ring-[var(--positive)]',
        )}
      >
        <Link
          to={`/production/${production.id}`}
          className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
          title={production.title}
        >
          {production.title}
        </Link>

        <span className="hidden shrink-0 items-center gap-1 text-xs text-muted-foreground sm:flex">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: production.channelColor ?? 'var(--muted-foreground)' }}
            aria-hidden
          />
          {production.channelName ?? 'Chaîne à décider'}
        </span>

        {/* L'enveloppe est conditionnée comme son contenu : une vidéo sans aucune date
            laisserait sinon un `gap` de la carte pour un élément vide. */}
        {(production.startDate || production.plannedDate) && (
          <span className="hidden shrink-0 text-xs text-muted-foreground md:flex">
            <DateRange
              startDate={production.startDate}
              plannedDate={production.plannedDate}
              late={late}
            />
          </span>
        )}

        {counts.products > 0 && <Gift className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        {counts.sponsorships > 0 && (
          <Handshake className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}

        <span
          className="shrink-0 text-xs tabular text-muted-foreground"
          title={`${progress.done} sur ${progress.total} (étapes et tâches)`}
        >
          {progress.total === 0 ? '—' : `${Math.round((progress.done / progress.total) * 100)} %`}
        </span>

        <Badge
          variant="outline"
          style={{ color: STATUS_COLORS[production.status] }}
          className="hidden shrink-0 lg:inline-flex"
        >
          {STATUS_LABELS[production.status]}
        </Badge>

        {timerButton}

        {/* Le chevron est au même endroit dans les deux vues — dernier à droite.
            Le déplacer d'un bord à l'autre en repliant obligerait à le rechercher
            à chaque fois, sur le seul bouton qu'on utilise en rafale. */}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={onToggleCompact}
          title="Déplier"
        >
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="sr-only">Déplier</span>
        </Button>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        'flex gap-3 p-4 transition-colors',
        inProgress && 'border-[var(--positive)]/40 bg-[var(--positive)]/10',
        highlighted && 'ring-1 ring-[var(--positive)]',
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
              <DateRange
                startDate={production.startDate}
                plannedDate={production.plannedDate}
                late={late}
              />
              {production.nextSlotDate && (
                <span className="flex items-center gap-1">
                  Créneau {relativeDay(production.nextSlotDate)}
                </span>
              )}
              {production.trackedMinutes > 0 && (
                <span className="flex items-center gap-1" title="Temps déjà passé sur cette vidéo">
                  <Timer className="h-3 w-3" aria-hidden />
                  {formatDuration(production.trackedMinutes)}
                </span>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <Badge variant="outline" style={{ color: STATUS_COLORS[production.status] }}>
              {STATUS_LABELS[production.status]}
            </Badge>
            {timerButton}
            {onToggleCompact && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onToggleCompact}
                title="Réduire"
              >
                <ChevronDown className="h-3.5 w-3.5" />
                <span className="sr-only">Réduire</span>
              </Button>
            )}
          </div>
        </div>

        {production.status === 'paused' && (
          <p className="flex items-start gap-1.5 rounded-md bg-muted px-2 py-1.5 text-xs text-muted-foreground">
            <Pause className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            {production.pausedReason ?? 'En pause, sans raison notée'}
          </p>
        )}

        <StepChips production={production} steps={steps} onOpenStep={onOpenStep} />
        <StepProgress production={production} steps={steps} />

        {(counts.products > 0 || counts.sponsorships > 0) && (
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {counts.products > 0 && (
              <PartnerHoverList
                title="Produits rattachés"
                items={production.products.map((product) => ({
                  id: product.id,
                  label: product.name,
                  meta: `${formatMoney(product.valueCents)} · ${PRODUCT_STATUS_LABELS[product.status]}`,
                  pending: PENDING_PRODUCT_STATUSES.includes(product.status),
                }))}
                trigger={
                  <>
                    <Gift className="h-3 w-3" aria-hidden />
                    {counts.products} produit(s)
                    {counts.productsPending > 0 && (
                      <span className="text-[var(--expense)]">
                        · {counts.productsPending} en attente
                      </span>
                    )}
                  </>
                }
              />
            )}
            {counts.sponsorships > 0 && (
              <PartnerHoverList
                title="Sponsos rattachées"
                items={production.sponsorships.map((sponsorship) => ({
                  id: sponsorship.id,
                  label: sponsorship.label,
                  meta: `${formatMoney(sponsorship.amountCents)} · ${SPONSORSHIP_STATUS_LABELS[sponsorship.status]}`,
                  pending: PENDING_SPONSORSHIP_STATUSES.includes(sponsorship.status),
                }))}
                trigger={
                  <>
                    <Handshake className="h-3 w-3" aria-hidden />
                    {counts.sponsorships} sponso(s)
                    {counts.sponsorshipsPendingCents > 0 && (
                      <span className="text-[var(--positive)]">
                        · {formatMoney(counts.sponsorshipsPendingCents)} à encaisser
                      </span>
                    )}
                  </>
                }
              />
            )}
          </div>
        )}
      </div>
    </Card>
  );
};
