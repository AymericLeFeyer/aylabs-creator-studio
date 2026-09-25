import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, ListChecks, Plus, Trash2 } from 'lucide-react';
import {
  useCreateExternalApp,
  useDeleteExternalApp,
  useExternalApps,
  useUpdateExternalApp,
} from '../../application/externalApp/usecases/useExternalApps.ts';
import { usePlanningSettings } from '../../application/planning/usecases/usePlanning.ts';
import {
  resolveFrameUrl,
  EXTERNAL_APP_SECTIONS,
  externalAppPath,
  type ExternalApp,
  type ExternalAppIcon,
  type ExternalAppSection,
} from '../../domain/externalApp/entities/ExternalApp.ts';
import { EXTERNAL_APP_ICONS } from '../externalAppIcons.ts';
import { TodoConnectionCard } from '../components/settings/TodoConnectionCard.tsx';
import { Button } from '../components/ui/button.tsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card.tsx';
import { Input } from '../components/ui/input.tsx';
import { Label } from '../components/ui/label.tsx';
import { Switch } from '../components/ui/switch.tsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select.tsx';

/**
 * Le schéma manquant est complété, comme pour Todo et Home Assistant : `https://` pour une
 * adresse externe, `http://` pour une locale — une app du réseau local a rarement un
 * certificat.
 */
const normalizeUrl = (raw: string, scheme: 'https' | 'http' = 'https'): string | null => {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return /^https?:\/\//.test(trimmed) ? trimmed : `${scheme}://${trimmed}`;
};

/**
 * Paramètres → Applications externes : des outils ouverts **dans** le studio, depuis une
 * entrée du menu, plutôt que dans un onglet de plus.
 *
 * Deux cartes, parce que ce sont deux questions : **où** l'app apparaît (le menu, qui vaut
 * pour toutes), et comment le studio **parle** à Todo (la connexion, qui alimente aussi
 * le planning). La connexion vivait dans Paramètres → Planning ; elle est ici, à côté de
 * l'entrée de menu qu'elle nourrit.
 */
export const ExternalAppsSettingsPage = () => (
  <div className="space-y-4">
    <div>
      <h2 className="font-semibold">Applications externes</h2>
      <p className="text-sm text-muted-foreground">
        Des outils ouverts dans le studio depuis le menu. L’app tourne telle quelle dans un cadre :
        tout ce qu’elle permet d’habitude se fait sans quitter Creator Studio.
      </p>
    </div>

    <div className="grid gap-4 xl:grid-cols-2">
      <MenuAppsCard />
      <TodoConnectionCard />
    </div>
  </div>
);

const MenuAppsCard = () => {
  const { data: apps = [] } = useExternalApps();
  const create = useCreateExternalApp();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [localUrl, setLocalUrl] = useState('');

  const hasTodo = apps.some((app) => app.kind === 'todo');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dans le menu</CardTitle>
        <CardDescription>
          Chaque app rejoint la famille choisie, après les écrans du studio. Désactivée, elle quitte
          le menu sans perdre son réglage.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {!hasTodo && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-border p-3">
            <ListChecks className="h-5 w-5 shrink-0 text-muted-foreground" />
            <p className="min-w-0 flex-1 text-sm text-muted-foreground">
              Ton app <strong className="text-foreground">Todo</strong>, dans Production, avec le
              nombre de tâches du jour en pastille.
            </p>
            <Button
              size="sm"
              disabled={create.isPending}
              onClick={() =>
                create.mutate({
                  kind: 'todo',
                  name: 'Tâches',
                  section: 'production',
                  icon: 'list-checks',
                })
              }
            >
              <Plus className="h-4 w-4" />
              Ajouter « Tâches »
            </Button>
          </div>
        )}

        {apps.map((app) => (
          <AppRow key={app.id} app={app} />
        ))}

        <form
          className="space-y-2 border-t border-border pt-4"
          onSubmit={(event) => {
            event.preventDefault();
            const target = normalizeUrl(url);
            const local = normalizeUrl(localUrl, 'http');
            if (!name.trim() || (!target && !local)) return;
            create.mutate(
              { kind: 'link', name: name.trim(), url: target, localUrl: local },
              {
                onSuccess: () => {
                  setName('');
                  setUrl('');
                  setLocalUrl('');
                },
              },
            );
          }}
        >
          <Label>Ajouter une autre application</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="Nom dans le menu"
              value={name}
              maxLength={40}
              onChange={(event) => setName(event.target.value)}
              className="sm:w-44"
            />
            <Input
              placeholder="Adresse externe (https://…)"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
            <Input
              placeholder="Adresse locale (facultative)"
              value={localUrl}
              onChange={(event) => setLocalUrl(event.target.value)}
            />
            <Button
              type="submit"
              size="sm"
              className="shrink-0"
              disabled={!name.trim() || (!url.trim() && !localUrl.trim()) || create.isPending}
            >
              <Plus className="h-4 w-4" />
              Ajouter
            </Button>
          </div>
        </form>

        {create.error && <p className="text-sm text-destructive">{create.error.message}</p>}

        <p className="text-xs text-muted-foreground">
          Un site peut refuser d’être affiché dans un cadre (en-têtes <code>X-Frame-Options</code>{' '}
          ou <code>frame-ancestors</code>), et un studio servi en <code>https</code> ne peut pas
          afficher une app en <code>http</code>. Dans ces deux cas, le cadre reste vide : « Nouvel
          onglet » l’ouvre à côté.
        </p>
      </CardContent>
    </Card>
  );
};

