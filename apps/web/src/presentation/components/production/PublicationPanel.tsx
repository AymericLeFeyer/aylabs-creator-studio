import { useState } from 'react';
import { Download, Megaphone, Save } from 'lucide-react';
import type { Production } from '../../../domain/production/entities/Production.ts';
import { resolvePaidPromotion } from '../../../domain/production/entities/Production.ts';
import {
  usePreviousPublication,
  useUpdateProduction,
} from '../../../application/production/usecases/useProductions.ts';
import { formatDate } from '../../../shared/format.ts';
import { Button } from '../ui/button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card.tsx';
import { Checkbox } from '../ui/checkbox.tsx';
import { Input, Textarea } from '../ui/input.tsx';
import { Label } from '../ui/label.tsx';
import { cn } from '../../../shared/cn.ts';

/** Limite YouTube d'un titre de vidéo. La dépasser fait rejeter la mise en ligne. */
const TITLE_MAX = 100;
/** Limite YouTube d'une description. */
const DESCRIPTION_MAX = 5000;

interface PublicationPanelProps {
  production: Production;
}

/**
 * Le formulaire de mise en ligne, préparé **avant** que la vidéo existe.
 *
 * C'est le dernier quart d'heure d'une vidéo, celui qu'on fait toujours en retard et à
 * l'arrache : retrouver la description, remettre les liens, ne pas oublier la case de
 * déclaration. L'écrire ici pendant le montage, puis copier-coller le jour de la sortie,
 * transforme ce quart d'heure en trois clics.
 *
 * **Il n'enregistre pas tout seul**, comme l'éditeur de script et pour la même raison :
 * une description est un texte qu'on travaille en plusieurs passages, et une sauvegarde
 * continue écraserait un brouillon en cours de réflexion. L'indicateur « Non enregistré »
 * rend l'oubli visible.
 *
 * **Le titre public n'est pas le titre du projet.** Il est prérempli avec lui — il faut
 * bien partir de quelque chose —, mais l'enregistrer ne renomme pas la vidéo dans la
 * file : l'accroche qui fait cliquer se trouve rarement le jour où l'on ouvre le projet,
 * et confondre les deux ferait perdre le titre de travail.
 */
