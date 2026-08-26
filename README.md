# fvtt-mcp-artificer

A **Foundry-specific** image-generation [Model Context Protocol](https://modelcontextprotocol.io)
server for D&D table art, driven by **Claude Code**. It wraps a **headless
[ComfyUI](https://github.com/comfyanonymous/ComfyUI)** instance on the local machine and exposes a
small set of Foundry-shaped tools so Claude can author prompts, generate illustration batches,
**curate the results by actually looking at them**, and hand the winners to the Foundry pipeline in
its sister server, [`fvtt-mcp-molten5e`](https://github.com/Txpple/fvtt-mcp-molten5e)
(`upload-asset` → `set-actor-art` / `add-journal-image` / scene backgrounds).

> 🚧 **Status: greenfield.** Name and scope agreed 2026-08-26; nothing built yet. This README
> describes the design being built toward — see [`CLAUDE.md`](CLAUDE.md) for the binding spec.

## Why this shape

This is **not a generic ComfyUI bridge**, by decree. Tools speak Foundry vocabulary — actor
portraits, tokens, handouts, scene backgrounds — and get tweaked freely for Foundry work. And it
stays **separate from `fvtt-mcp-molten5e`**: that server is scoped to Foundry content authoring and
must not couple to image generation. This server never talks to the Foundry bridge; the handoff
between them is files on disk plus the molten5e upload tools.

Same house philosophy as the rest of the family: **tools do, skills decide.** Correctness (workflow
execution, dimensions, the upscale pipeline, file conventions) lives in tested tools here; judgment
(prompt craft, curation taste, which actor or journal gets the art, house style) lives in a later
`illustration-builder` skill.

```
Claude ──MCP──> fvtt-mcp-artificer ──HTTP/WS──> ComfyUI (headless, local)
                      │
                      └── pinned workflow JSONs (draft / final / upscale)
```

ComfyUI runs headless in API mode; this server submits **pinned workflow JSONs** — never free-form
graphs — with prompt/seed/batch/preset substituted in. Tools return file paths; Claude reads the
PNGs directly to curate. The server stays small — roughly `generate-image` + `upscale-image`
wrapping 2–3 workflows.

## Purpose presets, not raw dimensions

`generate-image` takes a `kind`, not width/height:

| kind                            | shape             | notes                                              |
| ------------------------------- | ----------------- | -------------------------------------------------- |
| `handout` / `scene-background`  | 2560×1600 (16:10) | the table's standard illustration format           |
| `portrait`                      | square-ish        | actor art                                          |
| `token`                         | square            | cutout-ready framing; a downstream skill mattes it |

Each preset bakes in aspect, resolution, workflow, and (eventually) the house-style LoRAs, so all
campaign art feels like one book.

**Resolution pipeline:** never generate native 2K — composition degrades past ~1.5 MP. Generate at
~1536×960 (16:10), model-upscale 2×, downsample to 2560×1600.

## Models

- **FLUX.1-dev** — final-quality renders.
- **FLUX.2-klein** — the draft model: batch 6–8 fast compositions, pick, re-render with dev.
- **SDXL fine-tunes** — fallback for painterly style LoRAs FLUX doesn't cover.
- **Qwen-Image** — only for legible text-in-image props (signs, scrolls, wanted posters).

## License

MIT License — see [LICENSE](LICENSE) for details.
