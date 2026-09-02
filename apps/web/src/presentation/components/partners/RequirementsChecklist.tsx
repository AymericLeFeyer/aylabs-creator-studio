import { useState } from 'react';
import { ClapperboardIcon, Plus, Trash2 } from 'lucide-react';
import {
  useAddRequirement,
  useDeleteRequirement,
  useUpdateRequirement,
} from '../../../application/sponsorship/usecases/useSponsorships.ts';
import type { SponsorshipRequirement } from '../../../domain/sponsorship/entities/Sponsorship.ts';
import { requirementProgress } from '../../../domain/sponsorship/entities/Sponsorship.ts';
import { formatDate } from '../../../shared/format.ts';
import { Button } from '../ui/button.tsx';
import { Checkbox } from '../ui/checkbox.tsx';
import { Input } from '../ui/input.tsx';
import { cn } from '../../../shared/cn.ts';

/**
 * Le cahier des charges de tournage d'une sponso : les plans que la marque exige de
 * voir à l'image.
 *
 * Il vit **au-dessus du script**, dans le même écran : ces conditions dictent ce qu'on
 * écrit, et les ranger dans un onglet à part obligerait à faire l'aller-retour à chaque
 * paragraphe. Contrairement au script, la case se coche **sans bouton d'enregistrement**
 * — c'est un geste unique et sans perte possible, là où un texte en cours de réflexion
 * demande une décision explicite.
 *
 * Chaque plan appartient à cette sponso seule : les conditions viennent de la marque,
 * et un référentiel partagé ferait cocher « macro du logo » sur des partenariats qui ne
 * l'ont jamais demandé.
 */
export const RequirementsChecklist = ({
  sponsorshipId,
  requirements,
}: {
  sponsorshipId: string;
  requirements: SponsorshipRequirement[];
}) => {
  const add = useAddRequirement();
  const update = useUpdateRequirement();
  const remove = useDeleteRequirement();

  const [draft, setDraft] = useState('');
  const progress = requirementProgress(requirements);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const label = draft.trim();
    if (label === '') return;
    add.mutate({ sponsorshipId, input: { label } });
    // Vidé aussitôt : on saisit presque toujours plusieurs plans d'affilée, comme dans
    // le carnet d'idées.
    setDraft('');
  };

  return (
    <section className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <ClapperboardIcon className="h-3.5 w-3.5" aria-hidden />
          Plans exigés par la marque
        </h3>
        {progress.total > 0 && (
          <span
            className="text-xs tabular"
            style={
              progress.done === progress.total ? { color: 'var(--positive)' } : { color: 'inherit' }
            }
          >
            {progress.done} / {progress.total} filmé(s)
          </span>
        )}
      </div>

      {requirements.length === 0 ? (
        <p className="mb-2 text-xs text-muted-foreground">
          Rien d'exigé pour l'instant. Note ici ce que la marque veut voir à l'image : un plan
          produit en main, une macro du logo, le code promo à l'oral…
        </p>
      ) : (
        <ul className="mb-2 grid gap-x-6 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
          {requirements.map((requirement) => (
            <li key={requirement.id} className="group flex items-start gap-2">
              <Checkbox
                id={`req-${requirement.id}`}
                className="mt-0.5 shrink-0"
                checked={requirement.done}
                onCheckedChange={(value) =>
                  update.mutate({
                    sponsorshipId,
                    id: requirement.id,
                    input: { done: value === true },
                  })
                }
              />
              <label
                htmlFor={`req-${requirement.id}`}
                className={cn(
                  'min-w-0 flex-1 cursor-pointer text-sm leading-snug',
                  requirement.done && 'text-muted-foreground line-through',
                )}
              >
                {requirement.label}
                {/* La date dit quand le plan a été filmé : c'est ce qu'on cherche quand
                    la marque demande où en est la production. */}
                {requirement.done && requirement.doneAt && (
                  <span className="ml-1.5 text-[11px] tabular no-underline">
                    {formatDate(requirement.doneAt.slice(0, 10))}
                  </span>
                )}
              </label>
              <button
                type="button"
                title="Retirer ce plan"
                className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus:opacity-100 group-hover:opacity-100"
                onClick={() => remove.mutate({ sponsorshipId, id: requirement.id })}
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span className="sr-only">Retirer « {requirement.label} »</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={submit} className="flex gap-2">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Plan produit en main, macro du logo, code promo à l'oral…"
          className="h-8"
        />
        <Button type="submit" size="sm" variant="outline" disabled={draft.trim() === ''}>
          <Plus className="h-4 w-4" />
          Ajouter
        </Button>
      </form>
    </section>
  );
};
