// The Insights view: infographics over the whole dataset, in a dialog over
// the map. Loaded on demand (main.ts imports it dynamically), so the map's
// first paint never pays for it.
import "./insights.css";
import {
  ENDANGERMENT_LEVELS,
  endangermentLabel,
  escapeAttr,
  escapeHtml,
  formatYear,
  fsiLabel,
  FSI_URL,
  statusLabel,
} from "../data/format";
import { type CoreNode, CURRENT_YEAR, periodEnd } from "../data/model";
import type { LoadedData } from "../data/tree";

export interface InsightsOptions {
  /** Every real node on the map (virtual root excluded). */
  nodes: CoreNode[];
  data: LoadedData;
  familyColor: (familyId: string) => string;
  /** A language name was clicked: show it on the map. */
  onPick: (id: string) => void;
  onClose: () => void;
}

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat("en");
// FSI: a typical week is 23 class hours (plus 17 of self-study).
const CLASS_HOURS_PER_WEEK = 23;

const STATUS_ORDER: CoreNode["status"][] = ["living", "classical", "extinct", "reconstructed"];
const STATUS_BLURB: Record<CoreNode["status"], string> = {
  living: "spoken today",
  classical: "dead, but still read, sung or studied",
  extinct: "no speakers left",
  reconstructed: "never written down; rebuilt by comparing descendants",
};

export function createInsights(o: InsightsOptions) {
  const dialog = document.createElement("dialog");
  dialog.className = "insights";
  dialog.setAttribute("aria-labelledby", "insights-title");
  document.body.appendChild(dialog);

  const byId = new Map(o.nodes.map((n) => [n.id, n]));
  const series = aliveOverTime(o.nodes);
  const famColor = (id: string) => o.familyColor(o.data.familyOf.get(id) ?? "") || "var(--fg-faint)";
  const nameLink = (n: CoreNode) =>
    `<button type="button" class="ins-name" data-pick="${escapeAttr(n.id)}"><span class="dot" style="background:${famColor(n.id)}"></span>${escapeHtml(n.name)}</button>`;

  dialog.innerHTML = `
    <div class="ins-shell">
      <header class="ins-head">
        <div>
          <h2 id="insights-title">Insights</h2>
          <p>What the ${o.nodes.length} languages and stages on the map add up to. Click any name to find it on the map.</p>
        </div>
        <button type="button" class="ins-close" aria-label="Close insights">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/></svg>
        </button>
      </header>
      ${tiles(o.nodes)}
      <div class="ins-grid">
        ${unitChart(o.nodes)}
        ${endangermentChart(o.nodes, nameLink)}
        ${vocabularyChart(o.nodes, nameLink)}
        ${learningChart(o.nodes, nameLink)}
        ${timelineCard(series)}
        ${speakersChart(o.nodes, nameLink)}
        ${funFacts(o, nameLink)}
      </div>
      <p class="ins-foot">
        Endangerment from <a href="https://glottolog.org/" target="_blank" rel="noopener">Glottolog</a> (UNESCO scale).
        Learning time from the <a href="${FSI_URL}" target="_blank" rel="noopener">Foreign Service Institute</a>.
        Word counts from the <a href="https://en.wiktionary.org/" target="_blank" rel="noopener">English Wiktionary</a>.
      </p>
    </div>
    <div class="ins-tip" role="tooltip"></div>
  `;

  const tip = dialog.querySelector<HTMLDivElement>(".ins-tip")!;
  const timeline = dialog.querySelector<HTMLDivElement>("#ins-timeline")!;

  dialog.querySelector(".ins-close")!.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", o.onClose);
  // A click on the backdrop (outside the shell) closes it.
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
    const pick = (e.target as Element).closest<HTMLElement>("[data-pick]");
    if (pick) o.onPick(pick.dataset.pick!);
  });

  // Unit-chart dots: tooltip on hover.
  dialog.addEventListener("pointerover", (e) => {
    const dot = (e.target as Element).closest<HTMLElement>(".unit[data-pick]");
    if (!dot) return;
    const n = byId.get(dot.dataset.pick!);
    if (n) showTip(e, `<strong>${escapeHtml(n.name)}</strong><span>${statusLabel(n.status)}</span>`);
  });
  dialog.addEventListener("pointerout", (e) => {
    if ((e.target as Element).closest(".unit")) hideTip();
  });

  function showTip(e: PointerEvent, html: string) {
    tip.innerHTML = html;
    tip.classList.add("visible");
    const pad = 12;
    const x = Math.min(e.clientX + pad, window.innerWidth - tip.offsetWidth - 8);
    const y = e.clientY + pad + tip.offsetHeight > window.innerHeight ? e.clientY - tip.offsetHeight - pad : e.clientY + pad;
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
  }
  function hideTip() {
    tip.classList.remove("visible");
  }

  // The timeline is the one SVG chart; it is drawn at the card's real width.
  const resize = new ResizeObserver(() => drawTimeline(timeline, series, showTip, hideTip));

  return {
    open() {
      if (!dialog.open) dialog.showModal();
      resize.observe(timeline);
      dialog.querySelector<HTMLElement>(".ins-shell")!.scrollTop = 0;
    },
    close() {
      resize.disconnect();
      if (dialog.open) dialog.close();
    },
  };
}

