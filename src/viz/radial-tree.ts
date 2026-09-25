import * as d3 from "d3";
import {
  type FamilyInfo,
  isVirtualRootId,
  type LoadedData,
  type TreeNode,
} from "../data/loader";
import { type LanguageNode, periodEnd } from "../data/schema";

export interface RadialTreeOptions {
  onNodeClick?: (node: LanguageNode | null) => void;
  onNodeHover?: (node: LanguageNode | null, event: MouseEvent | null) => void;
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
  search: (query: string) => LanguageNode[];
  familyColor: (familyId: string) => string;
  lineageOf: (id: string) => string[];
}

// Geometry in SVG user units. The viewBox itself is sized at runtime (see
// `layoutFrame`) so the outer labels and family band always fit on screen.
const OUTER_R = 440;
const INNER_R = 56;
// Empty wedge at 12 o'clock that holds the era-ring labels.
const GAP = (18 * Math.PI) / 180;
// Leaf slots of empty space between adjacent families.
const FAMILY_PAD = 1.8;

// Label metrics in *screen* pixels. Labels are counter-scaled against zoom so
// they stay this size no matter how far in you go.
const LEAF_FONT = 12.5;
const INTERNAL_FONT = 11;
const FAMILY_FONT = 11;
const CHAR_W = 0.55; // average glyph advance as a fraction of font size
const LINE_GAP = 1.2; // labels need this many font-heights between them

const SCALE_EXTENT: [number, number] = [0.7, 24];
// Internal (historical-stage) labels only appear once you start zooming in,
// so the first view reads as leaves + families.
const INTERNAL_MIN_K = 1.9;

const ERA_YEARS = [-8000, -5000, -3000, -1000, 1, 1000, 1500];

type Positioned = d3.HierarchyNode<TreeNode> & {
  angle: number;
  startR: number;
  endR: number;
};

interface LabelInfo {
  id: string;
  angle: number;
  r0: number;
  lengthPx: number;
  fontPx: number;
  priority: number;
  leaf: boolean;
  /** Minimum zoom at which this label is shown. */
  minK: number;
}

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
const ROOT_STROKE = "rgba(225, 232, 245, 0.75)";

