# Pinned workflows — the substitution contract

These four JSONs are the **only** graphs the MCP server ever submits (API format, `POST /prompt`
with `{"prompt": <graph>}`). The server substitutes values into the node inputs listed below —
addressed **by node id** — and never edits the graph structure. Nodes carrying substitutions are
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