// ============ Stat tiles ============

function tiles(nodes: CoreNode[]): string {
  const living = nodes.filter((n) => n.status === "living");
  const dead = nodes.filter((n) => n.status === "extinct" || n.status === "classical");
  const rated = living.filter((n) => n.endangerment);
  const endangered = rated.filter((n) => n.endangerment !== "safe");
  const share = Math.round((endangered.length / Math.max(rated.length, 1)) * 100);
  const tile = (value: string, label: string, note: string, cls = "") =>
    `<div class="ins-tile ${cls}"><div class="ins-tile-value">${value}</div><div class="ins-tile-label">${label}</div><div class="ins-tile-note">${note}</div></div>`;
  return `<div class="ins-tiles">
    ${tile(String(living.length), "Living", "spoken somewhere today", "t-living")}
    ${tile(String(dead.length), "Dead", "extinct or classical", "t-dead")}
    ${tile(String(nodes.length - living.length - dead.length), "Reconstructed", "proto-languages, never written")}
    ${tile(`${share}%`, "Endangered", `${endangered.length} of the ${rated.length} living languages Glottolog rates`, "t-risk")}
  </div>`;
}

// ============ Every language, as a dot ============

function unitChart(nodes: CoreNode[]): string {
  const groups = STATUS_ORDER.map((status) => {
    const members = nodes
      .filter((n) => n.status === status)
      .sort((a, b) => a.period.start - b.period.start);
    const dots = members
      .map((n) => `<span class="unit" data-pick="${escapeAttr(n.id)}" aria-hidden="true"></span>`)
      .join("");
    return `<div class="unit-group s-${status}">
      <div class="unit-label"><strong>${members.length}</strong> ${statusLabel(status).toLowerCase()} <span class="faint">· ${STATUS_BLURB[status]}</span></div>
      <div class="unit-dots">${dots}</div>
    </div>`;
  }).join("");
  return card(
    "wide",
    "Every language on the map, as a dot",
    "Grouped by status, oldest first. Hover a dot for its name, click to find it.",
    `<div class="units">${groups}</div>`,
    table(
      ["Status", "Languages and stages"],
      STATUS_ORDER.map((s) => [statusLabel(s), String(nodes.filter((n) => n.status === s).length)]),
    ),
  );
}

// ============ Endangerment ladder ============

