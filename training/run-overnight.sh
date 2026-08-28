#!/usr/bin/env bash
# Overnight house-style LoRA rank sweep on the REBUILT corpus (46 plates, 2026-08-27).
#
# Runs A-C are VOID: they trained on the old 133-plate corpus, which the owner has
# judged plain bad. They are not baselines and must not be used as comparison points.
# That leaves NO valid rank prior for this corpus, so this is a clean three-point
# sweep with everything except rank held fixed.
#
#   D = rank 8, E = rank 16, F = rank 32   (lr 1e-4, 4000 steps, alpha == rank)
#
# ~2.0 s/it measured => ~2h15m per run, ~7h for all three.
# Checkpoints every 500 steps give 8 selection points per run, so an overfit tail
# costs nothing: 46 images x 4000 steps is ~87 epochs and the best LoRA may well be
# an earlier checkpoint, not the final one.
#
# PRECONDITIONS:
#   - ComfyUI must be stopped (it holds ~24 GB of VRAM).
#   - output/dnd24art-{D,E,F}-* must NOT exist -- ai-toolkit RESUMES from a leftover
#     checkpoint instead of starting fresh. Move stale dirs aside before launching.
cd "D:/Workbench/LOCAL/LocalAI/ai-toolkit"
VP="D:/Workbench/LOCAL/LocalAI/ai-toolkit/venv/Scripts/python.exe"
LOG="D:/Workbench/LOCAL/LocalAI/ai-toolkit/output/overnight.log"
mkdir -p "D:/Workbench/LOCAL/LocalAI/ai-toolkit/output"

for cfg in dnd24art-D-lr1e4-r8 dnd24art-E-lr1e4-r16 dnd24art-F-lr1e4-r32; do
  if [ -d "output/$cfg" ]; then
    echo "=== SKIP $cfg -- output/$cfg exists, would resume not restart ===" | tee -a "$LOG"
    continue
  fi
  echo "=== START $cfg $(date '+%H:%M:%S') ===" | tee -a "$LOG"
  # keep going if one variant dies; the others are still worth having by morning
  "$VP" run.py "config/$cfg.yaml" >> "$LOG" 2>&1 \
    && echo "=== DONE $cfg $(date '+%H:%M:%S') ===" | tee -a "$LOG" \
    || echo "=== FAILED $cfg $(date '+%H:%M:%S') ===" | tee -a "$LOG"
done
echo "=== ALL RUNS COMPLETE $(date '+%H:%M:%S') ===" | tee -a "$LOG"
