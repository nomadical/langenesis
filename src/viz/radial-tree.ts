import * as d3 from "d3";
import {
  type FamilyInfo,
  isVirtualRootId,
  type LoadedData,
  type TreeNode,
} from "../data/loader";
import { type CoreNode, periodEnd } from "../data/model";

export interface RadialTreeOptions {
  onNodeClick?: (node: CoreNode | null) => void;
  onNodeHover?: (node: CoreNode | null, event: MouseEvent | null) => void;
  onFamilyHover?: (family: FamilyInfo | null, event: MouseEvent | null) => void;
  onFamilyClick?: (family: FamilyInfo) => void;
}

export interface RadialTreeHandle {
  focusNode: (id: string) => void;
  focusFamily: (familyId: string) => void;
  resetZoom: () => void;
  zoomBy: (factor: number) => void;
  select: (id: string | null) => void;
  setLineage: (id: string | null) => void;
  highlightFamily: (familyId: string | null) => void;
  search: (query: string) => CoreNode[];
  familyColor: (familyId: string) => string;
  lineageOf: (id: string) => string[];
}

/*
 * Rendering model
 * ---------------
 * The tree has ~700 arcs and ~700 edges, which is too many SVG elements to
 * restyle and repaint on every zoom frame. So the geometry is drawn on a
 * <canvas>, batched into one stroke per colour and state, and redrawn each
 * frame in well under a millisecond.
 *
 * Text stays in SVG for crisp type, but in *screen* space: only labels that
 * are visible at this zoom (level of detail) and on screen (culling) are
 * shown and positioned, at a fixed pixel size.
 *
 * Hover and click are resolved by maths, not DOM hit-testing: the pointer is
 * converted to polar coordinates and matched against the nodes sorted by
 * angle with a binary search.
 *
 * Coordinates: "user" units are the tree's own polar space (OUTER_R = 440).
 * "Base" pixels map user units onto the viewport at zoom 1:
 *   base = centre + basePx * user
 * and the d3 zoom transform maps base pixels to the screen.
 */

const OUTER_R = 440;
const INNER_R = 56;
// Empty wedge at 12 o'clock that holds the era-ring labels.
const GAP = (18 * Math.PI) / 180;
// Leaf slots of empty space between adjacent families.
const FAMILY_PAD = 1.8;

// Label metrics in screen pixels.
const LEAF_FONT = 12.5;
const INTERNAL_FONT = 11;
const FAMILY_FONT = 11;
const ERA_FONT = 10.5;
const CHAR_W = 0.55; // average glyph advance as a fraction of font size
const LINE_GAP = 1.2; // labels need this many font-heights between them

const SCALE_EXTENT: [number, number] = [0.7, 24];
// Internal (historical-stage) labels only appear once you start zooming in,
// so the first view reads as leaves + families.
const INTERNAL_MIN_K = 1.9;
const ERA_YEARS = [-8000, -5000, -3000, -1000, 1, 1000, 1500];

// Stroke widths in user units at zoom 1. On screen they grow with zoom^0.7,
// so lines thicken gently as you zoom in rather than ballooning.
const ARC_W = 2.8;
const ARC_W_HOVER = 5;
const ARC_W_LINEAGE = 4.5;
const ARC_W_SELECTED = 6.5;
const EDGE_W = 1.2;
const EDGE_W_LINEAGE = 2.4;

const INTRO_STAGGER = 60; // ms per depth level
const INTRO_ARC = 420;
const INTRO_EDGE = 320;

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
const ROOT_STROKE = "#e1e8f5";
const RING_STROKE = "rgba(180, 200, 230, 0.1)";
const TODAY_STROKE = "rgba(180, 200, 230, 0.16)";
const GHOST_STROKE = "rgba(232, 236, 245, 0.2)";

const reducedMotion =
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

type Positioned = d3.HierarchyNode<TreeNode> & {
  angle: number;
  startR: number;
  endR: number;
};

interface Arc {
  id: string;
  famId: string | null;
  angle: number;
  startR: number;
  endR: number;
  depth: number;
  leaf: boolean;
  color: string;
  dotted: boolean;
}

interface Edge {
  source: { angle: number; r: number };
  target: { angle: number; r: number };
  famId: string | null;
  childId: string;
  depth: number;
  kind: "primary" | "root" | "secondary";
  color: string;
}

interface Label {
  id: string;
  famId: string | null;
  angle: number;
  r0: number;
  lengthPx: number;
  fontPx: number;
  priority: number;
  leaf: boolean;
  depth: number;
  /** Minimum zoom at which this label is shown. */
  minK: number;
  el: SVGTextElement;
  rotate: string;
  shown: boolean;
}

interface Style {
  color: string;
  alpha: number;
  /** User units; 0 means a one-screen-pixel hairline. */
  width: number;
  dash: "none" | "dots" | "dashes";
}

