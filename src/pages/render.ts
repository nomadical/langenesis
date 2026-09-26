// Static, crawlable HTML for every language (lang/<id>/), an index of all of
// them (lang/), and the sitemap. The map itself is a canvas that search
// engines can't read; these pages give each language a URL with real text
// and link back into the map at that language (`#<id>`).
import {
  escapeAttr,
  escapeHtml,
  formatPeriod,
  prettyUrl,
  statusLabel,
} from "../data/format";
import type { CoreNode, NodeDetails } from "../data/model";
import { isVirtualRootId, type LoadedData, type TreeNode } from "../data/tree";

export const SITE_URL = "https://nomadical.github.io/langenesis/";
export const REPO_URL = "https://github.com/nomadical/langenesis";

export interface SiteData {
  tree: LoadedData;
  details: Record<string, NodeDetails>;
  /** YAML path under languages/, by node id. */
  files: Record<string, string>;
  /** Family colour, by family id. */
  colors: Map<string, string>;
}

const compact = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function languageIds(site: SiteData): string[] {
  return [...site.tree.byId.keys()].filter((id) => !isVirtualRootId(id));
}

/** Oldest ancestor first, the language itself last (primary parents only, as drawn on the map). */
export function lineageOf(site: SiteData, id: string): CoreNode[] {
  const out: CoreNode[] = [];
  let cur = site.tree.byId.get(id)?.data;
  while (cur) {
    out.unshift(cur);
    cur = cur.parents[0] ? site.tree.byId.get(cur.parents[0])?.data : undefined;
  }
  return out;
}

function countDescendants(node: TreeNode): number {
  return node.children.reduce((sum, c) => sum + 1 + countDescendants(c), 0);
}

function withArticle(word: string): string {
  return `${/^[aeiou]/i.test(word) ? "an" : "a"} ${word}`;
}

/** The one-paragraph summary used as the lede and the meta description. */
export function describe(site: SiteData, id: string): string {
  const tree = site.tree.byId.get(id)!;
  const node = tree.data;
  const family = site.tree.families.find((f) => f.id === site.tree.familyOf.get(id));
  const status = statusLabel(node.status).toLowerCase();
  const period = formatPeriod(node);
  const total = countDescendants(tree);

  let sentence: string;
  if (family?.id === id && total === 0) {
    sentence = `${node.name} (${period}) is ${withArticle(status)} language isolate.`;
  } else if (family?.id === id) {
    sentence = `${node.name} (${period}) is the ${node.status === "reconstructed" ? "reconstructed " : ""}ancestor of the ${family.label} language family, with ${total} descendant languages and stages on the map.`;
  } else {
    // "a living Basque language" says nothing when the family shares the name.
    const label = family && family.label !== node.name ? `${family.label} ` : "";
    sentence = `${node.name} (${period}) is ${withArticle(status)} ${label}language.`;
    if (total > 0) sentence += ` It has ${total} descendant languages and stages on the map.`;
  }

  const names = lineageOf(site, id).map((n) => n.name);
  if (names.length > 1) {
    const shown = names.length > 6 ? [...names.slice(0, 2), "…", ...names.slice(-3)] : names;
    sentence += ` Lineage: ${shown.join(" → ")}.`;
  }
  return sentence;
}

// ============ Shared shell ============

const BRAND_MARK = `<svg class="brand-mark" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" fill="currentColor"/><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="1" opacity="0.55"/><circle cx="12" cy="12" r="11" fill="none" stroke="currentColor" stroke-width="1" opacity="0.25"/></svg>`;

interface ShellOptions {
  /** Relative path from this page to the site root, e.g. "../../". */
  root: string;
  /** Path of this page from the site root, e.g. "lang/english/". */
  path: string;
  title: string;
  description: string;
  jsonLd: object[];
  body: string;
  footerExtra?: string;
}

function shell(o: ShellOptions): string {
  const url = SITE_URL + o.path;
  const desc = escapeAttr(o.description);
  const title = escapeAttr(o.title);
  const og = `${SITE_URL}og-image.png`;
  // "<" is escaped so a name can never close the script element.
  const ld = JSON.stringify(o.jsonLd.length === 1 ? o.jsonLd[0] : o.jsonLd).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(o.title)}</title>
