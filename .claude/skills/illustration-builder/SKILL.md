---
name: illustration-builder
description: >-
  Generate campaign art with the artificer tools, grounded in what the world already says and shows.
  Use when the user wants art for the table: "make a portrait for <NPC>", "generate art for this
  scene/journal/handout", "this actor needs a token", "illustrate this location", "give the inn a
  picture", "make a scene background". Reads the ACTUAL descriptions (actor bios, journals, scene
  notes, campaign repo) to build prompts, studies existing art in the Foundry data files for
  precedent and style, then runs the draft → curate → refine loop and wires the winner into the
  world. The artificer tools own correctness (workflows, dimensions, upscale, file naming); this
  skill owns the judgment: what to prompt, what to reject, where the art goes.
---

# Illustration builder

The judgment layer over `generate-image` / `upscale-image`. Its whole job is to make sure the
prompt comes from **canon**, the style comes from **precedent**, and nothing lands in the world
uncurated. It adds no mechanics — the artificer server owns workflow execution and file
conventions; molten5e owns delivery (`upload-asset`, `set-actor-art`, `add-journal-image`,
`create-scene` / `update-scene`).

Tools used: `artificer-status`, `generate-image`, `upscale-image` (artificer);
`get-actor`, `search-journals`, `list-journals`, `list-scenes`, `list-assets`, `download-asset`,
`upload-asset`, `set-actor-art`, `add-journal-image`, `update-scene` (molten5e). Token alpha work
hands off to the **`token-cutout`** skill.

## Step 0 — Pin the subject and the destination

Two questions before anything renders: **what is this a picture of**, and **where does it live**?
The destination picks the `kind`:

| destination | kind |
| --- | --- |
| journal image page / player handout | `handout` |
| scene background | `scene-background` |
| actor sheet portrait | `portrait` |
| actor token (goes through token-cutout after) | `token` |

If the user named a subject that exists in the world (an NPC, a location with a journal, a scene),
the next two steps are **mandatory** — never prompt from imagination for a named subject.

## Step 1 — Ground the prompt in canon

Pull the authoritative description before writing a word of prompt:

- **Actors**: `get-actor` — bio, race/species, gender, age, class, notable gear. The stat block is
  canon for props (a bandit statted with a crossbow gets a crossbow, whatever looks cooler).
- **Locations / events**: `search-journals` for the subject name; scene notes; quest journals.
- **Campaign repo** (when working in it — e.g. `fvtt-campaign-greenrest`): `notes/`, `plot/`,
  `sessions/` often carry richer description than the world does.
