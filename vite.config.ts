import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 2222,
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
  },
});
