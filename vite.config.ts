import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
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
        rewrite: (path) => path.replace(/^\/hubspot-api/, ""),
      },
      "/zapier-api": {
        target: "https://api.zapier.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/zapier-api/, ""),
      },
      "/typeform-api": {
        target: "https://api.typeform.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/typeform-api/, ""),
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