<meta name="description" content="${desc}" />
<link rel="canonical" href="${url}" />
<link rel="icon" type="image/svg+xml" href="${o.root}favicon.svg" />
<link rel="stylesheet" href="${o.root}lang/page.css" />
<meta name="theme-color" content="#0a0d14" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Langenesis" />
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${desc}" />
<meta property="og:url" content="${url}" />
<meta property="og:image" content="${og}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${title}" />
<meta name="twitter:description" content="${desc}" />
<meta name="twitter:image" content="${og}" />
<script type="application/ld+json">${ld}</script>
</head>
<body>
<header class="site-header">
  <a class="brand" href="${o.root}">${BRAND_MARK}<span>Langenesis</span></a>
  <nav class="site-nav"><a href="${o.root}lang/">All languages</a><a href="${o.root}">Open the map</a></nav>
</header>
<main class="page">
${o.body}
</main>
<footer class="site-footer">
  <span>Data <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>, seeded from <a href="https://glottolog.org/">Glottolog</a></span>
  ${o.footerExtra ?? ""}
  <a href="${REPO_URL}">GitHub</a>
</footer>
</body>
</html>
`;
}

function breadcrumbs(items: { name: string; path?: string }[]): object {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      ...(item.path !== undefined && { item: SITE_URL + item.path }),
    })),
  };
}

// ============ Language page ============

export function renderLanguagePage(site: SiteData, id: string): string {
  const tree = site.tree.byId.get(id)!;
  const node = tree.data;
  const info = site.details[id] ?? { sources: [] };
  const familyId = site.tree.familyOf.get(id) ?? id;
  const family = site.tree.families.find((f) => f.id === familyId);
  const color = site.colors.get(familyId) ?? "var(--fg-dim)";
  const root = "../../";
  const link = (n: CoreNode) => `<a href="../${escapeAttr(n.id)}/">${escapeHtml(n.name)}</a>`;
  const description = describe(site, id);

  const facts: string[] = [];
  if (node.speakers !== undefined)
    facts.push(`<dt>Speakers</dt><dd>${compact.format(node.speakers)} <span class="faint">(${node.speakers.toLocaleString("en-US")})</span></dd>`);
  if (info.iso639_3) facts.push(`<dt>ISO 639-3</dt><dd class="mono">${info.iso639_3}</dd>`);
  if (info.glottocode)
    facts.push(`<dt>Glottocode</dt><dd class="mono"><a href="https://glottolog.org/resource/languoid/id/${info.glottocode}">${info.glottocode}</a></dd>`);
  if (node.parents.length > 1) {
    const others = node.parents.slice(1).map((p) => link(site.tree.byId.get(p)!.data));
    facts.push(`<dt>Also from</dt><dd>${others.join(", ")}</dd>`);
  }

  const lineage = lineageOf(site, id);
  const lineageHtml =
    lineage.length > 1
      ? `<section>
  <h2>Lineage</h2>
  <ol class="line">
    ${lineage
      .map(
        (n) =>
          `<li class="${n.id === id ? "current" : ""}${n.status === "reconstructed" ? " reconstructed" : ""}">${n.id === id ? `<span class="stop-name">${escapeHtml(n.name)}</span>` : link(n)}<span class="stop-period">${formatPeriod(n)}</span></li>`,
      )
      .join("\n    ")}
  </ol>
