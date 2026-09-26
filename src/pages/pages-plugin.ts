import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";
import { loadLanguages } from "../data/languages-plugin";
import { buildTree } from "../data/tree";
import { assignFamilyColors } from "../viz/family-colors";
import {
  languageIds,
  renderIndexPage,
  renderLanguagePage,
  renderSitemap,
  type SiteData,
} from "./render";

/**
 * Emits one static HTML page per language (lang/<id>/index.html), an index
 * (lang/index.html), their stylesheet and sitemap.xml into the build. In dev
 * the same pages are rendered on request, so they reflect YAML edits live.
 */
function loadSite(root: string): SiteData {
  const { core, details, files } = loadLanguages(root);
  const tree = buildTree(core, new Map(core.map((n) => [n.id, n.folder])));
  return { tree, details, files, colors: assignFamilyColors(tree.families) };
}

const CSS_PATH = join(__dirname, "page.css");

export function pagesPlugin(): Plugin {
  let root = process.cwd();
  return {
    name: "langenesis-pages",
    configResolved(config) {
      root = config.root;
    },
    generateBundle() {
      const site = loadSite(root);
      const emit = (fileName: string, source: string) =>
        this.emitFile({ type: "asset", fileName, source });
      emit("lang/page.css", readFileSync(CSS_PATH, "utf-8"));
      emit("lang/index.html", renderIndexPage(site));
      for (const id of languageIds(site)) {
        emit(`lang/${id}/index.html`, renderLanguagePage(site, id));
      }
      emit("sitemap.xml", renderSitemap(site));
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? "").split(/[?#]/)[0];
        const send = (type: string, body: string) => {
          res.setHeader("Content-Type", `${type}; charset=utf-8`);
          res.end(body);
        };
        if (path === "/lang/page.css") return send("text/css", readFileSync(CSS_PATH, "utf-8"));
        if (path === "/sitemap.xml") return send("application/xml", renderSitemap(loadSite(root)));
        const m = path.match(/^\/lang\/(?:([a-z0-9-]+)\/)?(?:index\.html)?$/);
        if (!m) return next();
        const site = loadSite(root);
        if (!m[1]) return send("text/html", renderIndexPage(site));
        if (site.tree.byId.has(m[1])) return send("text/html", renderLanguagePage(site, m[1]));
        next();
      });
    },
  };
}
