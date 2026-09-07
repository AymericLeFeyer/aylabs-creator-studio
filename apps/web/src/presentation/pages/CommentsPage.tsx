import { useSearchParams } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import {
  useCollectComments,
  useCommentCounts,
} from '../../application/comment/usecases/useComments.ts';
import { Button } from '../components/ui/button.tsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs.tsx';
import { WallOfLove } from '../components/comments/WallOfLove.tsx';
import { CommunityIdeas } from '../components/comments/CommunityIdeas.tsx';
import { CommentsTable } from '../components/comments/CommentsTable.tsx';

const TABS = ['mur', 'propositions', 'commentaires'] as const;
type Tab = (typeof TABS)[number];

/**
 * Ce que les gens écrivent sous les vidéos, et ce qu'on en fait.
 *
 * Trois onglets, dans l'ordre de ce qu'on vient y chercher : le **mur** (ce qui fait du
 * bien, quand on en a besoin), les **propositions** (ce qu'on nous demande, quand on
 * cherche quoi tourner), et le **tableau** (le travail de tri, une fois de temps en
 * temps). Les deux premiers sont le produit du troisième : sans tri, ils restent vides —
 * et leur écran vide le dit.
 *
 * La **catégorisation est manuelle**, et volontairement. Un modèle qui se trompe met une
 * critique sur le mur, et c'est exactement ce qu'un mur ne pardonne pas. Le jour où elle
 * sera automatique, elle proposera un statut sans l'imposer : `new` restera la file de
 * tri, et c'est déjà pour ça qu'elle est un statut à part entière.
 */
export const CommentsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('onglet');
  const tab: Tab = TABS.includes(requested as Tab) ? (requested as Tab) : 'mur';

  const { data: counts } = useCommentCounts();
  const collect = useCollectComments();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="hidden text-lg font-semibold lg:block">Commentaires</h1>
          <p className="text-sm text-muted-foreground">
            Archivés au fil de l'eau, triés à la main. YouTube ne les rend que par pages
            antéchronologiques : ce qui n'est pas collecté ne se retrouve pas.
          </p>
        </div>
        {/* La collecte tourne déjà avec celle des métriques ; le bouton sert à ne pas
            attendre le passage suivant quand on vient de publier. */}
        <Button
          variant="outline"
          size="sm"
          disabled={collect.isPending}
          onClick={() => collect.mutate()}
        >
          <RefreshCw className={collect.isPending ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          {collect.isPending ? 'Collecte…' : 'Collecter'}
        </Button>
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) => setSearchParams({ onglet: value }, { replace: true })}
      >
        <TabsList>
          <TabsTrigger value="mur">Wall of Love ({counts?.encouraging ?? 0})</TabsTrigger>
          <TabsTrigger value="propositions">
            Propositions de la communauté ({counts?.idea ?? 0})
          </TabsTrigger>
          {/* Le compteur de cet onglet est celui de la **file de tri**, pas du total :
              c'est le seul chiffre qui appelle une action, et afficher les 4 000
              commentaires archivés n'en dirait rien. */}
          <TabsTrigger value="commentaires">Commentaires ({counts?.new ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="mur">
          <WallOfLove />
        </TabsContent>

        <TabsContent value="propositions">
          <CommunityIdeas />
        </TabsContent>

        <TabsContent value="commentaires">
          <CommentsTable counts={counts} />
        </TabsContent>
      </Tabs>
    </div>
  );
};
