import "./styles.css";
import { type FamilyInfo, isVirtualRootId, loadData } from "./data/loader";
import { type CoreNode, type NodeDetails } from "./data/model";
import { renderRadialTree, type RadialTreeHandle } from "./viz/radial-tree";

function mustGet<T extends Element>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as unknown as T;
}

const svgEl = mustGet<SVGSVGElement>("viz");
const tooltipEl = mustGet<HTMLDivElement>("tooltip");
const detailBody = mustGet<HTMLDivElement>("detail-body");
const searchEl = mustGet<HTMLInputElement>("search");
const acEl = mustGet<HTMLUListElement>("autocomplete");
const statusEl = mustGet<HTMLSpanElement>("status");
const familiesEl = mustGet<HTMLUListElement>("families");
const familyCountEl = mustGet<HTMLSpanElement>("family-count");
const announcerEl = mustGet<HTMLDivElement>("announcer");

const data = loadData();
const allNodes = [...data.byId.values()]
  .map((n) => n.data)
  .filter((n) => !isVirtualRootId(n.id));
const familyById = new Map(data.families.map((f) => [f.id, f]));
statusEl.textContent = `${allNodes.length} languages · ${data.families.length} families`;
familyCountEl.textContent = String(data.families.length);

// Suggested starting points for the empty detail panel.
const STARTERS = [
  "english",
  "mandarin",
  "hindi",
  "swahili",
  "latin",
  "finnish",
  "navajo",
  "japanese",
];

let selectedId: string | null = null;
// Notes, sources and codes load after first paint; the tree never needs them.
let details: Record<string, NodeDetails> | null = null;
let acIndex = -1;
let acMatches: CoreNode[] = [];

const compact = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const handle: RadialTreeHandle = renderRadialTree(svgEl, data, {
  onNodeHover(node, event) {
    if (!node || !event) return hideTooltip();
    const fam = familyOfNode(node.id);
    const meta = [statusLabel(node.status)];
    if (node.speakers) meta.push(`${compact.format(node.speakers)} speakers`);
    showTooltip(
      event,
      `
      <div class="tooltip-name">${escapeHtml(node.name)}</div>
      <div class="tooltip-period">${formatPeriod(node)}</div>
      <div class="tooltip-meta">${meta.join(" · ")}</div>
      ${fam && fam.id !== node.id ? `<div class="tooltip-family"><span class="dot" style="background:${handle.familyColor(fam.id)}"></span>${escapeHtml(fam.label)}</div>` : ""}
    `,
    );
  },
  onNodeClick(node) {
    setSelection(node?.id ?? null);
  },
  onFamilyHover(fam, event) {
    if (!fam || !event) return hideTooltip();
    showTooltip(
      event,
      `
      <div class="tooltip-name">${escapeHtml(fam.label)}</div>
      <div class="tooltip-meta">${fam.leafCount} ${fam.leafCount === 1 ? "language" : "languages"} · click to zoom</div>
    `,
    );
  },
  onFamilyClick(fam) {
    selectFamily(fam.id);
  },
});

function setSelection(
  id: string | null,
  opts: { focus?: "lineage" | "family" | "none"; focusDetail?: boolean } = {},
) {
  selectedId = id;
  handle.select(id);
  handle.setLineage(id);
  const focus = opts.focus ?? "lineage";
  if (id) {
    const node = data.byId.get(id)?.data;
    if (node) {
      renderDetail(node, { focus: opts.focusDetail });
      announce(node);
    }
    if (focus === "lineage") handle.focusNode(id);
    else if (focus === "family") handle.focusFamily(data.familyOf.get(id) ?? id);
  } else {
    renderDetail(null);

// Fetch the reference material on the first sign of intent: a click, a key,
// focus, or the pointer moving over the map. Pure viewers never download it.
let detailsRequested = false;
async function loadDetails() {
  if (detailsRequested) return;
  detailsRequested = true;
  details = (await import("virtual:language-details")).default;
  const node = selectedId ? data.byId.get(selectedId)?.data : undefined;
  if (node) renderDetail(node);
}
for (const type of ["pointerdown", "keydown", "focusin"] as const) {
  document.addEventListener(type, loadDetails, { once: true, passive: true });
}
svgEl.addEventListener("pointermove", loadDetails, { once: true, passive: true });
    if (focus !== "none") handle.resetZoom();
  }
  updateFamilyActive();
}