interface Bucket<T> {
  style: Style;
  items: T[];
}

export function renderRadialTree(
  svgEl: SVGSVGElement,
  data: LoadedData,
  options: RadialTreeOptions = {},
): RadialTreeHandle {
  const svg = d3.select(svgEl);
  svg.selectAll("*").remove();
  svgEl.removeAttribute("viewBox");

  const canvas = document.createElement("canvas");
  canvas.className = "viz-canvas";
  canvas.setAttribute("aria-hidden", "true");
  svgEl.parentElement!.insertBefore(canvas, svgEl);
  const ctx = canvas.getContext("2d")!;

  const familyColors = assignFamilyColors(data.families);
  const colorOf = (id: string) => {
    const f = data.familyOf.get(id);
    return f ? (familyColors.get(f) ?? ROOT_STROKE) : ROOT_STROKE;
  };
  const isRoot = (id: string) => data.hasVirtualRoot && isVirtualRootId(id);

  const timeScale = makeTimeScale(data.yearExtent, INNER_R, OUTER_R);
  const hier = d3.hierarchy<TreeNode>(data.root, (d) => d.children);

  // ---------- Angular layout ----------
  // Leaves are spread evenly, with padding between families and an empty
  // wedge at the top for the era labels. Internal nodes sit at the mean angle
  // of their children.
  const leaves = hier.leaves() as Positioned[];
  const famOfLeaf = leaves.map((l) => data.familyOf.get(l.data.data.id));
  const slots: number[] = [];
  let slot = 0;
  leaves.forEach((_, i) => {
    if (i > 0 && famOfLeaf[i] !== famOfLeaf[i - 1]) slot += FAMILY_PAD;
    slots.push(slot);
    slot += 1;
  });
  const slotAngle = (2 * Math.PI - GAP) / slot;
  leaves.forEach((leaf, i) => {
    leaf.angle = GAP / 2 + (slots[i] + 0.5) * slotAngle;
  });
  hier.eachAfter((n) => {
    const p = n as Positioned;
    if (n.children && n.children.length > 0) {
      p.angle =
        n.children.reduce((sum, c) => sum + (c as Positioned).angle, 0) /
        n.children.length;
    }
  });

  // ---------- Radial layout ----------
  // Each node's arc spans its period. Chained arcs are inset so a small gap
  // (a "station") separates consecutive historical stages.
  const TARGET_INSET = 5;
  hier.each((n) => {
    const p = n as Positioned;
    if (isRoot(n.data.data.id)) {
      p.startR = 0;
      p.endR = 0;
      return;
    }
    const rawStart = timeScale(n.data.data.period.start);
    const rawEnd = timeScale(periodEnd(n.data.data));
    const hasInternalParent = !!n.parent && !isRoot(n.parent.data.data.id);
    const hasChildren = !!(n.children && n.children.length > 0);
    const sides = (hasInternalParent ? 1 : 0) + (hasChildren ? 1 : 0);
    const maxInsetTotal = Math.max(0, rawEnd - rawStart - 1);
    const inset = sides === 0 ? 0 : Math.min(TARGET_INSET, maxInsetTotal / sides);
    p.startR = rawStart + (hasInternalParent ? inset : 0);
    p.endR = rawEnd - (hasChildren ? inset : 0);
  });

  const visibleNodes = hier
    .descendants()
    .filter((d) => !isRoot(d.data.data.id)) as Positioned[];
  const nodeById = new Map<string, Positioned>();
  for (const n of visibleNodes) nodeById.set(n.data.data.id, n);

  function ancestorsOf(id: string): string[] {
    const out: string[] = [];
    let cur: d3.HierarchyNode<TreeNode> | null = nodeById.get(id) ?? null;
    while (cur && !isRoot(cur.data.data.id)) {
      out.push(cur.data.data.id);
      cur = cur.parent;
    }
    return out;
  }

  // Angular extent of each family, used by the outer band and family zoom.
  const familySpan = new Map<string, [number, number]>();
  leaves.forEach((leaf, i) => {
    const f = famOfLeaf[i];
    if (!f) return;
    const a0 = leaf.angle - slotAngle / 2;
    const a1 = leaf.angle + slotAngle / 2;
    const span = familySpan.get(f);
    familySpan.set(f, span ? [Math.min(span[0], a0), Math.max(span[1], a1)] : [a0, a1]);
  });
  const bandFamilies = data.families.filter((f) => familySpan.has(f.id));

  // ---------- Scene model ----------
  const arcs: Arc[] = visibleNodes.map((d) => ({
    id: d.data.data.id,
    famId: data.familyOf.get(d.data.data.id) ?? null,
    angle: d.angle,
    startR: d.startR,
    endR: d.endR,
    depth: d.depth,
    leaf: isLeafNode(d),
    color: colorOf(d.data.data.id),
    dotted: d.data.data.status === "reconstructed",
  }));
  const arcById = new Map(arcs.map((a) => [a.id, a]));
  // Sorted by angle for hit-testing.
  const arcsByAngle = [...arcs].sort((a, b) => a.angle - b.angle);

  const edges: Edge[] = [];
  hier.links().forEach((link) => {
    const parent = link.source as Positioned;
    const child = link.target as Positioned;
    const childId = child.data.data.id;
    const fromRoot = isRoot(parent.data.data.id);
    edges.push({
      source: fromRoot
        ? { angle: child.angle, r: INNER_R * 0.35 }
        : { angle: parent.angle, r: parent.endR },
      target: { angle: child.angle, r: child.startR },
      famId: data.familyOf.get(childId) ?? null,
      childId,
      depth: child.depth,
      kind: fromRoot ? "root" : "primary",
      color: fromRoot ? GHOST_STROKE : colorOf(childId),
    });
  });
  // Secondary (DAG) edges: mixed languages with more than one parent.
  for (const p of visibleNodes) {
    for (const secId of p.data.secondaryParentIds) {
      const sec = nodeById.get(secId);
      if (!sec) continue;
      edges.push({
        source: { angle: sec.angle, r: sec.endR },
        target: { angle: p.angle, r: p.startR },
        famId: data.familyOf.get(p.data.data.id) ?? null,
        childId: p.data.data.id,
        depth: p.depth,
        kind: "secondary",
        color: colorOf(p.data.data.id),
      });
    }
  }

  const [minYear] = data.yearExtent;
  const eras = ERA_YEARS.filter((y) => y > minYear);

  // ---------- SVG overlay (screen space) ----------
  const eraG = svg.append("g").attr("class", "eras");
  const bandG = svg.append("g").attr("class", "family-band");
  const labelsG = svg.append("g").attr("class", "labels");

  const eraLabels = [...eras, "today" as const].map((y) => {
    const text = y === "today" ? "Today" : formatEra(y);
    const el = eraG
      .append("text")
      .attr("class", "era-label")
      .attr("dx", "0.5em")
      .attr("dy", "0.35em")
      .style("display", "none")
      .text(text)
      .node()!;
    return {
      r: y === "today" ? OUTER_R : timeScale(y),
      px: text.length * CHAR_W * ERA_FONT + 14,
      el,
      shown: false,
    };
  });
  eraLabels.sort((a, b) => b.r - a.r);

  const bandLabels = bandFamilies.map((f) => {
    const pathEl = bandG
      .append("path")
      .attr("class", "band-text-path")
      .attr("id", `band-path-${f.id}`)
      .node()!;
    const textEl = bandG
      .append("text")
      .attr("class", "band-label")
      .style("fill", familyColors.get(f.id) ?? ROOT_STROKE)
      .style("display", "none");
    textEl
      .append("textPath")
      .attr("href", `#band-path-${f.id}`)
      .attr("startOffset", "50%")
      .attr("text-anchor", "middle")
      .text(f.label);
    return {
      fam: f,
      span: familySpan.get(f.id)!,
      textPx: f.label.length * 0.68 * FAMILY_FONT + 12,
      pathEl,
      el: textEl.node()!,
      shown: false,
    };
  });

  const labels: Label[] = visibleNodes.map((d) => {
    const leaf = isLeafNode(d);
    const fontPx = leaf ? LEAF_FONT : INTERNAL_FONT;
    const flip = d.angle > Math.PI;
    const el = labelsG
      .append("text")
      .attr("class", leaf ? "node-label leaf" : "node-label internal")
      .attr("text-anchor", flip ? "end" : "start")
      .attr("dy", leaf ? "0.32em" : "-0.55em")
      .style("display", "none")
      .text(d.data.data.name)
      .node()!;
    // Labels read outward; left-half labels flip so they are never upside down.
    const deg = (d.angle * 180) / Math.PI - 90 + (flip ? 180 : 0);
    return {
      id: d.data.data.id,
      famId: data.familyOf.get(d.data.data.id) ?? null,
      angle: d.angle,
      r0: leaf ? d.endR + 6 : d.startR + 2,
      lengthPx: d.data.data.name.length * CHAR_W * fontPx,
      fontPx,
      priority: labelPriority(d),
      leaf,
      depth: d.depth,
      minK: 0,
      el,
      rotate: ` rotate(${deg.toFixed(2)})`,
      shown: false,
    };
  });
  const labelById = new Map(labels.map((l) => [l.id, l]));
  // Collision resolution runs in priority order.
  const labelsByPriority = [...labels].sort((a, b) => b.priority - a.priority);

  // ---------- View state ----------
  let W = 1;
  let H = 1;
  let dpr = 1;
  let basePx = 1;
  let bandR = OUTER_R + 150;
  let t = d3.zoomIdentity;

  let hoverId: string | null = null;
  let hoverFamily: string | null = null;
  let selectedId: string | null = null;
  let lineage = new Set<string>();
  let selFamily: string | null = null;
  let focusFamilyId: string | null = null;

  let introStart = reducedMotion ? -Infinity : performance.now();
  const introDuration =
    (d3.max(arcs, (a) => a.depth) ?? 0) * INTRO_STAGGER + INTRO_ARC + 260;

  const baseX = (ux: number) => W / 2 + basePx * ux;
  const baseY = (uy: number) => H / 2 + basePx * uy;

  // ---------- Styles (rebuilt on state change, not per frame) ----------
  let arcBuckets: Bucket<Arc>[] = [];
  let edgeBuckets: Bucket<Edge>[] = [];

  function arcStyle(a: Arc): Style {
    let alpha = 1;
    let width = ARC_W;
    if (focusFamilyId) {
      alpha = a.famId === focusFamilyId ? 1 : 0.1;
    } else if (selectedId) {
      if (a.id === selectedId) width = ARC_W_SELECTED;
      else if (lineage.has(a.id)) width = ARC_W_LINEAGE;
      else alpha = a.famId === selFamily ? 0.6 : 0.12;
    }
    if (a.id === hoverId) {
      alpha = 1;
      width = Math.max(width, ARC_W_HOVER);
    }
    return { color: a.color, alpha, width, dash: a.dotted ? "dots" : "none" };
  }

  function edgeStyle(e: Edge): Style {
    if (e.kind === "root") return { color: e.color, alpha: 1, width: 0, dash: "dots" };
    let alpha = e.kind === "secondary" ? 0.55 : 0.85;
    let width = EDGE_W;
    if (focusFamilyId) {
      if (e.famId !== focusFamilyId) alpha = 0.06;
    } else if (selectedId) {
      if (lineage.has(e.childId)) {
        alpha = 1;
        width = EDGE_W_LINEAGE;
      } else alpha = e.famId === selFamily ? 0.45 : 0.08;
    }
    return {
      color: e.color,
      alpha,
      width,
      dash: e.kind === "secondary" ? "dashes" : "none",
    };
  }

  function bucketize<T>(items: T[], styleOf: (item: T) => Style): Bucket<T>[] {
    const map = new Map<string, Bucket<T>>();
    for (const item of items) {
      const s = styleOf(item);
      const key = `${s.color}|${s.alpha}|${s.width}|${s.dash}`;
      let b = map.get(key);
      if (!b) map.set(key, (b = { style: s, items: [] }));
      b.items.push(item);
    }
    // Faded buckets first, emphasised ones last, so emphasis draws on top.
    return [...map.values()].sort(
      (a, b) => a.style.alpha - b.style.alpha || a.style.width - b.style.width,
    );
  }

  function rebuildStyles() {
    arcBuckets = bucketize(arcs, arcStyle);
    edgeBuckets = bucketize(edges, edgeStyle);
  }

  // ---------- Canvas drawing ----------
  const edgeLink = d3
    .linkRadial<Edge, { angle: number; r: number }>()
    .angle((d) => d.angle)
    .radius((d) => d.r)
    .context(ctx);

  function strokeStyle(st: Style, zs: number, hair: number) {
    ctx.strokeStyle = st.color;
    if (st.width === 0) {
      // Hairline: 1px on screen, dotted.
      ctx.lineWidth = hair;
      ctx.setLineDash([hair, 4 * hair]);
      return;
    }
    ctx.lineWidth = st.width * zs;
    if (st.dash === "dots") ctx.setLineDash([0.1 * zs, 5.5 * zs]);
    else if (st.dash === "dashes") ctx.setLineDash([4 * zs, 5 * zs]);
    else ctx.setLineDash([]);
  }

  function draw(now: number) {
    const elapsed = now - introStart;
    const intro = elapsed < introDuration;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const s = t.k * basePx;
    ctx.setTransform(
      dpr * s,
      0,
      0,
      dpr * s,
      dpr * (t.x + (t.k * W) / 2),
      dpr * (t.y + (t.k * H) / 2),
    );
    const zs = Math.pow(t.k, -0.3); // stroke scale: on screen ∝ k^0.7
    const hair = 1 / s; // one screen pixel in user units

    // Era rings
    ctx.lineCap = "butt";
    ctx.lineWidth = hair;
    ctx.strokeStyle = RING_STROKE;
    ctx.setLineDash([3 * hair, 4 * hair]);
    ctx.beginPath();
    for (const y of eras) {
      const r = timeScale(y);
      ctx.moveTo(r, 0);
      ctx.arc(0, 0, r, 0, 2 * Math.PI);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = TODAY_STROKE;
    ctx.beginPath();
    ctx.arc(0, 0, OUTER_R, 0, 2 * Math.PI);
    ctx.stroke();

    // Family band
    ctx.lineWidth = 3;
    for (const b of bandLabels) {
      const [a0, a1] = b.span;
      const id = b.fam.id;
      ctx.globalAlpha =
        focusFamilyId && focusFamilyId !== id ? 0.3 : hoverFamily === id ? 1 : 0.85;
      ctx.strokeStyle = familyColors.get(id) ?? ROOT_STROKE;
      ctx.beginPath();
      // Canvas angles start at 3 o'clock; ours start at 12.
      ctx.arc(
        0,
        0,
        bandR + 1.5,
        a0 + slotAngle * 0.3 - Math.PI / 2,
        a1 - slotAngle * 0.3 - Math.PI / 2,
      );
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.lineCap = "round";

    // Edges
    for (const b of edgeBuckets) {
      strokeStyle(b.style, zs, hair);
      if (!intro) {
        ctx.globalAlpha = b.style.alpha;
        ctx.beginPath();
        for (const e of b.items) edgeLink(e);
        ctx.stroke();
        continue;
      }
      for (const e of b.items) {
        const p = clamp01((elapsed - e.depth * INTRO_STAGGER) / INTRO_EDGE);
        if (p <= 0) continue;
        ctx.globalAlpha = b.style.alpha * p;
        ctx.beginPath();
        edgeLink(e);
        ctx.stroke();
      }
    }

    // Arcs: grow outward during the intro, staggered by depth.
    for (const b of arcBuckets) {
      strokeStyle(b.style, zs, hair);
      ctx.globalAlpha = b.style.alpha;
      ctx.beginPath();
      for (const a of b.items) {
        let end = a.endR;
        if (intro) {
          const p = d3.easeCubicOut(clamp01((elapsed - a.depth * INTRO_STAGGER) / INTRO_ARC));
          if (p <= 0) continue;
          end = a.startR + (a.endR - a.startR) * p;
        }
        const sin = Math.sin(a.angle);
        const cos = Math.cos(a.angle);
        ctx.moveTo(a.startR * sin, -a.startR * cos);
        ctx.lineTo(end * sin, -end * cos);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
  }

  // ---------- Overlay positioning (per frame) ----------
  function setShown(item: { el: SVGElement; shown: boolean }, show: boolean) {
    if (show === item.shown) return;
    item.el.style.display = show ? "" : "none";
    item.shown = show;
  }

  function positionOverlay(now: number) {
    const k = t.k;
    const s = k * basePx;
    const elapsed = now - introStart;
    const intro = elapsed < introDuration;
    const margin = 160;
    const cx = t.x + k * baseX(0);
    const cy = t.y + k * baseY(0);
    const offscreen = (x: number, y: number, m: number) =>
      x < -m || x > W + m || y < -m || y > H + m;

    // Node labels: level of detail + viewport culling.
    for (const l of labels) {
      const forced = l.id === hoverId || lineage.has(l.id);
      let show = forced || k >= l.minK;
      if (show && intro && elapsed < l.depth * INTRO_STAGGER + 220) show = false;
      const x = cx + s * l.r0 * Math.sin(l.angle);
      const y = cy - s * l.r0 * Math.cos(l.angle);
      if (show && offscreen(x, y, margin)) show = false;
      setShown(l, show);
      if (show) l.el.setAttribute("transform", `translate(${x.toFixed(1)},${y.toFixed(1)})${l.rotate}`);
    }

    // Era labels: "Today" first, then outward-in; drop overlaps at this zoom.
    const kept: number[] = [];
    for (const e of eraLabels) {
      const len = e.px / s;
      let show = kept.every((r) => Math.abs(r - e.r) >= len);
      if (show) kept.push(e.r);
      const y = cy - s * e.r;
      if (show && offscreen(cx, y, margin)) show = false;
      setShown(e, show);
      if (show) e.el.setAttribute("transform", `translate(${cx.toFixed(1)},${y.toFixed(1)}) rotate(-90)`);
    }

    // Family names along the band, only where the arc is long enough.
    for (const b of bandLabels) {
      const [a0, a1] = b.span;
      const mid = (a0 + a1) / 2;
      let show = (a1 - a0) * bandR * s >= b.textPx;
      if (show) {
        const reach = ((a1 - a0) / 2) * bandR * s + margin;
        const mx = cx + s * bandR * Math.sin(mid);
        const my = cy - s * bandR * Math.cos(mid);
        if (offscreen(mx, my, reach)) show = false;
      }
      setShown(b, show);
      if (!show) continue;
      const bottom = mid > Math.PI / 2 && mid < (3 * Math.PI) / 2;
      // Bottom half runs counter-clockwise so the text stays upright.
      const r = bandR * s + (bottom ? 17 : 8);
      b.pathEl.setAttribute("d", arcPath(cx, cy, r, bottom ? a1 : a0, bottom ? a0 : a1, !bottom));
    }
  }

  let frameQueued = false;
  function frame(now: number) {
    frameQueued = false;
    draw(now);
    positionOverlay(now);
    if (now - introStart < introDuration) scheduleFrame();
  }
  function scheduleFrame() {
    if (frameQueued) return;
    frameQueued = true;
    requestAnimationFrame(frame);
  }

  // ---------- Label level-of-detail thresholds ----------
  /**
   * For each label, find the smallest zoom at which it no longer collides
   * with any higher-priority label already visible at that zoom. Two labels
   * collide when they are angularly closer than a line height AND their
   * radial extents overlap; both shrink in tree space as you zoom in.
   */
  function computeLabelThresholds() {
    // Only labels within this angle can still collide at the minimum zoom,
    // so each label checks a small angular window of already-placed labels
    // (kept sorted by angle) instead of all of them.
    const minR0 = Math.max(Math.min(...labels.map((l) => l.r0)), 1);
    const window =
      (LEAF_FONT * LINE_GAP) / (minR0 * basePx * SCALE_EXTENT[0]);
    const placed: Label[] = [];
    const lowerBound = (angle: number) => {
      let lo = 0;
      let hi = placed.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (placed[mid].angle < angle) lo = mid + 1;
        else hi = mid;
      }
      return lo;
    };
    for (const a of labelsByPriority) {
      let minK = INTERNAL_MIN_K;
      if (a.leaf) {
        // Keep leaf labels from running into the family band.
        const room = bandR - 10 - a.r0;
        minK = room > 0 ? a.lengthPx / (basePx * room) : Infinity;
      }
      const check = (b: Label) => {
        let dA = Math.abs(a.angle - b.angle);
        if (dA > Math.PI) dA = 2 * Math.PI - dA;
        const rMin = Math.max(Math.min(a.r0, b.r0), 1);
        const sep = Math.max(a.fontPx, b.fontPx) * LINE_GAP;
        const kAngular = dA === 0 ? Infinity : sep / (rMin * dA * basePx);
        if (kAngular <= minK) return; // already apart at our threshold
        const dr = Math.abs(a.r0 - b.r0);
        const inner = a.r0 <= b.r0 ? a : b;
        const kRadial = dr === 0 ? Infinity : inner.lengthPx / (basePx * dr);
        const kCollide = Math.min(kAngular, kRadial);
        if (b.minK < kCollide && kCollide > minK) minK = kCollide;
      };
      // Scan [angle - window, angle + window], wrapping around 0 / 2π.
      for (const offset of [0, -2 * Math.PI, 2 * Math.PI]) {
        const from = a.angle + offset - window;
        const to = a.angle + offset + window;
        for (let i = lowerBound(from); i < placed.length && placed[i].angle <= to; i++) {
          check(placed[i]);
        }
      }
      a.minK = minK;
      placed.splice(lowerBound(a.angle), 0, a);
    }
  }

  // ---------- Frame: size, scale, band radius ----------
  const leafLengths = labels
    .filter((l) => l.leaf)
    .map((l) => l.lengthPx)
    .sort((a, b) => a - b);
  const typicalLabelPx = leafLengths.length
    ? leafLengths[Math.floor(leafLengths.length * 0.85)]
    : 80;

  function layoutFrame() {
    const rect = svgEl.getBoundingClientRect();
    W = Math.max(rect.width, 1);
    H = Math.max(rect.height, 1);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const minDim = Math.max(Math.min(W, H), 200);
    // Fit OUTER_R plus leaf labels plus band text inside the viewport:
    //   minDim / 2 = basePx * (OUTER_R + 20) + labelPx + bandPx
    const outsidePx = typicalLabelPx + 34;
    const available = Math.max(minDim / 2 - outsidePx, minDim * 0.3);
    basePx = available / (OUTER_R + 20);
    bandR = Math.min(OUTER_R + 10 + typicalLabelPx / basePx, (minDim / 2 - 26) / basePx);
    computeLabelThresholds();
    scheduleFrame();
  }

  // ---------- Label state classes (on state change only) ----------
  function syncLabelClasses() {
    svgEl.classList.toggle("has-selection", selectedId !== null);
    svgEl.classList.toggle("family-focus", focusFamilyId !== null);
    for (const l of labels) {
      const cl = l.el.classList;
      cl.toggle("lineage", lineage.has(l.id));
      cl.toggle("selected", l.id === selectedId);
      cl.toggle("same-family", selFamily !== null && l.famId === selFamily);
      cl.toggle("family-hit", focusFamilyId !== null && l.famId === focusFamilyId);
      cl.toggle("hover", l.id === hoverId);
    }
    for (const b of bandLabels) {
      b.el.classList.toggle("family-hit", b.fam.id === focusFamilyId);
    }
  }

  function stateChanged() {
    rebuildStyles();
    syncLabelClasses();
    scheduleFrame();
  }

  // ---------- Hit testing ----------
  function hitTest(event: PointerEvent | MouseEvent): { arc?: Arc; family?: FamilyInfo } {
    const rect = svgEl.getBoundingClientRect();
    const bx = (event.clientX - rect.left - t.x) / t.k;
    const by = (event.clientY - rect.top - t.y) / t.k;
    const ux = (bx - W / 2) / basePx;
    const uy = (by - H / 2) / basePx;
    const r = Math.hypot(ux, uy);
    let theta = Math.atan2(ux, -uy);
    if (theta < 0) theta += 2 * Math.PI;
    const s = t.k * basePx;
    const tolPx = (event as PointerEvent).pointerType === "touch" ? 16 : 8;

    // Outer band
    const rPx = r * s;
    if (rPx >= bandR * s - 6 && rPx <= bandR * s + 26) {
      const b = bandLabels.find((bl) => theta >= bl.span[0] && theta <= bl.span[1]);
      if (b) return { family: b.fam };
    }

    // Arcs: binary-search the angular window, then take the closest in pixels.
    const dTheta = tolPx / (Math.max(r, 1) * s);
    let lo = 0;
    let hi = arcsByAngle.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arcsByAngle[mid].angle < theta - dTheta) lo = mid + 1;
      else hi = mid;
    }
    const tolU = tolPx / s;
    let best: Arc | undefined;
    let bestD = Infinity;
    for (let i = lo; i < arcsByAngle.length; i++) {
      const a = arcsByAngle[i];
      if (a.angle > theta + dTheta) break;
      if (r < a.startR - tolU || r > a.endR + tolU) continue;
      const along = r < a.startR ? a.startR - r : r > a.endR ? r - a.endR : 0;
      const d = Math.hypot(Math.abs(a.angle - theta) * r * s, along * s);
      if (d < bestD) {
        bestD = d;
        best = a;
      }
    }
    return { arc: best };
  }

  svgEl.addEventListener("pointermove", (event) => {
    if (event.buttons) return; // panning
    const { arc, family } = hitTest(event);
    const nextHover = arc?.id ?? null;
    const nextFamily = family?.id ?? null;
    if (nextHover !== hoverId) {
      hoverId = nextHover;
      const el = hoverId ? labelById.get(hoverId)?.el : undefined;
      if (el) labelsG.node()!.appendChild(el); // hovered label on top
      options.onNodeHover?.(arc ? nodeById.get(arc.id)!.data.data : null, arc ? event : null);
      stateChanged();
    }
    if (nextFamily !== hoverFamily) {
      hoverFamily = nextFamily;
      highlightFamily(hoverFamily);
      options.onFamilyHover?.(family ?? null, family ? event : null);
    }
    svgEl.style.cursor = arc || family ? "pointer" : "";
  });
  svgEl.addEventListener("pointerleave", () => {
    if (hoverId) {
      hoverId = null;
      options.onNodeHover?.(null, null);
      stateChanged();
    }
    if (hoverFamily) {
      hoverFamily = null;
      highlightFamily(null);
      options.onFamilyHover?.(null, null);
    }
  });
  svgEl.addEventListener("click", (event) => {
    const { arc, family } = hitTest(event);
    if (family) options.onFamilyClick?.(family);
    else options.onNodeClick?.(arc ? nodeById.get(arc.id)!.data.data : null);
  });

  // ---------- Zoom ----------
  const zoomBehavior = d3
    .zoom<SVGSVGElement, unknown>()
    .scaleExtent(SCALE_EXTENT)
    .clickDistance(4)
    .on("zoom", (event) => {
      t = event.transform;
      scheduleFrame();
    });
  svg.call(zoomBehavior).on("dblclick.zoom", null);

  rebuildStyles();
  layoutFrame();
  new ResizeObserver(() => layoutFrame()).observe(svgEl);

  function transitionTo(target: d3.ZoomTransform, duration = 700) {
    svg
      .transition()
      .duration(reducedMotion ? 0 : duration)
      .ease(d3.easeCubicInOut)
      .call(zoomBehavior.transform, target);
  }

  /** Zoom so the given tree-space points fill the viewport, leaving label room. */
  function fitPoints(xs: number[], ys: number[], maxScale: number) {
    if (xs.length === 0) return;
    const bx = xs.map(baseX);
    const by = ys.map(baseY);
    const xmin = Math.min(...bx);
    const xmax = Math.max(...bx);
    const ymin = Math.min(...by);
    const ymax = Math.max(...by);
    const pad = 150;
    const scale = Math.max(
      SCALE_EXTENT[0],
      Math.min(
        (W - pad) / Math.max(xmax - xmin, 24),
        (H - pad) / Math.max(ymax - ymin, 24),
        maxScale,
      ),
    );
    transitionTo(
      d3.zoomIdentity
        .translate(W / 2, H / 2)
        .scale(scale)
        .translate(-(xmin + xmax) / 2, -(ymin + ymax) / 2),
    );
  }

  function pointsOf(ids: Iterable<string>, leafPad = 0) {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const id of ids) {
      const a = arcById.get(id);
      if (!a) continue;
      for (const r of [a.startR, a.leaf ? a.endR + leafPad : a.endR]) {
        xs.push(r * Math.sin(a.angle));
        ys.push(-r * Math.cos(a.angle));
      }
    }
    return { xs, ys };
  }

  function focusFamily(familyId: string) {
    const fam = data.families.find((f) => f.id === familyId);
    if (!fam) return;
    const { xs, ys } = pointsOf([fam.id, ...fam.descendants], 60);
    fitPoints(xs, ys, 6);
  }

  function highlightFamily(familyId: string | null) {
    focusFamilyId = familyId;
    stateChanged();
  }

  return {
    focusNode(id: string) {
      const { xs, ys } = pointsOf(ancestorsOf(id));
      fitPoints(xs, ys, 3);
    },
    focusFamily,
    resetZoom() {
      transitionTo(d3.zoomIdentity, 550);
    },
    zoomBy(factor: number) {
      svg
        .transition()
        .duration(reducedMotion ? 0 : 250)
        .call(zoomBehavior.scaleBy, factor);
    },
    select(id: string | null) {
      selectedId = id;
      // Selecting ends the intro so the focus state shows immediately.
      introStart = -Infinity;
      stateChanged();
    },
    setLineage(id: string | null) {
      const chain = id ? ancestorsOf(id) : [];
      lineage = new Set(chain);
      selFamily = id ? (data.familyOf.get(id) ?? null) : null;
      // Lineage labels go on top, root first so the selection ends up last.
      for (const lid of [...chain].reverse()) {
        const el = labelById.get(lid)?.el;
        if (el) labelsG.node()!.appendChild(el);
      }
      stateChanged();
    },
    highlightFamily,
    search(query: string) {
      const q = query.trim().toLowerCase();
      if (!q) return [];
      const hits = visibleNodes
        .map((n) => n.data.data)
        .filter((n) => n.name.toLowerCase().includes(q));
      // Prefix matches first, then by prominence.
      return hits.sort((a, b) => {
        const pa = a.name.toLowerCase().startsWith(q) ? 0 : 1;
        const pb = b.name.toLowerCase().startsWith(q) ? 0 : 1;
        return (
          pa - pb ||
          (labelById.get(b.id)?.priority ?? 0) - (labelById.get(a.id)?.priority ?? 0)
        );
      });
    },
    familyColor(familyId: string) {
      return familyColors.get(familyId) ?? "";
    },
    lineageOf(id: string) {
      return ancestorsOf(id);
    },
  };
}

