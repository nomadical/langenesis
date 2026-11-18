// Checks every `glottocode` in languages/ against Glottolog's published list.
// It needs the network, so `npm test` skips it; CI runs it through
// `npm run test:glottolog`.
import { beforeAll, describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import yaml from "js-yaml";
import type { LanguageNode } from "../src/data/schema";

// Pinned so a Glottolog release can't break CI unannounced. To move to a newer
// release, change the tag (https://github.com/glottolog/glottolog-cldf/tags).
const GLOTTOLOG_RELEASE = "v5.4";
const LANGUAGES_CSV = `https://raw.githubusercontent.com/glottolog/glottolog-cldf/${GLOTTOLOG_RELEASE}/cldf/languages.csv`;

/**
 * Attested languages that rightly point at a Glottolog *family*: umbrella
 * languages (often ISO macrolanguages) that Glottolog splits into several
 * languages. Anything else on a family code is usually a wrong lookup, like
 * Tagalog once pointing at the Tagalogic family.
 */
const UMBRELLA_LANGUAGES: Record<string, string> = {
  ojibwe: "Glottolog splits Ojibwa into several languages",
  haida: "Glottolog splits Northern and Southern Haida",
  pashto: "Glottolog splits Pashto into several languages",
  ossetian: "covers both Iron and Digor",
};

const LANG_DIR = join(__dirname, "..", "languages");

interface Languoid {
  iso: string;
  level: string;
  name: string;
}

function walkYaml(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walkYaml(full);
    return /\.ya?ml$/.test(entry) ? [full] : [];
  });
}

/** RFC 4180 rows: quoted fields may hold commas, quotes ("") and newlines. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') field += text[i++];
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") row.push(field), (field = "");
    else if (c === "\n") row.push(field), rows.push(row), (row = []), (field = "");
    else if (c !== "\r") field += c;
  }
  if (field || row.length) row.push(field), rows.push(row);
  return rows;
}

function loadNodes(): { file: string; node: LanguageNode }[] {
  return walkYaml(LANG_DIR).map((path) => ({
    file: relative(LANG_DIR, path),
    node: yaml.load(readFileSync(path, "utf-8")) as LanguageNode,
  }));
}

describe.skipIf(!process.env.GLOTTOLOG_CHECK)(`glottocodes (Glottolog ${GLOTTOLOG_RELEASE})`, () => {
  const glottolog = new Map<string, Languoid>();
  const nodes = loadNodes().filter((e) => e.node.glottocode);

  beforeAll(async () => {
    const res = await fetch(LANGUAGES_CSV);
    if (!res.ok) throw new Error(`GET ${LANGUAGES_CSV} → ${res.status}`);
    const [head, ...rows] = parseCsv(await res.text());
    const col = (name: string) => {
      const i = head.indexOf(name);
      if (i === -1) throw new Error(`languages.csv has no ${name} column`);
      return i;
    };
    const [id, name, iso, level] = ["ID", "Name", "ISO639P3code", "Level"].map(col);
    for (const r of rows) glottolog.set(r[id], { name: r[name], iso: r[iso], level: r[level] });
    // Sanity check that the download parsed: Glottolog has ~27,000 languoids.
    expect(glottolog.size).toBeGreaterThan(20000);
  }, 60_000);

  it("every glottocode exists in Glottolog", () => {
    const unknown = nodes
      .filter(({ node }) => !glottolog.has(node.glottocode!))
      .map(({ file, node }) => `${file}: ${node.glottocode}`);
    expect(unknown, "glottocodes not in Glottolog").toEqual([]);
  });

  it("ISO 639-3 code matches Glottolog's for that glottocode", () => {
    const mismatched = nodes.flatMap(({ file, node }) => {
      const g = glottolog.get(node.glottocode!);
      if (!g?.iso || !node.iso639_3 || g.iso === node.iso639_3) return [];
      return [`${file}: iso639_3 ${node.iso639_3}, but ${node.glottocode} (${g.name}) is ${g.iso}`];
    });
    expect(mismatched).toEqual([]);
  });

  it("attested languages don't point at a family, unless listed as umbrella languages", () => {
    const families = nodes.flatMap(({ file, node }) => {
      const g = glottolog.get(node.glottocode!);
      if (node.status === "reconstructed" || g?.level !== "family") return [];
      if (node.id in UMBRELLA_LANGUAGES) return [];
      return [`${file}: ${node.glottocode} is the ${g.name} family`];
    });
    expect(families, "add to UMBRELLA_LANGUAGES only if the node really covers the whole family").toEqual([]);
  });

  it("every umbrella language is still on a family code", () => {
    const stale = Object.keys(UMBRELLA_LANGUAGES).filter((id) => {
      const entry = nodes.find(({ node }) => node.id === id);
      return !entry || glottolog.get(entry.node.glottocode!)?.level !== "family";
    });
    expect(stale, "remove these from UMBRELLA_LANGUAGES").toEqual([]);
  });
});
