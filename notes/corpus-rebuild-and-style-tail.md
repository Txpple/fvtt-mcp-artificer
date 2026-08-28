# Corpus rebuild + the universal style tail (2026-08-27)

## The corpus rebuild (owner-led)

The 133-plate corpus was four art directions wearing one trigger word — Elmore-adjacent oil,
pastel storybook, airbrushed digital, comic whimsy — and the LoRA learned the blur. The owner
hand-picked 65 from the 858-plate pool; joint review cut it to **46** (comic/whimsical plates,
book covers, a rules diagram, an undersized plate, pastel outliers, and two per-plate calls).

- **Canonical location: `D:\Workbench\LOCAL\LocalAI\lora-corpus-dnd24art\prepared\`** (46 PNG +
  46 caption .txt). The Desktop working folders and `Z:\Shared\TableArt` are gone — this is the
  only copy. The old Desktop corpus path in configs A–C is dead.
- **12 artist signatures found** (11 by corner-sheet review + `phb-ranger` caught by the owner).
  All sat in the bottom ~3%, so every plate carries a blanket **8% bottom crop**. Detection was
  tried and rejected: a validated detector caught 12/12 knowns only at a threshold that flags
  half the corpus on foliage texture — recall yes, precision no. The crop is the guard.
- Captions written **from the images** (median 54 words, no style words — content only, so the
  undescribed style lands on the `dnd24art` trigger). The tighter corpus is what makes that
  caption strategy work: the undescribed remainder is finally consistent.
- Known residual skews: **dark** (mean lum 0.31; only ~4 daylight plates — expect the LoRA to
  fight daylight prompts), **magical-glow key light** (~15 plates — expect added glow), zero
  square-aspect plates. Fix by backfilling bright/richly-painted plates if it bites.
- Honest scope: this corpus buys "serious dramatic 2024-sourcebook," not actual Elmore.
  `dragonlance-inn` is the only true warm-oil plate. Real Elmore needs older-book scans.

## Overnight runs D + E (`training/run-overnight.sh`, ~4.8 h)

| Run | Rank | LR | Steps |
| --- | --- | --- | --- |
| D | 8 | 1e-4 | 4000 |
| E | 16 | 1e-4 | 4000 |

Rank is the proven lever (A/B/C evidence); tighter corpus → test lower still. Sample prompts now
state gender outright (the run-C lesson). **Stop ComfyUI first.**

## The universal style tail (v0.4.0 — shipped, restart pending)

Problem: the LoRA is FLUX.1-only; `draft`/`scene` are FLUX.2 — the weights cannot load there.
Fix: **every mode can end with a FLUX.1-dev low-denoise refine pass carrying the LoRA.**

- `workflows/final-lora.json` — final + `LoraLoaderModelOnly` (proven verbatim, 18 s).
- `workflows/final-refine-lora.json` — refine + LoRA + **input normalize to gen dims** (node 13,
  so finished 2560×1600 scene output re-samples at composition res, not 4 MP). Proven verbatim.
- `generate-image` gains `lora` + `loraStrength` (final/refine only, guarded), refine `denoise`
  floor lowered 0.3 → 0.1. Styling scene output = mode `refine` + `lora` + denoise 0.25–0.4
  over the finished render. **Schema change ⇒ owner must restart Claude Code.**

### Spike evidence (run-C LoRA over the approved displacer-alpha scene render)

Four tail passes (control / d0.25 s1.0 / d0.35 s1.0 / d0.35 s0.7), ~20 s each: composition
pixel-faithful, Thomas's face recognizably him at every setting, LoRA pass reads warmer/more
painted than control. Mechanism validated; judgment on style strength waits for the D/E LoRAs.
Not yet tested: nonhuman faces through the tail (Morgash's tusks — cookbook says dev img2img
humanizes; test at 0.25 before trusting it on him).

## Status change (owner, later this same day)

**No approved images exist anywhere.** The five staged portraits survive only as
backup/reference (identity refs for scene conditioning); every staged handout was deleted from
the campaign repo. Campaign art restarts from zero once the D/E LoRA + style tail are validated.

## WDAC blocks bitsandbytes (2026-08-27 evening)

Runs D/E both crashed at import: `OSError: [WinError 4551] An Application Control policy has
blocked this file` on the bitsandbytes native DLL. New since runs A–C, which used the same
`adamw8bit` setting successfully — this is a **machine policy change, not a code regression**
(same family as the uv-CPython `_ctypes` block already in memory). Fix: `optimizer: adamw` in
both configs (commit `a80bd54`).

What it actually costs — measured, not guessed:

- **Quality: nothing.** fp32 AdamW is the exact version; `adamw8bit` is the quantized
  approximation of it. Caveat for the comparison: D/E now differ from A–C in optimizer as well
  as rank, so they are not perfectly controlled against the older runs. Rank conclusions still
  hold *within* the D-vs-E pair.
- **VRAM: ~260 MB (rank 8) / ~500 MB (rank 16).** Run C's rank-16 LoRA is 172 MB bf16 ⇒ ~86 M
  trainable params; two fp32 optimizer states = ~690 MB vs ~172 MB at 8-bit (C's `optimizer.pt`
  was 175 MB, which confirms the arithmetic). **The `a80bd54` commit message says "a few MB" —
  that is wrong by ~100×.** Irrelevant in practice: run D sits at 24.2 / 32.6 GB.
- **Speed: run D is ~2.9 s/it vs run C's ~2.1 s/it**, so D+E is ~6 h, not 4.8 h. Cause not
  isolated — could be fp32 optimizer memory traffic, could be different aspect buckets in the
  rebuilt corpus (8% bottom crop, no square plates). Do not attribute it without a test.
- **Model quantization is unaffected** — `quantize: true` still works, so ai-toolkit routes that
  through torchao/quanto rather than bitsandbytes.

## Open items

1. Owner deletes the Desktop working folders (confirmed safe; training copy is canonical).
2. Tonight: stop ComfyUI, run `training/run-overnight.sh`.
3. Tomorrow: pick run/checkpoint/strength through the real pipeline (final + tail at several
   strengths, beside the reference portraits) — 20-step preview judging is banned (run-A lesson).
4. Wire the winner's filename into the presets/skill; owner restarts Claude Code for the schema.
5. Old corpus keepsakes: runs A/B/C checkpoints stay in `ai-toolkit\output\` until D/E beat them.
