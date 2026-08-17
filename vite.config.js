import { defineConfig } from "vite";

export default defineConfig({
  // Relative paths make the built site work both at a custom domain and at
  // https://<user>.github.io/<repository>/.
  base: "./",
  // MuPDF initializes its WASM module with top-level await. Vite's dependency
  // optimizer has its own target, separate from build.target.
  optimizeDeps: {
    esbuildOptions: {
      target: "esnext",
    },
  },
  build: {
    target: "esnext",
  },
  worker: {
    format: "es",
  },
});
