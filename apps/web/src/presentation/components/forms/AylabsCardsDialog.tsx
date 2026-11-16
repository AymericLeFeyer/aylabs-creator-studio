import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import {
  useAylabsCardsProposal,
  useCreateAylabsCards,
} from '../../../application/production/usecases/useProductions.ts';
import type {
  AylabsCardsProposal,
  ProductCard,
  VideoCard,
} from '../../../domain/aylabs/entities/AylabsCard.ts';
import type { Production } from '../../../domain/production/entities/Production.ts';
import { cn } from '../../../shared/cn.ts';
import { Button } from '../ui/button.tsx';
import { Checkbox } from '../ui/checkbox.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog.tsx';
import { Input } from '../ui/input.tsx';
import { Label } from '../ui/label.tsx';

const TEXTAREA =
  'flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** « a, b » ↔ ['a', 'b'] et une valeur par ligne : les listes se tapent en texte. */
const splitList = (raw: string, separator: RegExp): string[] =>
  raw
    .split(separator)
    .map((item) => item.trim())
    .filter(Boolean);

interface FieldProps {
  label: string;
  children: React.ReactNode;
  className?: string;
  hint?: string;
}

const Field = ({ label, children, className, hint }: FieldProps) => (
  <div className={cn('space-y-1', className)}>
    <Label className="text-xs text-muted-foreground">{label}</Label>
    {children}
    {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
  </div>
);

/**
 * Un champ liste : le texte tapé est gardé tel quel (`text`) et seule la liste en est
 * déduite. Contrôler directement par la liste mangerait la virgule ou le retour à la ligne
 * qu'on vient de taper, avant le mot suivant.
 */
const ListField = ({
  label,
  value,
  onChange,
  separator,
  multiline,
  hint,
  className,
}: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  separator: RegExp;
  multiline?: boolean;
  hint?: string;
  className?: string;
}) => {
  const [text, setText] = useState(value.join(multiline ? '\n' : ', '));
  const update = (next: string) => {
    setText(next);
    onChange(splitList(next, separator));
  };
  return (
    <Field label={label} hint={hint} className={className}>
      {multiline ? (
        <textarea
          className={TEXTAREA}
          rows={3}
          value={text}
          onChange={(event) => update(event.target.value)}
        />
      ) : (
        <Input value={text} onChange={(event) => update(event.target.value)} />
      )}
    </Field>
  );
};

const Section = ({
  title,
  checked,
  onCheckedChange,
  children,
}: {
  title: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  children: React.ReactNode;
}) => (
  <section className="space-y-3 rounded-lg border border-border p-4">
    <label className="flex items-center gap-2 text-sm font-medium">
      <Checkbox checked={checked} onCheckedChange={(value) => onCheckedChange(value === true)} />
      {title}
    </label>
    <div className={cn('grid gap-3 sm:grid-cols-2', !checked && 'pointer-events-none opacity-40')}>
      {children}
    </div>
  </section>
);

const VideoSection = ({
  card,
  onChange,
  enabled,
  onEnabled,
  slugTaken,
}: {
  card: VideoCard;
  onChange: (card: VideoCard) => void;
  enabled: boolean;
  onEnabled: (enabled: boolean) => void;
  slugTaken: boolean;
}) => {
  const set = <K extends keyof VideoCard>(key: K, value: VideoCard[K]) =>
    onChange({ ...card, [key]: value });
  return (
    <Section title="Fiche vidéo" checked={enabled} onCheckedChange={onEnabled}>
      <Field label="Titre" className="sm:col-span-2">
        <Input value={card.title} onChange={(event) => set('title', event.target.value)} />
      </Field>
      <Field
        label="Slug (nom du fichier)"
        className="sm:col-span-2"
        hint={slugTaken ? 'Ce slug existe déjà sur le site.' : undefined}
      >
        <Input value={card.slug} onChange={(event) => set('slug', event.target.value)} />
      </Field>
      <Field label="Description (une ligne)" className="sm:col-span-2">
        <textarea
          className={TEXTAREA}
          rows={2}
          value={card.description}
          onChange={(event) => set('description', event.target.value)}
        />
      </Field>
      <Field label="Date de sortie">
        <Input
          type="date"
          value={card.pubDate}
          onChange={(event) => set('pubDate', event.target.value)}
        />
      </Field>
      <Field label="Heure (Paris, facultative)">
        <Input
          type="time"
          value={card.pubTime}
          onChange={(event) => set('pubTime', event.target.value)}
        />
      </Field>
      <Field label="Code YouTube">
        <Input value={card.code} onChange={(event) => set('code', event.target.value)} />
      </Field>
      <Field label="Durée" hint={card.duration ? undefined : 'Non lue sur YouTube : à saisir.'}>
        <Input
          placeholder="10:18"
          value={card.duration}
          onChange={(event) => set('duration', event.target.value)}
        />
      </Field>
      <ListField
        label="Tags (séparés par des virgules)"
        className="sm:col-span-2"
        value={card.tags}
        separator={/,/}
        onChange={(tags) => set('tags', tags)}
      />
      <Field label="Texte sous la vidéo (Markdown)" className="sm:col-span-2">
        <textarea
          className={TEXTAREA}
          rows={4}
          value={card.body}
          onChange={(event) => set('body', event.target.value)}
        />
      </Field>
    </Section>
  );
};

