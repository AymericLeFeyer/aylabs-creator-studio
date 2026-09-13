import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AppWindow, ExternalLink, RotateCw, Settings } from 'lucide-react';
import { useExternalApps } from '../../application/externalApp/usecases/useExternalApps.ts';
import { AppBarActions } from '../hooks/useAppBar.tsx';
import { Button } from '../components/ui/button.tsx';
import { Card } from '../components/ui/card.tsx';

const SETTINGS = '/parametres?onglet=applications';

/**
 * Une application externe, ouverte **dans** le studio.
 *
 * L'app tourne telle quelle dans une iframe, sans `sandbox` : on doit pouvoir s'y
 * connecter, cocher, glisser, tout ce qu'elle permet d'habitude — le but est de ne plus
 * avoir à l'ouvrir ailleurs. Le studio n'y lit ni n'y écrit rien.
 *
 * La page occupe **toute la hauteur restante**, comme le planning : une iframe n'a pas de
 * hauteur naturelle, et une app qui défile dans un cadre qui défile lui-même dans la page
 * est la pire des combinaisons. La hauteur se calcule depuis les deux variables déjà
 * posées sur la racine (`--app-header`, `--bottom-nav`) moins le padding vertical de
 * `main` à chaque point de rupture.
 *
 * Deux actions, doublées dans la barre d'application mobile : **recharger** l'app (une
 * iframe n'a pas de bouton de rechargement, et relancer tout le studio pour ça serait
 * absurde) et l'**ouvrir dans un onglet** — pour une connexion qu'un navigateur refuse
 * de faire dans un cadre, notamment.
 */
export const ExternalAppPage = () => {
  const { id } = useParams();
  const { data: apps, isLoading } = useExternalApps();
  const app = apps?.find((candidate) => candidate.id === id);
  // Changer la clé remonte l'iframe : c'est le seul moyen fiable de la recharger, son
  // `contentWindow` étant d'une autre origine.
  const [reloadKey, setReloadKey] = useState(0);

  if (isLoading) return <p className="text-sm text-muted-foreground">Chargement…</p>;

  if (!app || !app.frameUrl) {
    return (
      <Card className="space-y-3 p-6 text-center">
        <AppWindow className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-medium">
          {app ? `« ${app.name} » n’a aucune adresse à ouvrir` : 'Application introuvable'}
        </p>
        <p className="mx-auto max-w-lg text-sm text-muted-foreground">
          {app?.kind === 'todo'
            ? 'Renseigne l’adresse de l’app, ou connecte Todo : son adresse sert alors ici aussi.'
            : 'Elle a peut-être été supprimée. Les applications se gèrent dans les paramètres.'}
        </p>
        <Button asChild size="sm">
          <Link to={SETTINGS}>
            <Settings className="h-4 w-4" />
            Applications externes
          </Link>
        </Button>
      </Card>
    );
  }

  const actions = (compact: boolean) => (
    <>
      <Button
        variant="ghost"
        size={compact ? 'icon' : 'sm'}
        onClick={() => setReloadKey((key) => key + 1)}
        title="Recharger l’application"
      >
        <RotateCw className={compact ? 'h-5 w-5' : 'h-4 w-4'} />
        {compact ? <span className="sr-only">Recharger</span> : 'Recharger'}
      </Button>
      <Button variant="ghost" size={compact ? 'icon' : 'sm'} asChild>
        <a href={app.frameUrl!} target="_blank" rel="noreferrer" title="Ouvrir dans un onglet">
          <ExternalLink className={compact ? 'h-5 w-5' : 'h-4 w-4'} />
          {compact ? <span className="sr-only">Ouvrir dans un onglet</span> : 'Nouvel onglet'}
        </a>
      </Button>
    </>
  );

  return (
    <div className="flex h-[calc(100dvh-var(--app-header)-var(--bottom-nav)-2rem)] flex-col gap-3 sm:h-[calc(100dvh-var(--app-header)-var(--bottom-nav)-2.5rem)] lg:h-[calc(100dvh-var(--app-header)-3rem)]">
      <AppBarActions>{actions(true)}</AppBarActions>

      <div className="hidden items-center justify-between gap-3 lg:flex">
        <h1 className="truncate text-lg font-semibold">{app.name}</h1>
        <div className="flex items-center gap-1">{actions(false)}</div>
      </div>

      {/* Sur mobile, le cadre va d'un bord à l'autre, comme la grille du planning : les
          marges de la page amputeraient une app pensée pour la largeur d'un téléphone. */}
      <iframe
        key={reloadKey}
        src={app.frameUrl}
        title={app.name}
        allow="clipboard-read; clipboard-write; fullscreen"
        className="-mx-3 min-h-0 w-[calc(100%+1.5rem)] flex-1 border-y border-border bg-background sm:-mx-5 sm:w-[calc(100%+2.5rem)] lg:mx-0 lg:w-full lg:rounded-xl lg:border"
      />
    </div>
  );
};
