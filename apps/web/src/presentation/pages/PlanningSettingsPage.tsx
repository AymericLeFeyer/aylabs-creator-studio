import { useState } from 'react';
import { Copy, Plus, RefreshCw, Trash2 } from 'lucide-react';
import {
  useCalendars,
  usePlanningSettings,
  useReplaceWorkHours,
  useUpdatePlanningSettings,
  useWorkHours,
} from '../../application/planning/usecases/usePlanning.ts';
import { WEEKDAY_LABELS, type WorkHoursInput } from '../../domain/planning/entities/Planning.ts';
import { Button } from '../components/ui/button.tsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card.tsx';
import { Checkbox } from '../components/ui/checkbox.tsx';
import { Input } from '../components/ui/input.tsx';
import { Label } from '../components/ui/label.tsx';
import { cn } from '../../shared/cn.ts';

/** Journée proposée quand on ouvre un jour vide : c'est la plus courante. */
const DEFAULT_RANGE = { startTime: '09:00', endTime: '12:30' };

/**
 * Les réglages du planning : quand je travaille, et sur quel agenda.
 *
 * Les deux vivent dans le même écran parce qu'ils répondent à la même question — « où
 * le moteur a-t-il le droit de poser un créneau ». Les horaires disent le cadre, l'agenda
 * dit ce qui l'occupe déjà.
 */
export const PlanningSettingsPage = () => (
  <div className="space-y-4">
    <div>
      <h2 className="font-semibold">Planning</h2>
      <p className="text-sm text-muted-foreground">
        Quand tu travailles, et l’agenda que le planning doit respecter.
      </p>
    </div>

    <div className="grid gap-4 xl:grid-cols-2">
      <WorkHoursSettings />
      <div className="space-y-4">
        <CalendarSettings />
        <EngineSettings />
      </div>
    </div>
  </div>
);

/**
 * La semaine type.
 *
 * L'édition est **locale jusqu'à l'enregistrement** : on décale trois horaires d'affilée,
 * et une requête par frappe enverrait une grille à moitié corrigée. Le bouton
 * n'apparaît que s'il y a quelque chose à enregistrer.
 */
