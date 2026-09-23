/**
 * Étiquette flottante d'un item de menu **replié** : contrairement à l'infobulle native
 * du navigateur, elle apparaît **sans délai**. Le menu replié n'a que des icônes — il
 * faut pouvoir les identifier d'un survol, pas d'une seconde d'attente.
 *
 * Positionnée en `absolute` : l'élément qui la porte doit être `relative` et porter
 * `group`, pour que `group-hover:opacity-100` la révèle.
 */
export const CompactTooltip = ({ label }: { label: string }) => (
  <span
    role="tooltip"
    className="pointer-events-none absolute top-1/2 left-full z-50 ml-2 -translate-y-1/2 rounded-md border border-border bg-popover px-2 py-1 text-xs font-medium whitespace-nowrap text-popover-foreground opacity-0 shadow-md transition-opacity duration-75 group-hover:opacity-100"
  >
    {label}
  </span>
);
