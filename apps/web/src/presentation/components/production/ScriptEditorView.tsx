import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Check, CircleAlert, LoaderCircle } from 'lucide-react';
import { ScriptSurface } from './ScriptSurface.tsx';

/**
 * Le délai d'inactivité avant l'enregistrement automatique.
 *
 * Assez court pour qu'une fermeture d'onglet ne coûte jamais plus d'une phrase, assez
 * long pour ne pas envoyer une requête par mot tapé.
 */
const AUTOSAVE_DELAY_MS = 1200;

type SaveStatus = 'clean' | 'dirty' | 'saving' | 'saved' | 'error';

export interface ScriptEditorProps {
  value: string;
  onSave: (script: string) => Promise<unknown>;
  /**
   * La vidéo dont on écrit le script. Elle ouvre les **angles ponctuels** ; sans elle
   * (une sponso sans production rattachée), seul le référentiel est proposé.
   */
  productionId?: string;
  /**
   * Où la barre d'outils s'arrête en défilant. Par défaut sous l'en-tête collant de
   * l'application ; une modale, qui défile toute seule, passe `0px`.
   */
  stickyOffset?: string;
}

/**
 * L'éditeur de script : la surface d'écriture, plus **l'enregistrement automatique**.
 *
 * L'ancienne version s'y refusait par prudence, et l'indicateur « Non enregistré » était
 * là pour rendre l'oubli visible — c'est-à-dire pour rendre visible un problème plutôt
 * que pour le supprimer. Le brouillon vit maintenant en base à une phrase près, et
 * l'historique de TipTap (Ctrl+Z) couvre le seul risque que le bouton protégeait
 * vraiment : écraser un passage par mégarde.
 *
 * Trois filets, parce qu'un débit à retardement se perd exactement dans les moments où
 * l'on quitte l'écran : le démontage **vide la file d'attente** (on ferme la modale d'un
 * script de sponso, on change d'onglet de fiche), `beforeunload` prévient si un envoi
 * était encore en vol, et Ctrl+S force l'enregistrement pour qui ne fait confiance qu'à
 * son propre geste.
 */
export const ScriptEditorView = ({
  value,
  onSave,
  productionId,
  stickyOffset,
}: ScriptEditorProps) => {
  const [status, setStatus] = useState<SaveStatus>('clean');

  /** Le dernier contenu que le serveur connaît : c'est lui qui dit s'il y a quelque chose à envoyer. */
  const savedRef = useRef(value);
  /** Le contenu en attente d'envoi, `null` quand il n'y a rien à enregistrer. */
  const pendingRef = useRef<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const onSaveRef = useRef(onSave);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  const flush = useCallback(async () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const html = pendingRef.current;
    if (html === null) return;

    pendingRef.current = null;
    setStatus('saving');
    try {
      await onSaveRef.current(html);
      savedRef.current = html;
      // Une frappe pendant l'envoi a remis quelque chose en file : on reste « à enregistrer ».
      setStatus(pendingRef.current === null ? 'saved' : 'dirty');
    } catch {
      // Le contenu retourne en file : le prochain enregistrement le reprendra, et le
      // perdre ici effacerait silencieusement le travail que le réseau vient de refuser.
      pendingRef.current = html;
      setStatus('error');
    }
  }, []);

  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  const handleChange = useCallback((html: string) => {
    if (html === savedRef.current) {
      pendingRef.current = null;
      setStatus('clean');
      return;
    }
    pendingRef.current = html;
    setStatus('dirty');
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => void flushRef.current(), AUTOSAVE_DELAY_MS);
  }, []);

  /* Quitter l'écran vide la file : c'est le cas où un débit à retardement se perdrait. */
  useEffect(
    () => () => {
      void flushRef.current();
    },
    [],
  );

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (pendingRef.current === null) return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const forceSave = (event: KeyboardEvent) => {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') return;
    event.preventDefault();
    void flush();
  };

  return (
    <div onKeyDown={forceSave}>
      <ScriptSurface
        value={value}
        onChange={handleChange}
        productionId={productionId}
        stickyOffset={stickyOffset}
        status={<SaveIndicator status={status} onRetry={() => void flush()} />}
      />
    </div>
  );
};

export interface ScriptFieldProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: string;
  stickyOffset?: string;
}

/**
 * La même surface, en **champ de formulaire contrôlé** : le contenu d'un gabarit.
 *
 * Deux différences avec l'éditeur de script, toutes deux volontaires. L'enregistrement
 * n'est pas automatique — un gabarit se valide avec le reste de sa fiche (son nom, sa
 * couleur), et l'écrire à la volée sans avoir validé le nom laisserait des demi-fiches.
 * Et les **outils de script sont retirés** : un gabarit ne contient pas de gabarit, et
 * annoter un angle de vue sur un texte destiné à dix vidéos différentes n'a pas de sens.
 */
export const ScriptFieldView = ({
  value,
  onChange,
  placeholder,
  minHeight = 'min-h-[14rem]',
  stickyOffset = '0px',
}: ScriptFieldProps) => (
  <ScriptSurface
    value={value}
    onChange={onChange}
    scriptTools={false}
    placeholder={placeholder}
    minHeight={minHeight}
    stickyOffset={stickyOffset}
  />
);

/**
 * L'état de l'enregistrement, à la place de l'ancien bouton.
 *
 * Il reste **une seule ligne discrète** : un enregistrement automatique qui s'annonce
 * trop fort réintroduit exactement l'inquiétude qu'il devait retirer. Seule l'erreur
 * sort du gris — c'est le seul cas où l'on a quelque chose à faire, et le clic renvoie.
 */
const SaveIndicator = ({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) => {
  if (status === 'error') {
    return (
      <button
        type="button"
        onClick={onRetry}
        className="flex items-center gap-1.5 font-medium text-[var(--negative)] underline-offset-2 hover:underline"
      >
        <CircleAlert className="h-3.5 w-3.5" />
        Échec de l'enregistrement — réessayer
      </button>
    );
  }

  if (status === 'saving') {
    return (
      <span className="flex items-center gap-1.5">
        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
        Enregistrement…
      </span>
    );
  }

  if (status === 'dirty') {
    return <span className="text-[var(--expense)]">Modifications en attente…</span>;
  }

  if (status === 'saved') {
    return (
      <span className="flex items-center gap-1.5 text-[var(--positive)]">
        <Check className="h-3.5 w-3.5" />
        Enregistré
      </span>
    );
  }

  return <span>Enregistrement automatique</span>;
};
