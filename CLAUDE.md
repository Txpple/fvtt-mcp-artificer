# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# fvtt-mcp-artificer

Local image-generation MCP server for D&D table art. Wraps a **headless ComfyUI** instance on
this machine and exposes a small set of **Foundry-specific** tools so Claude can author prompts,
generate illustration batches, curate the results by actually looking at them, and hand the
winners to the Foundry pipeline (`upload-asset` → `set-actor-art` / `add-journal-image` /
scene backgrounds in `fvtt-mcp-molten5e`).

Status: **greenfield** — name and scope agreed 2026-08-26, nothing built yet.

## Scope (binding)

- **Foundry-specific by decree, NOT a generic ComfyUI bridge.** Tools speak Foundry vocabulary
  and get tweaked freely for Foundry work. Do not generalize.
- **Separate from `fvtt-mcp-molten5e`.** That server is scoped to Foundry content authoring and
  must not couple to image generation. This server never talks to the Foundry bridge; the
  handoff between them is files on disk + the molten5e upload tools.
- Same house philosophy as the rest of the family: **tools do, skills decide.** Correctness
  (workflow execution, dimensions, upscale pipeline, file conventions) lives in tested tools
  here; judgment (prompt craft, curation taste, which actor/journal gets the art, house style)
  lives in a later `illustration-builder` skill.

## Hardware

DESKTOP-NY: RTX 5090 (32 GB VRAM, Blackwell — needs CUDA 12.8+ PyTorch builds), 9800X3D,
96 GB RAM. Everything runs comfortably; curation is the intended bottleneck, not compute.

## Architecture

```
Claude ──MCP──> fvtt-mcp-artificer ──HTTP/WS──> ComfyUI (headless, local)
                      │
                      └── pinned workflow JSONs (draft / final / upscale)
```

- ComfyUI runs headless in API mode; this server submits **pinned workflow JSONs** — never
  free-form graphs — with prompt/seed/batch/preset substituted in.
- Tools return file paths; Claude reads the PNGs directly to curate.
- Small server: roughly `generate-image` + `upscale-image` wrapping 2–3 workflows. Resist tool
  sprawl.

## Tool design: purpose presets, not raw dimensions

`generate-image` takes `kind`, not width/height:

| kind | shape | notes |
|---|---|---|
| `handout` / `scene-background` | 2560×1600 (2K 16:10) | the table's standard illustration format |
| `portrait` | square-ish | actor art |
| `token` | square, cutout-ready framing | downstream: the existing `token-cutout` skill mattes it |

Each preset bakes in aspect, resolution, workflow, and (eventually) the house-style LoRAs.

**Resolution pipeline (locked):** never generate native 2K — composition degrades past ~1.5 MP.
Generate at ~1536×960 (16:10), model-upscale 2× (4x-UltraSharp or hires pass), downsample to
2560×1600.

## Model plan (as of mid-2026)

- **FLUX.1-dev (12B)** — final-quality renders (~10–20 s/image on this card). HF repo is
  license-gated: prefer the **Comfy-Org ungated repackaged checkpoints** to avoid token handling.
- **FLUX.2-klein (4B, Apache 2.0)** — draft model: 4-step, ~1 s/image; batch 6–8 compositions,
  pick, re-render with dev.
- **SDXL fine-tunes** (Juggernaut XL etc.) — fallback for painterly style LoRAs FLUX doesn't cover.
- **Qwen-Image (20B)** — only for legible text-in-image props (signs, scrolls, wanted posters).
- Once a house look is chosen: 1–2 style LoRAs pinned into the presets so all campaign art feels
  like one book.

Disk budget: ~60–100 GB for ComfyUI + checkpoints. Model downloads are large — state file, source,
and size and get approval per download.

## Setup order (when the owner says go)

1. Install ComfyUI (standalone Windows build) on the drive the owner picks; verify FLUX.1-dev +
   FLUX.2-klein run (CUDA 12.8+ torch for Blackwell).
2. Pin the workflow JSONs: `draft` (klein, batch), `final` (dev + upscale to 2560×1600).
3. Build this MCP server; register at **user scope** (house convention: new MCP tools ⇒ Claude
   Code restart — the owner restarts, the session can't).
4. Prove the loop end-to-end: prompt → draft batch → curate → final render → `upload-asset` into
   a Foundry journal via molten5e.
5. Pick house-style LoRAs; bake into presets.

## Conventions inherited from the family

- Commit direct to `main`.
- Kernel-grade quality bar: tools are tested and own correctness; no judgment in tools.
- Output filenames/folders should line up with what `upload-asset` and the campaign repos expect,
  so generate → curate → upload needs no glue.
