import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, matchPath, useLocation } from 'react-router-dom';
import { Menu, PanelLeftClose, PanelLeftOpen, Settings, X } from 'lucide-react';
import { DEFAULT_MOBILE_NAV, resolveMobileNav, pageTitle, type NavItem } from './navigation.ts';
import { usePreferences } from './hooks/usePreferences.ts';
import { useNavSections } from './hooks/useNavSections.ts';
import { Button } from './components/ui/button.tsx';
import { ThemeToggle } from './components/ThemeToggle.tsx';
import { CompactTooltip } from './components/CompactTooltip.tsx';
import { FiltersBar } from './components/FiltersBar.tsx';
import { RunningTimerBar } from './components/production/RunningTimerBar.tsx';
import { CollectAction } from './components/filters/CollectAction.tsx';
import { AppBarProvider } from './hooks/useAppBar.tsx';
import { useNavBadges } from './hooks/useNavBadges.ts';
import { NavBadgePill } from './components/NavBadgePill.tsx';
import { useProduction } from '../application/production/usecases/useProductions.ts';
import { FORMAT_ROUTES } from '../domain/production/entities/Production.ts';
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
  '/shorts',
  '/publications',
  '/produits',
  '/sponsors',
  '/affiliations',
  '/discord',
  '/legal',
  // Une app embarquée a sa propre interface : une barre de période au-dessus d'elle ne
  // piloterait rien.
  '/apps',
];

/** Largeurs de la barre latérale. Repliée, elle ne montre que les icônes. */
const SIDEBAR_OPEN = '15rem';
const SIDEBAR_CLOSED = '3.75rem';

/**
 * La barre du bas, sur mobile : un **bandeau plein, opaque, collé au bord**.
 *
 * Elle a été une capsule de verre flottante : le contenu passait autour et derrière, et
 * c'était précisément le défaut — une barre qu'on lit à travers se lit mal, et le pouce
 * visait une cible détachée du bord. Désormais rien ne passe derrière : fond opaque, et
 * `main` réserve exactement sa hauteur (`--bottom-nav`), si bien que le dernier élément
 * d'une page s'arrête au-dessus d'elle.
 *
 * `--bottom-nav` = la rangée plus la zone de sécurité (barre gestuelle d'iPhone), qui
 * s'**ajoute** au lieu de s'y fondre : la fondre rapetisserait les onglets là où ils sont
 * déjà les plus durs à viser. Trois choses en dépendent — la barre, la réserve sous le
 * contenu, le bouton flottant —, d'où la variable unique.
 */
const BOTTOM_NAV_HEIGHT = '3rem';
/**
 * La zone de sécurité, **rognée** : les 34 px d'un iPhone à barre gestuelle, ajoutés tels
 * quels, faisaient une barre de 90 px pour trois icônes. La barre gestuelle n'occupe que le
 * bas de cette zone ; les onglets peuvent en recouvrir le haut sans gêner le geste — c'est
 * ce que font les barres natives. Sur un appareil sans zone (inset nul), un liseré de 4 px
 * décolle quand même les libellés du bord.
 */