/**
 * Une app du menu. Le nom et l'adresse s'éditent en champs **non contrôlés, validés à la
 * sortie** (même parti pris que `StepsPage`) : une mutation par frappe renommerait l'entrée
 * du menu à chaque lettre. La `key` porte `updatedAt`, pour que les champs se recalent sur
 * ce que le serveur a retenu.
 */
const AppRow = ({ app }: { app: ExternalApp }) => {
  const update = useUpdateExternalApp();
  const remove = useDeleteExternalApp();
  const { data: planning } = usePlanningSettings();
  const todoBase = planning?.todo?.baseUrl ?? null;
  const patch = (input: Parameters<typeof update.mutate>[0]['input']) =>
    update.mutate({ id: app.id, input });

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex items-center gap-2">
        {/* Déstructurée dans un `map` plutôt que tirée d'un appel : un composant obtenu par
            une fonction pendant le rendu est refusé par `react-hooks/static-components`. */}
        {EXTERNAL_APP_ICONS.filter((entry) => entry.id === app.icon).map(
          ({ id, icon: RowIcon }) => (
            <RowIcon key={id} className="h-4 w-4 shrink-0 text-muted-foreground" />
          ),
        )}
        <Input
          key={`name-${app.updatedAt}`}
          defaultValue={app.name}
          maxLength={40}
          aria-label="Nom dans le menu"
          className="h-8"
          onBlur={(event) => {
            const value = event.target.value.trim();
            if (value && value !== app.name) patch({ name: value });
          }}
        />
        <Switch
          checked={app.enabled}
          onCheckedChange={(enabled) => patch({ enabled })}
          aria-label={app.enabled ? 'Retirer du menu' : 'Afficher dans le menu'}
          title={app.enabled ? 'Dans le menu' : 'Hors du menu'}
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          title="Supprimer"
          disabled={remove.isPending}
          onClick={() => {
            if (
              window.confirm(
                `Retirer « ${app.name} » des applications ? L’app elle-même n’est pas touchée.`,
              )
            ) {
              remove.mutate(app.id);
            }
          }}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
          <span className="sr-only">Supprimer {app.name}</span>
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Famille du menu</Label>
          <Select
            value={app.section}
            onValueChange={(section) => patch({ section: section as ExternalAppSection })}
          >
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXTERNAL_APP_SECTIONS.map((section) => (
                <SelectItem key={section.id} value={section.id}>
                  {section.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Icône</Label>
          <Select
            value={app.icon}
            onValueChange={(icon) => patch({ icon: icon as ExternalAppIcon })}
          >
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXTERNAL_APP_ICONS.map(({ id, label, icon: ItemIcon }) => (
                <SelectItem key={id} value={id}>
                  <span className="flex items-center gap-2">
                    <ItemIcon className="h-4 w-4" />
                    {label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Adresse externe</Label>
          <Input
            key={`url-${app.updatedAt}`}
            defaultValue={app.url ?? ''}
            className="h-8"
            placeholder={
              app.kind === 'todo'
                ? todoBase
                  ? `Comme la connexion : ${todoBase}`
                  : 'Adresse de l’app Todo'
                : 'https://…'
            }
            onBlur={(event) => {
              const value = normalizeUrl(event.target.value);
              // Une app `link` sans aucune adresse n'ouvrirait rien : le champ vidé est ignoré.
              if (value === null && app.kind === 'link' && !app.localUrl) return;
              if (value !== app.url) patch({ url: value });
            }}
          />
          {app.kind === 'todo' && (
            <p className="text-xs text-muted-foreground">
              Vide : la même que la connexion ci-contre. Renseigne-la si l’API du studio joint Todo
              par une adresse interne (réseau Docker) que ton navigateur ne voit pas.
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Adresse locale</Label>
          <Input
            key={`local-${app.updatedAt}`}
            defaultValue={app.localUrl ?? ''}
            className="h-8"
            placeholder="http://192.168.…"
            onBlur={(event) => {
              const value = normalizeUrl(event.target.value, 'http');
              if (value === null && app.kind === 'link' && !app.url) return;
              if (value !== app.localUrl) patch({ localUrl: value });
            }}
          />
          <p className="text-xs text-muted-foreground">
            Ouverte à la place de l’externe quand le studio l’est depuis ton réseau (192.168…,
            localhost). Depuis un nom de domaine, c’est l’externe.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        {resolveFrameUrl(app) ? (
          <Link
            to={externalAppPath(app)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            Ouvrir dans le studio
          </Link>
        ) : (
          <p className="text-xs text-[var(--negative)]">
            Aucune adresse : renseigne-la, ou connecte Todo.
          </p>
        )}
        {update.error && <p className="text-xs text-destructive">{update.error.message}</p>}
      </div>
    </div>
  );
};
