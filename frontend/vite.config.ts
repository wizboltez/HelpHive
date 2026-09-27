// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Where the dev server forwards API calls. The browser only ever talks to this one address,
// so the site works the same on localhost, over Wi-Fi, or through a tunnel.
const apiTarget = process.env["API_PROXY_TARGET"] ?? "http://localhost:4000";

export default defineConfig({
  vite: {
    server: {
      proxy: {
        "/api": { target: apiTarget, xfwd: true },
        "/uploads": { target: apiTarget, xfwd: true },
      },
      // Let teammates reach the dev server through a tunnel (see README → Testing with teammates).
      allowedHosts: [".trycloudflare.com", ".ngrok-free.app", ".ngrok.app"],
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
