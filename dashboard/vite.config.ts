import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  root: resolve(__dirname),
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 3142,
    proxy: {
      "/ws/dashboard": {
        target: "ws://127.0.0.1:3141",
        ws: true,
      },
      "/api": {
        target: "http://127.0.0.1:3141",
      },
    },
  },
});
