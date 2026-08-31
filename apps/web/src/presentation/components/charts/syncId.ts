/**
 * Identifiant de synchronisation du survol, partagé par les graphiques du dashboard.
 *
 * Le graphique d'argent et celui d'audience portent la même abscisse (les buckets de
 * `series`) : avec le même `syncId`, Recharts affiche les deux infobulles au même
 * index, et une position lue à gauche se retrouve à droite sans chercher.
 * À ne poser que sur des graphiques construits sur `data.series` — un graphique aux
 * points différents (performance par vidéo) désignerait n'importe quoi.
 */
export const SYNC_ID = 'acs-dashboard';
