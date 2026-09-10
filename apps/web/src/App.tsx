import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes, useSearchParams } from 'react-router-dom';
import { FiltersProvider } from './presentation/hooks/useFilters.tsx';
import { PrivacyProvider } from './presentation/hooks/usePrivacy.tsx';
import { AppLayout } from './presentation/AppLayout.tsx';
import { DashboardPage } from './presentation/pages/DashboardPage.tsx';
import { TurnoverPage } from './presentation/pages/TurnoverPage.tsx';
import { ContentPage } from './presentation/pages/ContentPage.tsx';
import { LegalPage } from './presentation/pages/LegalPage.tsx';
import { SettingsPage } from './presentation/pages/SettingsPage.tsx';
import { ProductionPage } from './presentation/pages/ProductionPage.tsx';
import { PlanningPage } from './presentation/pages/PlanningPage.tsx';
import { InstagramPage } from './presentation/pages/InstagramPage.tsx';
import { ProductionDetailPage } from './presentation/pages/ProductionDetailPage.tsx';
import { ProductsPage } from './presentation/pages/ProductsPage.tsx';
import { SponsorsPage } from './presentation/pages/SponsorsPage.tsx';
import { PlatformsPage } from './presentation/pages/PlatformsPage.tsx';
import { CommentsPage } from './presentation/pages/CommentsPage.tsx';

/** `/partenariats?onglet=…` → l'écran qui a remplacé l'onglet. */
const LegacyPartnersRedirect = () => {
  const [params] = useSearchParams();
  const tab = params.get('onglet');
  const target =
    tab === 'sponsors' ? '/sponsors' : tab === 'plateformes' ? '/plateformes' : '/produits';
  return <Navigate to={target} replace />;
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Les données viennent d'une collecte horaire : un refetch au moindre focus
      // n'apporterait rien et ferait clignoter les graphiques.
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export const App = () => (
  <QueryClientProvider client={queryClient}>
    <FiltersProvider>
      {/* La confidentialité enveloppe toute l'application : cocher une case dans les
          réglages doit masquer les montants du dashboard sans recharger la page. */}
      <PrivacyProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<AppLayout />}>
              <Route index element={<DashboardPage />} />
              <Route path="youtube" element={<ContentPage />} />
              <Route path="contenu" element={<Navigate to="/youtube" replace />} />
              <Route path="instagram" element={<InstagramPage />} />
              <Route path="commentaires" element={<CommentsPage />} />
              <Route path="planning" element={<PlanningPage />} />
              {/* Un seul écran pour les deux files. La clé force un remontage en passant
                  de l'une à l'autre : sans elle, React réutiliserait l'instance, et les
                  cartes dépliées ou un formulaire ouvert passeraient d'un format à l'autre. */}
              <Route path="production" element={<ProductionPage key="video" format="video" />} />
              <Route path="shorts" element={<ProductionPage key="short" format="short" />} />
              <Route path="production/:id" element={<ProductionDetailPage />} />
              <Route path="produits" element={<ProductsPage />} />
              <Route path="sponsors" element={<SponsorsPage />} />
              <Route path="plateformes" element={<PlatformsPage />} />
              {/* Les trois onglets des partenariats sont devenus trois écrans : l'ancienne
                  adresse mène au bon, pour les signets. */}
              <Route path="partenariats" element={<LegacyPartnersRedirect />} />
              <Route path="chiffre-affaires" element={<TurnoverPage />} />
              <Route path="legal" element={<LegalPage />} />
              {/* Revenus et dépenses sont désormais deux onglets du chiffre d'affaires.
                Les anciennes adresses mènent au bon onglet, pour les signets. */}
              <Route
                path="revenus"
                element={<Navigate to="/chiffre-affaires?onglet=revenus" replace />}
              />
              <Route
                path="depenses"
                element={<Navigate to="/chiffre-affaires?onglet=depenses" replace />}
              />
              <Route
                path="taxes"
                element={<Navigate to="/chiffre-affaires?onglet=depenses" replace />}
              />
              {/* Tous les réglages vivent dans un seul écran à onglets : on configure
                rarement une seule chose. Les anciennes adresses mènent au bon onglet. */}
              <Route path="parametres" element={<SettingsPage />} />
              <Route
                path="chaines"
                element={<Navigate to="/parametres?onglet=chaines" replace />}
              />
              <Route
                path="categories"
                element={<Navigate to="/parametres?onglet=categories" replace />}
              />
              <Route
                path="marques"
                element={<Navigate to="/parametres?onglet=marques" replace />}
              />
              <Route path="etapes" element={<Navigate to="/parametres?onglet=etapes" replace />} />
              <Route
                path="societe"
                element={<Navigate to="/parametres?onglet=societe" replace />}
              />
              <Route
                path="abonnements"
                element={<Navigate to="/parametres?onglet=abonnements" replace />}
              />
              <Route
                path="horaires"
                element={<Navigate to="/parametres?onglet=planning" replace />}
              />
              <Route
                path="comptes-instagram"
                element={<Navigate to="/parametres?onglet=instagram" replace />}
              />
            </Route>
          </Routes>
        </BrowserRouter>
      </PrivacyProvider>
    </FiltersProvider>
  </QueryClientProvider>
);