function endangermentChart(nodes: CoreNode[], nameLink: (n: CoreNode) => string): string {
  const living = nodes.filter((n) => n.status === "living");
  const rows = ENDANGERMENT_LEVELS.map((level, i) => {
    const members = living
      .filter((n) => n.endangerment === level)
      .sort((a, b) => (b.speakers ?? 0) - (a.speakers ?? 0));
    return { level, i, members };
  });
  const max = Math.max(...rows.map((r) => r.members.length), 1);
  const unrated = living.filter((n) => !n.endangerment).length;
  const body = rows
    .map(
      ({ level, i, members }) => `<div class="ladder-row">
        <div class="bar-label">${endangermentLabel(level)}</div>
        <div class="bar-track"><span class="bar" style="--w:${(members.length / max) * 100}%;--c:var(--risk-${i})"></span><span class="bar-value">${members.length}</span></div>
        <div class="ladder-eg">${members.slice(0, 4).map(nameLink).join("")}</div>
      </div>`,
    )
    .join("");
  return card(
    "",
    "How safe are living languages?",
    `UNESCO's five-step scale, from children still learning it to only a few elderly speakers left. ${unrated} living languages are not rated.`,
    `<div class="ladder">${body}</div>`,
    table(
      ["Level", "Languages", "Most spoken"],
      rows.map((r) => [endangermentLabel(r.level), String(r.members.length), r.members.slice(0, 4).map((n) => n.name).join(", ")]),
    ),
  );
}

// ============ Learning curve ============

function learningChart(nodes: CoreNode[], nameLink: (n: CoreNode) => string): string {
  const rated = nodes.filter((n) => n.learning);
  const steps = [...new Set(rated.map((n) => n.learning!.weeks))].sort((a, b) => a - b);
  const max = Math.max(...steps);
  const cols = steps
    .map((weeks) => {
      const members = rated
        .filter((n) => n.learning!.weeks === weeks)
        .sort((a, b) => a.name.localeCompare(b.name));
      const cat = members[0].learning!.fsi_category;
      return `<div class="stair">
        <div class="stair-plot"><span class="stair-bar" style="--h:${(weeks / max) * 100}%"><span class="stair-value">${weeks} wk</span></span></div>
        <div class="stair-cap">${fsiLabel(cat)}<span class="faint">${whole.format(weeks * CLASS_HOURS_PER_WEEK)} class hours</span></div>
        <div class="stair-names">${members.map(nameLink).join("")}</div>
      </div>`;
    })
    .join("");
  return card(
    "wide",
    "The learning curve",
    "How long the US Foreign Service Institute expects an English speaker to need for professional fluency, in full-time classroom weeks.",
    `<div class="stairs">${cols}</div>`,
    table(
      ["Language", "Weeks", "FSI category"],
      rated
        .sort((a, b) => a.learning!.weeks - b.learning!.weeks || a.name.localeCompare(b.name))
        .map((n) => [n.name, String(n.learning!.weeks), fsiLabel(n.learning!.fsi_category)]),
    ),
  );
}

// ============ Vocabulary ============

function vocabularyChart(nodes: CoreNode[], nameLink: (n: CoreNode) => string): string {
  const top = nodes
    .filter((n) => n.vocabulary)
    .sort((a, b) => b.vocabulary!.wiktionary_lemmas - a.vocabulary!.wiktionary_lemmas)
    .slice(0, 15);
  return card(
    "",
    "Most words on record",
    "Dictionary entries (lemmas) on the English Wiktionary. It measures how well a language is documented there, not how many words it has.",
    bars(top, (n) => n.vocabulary!.wiktionary_lemmas, nameLink),
    table(
      ["Language", "Wiktionary lemmas"],
      top.map((n) => [n.name, whole.format(n.vocabulary!.wiktionary_lemmas)]),
    ),
  );
}

// ============ Most spoken ============

function speakersChart(nodes: CoreNode[], nameLink: (n: CoreNode) => string): string {
  const top = nodes
    .filter((n) => n.status === "living" && n.speakers)
    .sort((a, b) => b.speakers! - a.speakers!)
    .slice(0, 12);
  return card(
    "",
    "Most spoken",
    "Native and second-language speakers combined, as recorded for each language on the map.",
    bars(top, (n) => n.speakers!, nameLink),
    table(
      ["Language", "Speakers"],
      top.map((n) => [n.name, whole.format(n.speakers!)]),
    ),
  );
}

