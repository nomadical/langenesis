import { hcl } from "d3";
import type { FamilyInfo } from "../data/tree";

// Hand-picked colours for the largest families (kept from the original
// metro palette); every other family gets a generated, quieter hue.
const FAMILY_COLORS: Record<string, string> = {
  "proto-afro-asiatic": "#e15759",
  "proto-austronesian": "#4cb3a3",
  "proto-dravidian": "#e89143",
  "proto-indo-european": "#5b9bd5",
  "proto-japonic": "#ff8ba0",
  "proto-koreanic": "#c49a6c",
  "proto-niger-congo": "#70ad47",
  "proto-sino-tibetan": "#edc949",
  "proto-turkic": "#9b7bc4",
  "proto-uralic": "#7fcbe0",
};

export function assignFamilyColors(families: FamilyInfo[]): Map<string, string> {
  const out = new Map<string, string>();
  // Generated hues step by the golden angle so neighbours around the circle
  // never share a colour; small families are quieter than large ones.
  let step = 0;
  for (const f of families) {
    const fixed = FAMILY_COLORS[f.id];
    if (fixed) {
      out.set(f.id, fixed);
      continue;
    }
    const h = (35 + step * 137.508) % 360;
    step++;
    const big = f.leafCount >= 5;
    out.set(f.id, hcl(h, big ? 42 : 26, big ? 72 : 66).formatHex());
  }
  return out;
}
