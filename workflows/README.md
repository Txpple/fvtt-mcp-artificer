# Pinned workflows — the substitution contract

These six JSONs are the **only** graphs the MCP server ever submits (API format, `POST /prompt`
with `{"prompt": <graph>}`). The server substitutes values into the node inputs listed below —
addressed **by node id** — and never edits the graph structure, with ONE documented exception:
the reference workflows' unused reference slots are pruned (see draft-ref below). Nodes carrying substitutions are
marked with a `SUB:` `_meta.title` in the files. Committed defaults double as the proof inputs:
every file here has been submitted verbatim and rendered successfully (see
[`notes/m1-workflows.md`](../notes/m1-workflows.md)).

## Preset dimensions (locked 2026-08-26)

| kind | generate | final output |
| --- | --- | --- |
| `handout` / `scene-background` | 1536×960 | 2560×1600 |
| `portrait` | 1024×1280 | 2048×2560 |
| `token` | 1024×1024 | 2048×2048 |

All generate dims are 16-divisible (a `EmptyFlux2LatentImage` requirement). Final output is
always generate → 4x-UltraSharp (×4) → lanczos downsample, per the locked resolution pipeline.

## draft.json — klein, 4-step, batched

| node | field | meaning |
| --- | --- | --- |
| 4 | `text` | prompt |
| 5 | `width`, `height`, `batch_size` | preset gen dims; batch 6–8 for curation |
| 8 | `width`, `height` | **must match node 5** (scheduler shifts sigmas by resolution) |
| 6 | `noise_seed` | seed |
| 12 | `filename_prefix` | per-job id — how the server finds its outputs |

## draft-ref.json — klein with FLUX.2 reference conditioning (party scenes)

Same as draft.json plus up to **five identity-reference slots** (nodes 20–23, 30–33, 40–43,
50–53, 60–63: LoadImage → downscale 512×640 → VAEEncode → `ReferenceLatent`, chained into the
conditioning). Proven 2026-08-26: with the canonical party portraits as references, four
identities hold in one scene. **Steps are pinned at 6** — 4 steps merges characters.

Upload each reference first (`POST /upload/image`) and substitute the returned names into the
slot `LoadImage` nodes **in binding order** (the prompt should describe each referenced character
with an unmistakable phrase, same order). The builder **prunes unused slots** — deleting their
four nodes and rewiring node 9's conditioning to the last used slot's `ReferenceLatent` — the one
structural edit the contract allows, covered by `workflows.test.ts`.

| node | field | meaning |
| --- | --- | --- |
| 4 | `text` | prompt (with per-reference binding phrases) |
| 20/30/40/50/60 | `image` | uploaded reference names, in binding order |
| 5 | `width`, `height`, `batch_size` | preset gen dims |
| 8 | `width`, `height` | must match node 5 (steps stay 6) |
| 6 | `noise_seed` | seed |
| 12 | `filename_prefix` | per-job id |

## scene.json — FLUX.2-dev fp8 with references + upscale tail (the scene finisher)

The quality tier for referenced scenes (~80 s warm on the 5090; the 33 GB model streams its VRAM
overflow from RAM). **Identical slot layout and pruning rules as draft-ref.json** (slots 20–63,
prune + guider rewire), plus **steps pinned at 24 with no turbo LoRA** (owner call 2026-08-26 —
the 10-step turbo pass visibly cost coherence) and the 4x-UltraSharp tail (nodes 70–72) so one
call yields the finished output resolution. Extra substitution over draft-ref: node **72**
`width`/`height` (preset output dims). Typical use: klein `draft-ref` to explore, then re-render
the chosen direction here with the same references — and mind the composition rules in the
illustration-builder skill (tight cast; the full-party group shot is the hardest case, not the
default).

## final.json — dev fp8 txt2img + upscale tail, one graph

| node | field | meaning |
| --- | --- | --- |
| 2 | `text` | prompt |
| 5 | `width`, `height` | preset gen dims |
| 6 | `seed` | seed |
| 10 | `width`, `height` | preset final output dims |
| 11 | `filename_prefix` | per-job id |

## final-refine.json — dev fp8 img2img over a picked draft + upscale tail

Upload the picked draft first (`POST /upload/image`, multipart `image=@file`); substitute the
returned `name`.

| node | field | meaning |
| --- | --- | --- |
| 2 | `text` | prompt |
| 5 | `image` | uploaded draft filename |
| 7 | `seed` (and optionally `denoise`) | denoise pinned 0.7 by the M1 test — keeps the draft's scene skeleton, re-renders in dev style; 0.55 clones composition but inherits klein's style |
| 11 | `width`, `height` | preset final output dims |
| 12 | `filename_prefix` | per-job id |

## upscale.json — upscale tail alone (finish an existing image)

| node | field | meaning |
| --- | --- | --- |
| 1 | `image` | uploaded input filename (same upload flow) |
| 4 | `width`, `height` | target output dims |
| 5 | `filename_prefix` | per-job id |
