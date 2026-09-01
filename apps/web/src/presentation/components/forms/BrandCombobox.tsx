import { useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Plus } from 'lucide-react';
import { useBrands, useCreateBrand } from '../../../application/brand/usecases/useBrands.ts';
import { Input } from '../ui/input.tsx';
import { Label } from '../ui/label.tsx';
import { cn } from '../../../shared/cn.ts';

interface BrandComboboxProps {
  id: string;
  /** Identifiant de marque, ou `null` pour « sans marque ». */
  value: string | null;
  onChange: (brandId: string | null) => void;
}

/** Rangs spéciaux de la liste : « sans marque » et « créer ». */
const NONE_INDEX = -1;
const CREATE_INDEX = -2;

/**
 * Choix d'une marque **en la tapant**, avec création sur place.
 *
 * Un `Select` obligerait à faire défiler une liste qui grandit à chaque partenariat, et
 * surtout à quitter le formulaire pour créer une marque qui n'existe pas encore — en
 * perdant la saisie en cours. Ici, on tape, et si rien ne correspond la première entrée
 * de la liste propose de créer.
 *
 * Écrit à la main plutôt qu'avec `cmdk` + Popover : deux dépendances de plus pour un
 * seul champ, alors que le comportement tient en une liste filtrée et quatre touches.
 *
 * La création ne demande **que le nom** : la couleur est attribuée en rotation côté API,
 * et le reste (contact, site, notes) se complète dans Paramètres → Marques. Demander
 * quoi que ce soit de plus ici ferait renoncer à créer.
 */
export const BrandCombobox = ({ id, value, onChange }: BrandComboboxProps) => {
  const { data: brands = [] } = useBrands();
  const create = useCreateBrand();
  const inputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(NONE_INDEX);
  const [error, setError] = useState<string | null>(null);

  const selected = brands.find((brand) => brand.id === value) ?? null;

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return brands;
    return brands.filter((brand) => brand.name.toLowerCase().includes(needle));
  }, [brands, query]);

  const typed = query.trim();
  // On ne propose de créer que si le nom tapé n'existe pas déjà, à la casse près :
  // deux « Logitech » rendraient les classements du dashboard faux.
  const canCreate =
    typed.length > 0 && !brands.some((brand) => brand.name.toLowerCase() === typed.toLowerCase());

  /**
   * À la prise de focus, le champ montre la marque déjà choisie et la sélectionne :
   * on voit ce qui est en place, et taper la remplace d'un coup. Vider le champ
   * donnerait l'impression d'avoir perdu la sélection.
   */
  const openAndSeed = () => {
    setOpen(true);
    setQuery(selected?.name ?? '');
    setHighlight(NONE_INDEX);
    requestAnimationFrame(() => inputRef.current?.select());
  };

  const close = () => {
    setOpen(false);
    setQuery('');
    setHighlight(NONE_INDEX);
  };

  const pick = (brandId: string | null) => {
    onChange(brandId);
    setError(null);
    close();
  };

  const createAndPick = async () => {
    setError(null);
    try {
      const brand = await create.mutateAsync({ name: typed });
      pick(brand.id);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : 'Création impossible');
    }
  };

  /** L'ordre de navigation au clavier : créer, sans marque, puis les résultats. */
  const order = [...(canCreate ? [CREATE_INDEX] : []), NONE_INDEX, ...matches.map((_, i) => i)];

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      close();
      return;
    }
    if (!open && (event.key === 'ArrowDown' || event.key === 'Enter')) {
      openAndSeed();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const at = order.indexOf(highlight);
      const next = event.key === 'ArrowDown' ? at + 1 : at - 1;
      setHighlight(order[Math.max(0, Math.min(order.length - 1, next))] ?? NONE_INDEX);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (highlight === CREATE_INDEX && canCreate) void createAndPick();
      else if (highlight === NONE_INDEX) pick(null);
      else pick(matches[highlight]?.id ?? null);
    }
  };

  const rowClass = (active: boolean) =>
    cn(
      'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors',
      active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60',
    );

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Marque</Label>

      {/* Le conteneur porte le blur : refermer sur la perte de focus n'a de sens que
          si le focus sort de l'ensemble champ + liste. */}
      <div
        className="relative"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close();
        }}
      >
        <Input
          id={id}
          ref={inputRef}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          autoComplete="off"
          className="pr-8"
          placeholder="Sans marque"
          value={open ? query : (selected?.name ?? '')}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setHighlight(NONE_INDEX);
          }}
          onFocus={openAndSeed}
          onKeyDown={onKeyDown}
        />
        <ChevronDown
          className="pointer-events-none absolute right-2 top-2.5 h-4 w-4 opacity-50"
          aria-hidden
        />

        {open && (
          <ul
            role="listbox"
            className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-popover p-1 shadow-lg"
          >
            {canCreate && (
              <li>
                {/* `onMouseDown` neutralisé : sans ça le champ perdrait le focus avant
                    que le clic n'arrive, et la liste se refermerait sur du vide. */}
                <button
                  type="button"
                  role="option"
                  aria-selected={highlight === CREATE_INDEX}
                  disabled={create.isPending}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setHighlight(CREATE_INDEX)}
                  onClick={() => void createAndPick()}
                  className={cn(rowClass(highlight === CREATE_INDEX), 'font-medium')}
                >
                  <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="truncate">
                    {create.isPending ? 'Création…' : `Créer « ${typed} »`}
                  </span>
                </button>
              </li>
            )}

            <li>
              <button
                type="button"
                role="option"
                aria-selected={highlight === NONE_INDEX}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setHighlight(NONE_INDEX)}
                onClick={() => pick(null)}
                className={rowClass(highlight === NONE_INDEX)}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full border border-border"
                  aria-hidden
                />
                <span className="text-muted-foreground">Sans marque</span>
                {value === null && <Check className="ml-auto h-4 w-4" aria-hidden />}
              </button>
            </li>

            {matches.map((brand, index) => (
              <li key={brand.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={highlight === index}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => pick(brand.id)}
                  className={rowClass(highlight === index)}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: brand.color }}
                    aria-hidden
                  />
                  <span className="truncate">{brand.name}</span>
                  {value === brand.id && <Check className="ml-auto h-4 w-4 shrink-0" aria-hidden />}
                </button>
              </li>
            ))}

            {matches.length === 0 && !canCreate && (
              <li className="px-2 py-1.5 text-sm text-muted-foreground">Aucune marque.</li>
            )}
          </ul>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
};
