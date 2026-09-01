import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { FiltersProvider } from './presentation/hooks/useFilters.tsx';
import { AppLayout } from './presentation/AppLayout.tsx';
import { DashboardPage } from './presentation/pages/DashboardPage.tsx';
import { RevenuesPage } from './presentation/pages/RevenuesPage.tsx';
import { ExpensesPage } from './presentation/pages/ExpensesPage.tsx';
import { ChannelsPage } from './presentation/pages/ChannelsPage.tsx';
import { CategoriesPage } from './presentation/pages/CategoriesPage.tsx';
import { ProductionPage } from './presentation/pages/ProductionPage.tsx';
import { ProductionDetailPage } from './presentation/pages/ProductionDetailPage.tsx';
import { PartnersPage } from './presentation/pages/PartnersPage.tsx';
import { BrandsPage } from './presentation/pages/BrandsPage.tsx';
import { StepsPage } from './presentation/pages/StepsPage.tsx';

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
            <Route path="production" element={<ProductionPage />} />
            <Route path="production/:id" element={<ProductionDetailPage />} />
            <Route path="partenariats" element={<PartnersPage />} />
            <Route path="revenus" element={<RevenuesPage />} />
            <Route path="depenses" element={<ExpensesPage />} />
            {/* Ancienne adresse de la page, gardée pour les signets. */}
            <Route path="taxes" element={<Navigate to="/depenses" replace />} />
            <Route path="chaines" element={<ChannelsPage />} />
            <Route path="categories" element={<CategoriesPage />} />
            <Route path="marques" element={<BrandsPage />} />
            <Route path="etapes" element={<StepsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </FiltersProvider>
  </QueryClientProvider>
);
