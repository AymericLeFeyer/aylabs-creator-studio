import { useSearchParams } from 'react-router-dom';
import {
  useCollectComments,
  useCommentCounts,
} from '../../application/comment/usecases/useComments.ts';
import { AppBarActions } from '../hooks/useAppBar.tsx';
import { WallOfLove } from '../components/comments/WallOfLove.tsx';
import { CommunityIdeas } from '../components/comments/CommunityIdeas.tsx';
import { CommentsTable } from '../components/comments/CommentsTable.tsx';
import { CommentsActions, type CommentsView } from '../components/comments/CommentsActions.tsx';

const VIEWS = ['mur', 'propositions', 'commentaires'] as const;

/**
 * Ce que les gens écrivent sous les vidéos, et ce qu'on en fait.
 *
 * Trois vues, dans l'ordre de ce qu'on vient y chercher : le **mur** (ce qui fait du
 * bien, quand on en a besoin), les **propositions** (ce qu'on nous demande, quand on
 * cherche quoi tourner), et le **tableau** (le travail de tri, une fois de temps en
 * temps). Les deux dernières sont le produit de la troisième : sans tri, elles restent
 * vides — et leur écran vide le dit.
 *
 * **Elles ne sont plus des onglets.** Trois libellés et leurs compteurs faisaient une
 * rangée plus large qu'un téléphone, qu'il fallait faire défiler pour découvrir qu'il n'y
 * avait rien de plus à droite. Deux icônes à pastille suffisent (`CommentsActions`), le
 * mur restant la vue par défaut — celle sur laquelle on arrive et vers laquelle on
 * revient. L'adresse garde la vue courante (`?onglet=`) pour qu'un signet et un retour
 * arrière retombent au bon endroit.
 *
 * La **catégorisation est manuelle**, et volontairement. Un modèle qui se trompe met une
 * critique sur le mur, et c'est exactement ce qu'un mur ne pardonne pas. Le jour où elle
 * sera automatique, elle proposera un statut sans l'imposer : `new` restera la file de
 * tri, et c'est déjà pour ça qu'elle est un statut à part entière.
 */
export const CommentsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('onglet');
  const view: CommentsView = VIEWS.includes(requested as CommentsView)
    ? (requested as CommentsView)
    : 'mur';

  const { data: counts } = useCommentCounts();
  const collect = useCollectComments();

  const actions = (compact: boolean) => (
    <CommentsActions
      compact={compact}
      view={view}
      onView={(next) => setSearchParams({ onglet: next }, { replace: true })}
      counts={counts}
      collecting={collect.isPending}
      onCollect={() => collect.mutate()}
    />
  );

  return (
    <div className="space-y-4">
      {/* Sur mobile, les mêmes gestes remontent dans la barre d'application : c'est la
          place d'une action dans une barre de titre, et la seule qui reste à portée de
          pouce. Un seul composant, monté deux fois, jamais cliquable des deux côtés. */}
      <AppBarActions>{actions(true)}</AppBarActions>

      <div className="hidden flex-wrap items-start justify-between gap-3 lg:flex">
        <div>
          <h1 className="text-lg font-semibold">Commentaires</h1>
          <p className="text-sm text-muted-foreground">
            Archivés au fil de l'eau, triés à la main. YouTube ne les rend que par pages
            antéchronologiques : ce qui n'est pas collecté ne se retrouve pas.
          </p>
        </div>
        {actions(false)}
      </div>

      {view === 'mur' && <WallOfLove />}
      {view === 'propositions' && <CommunityIdeas />}
      {view === 'commentaires' && <CommentsTable counts={counts} />}
    </div>
  );
};
