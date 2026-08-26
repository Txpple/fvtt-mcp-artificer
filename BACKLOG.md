# Backlog

Post-0.3 candidates, in rough priority order. The shipped roadmap lives in [ROADMAP.md](ROADMAP.md).

## 1 · `edit-token` — AI tweaks to an existing token (owner ask, 2026-08-26)

**The workflow being replaced:** the owner takes a token from their existing library, uploads it to
an external image-editing model ("nano banana"), and asks for modifications — *dress them
differently, change the hair, swap the weapon, add a cloak*. Slow, off-machine, and the result
doesn't come back into the Foundry pipeline on its own.

**Why it fits here:** FLUX.2-dev already does instruction-style image editing with the reference
conditioning we shipped in `scene.json` — feed the existing token as the reference and describe
only the change. Same pinned-graph discipline, same local hardware, and the result lands straight
in the campaign `art/` shelf ready for `set-actor-art`.

Shape: `edit-token` tool (or an `edit` mode on `generate-image`) taking `sourceImage` +
`instruction` + `kind`, pinned `edit.json`, preserving the token's framing and alpha where
possible. Needs a spike on how well identity holds under instruction edits, and on whether the
alpha survives (likely: re-cut after, see item 2).

## 2 · Absorb `token-cutout` from fvtt-mcp-molten5e

The cutout skill (rembg AI matte / chroma-key fallback + a 162-line bundled Python script) lives in
molten5e today, but it is **image processing, not Foundry content authoring** — it belongs in this
server by the family's own scope decree. It is also the natural tail of both `kind: "token"`
generation and item 1: generate/edit → cut alpha → upload → `set-actor-art`.

Move as a tested tool (`cutout-image`) plus the script, then retire the molten5e copy — one
migration, not two homes. Check for rembg's ~176 MB model download on first run (approval-gated).

## 3 · Also parked

- **House-style LoRAs** baked into presets, now that a corpus of approved art exists.
- **Character LoRAs** per PC — the strongest identity lock, ~30 min training each on the 5090;
  compare against the reference-latent approach shipped in v0.2/v0.3.
- **NVFP4 FLUX.2-dev** (~18 GB, fully VRAM-resident on Blackwell) as a fast scene-iteration gear
  alongside the fp8 finisher.
- **Qwen-Image** for legible text props (signs, scrolls, wanted posters).