/** One short sentence for screen readers instead of the whole panel. */
function announce(node: CoreNode) {
  const fam = familyOfNode(node.id);
  const stages = handle.lineageOf(node.id).length;
  const parts = [node.name, formatPeriod(node), statusLabel(node.status)];
  if (fam && fam.id !== node.id) parts.push(`${fam.label} family`);
  if (stages > 1) parts.push(`${stages} stages in its lineage`);
  announcerEl.textContent = `${parts.join(". ")}.`;
}

function selectFamily(familyId: string) {
  setSelection(familyId, { focus: "family" });
}

function familyOfNode(id: string): FamilyInfo | undefined {
  const famId = data.familyOf.get(id);
  return famId ? familyById.get(famId) : undefined;
}

function updateFamilyActive() {
  const famId = selectedId ? data.familyOf.get(selectedId) : null;
  for (const li of familiesEl.querySelectorAll<HTMLElement>("li")) {
    li.classList.toggle("active", li.dataset.id === famId);
  }
}

// ============ Family list ============
function renderFamilies() {
  familiesEl.innerHTML = "";
  for (const fam of data.families) {
    const li = document.createElement("li");
    li.dataset.id = fam.id;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "family-btn";
    btn.innerHTML = `
      <span class="family-swatch" style="background:${handle.familyColor(fam.id)}"></span>
      <span class="family-name">${escapeHtml(fam.label)}</span>
      <span class="family-count">${fam.leafCount}</span>
    `;
    btn.addEventListener("click", () => selectFamily(fam.id));
    btn.addEventListener("mouseenter", () => handle.highlightFamily(fam.id));
    btn.addEventListener("mouseleave", () => handle.highlightFamily(null));
    btn.addEventListener("focus", () => handle.highlightFamily(fam.id));
    btn.addEventListener("blur", () => handle.highlightFamily(null));
    li.appendChild(btn);
    familiesEl.appendChild(li);
  }
}
renderFamilies();

// ============ Detail panel ============
/**
 * Re-renders the panel. The panel is rebuilt with innerHTML, so if focus was
 * inside it (a chip, lineage link or family tag), or the caller asks, focus
 * moves to the new heading instead of falling back to <body>.
 */
function renderDetail(node: CoreNode | null, opts: { focus?: boolean } = {}) {
  const keepFocus = opts.focus || detailBody.contains(document.activeElement);
  paintDetail(node);
  if (keepFocus) {
    detailBody.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
  }
}