const BOTTOM_SAFE_AREA = 'max(calc(env(safe-area-inset-bottom) - 0.75rem), 0.25rem)';
const BOTTOM_NAV = `calc(${BOTTOM_NAV_HEIGHT} + ${BOTTOM_SAFE_AREA})`;

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
  /**
   * Le conteneur des actions de la barre d'application mobile.
   *
   * Une `ref` de callback plutôt qu'un `useRef` : les pages y portent leur contenu par
   * un portail, et un portail a besoin d'un nœud **rendu**. Un `useRef` ne provoque
   * aucun rendu quand il se remplit, et le portail n'aurait jamais rien à viser.
   */
  const [actionsNode, setActionsNode] = useState<HTMLDivElement | null>(null);
  /** Même mécanique, dans la barre de filtres au large (`FilterBarActions`). */
  const [filterActionsNode, setFilterActionsNode] = useState<HTMLDivElement | null>(null);
  const { preferences, set } = usePreferences();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  /**
   * Les pastilles du menu. Elles remplacent les bandeaux d'alertes du dashboard : chaque
   * problème est rangé dans le menu qui permet de le traiter, et l'écran ouvert redit en
   * tête pourquoi (`PageAlerts`).
   */
  const badges = useNavBadges();

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

  /*
   * La fiche d'une vidéo vit à `/production/:id`, quel que soit son format — si bien que
   * `NavLink` allumait « Vidéos » sur la fiche d'un short. Le menu actif se lit donc au
   * **format de la fiche** : sa requête est déjà en cache (la page la charge), et c'est la
   * même clé, donc aucun aller-retour de plus. Changer l'adresse en `/shorts/:id` aurait
   * obligé chaque lien vers une fiche — planning, alertes, chronomètre, partenaires — à
   * connaître le format de la vidéo qu'il vise.
   */
  const detailId = matchPath('/production/:id', location.pathname)?.params.id;
  const { data: detail } = useProduction(detailId);
  const detailRoute = detailId && detail ? FORMAT_ROUTES[detail.format] : null;
  const isItemActive = (to: string, isActive: boolean): boolean =>
    detailRoute && (to === '/production' || to === '/shorts') ? to === detailRoute : isActive;

  /**
   * Le menu du studio, plus les applications externes activées, chacune dans sa famille.
   * Le titre de la barre d'application est alors le nom de l'app ouverte, que l'adresse
   * (`/apps/<id>`) ne porte pas.
   */
  const { sections: navSections, externalApps } = useNavSections();
  const openAppId = matchPath('/apps/:id', location.pathname)?.params.id;
  const mobileNav = useMemo(
    () => resolveMobileNav(preferences.mobileNav, navSections, DEFAULT_MOBILE_NAV),
    [preferences.mobileNav, navSections],
  );

  const collapsed = preferences.sidebarCollapsed;
  const title =
    externalApps.find((app) => app.id === openAppId)?.name ?? pageTitle(location.pathname);
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
      aria-label={compact ? label : undefined}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
          compact && 'justify-center px-0',
          isItemActive(to, isActive)
            ? 'bg-secondary text-secondary-foreground'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        )
      }
    >
      {/* Repliée, la barre n'a pas la place d'un nombre : un point sur l'icône suffit à
          dire « regarde ici », et l'infobulle de la pastille donne le compte. */}
      <span className="relative shrink-0">
        <Icon className="h-4 w-4" />
        {compact && <NavBadgePill badge={badges[to]} dot className="absolute -right-1 -top-1" />}
      </span>
      {!compact && <span className="min-w-0 flex-1 truncate">{label}</span>}
      {!compact && <NavBadgePill badge={badges[to]} />}
      {/* Repliée, l'identité de l'icône ne se lit qu'au survol — instantanément, pas
          après le délai de l'infobulle native du navigateur. */}
      {compact && <CompactTooltip label={label} />}
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
        {navSections.map((section) => (
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

      {/* Le pied : ce qui se règle une fois, hors du fil du travail. Le thème avant
          Paramètres : c'est le réglage qu'on retouche le plus souvent des deux. Le repli
          n'y est plus — il flotte désormais sur le filet qui sépare le menu du contenu. */}
      <div className="flex flex-col gap-0.5 border-t border-border pt-2">
        <ThemeToggle compact={compact} />

        <NavLink
          to="/parametres"
          aria-label={compact ? 'Paramètres' : undefined}
          className={({ isActive }) =>
            cn(
              'group relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
              compact && 'justify-center px-0',
              isActive
                ? 'bg-secondary text-secondary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )
          }
        >
          <Settings className="h-4 w-4 shrink-0" />
          {!compact && <span>Paramètres</span>}
          {compact && <CompactTooltip label="Paramètres" />}
        </NavLink>
      </div>
    </div>
  );

  return (
    <div
      ref={rootRef}
      className="min-h-screen bg-background"
      style={{ ['--bottom-nav' as string]: BOTTOM_NAV, ['--app-header' as string]: '0px' }}
    >
      {/* Colonne fixe, à partir de `lg` seulement. `group` porte le survol dont dépend
          le bouton de repli flottant : lui poser l'écouteur ici, et non sur le bouton
          seul, est ce qui le fait apparaître dès qu'on entre dans la barre, pas
          seulement en arrivant pile sur lui. */}
      <aside
        className="group fixed inset-y-0 left-0 z-40 hidden border-r border-border bg-card transition-[width] lg:block"
        style={{ width: collapsed ? SIDEBAR_CLOSED : SIDEBAR_OPEN }}
      >
        {sidebarContent({ compact: collapsed })}

        {/* Le bouton de repli flotte sur le filet qui sépare le menu du contenu, plutôt
            que de vivre dans le pied de la barre : c'est un réglage du cadre, pas un
            réglage de l'outil, et `left-full -translate-x-1/2` le garde centré sur la
            bordure quelle que soit la largeur courante — pas de calcul à refaire au
            passage plié/déplié. Replié, il reste invisible tant qu'on n'est pas dans la
            barre (`opacity-0`, révélé par le survol du `group` ci-dessus) : un rond qui
            flotterait en permanence sur le contenu n'aurait rien à y faire tant qu'on ne
            cherche pas à déplier. Déplié, il reste toujours visible — c'est la
            disposition de repos, elle n'a pas à se cacher. */}
        <button
          type="button"
          onClick={() => set({ sidebarCollapsed: !collapsed })}
          title={collapsed ? 'Déplier le menu' : 'Replier le menu'}
          aria-label={collapsed ? 'Déplier le menu' : 'Replier le menu'}
          className={cn(
            'absolute top-4 left-full z-50 hidden h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-opacity duration-150 hover:text-foreground lg:flex',
            collapsed && 'opacity-0 group-hover:opacity-100',
          )}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-3.5 w-3.5" />
          ) : (
            <PanelLeftClose className="h-3.5 w-3.5" />
          )}
        </button>
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
              <FiltersBar actionsRef={setFilterActionsNode} />
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
          <AppBarProvider node={actionsNode} filterNode={filterActionsNode}>
            <Outlet />
          </AppBarProvider>
        </main>
      </div>

      {/* Barre du bas, mobile seulement : de une à cinq entrées, réglables dans
          Paramètres → Général (`preferences.mobileNav`), le dashboard au centre par défaut. Le tiroir
          garde **tout**, ces trois-là compris — y chercher un écran ne doit jamais donner
          un trou.

          En `z-30`, sous le voile du tiroir (`z-40`) : à z-index égal, c'est l'ordre du
          DOM qui tranche, et la barre serait passée par-dessus le voile. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card lg:hidden"
        style={{ paddingBottom: BOTTOM_SAFE_AREA }}
        aria-label="Accès rapide"
      >
        <div
          className="grid"
          style={{
            height: BOTTOM_NAV_HEIGHT,
            gridTemplateColumns: `repeat(${mobileNav.length}, minmax(0, 1fr))`,
          }}
        >
          {mobileNav.map(({ to, label, short, icon: Icon, end }, slot) => (
            <NavLink
              key={`${slot}:${to}`}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'relative flex flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium transition-colors',
                  isItemActive(to, isActive) ? 'text-primary' : 'text-muted-foreground',
                )
              }
            >
              {({ isActive: routeActive }) => {
                const isActive = isItemActive(to, routeActive);
                return (
                  <>
                    {/* Un trait en haut de l'onglet actif : sur un bandeau collé au bord,
                        c'est le repère le plus lisible, et il ne mange aucune hauteur. */}
                    {isActive && (
                      <span
                        className="absolute inset-x-6 top-0 h-0.5 rounded-b bg-primary"
                        aria-hidden
                      />
                    )}
                    <span className="relative">
                      <Icon className="h-5 w-5" />
                      <NavBadgePill badge={badges[to]} className="absolute -right-2.5 -top-1.5" />
                    </span>
                    <span className="w-full truncate text-center">{short ?? label}</span>
                  </>
                );
              }}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
};
