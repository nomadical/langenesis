import { loadData } from "./data/loader";
import { type LanguageNode } from "./data/schema";
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

const data = loadData();
const nodeCount = [...data.byId.values()].filter(
  (n) => n.data.id !== "__root__",
).length;
statusEl.textContent = `${nodeCount} languages`;

let selectedId: string | null = null;
let acIndex = -1;
let acMatches: LanguageNode[] = [];

const handle: RadialTreeHandle = renderRadialTree(svgEl, data, {
  onNodeHover(node, event) {
    if (!node || !event) {
      tooltipEl.hidden = true;
      return;
    }
    tooltipEl.hidden = false;
    const famId = data.familyOf.get(node.id);
    const famName = famId
      ? data.families.find((f) => f.id === famId)?.name
      : null;
    tooltipEl.innerHTML = `
      <div class="tooltip-name">${escapeHtml(node.name)}</div>
      <div class="tooltip-period">${formatPeriod(node)}</div>
      ${famName && famName !== node.name ? `<div class="tooltip-family">${escapeHtml(famName)} branch</div>` : ""}
    `;
    positionTooltip(event);
  },
  onNodeClick(node) {
    setSelection(node?.id ?? null);
  },
});

function setSelection(id: string | null, opts: { resetZoom?: boolean } = {}) {
  selectedId = id;
  handle.select(id);
  handle.setLineage(id);
  if (id) {
    const node = data.byId.get(id)?.data;
    if (node) renderDetail(node);
    // Always zoom to fit the full lineage when selecting from any source.
    handle.focusNode(id);
  } else {
    renderDetail(null);
    if (opts.resetZoom !== false) handle.resetZoom();
  }
  updateFamilyActive();
}

function updateFamilyActive() {
  for (const li of familiesEl.querySelectorAll("li")) {
    const id = (li as HTMLElement).dataset.id;
    li.classList.toggle("active", id === selectedId);
  }
}

// Render family list in sidebar — clicking jumps to that family's root.
function renderFamilies() {
  familiesEl.innerHTML = "";
  for (const fam of data.families) {
    const li = document.createElement("li");
    li.dataset.id = fam.id;
    const swatch = document.createElement("span");
    swatch.className = "family-swatch";
    swatch.style.background = handle.familyColor(fam.id);
    const name = document.createElement("span");
    name.textContent = fam.name;
    li.append(swatch, name);
    li.addEventListener("click", () => jumpToFamily(fam.id));
    familiesEl.appendChild(li);
  }
}
renderFamilies();

function jumpToFamily(id: string) {
  setSelection(id);
}

// ============ Detail panel ============
function renderDetail(node: LanguageNode | null) {
  if (!node) {
    detailBody.innerHTML = `
      <div class="placeholder">
        <div class="placeholder-icon">⟡</div>
        <p>Click a language in the tree to see its lineage, dates, and sources.</p>
      </div>
    `;
    return;
  }

  const rows: string[] = [];
  rows.push(`<dt>Status</dt><dd><span class="pill">${node.status}</span></dd>`);
  if (node.glottocode) rows.push(`<dt>Glottocode</dt><dd>${node.glottocode}</dd>`);
  if (node.iso639_3) rows.push(`<dt>ISO 639-3</dt><dd>${node.iso639_3}</dd>`);
  if (node.speakers !== undefined)
    rows.push(`<dt>Speakers</dt><dd>${node.speakers.toLocaleString()}</dd>`);
  if (node.parents.length > 0) {
    const parentLinks = node.parents
      .map((p) => {
        const parentNode = data.byId.get(p)?.data;
        if (!parentNode) return p;
        return `<a class="link" data-jump="${escapeAttr(p)}">${escapeHtml(parentNode.name)}</a>`;
      })
      .join(", ");
    rows.push(`<dt>Parent${node.parents.length > 1 ? "s" : ""}</dt><dd>${parentLinks}</dd>`);
  }

  const children = [...data.byId.values()]
    .filter((n) => n.data.parents[0] === node.id)
    .map((n) => n.data);
  if (children.length > 0) {
    const childLinks = children
      .map((c) => `<a class="link" data-jump="${escapeAttr(c.id)}">${escapeHtml(c.name)}</a>`)
      .join(", ");
    rows.push(`<dt>Descendants</dt><dd>${childLinks}</dd>`);
  }

  const sources = node.sources
    .map(
      (s) =>
        `<a href="${escapeAttr(s)}" target="_blank" rel="noopener">${escapeHtml(s)}</a>`,
    )
    .join("");

  detailBody.innerHTML = `
    <h2>${escapeHtml(node.name)}</h2>
    <div class="period">${formatPeriod(node)}</div>
    <dl>${rows.join("")}</dl>
    ${node.notes ? `<div class="notes">${escapeHtml(node.notes)}</div>` : ""}
    ${sources ? `<div class="sources"><div class="sources-title">Sources</div>${sources}</div>` : ""}
  `;

  // Wire up jump-to-related-node links
  detailBody.querySelectorAll<HTMLAnchorElement>("a[data-jump]").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const id = a.dataset.jump!;
      setSelection(id);
    });
  });
}