function assignFamilyColors(families: FamilyInfo[]): Map<string, string> {
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
    out.set(f.id, d3.hcl(h, big ? 42 : 26, big ? 72 : 66).formatHex());
  }
  return out;
}

function labelPriority(d: Positioned): number {
  const n = d.data.data;
  const leaf = isLeafNode(d);
  if (n.status === "living") return (n.speakers ?? 50_000) + (leaf ? 0 : 1e6);
  if (n.status === "classical") return 40_000_000;
  if (n.status === "extinct") return leaf ? 300_000 : 2_000_000;
  // Reconstructed proto-languages: shallower (bigger groupings) first.
  return 1_000_000 / (1 + d.depth);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** SVG arc around (cx, cy) from angle a0 to a1 (clockwise when `cw`). */
function arcPath(cx: number, cy: number, r: number, a0: number, a1: number, cw: boolean): string {
  const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
  const x0 = cx + r * Math.sin(a0);
  const y0 = cy - r * Math.cos(a0);
  const x1 = cx + r * Math.sin(a1);
  const y1 = cy - r * Math.cos(a1);
  return `M${x0.toFixed(1)},${y0.toFixed(1)}A${r.toFixed(1)},${r.toFixed(1)} 0 ${large} ${cw ? 1 : 0} ${x1.toFixed(1)},${y1.toFixed(1)}`;
}

function isLeafNode(d: Positioned): boolean {
  return !d.children || d.children.length === 0;
}

function formatEra(y: number): string {
  if (y < 0) return `${(-y).toLocaleString("en-US")} BCE`;
  if (y === 1) return "1 CE";
  return String(y);
}

/**
 * Piecewise-linear time scale. Anchors at every era boundary (-3000, 0, 1500)
 * that falls inside the data extent, with equal radial space per segment.
 * Modern era stays readable even when deep proto-languages pull the inner
 * extent to -10000 BCE or further.
 */
function makeTimeScale(
  extent: [number, number],
  inner: number,
  outer: number,
): (y: number) => number {
  const [minY, maxY] = extent;
  const interior = [-3000, 0, 1500].filter((y) => y > minY && y < maxY);
  const anchors = [minY, ...interior, maxY];
  const radii = anchors.map(
    (_, i) => inner + (i * (outer - inner)) / (anchors.length - 1),
  );
  return d3.scaleLinear<number, number>().domain(anchors).range(radii);
}
