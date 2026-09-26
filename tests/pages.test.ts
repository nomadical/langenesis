import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { loadLanguages } from "../src/data/languages-plugin";
import { buildTree } from "../src/data/tree";
import { assignFamilyColors } from "../src/viz/family-colors";
import {
  describe as describeLanguage,
  languageIds,
  renderIndexPage,
  renderLanguagePage,
  renderSitemap,
  type SiteData,
} from "../src/pages/render";

const { core, details, files } = loadLanguages(join(__dirname, ".."));
const tree = buildTree(core, new Map(core.map((n) => [n.id, n.folder])));
const site: SiteData = { tree, details, files, colors: assignFamilyColors(tree.families) };
const ids = languageIds(site);
const pages = new Map(ids.map((id) => [id, renderLanguagePage(site, id)]));

describe("static language pages", () => {
  it("renders one page per language", () => {
    expect(pages.size).toBe(core.length);
  });

  it("gives every page a unique title", () => {
    const titles = [...pages.values()].map((html) => html.match(/<title>(.*?)<\/title>/)![1]);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("only links to language pages that exist", () => {
    const known = new Set(ids);
    for (const [id, html] of pages) {
      for (const [, target] of html.matchAll(/href="\.\.\/([a-z0-9-]+)\/"/g)) {
        expect(known.has(target), `${id} links to missing ${target}`).toBe(true);
      }
    }
    for (const [, target] of renderIndexPage(site).matchAll(/href="([a-z0-9-]+)\/"/g)) {
      expect(known.has(target), `index links to missing ${target}`).toBe(true);
    }
  });

  it("links each page to its language on the map", () => {
    expect(pages.get("english")).toContain('href="../../#english"');
  });

  it("emits valid structured data", () => {
    for (const [id, html] of pages) {
      const json = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)![1];
      expect(() => JSON.parse(json), id).not.toThrow();
    }
  });

  it("summarises a language with its lineage", () => {
    expect(describeLanguage(site, "english")).toMatch(
      /^English \(1500 CE – today\) is a living Indo-European language\. Lineage: Proto-Indo-European → .* → English\.$/,
    );
  });

  it("lists the home page, the index and every language in the sitemap", () => {
    const locs = renderSitemap(site).match(/<loc>/g)!;
    expect(locs.length).toBe(ids.length + 2);
  });
});