function paintDetail(node: CoreNode | null) {
  if (!node) {
    const starters = STARTERS.map((id) => data.byId.get(id)?.data)
      .filter((n): n is CoreNode => !!n)
      .map(
        (n) =>
          `<button type="button" class="chip" data-jump="${escapeAttr(n.id)}" style="--c:${handle.familyColor(data.familyOf.get(n.id) ?? "")}">${escapeHtml(n.name)}</button>`,
      )
      .join("");
    detailBody.innerHTML = `
      <div class="intro">
        <h2 tabindex="-1">Where did your language come from?</h2>
        <p>Pick any line in the tree, search above, or start with one of these to trace it back to its oldest known ancestor.</p>
        <div class="chips">${starters}</div>
      </div>
    `;
    wireJumps();
    return;
  }

  const fam = familyOfNode(node.id);
  const famColor = fam ? handle.familyColor(fam.id) : "var(--fg-dim)";

  const info = details?.[node.id];
  const facts: string[] = [];
  if (node.speakers !== undefined)
    facts.push(`<dt>Speakers</dt><dd>${compact.format(node.speakers)} <span class="faint">(${node.speakers.toLocaleString("en-US")})</span></dd>`);
  if (info?.iso639_3) facts.push(`<dt>ISO 639-3</dt><dd class="mono">${info.iso639_3}</dd>`);
  if (info?.glottocode) facts.push(`<dt>Glottocode</dt><dd class="mono">${info.glottocode}</dd>`);
  if (node.parents.length > 1) {
    const others = node.parents
      .slice(1)
      .map((p) => jumpLink(p))
      .join(", ");
    facts.push(`<dt>Also from</dt><dd>${others}</dd>`);
  }

  // Lineage: oldest ancestor at the top, the selected language at the bottom,
  // drawn as a metro line in the family colour.
  const lineage = handle.lineageOf(node.id).reverse();
  const lineageHtml =
    lineage.length > 1
      ? `<section class="lineage">
          <h3 class="section-title">Lineage</h3>
          <ol class="line" style="--c:${famColor}">
            ${lineage
              .map((id) => {
                const n = data.byId.get(id)!.data;
                const current = id === node.id;
                return `<li class="${current ? "current" : ""} ${n.status === "reconstructed" ? "reconstructed" : ""}">
                  ${current ? `<span class="stop-name">${escapeHtml(n.name)}</span>` : `<a class="stop-name link" data-jump="${escapeAttr(id)}" href="#">${escapeHtml(n.name)}</a>`}
                  <span class="stop-period">${formatPeriod(n)}</span>
                </li>`;
              })
              .join("")}
          </ol>
        </section>`
      : "";

  const children = allNodes.filter((n) => n.parents[0] === node.id);
  const childrenHtml = children.length
    ? `<section>
        <h3 class="section-title">Descendants <span class="faint">${children.length}</span></h3>
        <div class="chips">${children
          .map(
            (c) =>
              `<button type="button" class="chip" data-jump="${escapeAttr(c.id)}" style="--c:${famColor}">${escapeHtml(c.name)}</button>`,
          )
          .join("")}</div>
      </section>`
    : "";

  const sources = (info?.sources ?? [])
    .map((s) => `<li><a href="${escapeAttr(s)}" target="_blank" rel="noopener">${escapeHtml(prettyUrl(s))}</a></li>`)
    .join("");

  detailBody.innerHTML = `
    <header class="detail-head">
      ${fam && fam.id !== node.id ? `<button type="button" class="family-tag" data-family="${escapeAttr(fam.id)}"><span class="dot" style="background:${famColor}"></span>${escapeHtml(fam.label)}</button>` : ""}
      <h2 tabindex="-1">${escapeHtml(node.name)}</h2>
      <div class="period">${formatPeriod(node)}</div>
      <span class="pill status-${node.status}">${statusLabel(node.status)}</span>
    </header>
    ${facts.length ? `<dl>${facts.join("")}</dl>` : ""}
    ${info?.notes ? `<p class="notes">${escapeHtml(info.notes)}</p>` : ""}
    ${lineageHtml}
    ${childrenHtml}
    ${sources ? `<section class="sources"><h3 class="section-title">Sources</h3><ul>${sources}</ul></section>` : ""}
  `;
  wireJumps();
  detailBody.scrollTop = 0;
}

function jumpLink(id: string): string {
  const n = data.byId.get(id)?.data;
  if (!n) return escapeHtml(id);
  return `<a class="link" data-jump="${escapeAttr(id)}" href="#">${escapeHtml(n.name)}</a>`;
}

function wireJumps() {
  detailBody.querySelectorAll<HTMLElement>("[data-jump]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      setSelection(el.dataset.jump!);
    });
  });
  detailBody.querySelectorAll<HTMLElement>(".family-tag").forEach((el) => {
    el.addEventListener("click", () => selectFamily(el.dataset.family!));
  });
}

// ============ Zoom controls ============
mustGet<HTMLButtonElement>("zoom-in").addEventListener("click", () => handle.zoomBy(1.6));
mustGet<HTMLButtonElement>("zoom-out").addEventListener("click", () => handle.zoomBy(1 / 1.6));
mustGet<HTMLButtonElement>("zoom-reset").addEventListener("click", () =>
  setSelection(null),
);

