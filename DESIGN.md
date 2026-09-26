---
name: Langenesis
description: A radial metro map of language evolution, lit up at night.
colors:
  night: "#0a0d14"
  night-panel: "#131826"
  night-panel-raised: "#1a2030"
  ink-bright: "#fff"
  ink: "rgba(232, 236, 245, 0.95)"
  ink-dim: "rgba(232, 236, 245, 0.66)"
  ink-faint: "rgba(232, 236, 245, 0.52)"
  ink-ghost: "rgba(232, 236, 245, 0.2)"
  hairline: "rgba(255, 255, 255, 0.08)"
  hairline-strong: "rgba(255, 255, 255, 0.16)"
  era-ring: "rgba(180, 200, 230, 0.1)"
  era-ring-today: "rgba(180, 200, 230, 0.16)"
  signal-blue: "#7cc4ff"
  status-living: "#8fd6a3"
  status-extinct: "#c79bff"
  status-reconstructed: "#9aa6bd"
  status-classical: "#ffc97c"
  line-indo-european: "#5b9bd5"
  line-afro-asiatic: "#e15759"
  line-niger-congo: "#70ad47"
  line-sino-tibetan: "#edc949"
  line-austronesian: "#4cb3a3"
  line-dravidian: "#e89143"
  line-turkic: "#9b7bc4"
  line-uralic: "#7fcbe0"
  line-japonic: "#ff8ba0"
  line-koreanic: "#c49a6c"
typography:
  brand:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 650
    letterSpacing: "0.02em"
  headline:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "1.1875rem"
    fontWeight: 650
    lineHeight: 1.3
  body:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "0.84375rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    letterSpacing: "0.02em"
  map-label:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "12.5px"
    fontWeight: 500
  map-stage:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "11px"
    fontWeight: 500
  band-label:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "11px"
    fontWeight: 650
    letterSpacing: "0.09em"
  data:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "0.71875rem"
    fontWeight: 400
    fontFeature: "tnum"
  code:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.75rem"
rounded:
  xs: "3px"
  sm: "4px"
  md: "6px"
  lg: "8px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  search-input:
    backgroundColor: "{colors.night-panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "9px 34px"
  chip:
    backgroundColor: "{colors.night-panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "5px 10px 5px 9px"
  chip-hover:
    backgroundColor: "{colors.night-panel-raised}"
  family-row:
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "5px 8px"
  family-row-hover:
    backgroundColor: "{colors.night-panel}"
  family-row-active:
    backgroundColor: "{colors.night-panel-raised}"
  zoom-button:
    backgroundColor: "{colors.night-panel}"
    textColor: "{colors.ink-dim}"
    size: "34px"
  zoom-button-hover:
    backgroundColor: "{colors.night-panel-raised}"
    textColor: "{colors.ink}"
  status-pill:
    textColor: "{colors.status-living}"
    typography: "{typography.data}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
  tooltip:
    backgroundColor: "{colors.night-panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "8px 11px"
---

# Design System: Langenesis

## Overview

**Creative North Star: "The Night Transit Map"**

Langenesis is a metro map of time, lit up at night. Coloured lines run outward across a deep navy ground: each family is a line, each language a stretch of track, each historical stage a station separated by a small gap. Distance from the centre is always years, marked by faint dotted era rings. The map is the only loud thing on the screen.

The chrome around it is a quiet instrument panel: tonal layers of night navy, hairline borders, one signal-blue accent, and one system sans throughout. It exists to search, explain and navigate, never to compete with the lines. Density is high but calm. Labels appear only where they fit (level of detail), so the first view reads as major languages and family names, and detail arrives as you zoom.

Honesty is visual too. Reconstructed proto-languages are dotted because nobody ever wrote them down. Relationships between families that are not demonstrated are drawn as ghost hairlines, never as solid track.

**Key Characteristics:**
- Dark, tonal, flat chrome; colour is reserved for family lines and status.
- One sans family at product sizes (11–24px); numbers are tabular.
- The tree renders on canvas; text stays crisp in a screen-space SVG overlay at fixed pixel sizes.
- Motion conveys state only: one intro sweep, fast state fades, eased camera moves.

## Colors

Deep night navy surfaces, translucent ink for text, one signal blue for interaction, and a transit palette of saturated line colours that belongs to the map alone.

### Primary
- **Signal Blue** (`signal-blue`): the single interactive accent. Links, the focus ring, the search border on focus, the text caret, and text selection (at 30% opacity). Never used for decoration or for a family line.

### Tertiary
- **Transit lines** (`line-*`): hand-picked colours for the ten largest families, kept from the original metro palette. Every other family gets a generated HCL hue stepped by the golden angle (137.5°), so neighbours around the circle never share a colour. Families with five or more leaves use chroma 42 / lightness 72; smaller ones chroma 26 / lightness 66, so small families read as quieter lines.
- **Status tints** (`status-*`): Living (sage green), Extinct (lavender), Reconstructed (slate), Classical (amber). Used only as the status pill's text colour over a 14% tint of itself.

