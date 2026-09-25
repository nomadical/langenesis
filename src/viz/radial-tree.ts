import * as d3 from "d3";
import {
  isVirtualRootId,
  type LoadedData,
  type TreeNode,
} from "../data/loader";
import { type LanguageNode, periodEnd } from "../data/schema";

export interface RadialTreeOptions {
  onNodeClick?: (node: LanguageNode | null) => void;
  onNodeHover?: (node: LanguageNode | null, event: MouseEvent | null) => void;
}

export interface RadialTreeHandle {
  focusNode: (id: string) => void;
  resetZoom: () => void;
  select: (id: string | null) => void;
  setLineage: (id: string | null) => void;
  search: (query: string) => LanguageNode[];
  familyColor: (familyId: string) => string;
  lineageOf: (id: string) => string[];
}

// Leaves end at OUTER_R; the extra margin leaves room for the longest radial
// label (~110 units at 14px) so names at the top and bottom are not clipped.
const VB = 1140;
const OUTER_R = 430;
const INNER_R = 60;

type Positioned = d3.HierarchyNode<TreeNode> & {
  angle: number;
  startR: number;
  endR: number;
};

// Hand-tuned palette inspired by Tableau 10 and metro-map line colors.
// Order matches the alphabetical iteration order of family ids.
const FAMILY_PALETTE: string[] = [
  "#e15759", // 1.  afro-asiatic    — red
  "#4cb3a3", // 2.  austronesian    — teal
  "#e89143", // 3.  dravidian       — orange
  "#5b9bd5", // 4.  indo-european   — blue
  "#ff8ba0", // 5.  japonic         — pink
  "#a8855e", // 6.  koreanic        — warm brown
  "#70ad47", // 7.  niger-congo     — green
  "#edc949", // 8.  sino-tibetan    — gold
  "#9b7bc4", // 9.  turkic          — purple
  "#7fb8e0", // 10. uralic          — sky blue
];
const ROOT_STROKE = "rgba(225, 232, 245, 0.75)";

