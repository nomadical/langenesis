import { defineConfig } from "vite";
import { languagesPlugin } from "./src/data/languages-plugin";
import { pagesPlugin } from "./src/pages/pages-plugin";

export default defineConfig({
  base: "./",
  plugins: [languagesPlugin(), pagesPlugin()],
  build: {
    target: "es2020",
  },
});
