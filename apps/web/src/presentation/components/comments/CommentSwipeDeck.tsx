import { useRef, useState } from 'react';
import { EyeOff, Heart, Lightbulb, Undo2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useSetCommentStatus } from '../../../application/comment/usecases/useComments.ts';
import type { Comment, CommentStatus } from '../../../domain/comment/entities/Comment.ts';
import { formatDate, formatNumber } from '../../../shared/format.ts';
import { Button } from '../ui/button.tsx';
import { Card } from '../ui/card.tsx';
import { CommentAuthor } from './CommentAuthor.tsx';
import { CommentVideoLink } from './CommentVideoLink.tsx';
import { cn } from '../../../shared/cn.ts';

/** Une décision, c'est-à-dire tout sauf « à trier » — on ne swipe pas vers la file. */
type Decision = Exclude<CommentStatus, 'new'>;

/**
 * Distance à parcourir pour qu'un geste compte, en pixels.
 *
 * Assez court pour se faire au pouce sans lâcher le téléphone, assez long pour qu'un
 * défilement de la page ou un tremblement ne classe rien tout seul.
 */
const THRESHOLD = 90;

/** Au-delà d'un frémissement, le geste s'annonce : c'est là que le badge apparaît. */
const HINT_FROM = 16;

/**
 * Où part la carte, et donc ce que le geste veut dire.
 *
 * **Droite = idée, gauche = ignoré, haut = encourageant.** L'horizontale porte les deux
 * décisions qu'on prend le plus, une par pouce ; le haut est réservé à celle qui demande
 * de viser — on met rarement un commentaire sur le mur par erreur, et un mur qui se
 * remplit tout seul ne vaudrait plus rien.
 *
 * Les distances dépassent largement l'écran : la carte doit être **sortie du cadre** à la
 * fin de la transition, sinon on la verrait disparaître d'un coup au moment du remplacement.
 */
const EXIT: Record<Decision, { x: number; y: number }> = {
  idea: { x: 520, y: 40 },
  ignored: { x: -520, y: 40 },
  encouraging: { x: 0, y: -720 },
};

interface DecisionStyle {
  label: string;
  icon: LucideIcon;
  /** Teinte du badge et du bouton — la même que le badge de statut du tableau. */
  color: string;
  hint: string;
}

const DECISIONS: Record<Decision, DecisionStyle> = {
  encouraging: {
    label: 'Encourageant',
    icon: Heart,
    color: 'var(--positive)',
    hint: 'vers le haut',
  },
  idea: { label: 'Idée', icon: Lightbulb, color: 'var(--cash)', hint: 'vers la droite' },
  ignored: {
    label: 'Ignoré',
    icon: EyeOff,
    color: 'var(--muted-foreground)',
    hint: 'vers la gauche',
  },
};

/** L'ordre des boutons reprend celui de la main : gauche, haut, droite. */
const BUTTON_ORDER: Decision[] = ['ignored', 'encouraging', 'idea'];

/**
 * Ce que le geste en cours signifie, ou `null` s'il ne signifie encore rien.
 *
 * L'axe dominant décide : un mouvement surtout vertical vers le haut est un
 * « encourageant », tout le reste se lit à l'horizontale. Sans cet arbitrage, une
 * diagonale classerait au hasard selon le pixel où l'on relâche.
 */
const decisionOf = (dx: number, dy: number): Decision | null => {
  if (Math.abs(dy) > Math.abs(dx)) {
    return dy < -HINT_FROM ? 'encouraging' : null;
  }
  if (Math.abs(dx) < HINT_FROM) return null;
  return dx > 0 ? 'idea' : 'ignored';
};

/** À quel point le geste est engagé, de 0 à 1 : le badge s'appuie dessus. */
const progressOf = (dx: number, dy: number): number =>
  Math.min(1, Math.max(Math.abs(dx), Math.abs(dy)) / THRESHOLD);

/**
 * Le tri des commentaires au pouce, sur mobile.
 *
 * Le tableau demande de viser trois boutons de sept millimètres dans une ligne parmi
 * trente : c'est faisable assis devant un écran large, pas dans le métro. Une carte à la
 * fois, un geste par décision, et la file se vide en marchant.
 *
 * **Les trois boutons doublent les trois gestes**, et jouent la même animation : un geste
 * ne s'apprend qu'en le voyant, et personne ne lit la légende d'une interface. En cliquant
 * « Idée » on voit la carte partir à droite — la fois suivante, on la pousse soi-même.
 *
 * La carte est **remplacée et non ramenée** (`key` sur l'identifiant) : sans ça, la
 * suivante reviendrait en glissant depuis l'endroit où la précédente est sortie, comme si
 * elle rebondissait.
 */