export function renderRadialTree(
  svgEl: SVGSVGElement,
  data: LoadedData,
  options: RadialTreeOptions = {},
): RadialTreeHandle {
  const svg = d3.select(svgEl);
  svg.attr("viewBox", `${-VB / 2} ${-VB / 2} ${VB} ${VB}`);
  svg.selectAll("*").remove();

  const familyColors = new Map<string, string>();
  data.families.forEach((f, i) => {
    familyColors.set(f.id, FAMILY_PALETTE[i % FAMILY_PALETTE.length]);
  });

  const timeScale = makeTimeScale(data.yearExtent, INNER_R, OUTER_R);

  const hier = d3.hierarchy<TreeNode>(data.root, (d) => d.children);

  // Even-leaf angular distribution.
  const leaves = hier.leaves();
  const N = leaves.length;
  leaves.forEach((leaf, i) => {
    (leaf as Positioned).angle = ((i + 0.5) / N) * 2 * Math.PI;
  });
  hier.eachAfter((n) => {
    const p = n as Positioned;
    if (n.children && n.children.length > 0) {
      const sum = n.children.reduce(
        (s, c) => s + (c as Positioned).angle,
        0,
      );
      p.angle = sum / n.children.length;
    }
  });

  // Inset on each chained line endpoint. The visible gap between adjacent
  // arcs is 2 * (inset - cap_radius). For the default stroke (5, cap 2.5)
  // that's a 9-unit gap; for the selected stroke (9, cap 4.5) it's 5 units —
  // still clearly visible even with the lineage glow.
  // Short arcs scale the inset down so they don't collapse.
  const TARGET_INSET = 7;

  hier.each((n) => {
    const p = n as Positioned;
    if (data.hasVirtualRoot && isVirtualRootId(n.data.data.id)) {
      p.startR = 0;
      p.endR = 0;
      return;
    }
    const rawStart = timeScale(n.data.data.period.start);
    const rawEnd = timeScale(periodEnd(n.data.data));
    const span = rawEnd - rawStart;
    const parent = n.parent;
    const hasInternalParent =
      !!parent &&
      !(data.hasVirtualRoot && isVirtualRootId(parent.data.data.id));
    const hasChildren = !!(n.children && n.children.length > 0);
    const sides =
      (hasInternalParent ? 1 : 0) + (hasChildren ? 1 : 0);
    // Keep at least 1 unit of line length, regardless of how short the period is.
    const maxInsetTotal = Math.max(0, span - 1);
    const inset =
      sides === 0
        ? 0
        : Math.min(TARGET_INSET, maxInsetTotal / sides);
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
    const start = nodeById.get(id);
    if (!start) return [];
    const out: string[] = [];
    let cur: d3.HierarchyNode<TreeNode> | null = start;
    while (cur) {
      if (data.hasVirtualRoot && isVirtualRootId(cur.data.data.id)) break;
      out.push(cur.data.data.id);
      cur = cur.parent;
    }
    return out;
  }

  const zoomRoot = svg.append("g").attr("class", "viz-root");

  zoomRoot
    .append("circle")
    .attr("class", "viz-bg")
    .attr("r", OUTER_R * 4)
    .attr("fill", "transparent")
    .on("click", () => options.onNodeClick?.(null));

  // Edges
  type Endpoint = { angle: number; r: number };
  const edgeLink = d3
    .linkRadial<EdgePoints, Endpoint>()
    .angle((d) => d.angle)
    .radius((d) => d.r);

  const primaryLinks: PositionedEdge[] = [];
  hier.links().forEach((link) => {
    const parent = link.source as Positioned;
    const child = link.target as Positioned;
    const childFamily = data.familyOf.get(child.data.data.id);
    const childId = child.data.data.id;
    const parentId = parent.data.data.id;
    if (data.hasVirtualRoot && isVirtualRootId(parentId)) {
      primaryLinks.push({
        source: { angle: child.angle, r: 0 },
        target: { angle: child.angle, r: child.startR },
        familyId: childFamily ?? null,
        childId,
      });
    } else {
      primaryLinks.push({
        source: { angle: parent.angle, r: parent.endR },
        target: { angle: child.angle, r: child.startR },
        familyId: childFamily ?? null,
        childId,
      });
    }
  });

  const edgesG = zoomRoot.append("g").attr("class", "edges");
  edgesG
    .selectAll<SVGPathElement, PositionedEdge>("path.edge")
    .data(primaryLinks)
    .join("path")
    .attr("class", "edge")
    .attr("data-family", (d) => d.familyId ?? "")
    .attr("data-target", (d) => d.childId)
    .attr("stroke", (d) =>
      d.familyId ? (familyColors.get(d.familyId) ?? ROOT_STROKE) : ROOT_STROKE,
    )
    .attr("d", (d) => edgeLink(d) ?? "")
    .style("opacity", 0)
    .transition()
    .delay((d) => {
      const child = nodeById.get(d.childId);
      return child ? child.depth * 70 : 0;
    })
    .duration(350)
    .style("opacity", null);

  // Secondary (DAG) edges
  const secondaryLinks: PositionedEdge[] = [];
  visibleNodes.forEach((p) => {
    for (const secId of p.data.secondaryParentIds) {
      const sec = visibleNodes.find((v) => v.data.data.id === secId);
      if (!sec) continue;
      secondaryLinks.push({
        source: { angle: sec.angle, r: sec.endR },
        target: { angle: p.angle, r: p.startR },
        familyId: data.familyOf.get(p.data.data.id) ?? null,
        childId: p.data.data.id,
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
      .attr("stroke", (d) =>
        d.familyId ? (familyColors.get(d.familyId) ?? ROOT_STROKE) : ROOT_STROKE,
      )
      .attr("d", (d) => edgeLink(d) ?? "");
  }

  // Nodes
  const nodesG = zoomRoot.append("g").attr("class", "nodes");
  const nodeSel = nodesG
    .selectAll<SVGGElement, Positioned>("g.node")
    .data(visibleNodes)
    .join("g")
    .attr("class", "node")
    .attr("data-id", (d) => d.data.data.id)
    .attr("data-family", (d) => data.familyOf.get(d.data.data.id) ?? "");

  // Invisible wider hitbox so arcs are easy to click. Mouse / click events
  // fire on this; the visible arc above has pointer-events disabled so it
  // never steals events.
  nodeSel
    .append("line")
    .attr("class", "node-hitbox")
    .attr("stroke", "transparent")
    .attr("stroke-width", 18)
    .attr("stroke-linecap", "round")
    .attr("x1", (d) => polarX(d.angle, d.startR))
    .attr("y1", (d) => polarY(d.angle, d.startR))
    .attr("x2", (d) => polarX(d.angle, d.endR))
    .attr("y2", (d) => polarY(d.angle, d.endR))
    .style("cursor", "pointer")
    .on("mouseenter", function (event, d) {
      // Lift this node group to the end of its parent so its arc + label
      // render on top — otherwise child node groups drawn later (children
      // are deeper in BFS) can occlude an inner parent's label.
      const group = (this as SVGElement).parentNode;
      if (group) d3.select(group as Element).raise();
      options.onNodeHover?.(d.data.data, event as MouseEvent);
    })
    .on("mouseleave", () => options.onNodeHover?.(null, null))
    .on("click", (event, d) => {
      event.stopPropagation();
      options.onNodeClick?.(d.data.data);
    });

  // Visible arcs grow radially outward, staggered by depth — initial sweep.
  nodeSel
    .append("line")
    .attr("class", "node-arc")
    .attr("stroke", (d) => {
      const f = data.familyOf.get(d.data.data.id);
      return f ? (familyColors.get(f) ?? ROOT_STROKE) : ROOT_STROKE;
    })
    .attr("pointer-events", "none")
    .attr("x1", (d) => polarX(d.angle, d.startR))
    .attr("y1", (d) => polarY(d.angle, d.startR))
    .attr("x2", (d) => polarX(d.angle, d.startR))
    .attr("y2", (d) => polarY(d.angle, d.startR))
    .transition()
    .delay((d) => d.depth * 70)
    .duration(450)
    .ease(d3.easeCubicOut)
    .attr("x2", (d) => polarX(d.angle, d.endR))
    .attr("y2", (d) => polarY(d.angle, d.endR));

  // Labels fade in last (after their arc reaches its full radius).
  nodeSel
    .append("text")
    .attr("class", (d) =>
      isLeafNode(d) ? "node-label leaf" : "node-label internal",
    )
    .attr("transform", (d) => labelTransform(d))
    .attr("text-anchor", (d) => (d.angle > Math.PI ? "end" : "start"))
    .attr("dy", "0.32em")
    .attr("font-size", (d) => (isLeafNode(d) ? 14 : 12))
    .text((d) => d.data.data.name)
    .style("opacity", 0)
    .transition()
    .delay((d) => d.depth * 70 + 250)
    .duration(250)
    .style("opacity", null);

  // Zoom + pan
  const zoomBehavior = d3
    .zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.4, 8])
    .on("zoom", (event) => {
      zoomRoot.attr("transform", event.transform.toString());
    });
  svg.call(zoomBehavior);

  function fitToLineage(ids: string[]) {
    if (!ids.length) return;
    const xs: number[] = [];
    const ys: number[] = [];
    for (const id of ids) {
      const n = nodeById.get(id);
      if (!n) continue;
      xs.push(polarX(n.angle, n.startR));
      ys.push(polarY(n.angle, n.startR));
      xs.push(polarX(n.angle, n.endR));
      ys.push(polarY(n.angle, n.endR));
    }
    if (xs.length === 0) return;
    const xmin = Math.min(...xs);
    const xmax = Math.max(...xs);
    const ymin = Math.min(...ys);
    const ymax = Math.max(...ys);
    const width = Math.max(xmax - xmin, 40);
    const height = Math.max(ymax - ymin, 40);
    const cx = (xmin + xmax) / 2;
    const cy = (ymin + ymax) / 2;
    const PAD = 160;
    const scale = Math.min(
      (VB - PAD * 2) / width,
      (VB - PAD * 2) / height,
      2.2,
    );
    svg
      .transition()
      .duration(750)
      .ease(d3.easeCubicInOut)
      .call(
        zoomBehavior.transform,
        d3.zoomIdentity.scale(scale).translate(-cx, -cy),
      );
  }

  function resetZoom() {
    svg
      .transition()
      .duration(550)
      .ease(d3.easeCubicInOut)
      .call(zoomBehavior.transform, d3.zoomIdentity);
  }

  return {
    focusNode(id: string) {
      fitToLineage(ancestorsOf(id));
    },
    select(id: string | null) {
      svg.selectAll(".node").classed("selected", false);
      if (id)
        svg.selectAll(`.node[data-id="${id}"]`).classed("selected", true);
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
        if (target && lineage.has(target))
          this.classList.add("lineage-edge");
        else if (selFam && fam === selFam)
          this.classList.add("same-family-edge");
      });
      // Raise lineage groups so their labels render on top of every other
      // node. Iterate from the deepest ancestor to the selected so the
      // selected ends up on the very top.
      const lineageList = ancestorsOf(id).reverse();
      for (const lid of lineageList) {
        svg.selectAll(`.node[data-id="${lid}"]`).raise();
      }
    },
    resetZoom,
    search(query: string) {
      const q = query.trim().toLowerCase();
      if (!q) return [];
      return visibleNodes
        .filter((n) => n.data.data.name.toLowerCase().includes(q))
        .map((n) => n.data.data);
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
}
type EdgePoints = PositionedEdge;

function polarX(angle: number, r: number): number {
  return r * Math.sin(angle);
}
function polarY(angle: number, r: number): number {
  return -r * Math.cos(angle);
}

function isLeafNode(d: Positioned): boolean {
  return !d.children || d.children.length === 0;
}

function labelTransform(d: Positioned): string {
  // All labels are radial (read outward from center). Leaves sit just past the
  // outer end of their arc; internal nodes sit at the midpoint and are hidden
  // by default (revealed on hover/selection — see style.css), so chained-label
  // overlap is moot.
  const angle = d.angle;
  const r = isLeafNode(d) ? d.endR + 8 : (d.startR + d.endR) / 2;
  const deg = (angle * 180) / Math.PI - 90;
  const flip = angle > Math.PI;
  return `rotate(${deg}) translate(${r},0)${flip ? " rotate(180)" : ""}`;
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

