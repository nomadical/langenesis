import yaml from "js-yaml";
import { languageNodeSchema, type LanguageNode, periodEnd } from "./schema";

export interface TreeNode {
  data: LanguageNode;
  children: TreeNode[];
  /** Parents beyond parents[0]. Used to draw secondary (DAG) edges. */
  secondaryParentIds: string[];
}

export interface FamilyInfo {
  /** The id of the top-level node this family is rooted at. */
  id: string;
  /** Display name (the top-level node's name). */
  name: string;
  /** Family name without the "Proto-" prefix, e.g. "Indo-European". */
  label: string;
  /** Number of leaf languages (tips) in the family. */
  leafCount: number;
  /** The TreeNode itself. */
  node: TreeNode;
  /** All descendant ids (excluding the root id itself). */
  descendants: Set<string>;
}

export interface LoadedData {
  /** Root of the visualization tree. Real root if a single family, virtual otherwise. */
  root: TreeNode;
  /** True iff `root` is the synthetic virtual root. */
  hasVirtualRoot: boolean;
  /** All nodes by id (includes the virtual root if present). */
  byId: Map<string, TreeNode>;
  /** Min and max year across the dataset (virtual root excluded). */
  yearExtent: [number, number];
  /** Maps every node id → the id of its containing family (= top-level ancestor). */
  familyOf: Map<string, string>;
  /** Families, ordered as discovered. */
  families: FamilyInfo[];
}

const VIRTUAL_ROOT_ID = "__root__";

/**
 * Families are laid out around the circle in this order — a rough world tour
 * (Africa → Near East & Europe → Caucasus → South, North & East Asia →
 * Southeast Asia & Oceania → the Americas) so geographic neighbours sit next
 * to each other. Keys are the top-level folder under `languages/`. Unknown
 * folders are appended, largest first.
 */
const FAMILY_ORDER = [
  "khoisan",
  "niger-congo",
  "nilo-saharan",
  "afro-asiatic",
  "sumerian",
  "elamite",
  "hurro-urartian",
  "indo-european",
  "tyrsenian",
  "basque",
  "uralic",
  "kartvelian",
  "northwest-caucasian",
  "northeast-caucasian",
  "dravidian",
  "burushaski",
  "turkic",
  "mongolic",
  "tungusic",
  "yeniseian",
  "chukotko-kamchatkan",
  "ainu",
  "koreanic",
  "japonic",
  "sino-tibetan",
  "hmong-mien",
  "kra-dai",
  "austroasiatic",
  "austronesian",
  "trans-new-guinea",
  "pama-nyungan",
  "eskimo-aleut",
  "na-dene",
  "haida",
  "algic",
  "kutenai",
  "iroquoian",
  "siouan",
  "zuni",
  "uto-aztecan",
  "purepecha",
  "oto-manguean",
  "mayan",
  "arawakan",
  "cariban",
  "tupian",
  "quechuan",
  "aymaran",
  "mapudungun",
];

export function familyLabel(name: string): string {
  return name.replace(/^Proto-/, "");
}

interface LoadedFile {
  node: LanguageNode;
  /** Top-level folder under languages/, e.g. "indo-european". */
  folder: string;
}

function loadYamlFiles(): LoadedFile[] {
  const files = import.meta.glob("/languages/**/*.yaml", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;

  const out: LoadedFile[] = [];
  for (const [path, raw] of Object.entries(files)) {
    let parsed: unknown;
    try {
      parsed = yaml.load(raw);
    } catch (err) {
      throw new Error(`Failed to parse ${path}: ${(err as Error).message}`);
    }
    const result = languageNodeSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(
        `Schema validation failed for ${path}:\n${result.error.issues
          .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
          .join("\n")}`,
      );
    }
    const folder = path.split("/")[2] ?? "";
    out.push({ node: result.data, folder });
  }
  return out;
}