const reducedMotion =
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function renderRadialTree(
  svgEl: SVGSVGElement,
  data: LoadedData,
  options: RadialTreeOptions = {},
): RadialTreeHandle {
  const svg = d3.select(svgEl);
  svg.selectAll("*").remove();

  const familyColors = assignFamilyColors(data.families);
  const colorOf = (id: string) => {
    const f = data.familyOf.get(id);
    return f ? (familyColors.get(f) ?? ROOT_STROKE) : ROOT_STROKE;
  };

  const timeScale = makeTimeScale(data.yearExtent, INNER_R, OUTER_R);
  const hier = d3.hierarchy<TreeNode>(data.root, (d) => d.children);

  // ---------- Angular layout ----------
  // Leaves are spread evenly, with a little padding between families and an
  // empty wedge at the top for the era labels. Internal nodes sit at the mean
  // angle of their children.
  const leaves = hier.leaves() as Positioned[];
  const famOfLeaf = leaves.map((l) => data.familyOf.get(l.data.data.id));
  const slots: number[] = [];
  let s = 0;
  leaves.forEach((_, i) => {
    if (i > 0 && famOfLeaf[i] !== famOfLeaf[i - 1]) s += FAMILY_PAD;
    slots.push(s);
    s += 1;
  });
  const totalSlots = s;
  const slotAngle = (2 * Math.PI - GAP) / totalSlots;
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
    if (data.hasVirtualRoot && isVirtualRootId(n.data.data.id)) {
      p.startR = 0;
      p.endR = 0;
      return;
    }
    const rawStart = timeScale(n.data.data.period.start);
    const rawEnd = timeScale(periodEnd(n.data.data));
    const parent = n.parent;
    const hasInternalParent =
      !!parent && !(data.hasVirtualRoot && isVirtualRootId(parent.data.data.id));
    const hasChildren = !!(n.children && n.children.length > 0);
    const sides = (hasInternalParent ? 1 : 0) + (hasChildren ? 1 : 0);
    const maxInsetTotal = Math.max(0, rawEnd - rawStart - 1);
    const inset = sides === 0 ? 0 : Math.min(TARGET_INSET, maxInsetTotal / sides);
    p.startR = rawStart + (hasInternalParent ? inset : 0);
    p.endR = rawEnd - (hasChildren ? inset : 0);
  });

  const visibleNodes = hier
    .descendants()
    .filter(
      (d) => !(data.hasVirtualRoot && isVirtualRootId(d.data.data.id)),
    ) as Positioned[];
  const nodeById = new Map<string, Positioned>();
  for (const n of visibleNodes) nodeById.set(n.data.data.id, n);

  function ancestorsOf(id: string): string[] {
    const out: string[] = [];
    let cur: d3.HierarchyNode<TreeNode> | null = nodeById.get(id) ?? null;
    while (cur) {
      if (data.hasVirtualRoot && isVirtualRootId(cur.data.data.id)) break;
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
    const span = familySpan.get(f);
    const a0 = leaf.angle - slotAngle / 2;
    const a1 = leaf.angle + slotAngle / 2;
    if (!span) familySpan.set(f, [a0, a1]);
    else familySpan.set(f, [Math.min(span[0], a0), Math.max(span[1], a1)]);
  });

  // ---------- Scene ----------
  const zoomRoot = svg.append("g").attr("class", "viz-root");

  zoomRoot
    .append("circle")
    .attr("class", "viz-bg")
    .attr("r", OUTER_R * 6)
    .attr("fill", "transparent")
    .on("click", () => options.onNodeClick?.(null));

  // Era rings: faint circles at fixed years, labelled in the top wedge.
  const [minYear] = data.yearExtent;
  const eras = ERA_YEARS.filter((y) => y > minYear);
  const erasG = zoomRoot.append("g").attr("class", "eras");
  erasG
    .selectAll("circle")
    .data(eras)
    .join("circle")
    .attr("class", "era-ring")
    .attr("r", (y) => timeScale(y));
  erasG
    .append("circle")
    .attr("class", "era-ring era-today")
    .attr("r", OUTER_R);
  const eraLabelSel = erasG
    .selectAll<SVGTextElement, number | "today">("text")
    .data<number | "today">([...eras, "today"])
    .join("text")
    .attr("class", "era-label")
    .attr("transform", (y) => {
      const r = y === "today" ? OUTER_R : timeScale(y);
      return `translate(0, ${-r}) rotate(-90)`;
    })
    .attr("dx", "0.5em")
    .attr("dy", "0.35em")
    .text((y) => (y === "today" ? "Today" : formatEra(y)));

  // Edges
  type Endpoint = { angle: number; r: number };
  const edgeLink = d3
    .linkRadial<PositionedEdge, Endpoint>()
    .angle((d) => d.angle)
    .radius((d) => d.r);

  const primaryLinks: PositionedEdge[] = [];
  hier.links().forEach((link) => {
    const parent = link.source as Positioned;
    const child = link.target as Positioned;
    const childId = child.data.data.id;
    const fromRoot = data.hasVirtualRoot && isVirtualRootId(parent.data.data.id);
    primaryLinks.push({
      source: fromRoot
        ? { angle: child.angle, r: INNER_R * 0.35 }
        : { angle: parent.angle, r: parent.endR },
      target: { angle: child.angle, r: child.startR },
      familyId: data.familyOf.get(childId) ?? null,
      childId,
      fromRoot,
    });
  });

  const edgesG = zoomRoot.append("g").attr("class", "edges");
  edgesG
    .selectAll<SVGPathElement, PositionedEdge>("path.edge")
    .data(primaryLinks)
    .join("path")
    .attr("class", (d) => (d.fromRoot ? "edge root-edge" : "edge"))
    .attr("data-family", (d) => d.familyId ?? "")
    .attr("data-target", (d) => d.childId)
    .attr("stroke", (d) => (d.fromRoot ? null : colorOf(d.childId)))
    .attr("d", (d) => edgeLink(d) ?? "")
    .style("opacity", 0)
    .transition()
    .delay((d) => (reducedMotion ? 0 : (nodeById.get(d.childId)?.depth ?? 0) * 60))
    .duration(reducedMotion ? 0 : 320)
    .style("opacity", null);

  // Secondary (DAG) edges: mixed languages with more than one parent.
  const secondaryLinks: PositionedEdge[] = [];
  visibleNodes.forEach((p) => {
    for (const secId of p.data.secondaryParentIds) {
      const sec = nodeById.get(secId);
      if (!sec) continue;
      secondaryLinks.push({
        source: { angle: sec.angle, r: sec.endR },
        target: { angle: p.angle, r: p.startR },
        familyId: data.familyOf.get(p.data.data.id) ?? null,
        childId: p.data.data.id,
        fromRoot: false,
      });
    }
  });
  if (secondaryLinks.length) {
    zoomRoot
      .append("g")
      .attr("class", "edges-secondary")
      .selectAll<SVGPathElement, PositionedEdge>("path")
      .data(secondaryLinks)
      .join("path")
      .attr("class", "edge secondary")
      .attr("data-family", (d) => d.familyId ?? "")
      .attr("data-target", (d) => d.childId)
      .attr("stroke", (d) => colorOf(d.childId))
      .attr("d", (d) => edgeLink(d) ?? "");
  }

  // Family band: a thin coloured ring outside the leaf labels, with the
  // family name set along it.
  const bandG = zoomRoot.append("g").attr("class", "family-band");
  const bandFamilies = data.families.filter((f) => familySpan.has(f.id));
  const bandSel = bandG
    .selectAll<SVGGElement, FamilyInfo>("g.band")
    .data(bandFamilies)
    .join("g")
    .attr("class", "band")
    .attr("data-family", (f) => f.id)
    .style("color", (f) => familyColors.get(f.id) ?? ROOT_STROKE)
    .on("mouseenter", (event, f) => {
      highlightFamily(f.id);
      options.onFamilyHover?.(f, event as MouseEvent);
    })
    .on("mouseleave", () => {
      highlightFamily(null);
      options.onFamilyHover?.(null, null);
    })
    .on("click", (event, f) => {
      event.stopPropagation();
      options.onFamilyClick?.(f);
    });
  bandSel.append("path").attr("class", "band-hit");
  bandSel.append("path").attr("class", "band-arc");
  bandSel
    .append("path")
    .attr("class", "band-text-path")
    .attr("id", (f) => `band-path-${f.id}`);
  bandSel
    .append("text")
    .attr("class", "band-label")
    .append("textPath")
    .attr("href", (f) => `#band-path-${f.id}`)
    .attr("startOffset", "50%")
    .attr("text-anchor", "middle")
    .text((f) => f.label);

  // Nodes
  const nodesG = zoomRoot.append("g").attr("class", "nodes");
  const nodeSel = nodesG
    .selectAll<SVGGElement, Positioned>("g.node")
    .data(visibleNodes)
    .join("g")
    .attr("class", (d) =>
      d.data.data.status === "reconstructed" ? "node reconstructed" : "node",
    )
    .attr("data-id", (d) => d.data.data.id)
    .attr("data-family", (d) => data.familyOf.get(d.data.data.id) ?? "")
    .style("color", (d) => colorOf(d.data.data.id));

  // Wide invisible hitbox so thin arcs are easy to hover and click.
  nodeSel
    .append("line")
    .attr("class", "node-hitbox")
    .attr("x1", (d) => polarX(d.angle, d.startR))
    .attr("y1", (d) => polarY(d.angle, d.startR))
    .attr("x2", (d) => polarX(d.angle, d.endR))
    .attr("y2", (d) => polarY(d.angle, d.endR))
    .on("mouseenter", function (event, d) {
      // Lift this node so its arc + label render above later siblings.
      const group = (this as SVGElement).parentNode;
      if (group) d3.select(group as Element).raise();
      options.onNodeHover?.(d.data.data, event as MouseEvent);
    })
    .on("mouseleave", () => options.onNodeHover?.(null, null))
    .on("click", (event, d) => {
      event.stopPropagation();
      options.onNodeClick?.(d.data.data);
    });

  // Visible arcs grow outward, staggered by depth — the one intro moment.
  nodeSel
    .append("line")
    .attr("class", "node-arc")
    .attr("stroke", "currentColor")
    .attr("x1", (d) => polarX(d.angle, d.startR))
    .attr("y1", (d) => polarY(d.angle, d.startR))
    .attr("x2", (d) => polarX(d.angle, reducedMotion ? d.endR : d.startR))
    .attr("y2", (d) => polarY(d.angle, reducedMotion ? d.endR : d.startR))
    .transition()
    .delay((d) => (reducedMotion ? 0 : d.depth * 60))
    .duration(reducedMotion ? 0 : 420)
    .ease(d3.easeCubicOut)
    .attr("x2", (d) => polarX(d.angle, d.endR))
    .attr("y2", (d) => polarY(d.angle, d.endR));

  // Labels: leaves sit just past the end of their arc; internal stages run
  // alongside their arc like station names on a metro line.
  const labelSel = nodeSel
    .append("text")
    .attr("class", (d) =>
      isLeafNode(d) ? "node-label leaf" : "node-label internal",
    )
    .attr("transform", (d) => labelTransform(d))
    .attr("text-anchor", (d) => (d.angle > Math.PI ? "end" : "start"))
    .attr("dy", (d) => (isLeafNode(d) ? "0.32em" : "-0.55em"))
    .text((d) => d.data.data.name);
  labelSel
    .style("opacity", 0)
    .transition()
    .delay((d) => (reducedMotion ? 0 : d.depth * 60 + 220))
    .duration(reducedMotion ? 0 : 240)
    .style("opacity", null);

  // ---------- Label level-of-detail ----------
  const labels: LabelInfo[] = visibleNodes.map((d) => {
    const leaf = isLeafNode(d);
    const fontPx = leaf ? LEAF_FONT : INTERNAL_FONT;
    return {
      id: d.data.data.id,
      angle: d.angle,
      r0: leaf ? d.endR + 6 : d.startR + 2,
      lengthPx: d.data.data.name.length * CHAR_W * fontPx,
      fontPx,
      priority: labelPriority(d),
      leaf,
      minK: 0,
    };
  });
  labels.sort((a, b) => b.priority - a.priority);
  const labelById = new Map(labels.map((l) => [l.id, l]));

  // Pixels per user unit at zoom 1; set by layoutFrame().
  let basePx = 1;
  let bandR = OUTER_R + 150;
  let currentK = 1;

  /**
   * For each label, find the smallest zoom at which it no longer collides
   * with any higher-priority label that is already visible at that zoom.
   * Two labels collide when they are angularly closer than a line height AND
   * their radial extents overlap — both shrink in user space as we zoom in.
   */
  function computeLabelThresholds() {
    const placed: LabelInfo[] = [];
    for (const a of labels) {
      let minK = a.leaf ? 0 : INTERNAL_MIN_K;
      // Keep leaf labels from running into the family band.
      if (a.leaf) {
        const room = bandR - 10 - a.r0;
        minK = room > 0 ? a.lengthPx / (basePx * room) : Infinity;
      }
      for (const b of placed) {
        let dA = Math.abs(a.angle - b.angle);
        if (dA > Math.PI) dA = 2 * Math.PI - dA;
        const rMin = Math.max(Math.min(a.r0, b.r0), 1);
        const sep = Math.max(a.fontPx, b.fontPx) * LINE_GAP;
        const kAngular = dA === 0 ? Infinity : sep / (rMin * dA * basePx);
        const dr = Math.abs(a.r0 - b.r0);
        const inner = a.r0 <= b.r0 ? a : b;
        const kRadial = dr === 0 ? Infinity : inner.lengthPx / (basePx * dr);
        const kCollide = Math.min(kAngular, kRadial);
        if (b.minK < kCollide && kCollide > minK) minK = kCollide;
      }
      a.minK = minK;
      placed.push(a);
    }
  }

  const labelNodes = new Map<string, SVGTextElement>();
  labelSel.each(function (d) {
    labelNodes.set(d.data.data.id, this);
  });
  const bandLabelNodes = new Map<string, SVGTextElement>();
  bandSel.select<SVGTextElement>("text").each(function (f) {
    bandLabelNodes.set(f.id, this);
  });

  // Era labels: "Today" first, then outward-in; drop any that would overlap
  // a label already kept at this zoom.
  const eraLabelNodes: { r: number; px: number; el: SVGTextElement }[] = [];
  eraLabelSel.each(function (y) {
    const text = y === "today" ? "Today" : formatEra(y);
    eraLabelNodes.push({
      r: y === "today" ? OUTER_R : timeScale(y),
      px: text.length * CHAR_W * 10.5 + 14,
      el: this,
    });
  });
  eraLabelNodes.sort((a, b) => b.r - a.r);

  function applyLod(k: number) {
    const kept: number[] = [];
    for (const e of eraLabelNodes) {
      const len = e.px / (basePx * k);
      const ok = kept.every((r) => Math.abs(r - e.r) >= len);
      if (ok) kept.push(e.r);
      e.el.classList.toggle("lod-hidden", !ok);
    }
    for (const l of labels) {
      labelNodes.get(l.id)?.classList.toggle("lod-hidden", k < l.minK);
    }
    for (const f of bandFamilies) {
      const span = familySpan.get(f.id)!;
      const arcPx = (span[1] - span[0]) * bandR * basePx * k;
      const textPx = f.label.length * 0.68 * FAMILY_FONT + 12;
      bandLabelNodes.get(f.id)?.classList.toggle("lod-hidden", arcPx < textPx);
    }
  }

  function setZoomVars(k: number) {
    // --zs: stroke widths grow gently (√k) instead of linearly with zoom.
    // --zf: converts screen pixels to user units at the current zoom.
    svgEl.style.setProperty("--zs", String(Math.pow(k, 0.7) / k));
    svgEl.style.setProperty("--zf", String(1 / (basePx * k)));
    applyLod(k);
  }

  // ---------- Frame: viewBox, band radius ----------
  let VB = 1400;
  const leafLengths = labels
    .filter((l) => l.leaf)
    .map((l) => l.lengthPx)
    .sort((a, b) => a - b);
  const typicalLabelPx = leafLengths.length
    ? leafLengths[Math.floor(leafLengths.length * 0.85)]
    : 80;

  function layoutFrame() {
    const rect = svgEl.getBoundingClientRect();
    const minDim = Math.max(Math.min(rect.width, rect.height), 200);
    // Solve for a viewBox where OUTER_R + label + band text fits exactly:
    //   VB/2 = OUTER_R + margin + (labelPx + bandPx) * VB / minDim
    const outsidePx = typicalLabelPx + 34;
    const denom = Math.max(1 - (2 * outsidePx) / minDim, 0.6);
    VB = (2 * OUTER_R + 40) / denom;
    basePx = minDim / VB;
    bandR = Math.min(OUTER_R + 10 + typicalLabelPx / basePx, VB / 2 - 26 / basePx);
    svg.attr("viewBox", `${-VB / 2} ${-VB / 2} ${VB} ${VB}`);

    const arc = d3.arc<[number, number]>();
    bandSel.select(".band-arc").attr("d", (f) => {
      const [a0, a1] = familySpan.get(f.id)!;
      return arc({
        innerRadius: bandR,
        outerRadius: bandR + 3,
        startAngle: a0 + slotAngle * 0.3,
        endAngle: a1 - slotAngle * 0.3,
      } as unknown as [number, number]);
    });
    bandSel.select(".band-hit").attr("d", (f) => {
      const [a0, a1] = familySpan.get(f.id)!;
      return arc({
        innerRadius: bandR - 6,
        outerRadius: bandR + 26 / basePx,
        startAngle: a0,
        endAngle: a1,
      } as unknown as [number, number]);
    });
    bandSel.select(".band-text-path").attr("d", (f) => {
      const [a0, a1] = familySpan.get(f.id)!;
      const mid = (a0 + a1) / 2;
      const bottom = mid > Math.PI / 2 && mid < (3 * Math.PI) / 2;
      // Bottom half runs counter-clockwise so the text stays upright.
      const r = bandR + (bottom ? 17 : 8) / basePx;
      return arcPath(r, bottom ? a1 : a0, bottom ? a0 : a1, !bottom);
    });

    computeLabelThresholds();
    setZoomVars(currentK);
  }

  // ---------- Zoom ----------
  const zoomBehavior = d3
    .zoom<SVGSVGElement, unknown>()
    .scaleExtent(SCALE_EXTENT)
    .on("zoom", (event) => {
      zoomRoot.attr("transform", event.transform.toString());
      currentK = event.transform.k;
      setZoomVars(currentK);
    });
  svg.call(zoomBehavior).on("dblclick.zoom", null);

  layoutFrame();
  new ResizeObserver(() => layoutFrame()).observe(svgEl);

  function transitionTo(t: d3.ZoomTransform, duration = 700) {
    svg
      .transition()
      .duration(reducedMotion ? 0 : duration)
      .ease(d3.easeCubicInOut)
      .call(zoomBehavior.transform, t);
  }

  function fitPoints(xs: number[], ys: number[], maxScale: number) {
    if (xs.length === 0) return;
    const xmin = Math.min(...xs);
    const xmax = Math.max(...xs);
    const ymin = Math.min(...ys);
    const ymax = Math.max(...ys);
    const width = Math.max(xmax - xmin, 40);
    const height = Math.max(ymax - ymin, 40);
    const cx = (xmin + xmax) / 2;
    const cy = (ymin + ymax) / 2;
    // Leave room for labels (in screen px) around the fitted box.
    const padUnits = 150 / basePx;
    const scale = Math.max(
      SCALE_EXTENT[0],
      Math.min(
        (VB - padUnits) / width,
        (VB - padUnits) / height,
        maxScale,
      ),
    );
    transitionTo(d3.zoomIdentity.scale(scale).translate(-cx, -cy));
  }

  function fitToLineage(ids: string[]) {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const id of ids) {
      const n = nodeById.get(id);
      if (!n) continue;
      for (const r of [n.startR, n.endR]) {
        xs.push(polarX(n.angle, r));
        ys.push(polarY(n.angle, r));
      }
    }
    fitPoints(xs, ys, 3);
  }

  function focusFamily(familyId: string) {
    const fam = data.families.find((f) => f.id === familyId);
    if (!fam) return;
    const xs: number[] = [];
    const ys: number[] = [];
    for (const id of [fam.id, ...fam.descendants]) {
      const n = nodeById.get(id);
      if (!n) continue;
      const outer = isLeafNode(n) ? n.endR + 60 : n.endR;
      for (const r of [n.startR, outer]) {
        xs.push(polarX(n.angle, r));
        ys.push(polarY(n.angle, r));
      }
    }
    fitPoints(xs, ys, 6);
  }

  function highlightFamily(familyId: string | null) {
    svgEl.classList.toggle("family-focus", familyId !== null);
    svg
      .selectAll<SVGElement, unknown>(".node, .edge, .band")
      .classed(
        "family-hit",
        function () {
          return familyId !== null && this.getAttribute("data-family") === familyId;
        },
      );
  }

  function resetZoom() {
    transitionTo(d3.zoomIdentity, 550);
  }

  return {
    focusNode(id: string) {
      fitToLineage(ancestorsOf(id));
    },
    focusFamily,
    resetZoom,
    zoomBy(factor: number) {
      svg
        .transition()
        .duration(reducedMotion ? 0 : 250)
        .call(zoomBehavior.scaleBy, factor);
    },
    select(id: string | null) {
      svg.selectAll(".node").classed("selected", false);
      if (id) svg.selectAll(`.node[data-id="${id}"]`).classed("selected", true);
    },
    setLineage(id: string | null) {
      svg
        .selectAll(".lineage,.same-family")
        .classed("lineage", false)
        .classed("same-family", false);
      svg
        .selectAll(".lineage-edge,.same-family-edge")
        .classed("lineage-edge", false)
        .classed("same-family-edge", false);
      if (!id) return;
      const lineage = new Set(ancestorsOf(id));
      const selFam = data.familyOf.get(id);
      svg.selectAll<SVGGElement, unknown>(".node").each(function () {
        const nid = this.getAttribute("data-id");
        const fam = this.getAttribute("data-family");
        if (nid && lineage.has(nid)) this.classList.add("lineage");
        else if (selFam && fam === selFam) this.classList.add("same-family");
      });
      svg.selectAll<SVGPathElement, unknown>(".edge").each(function () {
        const target = this.getAttribute("data-target");
        const fam = this.getAttribute("data-family");
        if (target && lineage.has(target)) this.classList.add("lineage-edge");
        else if (selFam && fam === selFam) this.classList.add("same-family-edge");
      });
      // Raise lineage groups root-first so the selected node ends up on top.
      for (const lid of ancestorsOf(id).reverse()) {
        svg.selectAll(`.node[data-id="${lid}"]`).raise();
      }
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
          (labelById.get(b.id)?.priority ?? 0) -
            (labelById.get(a.id)?.priority ?? 0)
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

interface PositionedEdge {
  source: { angle: number; r: number };
  target: { angle: number; r: number };
  familyId: string | null;
  childId: string;
  fromRoot: boolean;
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
    const c = d3.hcl(h, big ? 42 : 26, big ? 72 : 66);
    out.set(f.id, c.formatHex());
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

function polarX(angle: number, r: number): number {
  return r * Math.sin(angle);
}
function polarY(angle: number, r: number): number {
  return -r * Math.cos(angle);
}

/** SVG arc from angle a0 to a1 at radius r (clockwise when `cw`). */
function arcPath(r: number, a0: number, a1: number, cw: boolean): string {
  const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
  return `M${polarX(a0, r)},${polarY(a0, r)}A${r},${r} 0 ${large} ${cw ? 1 : 0} ${polarX(a1, r)},${polarY(a1, r)}`;
}

function isLeafNode(d: Positioned): boolean {
  return !d.children || d.children.length === 0;
}

function labelTransform(d: Positioned): string {
  // All labels read outward from the centre; left-half labels are flipped so
  // they are never upside down.
  const r = isLeafNode(d) ? d.endR + 6 : d.startR + 2;
  const deg = (d.angle * 180) / Math.PI - 90;
  const flip = d.angle > Math.PI;
  return `rotate(${deg}) translate(${r},0)${flip ? " rotate(180)" : ""}`;
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