- **Scenes of played events are a hard gate (owner rule)**: illustrating something that happened
  at the table means reading the session diary page AND the session transcript/gm-notes
  (`sessions/<date>/`), and **looking at the battlemap it was fought on** (`screenshot-scene`, or
  read the scene background) — terrain, layout, and the fight's actual beats come from there,
  never from imagination. Who was present matters too (absent PCs don't appear).

Extract the **paintable facts**: species, gender, age, build, clothing, signature props, mood,
lighting, time of day, weather. These become the prompt's spine.

**Where canon is silent, don't silently invent.** For a named NPC whose bio never mentions hair
color, either ask, or propose ("canon doesn't say — I'll go with grey hair in a bun unless you'd
rather") and note what was invented so it can be written back into the bio. Generic subjects
("some bandit") invent freely.

## Step 2 — Study precedent art

Match the shelf, not just the subject — all campaign art should feel like one book:

- `list-assets` on `worlds/<world>/assets/art` (and `maps/` for backgrounds). Read the filenames:
  the `<kind>-<slug>-<seed>` convention tells you what exists and for whom.
- `download-asset` (or read the campaign repo copies) of the 2–3 pieces closest in subject, and
  **look at them**: palette, rendering style (painterly? ink-lined?), framing, lighting mood.
- For actor art this is a **hard gate, not a suggestion**: when the actor has existing art
  (`hasImage`), get the actual file (`export-actor` → `img` / `prototypeToken.texture.src` →
  `download-asset`) and **Read it** before writing the prompt. Backstories rarely state
  appearance facts the art settles — skin tone, hairstyle, armor colors. Learned the hard way:
  a canon Morgash has bone-white skin his backstory never mentions; the first portrait shipped
  green. Keep continuity with the existing art unless the user asks for a redesign.
- Reuse the style opener that produced the existing pieces (house baseline:
  `fantasy illustration, … ` for scenes, `fantasy character portrait of …, oil painting style` for
  people) so new art matches old.

## Step 3 — Craft the prompt (the cookbook)

Learned rules, from the M1/M3 proofs ([notes/m3-loop-proof.md](../../../notes/m3-loop-proof.md)):

- **Say the identity outright**: klein under-weights gender/species modifiers. "old halfling woman
  innkeeper, grey hair in a neat bun" — never a bare pronoun or a species adjective doing the work.
- **Describe props concretely**: "crossbow" drifts into muskets; "wooden crossbow with a drawn
  string" holds. Stat-block gear gets described, not named.
- **Never say "book art", "cover", or "poster"** — klein paints title typography and plate
  borders. Style lives in words like "fantasy illustration", "oil painting style".
- **Tokens**: end with "waist-up, centered, plain dark background" for cutout-ready framing.
- Expect **ghost signatures** in dev renders regardless of "no signature" — tolerate at table
  scale, or crop; don't burn batches fighting it.
- **dev img2img humanizes nonhuman faces**: refine erased an orc's tusks at 0.7 and 0.55 denoise,
  and at 0.45 it mangled them into downward fangs. Nonhuman faces are klein-only end to end — when
  a draft nails the canon feature, send it through `upscale-image` as-is.
- **Group scenes: anchor identities with reference latents** (proven 2026-08-26): klein accepts
  FLUX.2 reference conditioning — chain `ReferenceLatent` nodes (portrait → downscale ~512 →
  `VAEEncode` with the flux2 VAE → into the conditioning) using the canonical party portraits
  from the campaign `art/` shelf. Findings: 4 identities hold at **6 steps** (4 steps merges
  characters); bind each reference with an unmistakable prompt phrase ("bone-white orc with two
  lower tusks", "tiny white-bearded gnome in green-gold robes"); compose around ONE hero moment
  and let the rest support. Until a pinned `draft-ref.json` exists this runs as a hand-built
  graph against the ComfyUI API directly.
- **"Tusk" is a trap word** — klein maps it by size adjective: "small/prominent lower tusks" →
  thin glossy pins; "large broad tusks" → walrus ivory erupting from the mouth corners; "teeth
  rising over the upper lip" → a bared-teeth snarl. What works for integrated orc tusks:
  "mouth closed with lips together, two thick heavy lower tusks with a dull matte ivory finish
  protruding gently from behind his closed lower lip".

## Step 4 — Run the loop, curate ruthlessly

1. Cold start? `artificer-status` first; it names anything missing.
2. `generate-image` **draft**: batch 6 for scenes/handouts, 4 for characters/tokens.
3. **Read every PNG.** Judge against canon, not against "is it pretty": wrong gender, wrong
   species, wrong props, wrong mood are **rejections** even on beautiful renders.
4. A failed batch is cheap (~10 s): fix the prompt (usually by being more explicit) and re-draft.
   Don't refine a draft that's almost-right on a canon fact — refine keeps the skeleton, including
   the wrong parts.
5. Finish the winner: `mode: refine` (denoise 0.7) for dev-quality re-render; drop toward 0.55
   only when the draft's exact composition must survive and its style already matches; or
   `upscale-image` when a draft wins outright as-is.
6. Show the user the final (send the file) before or as it lands in the world.

## Step 5 — Stage locally; Foundry only after approval

**Nothing goes to Foundry uncurated by the owner.** Finals land in the campaign repo's staging
area first:

- Copy the finished PNG to `<campaign repo>\art\staging\<kind>-<slug>-<seed>.png` (strip
  ComfyUI's `_00001_` suffix; keep the seed — it's the provenance). For Greenrest:
  `D:\Workbench\FVTT\Repos\fvtt-campaign-greenrest\art\staging\`.
- Show the user the file and **stop there by default**. Uploading to the live world
  (`upload-asset`) and wiring (`set-actor-art`, `add-journal-image`, `update-scene`) happen only
  when the owner approves — then the file also graduates from `art\staging\` to `art\`.
- Tokens go through **token-cutout** for alpha before `set-actor-art`'s token half.
- If canon details were invented in Step 1, offer to write them back into the actor bio/journal so
  the art and the text agree forever after.
