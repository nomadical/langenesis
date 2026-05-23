# Langenesis

An interactive radial time-tree of the world's languages, rendered as a metro-map.

Each color is one language family. Radial distance is time — inner is older, outer is today. Click a language to see its full lineage from its proto-ancestor down through every historical stage to the modern form.

## Why

Almost every diagram of language evolution is either a static poster (beautiful but unsearchable) or a topology-only graph with no time dimension. Langenesis is interactive *and* time-aware: you can scrub through eras, jump to any language, and see its 5000-year lineage in two clicks.

## Status

10 families, 87 languages — Indo-European, Sino-Tibetan, Afro-Asiatic, Austronesian, Turkic, Japonic, Koreanic, Dravidian, Niger-Congo, Uralic. Each node has dates, a status (living / classical / extinct / reconstructed), at least one source, and most have a Glottolog code.

The dataset is hand-curated. Coverage is intentionally sparse but every entry is verifiable. Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## Run it locally

Requirements: Node 18+.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # vitest — validates every YAML + schema
npm run typecheck
npm run build    # production bundle in dist/
```

## How it works

- **Data**: `languages/<family>/<slug>.yaml`. One file per language node. The schema is in `src/data/schema.ts`.
- **Viz**: D3 radial tree with custom even-leaf angular distribution and a piecewise-linear time scale (so the modern era stays readable even when Proto-Niger-Congo at -10000 BCE is in the data).
- **Build**: Vite. YAML files are imported at build time via `import.meta.glob` and validated with Zod.
- **No backend**. The site is fully static and works on GitHub Pages.

## Project layout

```
languages/                yaml per language, grouped by family folder
src/
  data/                   schema, loader, tests
  viz/radial-tree.ts      D3 visualization
  main.ts                 UI: sidebar, search, detail panel, keyboard
public/style.css          all styling
tests/                    vitest — runs on every PR via CI
.github/workflows/        validate.yml (typecheck + tests)
.github/ISSUE_TEMPLATE/   issue forms (add language, correct date, …)
```

## License

- Code: **MIT** — see [LICENSE](LICENSE)
- Data (everything under `languages/`): **CC-BY-SA 4.0** — see [LICENSE-DATA](LICENSE-DATA)

When you contribute data, you agree to license it under CC-BY-SA 4.0.

## Acknowledgements

Seed data drawn from [Glottolog](https://glottolog.org/) (CC-BY 4.0), Wikipedia, and the scholarly references cited in each language's `sources` field.
