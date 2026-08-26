#!/usr/bin/env bash
# Overnight house-style LoRA runs. Three variants, sequential, ~8h total.
# ComfyUI must be stopped first — it holds ~24 GB of VRAM.
cd "D:/Workbench/LOCAL/LocalAI/ai-toolkit"
VP="D:/Workbench/LOCAL/LocalAI/ai-toolkit/venv/Scripts/python.exe"
LOG="D:/Workbench/LOCAL/LocalAI/ai-toolkit/output/overnight.log"
mkdir -p "D:/Workbench/LOCAL/LocalAI/ai-toolkit/output"

for cfg in dnd24art-A-lr1e4-r32 dnd24art-B-lr5e5-r32 dnd24art-C-lr1e4-r64; do
  echo "=== START $cfg $(date '+%H:%M:%S') ===" | tee -a "$LOG"
  # keep going if one variant dies; the others are still worth having by morning
  "$VP" run.py "config/$cfg.yaml" >> "$LOG" 2>&1 \
    && echo "=== DONE $cfg $(date '+%H:%M:%S') ===" | tee -a "$LOG" \
    || echo "=== FAILED $cfg $(date '+%H:%M:%S') ===" | tee -a "$LOG"
done
echo "=== ALL RUNS COMPLETE $(date '+%H:%M:%S') ===" | tee -a "$LOG"