// ============ Keyboard navigation on the map ============
// Arrow keys walk the tree: left/right between siblings (clockwise order),
// up to the parent, down to the first descendant; Home jumps to the family.
function neighbour(id: string | null, key: string): string | null {
  if (!id) return data.families[0]?.id ?? null;
  const node = data.byId.get(id);
  if (!node) return null;
  const parentId = node.data.parents[0];
  if (key === "ArrowUp") return parentId ?? null;
  if (key === "ArrowDown") return node.children[0]?.data.id ?? null;
  if (key === "Home") return data.familyOf.get(id) ?? null;
  const siblings = parentId
    ? data.byId.get(parentId)!.children.map((c) => c.data.id)
    : data.families.map((f) => f.id);
  const i = siblings.indexOf(id);
  if (i === -1 || siblings.length < 2) return null;
  const step = key === "ArrowRight" ? 1 : -1;
  return siblings[(i + step + siblings.length) % siblings.length];
}

svgEl.addEventListener("keydown", (e) => {
  if (e.altKey || e.metaKey || e.ctrlKey) return;
  switch (e.key) {
    case "+":
    case "=":
      handle.zoomBy(1.6);
      break;
    case "-":
    case "_":
      handle.zoomBy(1 / 1.6);
      break;
    case "0":
      setSelection(null);
      break;
    case "ArrowLeft":
    case "ArrowRight":
    case "ArrowUp":
    case "ArrowDown":
    case "Home": {
      const next = neighbour(selectedId, e.key);
      if (next) setSelection(next);
      break;
    }
    default:
      return;
  }
  e.preventDefault();
});

// ============ Autocomplete ============
let searchDebounce: number | undefined;
searchEl.addEventListener("input", () => {
  if (searchDebounce !== undefined) window.clearTimeout(searchDebounce);
  searchDebounce = window.setTimeout(updateAutocomplete, 60);
});
function updateAutocomplete() {
  const q = searchEl.value.trim();
  if (!q) return hideAutocomplete();
  acMatches = handle.search(q).slice(0, 8);
  acIndex = acMatches.length > 0 ? 0 : -1;
  acEl.innerHTML = "";
  if (acMatches.length === 0) {
    acEl.innerHTML = `<li class="ac-empty">No language matches “${escapeHtml(q)}”</li>`;
    acEl.hidden = false;
    searchEl.setAttribute("aria-expanded", "true");
    return;
  }
  acMatches.forEach((node, i) => {
    const li = document.createElement("li");
    li.id = `ac-${i}`;
    li.setAttribute("role", "option");
    li.setAttribute("aria-selected", String(i === acIndex));
    if (i === acIndex) li.classList.add("active");
    const fam = familyOfNode(node.id);
    li.innerHTML = `
      <span class="dot" style="background:${fam ? handle.familyColor(fam.id) : "var(--fg-faint)"}"></span>
      <span class="ac-name">${escapeHtml(node.name)}</span>
      <span class="ac-period">${formatPeriod(node)}</span>
    `;
    li.addEventListener("mousedown", (e) => {
      e.preventDefault();
      pickAutocomplete(i);
    });
    li.addEventListener("mouseenter", () => setAcIndex(i));
    acEl.appendChild(li);
  });
  acEl.hidden = false;
  searchEl.setAttribute("aria-expanded", "true");
  searchEl.setAttribute("aria-activedescendant", `ac-${acIndex}`);
}
function hideAutocomplete() {
  acEl.hidden = true;
  acEl.innerHTML = "";
  acMatches = [];
  acIndex = -1;
  searchEl.setAttribute("aria-expanded", "false");
  searchEl.removeAttribute("aria-activedescendant");
}
function setAcIndex(i: number) {
  acIndex = i;
  acEl.querySelectorAll("li").forEach((li, idx) => {
    li.classList.toggle("active", idx === i);
    li.setAttribute("aria-selected", String(idx === i));
  });
  searchEl.setAttribute("aria-activedescendant", `ac-${i}`);
}
function pickAutocomplete(i: number) {
  const node = acMatches[i];
  if (!node) return;
  searchEl.value = node.name;
  hideAutocomplete();
  // Hand focus to the result so keyboard users land on what they picked.
  setSelection(node.id, { focusDetail: true });
}

