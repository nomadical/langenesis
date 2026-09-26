import languages from "virtual:languages";
import { buildTree, type LoadedData } from "./tree";

export * from "./tree";

export function loadData(): LoadedData {
  return buildTree(
    languages,
    new Map(languages.map((n) => [n.id, n.folder])),
  );
}
