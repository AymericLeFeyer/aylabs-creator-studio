import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Les actions de la barre d'application mobile.
 *
 * Sur grand écran, les boutons d'un écran vivent dans son en-tête, à droite du titre.
 * Sur mobile ce titre n'existe plus — c'est la barre d'application qui le porte —, et
 * une rangée de boutons sous elle mangeait une ligne entière tout en haut, au plus loin
 * du pouce. Ils remontent donc **dans** la barre, à droite, là où une application native
 * les met.
 *
 * Le passage se fait par un **portail** et non par une prop remontée depuis chaque page :
 * `AppLayout` monte l'`Outlet`, il ne connaît pas l'écran affiché, et lui faire remonter
 * ses actions demanderait un contexte à écrire dans les dix écrans pour un bouton. Un
 * portail laisse chaque page déclarer ses actions **là où vivent leur état et leurs
 * mutations**, et les fait apparaître au bon endroit.
 *
 * Le conteneur d'arrivée est dans un bloc `lg:hidden` : sur grand écran, ce qui est
 * porté ici n'est simplement pas affiché, et chaque page garde son propre en-tête.
 */
const AppBarContext = createContext<HTMLElement | null>(null);

export const AppBarProvider = ({
  node,
  children,
}: {
  node: HTMLElement | null;
  children: ReactNode;
}) => <AppBarContext.Provider value={node}>{children}</AppBarContext.Provider>;

/**
 * À monter dans une page. Son contenu apparaît dans la barre d'application mobile.
 *
 * Rend `null` tant que le conteneur n'existe pas — au premier rendu, la `ref` de callback
 * de `AppLayout` n'a pas encore été appelée. Le second rendu le pose.
 */
export const AppBarActions = ({ children }: { children: ReactNode }) => {
  const node = useContext(AppBarContext);
  return node ? createPortal(children, node) : null;
};
