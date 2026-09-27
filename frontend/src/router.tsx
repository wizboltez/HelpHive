import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // Data counts as fresh for 10s, so switching tabs or pages doesn't refetch everything.
  const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 10_000 } } });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
