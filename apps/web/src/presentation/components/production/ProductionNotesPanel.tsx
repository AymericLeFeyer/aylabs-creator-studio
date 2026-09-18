import { useState } from 'react';
import { ArrowLeft, FileText, Plus, Trash2 } from 'lucide-react';
import {
  useCreateProductionNote,
  useDeleteProductionNote,
  useProductionNotes,
  useUpdateProductionNote,
} from '../../../application/production/usecases/useProductionNotes.ts';
import {
  type ProductionNote,
  UNTITLED_NOTE,
  noteTitle,
} from '../../../domain/production/entities/ProductionNote.ts';
import { formatDate } from '../../../shared/format.ts';
import { cn } from '../../../shared/cn.ts';
import { Button } from '../ui/button.tsx';
import { Card } from '../ui/card.tsx';
import { Input } from '../ui/input.tsx';
import { ScriptEditor } from './ScriptEditor.tsx';

/**
 * Les notes d'une vidéo, rangées comme des **fichiers** : une liste à gauche, la note
 * ouverte à droite.
 *
 * Sur mobile, les deux ne tiennent pas côte à côte : la liste s'affiche seule, et ouvrir
 * une note la remplace (avec un retour). Le basculement est en CSS (`hidden lg:block`),
 * comme la file de tri des commentaires — rien ne se remonte au redimensionnement.
 */
export const ProductionNotesPanel = ({ productionId }: { productionId: string }) => {
  const { data: notes = [], isLoading } = useProductionNotes(productionId);
  const create = useCreateProductionNote(productionId);
  const remove = useDeleteProductionNote(productionId);

  /** La note choisie. `null` = la liste (mobile) ; au large, la première s'ouvre d'office. */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** La note qu'on vient de créer : son titre prend le focus, c'est ce qu'on écrit d'abord. */
  const [createdId, setCreatedId] = useState<string | null>(null);

  const selected = notes.find((note) => note.id === selectedId) ?? null;
  const active = selected ?? notes[0] ?? null;

  const addNote = async () => {
    const created = await create.mutateAsync({});
    setCreatedId(created.id);
    setSelectedId(created.id);
  };

  const deleteNote = (note: ProductionNote) => {
    if (!window.confirm(`Supprimer la note « ${noteTitle(note)} » ?`)) return;
    remove.mutate(note.id);
    setSelectedId(null);
  };

  if (isLoading) {
    return <Card className="p-5 text-sm text-muted-foreground">Chargement…</Card>;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <Card className={cn('h-fit min-w-0 p-2', selected && 'hidden lg:block')}>
        <div className="flex items-center justify-between gap-2 px-2 py-1.5">
          <span className="text-sm font-medium">
            {notes.length} note{notes.length > 1 ? 's' : ''}
          </span>
          <Button size="sm" variant="outline" onClick={addNote} disabled={create.isPending}>
            <Plus className="h-4 w-4" />
            Nouvelle
          </Button>
        </div>

        {notes.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            Aucune note. Une par sujet : angle, références, retours…
          </p>
        ) : (
          <ul className="mt-1 space-y-0.5">
            {notes.map((note) => (
              <li key={note.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(note.id)}
                  className={cn(
                    'flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted',
                    // Au large, la note ouverte est celle d'office quand rien n'est choisi.
                    active?.id === note.id && 'lg:bg-muted lg:font-medium',
                  )}
                >
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn('block truncate', !note.title.trim() && 'italic')}
                      title={noteTitle(note)}
                    >
                      {noteTitle(note)}
                    </span>
                    <span className="block text-xs font-normal text-muted-foreground">
                      {formatDate(note.updatedAt)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className={cn('min-w-0', !selected && 'hidden lg:block')}>
        {active ? (
          <NoteEditor
            // Une instance par note : l'éditeur est non contrôlé, et son enregistrement
            // en attente doit partir vers la note qu'on quitte, pas vers la suivante.
            key={active.id}
            productionId={productionId}
            note={active}
            autoFocusTitle={active.id === createdId}
            onBack={() => setSelectedId(null)}
            onDelete={() => deleteNote(active)}
          />
        ) : (
          <Card className="flex flex-col items-center gap-3 p-10 text-center text-sm text-muted-foreground">
            <FileText className="h-8 w-8" />
            Aucune note sur cette vidéo.
            <Button size="sm" onClick={addNote} disabled={create.isPending}>
              <Plus className="h-4 w-4" />
              Créer une note
            </Button>
          </Card>
        )}
      </div>
    </div>
  );
};

interface NoteEditorProps {
  productionId: string;
  note: ProductionNote;
  autoFocusTitle: boolean;
  onBack: () => void;
  onDelete: () => void;
}

const NoteEditor = ({ productionId, note, autoFocusTitle, onBack, onDelete }: NoteEditorProps) => {
  const update = useUpdateProductionNote(productionId);

  /**
   * Le contenu **à l'ouverture**, figé. La liste en cache est mise à jour par chaque
   * enregistrement automatique ; la repasser à l'éditeur lui ferait rejouer un contenu
   * plus ancien que ce qu'on est en train de taper, et la phrase en cours partirait.
   */
  const [initialContent] = useState(note.content);

  const saveTitle = (value: string) => {
    const title = value.trim();
    if (title !== note.title) update.mutate({ id: note.id, input: { title } });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 lg:hidden"
          onClick={onBack}
          title="Toutes les notes"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="sr-only">Toutes les notes</span>
        </Button>
        {/* Validé à la sortie du champ : une mutation par lettre partirait sinon. */}
        <Input
          defaultValue={note.title}
          placeholder={UNTITLED_NOTE}
          autoFocus={autoFocusTitle}
          maxLength={200}
          className="h-9 min-w-0 flex-1 text-base font-medium"
          onBlur={(event) => saveTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={onDelete}
          title="Supprimer la note"
        >
          <Trash2 className="h-4 w-4" />
          <span className="sr-only">Supprimer la note</span>
        </Button>
      </div>

      <ScriptEditor
        value={initialContent}
        scriptTools={false}
        minHeight="min-h-[20rem]"
        placeholder="Écris ta note… titres, listes à cocher, liens, couleurs."
        onSave={(content) => update.mutateAsync({ id: note.id, input: { content } })}
      />
    </div>
  );
};
