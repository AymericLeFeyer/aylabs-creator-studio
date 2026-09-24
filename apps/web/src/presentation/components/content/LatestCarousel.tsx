import { useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Card } from '../ui/card.tsx';

/** Au-delà, un glissement horizontal change d'élément ; en deçà, c'est un tapotement. */
const SWIPE_THRESHOLD = 48;

interface LatestCarouselProps<T> {
  items: T[];
  /** Ce qui s'affiche pour l'élément courant : fiche à gauche, compteurs à droite. */
  children: (item: T, index: number) => { main: ReactNode; stats: ReactNode };
  /** « Sortie », « Publication » : pour les libellés des chevrons. */
  noun: string;
}

/**
 * Les dernières sorties ou publications, **une à la fois**, en pleine largeur.
 *
 * Une par une plutôt que côte à côte : la comparaison se fait sur les mêmes cases, au même
 * endroit, ce que dix colonnes rétrécies rendraient impossible. On passe de l'une à
 * l'autre aux chevrons **ou en glissant du doigt** (pointeur, donc souris comprise) ;
 * `touch-pan-y` laisse le défilement vertical de la page au navigateur.
 *
 * Les chevrons s'arrêtent aux bornes plutôt que de boucler : un enroulement ferait
 * repartir de la plus récente sans qu'on l'ait demandé. Le rang est écrit à côté pour la
 * même raison.
 */
export const LatestCarousel = <T,>({ items, children, noun }: LatestCarouselProps<T>) => {
  const [index, setIndex] = useState(0);
  const start = useRef<number | null>(null);
  const swiped = useRef(false);

  /**
   * La liste rétrécit quand on change de chaîne ou de compte : sans ce repli, le bloc se
   * viderait en gardant un rang qui ne désigne plus rien. Dérivé pendant le rendu et non
   * dans un effet (`react-hooks/set-state-in-effect`).
   */
  const [known, setKnown] = useState(items.length);
  if (known !== items.length) {
    setKnown(items.length);
    if (index >= items.length) setIndex(0);
  }

  const item = items[index];
  if (item === undefined) return null;
  const { main, stats } = children(item, index);

  const go = (next: number) => setIndex(Math.min(items.length - 1, Math.max(0, next)));

  return (
    <Card
      className="touch-pan-y p-4"
      onPointerDown={(event) => {
        start.current = event.clientX;
        // Un glissement au doigt n'émet aucun clic : sans ça, le vrai clic suivant serait avalé.
        swiped.current = false;
      }}
      onPointerUp={(event) => {
        if (start.current === null) return;
        const delta = event.clientX - start.current;
        start.current = null;
        if (Math.abs(delta) < SWIPE_THRESHOLD) return;
        swiped.current = true;
        go(delta < 0 ? index + 1 : index - 1);
      }}
      // Un glissement relâché sur le lien le suivrait : le clic qui suit est avalé.
      onClickCapture={(event) => {
        if (!swiped.current) return;
        swiped.current = false;
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerCancel={() => {
        start.current = null;
      }}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        {main}
        {stats}
        {items.length > 1 && <Pager index={index} total={items.length} onChange={go} noun={noun} />}
      </div>
    </Card>
  );
};

/** La grille de compteurs, à droite sur grand écran, sous la fiche en dessous. */
export const CarouselStats = ({ stats }: { stats: Array<{ label: string; value: string }> }) => (
  <dl className="grid shrink-0 grid-cols-3 gap-x-6 gap-y-3 lg:grid-cols-6 lg:border-l lg:border-border lg:pl-6">
    {stats.map((stat) => (
      <div key={stat.label}>
        <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{stat.label}</dt>
        <dd className="text-base font-semibold tabular">{stat.value}</dd>
      </div>
    ))}
  </dl>
);

const Pager = ({
  index,
  total,
  onChange,
  noun,
}: {
  index: number;
  total: number;
  onChange: (next: number) => void;
  noun: string;
}) => (
  <div className="flex shrink-0 items-center gap-1 self-end lg:self-center lg:border-l lg:border-border lg:pl-4">
    <button
      type="button"
      onClick={() => onChange(index - 1)}
      disabled={index === 0}
      aria-label={`${noun} plus récente`}
      className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
    >
      <ChevronLeft className="h-4 w-4" aria-hidden />
    </button>
    <span className="w-10 text-center text-xs tabular text-muted-foreground">
      {index + 1} / {total}
    </span>
    <button
      type="button"
      onClick={() => onChange(index + 1)}
      disabled={index === total - 1}
      aria-label={`${noun} précédente`}
      className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
    >
      <ChevronRight className="h-4 w-4" aria-hidden />
    </button>
  </div>
);
