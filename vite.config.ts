import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  base: "/tarralappu/",
  plugins: [svelte()],
  build: {
    outDir: "dist",
    target: "esnext"
  }
});