function bars(rows: CoreNode[], value: (n: CoreNode) => number, nameLink: (n: CoreNode) => string): string {
  const max = Math.max(...rows.map(value), 1);
  return `<div class="hbars">${rows
    .map(
      (n) => `<div class="hbar-row">
        <div class="bar-label">${nameLink(n)}</div>
        <div class="bar-track"><span class="bar" style="--w:${(value(n) / max) * 100}%"></span><span class="bar-value">${compact.format(value(n))}</span></div>
      </div>`,
    )
    .join("")}</div>`;
}

// ============ Languages alive through time ============

interface Point {
  year: number;
  count: number;
}

const TIMELINE_START = -3500;
const TIMELINE_STEP = 25;

/** Attested (not reconstructed) languages and stages in use, every 25 years. */
function aliveOverTime(nodes: CoreNode[]): Point[] {
  const attested = nodes.filter((n) => n.status !== "reconstructed");
  const out: Point[] = [];
  for (let year = TIMELINE_START; year <= CURRENT_YEAR; year += TIMELINE_STEP) {
    out.push({ year, count: attested.filter((n) => n.period.start <= year && periodEnd(n) >= year).length });
  }
  if (out[out.length - 1].year !== CURRENT_YEAR) {
    out.push({
      year: CURRENT_YEAR,
      count: attested.filter((n) => n.period.end === "present").length,
    });
  }
  return out;
}

function timelineCard(series: Point[]): string {
  return card(
    "wide",
    "Languages through time",
    "How many of the map's languages and historical stages were in use in each year, leaving out reconstructed proto-languages. Each stage counts once, so Old English hands over to Middle English. The jump around 1500 is where most modern languages are dated from.",
    `<div id="ins-timeline" class="timeline"></div>`,
    table(
      ["Year", "In use"],
      series
        .filter((p) => p.year % 500 === 0 || p.year === CURRENT_YEAR)
        .map((p) => [p.year === CURRENT_YEAR ? "Today" : formatYear(p.year), String(p.count)]),
    ),
  );
}

function drawTimeline(
  el: HTMLElement,
  series: Point[],
  showTip: (e: PointerEvent, html: string) => void,
  hideTip: () => void,
) {
  const W = el.clientWidth;
  if (!W) return;
  const H = Math.max(180, Math.min(260, W * 0.32));
  const m = { top: 14, right: 12, bottom: 26, left: 36 };
  const iw = W - m.left - m.right;
  const ih = H - m.top - m.bottom;
  const x0 = series[0].year;
  const x1 = series[series.length - 1].year;
  const yMax = Math.ceil(Math.max(...series.map((p) => p.count)) / 100) * 100;
  const x = (year: number) => m.left + ((year - x0) / (x1 - x0)) * iw;
  const y = (count: number) => m.top + ih - (count / yMax) * ih;

  const line = series.map((p, i) => `${i ? "L" : "M"}${x(p.year).toFixed(1)},${y(p.count).toFixed(1)}`).join("");
  const area = `${line}L${x(x1).toFixed(1)},${y(0)}L${x(x0).toFixed(1)},${y(0)}Z`;
  const yTicks = [0, yMax / 2, yMax];
  const xTicks = [-3000, -2000, -1000, 1, 1000, 2000].filter((t) => t >= x0);
  const last = series[series.length - 1];

  el.innerHTML = `<svg width="${W}" height="${H}" role="img" aria-label="Line chart: attested languages in use rises from a handful around 3000 BCE to ${last.count} today">
    ${yTicks.map((t) => `<line class="grid" x1="${m.left}" x2="${W - m.right}" y1="${y(t)}" y2="${y(t)}"/><text class="tick" x="${m.left - 6}" y="${y(t) + 3.5}" text-anchor="end">${t}</text>`).join("")}
    ${xTicks.map((t) => `<text class="tick" x="${x(t)}" y="${H - 8}" text-anchor="middle">${t < 0 ? `${-t / 1000}k BCE` : t === 1 ? "1 CE" : `${t}`}</text>`).join("")}
    <path class="area" d="${area}"/>
    <path class="line" d="${line}"/>
    <circle class="end" cx="${x(last.year)}" cy="${y(last.count)}" r="4"/>
    <text class="end-label" x="${x(last.year) - 8}" y="${y(last.count) - 10}" text-anchor="end">${last.count} today</text>
    <line class="cross" y1="${m.top}" y2="${m.top + ih}" visibility="hidden"/>
    <circle class="cross-dot" r="4" visibility="hidden"/>
    <rect class="hit" x="${m.left}" y="${m.top}" width="${iw}" height="${ih}"/>
  </svg>`;

  const svg = el.querySelector("svg")!;
  const cross = svg.querySelector<SVGLineElement>(".cross")!;
  const dot = svg.querySelector<SVGCircleElement>(".cross-dot")!;
  const hit = svg.querySelector<SVGRectElement>(".hit")!;
  hit.addEventListener("pointermove", (e) => {
    const box = svg.getBoundingClientRect();
    const year = x0 + ((e.clientX - box.left - m.left) / iw) * (x1 - x0);
    const p = series.reduce((best, q) => (Math.abs(q.year - year) < Math.abs(best.year - year) ? q : best));
    for (const node of [cross, dot]) node.setAttribute("visibility", "visible");
    cross.setAttribute("x1", String(x(p.year)));
    cross.setAttribute("x2", String(x(p.year)));
    dot.setAttribute("cx", String(x(p.year)));
    dot.setAttribute("cy", String(y(p.count)));
    showTip(e, `<strong>${p.year === CURRENT_YEAR ? "Today" : formatYear(p.year)}</strong><span>${p.count} in use</span>`);
  });
  hit.addEventListener("pointerleave", () => {
    for (const node of [cross, dot]) node.setAttribute("visibility", "hidden");
    hideTip();
  });
}

