import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown, ExternalLink } from 'lucide-react';
import type { AnalyticsResult } from '../../../domain/analytics/entities/Analytics.ts';
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
  | 'subscribersGained'
  | 'adsenseCents'
  | 'manualCashCents'
  | 'inKindCents'
  | 'expenseCents'
  | 'moneyCents';

interface Column {
  key: SortKey;
  label: string;
  /** La colonne « Vidéo » porte la miniature et le titre : elle reste alignée à gauche. */
  numeric: boolean;
}

const COLUMNS: Column[] = [
  { key: 'date', label: 'Vidéo', numeric: false },
  { key: 'views', label: 'Vues', numeric: true },
  { key: 'subscribersGained', label: 'Abonnés', numeric: true },
  { key: 'adsenseCents', label: 'AdSense', numeric: true },
  { key: 'manualCashCents', label: 'Revenus liés', numeric: true },
  { key: 'inKindCents', label: 'En nature', numeric: true },
  { key: 'expenseCents', label: 'Dépenses liées', numeric: true },
  { key: 'moneyCents', label: 'Total', numeric: true },
];

interface VideoPerformanceTableProps {
  data: AnalyticsResult;
}

/**
 * Le détail chiffré, une colonne par nature d'argent plutôt qu'un seul montant :
 * l'AdSense collecté, les revenus saisis, les avantages en nature et les dépenses ne
 * se remplacent pas et ne se lisent pas de la même façon.
 *
 * Chaque en-tête trie au clic. Le premier clic part du plus grand — sur des vues ou
 * des euros, c'est presque toujours ce qu'on cherche ; la date fait exception et part
 * du plus récent.
 */
export const VideoPerformanceTable = ({ data }: VideoPerformanceTableProps) => {
  const { moneyMode, includeInKind } = useFilters();
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'date', desc: true });

  const rows = useMemo(
    () => withMoney(data.videoPerformance, { mode: moneyMode, includeInKind }),
    [data.videoPerformance, moneyMode, includeInKind],
  );

  const sorted = useMemo(() => {
    const compare = (a: VideoRow, b: VideoRow): number =>
      sort.key === 'date'
        ? a.date < b.date
          ? -1
          : a.date > b.date
            ? 1
            : 0
        : a[sort.key] - b[sort.key];

    return [...rows].sort((a, b) => (sort.desc ? compare(b, a) : compare(a, b)));
  }, [rows, sort]);

  const totals = useMemo(() => sumVideoRows(rows), [rows]);

  const toggleSort = (key: SortKey) =>
    setSort((current) =>
      current.key === key ? { key, desc: !current.desc } : { key, desc: true },
    );

  if (rows.length === 0) {
    return (
      <Card className="flex flex-col">
        <CardHeader>
          <CardTitle>Vidéos de la période</CardTitle>
        </CardHeader>
        <p className="px-5 pb-8 text-center text-sm text-muted-foreground">
          Aucune sortie sur cette période.
        </p>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle>Vidéos de la période</CardTitle>
        <p className="text-xs text-muted-foreground">
          {rows.length} sortie{rows.length > 1 ? 's' : ''} · clique un en-tête pour trier
        </p>
      </CardHeader>

      <Table>
        <TableHeader>
          <TableRow>
            {COLUMNS.map((column) => {
              const isActive = sort.key === column.key;
              return (
                <TableHead key={column.key} className={cn(column.numeric && 'text-right')}>
                  <button
                    type="button"
                    onClick={() => toggleSort(column.key)}
                    aria-sort={isActive ? (sort.desc ? 'descending' : 'ascending') : 'none'}
                    className={cn(
                      'inline-flex items-center gap-1 whitespace-nowrap rounded transition-colors hover:text-foreground',
                      column.numeric && 'flex-row-reverse',
                      isActive && 'text-foreground',
                    )}
                  >
                    {column.label}
                    {isActive ? (
                      sort.desc ? (
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
              <TableCell className="text-right tabular">
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
              <TableCell className="text-right tabular text-[var(--in-kind)]">
                {formatMoney(row.inKindCents)}
              </TableCell>
              <TableCell className="text-right tabular text-[var(--expense)]">
                {row.expenseCents === 0 ? formatMoney(0) : `−${formatMoney(row.expenseCents)}`}
              </TableCell>
              <TableCell className="text-right tabular font-medium">
                {formatMoney(row.moneyCents)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>

        <tfoot>
          <TableRow className="border-t-2 border-border font-medium hover:bg-transparent">
            <TableCell className="whitespace-nowrap">Total ({rows.length})</TableCell>
            <TableCell className="text-right tabular">{formatNumber(totals.views)}</TableCell>
            <TableCell className="text-right tabular">
              {formatSigned(totals.subscribersGained)}
            </TableCell>
            <TableCell className="text-right tabular">{formatMoney(totals.adsenseCents)}</TableCell>
            <TableCell className="text-right tabular">
              {formatMoney(totals.manualCashCents)}
            </TableCell>
            <TableCell className="text-right tabular text-[var(--in-kind)]">
              {formatMoney(totals.inKindCents)}
            </TableCell>
            <TableCell className="text-right tabular text-[var(--expense)]">
              {totals.expenseCents === 0 ? formatMoney(0) : `−${formatMoney(totals.expenseCents)}`}
            </TableCell>
            <TableCell className="text-right tabular">{formatMoney(totals.moneyCents)}</TableCell>
          </TableRow>
        </tfoot>
      </Table>
    </Card>
  );
};
