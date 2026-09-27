import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { api, getToken, setToken } from "./api";
import type { Booking, Meta, Role, User } from "./types";

/**
 * GET data from the API. The path is the cache key, so every page asking for
 * "/bookings" shares one request. Pass null to wait (e.g. until an id is known).
 */
export function useApi<T>(path: string | null, options: { refetchInterval?: number } = {}) {
  return useQuery({
    queryKey: [path],
    queryFn: () => api<T>(path!),
    enabled: path !== null,
    ...options,
  });
}

/**
 * Run a change (accept, cancel, check-in…). On success everything on screen is
 * refreshed from the server; on failure the backend's message is shown as a toast.
 */
export function useAction<Args = void, Result = unknown>(
  run: (args: Args) => Promise<Result>,
  successMessage?: string | ((result: Result) => string),
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: (result) => {
      queryClient.invalidateQueries();
      const message = typeof successMessage === "function" ? successMessage(result) : successMessage;
      if (message) toast.success(message);
    },
    onError: (error) => toast.error(error.message),
  });
}

/** Buildings, service categories and allowed email providers. Public, rarely changes. */
export function useMeta() {
  return useQuery({ queryKey: ["meta"], queryFn: () => api<Meta>("/meta"), staleTime: 5 * 60_000 });
}

/** The logged-in user, or nothing when signed out. */
export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => api<User>("/auth/me"),
    enabled: !!getToken(),
    staleTime: 5 * 60_000,
  });
}

/** Helpers a resident has booked (confirmed or past), for pickers like the attendance calendar. */
export function useMyHelpers() {
  const { data: bookings = [], isLoading } = useApi<Booking[]>("/bookings");
  const helpers = new Map<string, { id: string; name: string; slug: string }>();
  for (const b of bookings) {
    if (b.status === "confirmed" || b.status === "completed") {
      helpers.set(b.helperId, { id: b.helperId, name: b.helperName, slug: b.helperSlug });
    }
  }
  return { helpers: [...helpers.values()], isLoading };
}

export const homeFor = (role: Role) =>
  role === "resident" ? "/dashboard" : role === "worker" ? "/worker" : "/admin";

export function useSession() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return {
    signIn(token: string, user: User) {
      setToken(token);
      queryClient.clear();
      queryClient.setQueryData(["me"], user);
      queryClient.invalidateQueries({ queryKey: ["me"] });
      navigate({ to: homeFor(user.role), replace: true });
    },
    signOut() {
      setToken(null);
      queryClient.clear();
      navigate({ to: "/login", replace: true });
    },
  };
}
