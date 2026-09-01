import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // dist-portable：便携构建脚本会往该目录写 exe/zip（Windows 写文件时锁定 → EBUSY 崩溃），必须忽略
      ignored: ["**/src-tauri/**", "**/dist-portable/**"],
    },
  },
  build: {
    target: "chrome105",
    minify: "esbuild",
  },
});
