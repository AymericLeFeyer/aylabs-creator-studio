import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Menu, Moon, PanelLeftClose, PanelLeftOpen, Settings, Sun, X } from 'lucide-react';
import { MOBILE_NAV, NAV_SECTIONS, pageTitle, type NavItem } from './navigation.ts';
import { useTheme } from './hooks/useTheme.ts';
import { usePreferences } from './hooks/usePreferences.ts';
import { Button } from './components/ui/button.tsx';
import { FiltersBar } from './components/FiltersBar.tsx';
import { RunningTimerBar } from './components/production/RunningTimerBar.tsx';
import { CollectAction } from './components/filters/CollectAction.tsx';
import { AppBarProvider } from './hooks/useAppBar.tsx';
import { cn } from '../shared/cn.ts';

/** Largeur du contenu, généreuse sur grand écran : les graphiques côte à côte en ont besoin. */
const CONTAINER = 'mx-auto w-full max-w-[1800px] px-3 sm:px-5';

/**
 * Routes sans barre de filtres : configurer une chaîne ou une catégorie ne dépend ni
 * d'une période ni d'une sélection de chaînes. Le module de production non plus — une
 * vidéo à écrire n'appartient à aucune fenêtre de temps —, et le tableau légal a sa
 * propre maille, le mois.
 */
const ROUTES_WITHOUT_FILTERS = [
  '/parametres',
  '/commentaires',
  '/planning',
  '/production',
  '/partenariats',
  '/legal',
];

/** Largeurs de la barre latérale. Repliée, elle ne montre que les icônes. */
const SIDEBAR_OPEN = '15rem';
const SIDEBAR_CLOSED = '3.75rem';

/**
 * La barre du bas est une **capsule de verre flottante**, pas un bandeau collé au bord.
 *
 * C'est ce qui distingue le verre liquide d'un simple fond translucide : on doit voir le
 * contenu passer *autour* et *sous* le panneau, pas seulement derrière lui. Un bandeau
 * pleine largeur collé en bas ne montre que sa face avant et se lit comme un aplat.
 *
 * `BOTTOM_NAV_HEIGHT` est la capsule seule ; `--bottom-nav` y ajoute le vide qui
 * l'entoure et la zone de sécurité. C'est cette seconde valeur qui vit en variable CSS,
 * parce que trois choses en dépendent et doivent bouger ensemble : la position de la
 * capsule, la réserve de padding sous le contenu, et le bouton flottant qui se pose
 * au-dessus. Trois valeurs écrites à la main auraient fini par se désaccorder, et le
 * symptôme — un bouton qui recouvre un onglet — ne se voit que sur un téléphone.
 *
 * `env(safe-area-inset-bottom)` s'**ajoute** au lieu de s'y fondre : sur un iPhone à barre
 * gestuelle, la fondre reviendrait à rapetisser les onglets là où ils sont déjà les plus
 * difficiles à viser.
 */
const BOTTOM_NAV_HEIGHT = '3.5rem';
const BOTTOM_NAV_GAP = '0.5rem';
const BOTTOM_NAV = `calc(${BOTTOM_NAV_HEIGHT} + ${BOTTOM_NAV_GAP} * 2 + env(safe-area-inset-bottom))`;

/**
 * La coquille de l'application : navigation à gauche, contenu à droite.
 *
 * La barre latérale remplace l'ancienne rangée d'onglets horizontale. Trois raisons :
 * la liste des écrans peut grandir sans se disputer la largeur avec la barre de
 * filtres ; l'écran actif se repère à sa position plutôt qu'à sa couleur ; et sur mobile
 * la même barre devient un tiroir, au lieu d'une rangée qui défile horizontalement.
 *
 * **Repliée, elle ne montre que les icônes** — le libellé revient en infobulle. L'état
 * est une préférence persistée : on choisit une fois, l'outil s'en souvient.
 *
 * Les paramètres et le thème sont **en bas**, séparés du reste : on n'y va pas dans le
 * fil du travail, et les mettre en tête ferait descendre les écrans qu'on ouvre
 * réellement chaque jour.
 */
