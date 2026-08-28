# Handoff — 2026-08-27, ~22:45 (mid-sweep, Claude Code restarting)

Read this first, then `corpus-rebuild-and-style-tail.md` for the full plan.

## The one thing to do when the owner says go

**Relaunch the sweep so E and F run overnight.** The owner is going to bed straight after the
restart, so this is the whole job:

```bash
bash "D:/Workbench/FVTT/Repos/fvtt-mcp-artificer/training/run-overnight.sh"
```

The runner skips any config whose `output/` dir already exists, so it will **skip D** and run
**E (rank 16)** then **F (rank 32)** — about 4.5 h, done ~03:30. Confirm ComfyUI is down first
(it holds ~24 GB VRAM) and confirm E starts at step 0 rather than resuming.

## State at the moment of the restart

- **Run D (rank 8) was left training at ~78 %** (3124/4000), ~27 min from finishing, ~23:10.
  It survived its parent bash being stopped once already, so it may well survive the Claude Code
  restart too. Either outcome is fine:
  - Survived ⇒ D is complete, 8 checkpoints.
  - Killed ⇒ D has 6 checkpoints (500…3000) and is still usable; ~87 epochs means the optimum is
    likely below 3000 anyway. **Do not restart D to "finish" it** — ai-toolkit would resume with
    stale optimizer state. Either accept 3000 or move the dir aside and rerun clean.
- **E and F have not started.** No `output/dnd24art-{E,F}-*` dirs exist.
- ComfyUI: **stopped**. Claude-side background tasks: **all stopped** (wrapper + monitor).
- Nothing uncommitted; sweep plan is commit `6ac701d`.

## Do not repeat tonight's mistakes

1. **Stale output dirs cause silent resumes.** ai-toolkit resumes from a leftover checkpoint
   instead of starting fresh. The runner now guards this, but check anyway.
2. **Stopping the wrapper does not kill the trainer.** The python processes outlive it — verify
   with `Get-Process python` and kill by PID before launching anything new, or two runs will
   fight over the GPU.
3. **bitsandbytes is blocked by Application Control** (WinError 4551) — hence `optimizer: adamw`.
   Cosmetic error line at every run start; ignore it.
4. **A/B/C are void** (bad corpus, owner's verdict). Not baselines, and "rank is the lever" does
   not transfer from them.

## After the LoRAs land

Judging protocol is in `corpus-rebuild-and-style-tail.md` — real pipeline, final quality,
**always with a no-LoRA control**, and sweep the checkpoint axis (start ~2000 steps), not just
the final weights. 20-step samples are not evidence.

The restart also picks up **v0.4.0's schema change** — `generate-image` now has `lora` and
`loraStrength` on final/refine — which is what makes the style tail reachable from the tools.
