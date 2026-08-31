import type { AnalyticsResult } from '../../domain/analytics/entities/Analytics.ts';
import { formatMoney, formatNumber, formatSigned } from '../../shared/format.ts';
import { Card, CardHeader, CardTitle } from './ui/card.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table.tsx';
import { cn } from '../../shared/cn.ts';

interface ChannelBreakdownProps {
  data: AnalyticsResult;
}

/**
 * Comparatif chaîne par chaîne sur la période.
 *
 * Les revenus non rattachés à une chaîne n'apparaissent dans aucune ligne : la somme
 * des lignes peut donc être inférieure au total du dashboard, c'est volontaire.
 */
export const ChannelBreakdown = ({ data }: ChannelBreakdownProps) => {
  if (data.byChannel.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Par chaîne</CardTitle>
      </CardHeader>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Chaîne</TableHead>
            <TableHead className="text-right">Vues</TableHead>
            <TableHead className="text-right">Abonnés</TableHead>
            <TableHead className="text-right">Solde abonnés</TableHead>
            <TableHead className="text-right">Encaissé</TableHead>
            <TableHead className="text-right">En nature</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.byChannel.map((channel) => (
            <TableRow key={channel.channelId}>
              <TableCell className="font-medium">
                <span className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: channel.color }}
                    aria-hidden
                  />
                  {channel.channelName}
                </span>
              </TableCell>
              <TableCell className="text-right tabular">{formatNumber(channel.views)}</TableCell>
              <TableCell className="text-right tabular">
                {channel.subscribersTotal === null ? '—' : formatNumber(channel.subscribersTotal)}
              </TableCell>
              <TableCell
                className={cn(
                  'text-right tabular',
                  channel.subscribersNet > 0 && 'text-[var(--positive)]',
                  channel.subscribersNet < 0 && 'text-[var(--negative)]',
                )}
              >
                {formatSigned(channel.subscribersNet)}
              </TableCell>
              <TableCell className="text-right tabular">
                {formatMoney(channel.revenueCashCents)}
              </TableCell>
              <TableCell className="text-right tabular text-muted-foreground">
                {channel.inKindCents === 0 ? '—' : formatMoney(channel.inKindCents)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
};
