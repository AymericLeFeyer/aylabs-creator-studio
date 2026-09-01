import { useState } from 'react';
import { Lightbulb, Plus, Sparkles, Trash2 } from 'lucide-react';
import {
  useCreateIdea,
  useDeleteIdea,
  useIdeas,
  useUpdateIdea,
} from '../../../application/idea/usecases/useIdeas.ts';
import type { Idea } from '../../../domain/idea/entities/Idea.ts';
import { Button } from '../ui/button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card.tsx';
import { Input } from '../ui/input.tsx';

interface IdeaBoxProps {
  /** Ouvre le formulaire de vidéo avec cette idée comme titre de travail. */
  onPromote: (idea: Idea) => void;
}

/**
 * Le carnet d'idées, à côté de la file d'attente.
 *
 * Sa raison d'être est la vitesse de saisie : un champ, Entrée, c'est noté. Demander une
 * chaîne ou une date à ce moment-là ferait renoncer à noter — or une idée qu'on ne note
 * pas est une idée perdue. Tout le reste se renseigne quand elle devient une vidéo.
 *
 * Le texte s'édite sur place, validé à la sortie du champ : une mutation par frappe
 * partirait à chaque lettre.
 */
export const IdeaBox = ({ onPromote }: IdeaBoxProps) => {
  const { data: ideas = [] } = useIdeas();
  const create = useCreateIdea();
  const update = useUpdateIdea();
  const remove = useDeleteIdea();
  const [draft, setDraft] = useState('');

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    // Le champ se vide tout de suite : on note souvent trois idées d'affilée.
    setDraft('');
    create.mutate({ text });
  };

  return (
    <Card className="h-fit">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Lightbulb className="h-4 w-4" />
          Idées en vrac
          {ideas.length > 0 && (
            <span className="font-normal text-muted-foreground">· {ideas.length}</span>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-2.5">
        <form onSubmit={submit} className="flex gap-2">
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Une idée…"
            aria-label="Nouvelle idée"
          />
          <Button type="submit" size="icon" variant="outline" disabled={!draft.trim()}>
            <Plus className="h-4 w-4" />
            <span className="sr-only">Ajouter l'idée</span>
          </Button>
        </form>

        {ideas.length === 0 ? (
          <p className="py-2 text-xs text-muted-foreground">
            Note ici ce qui te passe par la tête. Une idée devient une vidéo d'un clic, avec son
            titre déjà rempli.
          </p>
        ) : (
          <ul className="space-y-1">
            {ideas.map((idea) => (
              <li key={idea.id} className="group flex items-center gap-1">
                <Input
                  key={idea.id}
                  defaultValue={idea.text}
                  onBlur={(event) => {
                    const text = event.target.value.trim();
                    if (text && text !== idea.text) {
                      update.mutate({ id: idea.id, input: { text } });
                    }
                  }}
                  className="h-8 border-transparent bg-transparent px-2 text-sm shadow-none hover:border-input focus-visible:border-input"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  title="En faire une vidéo"
                  onClick={() => onPromote(idea)}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span className="sr-only">Transformer « {idea.text} » en vidéo</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
                  title="Supprimer"
                  onClick={() => remove.mutate(idea.id)}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  <span className="sr-only">Supprimer « {idea.text} »</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};
