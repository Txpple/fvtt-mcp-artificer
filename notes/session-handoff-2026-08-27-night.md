# Handoff — sweep complete, 2026-08-28 04:08

The three-run rank sweep finished overnight with no failures. Read
`corpus-rebuild-and-style-tail.md` for the plan and the judging protocol.

## What landed

| Run | Rank | Final weights | Checkpoints | Wall |
| --- | --- | --- | --- | --- |
| D | 8 | 82 MB | 8 (500…3500 + final) | 20:42 → 23:16 |
| E | 16 | 164 MB | 8 | 23:16 → 01:41 |
| F | 32 | 328 MB | 8 | 01:41 → 04:08 |

In `D:\Workbench\LOCAL\LocalAI\ai-toolkit\output\dnd24art-{D,E,F}-*`. All three trained on the
rebuilt 46-plate corpus, `adamw`, lr 1e-4, 4000 steps, `alpha == rank`. Rank is the only free
variable, so conclusions drawn *within* this sweep are valid.

**24 candidate LoRAs** (3 ranks × 8 checkpoints). ComfyUI is running again on 127.0.0.1:8188.

## Judging — the actual task

1. Copy candidates into ComfyUI `models\loras\`. Start with **rank × {2000, 3000, final}**;
   46 images × 4000 steps is ~87 epochs, so the final weights are the *most* likely to be
   overfit, not the best.
2. **Always render a no-LoRA control in the same batch.** The run-A lesson: half the "LoRA
   defects" (walrus tusks, fake watermarks) came from base FLUX and were only identifiable
   once a control existed.
3. **Judge at final quality through the real pipeline**, at table sizes. 20-step previews and
   the training samples are not evidence — that rule is what produced three wrong conclusions
   on the first attempt.
4. Probe the corpus's known skews: **dark** (mean lum 0.31, ~4 daylight plates) and
   **magical-glow key light** (~15 plates). If daylight scenes come out murky that is the
   corpus, and the fix is backfilling bright plates, not changing rank.
5. Wire the winner into the presets/skill. `generate-image` already has `lora` / `loraStrength`
   on final/refine as of v0.4.0.

## Machine notes from the night

- **bitsandbytes is blocked by Application Control** (WinError 4551) ⇒ `optimizer: adamw`.
  Harmless error line at every run start.
- **Stopping a wrapper does not kill the trainer python**, and a stopped wrapper can still
  advance to its next config. Verify with `Get-Process python` before launching anything.
- **A leftover `output/<run>/` dir makes ai-toolkit resume, not restart.** The runner now skips
  such configs instead of doing it silently.
- Junk safe to delete: `output\dnd24art-{D,E}-*.aborted-20*`, and the **void A/B/C runs**
  (bad corpus, owner's verdict) if the disk is wanted back.

## Judged and locked (2026-08-28 morning)

**Winner: run F (rank 32) @ step 2000, strength 1.0** — copied to ComfyUI loras as
**`dnd24art-house-v1.safetensors`** (stable name; presets/skill reference this, never the run
filename). Multi-seed confirmation (101/202/303/404, crypt + house-spec portrait, no-LoRA
control) upheld the owner's r32 pick on every seed. Full findings + the tusk-rule fix are in
the skill (`.claude/skills/illustration-builder/SKILL.md`, commits 9aff4a3 +this one).

- Step-2000 beats step-4000 in ALL ranks — the final checkpoints wash out (~87 epochs).
- Watermarks/tusks were base-model defects, seed-clustered; corpus and LoRA exonerated.
- Tusk rule rewritten: "small blunt" adjectives, never "thick heavy"; negation backfires.
- Deliberately NOT baked into the tool presets yet ("tools do, skills decide" — the skill
  carries the default; preset-baking waits until the style tail is validated in step 4).

Remaining: **step 4 — validate the style tail with house-v1** (esp. nonhuman faces / Morgash
at denoise 0.25), then step 5, make real art. Judging evidence folders on the Desktop
(`lora-confirm-2026-08-28`, `tusk-fix-2026-08-28`) are disposable once the owner has seen them.
