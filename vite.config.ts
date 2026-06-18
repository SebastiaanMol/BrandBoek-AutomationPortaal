import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { sentryVitePlugin } from "@sentry/vite-plugin";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const sentrySourceMapsEnabled = Boolean(
    env.SENTRY_UPLOAD_SOURCE_MAPS === "true" &&
    env.SENTRY_AUTH_TOKEN &&
    env.SENTRY_ORG &&
    env.SENTRY_PROJECT,
  );

  return {
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
      proxy: {
        "/hubspot-api": {
          target: "https://api.hubapi.com",
          changeOrigin: true,
          rewrite: (proxyPath) => proxyPath.replace(/^\/hubspot-api/, ""),
        },
        "/zapier-api": {
          target: "https://api.zapier.com",
          changeOrigin: true,
          rewrite: (proxyPath) => proxyPath.replace(/^\/zapier-api/, ""),
        },
        "/typeform-api": {
          target: "https://api.typeform.com",
          changeOrigin: true,
          rewrite: (proxyPath) => proxyPath.replace(/^\/typeform-api/, ""),
        },
        "/gitlab-api": {
          target: "https://gitlab.com",
          changeOrigin: true,
          rewrite: (proxyPath) => proxyPath.replace(/^\/gitlab-api/, ""),
        },
      },
    },
    build: {
      sourcemap: sentrySourceMapsEnabled ? "hidden" : false,
    },
    plugins: [
      react(),
      mode === "development" && componentTagger(),
      sentrySourceMapsEnabled && sentryVitePlugin({
        org: env.SENTRY_ORG,
        project: env.SENTRY_PROJECT,
        authToken: env.SENTRY_AUTH_TOKEN,
        telemetry: false,
      }),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
