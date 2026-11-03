import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ExternalLink,
  Mail,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  UserMinus,
  X,
} from 'lucide-react';
import {
  useBrandContacts,
  useBrands,
  useDeleteBrand,
  useDeleteBrandContact,
  useUpdateBrand,
} from '../../application/brand/usecases/useBrands.ts';
import { useMailThreads } from '../../application/mail/usecases/useMails.ts';
import { useProducts } from '../../application/product/usecases/useProducts.ts';
import { useSponsorships } from '../../application/sponsorship/usecases/useSponsorships.ts';
import { contactLabel, type Brand, type BrandContact } from '../../domain/brand/entities/Brand.ts';
import { addressLabel } from '../../domain/mail/entities/Mail.ts';
import { PRODUCT_STATUS_LABELS } from '../../domain/product/entities/Product.ts';
import {
  SPONSORSHIP_STATUS_BADGES,
  SPONSORSHIP_STATUS_LABELS,
} from '../../domain/sponsorship/entities/Sponsorship.ts';
import { formatDate } from '../../shared/format.ts';
import { cn } from '../../shared/cn.ts';
import { Badge } from '../components/ui/badge.tsx';
import { Button } from '../components/ui/button.tsx';
import { Card, CardHeader, CardTitle } from '../components/ui/card.tsx';
import { Input } from '../components/ui/input.tsx';
import { EmptyState } from '../components/EmptyState.tsx';
import { BrandDialog } from '../components/forms/BrandDialog.tsx';
import { BrandContactDialog } from '../components/brand/BrandContactDialog.tsx';
import { AppBarActions } from '../hooks/useAppBar.tsx';
import { usePrivacy } from '../hooks/usePrivacy.tsx';

const matches = (text: string, query: string) => text.toLowerCase().includes(query);

/**
 * Les marques, et tout ce qu'on cherche à leur sujet : qui joindre, ce qu'on s'est écrit,
 * ce qui a été reçu ou payé.
 *
 * Liste à gauche, fiche à droite, marque ouverte dans l'URL (`?marque=`), comme la boîte
 * mail. La recherche porte sur les marques **et sur le carnet** : taper « jane » retrouve la
 * marque de Jane. Choisir un contact ne garde que les échanges où il apparaît.
 */
