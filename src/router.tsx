import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // Fresh QueryClient per request (SSR safety) with sensible client-side defaults
  // so navigating back to a recently-visited page doesn't refetch everything.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Preload route code + loader data on link hover/touchstart so navigation
    // feels instant. Protected routes live under `_authenticated/` whose
    // `beforeLoad` redirects unauthenticated users before the loader runs,
    // so preloading from `/auth` is safe (loader never executes).
    defaultPreload: "intent",
    defaultPreloadDelay: 50,
    // Let TanStack Query control data freshness; router's preload cache
    // should not short-circuit Query's staleTime.
    defaultPreloadStaleTime: 0,
  });

  return router;
};
