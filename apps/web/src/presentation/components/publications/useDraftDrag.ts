import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';

/** Distance au bord du conteneur (px) à partir de laquelle les couloirs défilent seuls. */
const EDGE = 56;
/** Pixels défilés par image : assez pour traverser un mois en deux secondes. */
const SPEED = 14;

export interface DraftDrag {
  id: string;
  title: string;
  x: number;
  y: number;
  /** Le jour survolé, `null` pour « Sans date », `undefined` hors de toute zone. */
  day: string | null | undefined;
}

/** La zone sous le pointeur : un couloir (`data-drop-day="AAAA-MM-JJ"`) ou « Sans date » (`""`). */
const targetAt = (x: number, y: number): string | null | undefined => {
  const zone = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop-day]');
  if (!zone) return undefined;
  return zone.dataset.dropDay || null;
};

/**
 * Glisser une publication d'un couloir de jour à un autre.
 *
 * Écrit à la main, comme la grille du planning : le besoin tient en « quel couloir est
 * sous le pointeur », que `elementFromPoint` donne directement. Le glisser-déposer HTML5
 * natif ne marche pas au doigt sur iOS, or l'écran sert aussi depuis un téléphone.
 *
 * Le geste part d'une **poignée** (`touch-none`) et non de la ligne entière : la ligne
 * porte six cases et quatre boutons, et au doigt le reste de la ligne doit continuer de
 * faire défiler les couloirs.
 *
 * Les écouteurs sont sur `window` et l'état vivant dans une **ref** : leurs closures sont
 * posées une fois par geste, et liraient sinon la position du premier rendu. Près du bord
 * haut ou bas des couloirs, ils défilent tout seuls — sans ça, déplacer une publication de
 * trois semaines demanderait de lâcher, défiler et recommencer.
 */
export const useDraftDrag = (
  scrollRef: RefObject<HTMLElement | null>,
  onDrop: (id: string, day: string | null) => void,
) => {
  const [drag, setDrag] = useState<DraftDrag | null>(null);
  const live = useRef<DraftDrag | null>(null);
  const dropRef = useRef(onDrop);
  useEffect(() => {
    dropRef.current = onDrop;
  });

  const activeId = drag?.id ?? null;

  useEffect(() => {
    if (!activeId) return;

    const follow = (x: number, y: number) => {
      const current = live.current;
      if (!current) return;
      const next = { ...current, x, y, day: targetAt(x, y) };
      live.current = next;
      setDrag(next);
    };

    const end = (commit: boolean) => {
      const current = live.current;
      live.current = null;
      setDrag(null);
      if (commit && current && current.day !== undefined) dropRef.current(current.id, current.day);
    };

    const onMove = (event: PointerEvent) => follow(event.clientX, event.clientY);
    const onUp = () => end(true);
    const onCancel = () => end(false);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') end(false);
    };

    let frame = 0;
    const tick = () => {
      const current = live.current;
      const box = scrollRef.current;
      if (current && box) {
        const rect = box.getBoundingClientRect();
        const inside = current.x >= rect.left && current.x <= rect.right;
        const delta =
          current.y >= rect.top && current.y < rect.top + EDGE
            ? -SPEED
            : current.y > rect.bottom - EDGE && current.y <= rect.bottom
              ? SPEED
              : 0;
        if (inside && delta !== 0) {
          const before = box.scrollTop;
          box.scrollTop += delta;
          // Le contenu a glissé sous un pointeur immobile : le couloir visé a changé.
          if (box.scrollTop !== before) follow(current.x, current.y);
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKey);
    };
  }, [activeId, scrollRef]);

  const start = (event: ReactPointerEvent, draft: { id: string; title: string }) => {
    if (event.button !== 0) return;
    // Pas de sélection de texte pendant le geste.
    event.preventDefault();
    const next: DraftDrag = {
      id: draft.id,
      title: draft.title,
      x: event.clientX,
      y: event.clientY,
      day: targetAt(event.clientX, event.clientY),
    };
    live.current = next;
    setDrag(next);
  };

  return { drag, start };
};
