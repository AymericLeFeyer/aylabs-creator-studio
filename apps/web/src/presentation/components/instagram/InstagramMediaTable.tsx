import { useState } from 'react';
import { ArrowDown, ArrowUp, ExternalLink } from 'lucide-react';
import type { InstagramMedia } from '../../../domain/instagram/entities/Instagram.ts';
import { formatCount, MEDIA_TYPE_LABELS } from '../../../domain/instagram/entities/Instagram.ts';
import { Card } from '../ui/card.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table.tsx';
import { formatDate } from '../../../shared/format.ts';
import { cn } from '../../../shared/cn.ts';

type Column = 'date' | 'views' | 'reach' | 'likes' | 'comments' | 'saved';

const COLUMNS: Array<{ id: Column; label: string; numeric: boolean }> = [
  { id: 'date', label: 'Date', numeric: false },
  { id: 'views', label: 'Vues', numeric: true },
  { id: 'reach', label: 'Portée', numeric: true },
  { id: 'likes', label: 'J’aime', numeric: true },
  { id: 'comments', label: 'Commentaires', numeric: true },
  { id: 'saved', label: 'Enregistrements', numeric: true },
];

export interface InstagramMediaTableProps {
  media: InstagramMedia[];
}

/**
 * Les publications de la période.
 *
 * Triable par en-tête, premier clic décroissant — sur des vues, c'est presque toujours ce
 * qu'on cherche. Même mécanique que le tableau de performance par vidéo.
 *
 * Une publication dont `statsAt` est `null` n'a **pas encore été mesurée** : ses colonnes
 * affichent « — » et non zéro. La distinction compte : un post publié il y a dix minutes
 * n'a pas fait un flop, il n'a pas encore été relevé.
 */
export const InstagramMediaTable = ({ media }: InstagramMediaTableProps) => {
  const [column, setColumn] = useState<Column>('date');
  const [descending, setDescending] = useState(true);

  const sorted = [...media].sort((a, b) => {
    const factor = descending ? -1 : 1;
    if (column === 'date') return a.postedAt.localeCompare(b.postedAt) * factor;
    return ((a[column] ?? -1) - (b[column] ?? -1)) * factor;
  });

  const toggle = (next: Column) => {
    if (next === column) setDescending((current) => !current);
    else {
      setColumn(next);
      setDescending(true);
    }
  };

  if (media.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        Aucune publication sur cette période.
      </Card>
    );
  }

  return (
    <Card className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[46px]" />
            <TableHead>Publication</TableHead>
            {COLUMNS.map((entry) => (
              <TableHead
                key={entry.id}
                className={cn('cursor-pointer select-none', entry.numeric && 'text-right')}
                onClick={() => toggle(entry.id)}
              >
                <span
                  className={cn(
                    'inline-flex items-center gap-1',
                    entry.numeric && 'flex-row-reverse',
                  )}
                >
                  {entry.label}
                  {column === entry.id &&
                    (descending ? (
                      <ArrowDown className="h-3 w-3" />
                    ) : (
                      <ArrowUp className="h-3 w-3" />
                    ))}
                </span>
              </TableHead>
            ))}
            <TableHead className="w-[40px]" />
          </TableRow>
        </TableHeader>

        <TableBody>
          {sorted.map((item) => (
            <TableRow key={item.id}>
              <TableCell>
                {item.thumbnailUrl ? (
                  <img
                    src={item.thumbnailUrl}
                    alt=""
                    className="h-10 w-10 rounded object-cover"
                    loading="lazy"
                  />
                ) : (
                  <span className="block h-10 w-10 rounded bg-muted" aria-hidden />
                )}
              </TableCell>

              <TableCell className="max-w-[320px]">
                <p className="truncate text-sm">
                  {item.caption?.split('\n')[0] || '(sans légende)'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {MEDIA_TYPE_LABELS[item.mediaType ?? ''] ?? item.mediaType ?? '—'}
                  {item.statsAt === null && ' · pas encore mesurée'}
                </p>
              </TableCell>

              <TableCell className="whitespace-nowrap text-sm">{formatDate(item.date)}</TableCell>
              <TableCell className="text-right tabular">{formatCount(item.views)}</TableCell>
              <TableCell className="text-right tabular">{formatCount(item.reach)}</TableCell>
              <TableCell className="text-right tabular">{formatCount(item.likes)}</TableCell>
              <TableCell className="text-right tabular">{formatCount(item.comments)}</TableCell>
              <TableCell className="text-right tabular">{formatCount(item.saved)}</TableCell>

              <TableCell>
                {item.permalink && (
                  <a
                    href={item.permalink}
                    target="_blank"
                    rel="noreferrer"
                    className="text-muted-foreground hover:text-foreground"
                    title="Ouvrir sur Instagram"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
};
