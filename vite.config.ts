import { defineConfig } from "vite";
import { languagesPlugin } from "./src/data/languages-plugin";

export default defineConfig({
  base: "./",
  plugins: [languagesPlugin()],
  build: {
    target: "es2020",
  },
});
