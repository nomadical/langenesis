// Checks every `glottocode` in languages/ against Glottolog's published list.
// It needs the network, so `npm test` skips it; CI runs it through
// `npm run test:glottolog`.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import yaml from "js-yaml";

// Pinned so a Glottolog release can't break CI unannounced. To move to a newer
// release, change the tag (https://github.com/glottolog/glottolog-cldf/tags).
const GLOTTOLOG_RELEASE = "v5.4";
const LANGUAGES_CSV = `https://raw.githubusercontent.com/glottolog/glottolog-cldf/${GLOTTOLOG_RELEASE}/cldf/languages.csv`;

const LANG_DIR = join(__dirname, "..", "languages");

function walkYaml(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walkYaml(full);
    return /\.ya?ml$/.test(entry) ? [full] : [];
  });
}

/** The first column (the glottocode) of each row. Glottocodes never need quoting. */
function glottocodesIn(csv: string): Set<string> {
  return new Set(
    csv
      .split("\n")
      .slice(1)
      .map((line) => line.slice(0, line.indexOf(",")))
      .filter((id) => /^[a-z]{4}\d{4}$/.test(id)),
  );
}

describe.skipIf(!process.env.GLOTTOLOG_CHECK)(`glottocodes (Glottolog ${GLOTTOLOG_RELEASE})`, () => {
  it("every glottocode exists in Glottolog", async () => {
    const res = await fetch(LANGUAGES_CSV);
    expect(res.ok, `GET ${LANGUAGES_CSV} → ${res.status}`).toBe(true);
    const known = glottocodesIn(await res.text());
    // Sanity check that the download parsed: Glottolog has ~27,000 languoids.
    expect(known.size).toBeGreaterThan(20000);

    const unknown: string[] = [];
    for (const path of walkYaml(LANG_DIR)) {
      const node = yaml.load(readFileSync(path, "utf-8")) as { glottocode?: string };
      if (node.glottocode && !known.has(node.glottocode)) {
        unknown.push(`${relative(LANG_DIR, path)}: ${node.glottocode}`);
      }
    }
    expect(unknown, "glottocodes not in Glottolog").toEqual([]);
  }, 60_000);
});
