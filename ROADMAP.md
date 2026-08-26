# Roadmap — v0.1.0, "prove the loop"

The initial release is done when the full loop from [`CLAUDE.md`](CLAUDE.md) runs end to end on
real table art:

> prompt → draft batch (klein) → Claude curates the PNGs → final render (dev) → upscale pipeline
> → `upload-asset` → art visible in the live Foundry world via molten5e.

Everything below serves that gate. LoRA house style, SDXL fallback, and Qwen text props are
**deliberately deferred** past 0.1 — see [Deferred](#deferred-post-01).

---

## M0 — Environment bring-up (ComfyUI + models)

Goal: headless ComfyUI generating with both FLUX models on the 5090.

- Install the **ComfyUI standalone Windows build** into `D:\Workbench\LOCAL\LocalAI` (locked
  2026-08-26); verify the embedded torch is a **CUDA 12.8+ build** (Blackwell / `sm_120` kernels —
  first-run smoke test, not assumption).
- Launch convention: headless API mode, `--listen 127.0.0.1`, pinned port, `--disable-auto-launch`,
  `--output-directory` pointed at a known artificer output root (simplifies file handoff — the MCP
  server reads outputs straight off disk, no `/view` fetches).
- Model downloads — **each needs per-download approval (file, source, size)**, per house rule:

  | file | source | ~size | role |
  | --- | --- | --- | --- |
  | `flux1-dev-fp8.safetensors` (all-in-one) | Comfy-Org repackage (ungated) | ~17 GB | final renders |
  | FLUX.2-klein checkpoint + its text encoder | Comfy-Org repackage — **verify current files/sizes at download time** | ~5–10 GB | draft batches |
  | `4x-UltraSharp.pth` | upscale-model hub | ~67 MB | model upscale |

  **fp8 all-in-one dev is locked** (2026-08-26): one file, `CheckpointLoaderSimple`, hardware fp8
  speed on Blackwell; the bf16 split-file upgrade path stays open if an M1 A/B ever shows a visible
  difference. v0.1 total ≈ **25–30 GB**, well under the 60–100 GB budget.
- Exit gate: one klein image and one dev image rendered headless via the HTTP API; timings and
  VRAM headroom recorded in the repo notes.

## M1 — Pin the workflow JSONs

Goal: the 2–3 pinned graphs the server will substitute into — **never free-form graphs**.

- `workflows/draft.json` — klein, 4-step, **batch 6–8**, generated at the preset's native res
  (klein is fast enough that drafts render at full 1536×960 — keeps composition judgments honest).
- `workflows/final.json` — dev at native res → 4x-UltraSharp → downsample, in **one graph**, so a
  single call yields the finished preset resolution (e.g. 1536×960 → ×4 → 2560×1600).
- `workflows/upscale.json` — the upscale tail alone, for finishing an already-picked image.
- Settle the **draft→final composition question**: seeds don't transfer between klein and dev, so
  test both re-render strategies — fresh dev txt2img from the refined prompt, vs **img2img over
  the winning draft** at ~0.5–0.7 denoise to preserve composition. Whichever wins becomes a
  `final.json` mode.
- Lock the exact preset dimensions (`portrait` and `token` gen/output sizes; handout is already
  locked at 1536×960 → 2560×1600).
- Substitution contract documented: which node inputs take prompt / seed / batch / dimensions /
  `filename_prefix`, addressed by node title. `filename_prefix` gets a per-job id so the server
  finds its outputs deterministically — no directory-scan races.
- Exit gate: all three JSONs committed, each proven by manual API submission.

## M2 — The MCP server

Goal: the tools, built to the family bar.

- **Stack mirrors molten5e**: Node 22+ / TypeScript, `@modelcontextprotocol/sdk` over stdio, zod
  schemas → generated JSON Schema, `registry.ts` as the single source of truth, vitest + biome +
  knip. One seam: `src/comfy.ts` (submit, await via WS, collect files) — nothing else touches HTTP.
- **Tool surface (resist sprawl — three tools):**

  | tool | contract |
  | --- | --- |
  | `generate-image` | `kind` (preset: `handout` / `scene-background` / `portrait` / `token`), `prompt`, `mode` (`draft` batch / `final`), optional `seed`, optional source image for img2img refine |
  | `upscale-image` | path in → finished preset-resolution PNG out |
  | `artificer-status` | ComfyUI reachable, models present, VRAM/queue state — cold-start diagnosability |

- **Output convention locked** (2026-08-26): `art/<kind>-<slug>-<seed>.png` (kebab-case,
  kind-prefixed — matches the campaign repo's existing `maps/map-greenrest-01.jpg` style), so
  generate → curate → upload needs no glue.
- Tests: offline unit suite (substitution correctness, preset dimensions, filename conventions,
  registry surface guard); live ComfyUI suite gated like molten5e's integration tests.
- Exit gate: build green, tests green, `.mcp.json.example` committed, registered at **user scope**
  (owner restarts Claude Code — the session can't).

## M3 — Prove the loop

Goal: the release gate itself, on real art.

- Run the full loop for **one handout, one portrait, one token**: prompt → draft batch → curation
  by reading the PNGs → final render → `upload-asset` → `add-journal-image` / `set-actor-art` in
  the live world.
- Record model-switch latency (klein ↔ dev swap cost on 32 GB VRAM / 96 GB RAM) and per-image
  timings; fold anything surprising back into the workflows.
- Exit gate: the three finished pieces visible in Foundry, loop notes committed.

## M4 — Release hygiene → tag `v0.1.0`

- README graduates from greenfield: Requirements / Build / Wire into Claude Code / Configuration /
  Tools sections in the family format; 🚧 callout comes down.
- `.env.example` (`COMFY_URL`, output root), final `npm test` / `typecheck` / `check` pass.
- Tag `v0.1.0`.

---

## Deferred (post-0.1)

- **House-style LoRAs baked into presets** — needs a generated corpus to judge taste against;
  premature before the loop exists (CLAUDE.md setup step 5).
- **SDXL fine-tune fallback** (painterly LoRAs FLUX doesn't cover) and **Qwen-Image** text-props —
  each is a new checkpoint download + workflow; add when a real table need arrives.
- **`illustration-builder` skill** — the judgment layer (prompt craft, curation taste, house
  style). Tools ship first; the skill grows once there's a loop to exercise.

## Risks & watch items

- **Blackwell torch mismatch** — a portable build with pre-12.8 CUDA wheels fails on `sm_120`;
  M0's first smoke test exists to catch this, fallback is a cu128/cu129 nightly torch swap.
- **FLUX.2-klein support surface** — Comfy-Org repackage filenames, text-encoder weights, and true
  VRAM footprint verified at M0, not assumed from the model card.
- **Draft→final composition drift** — the M1 img2img-refine test is the mitigation; if neither
  strategy preserves picks well, curation shifts to "pick the prompt direction" rather than "pick
  the image", which the tool contract already tolerates.
- **Output discovery** — per-job `filename_prefix` from day one; never infer ownership of files
  from timestamps.
