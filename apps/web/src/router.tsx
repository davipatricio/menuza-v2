import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { ErrorBoundary } from "@/components/error-boundary.tsx";
import { NotFound } from "@/components/not-found.tsx";
import { Pending } from "@/components/pending.tsx";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  // One client per router (i.e. per request on the server, one per tab in the
  // browser). Never module scope: a shared client would leak cache between
  // concurrent SSR requests.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // Network errors during offline should not pollute the cache as hard
        // errors that mark the query as failed forever.
        retry: (failureCount, _error) => {
          if (typeof navigator !== "undefined" && !navigator.onLine) return false;

          return failureCount < 2;
        },
      },
    },
  });

  const router = createRouter({
    routeTree,
    scrollRestoration: true,
    context: { queryClient },
    defaultErrorComponent: ErrorBoundary,
    defaultPendingComponent: Pending,
    defaultNotFoundComponent: NotFound,
  });

  setupRouterSsrQueryIntegration({ router, queryClient });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
