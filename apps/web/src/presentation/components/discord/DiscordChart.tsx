import { useMemo } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DiscordSnapshot } from '../../../domain/integration/entities/DiscordHistory.ts';
import { formatNumber } from '../../../shared/format.ts';

const MEMBERS_COLOR = 'var(--cash)';
const ONLINE_COLOR = 'var(--positive)';

const formatTick = (value: string): string =>
  new Date(value).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

/**
 * Membres et connectés, **une ligne par collecte** — pas un bucket par jour comme
 * Domadoo : le relevé Discord n'a pas de nature cumulative à reconstruire, chaque
 * passage horaire écrit déjà un point utilisable tel quel.
 *
 * Les deux séries partagent un seul axe : un connecté est toujours un membre, les deux
 * valeurs sont donc du même ordre de grandeur — contrairement à un gain et un solde, un
 * second axe n'apporterait rien qu'une confusion.
 */
export const DiscordChart = ({ snapshots }: { snapshots: DiscordSnapshot[] }) => {
  const rows = useMemo(
    () =>
      snapshots.map((snapshot) => ({
        fetchedAt: snapshot.fetchedAt,
        members: snapshot.members,
        membersOnline: snapshot.membersOnline,
      })),
    [snapshots],
  );

  const empty = rows.every((row) => row.members === null && row.membersOnline === null);

  if (empty) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        Aucun relevé sur cette période.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="fetchedAt"
          tickFormatter={formatTick}
          tick={{ fontSize: 11 }}
          stroke="var(--muted-foreground)"
          minTickGap={32}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 11 }}
          stroke="var(--muted-foreground)"
          width={48}
        />
        <Tooltip
          cursor={{ stroke: 'var(--muted-foreground)', strokeDasharray: '3 3' }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            return (
              <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
                <p className="mb-1 text-[11px] text-muted-foreground">
                  {formatTick(String(label))}
                </p>
                {payload.map((entry, index) => (
                  <p key={index} className="font-semibold tabular text-popover-foreground">
                    {typeof entry.value !== 'number' ? '—' : formatNumber(entry.value)}{' '}
                    <span className="font-normal text-muted-foreground">
                      {entry.dataKey === 'members' ? 'membres' : 'connectés'}
                    </span>
                  </p>
                ))}
              </div>
            );
          }}
        />
        <Legend
          formatter={(value) => (value === 'members' ? 'Membres' : 'Connectés')}
          wrapperStyle={{ fontSize: 11 }}
        />
        {/* `connectNulls` : un fetch en échec ne doit pas briser la courbe. */}
        <Line
          type="monotone"
          dataKey="members"
          stroke={MEMBERS_COLOR}
          strokeWidth={2}
          dot={false}
          connectNulls
        />
        <Line
          type="monotone"
          dataKey="membersOnline"
          stroke={ONLINE_COLOR}
          strokeWidth={2}
          dot={false}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
};