### Neutral
- **Night** (`night`): the page ground, flat and unlit. No gradients or glows behind the map; the lines are the only light.
- **Night Panel** (`night-panel`): inputs, chips, tooltips, zoom controls.
- **Night Panel Raised** (`night-panel-raised`): hover and active rows, scrollbar thumb.
- **Ink ramp** (`ink`, `ink-dim`, `ink-faint`, `ink-ghost`): one near-white at four opacities for primary text, secondary text, metadata, and ghost strokes such as root edges. `ink-faint` is the lowest opacity allowed for text: at 0.52 it clears 4.5:1 on every surface, including raised rows (4.7:1). `ink-ghost` is never used for text.
- **Hairlines** (`hairline`, `hairline-strong`): panel dividers and control borders.
- **Ink Bright** (`ink-bright`): pure white, only for the current item: the selected map label, the active family row, and the current stop on the lineage line.
- **Era Ring** (`era-ring`, `era-ring-today`): the dotted time rings, and the solid "Today" ring. The canvas reads these, and the ink tokens, from the stylesheet, so the map and the chrome never drift apart.

### Named Rules
**The Lines Own Colour Rule.** Saturated colour belongs to the map's family lines and to status. Chrome stays navy and ink; a coloured panel, button or heading is a mistake.

**The One Signal Rule.** Signal Blue marks what is interactive or focused, and nothing else.

## Typography

**Body Font:** system UI sans (`ui-sans-serif`, `system-ui`, with platform fallbacks)
**Code Font:** system monospace, only for ISO and Glottolog codes

**Character:** one familiar sans at product sizes, weight-driven hierarchy (400 / 500 / 600 / 650 / 700), tabular numerals wherever years or counts align. Chrome type is set in `rem`, so it follows the visitor's browser font size; map type is in `px` because the canvas layout measures it in pixels.

### Hierarchy
- **Brand** (650, 1rem, +0.02em): the "Langenesis" wordmark in the header, the page's `h1`.
- **Headline** (650, 1.5rem, 1.2, −0.01em): the selected language's name in the detail panel.
- **Title** (650, 1.1875rem, 1.3): the empty-state question, "Where did your language come from?"
- **Body** (400, 0.84375rem, 1.6): notes and intro copy in the detail panel.
- **Label** (600, 0.75rem, +0.02em, sentence case): section titles such as "Lineage", "Sources", "Families".
- **Map label** (500, 12.5px, with a 3.5px night-coloured halo): leaf language names on the tree, radial, reading outward.
- **Map stage** (500 italic, 11px, ink-dim): historical stages and proto-languages beside their arc; they appear from about 1.9× zoom.
- **Band label** (650, 11px, +0.09em, uppercase): family names set along the outer band in the family colour.
- **Data** (400, 0.71875rem, tabular): periods, counts, tooltip metadata.

### Named Rules
**The Fixed Pixel Rule.** Map text never scales with zoom. Labels keep their pixel size, and level of detail decides which ones appear.

**The No Eyebrow Rule.** Section titles are sentence-case labels. There are no uppercase kickers above headings; uppercase is reserved for band labels on the map.

## Layout

A full-viewport app shell: header, a three-column main area, and a footer bar, with the page itself never scrolling.

- **Desktop (>1180px):** a 250px left panel (legend + family list), the map in the middle, a 340px detail panel. The header is a three-column grid with the search centred (240–420px).
- **Medium (≤1180px):** columns tighten to 210px / 300px, and the brand tagline hides.
- **Mobile (≤860px):** the left panel hides, the map fills the width, and the detail panel docks below it at up to 38vh. The header keeps the brand mark and search. Zoom controls stay bottom-right.
- **Map geometry:** tree radius 440 units, inner radius 56; an 18° empty wedge at 12 o'clock holds the era labels; 1.8 leaf-slots of padding separate families. The scale is solved from the viewport, so the leaf labels and family band always fit at zoom 1.
- **Touch:** on coarse pointers every control has a 44px tap area. Zoom buttons and search grow to 44px; chips keep their look and extend an invisible hit area.
- **Rhythm:** tight groups (6–10px), generous separation (24–28px between panel sections), more space above a section title than below.

## Elevation & Depth

Flat by default. Depth comes from tonal layering (night → panel → raised) and hairline borders. Shadows appear only on floating layers that sit above the map: the autocomplete list, the tooltip and the zoom controls. They are soft, dark and offset downward, never coloured glows.

### Shadow Vocabulary
- **Float** (`box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5)`): the autocomplete list.
- **Tooltip** (`box-shadow: 0 6px 18px rgba(0, 0, 0, 0.5)`): hover tooltips.
- **Control** (`box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35)`): the zoom control stack.

