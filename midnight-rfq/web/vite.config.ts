import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@shared": fileURLToPath(new URL("../shared", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    fs: { allow: [fileURLToPath(new URL("..", import.meta.url))] },
  },
});