</section>`
      : "";

  const chips = (nodes: CoreNode[]) =>
    `<ul class="chips">${nodes.map((n) => `<li>${link(n)}</li>`).join("")}</ul>`;

  const children = tree.children.map((c) => c.data);
  const childrenHtml = children.length
    ? `<section>\n  <h2>Descendants <span class="faint">${children.length}</span></h2>\n  ${chips(children)}\n</section>`
    : "";

  const parent = node.parents[0] ? site.tree.byId.get(node.parents[0]) : undefined;
  const siblings = parent ? parent.children.map((c) => c.data).filter((n) => n.id !== id) : [];
  const siblingsHtml = siblings.length
    ? `<section>\n  <h2>Sister languages <span class="faint">${siblings.length}</span></h2>\n  <p class="hint">Also descended from ${link(parent!.data)}.</p>\n  ${chips(siblings)}\n</section>`
    : "";

  const sourcesHtml = info.sources.length
    ? `<section>\n  <h2>Sources</h2>\n  <ul class="sources">${info.sources.map((s) => `<li><a href="${escapeAttr(s)}" rel="noopener">${escapeHtml(prettyUrl(s))}</a></li>`).join("")}</ul>\n</section>`
    : "";

  const crumbs = [
    { name: "All languages", path: "lang/" },
    ...(family && family.id !== id ? [{ name: family.label, path: `lang/#${family.id}` }] : []),
    { name: node.name },
  ];

  const body = `<nav class="crumbs" aria-label="Breadcrumb"><ol>
  <li><a href="../">All languages</a></li>
  ${family && family.id !== id ? `<li><a href="../#${escapeAttr(family.id)}">${escapeHtml(family.label)}</a></li>` : ""}
  <li aria-current="page">${escapeHtml(node.name)}</li>
</ol></nav>
<header class="lang-head" style="--c:${color}">
  ${family ? `<p class="family"><span class="dot"></span>${escapeHtml(family.label)} ${family.id === id && tree.children.length === 0 ? "· language isolate" : "family"}</p>` : ""}
  <h1>${escapeHtml(node.name)}</h1>
  <p class="period">${formatPeriod(node)} <span class="pill status-${node.status}">${statusLabel(node.status)}</span></p>
</header>
<p class="lede">${escapeHtml(description)}</p>
<a class="cta" href="${root}#${escapeAttr(id)}">See ${escapeHtml(node.name)} on the interactive map <span aria-hidden="true">→</span></a>
${facts.length ? `<dl class="facts">${facts.join("")}</dl>` : ""}
${info.notes ? `<p class="notes">${escapeHtml(info.notes)}</p>` : ""}
<div style="--c:${color}">
${lineageHtml}
${childrenHtml}
${siblingsHtml}
</div>
${sourcesHtml}`;

  const sameAs = [
    ...(info.glottocode ? [`https://glottolog.org/resource/languoid/id/${info.glottocode}`] : []),
    ...info.sources.filter((s) => s.includes("wikipedia.org")),
  ];
  const language = {
    "@context": "https://schema.org",
    "@type": "Language",
    name: node.name,
    description,
    url: `${SITE_URL}lang/${id}/`,
    ...(info.iso639_3 && { alternateName: info.iso639_3 }),
    ...(sameAs.length && { sameAs: [...new Set(sameAs)] }),
  };

  return shell({
    root,
    path: `lang/${id}/`,
    title: `${node.name}: language family tree and history · Langenesis`,
    description,
    jsonLd: [language, breadcrumbs(crumbs)],
    body,
    footerExtra: site.files[id]
      ? `<a href="${REPO_URL}/edit/main/languages/${escapeAttr(site.files[id])}">Suggest a correction</a>`
      : "",
  });
}

// ============ Index of all languages ============

export function renderIndexPage(site: SiteData): string {
  const total = languageIds(site).length;
  const outline = (node: TreeNode): string => {
    const n = node.data;
    const kids = node.children.length ? `<ul>${node.children.map(outline).join("")}</ul>` : "";
    return `<li><a href="${escapeAttr(n.id)}/">${escapeHtml(n.name)}</a> <span class="faint">${formatPeriod(n)}</span>${kids}</li>`;
  };
  const families = site.tree.families
    .map((f) => {
      const count = f.descendants.size + 1;
      return `<section id="${escapeAttr(f.id)}" class="family-block" style="--c:${site.colors.get(f.id) ?? "var(--fg-dim)"}">
  <h2><span class="dot"></span>${escapeHtml(f.label)} <span class="faint">${count}</span></h2>
  <ul class="outline">${outline(f.node)}</ul>
</section>`;
    })
    .join("\n");
  const toc = site.tree.families
    .map((f) => `<li><a href="#${escapeAttr(f.id)}" style="--c:${site.colors.get(f.id) ?? "var(--fg-dim)"}"><span class="dot"></span>${escapeHtml(f.label)}</a></li>`)
    .join("");

  const description = `Every language on the Langenesis map: ${total} living languages, historical stages and reconstructed proto-languages in ${site.tree.families.length} families, each traced back to its oldest known ancestor.`;
  const body = `<header class="lang-head">
  <h1>All languages</h1>
</header>
<p class="lede">${escapeHtml(description)}</p>
<a class="cta" href="../">Open the interactive map <span aria-hidden="true">→</span></a>
<nav aria-label="Families"><ul class="toc">${toc}</ul></nav>
${families}`;

  return shell({
    root: "../",
    path: "lang/",
    title: "All languages: family trees of the world's languages · Langenesis",
    description,
    jsonLd: [breadcrumbs([{ name: "All languages" }])],
    body,
  });
}

// ============ Sitemap ============

export function renderSitemap(site: SiteData): string {
  const paths = ["", "lang/", ...languageIds(site).map((id) => `lang/${id}/`)];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((p) => `  <url><loc>${SITE_URL}${p}</loc></url>`).join("\n")}
</urlset>
`;
}