export const CommentSwipeDeck = ({ comments }: { comments: Comment[] }) => {
  const setStatus = useSetCommentStatus();

  /**
   * Ce qu'on vient de classer, dans l'ordre.
   *
   * Une liste et non un ensemble : c'est elle qui permet de revenir en arrière. Elle
   * évite surtout d'attendre l'aller-retour réseau pour montrer la carte suivante — la
   * requête se recharge en arrière-plan, et la file avance à la vitesse du pouce.
   */
  const [decided, setDecided] = useState<string[]>([]);
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const [flying, setFlying] = useState<Decision | null>(null);

  const start = useRef<{ x: number; y: number } | null>(null);
  /** Un geste qui a bougé ne doit pas déclencher le lien sur lequel il a commencé. */
  const moved = useRef(false);
  /** Ce qui a déjà été envoyé : deux chemins mènent à la sortie, un seul doit écrire. */
  const settled = useRef(new Set<string>());
  const failsafe = useRef<number | null>(null);

  const queue = comments.filter((comment) => !decided.includes(comment.id));
  const current = queue[0];
  const upcoming = queue[1];

  /**
   * Valide la décision et passe à la carte suivante.
   *
   * Idempotente **par construction** : `transitionend` et le filet de sécurité peuvent
   * tous deux l'appeler, et un double appel classerait deux fois — donc une requête de
   * trop, et un compteur faux.
   */
  const finish = (decision: Decision, id: string) => {
    if (failsafe.current !== null) {
      window.clearTimeout(failsafe.current);
      failsafe.current = null;
    }
    if (settled.current.has(id)) return;
    settled.current.add(id);

    setStatus.mutate({ id, status: decision });
    setDecided((previous) => [...previous, id]);
    setFlying(null);
    setDrag(null);
  };

  /**
   * Lance la sortie de la carte.
   *
   * Le minuteur est un **filet, pas le mécanisme** : c'est `transitionend` qui valide
   * normalement. Mais une transition de durée nulle n'émet aucun événement — c'est le cas
   * si le système désactive les animations, ou si l'onglet passe en arrière-plan pendant
   * le vol —, et la carte resterait alors bloquée hors du cadre, la file figée pour de
   * bon. Le délai dépasse la durée de l'animation pour ne jamais la couper.
   */
  const fly = (decision: Decision, id: string) => {
    if (flying) return;
    setFlying(decision);
    if (failsafe.current !== null) window.clearTimeout(failsafe.current);
    failsafe.current = window.setTimeout(() => finish(decision, id), 450);
  };

  const undo = () => {
    const last = decided[decided.length - 1];
    if (!last) return;
    // Le commentaire revient dans la file : le remettre à `new` le fait réapparaître au
    // prochain chargement, à sa place chronologique — pas forcément en tête.
    setStatus.mutate({ id: last, status: 'new' });
    setDecided(decided.slice(0, -1));
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (flying) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    start.current = { x: event.clientX, y: event.clientY };
    moved.current = false;
    setDrag({ dx: 0, dy: 0 });
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!start.current || flying) return;
    const dx = event.clientX - start.current.x;
    const dy = event.clientY - start.current.y;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved.current = true;
    setDrag({ dx, dy });
  };

  const onPointerUp = () => {
    if (!start.current || flying) return;
    start.current = null;
    const { dx, dy } = drag ?? { dx: 0, dy: 0 };
    const decision = decisionOf(dx, dy);
    // Le seuil ne se juge que sur l'axe retenu : une diagonale généreuse mais dont aucune
    // composante n'aboutit doit revenir en place, pas classer.
    const reached =
      decision === 'encouraging' ? Math.abs(dy) >= THRESHOLD : Math.abs(dx) >= THRESHOLD;

    if (decision && reached && current) fly(decision, current.id);
    else setDrag(null);
  };

  if (!current) {
    return (
      <Card className="flex flex-col items-center gap-3 px-6 py-14 text-center">
        <span className="rounded-full bg-[var(--positive)]/15 p-3 text-[var(--positive)]">
          <Heart className="h-6 w-6" />
        </span>
        <div>
          <p className="font-semibold">Tout est trié</p>
          <p className="mt-1 text-sm text-muted-foreground">
            La file est vide. Les prochains commentaires arriveront avec la collecte.
          </p>
        </div>
        {decided.length > 0 && (
          <Button variant="outline" size="sm" onClick={undo}>
            <Undo2 className="h-4 w-4" />
            Annuler le dernier
          </Button>
        )}
      </Card>
    );
  }

  const { dx, dy } = drag ?? { dx: 0, dy: 0 };
  const hinted = flying ?? decisionOf(dx, dy);
  const progress = flying ? 1 : progressOf(dx, dy);

  const exit = flying ? EXIT[flying] : null;
  const offsetX = exit ? exit.x : dx;
  const offsetY = exit ? exit.y : dy;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{formatNumber(queue.length)}</span> à
          trier
        </p>
        {/* Un geste rate plus souvent qu'un clic : sans retour arrière, une carte partie
            de travers se retrouve classée sans qu'on puisse rien y faire depuis ici. */}
        <Button variant="ghost" size="sm" disabled={decided.length === 0} onClick={undo}>
          <Undo2 className="h-4 w-4" />
          Annuler
        </Button>
      </div>

      {/* Hauteur fixe : la pile ne doit pas se réorganiser sous le pouce quand un
          commentaire court succède à un commentaire long. */}
      <div className="relative h-[26rem]">
        {/* La carte suivante, en dessous : elle dit qu'il en reste, et donne au geste un
            fond sur lequel glisser plutôt que du vide. */}
        {upcoming && (
          <Card aria-hidden className="absolute inset-x-2 top-2 bottom-0 scale-[0.97] opacity-60" />
        )}

        <Card
          key={current.id}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onClickCapture={(event) => {
            if (moved.current) event.preventDefault();
          }}
          onTransitionEnd={(event) => {
            // `transform` seul : `opacity` transitionne aussi, et valider deux fois
            // classerait le commentaire suivant par-dessus le marché.
            if (event.propertyName === 'transform' && flying) finish(flying, current.id);
          }}
          className={cn(
            'absolute inset-0 flex touch-none flex-col overflow-hidden p-4 select-none',
            // Pas de transition pendant le glissement : la carte doit coller au doigt.
            drag && !flying ? '' : 'transition-transform duration-300 ease-out',
          )}
          style={{
            transform: `translate(${offsetX}px, ${offsetY}px) rotate(${offsetX / 18}deg)`,
          }}
        >
          {/* Le badge annonce la décision AVANT le relâchement : sans lui, on découvre où
              le commentaire est parti une fois qu'il n'est plus là. */}
          {hinted && (
            <span
              className="pointer-events-none absolute top-4 right-4 flex items-center gap-1.5 rounded-md border-2 px-2 py-1 text-xs font-bold uppercase"
              style={{
                color: DECISIONS[hinted].color,
                borderColor: DECISIONS[hinted].color,
                opacity: progress,
              }}
            >
              {DECISIONS[hinted].label}
            </span>
          )}

          <div className="flex items-center gap-2.5">
            <CommentAuthor comment={current} size={40} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{current.authorName}</p>
              <p className="tabular text-xs text-muted-foreground">
                {formatDate(current.date)}
                {current.likeCount > 0 && ` · ${formatNumber(current.likeCount)} ❤`}
              </p>
            </div>
          </div>

          {/* Tronqué et **non défilant** : la carte porte `touch-none` pour que le geste
              parte de n'importe où, ce qui interdirait de toute façon de faire défiler au
              doigt. Une douzaine de lignes suffisent largement à trancher « encourageant,
              idée ou bruit » ; le texte entier reste à un clic, sur YouTube. */}
          <p className="mt-4 line-clamp-[13] flex-1 overflow-hidden text-sm whitespace-pre-line">
            {current.text}
          </p>

          <div className="mt-3 border-t border-border pt-3 text-xs">
            <CommentVideoLink comment={current} className="text-xs" />
          </div>
        </Card>
      </div>

      {/* Les trois boutons, dans l'ordre des gestes : gauche, haut, droite. Ils jouent la
          même animation — c'est comme ça qu'on apprend le geste sans lire une légende. */}
      <div className="grid grid-cols-3 gap-2">
        {BUTTON_ORDER.map((decision) => {
          const { label, icon: Icon, color, hint } = DECISIONS[decision];
          return (
            <button
              key={decision}
              type="button"
              disabled={flying !== null}
              onClick={() => fly(decision, current.id)}
              className="flex flex-col items-center gap-1 rounded-lg border border-border py-2.5 transition-colors active:bg-accent disabled:opacity-50"
              style={{ color }}
            >
              <Icon className="h-5 w-5" />
              <span className="text-xs font-medium">{label}</span>
              <span className="text-[0.65rem] text-muted-foreground">{hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
