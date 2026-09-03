import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown, ExternalLink } from 'lucide-react';
import type { AnalyticsResult } from '../../../domain/analytics/entities/Analytics.ts';
import { NATURE_LABELS } from '../../../domain/category/entities/Category.ts';
import { youtubeUrl } from '../../../domain/video/entities/Video.ts';
import { useFilters } from '../../hooks/useFilters.tsx';
import { formatDate, formatMoney, formatNumber, formatSigned } from '../../../shared/format.ts';
import { cn } from '../../../shared/cn.ts';
import { Card, CardHeader, CardTitle } from '../ui/card.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table.tsx';
import { sumVideoRows, withMoney, type VideoRow } from './videoPerformance.ts';

type SortKey =
  | 'date'
  | 'views'
  | 'periodViews'
  | 'subscribersGained'
  | 'adsenseCents'
  | 'manualCashCents'
  | 'inKindCents'
  | 'revenueCents'
  | 'expenseCents'
  | 'profitCents';

interface Column {
  key: SortKey;
  label: string;
  /** La colonne « Vidéo » porte la miniature et le titre : elle reste alignée à gauche. */
  numeric: boolean;
}

/**
 * Les colonnes se lisent de gauche à droite comme le calcul se fait : les composantes
 * du CA, puis le CA, puis ce qu'on en retranche, puis le bénéfice.
 *
 * La colonne « Produits reçus » n'apparaît que si la case de l'en-tête est cochée :
 * décochée, ces montants ne sont plus dans le CA, et les laisser en colonne ferait
 * lire une addition qui ne tombe pas juste.
 */
const columnsFor = (includeInKind: boolean, showPeriodViews: boolean): Column[] =>
  [
    { key: 'date', label: 'Vidéo', numeric: false },
    // « Vues » reste le cumul depuis la sortie ; « Sur la période » dit ce que la vidéo
    // a rapporté pendant la fenêtre affichée. Les deux côte à côte, parce que sur un
    // catalogue c'est justement l'écart entre les deux qui est l'information.
    ...(showPeriodViews
      ? [{ key: 'periodViews' as const, label: 'Vues (période)', numeric: true }]
      : []),
    { key: 'views', label: 'Vues (total)', numeric: true },
    { key: 'subscribersGained', label: 'Abonnés', numeric: true },
    { key: 'adsenseCents', label: 'AdSense', numeric: true },
    { key: 'manualCashCents', label: 'Revenus liés', numeric: true },
    ...(includeInKind
      ? [{ key: 'inKindCents' as const, label: NATURE_LABELS.in_kind, numeric: true }]
      : []),
    { key: 'revenueCents', label: 'CA', numeric: true },
    { key: 'expenseCents', label: 'Dépenses liées', numeric: true },
    { key: 'profitCents', label: 'Bénéfices', numeric: true },
  ] satisfies Column[];

interface VideoPerformanceTableProps {
  data: AnalyticsResult;
  /**
   * Les lignes à afficher. Par défaut les sorties de la période ; l'écran Contenu passe
   * ici le **catalogue** (les vidéos publiées avant la période) pour montrer, avec le
   * même tableau, que l'audience ne vient pas que des nouveautés.
   */
  rows?: AnalyticsResult['videoPerformance'];
  title?: string;
  subtitle?: string;
  emptyLabel?: string;
}

/**
 * Le détail chiffré, une colonne par nature d'argent plutôt qu'un seul montant :
 * l'AdSense collecté, les revenus saisis, les avantages en nature et les dépenses ne
 * se remplacent pas et ne se lisent pas de la même façon.
 *
 * `CA` et `Bénéfices` sont tous deux affichés, quel que soit l'interrupteur CA /
 * Bénéfices de l'en-tête : ici la soustraction se lit sur la ligne, `Bénéfices = CA −
 * Dépenses liées`. Les produits reçus ne comptent dans le CA — et n'ont donc leur
 * colonne — que si la case de l'en-tête est cochée (même règle que partout, `revenueMath`).
 *
 * Chaque en-tête trie au clic. Le premier clic part du plus grand — sur des vues ou
 * des euros, c'est presque toujours ce qu'on cherche ; la date fait exception et part
 * du plus récent.
 */