### Named Rules
**The Map Has No Shadows Rule.** Emphasis on the map comes from stroke width, opacity and draw order, never from glows or drop shadows.

## Shapes

Gently rounded, never soft. Controls use 6–8px corners (`md`, `lg`), small tags 3–4px (`xs`, `sm`), and only chips and the lineage track are fully round (`pill`). No other radii. Family swatches and stops are perfect circles. On the map, arcs have round caps; reconstructed arcs are round dots (stroke dash 0.1 × 5.5 units), secondary edges for mixed languages are dashes, and root edges are dotted one-pixel hairlines.

## Components

### Search
Quiet and central.
- **Shape:** gently rounded (`lg`), with the magnifier icon inset at the left and a `/` key hint at the right that hides on focus or input.
- **Default:** night panel with a strong hairline border.
- **Focus:** Signal Blue border plus a 3px Signal Blue ring at 15%.
- **Results:** a floating list (Float shadow). Each row shows the family dot, the name and a tabular period. The active row is raised; prefix matches rank first, then prominence. Empty results say so in plain words.

### Chips
- **Style:** night panel, strong hairline, fully round, with a 7px family-colour dot before the name.
- **Hover:** the border takes the family colour and the background raises.
- **Use:** starter languages in the empty state and descendants in the detail panel.

### Family Rows
- **Style:** full-width transparent buttons with a 10px colour swatch, the family name, and a tabular leaf count.
- **Hover / Focus:** night panel background; the map dims every other family.
- **Active:** raised background, white semi-bold name.

### Zoom Controls
- **Style:** a vertical stack of three 34px icon buttons (in, out, fit) in one rounded container with hairline separators and the Control shadow. Icons are 1.6px-stroke line drawings.
- **Hover:** raised background, ink text.

### Status Pill
- **Style:** 11.5px semi-bold text in the status colour over a 14% tint of the same colour, `sm` radius. There are four variants: Living, Extinct, Reconstructed, Classical.

### Tooltip
- **Style:** night panel at 97%, strong hairline, `lg` radius, Tooltip shadow. Mouse-only and hidden from assistive technology; the detail panel carries the same facts. Name (600), period (tabular, ink-dim), status and speakers (ink-faint), and the family with its dot.
- **Motion:** a 120ms fade with a 4px rise.

### Lineage Line (signature)
The detail panel draws the selected language's ancestry as a metro line.
- **Track:** 3px, family colour at 55%, top to bottom from the oldest ancestor.
- **Stops:** 11px rings with a 2.5px family-colour border on night; reconstructed stops are dotted; the current language's stop is filled.
- **Text:** stop name (a Signal Blue link, or white semi-bold for the current language) above a tabular period.

### The Map (signature)
- **Arcs:** 2.8 units at zoom 1; hover 5, lineage 4.5, selected 6.5. On screen they grow with zoom^0.7.
- **Edges:** 1.2 units at 85%; lineage 2.4 at full strength.
- **Focus mode:** a selection dims other families to 12% (arcs) and 8% (edges), keeps the same family at 60% / 45%, and draws the lineage at full strength on top. Hovering a family dims the others to 10%.
- **Family band:** a 3-unit ring outside the leaf labels in each family colour. Hover brings it to full opacity; click zooms to the family.
- **Intro:** arcs sweep outward, staggered 60ms per depth level (420ms, cubic ease-out). This is the only choreographed moment, and it is skipped under reduced motion.
- **Keyboard:** the map is focusable (Signal Blue inset ring). Arrow keys walk the tree (left/right siblings in clockwise order, up to the parent, down to the first descendant, Home to the family), `+`/`-` zoom, `0` resets. Each selection is announced as one short sentence through a polite live region, never the whole panel.

## Do's and Don'ts

### Do:
- **Do** keep chrome in the navy tonal layers with hairline borders; let the family lines carry the colour.
- **Do** use Signal Blue only for links, focus, the caret and selection.
- **Do** keep map text at fixed pixel sizes (12.5px leaves, 11px stages, 11px band) and let level of detail decide what shows.
- **Do** draw reconstructed proto-languages dotted and undemonstrated relationships as ghost hairlines.
- **Do** use tabular numerals for every year, period and count.
- **Do** keep state transitions at 120–180ms ease-out and camera moves at 550–750ms cubic in-out. Under `prefers-reduced-motion`, keep colour and opacity feedback and drop anything that travels.

### Don't:
- **Don't** add glows, drop shadows or gradients to the map or the page behind it.
- **Don't** use a family line colour for chrome, buttons or headings.
- **Don't** put uppercase eyebrow labels above headings; uppercase is for band labels only.
- **Don't** scale label text with zoom or show labels that collide.
- **Don't** add decorative motion; each animation must convey a state change.
