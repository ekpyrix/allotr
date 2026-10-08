import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createQueryClient } from './lib/query-client.ts';
import { registerServiceWorker } from './lib/service-worker.ts';
import { sessionQuery } from './lib/session.ts';
import { createAppRouter } from './router.tsx';
import './styles.css';

// A 401 anywhere means the session ended: forget it and let the route
// guard send the user to sign-in.
const queryClient = createQueryClient({
  onUnauthorized: () => {
    queryClient.setQueryData(sessionQuery.queryKey, null);
    void router.invalidate();
  },
});
const router = createAppRouter(queryClient);

const root = document.getElementById('root');
if (root === null) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);

// Development and tests run without a worker, so edits show at once.
if (import.meta.env.PROD) registerServiceWorker().catch(() => undefined);
