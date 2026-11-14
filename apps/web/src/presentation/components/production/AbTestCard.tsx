import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FlaskConical, ImagePlus, Save } from 'lucide-react';
import type { AbTest, Production } from '../../../domain/production/entities/Production.ts';
import { useUpdateProduction } from '../../../application/production/usecases/useProductions.ts';
import { useThumbnails } from '../../../application/thumbnail/usecases/useThumbnails.ts';
import { thumbnailUrl } from '../../../domain/thumbnail/entities/Thumbnail.ts';
import { cn } from '../../../shared/cn.ts';
import { Button } from '../ui/button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card.tsx';
import { Input } from '../ui/input.tsx';
import { Label } from '../ui/label.tsx';

const TITLE_MAX = 100;
const VARIANTS = ['A', 'B', 'C'] as const;

/**
 * Le test A/B de la vidéo : trois titres, **une miniature par titre**.
 *
 * A est le titre public du formulaire (celui qui renomme la vidéo) ; B et C se saisissent
 * ici. Les miniatures se choisissent parmi celles **enregistrées** pour la vidéo
 * (Production → Miniatures). Comme le formulaire de mise en ligne, rien ne s'enregistre
 * tout seul.
 */
export const AbTestCard = ({ production }: { production: Production }) => {
  const update = useUpdateProduction();
  const { data: thumbnails = [] } = useThumbnails(production.id, { saved: true });

  const [test, setTest] = useState<AbTest>(production.abTest);
  const [dirty, setDirty] = useState(false);
  const stamp = `${production.id}:${production.updatedAt}`;
  const [lastStamp, setLastStamp] = useState<string | null>(null);
  if (lastStamp !== stamp) {
    setLastStamp(stamp);
    setTest(production.abTest);
    setDirty(false);
  }

  const setTitle = (index: 0 | 1, value: string) => {
    const titles: AbTest['titles'] = [...test.titles];
    titles[index] = value;
    setTest({ ...test, titles });
    setDirty(true);
  };

  const setThumbnail = (index: number, id: string | null) => {
    const thumbnailIds: AbTest['thumbnailIds'] = [...test.thumbnailIds];
    thumbnailIds[index] = id;
    setTest({ ...test, thumbnailIds });
    setDirty(true);
  };

  const save = () => {
    update.mutate({ id: production.id, input: { abTest: test } });
    setDirty(false);
  };

  const titleOf = (index: number) =>
    index === 0 ? production.publishTitle || production.title : test.titles[index - 1];

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <FlaskConical className="h-4 w-4" />
          Test A/B : titres et miniatures
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
        <p className="text-xs text-muted-foreground">
          Trois variantes, une miniature par titre. Le titre A est celui du formulaire ci-dessus ;
          les miniatures se prennent parmi celles enregistrées pour cette vidéo.
        </p>
        {thumbnails.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Aucune miniature enregistrée pour l’instant.{' '}
            <Link
              to={`/miniatures?video=${production.id}`}
              className="inline-flex items-center gap-1 underline"
            >
              <ImagePlus className="h-3 w-3" />
              En générer
            </Link>
          </p>
        )}
        <div className="grid gap-4 lg:grid-cols-3">
          {VARIANTS.map((variant, index) => {
            const chosen = test.thumbnailIds[index];
            const title = titleOf(index) ?? '';
            return (
              <div key={variant} className="space-y-2 rounded-md border border-border p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <Label htmlFor={`ab-title-${variant}`}>Variante {variant}</Label>
                  {index > 0 && (
                    <span
                      className={cn(
                        'tabular text-xs text-muted-foreground',
                        title.length > TITLE_MAX && 'font-medium text-[var(--negative)]',
                      )}
                    >
                      {title.length} / {TITLE_MAX}
                    </span>
                  )}
                </div>
                {index === 0 ? (
                  <p className="rounded-md bg-muted/50 px-3 py-2 text-sm">
                    {title || <span className="text-muted-foreground">Titre public vide</span>}
                  </p>
                ) : (
                  <Input
                    id={`ab-title-${variant}`}
                    value={test.titles[index - 1]}
                    onChange={(event) => setTitle((index - 1) as 0 | 1, event.target.value)}
                    placeholder={`Titre ${variant}`}
                  />
                )}
                <div className="aspect-video overflow-hidden rounded-md bg-muted">
                  {chosen && thumbnails.some((t) => t.id === chosen) ? (
                    <img src={thumbnailUrl(chosen)} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                      Pas de miniature
                    </div>
                  )}
                </div>
                {thumbnails.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {thumbnails.map((thumbnail) => (
                      <button
                        key={thumbnail.id}
                        type="button"
                        onClick={() =>
                          setThumbnail(index, chosen === thumbnail.id ? null : thumbnail.id)
                        }
                        className={cn(
                          'h-10 w-16 overflow-hidden rounded border-2 border-transparent',
                          chosen === thumbnail.id && 'border-primary',
                        )}
                      >
                        <img
                          src={thumbnailUrl(thumbnail.id)}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