export function buildTree(
  nodes: LanguageNode[],
  folderOf: Map<string, string> = new Map(),
): LoadedData {
  const byId = new Map<string, TreeNode>();
  for (const data of nodes) {
    if (byId.has(data.id)) {
      throw new Error(`Duplicate node id: ${data.id}`);
    }
    byId.set(data.id, { data, children: [], secondaryParentIds: [] });
  }

  for (const node of byId.values()) {
    for (const p of node.data.parents) {
      if (!byId.has(p)) {
        throw new Error(
          `Node "${node.data.id}" references unknown parent "${p}"`,
        );
      }
    }
  }

  const topLevel: TreeNode[] = [];
  for (const node of byId.values()) {
    if (node.data.parents.length === 0) {
      topLevel.push(node);
      continue;
    }
    const [primaryId, ...secondaryIds] = node.data.parents;
    byId.get(primaryId)!.children.push(node);
    node.secondaryParentIds = secondaryIds;
  }

  // Cycle detection over the entire node set
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const id of byId.keys()) color.set(id, WHITE);
  const visit = (n: TreeNode, path: string[]) => {
    color.set(n.data.id, GRAY);
    for (const c of n.children) {
      const cc = color.get(c.data.id)!;
      if (cc === GRAY) {
        throw new Error(
          `Cycle detected: ${[...path, c.data.id].join(" → ")}`,
        );
      }
      if (cc === WHITE) visit(c, [...path, c.data.id]);
    }
    color.set(n.data.id, BLACK);
  };
  for (const node of byId.values()) {
    if (color.get(node.data.id) === WHITE) visit(node, [node.data.id]);
  }

  let minYear = Infinity;
  let maxYear = -Infinity;
  for (const node of byId.values()) {
    minYear = Math.min(minYear, node.data.period.start);
    maxYear = Math.max(maxYear, periodEnd(node.data));
  }

  // For each top-level node, its families = it + all its descendants.
  // For a single-family load we treat the top-level node's *children* as
  // distinct families so colors map onto subbranches (Italic, Germanic, …)
  // rather than everything collapsing to one hue.
  const familyOf = new Map<string, string>();
  const countLeaves = (n: TreeNode): number =>
    n.children.length === 0
      ? 1
      : n.children.reduce((s, c) => s + countLeaves(c), 0);
  const orderIndex = (n: TreeNode) => {
    const i = FAMILY_ORDER.indexOf(folderOf.get(n.data.id) ?? "");
    return i === -1 ? FAMILY_ORDER.length : i;
  };
  topLevel.sort(
    (a, b) =>
      orderIndex(a) - orderIndex(b) || countLeaves(b) - countLeaves(a),
  );

  const familyRoots: TreeNode[] =
    topLevel.length === 1 ? topLevel[0].children : topLevel;

  const families: FamilyInfo[] = familyRoots.map((root) => {
    const descendants = new Set<string>();
    const stack: TreeNode[] = [root];
    while (stack.length) {
      const cur = stack.pop()!;
      if (cur.data.id !== root.data.id) descendants.add(cur.data.id);
      familyOf.set(cur.data.id, root.data.id);
      stack.push(...cur.children);
    }
    return {
      id: root.data.id,
      name: root.data.name,
      label: familyLabel(root.data.name),
      leafCount: countLeaves(root),
      node: root,
      descendants,
    };
  });

  let root: TreeNode;
  let hasVirtualRoot: boolean;
  if (topLevel.length === 1) {
    root = topLevel[0];
    hasVirtualRoot = false;
  } else {
    const rootData: LanguageNode = {
      id: VIRTUAL_ROOT_ID,
      name: "Languages",
      parents: [],
      period: { start: minYear, end: minYear },
      status: "reconstructed",
      sources: [],
    };
    root = { data: rootData, children: topLevel, secondaryParentIds: [] };
    byId.set(VIRTUAL_ROOT_ID, root);
    hasVirtualRoot = true;
  }

  return {
    root,
    hasVirtualRoot,
    byId,
    yearExtent: [minYear, maxYear],
    familyOf,
    families,
  };
}

export function isVirtualRootId(id: string): boolean {
  return id === VIRTUAL_ROOT_ID;
}

export function loadData(): LoadedData {
  const files = loadYamlFiles();
  return buildTree(
    files.map((f) => f.node),
    new Map(files.map((f) => [f.node.id, f.folder])),
  );
}
