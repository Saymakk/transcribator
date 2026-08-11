import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron/simple";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: "electron/main.ts",
        onstart({ startup }) {
          void startup();
        },
        vite: {
          build: {
            outDir: "dist-electron",
            rollupOptions: {
              external: [
                "uiohook-napi",
                "electron",
                "pdfjs-dist",
                "pdfjs-dist/legacy/build/pdf.mjs",
                "mammoth",
                "xlsx",
                "jszip",
                "jschardet",
                "word-extractor",
              ],
            },
          },
        },
      },
      preload: {
        input: path.join(__dirname, "electron/preload.ts"),
        vite: {
          build: {
            outDir: "dist-electron",
          },
        },
      },
      renderer: {},
    }),
  ],
  build: {
    outDir: "dist",
  },
});
