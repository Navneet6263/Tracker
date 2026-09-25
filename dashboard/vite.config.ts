// Vite & TanStack Start Configuration
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const shimPath = path.resolve(__dirname, "src/lib/useSyncExternalStoreShim.ts");

export default defineConfig({
  // AWS/PM2 runs a Node server. Lovable defaults to a Cloudflare worker build,
  // which cannot be started by Vite preview on the EC2 host.
  nitro: {
    preset: "node-server",
  },
  vite: {
    resolve: {
      alias: [
        {
          find: /^use-sync-external-store\/shim\/with-selector(\.js)?$/,
          replacement: shimPath,
        },
        {
          find: /^use-sync-external-store\/with-selector(\.js)?$/,
          replacement: shimPath,
        },
      ],
    },
    server: {
      allowedHosts: true,
    },
    preview: {
      allowedHosts: true,
    },
    optimizeDeps: {
      include: ["@tanstack/react-store"],
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
