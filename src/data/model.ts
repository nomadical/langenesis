// Runtime types and helpers for the browser bundle. Kept free of Zod so the
// validator only runs at build time (see languages-plugin.ts).
import type { LanguageNode } from "./schema";

/** Fields the tree needs to draw and search. Shipped in the main bundle. */
export type CoreNode = Pick<
  LanguageNode,
  "id" | "name" | "parents" | "period" | "status" | "speakers"
>;

/** Reference material for the detail panel. Loaded lazily after first paint. */
export type NodeDetails = Pick<
  LanguageNode,
  "glottocode" | "iso639_3" | "sources" | "notes"
>;

export const CURRENT_YEAR = 2026;

export function periodEnd(node: CoreNode): number {
  return node.period.end === "present" ? CURRENT_YEAR : node.period.end;
}