// ============ Fun facts ============

function funFacts(o: InsightsOptions, nameLink: (n: CoreNode) => string): string {
  const attested = o.nodes.filter((n) => n.status !== "reconstructed");
  const oldest = minBy(attested, (n) => n.period.start);
  // Dead languages only: a living language's start is a divergence date, not a record.
  const longest = minBy(
    attested.filter((n) => (n.status === "extinct" || n.status === "classical") && n !== oldest),
    (n) => -(periodEnd(n) - n.period.start),
  );
  const smallest = minBy(
    o.nodes.filter((n) => n.status === "living" && n.speakers),
    (n) => n.speakers!,
  );
  const biggest = minBy(o.data.families, (f) => -f.descendants.size);
  const byId = new Map(o.nodes.map((n) => [n.id, n]));
  const facts: string[] = [];
  if (oldest)
    facts.push(fact("Oldest on record", nameLink(oldest), `written from ${formatYear(oldest.period.start, oldest.period.start_uncertainty)}`));
  if (longest)
    facts.push(fact("Longest-lived dead language", nameLink(longest), `${whole.format(periodEnd(longest) - longest.period.start)} years in use`));
  if (biggest && byId.get(biggest.id))
    facts.push(fact("Largest family tree", nameLink(byId.get(biggest.id)!), `${biggest.descendants.size} descendant languages and stages`));
  if (smallest)
    facts.push(fact("Fewest speakers", nameLink(smallest), `${whole.format(smallest.speakers!)} people`));
  return `<section class="ins-card"><h3>Records</h3><div class="facts">${facts.join("")}</div></section>`;
}

function fact(label: string, name: string, detail: string): string {
  return `<div class="fact"><div class="fact-label">${label}</div><div class="fact-name">${name}</div><div class="fact-detail">${detail}</div></div>`;
}

function minBy<T>(items: T[], key: (item: T) => number): T | undefined {
  let best: T | undefined;
  let bestKey = Infinity;
  for (const item of items) {
    const k = key(item);
    if (k < bestKey) {
      best = item;
      bestKey = k;
    }
  }
  return best;
}

// ============ Shared pieces ============

function card(cls: string, title: string, lede: string, chart: string, tableHtml: string): string {
  return `<section class="ins-card ${cls}">
    <h3>${title}</h3>
    <p class="ins-lede">${lede}</p>
    ${chart}
    ${tableHtml ? `<details class="table-view"><summary>Show as table</summary>${tableHtml}</details>` : ""}
  </section>`;
}

function table(head: string[], rows: string[][]): string {
  return `<table><thead><tr>${head.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;
}
