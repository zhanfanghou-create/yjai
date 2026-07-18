import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// 打包后 index.html 会被 Electron 通过 file:// 加载，需要相对路径
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "dist-renderer",
    emptyOutDir: true,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  server: { port: 5180, host: "127.0.0.1" },
});