# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The curious general public: language enthusiasts and anyone who has wondered where their own language came from. They usually arrive from a shared link, explore for a few minutes, search for the languages they speak, and follow a lineage back to its proto-ancestor. Visitors come in equal numbers on desktop and on phones.

Linguists and knowledgeable readers are a secondary audience. They take part as reviewers and contributors: they correct dates and classifications, and add languages through pull requests.

## Product Purpose

Langenesis is an interactive radial time-tree of the world's languages. It answers two questions at once: who descends from whom, and when. Visitors can search any language, see its full lineage from reconstructed proto-language to modern form, and browse how families branch across time.

Success means a visitor finds their language, understands its ancestry at a glance, and trusts what they see because every node can be checked against a source.

## Positioning

Most diagrams of language evolution are one of two things. Either they are static posters (beautiful, but you can't search them) or they are graphs that show topology with no time dimension. Langenesis is interactive *and* time-aware: radial distance is always years. The data behind it is open, hand-curated and cited, one YAML file per node, validated in CI.

It is also meant as a showcase of rendering a large, dense dataset smoothly in the browser.

## Operating Context

- Live at https://nomadical.github.io/langenesis/, deployed from `main` to GitHub Pages.
- Featured as a project on the author's site, nomadic.al (`src/content/projects/langenesis.md` in the `nomadic-al` repo).
- Contributions arrive through GitHub pull requests and issue forms (`.github/ISSUE_TEMPLATE/`: add language, correct date, report controversy). CI checks the schema, parent references, cycles and sources.

## Capabilities and Constraints

- Nodes are languages, historical stages (Old → Middle → Modern) and reconstructed proto-languages. Each carries a period, a status (living / classical / extinct / reconstructed), at least one source, and optional Glottolog and ISO 639-3 codes.
- Current coverage: 52 families and isolates, 690 nodes. The aim is every family with a million-plus speakers, plus notable isolates and attested stages. It is not exhaustive: Glottolog lists about 8,000 languoids.
- Mixed languages can have multiple parents; they are drawn as secondary edges.
- Fully static: no backend, no accounts, no tracking. The YAML is bundled at build time.
- Licences: code under MIT, data under CC-BY-SA 4.0.
- Open: how far to scale the dataset, and whether to lazy-load data once the bundle size matters.

## Brand Commitments

- Name: **Langenesis**. The concept is a metro map: each family is a coloured line, and historical stages are stations separated by gaps.
- Contested classifications resolve to "cite both views in `notes`", never to picking a side silently (see CONTRIBUTING.md).

## Evidence on Hand

- The dataset itself: `languages/**.yaml` (690 nodes with sources).
- README.md, CONTRIBUTING.md, and the live demo.
- No user testimonials, analytics, press or usage numbers exist. Do not fabricate any.

## Product Principles

1. **Every node is verifiable.** At least one source per node. Codes appear only where verified. Disputes are disclosed, never presented as settled.
2. **Time is the axis.** Radial distance always encodes years. Never trade it away for a layout that shows topology only.
3. **Static and private.** It stays a static bundle with no server, no accounts and no tracking.
4. **Open data grows through pull requests.** One YAML file per node under CC-BY-SA, validated by CI, with the community as editors.
5. **Rendering performance is a feature.** Optimise rendering as far as possible: the tree must stay smooth as the dataset grows, on desktop and phones alike.