export const PublicationPanel = ({ production }: PublicationPanelProps) => {
  const update = useUpdateProduction();
  const previous = usePreviousPublication();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [tags, setTags] = useState('');
  const [paidPromotion, setPaidPromotion] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  /**
   * Le formulaire se réarme sur la vidéo affichée **pendant le rendu**, sans `useEffect` :
   * c'est le pattern des formulaires du projet, et `react-hooks/set-state-in-effect`
   * refuse l'autre. `updatedAt` fait partie de la clé pour que l'enregistrement rafraîchisse
   * les champs avec ce que l'API a réellement retenu.
   */
  const stamp = `${production.id}:${production.updatedAt}`;
  const [lastStamp, setLastStamp] = useState<string | null>(null);
  if (lastStamp !== stamp) {
    setLastStamp(stamp);
    // Le titre de travail sert d'amorce tant qu'aucun titre public n'a été écrit.
    setTitle(production.publishTitle || production.title);
    setDescription(production.publishDescription);
    setHashtags(production.publishHashtags);
    setTags(production.publishTags);
    setPaidPromotion(resolvePaidPromotion(production));
    setDirty(false);
    setLoadError(null);
  }

  const edit =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      setDirty(true);
    };

  const save = () => {
    update.mutate({
      id: production.id,
      input: {
        publishTitle: title,
        publishDescription: description,
        publishHashtags: hashtags,
        publishTags: tags,
        // Enregistrer **fige** la case : ce qui n'était qu'une déduction devient un
        // choix, et rattacher une sponso plus tard ne la fera plus bouger toute seule.
        // C'est ce qu'on veut — sinon une décision explicite se ferait défaire.
        paidPromotion,
      },
    });
    setDirty(false);
  };

  /**
   * Reprend la description de la sortie précédente.
   *
   * Elle **remplace** ce qui est là plutôt que de s'y ajouter : on charge pour repartir
   * d'un gabarit, pas pour concaténer deux descriptions. La confirmation ne se pose que
   * si quelque chose serait perdu.
   */
  const loadPrevious = async () => {
    if (
      description.trim() !== '' &&
      !window.confirm('Remplacer la description actuelle par celle de la vidéo précédente ?')
    ) {
      return;
    }
    setLoadError(null);
    try {
      const found = await previous.mutateAsync(production.id);
      if (!found) {
        setLoadError('Aucune autre sortie connue sur cette chaîne : il n’y a rien à reprendre.');
        return;
      }
      setDescription(found.description);
      // Les tags ne se devinent pas et se reprennent presque toujours tels quels ; on ne
      // les écrase que s'ils sont vides, pour ne pas défaire une saisie déjà faite.
      if (tags.trim() === '' && found.tags.length > 0) setTags(found.tags.join(', '));
      setDirty(true);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Chargement impossible');
    }
  };

  /** Ce que la case vaudrait si personne n'y avait touché : le texte d'aide s'en sert. */
  const deducedFromSponsorships = production.sponsorships.some(
    (sponsorship) => sponsorship.status !== 'cancelled',
  );

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Megaphone className="h-4 w-4" />
          Formulaire de mise en ligne
        </CardTitle>
        <div className="flex items-center gap-2">
          {dirty && <span className="text-xs text-[var(--expense)]">Non enregistré</span>}
          <Button size="sm" disabled={!dirty || update.isPending} onClick={save}>
            <Save className="h-4 w-4" />
            {update.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor="publish-title">Titre</Label>
            <span
              className={cn(
                'tabular text-xs text-muted-foreground',
                title.length > TITLE_MAX && 'font-medium text-[var(--negative)]',
              )}
            >
              {title.length} / {TITLE_MAX}
            </span>
          </div>
          <Input
            id="publish-title"
            value={title}
            onChange={(event) => edit(setTitle)(event.target.value)}
            placeholder="Le titre public, celui qui fait cliquer"
          />
          <p className="text-xs text-muted-foreground">
            Prérempli avec le titre de travail « {production.title} ». Le modifier ici ne renomme
            pas la vidéo dans la file.
          </p>
        </div>

        <div className="space-y-1.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <Label htmlFor="publish-description">Description</Label>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'tabular text-xs text-muted-foreground',
                  description.length > DESCRIPTION_MAX && 'font-medium text-[var(--negative)]',
                )}
              >
                {description.length} / {DESCRIPTION_MAX}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={previous.isPending}
                onClick={loadPrevious}
                title="Reprend la description de la sortie précédente de cette chaîne, telle qu'elle est sur YouTube"
              >
                <Download className="h-4 w-4" />
                {previous.isPending ? 'Chargement…' : 'Charger depuis la précédente vidéo'}
              </Button>
            </div>
          </div>
          <Textarea
            id="publish-description"
            className="min-h-[16rem] font-mono text-xs"
            value={description}
            onChange={(event) => edit(setDescription)(event.target.value)}
            placeholder="Liens, réseaux, chapitres, mentions…"
          />
          {previous.data && (
            <p className="text-xs text-muted-foreground">
              Repris de « {previous.data.title} », publiée le {formatDate(previous.data.date)}.
            </p>
          )}
          {loadError && <p className="text-xs text-destructive">{loadError}</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="publish-hashtags">Hashtags</Label>
            <Input
              id="publish-hashtags"
              value={hashtags}
              onChange={(event) => edit(setHashtags)(event.target.value)}
              placeholder="#tech #tuto #diy"
            />
            <p className="text-xs text-muted-foreground">
              Les trois premiers s’affichent au-dessus du titre sur YouTube.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="publish-tags">Tags</Label>
            <Input
              id="publish-tags"
              value={tags}
              onChange={(event) => edit(setTags)(event.target.value)}
              placeholder="séparés par des virgules"
            />
            <p className="text-xs text-muted-foreground">
              Invisibles pour le spectateur : ils ne servent qu’au référencement.
            </p>
          </div>
        </div>

        {/* La case se déduit des sponsos tant qu'on n'y a pas touché. Le dire évite de
            croire qu'elle a été cochée par erreur — et évite surtout de la décocher sans
            savoir qu'une sponso est rattachée. */}
        <Label
          htmlFor="publish-paid-promotion"
          className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 font-normal transition-colors hover:bg-accent/50"
        >
          <Checkbox
            id="publish-paid-promotion"
            className="mt-0.5"
            checked={paidPromotion}
            onCheckedChange={(checked) => edit(setPaidPromotion)(checked === true)}
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium">
              La vidéo contient une communication commerciale
            </span>
            <span className="block text-xs text-muted-foreground">
              {production.paidPromotion === null
                ? deducedFromSponsorships
                  ? 'Cochée d’office : une sponso est rattachée à cette vidéo.'
                  : 'Décochée d’office : aucune sponso n’est rattachée à cette vidéo.'
                : 'Choix enregistré : cette case ne suit plus les sponsos rattachées.'}
            </span>
          </span>
        </Label>
      </CardContent>
    </Card>
  );
};