export const AppLayout = () => {
  const { theme, toggle } = useTheme();
  /**
   * Le conteneur des actions de la barre d'application mobile.
   *
   * Une `ref` de callback plutôt qu'un `useRef` : les pages y portent leur contenu par
   * un portail, et un portail a besoin d'un nœud **rendu**. Un `useRef` ne provoque
   * aucun rendu quand il se remplit, et le portail n'aurait jamais rien à viser.
   */
  const [actionsNode, setActionsNode] = useState<HTMLDivElement | null>(null);
  const { preferences, set } = usePreferences();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  /*
   * `--app-header` : la hauteur réelle de l'en-tête collant, mesurée et posée sur la
   * racine — même parti pris que `--bottom-nav`, une seule source pour une valeur dont
   * plusieurs choses dépendent.
   *
   * Elle sert aux barres qui veulent s'arrêter **sous** l'en-tête en défilant (celle de
   * l'éditeur de script). L'écrire en dur était impossible : l'en-tête fait une, deux ou
   * trois rangées selon l'écran, la présence des filtres et celle du chronomètre.
   *
   * Posée par un `ResizeObserver` directement sur le style de l'élément, sans état React :
   * un `setState` par redimensionnement relancerait le rendu de toute l'application pour
   * une valeur que seul le CSS consomme.
   */
  const rootRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const header = headerRef.current;
    const root = rootRef.current;
    if (!header || !root) return;

    const apply = () => root.style.setProperty('--app-header', `${header.offsetHeight}px`);
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  const collapsed = preferences.sidebarCollapsed;
  const title = pageTitle(location.pathname);
  const showFilters = !ROUTES_WITHOUT_FILTERS.some((route) => location.pathname.startsWith(route));

  // Naviguer referme le tiroir : sur mobile, il recouvre le contenu qu'on vient
  // d'ouvrir. Dérivé pendant le rendu plutôt que dans un effet — même pattern que les
  // formulaires du projet, et une navigation ne doit pas coûter un rendu de plus.
  const [lastPath, setLastPath] = useState(location.pathname);
  if (lastPath !== location.pathname) {
    setLastPath(location.pathname);
    setMobileOpen(false);
  }

  const navLink = ({ to, label, icon: Icon, end }: NavItem, { compact }: { compact: boolean }) => (
    <NavLink
      key={to}
      to={to}
      end={end}
      title={compact ? label : undefined}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
          compact && 'justify-center px-0',
          isActive
            ? 'bg-secondary text-secondary-foreground'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        )
      }
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!compact && <span className="truncate">{label}</span>}
    </NavLink>
  );

  /** Le contenu de la barre, identique en colonne fixe et en tiroir mobile. */
  const sidebarContent = ({ compact }: { compact: boolean }) => (
    <div className="flex h-full flex-col gap-1 p-2">
      <div className={cn('flex items-center gap-2 px-1 py-2', compact && 'justify-center px-0')}>
        <img src="/icon-192.png" alt="" className="h-6 w-6 shrink-0" />
        {!compact && <span className="truncate font-semibold">Creator Studio</span>}
      </div>

      <nav aria-label="Navigation principale" className="flex flex-1 flex-col overflow-y-auto">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label ?? 'top'} className="flex flex-col gap-0.5">
            {/* Repliée, la barre n'a pas la largeur d'un intitulé : le titre de famille
                devient un simple filet, qui suffit à dire « on change de sujet ». */}
            {section.label &&
              (compact ? (
                <hr className="mx-2 my-1.5 border-border" />
              ) : (
                <p className="px-2.5 pt-3 pb-1 text-[0.68rem] font-semibold tracking-wide text-muted-foreground uppercase">
                  {section.label}
                </p>
              ))}
            {section.items.map((item) => navLink(item, { compact }))}
          </div>
        ))}
      </nav>

      {/* Le pied : ce qui se règle une fois, hors du fil du travail. */}
      <div className="flex flex-col gap-0.5 border-t border-border pt-2">
        <NavLink
          to="/parametres"
          title={compact ? 'Paramètres' : undefined}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
              compact && 'justify-center px-0',
              isActive
                ? 'bg-secondary text-secondary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )
          }
        >
          <Settings className="h-4 w-4 shrink-0" />
          {!compact && <span>Paramètres</span>}
        </NavLink>

        <button
          type="button"
          onClick={toggle}
          title="Changer de thème"
          className={cn(
            'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
            compact && 'justify-center px-0',
          )}
        >
          {theme === 'dark' ? (
            <Sun className="h-4 w-4 shrink-0" />
          ) : (
            <Moon className="h-4 w-4 shrink-0" />
          )}
          {!compact && <span>{theme === 'dark' ? 'Thème clair' : 'Thème sombre'}</span>}
        </button>

        {/* Le repli ne s'offre qu'en colonne fixe : dans un tiroir, il n'aurait pas de sens. */}
        <button
          type="button"
          onClick={() => set({ sidebarCollapsed: !collapsed })}
          title={collapsed ? 'Déplier le menu' : 'Replier le menu'}
          className={cn(
            'hidden items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:flex',
            compact && 'justify-center px-0',
          )}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4 shrink-0" />
          ) : (
            <PanelLeftClose className="h-4 w-4 shrink-0" />
          )}
          {!compact && <span>Replier</span>}
        </button>
      </div>
    </div>
  );

  return (
    <div
      ref={rootRef}
      className="min-h-screen bg-background"
      style={{ ['--bottom-nav' as string]: BOTTOM_NAV, ['--app-header' as string]: '0px' }}
    >
      {/* Colonne fixe, à partir de `lg` seulement. */}
      <aside
        className="fixed inset-y-0 left-0 z-40 hidden border-r border-border bg-card transition-[width] lg:block"
        style={{ width: collapsed ? SIDEBAR_CLOSED : SIDEBAR_OPEN }}
      >
        {sidebarContent({ compact: collapsed })}
      </aside>

      {/* Tiroir mobile : même barre, posée par-dessus le contenu. */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <aside className="fixed inset-y-0 left-0 z-50 w-60 border-r border-border bg-card lg:hidden">
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1"
              onClick={() => setMobileOpen(false)}
              aria-label="Fermer le menu"
            >
              <X className="h-4 w-4" />
            </Button>
            {sidebarContent({ compact: false })}
          </aside>
        </>
      )}

      <div
        className="transition-[padding] lg:pl-[var(--sidebar-width)]"
        style={{ ['--sidebar-width' as string]: collapsed ? SIDEBAR_CLOSED : SIDEBAR_OPEN }}
      >
        <header
          ref={headerRef}
          // `viewport-fit=cover` fait passer le contenu sous l'encoche : l'en-tête
          // s'en écarte de lui-même. Nul ailleurs (grand écran, appareil sans encoche).
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
          className={cn(
            'sticky top-0 z-30 bg-background/85 backdrop-blur',
            // Sur mobile l'en-tête porte toujours la barre d'application, donc toujours
            // son trait. Sur grand écran, sans filtres, il n'a plus rien à porter : ni
            // trait ni hauteur, le contenu démarre tout en haut.
            'border-b border-border',
            !showFilters && 'lg:border-b-0',
          )}
        >
          {/* Barre d'application mobile : menu, titre de l'écran, action.

              Le titre y remplace celui que chaque page affichait en tête et qui est
              désormais masqué sous `lg` — il occupait une ligne pour redire ce que
              l'onglet actif disait déjà, en haut d'un écran où chaque ligne compte.

              L'action de droite est la collecte, et seulement là où elle a un sens
              (les écrans qui portent des filtres). C'est la place d'une action dans une
              barre de titre, et la seule qui reste à portée de pouce une fois les
              filtres repliés dans leur modale. */}
          <div className={cn(CONTAINER, 'flex items-center gap-1 py-1.5 lg:hidden')}>
            <Button
              variant="ghost"
              size="icon"
              className="-ml-2 shrink-0"
              onClick={() => setMobileOpen(true)}
              aria-label="Ouvrir le menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <span className="min-w-0 flex-1 truncate text-base font-semibold">{title}</span>
            {/* Les actions de l'écran, portées ici par `AppBarActions`. La collecte y
                est posée d'office là où elle a un sens — les écrans à filtres —, les
                autres écrans y déposent les leurs. */}
            <div ref={setActionsNode} className="flex shrink-0 items-center gap-0.5" />
            {showFilters && <CollectAction compact />}
          </div>

          {/* La barre de filtres occupe l'en-tête : période et chaînes restent sous la
              main quand on descend dans un long tableau. Sur mobile elle est déjà
              repliée en un bouton (`FiltersSheet`), d'où l'absence de marge haute. */}
          {showFilters && (
            <div className={cn(CONTAINER, 'lg:pt-2.5')}>
              <FiltersBar />
            </div>
          )}

          {/* Le chronomètre vit DANS l'en-tête collant : il suit l'écran et non la page —
              on le démarre sur la production et on l'arrête souvent depuis ailleurs. L'y
              poser plutôt que de lui donner son propre `sticky` évite de le désaligner
              dès que la barre de filtres change de hauteur. */}
          <RunningTimerBar />
        </header>

        {/* La réserve du bas vaut la hauteur de la barre d'onglets plus une marge :
            sans elle, le dernier bouton d'un formulaire finirait dessous, hors
            d'atteinte. Elle retombe à zéro dès que la barre disparaît (`lg`). */}
        {/* Sous `lg`, rien ne fait jamais glisser l'écran sur le côté.
            
            `clip` et non `hidden` : `clip` ne crée pas de conteneur de défilement, donc
            les en-têtes collants continuent de s'accrocher à la fenêtre. Un panneau de
            survol, une carte trop large ou une piste de grille non bornée n'a pas à
            décaler toute la page — un symptôme qu'on ne voit que sur un téléphone, et
            qu'on corrige une fois ici plutôt qu'à chaque composant.
            
            Il redevient `visible` sur grand écran : là, les panneaux de survol des cartes
            de stats débordent volontairement du conteneur, et les rogner les couperait
            en deux sur la première et la dernière colonne. */}
        <main
          className={cn(
            CONTAINER,
            'overflow-x-clip py-4 pb-[calc(var(--bottom-nav)+1rem)] sm:py-6',
            'lg:overflow-x-visible lg:pb-6',
          )}
        >
          <AppBarProvider node={actionsNode}>
            <Outlet />
          </AppBarProvider>
        </main>
      </div>

      {/* Barre du bas, mobile seulement.

          Cinq écrans, ceux qu'on ouvre debout : où j'en suis, quoi faire aujourd'hui, ce
          que ça rapporte, ce qu'on m'écrit. Le tiroir garde **tout**, ces cinq-là compris —
          y chercher un écran ne doit jamais donner un trou.

          Le pouce atteint le bas de l'écran, pas le coin haut-gauche où vit le burger :
          c'est toute la raison d'être de cette barre, et pourquoi elle ne remplace pas le
          tiroir mais le double sur ce que l'on ouvre le plus.

          Elle est en `z-30`, sous le voile du tiroir (`z-40`) : à z-index égal, c'est
          l'ordre du DOM qui tranche, et la barre serait passée par-dessus le voile.

          C'est une **capsule de verre flottante** et non un bandeau collé au bord : le verre n'a de sens que si le contenu passe autour et sous lui.
          `--bottom-nav` réserve sa hauteur plus le vide qui l'entoure, et sert aussi de
          réserve sous le contenu et d'appui au bouton flottant — trois valeurs écrites à
          la main auraient fini par se désaccorder, et le symptôme (un bouton qui recouvre
          un onglet) ne se voit que sur un téléphone. La zone de sécurité s'y **ajoute**
          plutôt que de s'y fondre, sans quoi les onglets rapetisseraient sur un iPhone à
          barre gestuelle, là où ils sont déjà les plus difficiles à viser. */}
      <nav
        /*
         * Le conteneur ne capte aucun geste (`pointer-events-none`) : seule la capsule le
         * fait. Les marges qui l'entourent restent donc traversables, et on continue de
         * faire défiler la page en posant le pouce à côté de la barre — sur un bandeau
         * pleine largeur, cette bande était morte.
         */
        className="pointer-events-none fixed inset-x-0 bottom-0 z-30 lg:hidden"
        aria-label="Accès rapide"
      >
        {/*
          Le verre, en trois couches, et il en manque une seule pour que l'effet retombe à
          un voile gris : le **flou saturé**, qui rend à ce qui passe dessous ses couleurs
          (un flou seul désature, et une miniature vire au gris) ; le **reflet** sur
          l'arête haute ; l'**ombre portée**, qui décolle la capsule du fond et fait
          comprendre qu'on voit à travers et non derrière.

          `isolate` lui donne son propre contexte d'empilement, et `overflow-hidden` fait
          suivre l'arrondi à tout ce qu'elle contient.
        */}
        <div
          className={cn(
            'pointer-events-auto isolate mx-2 overflow-hidden rounded-[26px]',
            'border border-black/[0.06] dark:border-white/[0.14]',
            'bg-background/55 backdrop-blur-2xl backdrop-saturate-150',
            'shadow-[0_8px_32px_-6px_rgb(0_0_0/0.28)] dark:shadow-[0_12px_40px_-8px_rgb(0_0_0/0.65)]',
          )}
          style={{
            height: BOTTOM_NAV_HEIGHT,
            marginBottom: `calc(${BOTTOM_NAV_GAP} + env(safe-area-inset-bottom))`,
          }}
        >
          {/* Le reflet est porté par la rangée elle-même : franc en haut, éteint avant la
              moitié — au-delà ce n'est plus un reflet mais un fond, et le verre se met à
              ressembler à un bouton. */}
          <div className="grid h-full grid-cols-5 bg-gradient-to-b from-white/40 to-transparent dark:from-white/[0.08]">
            {MOBILE_NAV.map(({ to, label, short, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'relative flex flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium transition-colors',
                    isActive ? 'text-primary' : 'text-muted-foreground',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {/* Une pastille **de verre** sous l'onglet actif, et non un aplat
                        opaque : la barre garde sa transparence d'ensemble, sinon un
                        cinquième d'entre elle cesserait d'être du verre. */}
                    {isActive && (
                      <span
                        className="absolute inset-x-1.5 inset-y-1 rounded-[18px] bg-primary/12 ring-1 ring-primary/20 ring-inset"
                        aria-hidden
                      />
                    )}
                    <Icon className="relative h-5 w-5" />
                    <span className="relative w-full truncate text-center">{short ?? label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </div>
      </nav>
    </div>
  );
};
