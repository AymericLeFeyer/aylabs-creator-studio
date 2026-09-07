import { useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronUp,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  useCreateScriptPreset,
  useCreateShotAngle,
  useDeleteScriptPreset,
  useDeleteShotAngle,
  useReorderScriptPresets,
  useReorderShotAngles,
  useScriptPresets,
  useShotAngles,
  useUpdateScriptPreset,
  useUpdateShotAngle,
} from '../../application/script/usecases/useScript.ts';
import type { ScriptPreset } from '../../domain/script/entities/ScriptPreset.ts';
import { Badge } from '../components/ui/badge.tsx';
import { Button } from '../components/ui/button.tsx';
import { Card } from '../components/ui/card.tsx';
import { Input } from '../components/ui/input.tsx';
import { ScriptPresetDialog } from '../components/forms/ScriptPresetDialog.tsx';
import { cn } from '../../shared/cn.ts';

/**
 * Une pastille de couleur cliquable, qui ouvre le sélecteur natif.
 *
 * La couleur n'est pas décorative ici : c'est elle qu'on reconnaît dans un script de
 * trois pages, bien avant de lire le nom de l'angle. Elle mérite donc d'être réglable
 * sans ouvrir de formulaire — d'où un `input[type=color]` posé à même la ligne, validé à
 * la sortie du champ comme le reste de l'écran.
 */
const ColorDot = ({
  value,
  label,
  onCommit,
}: {
  value: string;
  label: string;
  onCommit: (color: string) => void;
}) => (
  <input
    type="color"
    defaultValue={value}
    aria-label={label}
    title={label}
    onBlur={(event) => {
      if (event.target.value !== value) onCommit(event.target.value);
    }}
    className="h-6 w-6 shrink-0 cursor-pointer rounded-full border border-border bg-transparent p-0"
  />
);

/** Les deux flèches d'ordre, identiques dans les deux listes de l'écran. */
const OrderButtons = ({
  index,
  count,
  onMove,
}: {
  index: number;
  count: number;
  onMove: (direction: -1 | 1) => void;
}) => (
  <div className="flex shrink-0 flex-col">
    <button
      type="button"
      disabled={index === 0}
      onClick={() => onMove(-1)}
      aria-label="Monter"
      className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
    >
      <ChevronUp className="h-3.5 w-3.5" />
    </button>
    <button
      type="button"
      disabled={index === count - 1}
      onClick={() => onMove(1)}
      aria-label="Descendre"
      className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
    >
      <ChevronDown className="h-3.5 w-3.5" />
    </button>
  </div>
);

/**
 * Les deux référentiels de l'éditeur de script : les **gabarits** et les **angles de vue**.
 *
 * Réunis dans un seul onglet parce qu'ils servent au même endroit et au même moment — on
 * ouvre cet écran quand on prépare son écriture, pas quand on configure l'outil. Deux
 * onglets pour deux listes de cinq lignes auraient allongé une barre qui en porte déjà dix.
 *
 * Les champs sont **non contrôlés, validés à la sortie** (`defaultValue` + `onBlur`),
 * comme `StepsPage` : un `onChange` branché sur la mutation enverrait une requête par
 * lettre tapée. Le **contenu** d'un gabarit, lui, se travaille dans sa propre modale : ce
 * n'est pas un champ, c'est un texte.
 */
export const ScriptSettingsPage = () => (
  <div className="space-y-4">
    <div>
      <h2 className="text-base font-semibold">Script</h2>
      <p className="text-sm text-muted-foreground">
        Ce que l'éditeur de script propose : les blocs à insérer, et les angles de vue dont on
        marque les passages à tourner.
      </p>
    </div>

    <PresetsSection />
    <AnglesSection />
  </div>
);

/**
 * Les gabarits : ce qu'on réécrit à l'identique d'une vidéo à l'autre.
 *
 * La suppression est **franche et sans confirmation lourde**, contrairement à celle d'une
 * étape : un gabarit ne porte aucun historique, et les blocs déjà insérés dans les
 * scripts en portent une copie complète — ils gardent leur texte, leur nom et leur
 * couleur. Supprimer un gabarit ne retire donc rien d'aucun script, il cesse simplement
 * d'être proposé.
 */
