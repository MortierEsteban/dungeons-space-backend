import '@fontsource/cinzel/400.css';
import '@fontsource/cinzel/500.css';
import '@fontsource/cinzel/600.css';
import '@fontsource/cinzel-decorative/400.css';
import '@fontsource/spectral/400.css';
import '@fontsource/spectral/400-italic.css';
import '@fontsource/spectral/500.css';
import './shared/styles/global.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { router } from './app/router';
import { ApiError } from './shared/api/client';
import { DiceProvider } from './shared/dice/DiceProvider';
import { ToastProvider } from './shared/ui/toast';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      // Pas de nouvelle tentative sur une erreur métier (403/404…), seulement sur le réseau.
      retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <DiceProvider>
          <RouterProvider router={router} />
        </DiceProvider>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
