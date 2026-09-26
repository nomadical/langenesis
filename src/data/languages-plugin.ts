import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import yaml from "js-yaml";
import type { Plugin } from "vite";
import {
  type CoreNode,
  languageNodeSchema,
  type NodeDetails,
} from "./schema";

/**
 * Validates every `languages/**.yaml` at build time and serves the result as
 * two virtual modules, so the browser never ships a YAML parser or Zod:
 *
 * - `virtual:languages` — the core graph (ids, names, parents, periods…),
 *   plus each node's top-level folder, used to order families.
 * - `virtual:language-details` — notes, sources and codes, keyed by id.
 *   main.ts imports it dynamically after first paint.
 *
 * Both are emitted as `JSON.parse('…')`, which engines parse faster than an
 * equivalent object literal.
 */
const CORE_ID = "virtual:languages";
const DETAILS_ID = "virtual:language-details";

function walkYaml(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walkYaml(full));
    else if (entry.endsWith(".yaml") || entry.endsWith(".yml")) out.push(full);
  }
  return out;
}

export function loadLanguages(root: string) {
  const dir = join(root, "languages");
  const core: (CoreNode & { folder: string })[] = [];
  const details: Record<string, NodeDetails> = {};
  // Path of each node's YAML under languages/, for "suggest a correction" links.
  const files: Record<string, string> = {};
  const errors: string[] = [];
  for (const path of walkYaml(dir)) {
    const rel = relative(dir, path);
    let parsed: unknown;
    try {
      parsed = yaml.load(readFileSync(path, "utf-8"));
    } catch (err) {
      errors.push(`${rel}: ${(err as Error).message}`);
      continue;
    }
    const result = languageNodeSchema.safeParse(parsed);
    if (!result.success) {
      errors.push(
        `${rel}:\n${result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n")}`,
      );
      continue;
    }
    const { id, name, parents, period, status, speakers } = result.data;
    const { glottocode, iso639_3, sources, notes } = result.data;
    core.push({
      id,
      name,
      parents,
      period,
      status,
      ...(speakers !== undefined && { speakers }),
      folder: rel.split(sep)[0],
    });
    files[id] = rel.split(sep).join("/");
    details[id] = {
      sources,
      ...(glottocode && { glottocode }),
      ...(iso639_3 && { iso639_3 }),
      ...(notes && { notes: notes.trim() }),
    };
  }
  if (errors.length) {
    throw new Error(`Invalid language data:\n${errors.join("\n")}`);
  }
  return { core, details, files };
}

const asModule = (value: unknown) =>
  `export default JSON.parse(${JSON.stringify(JSON.stringify(value))});`;

export function languagesPlugin(): Plugin {
  let root = process.cwd();
  return {
    name: "langenesis-languages",
    configResolved(config) {
      root = config.root;
    },
    resolveId(id) {
      if (id === CORE_ID || id === DETAILS_ID) return `\0${id}`;
    },
    load(id) {
      if (id === `\0${CORE_ID}`) return asModule(loadLanguages(root).core);
      if (id === `\0${DETAILS_ID}`) return asModule(loadLanguages(root).details);
    },
    configureServer(server) {
      // Reload the page when any language file changes in dev.
      const dir = join(root, "languages");
      server.watcher.add(dir);
      const onChange = (file: string) => {
        if (!file.startsWith(dir)) return;
        for (const id of [CORE_ID, DETAILS_ID]) {
          const mod = server.moduleGraph.getModuleById(`\0${id}`);
          if (mod) server.moduleGraph.invalidateModule(mod);
        }
        server.ws.send({ type: "full-reload" });
      };
      server.watcher.on("change", onChange);
      server.watcher.on("add", onChange);
      server.watcher.on("unlink", onChange);
    },
  };
}
