// Vite & TanStack Start Configuration
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  // AWS/PM2 runs a Node server. Lovable defaults to a Cloudflare worker build,
  // which cannot be started by Vite preview on the EC2 host.
  nitro: {
    preset: "node-server",
  },
  vite: {
    server: {
      allowedHosts: true,
    },
    preview: {
      allowedHosts: true,
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
