/** Talks to the HelpHive backend (see backend/README.md). */

/**
 * Where the backend lives. By default the API is reached through the website's own address
 * (the dev server forwards /api and /uploads to it), so it works on localhost, over Wi-Fi and
 * through a tunnel. Set VITE_API_URL to call a backend somewhere else directly.
 */
export const API_URL = (import.meta.env["VITE_API_URL"] as string | undefined) ?? "";

const TOKEN_KEY = "helphive.token";

export function getToken() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage blocked — the session just won't survive a reload
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
  }
}

type Options = { method?: string; body?: unknown; form?: FormData };

/** `api("/helpers")` → parsed JSON. Throws ApiError with the backend's message on failure. */
export async function api<T = unknown>(path: string, { method = "GET", body, form }: Options = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      method,
      headers,
      body: form ?? (body !== undefined ? JSON.stringify(body) : null),
    });
  } catch {
    throw new ApiError("Can't reach the HelpHive server. Is it running?", 0);
  }

  // Session expired or account deactivated: go back to login.
  if (res.status === 401 && token) {
    setToken(null);
    window.location.assign("/login");
  }
  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.error?.message ?? "Something went wrong", res.status, data?.error?.details);
  return data as T;
}

/** Full URL for a file path returned by the API, e.g. a helper's photoUrl. */
export const fileUrl = (path: string | null | undefined) => (path ? `${API_URL}${path}` : null);

/** Opens a private file (e.g. a verification document) in a new tab, sending the login token. */
export async function openPrivateFile(path: string) {
  const res = await fetch(`${API_URL}/api${path}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new ApiError("Couldn't open the file", res.status);
  window.open(URL.createObjectURL(await res.blob()), "_blank");
}
