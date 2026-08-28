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
- **House portrait finish (owner-locked 2026-08-26, consistency pass):** the reference look is
  the Morgash/Gren pair — `soft diffuse dusk light, low contrast, pale hazy muted palette, matte
  powdery skin with no gloss or shine, gentle even lighting with no harsh highlights, matte oil
  painting, visible painterly brushwork, soft faded storybook finish`. Words like "gleaming"
  invite a glossy high-contrast studio sheen (the owner: "1960s TV cameo vibe") — describe armor
  as `worn … with a soft dull sheen` instead. Same trap as neon: shine words compound. Don't
  overshoot into `pale hazy / faded` — that washes the image out; pair the matte-skin words with
  `rich mid-tones and deep shadows` to keep Morgash/Gren-level tonal depth.
- **Style anchoring with extra references (proven 2026-08-26):** for portraits, pass the two
  approved style-anchor portraits (Morgash + Gren, the owner-designated reference pair) as refs
  2–3 alongside the subject's identity ref. FLUX.2 absorbs their palette and brushwork WITHOUT
  face bleed — provided the prompt pins the subject's species features (`clean-shaven human
  features` kept tusks and beards off Thomas). Beats prompt-only style matching; the house-style
  LoRA remains the durable version once the approved corpus exists.
- **The house LoRA exists (locked 2026-08-28): `lora: "dnd24art-house-v1.safetensors"`,
  `loraStrength: 1.0`, trigger word `dnd24art` leading the prompt.** Use it on every `final` and
  `refine` render unless the owner asks for base-model output. It is rank-32 @ step 2000 on the
  46-plate rebuilt corpus, picked by multi-seed judging at final quality against a no-LoRA
  control (crypt + house-spec portrait, seeds 101/202/303/404). What the judging established:
  - Scenes are the clear win — better light shafts, depth, palette, and *prompt adherence*
    (control forgot the bones in a crypt prompt; the LoRA painted them).
  - Portraits: more matte and painterly, pushes skin paler (helps bone-white canon subjects).
    It does NOT fight the house portrait finish — spec words work identically with it loaded.
  - Daylight is safe despite the dark corpus (desert probe stayed high-key at every strength).
  - 0.7 is the fallback strength if the style overrides prompt content on a specific render.
  - Do NOT use the `-final` (step-4000) checkpoints of any run: over-trained (~87 epochs),
    they wash out into pale haze. Step-2000 checkpoints beat them across all ranks.
  - The LoRA is FLUX.1-only: `draft`/`scene` cannot load it. Styling scene output = mode
    `refine` + this lora + denoise 0.25–0.4 over the finished render (the style tail).
    Validated on nonhuman faces 2026-08-28 (Morgash-type orc, FLUX.2 scene base, d0.25 and
    d0.35): tusks and bone-white skin survive BOTH levels, and the no-LoRA control humanized
    the same face — the LoRA is what protects orc anatomy in the tail, so never run the tail
    lora-less on nonhuman faces.

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
- **dev img2img humanizes nonhuman faces — unless the house LoRA is loaded**: lora-less refine
  erased an orc's tusks at 0.7/0.55 denoise and mangled them at 0.45, and a lora-less style tail
  at 0.35 still thins them toward human. With `dnd24art-house-v1` + trigger word, the tail at
  0.25-0.35 PRESERVED tusks and bone-white skin (validated 2026-08-28) — the corpus pulls toward
  orc anatomy. So: nonhuman faces may take the style tail WITH the house LoRA; full-denoise
  refine (0.45+) on them remains klein-only territory, and lora-less refine stays banned.
- **Group scenes: anchor identities with `referenceImages`** (shipped v0.2): pass 1–5 canonical
  portraits from the campaign `art/` shelf to `generate-image` (draft mode) and they feed FLUX.2
  reference conditioning. Bind each reference with an unmistakable prompt phrase in the same
  order ("bone-white orc with two lower tusks", "tiny white-bearded gnome in green-gold robes"),
  compose around ONE hero moment, and let the rest support. Finish the pick with
  `upscale-image` — the refine path stays off-limits for these (nonhuman faces).
- **READ THE TOKEN ART, not just the bio** (learned the hard way 2026-08-28): bios routinely
  omit appearance. Gren's never mentions his hair; four generations shipped an invented
  "russet-brown greying at the temples" before his token settled it as WHITE hair, a full white
  beard and a green-crystal staff. Tokens live at
  `%LOCALAPPDATA%\FoundryVTT\Data\worlds\<world>ssets	okens\<name>.png` — the path is in
  the actor's `prototypeToken.texture.src`. Open it before writing a word of prompt.
- **Negation backfires — describe presence, never absence** (proven twice, 2026-08-28).
  "no large tusks" DRAWS large tusks; "clean-shaven"/"no beard" GROWS a beard. FLUX reads the
  tokens, not the "no". Say what IS there instead: "his chin and jaw and upper lip are smooth
  bare hairless skin" finally produced a beardless elf after three failures.
- **Gendered features must be stacked, not stated once**: a lean build + smooth young face +
  no facial hair rendered a canon male elf as a woman despite the word "male". Recovery needs
  redundancy — "a man, a male X, masculine male warrior" plus a strong square jaw, heavy brow,
  thick neck and wide shoulders.
- **Directional words about tusks are read as SIZE on dev**: "pointing up", "rising toward his
  eyes", "standing vertically" all produce walrus ivory, even paired with "no bigger than a
  thumbnail". There is currently NO known phrasing that yields small tusks angled upward — the
  working phrase gives small tusks angled low/outward, and that is the trade.
- **Refine mode REPLACES portrait style, it does not preserve it**: nudging an approved portrait
  through `refine` at denoise 0.40-0.45 flattened three of four into cel-shaded vector art with
  hard outlines. To fix a detail while keeping a look, re-run `final` on the SAME SEED with an
  edited prompt — the seed carries the composition, the LoRA carries the paint.
- **Species proportion is a losing fight in a waist-up crop**: every push toward gnome
  proportions produced caricature (rosy comic dwarf), and every retreat produced a short human.
  Facial structure works better than size words, and a scale cue in frame beats both.

- **Translate canon into the model's vocabulary — never prompt in-world proper nouns or
  mechanics** (owner rule 2026-08-26). The generator has never heard of First Light, the Maul of
  Momentum, the Hollowing, or Spellfire; naming them either does nothing or makes it free-
  associate garbage (a "rose-gold blazing" sword rendered as a pink lightsaber). Canon decides
  WHAT is true; the prompt says only what a camera would see, in ordinary illustrator terms:
  "First Light" → "a longsword catching warm dawn-colored light"; "spellfire" → "silver-white
  fire"; "displacement" → "a ghostly after-image a step to one side". Keep effects modest —
  over-described glow becomes neon. When a canon element has no standard-fantasy visual
  equivalent, simplify it rather than explain it.
- **Computational limits — compose inside them** (proven 2026-08-26, Cadoc A/B): the entity-count
  ceiling is real. Past roughly six distinct subjects, FLUX.2 collapses into a posed cast lineup
  facing the camera, duplicates faces, and floats weapons. The full-party group shot is the
  HARDEST genre — a rare set-piece needing several seeds and ruthless curation, never the default.
  Default to **duel/vignette compositions**: 1–2 party members + one enemy + one landmark, one
  directional action, hero large and central. Across a session's art, give each PC their moment in
  separate images rather than cramming four into one frame. Money renders use scene mode's pinned
  **24 steps, no turbo** (~80 s) — the 10-step turbo pass visibly costs coherence.
- **Three-pass self-review is mandatory before showing scene/final art** (owner rule 2026-08-26):
  generate → Read → critique against canon, anatomy, and composition (weapons and hands
  especially — Morgash's maul grip is a repeat offender) → fix the prompt or re-seed → repeat, at
  least THREE passes, iterating on seeds and tweaks. Show the owner only the best surviving
  render, with a one-line note of what was rejected on the way. Draft batches for curation are
  exempt; anything presented as a finished scene is not.
- **Reference identities duplicate and bleed** (scene mode, three-scene test 2026-08-26): FLUX.2
  will paint a referenced face onto *more than one* body when figures are spread wide — a second
  bone-white orc, a twin elf — and will lend a reference to a nearby NPC (Morgash's face landed on
  a hobgoblin captain). Mitigations: give every party member exactly ONE unmistakable action
  clause, describe enemies with contrasting features ("orange-red skin"), keep the cast tight, and
  put the hero large and near the centre — small background figures hold identity poorly.
- **Arm the scene for the RIGHT session**: a fight from session 1 predates the party's later magic
  items. Check that session's own loot ledger before putting a weapon in anyone's hand (Morgash
  carried a greatsword long before the Maul of Momentum; Thomas won First Light *in* the cave
  fight, so he cannot be swinging it during that fight).
- **"Tusk" is sized by its adjective, and only small adjectives are safe** (re-validated on dev
  2026-08-28, 8-phrasing × multi-seed test at final quality). The word "tusk" itself is fine;
  the size adjective does everything. "large broad" AND "thick heavy" → walrus ivory erupting
  from the mouth corners (the old prescribed phrase contradicted this rule's own warning and
  broke every dev-mode orc portrait). Explicit size anchors ("length of a thumb") are ignored.
  **Negation backfires**: appending "no large tusks" DRAWS large tusks — FLUX reads the tokens,
  not the "no". What works on dev/final, all seeds tested:
  "mouth closed with lips together, two small blunt lower tusks that barely clear his lower lip"
  (klein draft mode: same phrase works; the old "thick heavy" wording is banned everywhere).
  Omitting tusks entirely → dev renders no tusks at all, so the clause is mandatory for orcs.

## Step 4 — Run the loop, curate ruthlessly

0. **The chat IS the gallery (owner preference — browser-pane previews don't work for them).**
   Reading a PNG with the Read tool renders it inline in the conversation, so curating by
   reading doubles as showing the owner every draft — never curate silently or make them
   navigate to a file path. Finals additionally go out via `SendUserFile` so they get a card.
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