const WorkHoursSettings = () => {
  const { data: saved = [] } = useWorkHours();
  const replace = useReplaceWorkHours();

  const [draft, setDraft] = useState<WorkHoursInput[] | null>(null);
  const [loadedFrom, setLoadedFrom] = useState<string>('');

  // La grille se recharge quand le serveur en renvoie une différente, sans effet :
  // même pattern que les formulaires du projet.
  const signature = saved
    .map((range) => `${range.weekday}${range.startTime}${range.endTime}`)
    .join();
  if (draft === null || loadedFrom !== signature) {
    if (draft === null || !replace.isPending) {
      setLoadedFrom(signature);
      setDraft(
        saved.map((range) => ({
          weekday: range.weekday,
          startTime: range.startTime,
          endTime: range.endTime,
        })),
      );
    }
  }

  const ranges = draft ?? [];
  const dirty =
    JSON.stringify(ranges) !==
    JSON.stringify(
      saved.map((r) => ({ weekday: r.weekday, startTime: r.startTime, endTime: r.endTime })),
    );

  const update = (index: number, patch: Partial<WorkHoursInput>) =>
    setDraft(ranges.map((range, i) => (i === index ? { ...range, ...patch } : range)));

  const addRange = (weekday: number) =>
    setDraft([...ranges, { weekday, ...DEFAULT_RANGE }].sort((a, b) => a.weekday - b.weekday));

  /** Recopier un jour sur toute la semaine : les cinq jours ouvrés sont souvent identiques. */
  const copyToWeekdays = (weekday: number) => {
    const source = ranges.filter((range) => range.weekday === weekday);
    if (source.length === 0) return;
    const others = ranges.filter((range) => range.weekday > 4 || range.weekday === weekday);
    const copies: WorkHoursInput[] = [];
    for (let day = 0; day <= 4; day += 1) {
      if (day === weekday) continue;
      copies.push(...source.map((range) => ({ ...range, weekday: day })));
    }
    setDraft([...others, ...copies].sort((a, b) => a.weekday - b.weekday));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Horaires de travail</CardTitle>
        <CardDescription>
          Le planning ne pose de créneau que là-dedans. Plusieurs plages par jour : la coupure du
          midi n’est pas du temps de montage.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-2">
        {WEEKDAY_LABELS.map((label, weekday) => {
          const dayRanges = ranges
            .map((range, index) => ({ range, index }))
            .filter((entry) => entry.range.weekday === weekday);

          return (
            <div
              key={label}
              className={cn(
                'rounded-md border border-border p-2.5',
                dayRanges.length === 0 && 'bg-muted/30',
              )}
            >
              <div className="flex items-center gap-2">
                <span className="w-24 shrink-0 text-sm font-medium">{label}</span>
                {dayRanges.length === 0 && (
                  <span className="flex-1 text-xs text-muted-foreground">Non travaillé</span>
                )}
                <div className="ml-auto flex gap-0.5">
                  {weekday <= 4 && dayRanges.length > 0 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="Recopier sur lundi → vendredi"
                      onClick={() => copyToWeekdays(weekday)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      <span className="sr-only">Recopier sur la semaine</span>
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title="Ajouter une plage"
                    onClick={() => addRange(weekday)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span className="sr-only">Ajouter une plage à {label}</span>
                  </Button>
                </div>
              </div>

              {dayRanges.map(({ range, index }) => (
                <div key={index} className="mt-1.5 flex items-center gap-2 pl-24">
                  <Input
                    type="time"
                    value={range.startTime}
                    onChange={(event) => update(index, { startTime: event.target.value })}
                    className="h-8 w-28"
                    aria-label={`Début de plage, ${label}`}
                  />
                  <span className="text-muted-foreground">→</span>
                  <Input
                    type="time"
                    value={range.endTime}
                    onChange={(event) => update(index, { endTime: event.target.value })}
                    className="h-8 w-28"
                    aria-label={`Fin de plage, ${label}`}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setDraft(ranges.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    <span className="sr-only">Retirer cette plage</span>
                  </Button>
                </div>
              ))}
            </div>
          );
        })}

        {dirty && (
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setDraft(
                  saved.map((r) => ({
                    weekday: r.weekday,
                    startTime: r.startTime,
                    endTime: r.endTime,
                  })),
                )
              }
            >
              Annuler
            </Button>
            <Button
              size="sm"
              disabled={replace.isPending}
              onClick={() => replace.mutate(ranges.filter((r) => r.endTime > r.startTime))}
            >
              {replace.isPending ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

/**
 * La connexion à l'agenda, via Home Assistant.
 *
 * Une URL et un jeton, pas un OAuth Google de plus : l'instance porte déjà les
 * calendriers et sait les exposer. Le jeton **ne redescend jamais** de l'API — le champ
 * reste vide et n'écrase rien tant qu'on n'y tape pas quelque chose, exactement comme
 * le refresh token d'une chaîne.
 */
const CalendarSettings = () => {
  const { data: settings } = usePlanningSettings();
  const update = useUpdatePlanningSettings();
  const {
    data: calendars = [],
    isFetching,
    error,
    refetch,
  } = useCalendars(Boolean(settings?.calendarBaseUrl && settings?.hasToken));

  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [token, setToken] = useState('');

  const url = baseUrl ?? settings?.calendarBaseUrl ?? '';
  const busyIds = new Set(settings?.busyCalendarIds ?? []);

  const save = () => {
    const trimmed = url.trim();
    update.mutate({
      // Le `https://` manquant est complété : personne ne le tape, et une URL relative
      // ferait échouer la validation sans dire pourquoi.
      calendarBaseUrl: trimmed
        ? /^https?:\/\//.test(trimmed)
          ? trimmed
          : `https://${trimmed}`
        : null,
      ...(token ? { calendarToken: token } : {}),
    });
    setToken('');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Agenda (Home Assistant)</CardTitle>
        <CardDescription>
          Le planning lit tes rendez-vous pour ne pas poser de créneau dessus, et publie les
          créneaux <strong>approuvés</strong> dans le calendrier que tu choisis.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="ha-url">Adresse de l’instance</Label>
          <Input
            id="ha-url"
            placeholder="https://homeassistant.local:8123"
            value={url}
            onChange={(event) => setBaseUrl(event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ha-token">Jeton d’accès longue durée</Label>
          <Input
            id="ha-token"
            type="password"
            autoComplete="off"
            placeholder={settings?.hasToken ? '•••••••• (enregistré)' : 'Colle le jeton ici'}
            value={token}
            onChange={(event) => setToken(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Profil Home Assistant → Sécurité → « Créer un jeton ». Laisse vide pour conserver celui
            qui est enregistré.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={update.isPending} onClick={save}>
            {update.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
          {settings?.hasToken && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void refetch()}
                disabled={isFetching}
              >
                <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
                Relire les calendriers
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => update.mutate({ calendarToken: '' })}
                title="Oublier le jeton enregistré"
              >
                Déconnecter
              </Button>
            </>
          )}
        </div>

        {error && (
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : 'Lecture impossible'}
          </p>
        )}

        {calendars.length > 0 && (
          <>
            <div className="space-y-1.5 border-t border-border pt-3">
              <Label>Calendriers à respecter</Label>
              <p className="text-xs text-muted-foreground">
                Leurs événements bloquent le placement. Les journées entières sont affichées mais
                n’occupent rien : « congés » ne doit pas rendre la journée impossible.
              </p>
              <div className="space-y-1 pt-1">
                {calendars.map((calendar) => (
                  <div key={calendar.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`busy-${calendar.id}`}
                      checked={busyIds.has(calendar.id)}
                      onCheckedChange={(value) => {
                        const next = new Set(busyIds);
                        if (value === true) next.add(calendar.id);
                        else next.delete(calendar.id);
                        update.mutate({ busyCalendarIds: [...next] });
                      }}
                    />
                    <Label htmlFor={`busy-${calendar.id}`} className="font-normal">
                      {calendar.name}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-1.5 border-t border-border pt-3">
              <Label htmlFor="target-calendar">Calendrier où publier</Label>
              <select
                id="target-calendar"
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                value={settings?.targetCalendarId ?? ''}
                onChange={(event) =>
                  update.mutate({ targetCalendarId: event.target.value || null })
                }
              >
                <option value="">Ne rien publier</option>
                {calendars.map((calendar) => (
                  <option key={calendar.id} value={calendar.id}>
                    {calendar.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Seuls les créneaux <strong>approuvés</strong> y sont écrits. Home Assistant sait
                créer un événement, pas le modifier ni le supprimer : y publier des suggestions
                laisserait au premier replacement une traînée d’événements fantômes.
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

/** Le rythme de placement : la forme des créneaux que le moteur a le droit de poser. */
const EngineSettings = () => {
  const { data: settings } = usePlanningSettings();
  const update = useUpdatePlanningSettings();
  if (!settings) return null;

  const field = (
    id: string,
    label: string,
    value: number,
    hint: string,
    apply: (value: number) => void,
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        defaultValue={value}
        onBlur={(event) => {
          const parsed = Number(event.target.value);
          if (Number.isFinite(parsed) && parsed > 0 && parsed !== value) apply(Math.round(parsed));
        }}
        className="h-8"
      />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rythme de travail</CardTitle>
        <CardDescription>
          La forme des créneaux que le planning a le droit de poser.
        </CardDescription>
      </CardHeader>

      <CardContent className="grid gap-4 sm:grid-cols-2">
        {field(
          'min-block',
          'Séance minimale (min)',
          settings.minBlockMinutes,
          'En dessous, un créneau ne vaut pas la peine d’être posé.',
          (value) => update.mutate({ minBlockMinutes: value }),
        )}
        {field(
          'max-block',
          'Séance maximale (min)',
          settings.maxBlockMinutes,
          'Au-delà, une tâche longue est découpée en plusieurs séances.',
          (value) => update.mutate({ maxBlockMinutes: value }),
        )}
        {field(
          'break',
          'Respiration entre deux (min)',
          settings.breakMinutes,
          'Le temps laissé libre après chaque séance.',
          (value) => update.mutate({ breakMinutes: value }),
        )}
        {field(
          'horizon',
          'Horizon (jours)',
          settings.horizonDays,
          'Jusqu’où le planning a le droit de regarder devant lui.',
          (value) => update.mutate({ horizonDays: value }),
        )}

        <div className="flex items-start gap-2.5 sm:col-span-2">
          <Checkbox
            id="push-calendar"
            checked={settings.pushToCalendar}
            onCheckedChange={(value) => update.mutate({ pushToCalendar: value === true })}
            className="mt-0.5"
          />
          <div className="space-y-0.5">
            <Label htmlFor="push-calendar" className="font-normal">
              Publier les créneaux approuvés dans l’agenda
            </Label>
            <p className="text-xs text-muted-foreground">
              Décoché, tout reste dans l’outil : les rendez-vous sont toujours lus, rien n’est
              écrit.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
