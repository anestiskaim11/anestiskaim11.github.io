import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// Project Pages: /Personal-Website/ — user site (repo anestiskaim11.github.io): set VITE_DEPLOY_BASE=/
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
