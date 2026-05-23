# Contributing to Langenesis

Thanks for wanting to help. The dataset lives in `languages/` as one YAML file per language node. Every file is validated by CI — schema, parent references, cycles, and source-required.

## Quick start

1. Fork and clone.
2. `npm install && npm run dev` — confirm the app starts.
3. Add or edit YAML files under `languages/<family>/`.
4. `npm test` and `npm run typecheck` — both must pass.
5. Open a PR. CI will re-run the checks.

## File location

```
languages/<family>/<slug>.yaml
```

- `<family>` is the top-level family folder name (e.g. `indo-european`, `sino-tibetan`).
- `<slug>` is the language id in kebab-case (matches the `id:` field).
- Folder structure beyond the family root is organizational only — the data model itself uses the `parents:` field, so you can nest files however reads best.

## Schema

```yaml
id: english                       # kebab-case, must match the filename slug
name: English                     # display name
glottocode: stan1293              # optional — 4 letters + 4 digits (Glottolog ID)
iso639_3: eng                     # optional — 3-letter ISO code
parents: [middle-english]         # array; >1 entry = creole / mixed language
period:
  start: 1500                     # year; negative = BCE
  end: present                    # year, or "present" for living languages
  start_uncertainty: 50           # optional, ± years
  end_uncertainty: 0              # optional, ± years
status: living                    # living | classical | extinct | reconstructed
speakers: 1500000000              # optional — used for sorting and tooltips
sources:                          # at least one URL is required
  - https://en.wikipedia.org/wiki/English_language
  - https://glottolog.org/resource/languoid/id/stan1293
notes: |                          # optional free-form prose
  Covers Early Modern English (1500–1700) and Modern English (1700–present).
```

## What makes a good entry

- **At least one source URL.** CI requires this; PRs with no sources are rejected.
- **Glottolog ID when available.** Look it up at [glottolog.org](https://glottolog.org/) — it's the canonical identifier.
- **Realistic dates.** For modern languages, use the conventional "Early Modern X" start (often around 1500). For proto-languages, cite scholarly estimates and note uncertainty in `start_uncertainty`.
- **Notes about controversies.** If dating is disputed (Proto-Afro-Asiatic, Proto-Niger-Congo, the Anatolian-vs-Kurgan PIE debate), put that in `notes:`.
- **Separate historical stages.** "Old English → Middle English → English" should be three nodes, not one node with a wide period. This is what makes the radial-time-tree look like a real evolution chart.

## Common contribution shapes

### Adding a modern language under an existing branch

Just add one file in the existing family folder, with `parents:` set to the appropriate ancestor:

```yaml
# languages/indo-european/germanic/swedish.yaml
id: swedish
name: Swedish
glottocode: swed1254
iso639_3: swe
parents: [proto-germanic]
period:
  start: 1500
  end: present
status: living
speakers: 10000000
sources:
  - https://en.wikipedia.org/wiki/Swedish_language
  - https://glottolog.org/resource/languoid/id/swed1254
notes: |
  North Germanic (East Scandinavian). Diverged from Old Norse via Old Swedish
  (~1225–1525) — intermediate stage not yet tracked.
```

### Adding a historical stage

To split an existing leaf into stages, change its `parents:` to point at the new intermediate, and add a file for the intermediate:

```yaml
# languages/indo-european/germanic/old-swedish.yaml — new
id: old-swedish
name: Old Swedish
parents: [proto-germanic]
period: { start: 1225, end: 1525 }
status: extinct
sources: [...]
```

Then in `swedish.yaml`, change `parents: [proto-germanic]` → `parents: [old-swedish]` and bump its `period.start` to `1525`.

### Adding a whole new family

1. Create `languages/<new-family>/proto-<family>.yaml` with `parents: []`.
2. Add daughter languages with that proto as their parent.
3. The viz will auto-assign a colour from the palette in `src/viz/radial-tree.ts:34`. If you add more than 10 families, extend that palette.

## What CI checks

- Every file parses as YAML.
- Every file matches the schema (`src/data/schema.ts`).
- Every `parents:` reference resolves to an existing node.
- No cycles in the tree.
- Every node has ≥1 source URL.
- Periods are within plausible bounds (-16000 ≤ start, end ≤ 2030).
- `id:` matches the filename slug.

## Code changes

For code changes (viz, UI, schema) — same flow but `npm test` must pass and `npm run typecheck` must be clean. Keep diffs small; if you're proposing a big restructure, open an issue first.

## Code of conduct

Be kind. Linguistic family classifications are often contested — disagreements should resolve to "cite both views in `notes:`", not arguments about who is right.
