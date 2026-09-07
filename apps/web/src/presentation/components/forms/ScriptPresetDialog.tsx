import { useState } from 'react';
import type { ScriptPreset } from '../../../domain/script/entities/ScriptPreset.ts';
import { Button } from '../ui/button.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog.tsx';
import { ScriptField } from '../production/ScriptEditor.tsx';

/**
 * Le contenu d'un gabarit, dans sa propre modale.
 *
 * Le nom et la couleur se règlent sur la ligne de la liste, en un geste ; le **texte**,
 * lui, se travaille — d'où un espace large et un bouton d'enregistrement explicite.
 * C'est le même arbitrage que le script d'une sponso, sorti de sa modale d'édition pour
 * la même raison.
 *
 * Pas d'enregistrement automatique ici, contrairement au script : un gabarit se relit et
 * se réécrit d'un bloc, et surtout son contenu part ensuite dans toutes les vidéos où on
 * l'insère — le valider explicitement est le bon niveau d'engagement.
 *
 * L'état local est réinitialisé par la `key` du contenu plutôt que par un effet : ouvrir
 * un autre gabarit monte un nouveau composant, et il n'y a rien à resynchroniser.
 */
export const ScriptPresetDialog = ({
  preset,
  onOpenChange,
  onSave,
}: {
  /** `null` ferme la modale : c'est le gabarit choisi qui l'ouvre. */
  preset: ScriptPreset | null;
  onOpenChange: (open: boolean) => void;
  onSave: (content: string) => Promise<unknown>;
}) => (
  <Dialog open={preset !== null} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-4xl">
      {preset && (
        <>
          <DialogHeader>
            <DialogTitle>Contenu — {preset.label}</DialogTitle>
            <DialogDescription>
              Ce texte est <strong>copié</strong> dans le script à l'insertion. Le retoucher ici ne
              modifie aucun script déjà rédigé.
            </DialogDescription>
          </DialogHeader>

          <PresetForm key={preset.id} preset={preset} onSave={onSave} />
        </>
      )}
    </DialogContent>
  </Dialog>
);

const PresetForm = ({
  preset,
  onSave,
}: {
  preset: ScriptPreset;
  onSave: (content: string) => Promise<unknown>;
}) => {
  const [content, setContent] = useState(preset.content);
  const [saving, setSaving] = useState(false);

  const dirty = content !== preset.content;

  const submit = async () => {
    setSaving(true);
    try {
      await onSave(content);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <ScriptField
        value={preset.content}
        onChange={setContent}
        placeholder="Le texte à insérer dans le script…"
        minHeight="min-h-[18rem]"
      />

      <DialogFooter>
        {dirty && <span className="mr-auto text-xs text-[var(--expense)]">Non enregistré</span>}
        <Button onClick={() => void submit()} disabled={!dirty || saving}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </DialogFooter>
    </div>
  );
};