export const VideoPerformanceTable = ({
  data,
  rows: source,
  title = 'Vidéos de la période',
  subtitle,
  emptyLabel = 'Aucune sortie sur cette période.',
}: VideoPerformanceTableProps) => {
  const { moneyMode, includeInKind } = useFilters();
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'date', desc: true });

  const input = source ?? data.videoPerformance;
  const rows = useMemo(
    () => withMoney(input, { mode: moneyMode, includeInKind }),
    [input, moneyMode, includeInKind],
  );

  /**
   * La colonne « période » n'apparaît que si au moins une ligne sait répondre.
   *
   * L'historique des relevés commence à la première collecte : sur une base qui n'en a
   * pas encore, une colonne entièrement remplie de « — » ferait croire à une panne. Elle
   * apparaîtra d'elle-même dès qu'il y aura deux relevés encadrant la période.
   */
  const showPeriodViews = useMemo(() => rows.some((row) => row.periodViews !== null), [rows]);

  const columns = useMemo(
    () => columnsFor(includeInKind, showPeriodViews),
    [includeInKind, showPeriodViews],
  );

  // Décocher la case fait disparaître la colonne « Produits reçus » : sans ce repli, le
  // tableau resterait trié sur une colonne devenue invisible, sans moyen d'en changer.
  const activeSort = useMemo(
    () =>
      columns.some((column) => column.key === sort.key)
        ? sort
        : { key: 'date' as SortKey, desc: true },
    [columns, sort],
  );

  const sorted = useMemo(() => {
    const compare = (a: VideoRow, b: VideoRow): number =>
      activeSort.key === 'date'
        ? a.date < b.date
          ? -1
          : a.date > b.date
            ? 1
            : 0
        : activeSort.key === 'periodViews'
          ? // Les non mesurables ferment le classement, quel que soit le sens du tri.
            (a.periodViews ?? -1) - (b.periodViews ?? -1)
          : a[activeSort.key] - b[activeSort.key];

    return [...rows].sort((a, b) => (activeSort.desc ? compare(b, a) : compare(a, b)));
  }, [rows, activeSort]);

  const totals = useMemo(() => sumVideoRows(rows), [rows]);

  const toggleSort = (key: SortKey) =>
    setSort((current) =>
      current.key === key ? { key, desc: !current.desc } : { key, desc: true },
    );

  if (rows.length === 0) {
    return (
      <Card className="flex flex-col">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <p className="px-5 pb-8 text-center text-sm text-muted-foreground">{emptyLabel}</p>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle>{title}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {subtitle ??
            `${rows.length} sortie${rows.length > 1 ? 's' : ''} · clique un en-tête pour trier`}
        </p>
      </CardHeader>

      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => {
              const isActive = activeSort.key === column.key;
              return (
                <TableHead key={column.key} className={cn(column.numeric && 'text-right')}>
                  <button
                    type="button"
                    onClick={() => toggleSort(column.key)}
                    aria-sort={isActive ? (activeSort.desc ? 'descending' : 'ascending') : 'none'}
                    className={cn(
                      'inline-flex items-center gap-1 whitespace-nowrap rounded transition-colors hover:text-foreground',
                      column.numeric && 'flex-row-reverse',
                      isActive && 'text-foreground',
                    )}
                  >
                    {column.label}
                    {isActive ? (
                      activeSort.desc ? (
                        <ArrowDown className="h-3 w-3" />
                      ) : (
                        <ArrowUp className="h-3 w-3" />
                      )
                    ) : (
                      <ChevronsUpDown className="h-3 w-3 opacity-40" />
                    )}
                  </button>
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>

        <TableBody>
          {sorted.map((row) => (
            <TableRow key={row.videoId}>
              <TableCell>
                <div className="flex items-center gap-2.5">
                  {row.thumbnailUrl && (
                    <img
                      src={row.thumbnailUrl}
                      alt=""
                      loading="lazy"
                      className="hidden h-8 w-14 shrink-0 rounded object-cover sm:block"
                    />
                  )}
                  <div className="min-w-0">
                    <a
                      href={youtubeUrl(row.externalId)}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 font-medium hover:underline"
                      title={row.title}
                    >
                      <span className="line-clamp-1 max-w-[18rem]">{row.title}</span>
                      <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                    </a>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: row.channelColor }}
                        aria-hidden
                      />
                      <span className="truncate">
                        {row.channelName} · {formatDate(row.date)}
                      </span>
                    </span>
                  </div>
                </div>
              </TableCell>
              {/* « — » et non « 0 » tant qu'aucune collecte n'a mesuré la vidéo. */}
              {showPeriodViews && (
                <TableCell
                  className="text-right tabular font-medium"
                  title={
                    row.periodViews === null
                      ? "Pas encore mesurable : il manque un relevé antérieur à la période. L'historique se constitue à chaque collecte."
                      : undefined
                  }
                >
                  {row.periodViews === null ? '—' : formatNumber(row.periodViews)}
                </TableCell>
              )}
              <TableCell className="text-right tabular text-muted-foreground">
                {row.hasStats ? formatNumber(row.views) : '—'}
              </TableCell>
              <TableCell className="text-right tabular">
                {row.hasStats ? formatSigned(row.subscribersGained) : '—'}
              </TableCell>
              <TableCell className="text-right tabular text-muted-foreground">
                {formatMoney(row.adsenseCents)}
              </TableCell>
              <TableCell className="text-right tabular text-muted-foreground">
                {formatMoney(row.manualCashCents)}
              </TableCell>
              {includeInKind && (
                <TableCell className="text-right tabular text-[var(--in-kind)]">
                  {formatMoney(row.inKindCents)}
                </TableCell>
              )}
              <TableCell className="text-right tabular">{formatMoney(row.revenueCents)}</TableCell>
              <TableCell className="text-right tabular text-[var(--expense)]">
                {row.expenseCents === 0 ? formatMoney(0) : `−${formatMoney(row.expenseCents)}`}
              </TableCell>
              <TableCell
                className={cn(
                  'text-right tabular font-medium',
                  row.profitCents < 0 && 'text-[var(--negative)]',
                )}
              >
                {formatMoney(row.profitCents)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>

        <tfoot>
          <TableRow className="border-t-2 border-border font-medium hover:bg-transparent">
            <TableCell className="whitespace-nowrap">Total ({rows.length})</TableCell>
            {showPeriodViews && (
              <TableCell className="text-right tabular">
                {formatNumber(totals.periodViews)}
              </TableCell>
            )}
            <TableCell className="text-right tabular">{formatNumber(totals.views)}</TableCell>
            <TableCell className="text-right tabular">
              {formatSigned(totals.subscribersGained)}
            </TableCell>
            <TableCell className="text-right tabular">{formatMoney(totals.adsenseCents)}</TableCell>
            <TableCell className="text-right tabular">
              {formatMoney(totals.manualCashCents)}
            </TableCell>
            {includeInKind && (
              <TableCell className="text-right tabular text-[var(--in-kind)]">
                {formatMoney(totals.inKindCents)}
              </TableCell>
            )}
            <TableCell className="text-right tabular">{formatMoney(totals.revenueCents)}</TableCell>
            <TableCell className="text-right tabular text-[var(--expense)]">
              {totals.expenseCents === 0 ? formatMoney(0) : `−${formatMoney(totals.expenseCents)}`}
            </TableCell>
            <TableCell
              className={cn(
                'text-right tabular',
                totals.profitCents < 0 && 'text-[var(--negative)]',
              )}
            >
              {formatMoney(totals.profitCents)}
            </TableCell>
          </TableRow>
        </tfoot>
      </Table>
    </Card>
  );
};
