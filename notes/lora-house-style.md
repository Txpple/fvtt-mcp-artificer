# House-style LoRA — build log (started 2026-08-26)

Goal: one house art style across campaigns, trained on the owner's own 2024 D&D books.
Personal use only; the trained LoRA and the training corpus stay off the public repo.

## Decision: FLUX.1-dev, not FLUX.2-dev

FLUX.2-dev is 32B — its transformer alone is ~30 GB at fp8 and the Mistral-3 text encoder is
another ~24 GB. They cannot coexist on one 32 GB card: peak transient is 32.94 GB against the
5090's 31.84 GB usable, so Windows pages through system RAM and the step rate collapses to
**277 s/it** (a 400-step run takes 30+ hours; our ~3000-step style run would take ~10 days).
See github.com/genno-whittlery/flux2-dual-gpu-lora, which exists specifically to work around this.

FLUX.1-dev (12B) trains comfortably on the 5090 and is what ai-toolkit actually ships configs for
(`train_lora_flux_24gb.yaml`; there is **no** FLUX.2 example config).

Trade-off accepted: the LoRA applies to `final` + `refine` modes, not `scene` mode. That is fine —
`final` currently has *no* style mechanism at all (it renders from the prompt alone), and a style
LoRA also turns low-denoise `refine` into the style-unification pass the owner asked for. `scene`
mode keeps using reference anchoring (Morgash + Gren as refs 2–3), which is already proven.

If scene-mode style is wanted later: rent an 80 GB card for an afternoon, train there, run the
resulting LoRA locally (inference already streams the 35.5 GB fp8 checkpoint fine).

## Corpus (133 images) — `~/Desktop/lora-corpus-dnd2024/prepared/`

PHB 65 · MM 36 · DMG 18 · Heroes of Faerûn 14. Ravenloft deliberately skipped (horror art
direction). PHB-led on purpose: small-corpus LoRAs leak *content* along with style, and we want
the leak to be humanoids-in-gear, not monster scales.

**Only `assets/journal-art/` is usable.** The `portraits/` and `subjects/` directories in every
book module are token cutouts floating on white — no background, no composition, useless for style.

Three prep steps, all necessary (see the artifacts they remove):

1. **Alpha margins** — 69 of 139 plates ship with transparent feathered edges. Cropped to the
   opaque bounding box, then composited on white.
2. **Gold frames** — 35 plates (subclass/domain singles, some MM group plates) have a decorative
   gold border. Detected by locating the gold rule via a colour mask and row/column hit counts,
   then cropped to its interior. Left in, these teach the model to paint plate borders around
   everything — the training-data twin of the cookbook's "never say book art / cover / poster" rule.
3. **White-heavy vignettes** — 6 plates were figures floating on page white with no croppable
   margin. Moved to `excluded/`.

Captions are `.txt` alongside each image, derived from WotC's descriptive filenames with
class/subclass mapping (`phb-oath-of-vengeance` → `a paladin, oath of vengeance`). They describe
**content** so the invariant — style — attaches to the trigger word `dnd24art`.

## Environment

- Trainer: `D:\Workbench\LOCAL\LocalAI\ai-toolkit` (ostris/ai-toolkit), venv at `ai-toolkit\venv`.
- Base weights: `black-forest-labs/FLUX.1-dev`, diffusers format, ~32 GB, in the HF cache.
  License-gated: the owner accepted the FLUX.1-dev Non-Commercial License and ran `hf auth login`
  themselves (weights are non-commercial; **outputs** are explicitly fine for personal and
  commercial use).
- Rebuild with `setup-venv.sh`.

### Install gotchas (both cost a full failed run)

- **Never use uv-managed CPython here** — Windows Application Control blocks its `_ctypes` DLL.
  Use `py -3.13 -m venv`. Same policy breaks `uv tool install` console-script trampolines.
- `scipy==1.12.0` (pinned in `requirements.txt`) has no cp313 wheel and tries to compile. Install
  `requirements_base.txt` plus `scipy>=1.14` instead.
- `torchaudio` is imported by `toolkit/config_modules.py` but is not in the requirements; install it
  from the same cu128 index as torch.

## Runtime notes

- **Stop ComfyUI before training** — it holds ~23.8 GB of VRAM. `artificer-status` shows the queue;
  relaunch with `scripts/launch-comfyui.ps1`.
- Desktop cost with the single 4K monitor on the 5090 is only ~1 GB, leaving ~30.4 GB.

## Benchmark + overnight results

TBD — benching bf16 (`quantize: false`) against fp8 (`quantize: true`) at rank 32 to pick the
overnight configuration. Owner preference: **train longer and better, not faster.**