searchEl.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    if (acMatches.length) setAcIndex((acIndex + 1) % acMatches.length);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    if (acMatches.length) setAcIndex((acIndex - 1 + acMatches.length) % acMatches.length);
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (acIndex >= 0) pickAutocomplete(acIndex);
  } else if (e.key === "Escape") {
    if (!acEl.hidden) hideAutocomplete();
    else {
      searchEl.value = "";
      searchEl.blur();
    }
  }
});

document.addEventListener("click", (e) => {
  if (!(e.target instanceof Node)) return;
  if (!searchEl.contains(e.target) && !acEl.contains(e.target)) hideAutocomplete();
});

// ============ Global keyboard ============
document.addEventListener("keydown", (e) => {
  const typing = document.activeElement === searchEl;
  if (e.key === "Escape" && !typing) {
    if (selectedId !== null) setSelection(null);
  } else if (e.key === "/" && !typing) {
    e.preventDefault();
    searchEl.focus();
  }
});

// ============ Tooltip ============
function showTooltip(event: MouseEvent, html: string) {
  tooltipEl.innerHTML = html;
  tooltipEl.classList.add("visible");
  positionTooltip(event);
}
function hideTooltip() {
  tooltipEl.classList.remove("visible");
}
document.addEventListener("mousemove", (event) => {
  if (tooltipEl.classList.contains("visible")) positionTooltip(event);
});
function positionTooltip(event: MouseEvent) {
  const pad = 14;
  const w = tooltipEl.offsetWidth;
  const h = tooltipEl.offsetHeight;
  let x = event.clientX + pad;
  let y = event.clientY + pad;
  if (x + w > window.innerWidth) x = event.clientX - w - pad;
  if (y + h > window.innerHeight) y = event.clientY - h - pad;
  tooltipEl.style.left = `${x}px`;
  tooltipEl.style.top = `${y}px`;
}

// ============ Formatting ============
function statusLabel(status: CoreNode["status"]): string {
  return {
    living: "Living",
    extinct: "Extinct",
    reconstructed: "Reconstructed",
    classical: "Classical",
  }[status];
}
function formatPeriod(node: CoreNode): string {
  const start = formatYear(node.period.start, node.period.start_uncertainty);
  const end = node.period.end === "present" ? "today" : formatYear(node.period.end);
  return `${start} – ${end}`;
}
function formatYear(y: number, uncertainty?: number): string {
  const approx = uncertainty ? "c. " : "";
  if (y < 0) return `${approx}${(-y).toLocaleString("en-US")} BCE`;
  return `${approx}${y} CE`;
}
function prettyUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = decodeURIComponent(u.pathname).replace(/^\/wiki\//, "").replace(/_/g, " ");
    return `${u.hostname.replace(/^(www|en)\./, "")} · ${path.replace(/^\//, "")}`;
  } catch {
    return url;
  }
}
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

renderDetail(null);

// Fetch the reference material on the first sign of intent: a click, a key,
// focus, or the pointer moving over the map. Pure viewers never download it.
let detailsRequested = false;
async function loadDetails() {
  if (detailsRequested) return;
  detailsRequested = true;
  details = (await import("virtual:language-details")).default;
  const node = selectedId ? data.byId.get(selectedId)?.data : undefined;
  if (node) renderDetail(node);
}
for (const type of ["pointerdown", "keydown", "focusin"] as const) {
  document.addEventListener(type, loadDetails, { once: true, passive: true });
}
svgEl.addEventListener("pointermove", loadDetails, { once: true, passive: true });
