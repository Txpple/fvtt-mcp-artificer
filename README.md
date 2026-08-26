# fvtt-mcp-artificer

A **Foundry-specific** image-generation [Model Context Protocol](https://modelcontextprotocol.io)
server for D&D table art, driven by **Claude Code**. It wraps a **headless
[ComfyUI](https://github.com/comfyanonymous/ComfyUI)** instance on the local machine and exposes a
small set of Foundry-shaped tools so Claude can author prompts, generate illustration batches,
**curate the results by actually looking at them**, and hand the winners to the Foundry pipeline in
its sister server, [`fvtt-mcp-molten5e`](https://github.com/Txpple/fvtt-mcp-molten5e)
(`upload-asset` → `set-actor-art` / `add-journal-image` / scene backgrounds).

The whole loop is fast enough to be conversational on the target hardware (RTX 5090): a 6-image
draft batch lands in ~10 s, a finished 2560×1600 render in ~19 s, and the full
prompt → draft → curate → final → in-world-journal cycle was proven end to end in
[`notes/m3-loop-proof.md`](notes/m3-loop-proof.md).

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
Claude ──MCP──> fvtt-mcp-artificer ──HTTP──> ComfyUI (headless, local)
                      │
                      └── pinned workflow JSONs (draft / final / final-refine / upscale)
```

ComfyUI runs headless in API mode; this server submits the **pinned workflow JSONs** under
[`workflows/`](workflows/README.md) — never free-form graphs — with prompt/seed/batch/preset
substituted in (by node id, guarded by class-type drift assertions). Tools return absolute file
paths; Claude reads the PNGs directly to curate.

## Purpose presets, not raw dimensions

`generate-image` takes a `kind`, not width/height:

| kind                            | generates at      | finished output   |
| ------------------------------- | ----------------- | ----------------- |
| `handout` / `scene-background`  | 1536×960          | 2560×1600         |
| `portrait`                      | 1024×1280         | 2048×2560         |
| `token`                         | 1024×1024         | 2048×2048         |

**Resolution pipeline (locked):** never generate at output size — composition degrades past
~1.5 MP. Generate at the preset's native resolution, model-upscale ×4 with 4x-UltraSharp, lanczos
downsample to the finished size, all in one pinned graph.

## Models

- **FLUX.1-dev fp8** (Comfy-Org all-in-one) — final-quality renders, ~15–19 s finished.
- **FLUX.2-klein 4B** (Apache 2.0) — the draft model: 4-step, ~1–2 s/image, batch 6–8, pick,
  re-render with dev.
- **4x-UltraSharp** — the model upscaler in the pipeline tail.

## Tools

| tool | what it does |
| --- | --- |
| `generate-image` | `kind` + `prompt` + `slug`, with `mode`: **draft** (klein batch for curation), **final** (dev render from the prompt, finished at output resolution), or **refine** (dev img2img at denoise 0.7 over a picked draft — keeps its scene skeleton, re-renders in dev style, finished at output resolution). Draft mode also takes `referenceImages` (1–5 paths, e.g. canonical party portraits) fed as FLUX.2 reference conditioning so named characters keep their faces in group scenes. Returns absolute PNG paths named `<kind>-<slug>-<seed>_NNNNN_.png`. |
| `upscale-image` | Finish an existing image (usually a draft that won curation outright) through the upscale tail to its kind's output resolution. |
| `artificer-status` | Health check: ComfyUI reachability/version, VRAM, queue depth, pinned-workflow integrity, required-model presence. |

The substitution contract between tools and the pinned graphs is documented in
[`workflows/README.md`](workflows/README.md).

## Requirements

- **Windows + NVIDIA GPU.** Developed and proven on an RTX 5090 (Blackwell needs CUDA 12.8+
  PyTorch; the current ComfyUI portable build ships it).
- **ComfyUI** (standalone portable build, v0.34+) running headless — see
  [`scripts/launch-comfyui.ps1`](scripts/launch-comfyui.ps1) for the launch convention
  (API mode on `127.0.0.1:8188`, pinned `--output-directory`).
- The model files in ComfyUI's `models/` tree (~33 GB, all ungated):
  `checkpoints/flux1-dev-fp8.safetensors`, `diffusion_models/flux-2-klein-4b.safetensors`,
  `text_encoders/qwen_3_4b.safetensors`, `vae/flux2-vae.safetensors`,
  `upscale_models/4x-UltraSharp.safetensors`. `artificer-status` reports anything missing.
- **Node.js 22+** for the MCP server itself.

## Build

```bash
npm install
npm run build
```

Tests: `npm test` (offline unit suite; the pinned workflow JSONs are the fixtures). The live suite
— real ComfyUI, real renders — is gated behind `npm run test:integration`. Quality gates:
`npm run typecheck`, `npm run check` (biome), `npm run knip`.

## Wire into Claude Code

House convention registers the server at **user scope** (new MCP tools ⇒ restart Claude Code).
Either use the CLI:

```bash
claude mcp add -s user artificer -- node D:/path/to/fvtt-mcp-artificer/dist/index.js
```

or copy [`.mcp.json.example`](.mcp.json.example) into a `.mcp.json` Claude Code reads (or merge
into `~/.claude.json` `mcpServers`) with **absolute** paths. On Windows point `command` at the full
`node.exe` path if Node isn't on `PATH`.

## Configuration

Copy [`.env.example`](.env.example) to `.env` (gitignored):

- `COMFY_URL` — the headless instance (default `http://127.0.0.1:8188`).
- `COMFY_OUTPUT_DIR` — must match the `--output-directory` ComfyUI was launched with; the server
  reads generated PNGs straight off this path.
- `ARTIFICER_TIMEOUT_MS` — per-job wait cap (default 300000).

## License

MIT License — see [LICENSE](LICENSE) for details.