// ============ Autocomplete ============
let searchDebounce: number | undefined;
searchEl.addEventListener("input", () => {
  if (searchDebounce !== undefined) window.clearTimeout(searchDebounce);
  searchDebounce = window.setTimeout(updateAutocomplete, 80);
});
function updateAutocomplete() {
  const q = searchEl.value.trim();
  if (!q) {
    hideAutocomplete();
    return;
  }
  acMatches = handle.search(q).slice(0, 6);
  acIndex = acMatches.length > 0 ? 0 : -1;
  if (acMatches.length === 0) {
    hideAutocomplete();
    return;
  }
  acEl.innerHTML = "";
  acMatches.forEach((node, i) => {
    const li = document.createElement("li");
    li.dataset.idx = String(i);
    if (i === acIndex) li.classList.add("active");
    li.innerHTML = `
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
}
function hideAutocomplete() {
  acEl.hidden = true;
  acEl.innerHTML = "";
  acMatches = [];
  acIndex = -1;
}
function setAcIndex(i: number) {
  acIndex = i;
  acEl.querySelectorAll("li").forEach((li, idx) => {
    li.classList.toggle("active", idx === i);
  });
}
function pickAutocomplete(i: number) {
  const node = acMatches[i];
  if (!node) return;
  setSelection(node.id);
  searchEl.value = node.name;
  hideAutocomplete();
  searchEl.blur();
}

searchEl.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    if (acMatches.length === 0) return;
    setAcIndex((acIndex + 1) % acMatches.length);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    if (acMatches.length === 0) return;
    setAcIndex((acIndex - 1 + acMatches.length) % acMatches.length);
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (acIndex >= 0) pickAutocomplete(acIndex);
  } else if (e.key === "Escape") {
    if (!acEl.hidden) {
      hideAutocomplete();
    } else {
      searchEl.value = "";
      searchEl.blur();
    }
  }
});

// Hide autocomplete on outside click
document.addEventListener("click", (e) => {
  if (!(e.target instanceof Node)) return;
  if (!searchEl.contains(e.target) && !acEl.contains(e.target)) {
    hideAutocomplete();
  }
});

// ============ Global keyboard ============
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && document.activeElement !== searchEl) {
    if (selectedId !== null) setSelection(null);
  }
});

// ============ Tooltip positioning ============
document.addEventListener("mousemove", (event) => {
  if (!tooltipEl.hidden) positionTooltip(event);
});

function formatPeriod(node: LanguageNode): string {
  const start = formatYear(node.period.start);
  const end = node.period.end === "present" ? "present" : formatYear(node.period.end);
  return `${start} – ${end}`;
}
function formatYear(y: number): string {
  if (y < 0) return `${-y} BCE`;
  if (y === 0) return "0";
  return `${y} CE`;
}
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
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}
