import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// User GitHub Pages (anestiskaim11.github.io) serves at /. For a project site, set VITE_DEPLOY_BASE=/repo-name/
const deployBase = process.env.VITE_DEPLOY_BASE ?? "/";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: deployBase,
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
