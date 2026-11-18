import { useState } from 'react';
import { CalendarClock, Pencil, Plus, Radio, Trash2 } from 'lucide-react';
import {
  useDeleteLiveIdea,
  useLiveIdeas,
} from '../../../application/live/usecases/useLiveIdeas.ts';
import type { LiveIdea } from '../../../domain/live/entities/LiveIdea.ts';
import { formatDate } from '../../../shared/format.ts';
import { localToday } from '../../../application/planning/usecases/usePlanning.ts';
import { Button } from '../ui/button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card.tsx';
import { LiveIdeaDialog } from './LiveIdeaDialog.tsx';

/** Les directs à faire, datés d'abord. Les datés se retrouvent dans le planning. */
export const LiveIdeasPanel = () => {
  const { data: lives = [] } = useLiveIdeas();
  const remove = useDeleteLiveIdea();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LiveIdea | null>(null);
  const today = localToday();

  const open = (live: LiveIdea | null) => {
    setEditing(live);
    setDialogOpen(true);
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Radio className="h-4 w-4" />
          Directs à faire
          {lives.length > 0 && (
            <span className="font-normal text-muted-foreground">· {lives.length}</span>
          )}
        </CardTitle>
        <Button size="sm" variant="outline" onClick={() => open(null)}>
          <Plus className="mr-1 h-4 w-4" />
          Nouvelle idée
        </Button>
      </CardHeader>

      <CardContent>
        {lives.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            Note ici les directs que tu veux faire. Donne-leur une date : ils apparaissent alors
            dans le planning.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {lives.map((live) => {
              const past = live.plannedDate !== null && live.plannedDate < today;
              return (
                <li key={live.id} className="group flex items-start gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{live.title}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CalendarClock className="h-3 w-3" />
                      {live.plannedDate ? (
                        <span className={past ? 'text-destructive' : undefined}>
                          {formatDate(live.plannedDate)}
                          {live.startTime && ` à ${live.startTime}`}
                          {live.startTime && ` · ${live.durationMinutes} min`}
                        </span>
                      ) : (
                        'Pas encore de date'
                      )}
                    </p>
                    {live.notes && (
                      <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">
                        {live.notes}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    title="Modifier"
                    onClick={() => open(live)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    <span className="sr-only">Modifier « {live.title} »</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    title="Supprimer"
                    onClick={() => {
                      if (window.confirm(`Supprimer « ${live.title} » ?`)) remove.mutate(live.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    <span className="sr-only">Supprimer « {live.title} »</span>
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      <LiveIdeaDialog open={dialogOpen} live={editing} onOpenChange={setDialogOpen} />
    </Card>
  );
};