export const BrandsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const brandId = searchParams.get('marque');
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Brand | null>(null);

  const { data: brands = [], isLoading } = useBrands(true);
  const { data: contacts = [] } = useBrandContacts();

  const open = (id: string | null) => setSearchParams(id ? { marque: id } : {});
  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const query = search.trim().toLowerCase();
  const contactHits = query
    ? contacts.filter(
        (contact) =>
          matches(contact.name, query) ||
          matches(contact.email, query) ||
          matches(contact.role, query),
      )
    : [];
  const visible = brands.filter((brand) => {
    if (!query) return showArchived || !brand.isArchived;
    return matches(brand.name, query) || contactHits.some((hit) => hit.brandId === brand.id);
  });
  const contactCount = (id: string) => contacts.filter((contact) => contact.brandId === id).length;
  const selected = brands.find((brand) => brand.id === brandId) ?? null;

  const newButton = (
    <Button size="sm" onClick={openCreate}>
      <Plus className="h-4 w-4" />
      <span className="hidden sm:inline">Nouvelle marque</span>
    </Button>
  );

  const dialog = (
    <BrandDialog
      open={dialogOpen}
      onOpenChange={setDialogOpen}
      brand={editing}
      onCreated={(brand) => open(brand.id)}
    />
  );

  if (!isLoading && brands.length === 0) {
    return (
      <>
        <EmptyState
          title="Aucune marque"
          description="Crée les marques avec qui tu travailles : produits, sponsos et fils de mails s'y rattachent, et leurs contacts se rangent ici tout seuls."
          actionLabel="Nouvelle marque"
          onAction={openCreate}
        />
        {dialog}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="hidden items-start justify-between gap-4 lg:flex">
        <div>
          <h1 className="text-lg font-semibold">Marques</h1>
          <p className="text-sm text-muted-foreground">
            Leurs contacts, vos échanges et ce qu'elles t'ont envoyé ou payé. Associer une marque à
            un fil de mails range ses interlocuteurs dans le carnet.
          </p>
        </div>
        {newButton}
      </div>
      <AppBarActions>{newButton}</AppBarActions>

      <div className="grid gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <Card
          className={cn(
            'min-w-0 space-y-2 p-2 lg:sticky lg:top-[calc(var(--app-header)+1.5rem)] lg:max-h-[calc(100dvh-var(--app-header)-3rem)] lg:overflow-y-auto',
            selected && 'hidden lg:block',
          )}
        >
          <div className="relative px-1 pt-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 mt-0.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Marque, contact, adresse…"
              className="pl-8"
            />
          </div>
          {!query && (
            <label className="flex items-center gap-2 px-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(event) => setShowArchived(event.target.checked)}
              />
              Afficher les archivées
            </label>
          )}
          {visible.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Aucune marque ni contact ne correspond.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {visible.map((brand) => {
                const hits = contactHits.filter((hit) => hit.brandId === brand.id);
                const count = contactCount(brand.id);
                return (
                  <li key={brand.id}>
                    <button
                      type="button"
                      onClick={() => open(brand.id)}
                      className={cn(
                        'flex w-full min-w-0 flex-col gap-0.5 rounded-md px-3 py-2 text-left transition-colors hover:bg-accent',
                        brand.id === brandId && 'bg-secondary',
                        brand.isArchived && 'opacity-60',
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: brand.color }}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                          {brand.name}
                        </span>
                        {brand.isArchived && <Badge variant="outline">Archivée</Badge>}
                        {count > 0 && (
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {count} contact{count > 1 ? 's' : ''}
                          </span>
                        )}
                      </span>
                      {hits.map((hit) => (
                        <span
                          key={hit.id}
                          className="truncate pl-4.5 text-xs text-muted-foreground"
                        >
                          ↳ {contactLabel(hit)}
                          {hit.name && ` · ${hit.email}`}
                        </span>
                      ))}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div className={cn('min-w-0', !selected && 'hidden lg:block')}>
          {selected ? (
            <BrandDetail
              key={selected.id}
              brand={selected}
              contacts={contacts.filter((contact) => contact.brandId === selected.id)}
              onBack={() => open(null)}
              onEdit={() => {
                setEditing(selected);
                setDialogOpen(true);
              }}
              onDeleted={() => open(null)}
            />
          ) : (
            <Card className="p-10 text-center text-sm text-muted-foreground">
              Choisis une marque dans la liste.
            </Card>
          )}
        </div>
      </div>

      {dialog}
    </div>
  );
};

const BrandDetail = ({
  brand,
  contacts,
  onBack,
  onEdit,
  onDeleted,
}: {
  brand: Brand;
  contacts: BrandContact[];
  onBack: () => void;
  onEdit: () => void;
  onDeleted: () => void;
}) => {
  const privacy = usePrivacy();
  const update = useUpdateBrand();
  const remove = useDeleteBrand();
  const removeContact = useDeleteBrandContact();
  const { data: threads = [], isLoading: threadsLoading } = useMailThreads({
    view: 'all',
    brandId: brand.id,
  });
  const { data: products = [] } = useProducts();
  const { data: sponsorships = [] } = useSponsorships();
  const [error, setError] = useState<string | null>(null);
  const [contactDialog, setContactDialog] = useState<{ contact: BrandContact | null } | null>(null);
  /** L'adresse du contact choisi : les échanges ne gardent que les fils où il apparaît. */
  const [focus, setFocus] = useState<string | null>(null);

  const focused = contacts.find((contact) => contact.email === focus) ?? null;
  const shownThreads = focused
    ? threads.filter((thread) =>
        thread.participants.some((person) => person.address.toLowerCase() === focused.email),
      )
    : threads;
  const brandProducts = products.filter((product) => product.brandId === brand.id);
  const brandSponsorships = sponsorships.filter((sponsorship) => sponsorship.brandId === brand.id);
  const threadCount = (email: string) =>
    threads.filter((thread) =>
      thread.participants.some((person) => person.address.toLowerCase() === email),
    ).length;

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex items-start gap-2">
        <Button
          size="icon"
          variant="ghost"
          className="lg:hidden"
          onClick={onBack}
          aria-label="Retour à la liste"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <span
              className="h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: brand.color }}
              aria-hidden
            />
            <span className="truncate">{brand.name}</span>
            {brand.isArchived && <Badge variant="outline">Archivée</Badge>}
          </h2>
          {brand.website && (
            <a
              href={brand.website}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
            >
              {brand.website.replace(/^https?:\/\//, '')}
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" size="icon" title="Modifier" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title={brand.isArchived ? 'Réactiver' : 'Archiver'}
            onClick={() =>
              update.mutate({ id: brand.id, input: { isArchived: !brand.isArchived } })
            }
          >
            {brand.isArchived ? (
              <ArchiveRestore className="h-4 w-4" />
            ) : (
              <Archive className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Supprimer"
            onClick={() => {
              setError(null);
              if (!window.confirm(`Supprimer « ${brand.name} » et son carnet de contacts ?`))
                return;
              remove.mutate(brand.id, {
                onSuccess: onDeleted,
                // 409 si des produits ou des sponsos s'y rattachent : le message dit combien.
                onError: (mutationError) =>
                  setError(
                    mutationError instanceof Error
                      ? mutationError.message
                      : 'Suppression impossible',
                  ),
              });
            }}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {brand.notes && (
        <p className="text-sm whitespace-pre-wrap text-muted-foreground">{brand.notes}</p>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Contacts ({contacts.length})</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setContactDialog({ contact: null })}>
            <Plus className="h-4 w-4" />
            Ajouter
          </Button>
        </CardHeader>
        {contacts.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">
            Personne pour l'instant. Associe cette marque à un fil dans Mails : ses interlocuteurs
            arrivent ici tout seuls.
          </p>
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {contacts.map((contact) => {
              const count = threadCount(contact.email);
              const active = focus === contact.email;
              return (
                <li
                  key={contact.id}
                  className={cn('flex items-start gap-3 px-6 py-3', active && 'bg-secondary')}
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    title="Voir les échanges avec ce contact"
                    onClick={() => setFocus(active ? null : contact.email)}
                  >
                    <span className="block truncate text-sm font-medium">
                      {contactLabel(contact)}
                      {contact.role && (
                        <span className="font-normal text-muted-foreground"> · {contact.role}</span>
                      )}
                    </span>
                    {contact.name && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {contact.email}
                      </span>
                    )}
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {contact.lastContactAt
                        ? `Dernier échange le ${formatDate(contact.lastContactAt)}`
                        : 'Ajouté à la main'}
                      {count > 0 && ` · ${count} fil${count > 1 ? 's' : ''}`}
                    </span>
                    {contact.notes && (
                      <span className="mt-1 block text-xs whitespace-pre-wrap">
                        {contact.notes}
                      </span>
                    )}
                  </button>
                  <div className="flex shrink-0 gap-0.5">
                    <Button variant="ghost" size="icon" asChild title="Écrire">
                      <a href={`mailto:${contact.email}`}>
                        <Mail className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                    {contact.phone && (
                      <Button variant="ghost" size="icon" asChild title={contact.phone}>
                        <a href={`tel:${contact.phone.replace(/\s/g, '')}`}>
                          <Phone className="h-3.5 w-3.5" />
                        </a>
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Modifier"
                      onClick={() => setContactDialog({ contact })}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Retirer du carnet"
                      onClick={() => {
                        if (!window.confirm(`Retirer ${contactLabel(contact)} du carnet ?`)) return;
                        if (active) setFocus(null);
                        removeContact.mutate(contact.id);
                      }}
                    >
                      <UserMinus className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Échanges ({shownThreads.length})</CardTitle>
          {focused && (
            <Button size="sm" variant="ghost" onClick={() => setFocus(null)}>
              avec {contactLabel(focused)}
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </CardHeader>
        {threadsLoading ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">Chargement…</p>
        ) : shownThreads.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">
            {focused
              ? 'Aucun fil avec ce contact.'
              : 'Aucun fil rattaché. Dans Mails, choisis cette marque sur un fil pour le retrouver ici.'}
          </p>
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {shownThreads.map((thread) => (
              <li key={thread.id}>
                <Link
                  to={`/mails?fil=${thread.id}`}
                  className="flex min-w-0 flex-col gap-0.5 px-6 py-2.5 hover:bg-accent"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className={cn(
                        'min-w-0 flex-1 truncate text-sm',
                        thread.unreadCount > 0 && 'font-semibold',
                      )}
                    >
                      {thread.subject}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDate(thread.lastDate)}
                    </span>
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {thread.participants.map(addressLabel).join(', ') || 'Moi'} ·{' '}
                    {thread.messageCount} message{thread.messageCount > 1 ? 's' : ''}
                    {thread.productionTitle && ` · 🎬 ${thread.productionTitle}`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>Produits ({brandProducts.length})</CardTitle>
            <Button size="sm" variant="ghost" asChild>
              <Link to="/produits">Tous</Link>
            </Button>
          </CardHeader>
          {brandProducts.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">Aucun produit.</p>
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {brandProducts.map((product) => (
                <li key={product.id} className="flex items-center gap-2 px-6 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{product.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {PRODUCT_STATUS_LABELS[product.status]}
                  </span>
                  <span className="shrink-0 tabular">
                    {privacy.money(product.valueCents, 'inKind')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>Sponsos ({brandSponsorships.length})</CardTitle>
            <Button size="sm" variant="ghost" asChild>
              <Link to="/sponsors">Toutes</Link>
            </Button>
          </CardHeader>
          {brandSponsorships.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">Aucune sponso.</p>
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {brandSponsorships.map((sponsorship) => (
                <li key={sponsorship.id} className="flex items-center gap-2 px-6 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{sponsorship.label}</span>
                  <Badge variant={SPONSORSHIP_STATUS_BADGES[sponsorship.status]}>
                    {SPONSORSHIP_STATUS_LABELS[sponsorship.status]}
                  </Badge>
                  <span className="shrink-0 tabular">
                    {privacy.money(sponsorship.amountCents, 'sponsorships')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <BrandContactDialog
        open={contactDialog !== null}
        onOpenChange={(value) => !value && setContactDialog(null)}
        brandId={brand.id}
        contact={contactDialog?.contact ?? null}
      />
    </div>
  );
};
