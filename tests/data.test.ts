import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { languageNodeSchema, periodEnd } from "../src/data/schema";
import { buildTree } from "../src/data/loader";
import { FSI_URL } from "../src/data/format";
import type { LanguageNode } from "../src/data/schema";

const LANG_DIR = join(__dirname, "..", "languages");

function walkYaml(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walkYaml(full));
    else if (entry.endsWith(".yaml") || entry.endsWith(".yml")) out.push(full);
  }
  return out;
}

function loadAll(): { path: string; node: LanguageNode }[] {
  return walkYaml(LANG_DIR).map((path) => {
    const raw = readFileSync(path, "utf-8");
    const parsed = yaml.load(raw);
    const result = languageNodeSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(
        `${path}: ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
      );
    }
    return { path, node: result.data };
  });
}

describe("language YAML files", () => {
  const entries = loadAll();
  const nodes = entries.map((e) => e.node);

  it("loads at least one node", () => {
    expect(nodes.length).toBeGreaterThan(0);
  });

  it("every node has a unique id", () => {
    const seen = new Set<string>();
    for (const n of nodes) {
      expect(seen.has(n.id), `duplicate id: ${n.id}`).toBe(false);
      seen.add(n.id);
    }
  });

  it("file's id matches its filename slug", () => {
    for (const { path, node } of entries) {
      const slug = path.split("/").pop()!.replace(/\.(yaml|yml)$/, "");
      expect(node.id, `${path}`).toBe(slug);
    }
  });

  it("every parent reference resolves", () => {
    const ids = new Set(nodes.map((n) => n.id));
    for (const n of nodes) {
      for (const p of n.parents) {
        expect(ids.has(p), `${n.id} → unknown parent ${p}`).toBe(true);
      }
    }
  });

  it("every node has at least one source", () => {
    for (const n of nodes) {
      expect(n.sources.length, `${n.id} has no sources`).toBeGreaterThan(0);
    }
  });

  it("periods are within plausible bounds", () => {
    for (const n of nodes) {
      // Deep proto-language reconstructions (Afro-Asiatic, Nostratic, …) push
      // the lower bound; -16000 is a generous ceiling on scholarly estimates.
      expect(n.period.start, `${n.id}.period.start`).toBeGreaterThan(-16000);
      expect(periodEnd(n), `${n.id}.period.end`).toBeLessThanOrEqual(2030);
    }
  });

  it("FSI learning time matches its category and cites FSI", () => {
    // Weeks per category, from https://www.state.gov/foreign-language-training/
    const weeks: Record<number, number[]> = { 1: [24, 30], 2: [36], 3: [44], 4: [88] };
    for (const n of nodes.filter((n) => n.learning)) {
      const { fsi_category, weeks: w } = n.learning!;
      expect(weeks[fsi_category], `${n.id}.learning`).toContain(w);
      expect(n.status, `${n.id}.learning on a non-living language`).toBe("living");
      expect(n.sources, `${n.id} cites FSI`).toContain(FSI_URL);
    }
  });

  it("each Wiktionary language is counted on one node only", () => {
    const seen = new Map<string, string>();
    for (const n of nodes.filter((n) => n.vocabulary)) {
      const lang = n.vocabulary!.wiktionary_language;
      expect(seen.get(lang), `${n.id} and ${seen.get(lang)} share ${lang}`).toBeUndefined();
      seen.set(lang, n.id);
    }
  });

  it("schema rejects endangerment on a dead language", () => {
    const dead = {
      id: "x",
      name: "X",
      parents: [],
      period: { start: 0, end: 100 },
      status: "extinct",
      endangerment: "vulnerable",
      sources: ["https://example.org"],
    };
    expect(languageNodeSchema.safeParse(dead).success).toBe(false);
    expect(
      languageNodeSchema.safeParse({ ...dead, status: "living", period: { start: 0, end: "present" } })
        .success,
    ).toBe(true);
  });

  it("buildTree succeeds (no cycles, builds tree)", () => {
    const { byId, root, yearExtent, hasVirtualRoot } = buildTree(nodes);
    expect(byId.size).toBe(nodes.length + (hasVirtualRoot ? 1 : 0));
    expect(root.children.length).toBeGreaterThan(0);
    expect(yearExtent[0]).toBeLessThan(yearExtent[1]);
  });

  it("topLevel count drives virtual-root behaviour", () => {
    const { hasVirtualRoot, root, families } = buildTree(nodes);
    const topLevelCount = nodes.filter((n) => n.parents.length === 0).length;
    if (topLevelCount === 1) {
      expect(hasVirtualRoot).toBe(false);
      expect(root.data.parents.length).toBe(0);
    } else {
      expect(hasVirtualRoot).toBe(true);
      expect(root.data.id).toBe("__root__");
      // Each top-level node becomes its own family in multi-family mode.
      expect(families.length).toBe(topLevelCount);
    }
  });

  it("rejects cycles", () => {
    const cyclic: LanguageNode[] = [
      {
        id: "a",
        name: "A",
        parents: ["b"],
        period: { start: 0, end: 100 },
        status: "extinct",
        sources: [],
      },
      {
        id: "b",
        name: "B",
        parents: ["a"],
        period: { start: 0, end: 100 },
        status: "extinct",
        sources: [],
      },
    ];
    expect(() => buildTree(cyclic)).toThrow();
  });
});