const PresetsSection = () => {
  const { data: presets = [] } = useScriptPresets(true);
  const create = useCreateScriptPreset();
  const update = useUpdateScriptPreset();
  const remove = useDeleteScriptPreset();
  const reorder = useReorderScriptPresets();

  const [label, setLabel] = useState('');
  const [editing, setEditing] = useState<ScriptPreset | null>(null);

  const active = presets.filter((preset) => !preset.isArchived);

  const move = (index: number, direction: -1 | 1) => {
    const next = [...active];
    const [moved] = next.splice(index, 1);
    next.splice(index + direction, 0, moved!);
    reorder.mutate(next.map((preset) => preset.id));
  };

  const add = () => {
    const name = label.trim();
    if (name === '') return;
    setLabel('');
    // On crée avec le nom seul, puis on ouvre la modale : écrire le contenu est un second
    // temps, et l'exiger dans le champ d'ajout ferait renoncer à noter l'idée du gabarit.
    create.mutate({ label: name }, { onSuccess: (preset) => setEditing(preset) });
  };

  return (
    <Card className="space-y-3 p-4">
      <div>
        <h3 className="text-sm font-semibold">Gabarits</h3>
        <p className="text-xs text-muted-foreground">
          Insérés dans le script d'un clic. Leur contenu y est <strong>copié</strong> : le bloc se
          retouche pour la vidéo du jour, et modifier le gabarit ici ne réécrit aucun script déjà
          rédigé.
        </p>
      </div>

      <div className="space-y-2">
        {active.length === 0 && (
          <p className="text-sm text-muted-foreground">Aucun gabarit pour l'instant.</p>
        )}
        {active.map((preset, index) => (
          <div
            key={preset.id}
            className="flex items-center gap-2 rounded-md border border-border p-2"
          >
            <OrderButtons
              index={index}
              count={active.length}
              onMove={(direction) => move(index, direction)}
            />
            <ColorDot
              value={preset.color}
              label={`Couleur de « ${preset.label} »`}
              onCommit={(color) => update.mutate({ id: preset.id, input: { color } })}
            />
            <div className="min-w-0 flex-1">
              <Input
                defaultValue={preset.label}
                aria-label="Nom du gabarit"
                onBlur={(event) => {
                  const next = event.target.value.trim();
                  if (next !== '' && next !== preset.label) {
                    update.mutate({ id: preset.id, input: { label: next } });
                  }
                }}
                className="h-7 border-0 px-1 text-sm shadow-none focus-visible:ring-1"
              />
              <Input
                defaultValue={preset.description ?? ''}
                placeholder="À quoi il sert (facultatif)"
                aria-label="Description du gabarit"
                onBlur={(event) => {
                  const next = event.target.value.trim();
                  if (next !== (preset.description ?? '')) {
                    update.mutate({ id: preset.id, input: { description: next } });
                  }
                }}
                className="h-6 border-0 px-1 text-xs text-muted-foreground shadow-none focus-visible:ring-1"
              />
            </div>
            <Button variant="outline" size="sm" onClick={() => setEditing(preset)}>
              <Pencil className="h-3.5 w-3.5" />
              Contenu
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Supprimer"
              onClick={() => {
                if (window.confirm(`Supprimer le gabarit « ${preset.label} » ?`)) {
                  remove.mutate(preset.id);
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') add();
          }}
          placeholder="Nouveau gabarit (ex. Rappel abonnement)"
          className="h-8"
        />
        <Button size="sm" onClick={add} disabled={label.trim() === ''}>
          <Plus className="h-4 w-4" />
          Ajouter
        </Button>
      </div>

      <ScriptPresetDialog
        preset={editing}
        onOpenChange={(open) => !open && setEditing(null)}
        onSave={(content) =>
          update.mutateAsync({ id: editing!.id, input: { content } }).then(() => setEditing(null))
        }
      />
    </Card>
  );
};

/**
 * Les angles de vue du référentiel : ceux qu'on retrouve sur toutes les vidéos.
 *
 * Un angle qui n'a plus lieu d'être **s'archive** plutôt qu'il ne se supprime — non pas
 * pour préserver des scripts (ils portent leur propre copie du libellé et de la couleur),
 * mais parce qu'un angle disparu du menu revient souvent six mois plus tard. La
 * suppression franche reste possible juste à côté.
 */
const AnglesSection = () => {
  const { data: angles = [] } = useShotAngles(true);
  const create = useCreateShotAngle();
  const update = useUpdateShotAngle();
  const remove = useDeleteShotAngle();
  const reorder = useReorderShotAngles();

  const [label, setLabel] = useState('');

  const active = angles.filter((angle) => !angle.isArchived);
  const archived = angles.filter((angle) => angle.isArchived);

  const move = (index: number, direction: -1 | 1) => {
    const next = [...active];
    const [moved] = next.splice(index, 1);
    next.splice(index + direction, 0, moved!);
    reorder.mutate(next.map((angle) => angle.id));
  };

  const add = () => {
    const name = label.trim();
    if (name === '') return;
    setLabel('');
    create.mutate({ label: name });
  };

  return (
    <Card className="space-y-3 p-4">
      <div>
        <h3 className="text-sm font-semibold">Angles de vue</h3>
        <p className="text-xs text-muted-foreground">
          On sélectionne un passage du script, on clique l'angle, le fond se teinte. Une vidéo peut
          en plus avoir ses angles à elle, créés depuis son éditeur.
        </p>
      </div>

      <div className="space-y-2">
        {active.map((angle, index) => (
          <div
            key={angle.id}
            className="flex items-center gap-2 rounded-md border border-border p-2"
          >
            <OrderButtons
              index={index}
              count={active.length}
              onMove={(direction) => move(index, direction)}
            />
            <ColorDot
              value={angle.color}
              label={`Couleur de « ${angle.label} »`}
              onCommit={(color) => update.mutate({ id: angle.id, input: { color } })}
            />
            <div className="min-w-0 flex-1">
              <Input
                defaultValue={angle.label}
                aria-label="Nom de l'angle"
                onBlur={(event) => {
                  const next = event.target.value.trim();
                  if (next !== '' && next !== angle.label) {
                    update.mutate({ id: angle.id, input: { label: next } });
                  }
                }}
                className="h-7 border-0 px-1 text-sm shadow-none focus-visible:ring-1"
              />
              <Input
                defaultValue={angle.description ?? ''}
                placeholder="Comment on le tourne (facultatif)"
                aria-label="Description de l'angle"
                onBlur={(event) => {
                  const next = event.target.value.trim();
                  if (next !== (angle.description ?? '')) {
                    update.mutate({ id: angle.id, input: { description: next } });
                  }
                }}
                className="h-6 border-0 px-1 text-xs text-muted-foreground shadow-none focus-visible:ring-1"
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Archiver"
              title="Archiver"
              onClick={() => update.mutate({ id: angle.id, input: { isArchived: true } })}
            >
              <Archive className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Supprimer"
              onClick={() => {
                if (window.confirm(`Supprimer l'angle « ${angle.label} » ?`)) {
                  remove.mutate(angle.id);
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') add();
          }}
          placeholder="Nouvel angle (ex. Plan sur l'établi)"
          className="h-8"
        />
        <Button size="sm" onClick={add} disabled={label.trim() === ''}>
          <Plus className="h-4 w-4" />
          Ajouter
        </Button>
      </div>

      {archived.length > 0 && (
        <div className="space-y-1 border-t border-border pt-3">
          <p className="text-xs font-medium text-muted-foreground">Archivés</p>
          {archived.map((angle) => (
            <div key={angle.id} className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={cn('shrink-0')}
                style={{ borderColor: angle.color }}
              >
                {angle.label}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => update.mutate({ id: angle.id, input: { isArchived: false } })}
              >
                <ArchiveRestore className="h-3.5 w-3.5" />
                Réactiver
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};
