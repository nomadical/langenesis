// Display formatting shared by the app (main.ts) and the static pages
// (src/pages), so both describe a language the same way.
import type { CoreNode } from "./model";

export function statusLabel(status: CoreNode["status"]): string {
  return {
    living: "Living",
    extinct: "Extinct",
    reconstructed: "Reconstructed",
    classical: "Classical",
  }[status];
}

export function formatPeriod(node: CoreNode): string {
  const start = formatYear(node.period.start, node.period.start_uncertainty);
  const end = node.period.end === "present" ? "today" : formatYear(node.period.end);
  return `${start} – ${end}`;
}

export function formatYear(y: number, uncertainty?: number): string {
  const approx = uncertainty ? "c. " : "";
  if (y < 0) return `${approx}${(-y).toLocaleString("en-US")} BCE`;
  return `${approx}${y} CE`;
}

export function prettyUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = decodeURIComponent(u.pathname).replace(/^\/wiki\//, "").replace(/_/g, " ");
    return `${u.hostname.replace(/^(www|en)\./, "")} · ${path.replace(/^\//, "")}`;
  } catch {
    return url;
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

type Endangerment = NonNullable<CoreNode["endangerment"]>;

/** Least to most endangered (UNESCO's scale). */
export const ENDANGERMENT_LEVELS: readonly Endangerment[] = [
  "safe",
  "vulnerable",
  "definitely-endangered",
  "severely-endangered",
  "critically-endangered",
];

export function endangermentLabel(level: Endangerment): string {
  return {
    safe: "Safe",
    vulnerable: "Vulnerable",
    "definitely-endangered": "Definitely endangered",
    "severely-endangered": "Severely endangered",
    "critically-endangered": "Critically endangered",
  }[level];
}

/** Vulnerable or worse. */
export function isEndangered(node: CoreNode): boolean {
  return node.endangerment !== undefined && node.endangerment !== "safe";
}

export const FSI_URL = "https://www.state.gov/foreign-language-training/";

/** FSI's own names for its four categories. */
export function fsiLabel(category: number): string {
  return (
    ["Close to English", "Moderately hard", "Hard", "Super-hard"][category - 1] ??
    `Category ${category}`
  );
}

export function wiktionaryUrl(language: string): string {
  return `https://en.wiktionary.org/wiki/Category:${encodeURIComponent(language.replace(/ /g, "_"))}_lemmas`;
}
