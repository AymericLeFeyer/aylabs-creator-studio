import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { FiltersProvider } from './presentation/hooks/useFilters.tsx';
import { AppLayout } from './presentation/AppLayout.tsx';
import { DashboardPage } from './presentation/pages/DashboardPage.tsx';
import { TurnoverPage } from './presentation/pages/TurnoverPage.tsx';
import { ContentPage } from './presentation/pages/ContentPage.tsx';
import { LegalPage } from './presentation/pages/LegalPage.tsx';
import { SettingsPage } from './presentation/pages/SettingsPage.tsx';
import { ProductionPage } from './presentation/pages/ProductionPage.tsx';
import { ProductionDetailPage } from './presentation/pages/ProductionDetailPage.tsx';
import { PartnersPage } from './presentation/pages/PartnersPage.tsx';

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
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="contenu" element={<ContentPage />} />
            <Route path="production" element={<ProductionPage />} />
            <Route path="production/:id" element={<ProductionDetailPage />} />
            <Route path="partenariats" element={<PartnersPage />} />
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
            <Route path="chaines" element={<Navigate to="/parametres?onglet=chaines" replace />} />
            <Route
              path="categories"
              element={<Navigate to="/parametres?onglet=categories" replace />}
            />
            <Route path="marques" element={<Navigate to="/parametres?onglet=marques" replace />} />
            <Route path="etapes" element={<Navigate to="/parametres?onglet=etapes" replace />} />
            <Route path="societe" element={<Navigate to="/parametres?onglet=societe" replace />} />
            <Route
              path="abonnements"
              element={<Navigate to="/parametres?onglet=abonnements" replace />}
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </FiltersProvider>
  </QueryClientProvider>
);