const ProductSection = ({
  card,
  onChange,
  enabled,
  onEnabled,
  slugTaken,
}: {
  card: ProductCard;
  onChange: (card: ProductCard) => void;
  enabled: boolean;
  onEnabled: (enabled: boolean) => void;
  slugTaken: boolean;
}) => {
  const set = <K extends keyof ProductCard>(key: K, value: ProductCard[K]) =>
    onChange({ ...card, [key]: value });
  const number = (raw: string): number | null => (raw.trim() === '' ? null : Number(raw));
  return (
    <Section title={`Fiche produit — ${card.title}`} checked={enabled} onCheckedChange={onEnabled}>
      <Field label="Titre">
        <Input value={card.title} onChange={(event) => set('title', event.target.value)} />
      </Field>
      <Field
        label="Slug (nom du fichier)"
        hint={slugTaken ? 'Ce slug existe déjà sur le site.' : undefined}
      >
        <Input value={card.slug} onChange={(event) => set('slug', event.target.value)} />
      </Field>
      <Field label="Image (adresse)" className="sm:col-span-2">
        <Input value={card.image} onChange={(event) => set('image', event.target.value)} />
      </Field>
      <Field label="Description (une ligne)" className="sm:col-span-2">
        <Input
          value={card.description}
          onChange={(event) => set('description', event.target.value)}
        />
      </Field>
      <Field label="Catégorie">
        <Input value={card.category} onChange={(event) => set('category', event.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Prix (€)">
          <Input
            type="number"
            min={0}
            step="0.01"
            value={card.price ?? ''}
            onChange={(event) => set('price', number(event.target.value))}
          />
        </Field>
        <Field label="Note (0–5)">
          <Input
            type="number"
            min={0}
            max={5}
            step="0.5"
            value={card.rating ?? ''}
            onChange={(event) => set('rating', number(event.target.value))}
          />
        </Field>
      </div>
      <ListField
        label="Tags"
        value={card.tags}
        separator={/,/}
        onChange={(tags) => set('tags', tags)}
      />
      <ListField
        label="Protocoles"
        value={card.protocols}
        separator={/,/}
        onChange={(protocols) => set('protocols', protocols)}
      />
      <ListField
        label="Compatible avec"
        className="sm:col-span-2"
        value={card.compatible}
        separator={/,/}
        onChange={(compatible) => set('compatible', compatible)}
      />
      <ListField
        label="Liens d'achat (un par ligne)"
        className="sm:col-span-2"
        multiline
        value={card.buyLinks}
        separator={/\n/}
        onChange={(buyLinks) => set('buyLinks', buyLinks)}
      />
      <ListField
        label="Points positifs (un par ligne)"
        multiline
        value={card.pros}
        separator={/\n/}
        onChange={(pros) => set('pros', pros)}
      />
      <ListField
        label="Points négatifs (un par ligne)"
        multiline
        value={card.cons}
        separator={/\n/}
        onChange={(cons) => set('cons', cons)}
      />
      <Field label="Verdict" className="sm:col-span-2">
        <Input value={card.verdict} onChange={(event) => set('verdict', event.target.value)} />
      </Field>
    </Section>
  );
};

interface FormProps {
  proposal: AylabsCardsProposal;
  production: Production;
  onClose: () => void;
}

const CardsForm = ({ proposal, production, onClose }: FormProps) => {
  const create = useCreateAylabsCards();
  const [video, setVideo] = useState(proposal.video);
  const [videoOn, setVideoOn] = useState(true);
  const [products, setProducts] = useState(proposal.products);
  const [productsOn, setProductsOn] = useState(() => proposal.products.map(() => true));
  const [error, setError] = useState<string | null>(null);
  const [commitUrl, setCommitUrl] = useState<string | null>(null);

  const videoTaken = videoOn && proposal.takenSlugs.videos.includes(video.slug);
  const productTaken = (card: ProductCard) => proposal.takenSlugs.products.includes(card.slug);
  const selected = products.filter((_, index) => productsOn[index]);

  const invalid =
    (videoOn && (!SLUG.test(video.slug) || !video.title.trim() || !video.pubDate)) ||
    selected.some((card) => !SLUG.test(card.slug) || !card.title.trim());
  const blocked =
    videoTaken ||
    selected.some(productTaken) ||
    (!videoOn && selected.length === 0) ||
    invalid ||
    !proposal.configured;

  const submit = async () => {
    setError(null);
    try {
      const result = await create.mutateAsync({
        id: production.id,
        input: { video: videoOn ? video : null, products: selected },
      });
      setCommitUrl(result.commitUrl);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : 'Création impossible');
    }
  };

  if (commitUrl) {
    return (
      <>
        <p className="text-sm">
          Les fiches sont dans le dépôt <strong>{proposal.repo}</strong> : le site se redéploie dans
          la foulée.
        </p>
        <DialogFooter>
          <Button variant="outline" asChild>
            <a href={commitUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" />
              Voir le commit
            </a>
          </Button>
          <Button onClick={onClose}>Fermer</Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {!proposal.configured && (
          <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            Aucun accès au dépôt du site : ajoute <code>AYLABS_GITHUB_TOKEN</code> (jeton GitHub
            avec « Contents » en écriture sur <code>{proposal.repo}</code>) aux variables de la
            stack.
          </p>
        )}
        <VideoSection
          card={video}
          onChange={setVideo}
          enabled={videoOn}
          onEnabled={setVideoOn}
          slugTaken={videoTaken}
        />
        {products.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Aucun produit n'est rattaché à cette vidéo : rien à créer côté produits.
          </p>
        )}
        {products.map((card, index) => (
          <ProductSection
            key={card.sourceId}
            card={card}
            onChange={(next) =>
              setProducts((current) => current.map((item, i) => (i === index ? next : item)))
            }
            enabled={productsOn[index] ?? false}
            onEnabled={(value) =>
              setProductsOn((current) => current.map((item, i) => (i === index ? value : item)))
            }
            slugTaken={(productsOn[index] ?? false) && productTaken(card)}
          />
        ))}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Annuler
        </Button>
        <Button disabled={blocked || create.isPending} onClick={submit}>
          {create.isPending ? 'Création…' : 'Créer les fiches'}
        </Button>
      </DialogFooter>
    </>
  );
};

interface AylabsCardsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  production: Production;
}

/**
 * Crée les fiches vidéo et produit sur aylabs.fr : tout ce que le studio sait est
 * prérempli, on relit, on complète (image, avantages, verdict), et un seul commit les
 * pose dans le dépôt du site. Le formulaire n'est monté qu'une fois la proposition
 * arrivée : il en part comme valeur initiale et ne se laisse plus réécrire ensuite.
 */
export const AylabsCardsDialog = ({ open, onOpenChange, production }: AylabsCardsDialogProps) => {
  const { data, isLoading, error } = useAylabsCardsProposal(production.id, open);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Créer les fiches sur aylabs.fr</DialogTitle>
          <DialogDescription>
            Une fiche pour la vidéo et une par produit rattaché, créées en un seul commit.
          </DialogDescription>
        </DialogHeader>
        {isLoading && <p className="text-sm text-muted-foreground">Préparation des fiches…</p>}
        {error && (
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : 'Préparation impossible'}
          </p>
        )}
        {data && (
          <CardsForm proposal={data} production={production} onClose={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
};
