// generate-image — the workhorse. Speaks Foundry vocabulary (kind + prompt + slug), never raw
// dimensions or graphs; all judgment about WHAT to render stays with the caller (the skill layer).

import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { Comfy } from '../comfy.js';
import { KINDS, PRESETS, filenamePrefix } from '../presets.js';
import { toInputSchema } from '../utils/schema.js';
import {
  buildDraft,
  buildDraftRef,
  buildFinal,
  buildFinalLora,
  buildFinalRefine,
  buildFinalRefineLora,
  buildScene,
  loadWorkflow,
  type Graph,
} from '../workflows.js';

const generateImageSchema = z.object({
  kind: z
    .enum(KINDS)
    .describe('Purpose preset — fixes generation and output resolution. No raw dimensions.'),
  prompt: z.string().min(1).describe('The full image prompt.'),
  slug: z
    .string()
    .min(1)
    .describe('Short kebab-case subject name used in output filenames, e.g. "smugglers-cove".'),
  mode: z
    .enum(['draft', 'scene', 'final', 'refine'])
    .default('draft')
    .describe(
      'draft: fast klein batch for curation. scene: FLUX.2-dev with referenceImages (required) — ' +
        'the quality tier for multi-character scenes, ~30 s/image, finished at output ' +
        'resolution. final: FLUX.1-dev render from the prompt alone, finished at output ' +
        'resolution. refine: FLUX.1-dev img2img over sourceImage (a picked draft) — keeps its ' +
        'scene skeleton; never use on nonhuman faces.'
    ),
  seed: z.number().int().min(0).optional().describe('Fixed seed; random when omitted.'),
  batch: z
    .number()
    .int()
    .min(1)
    .max(8)
    .optional()
    .describe('Images per batch (draft/scene modes). Defaults: draft 6, scene 1.'),
  sourceImage: z
    .string()
    .optional()
    .describe('Refine mode only (required there): absolute path of the picked draft PNG.'),
  referenceImages: z
    .array(z.string())
    .min(1)
    .max(5)
    .optional()
    .describe(
      'Draft/scene modes (required for scene): 1-5 absolute paths of identity-reference images ' +
        '(e.g. the canonical party portraits) fed as FLUX.2 reference conditioning so the named ' +
        'characters keep their faces in group scenes. Bind each reference with an unmistakable ' +
        'phrase in the prompt, in the same order.'
    ),
  denoise: z
    .number()
    .min(0.1)
    .max(0.95)
    .default(0.7)
    .describe(
      'Refine mode only. 0.7 (pinned by test) keeps the scene skeleton in dev style; ' +
        '~0.55 clones composition but inherits the draft rendering style; 0.25-0.4 is the ' +
        'style-tail band (with lora): re-glazes a finished render without redrawing it.'
    ),
  lora: z
    .string()
    .optional()
    .describe(
      'Final/refine modes: house-style LoRA filename in ComfyUI models/loras/, e.g. ' +
        '"dnd24art.safetensors". With refine at denoise 0.25-0.4 this is the universal style ' +
        'tail — it styles ANY finished render, including scene-mode (FLUX.2) output.'
    ),
  loraStrength: z
    .number()
    .min(0)
    .max(1.5)
    .default(1.0)
    .describe('LoRA strength (with lora). Style dial: lower if it overrides prompt content.'),
});

export interface GenerateDeps {
  comfy: Comfy;
  workflowsDir: string;
}

export class GenerateImageTool {
  constructor(private readonly deps: GenerateDeps) {}

  getToolDefinitions() {
    return [
      {
        name: 'generate-image',
        description:
          'Generate Foundry table art with the local ComfyUI instance. Returns absolute PNG ' +
          'paths — read them to curate. Draft batches are ~2 s/image; final renders arrive ' +
          'finished at the preset output resolution (upscale pipeline included).',
        inputSchema: toInputSchema(generateImageSchema),
      },
    ];
  }

  async handleGenerateImage(args: unknown) {
    const p = generateImageSchema.parse(args);
    const preset = PRESETS[p.kind];
    const seed = p.seed ?? randomInt(0, 2 ** 31 - 1);
    const prefix = filenamePrefix(p.kind, p.slug, seed);

    if (p.referenceImages && p.mode !== 'draft' && p.mode !== 'scene') {
      throw new Error('referenceImages works in draft and scene modes only');
    }
    if (p.lora && p.mode !== 'final' && p.mode !== 'refine') {
      throw new Error(
        'lora works in final and refine modes only (FLUX.1-dev — the LoRA cannot load into ' +
          'the FLUX.2 draft/scene models; style scene output by chaining mode "refine" with ' +
          'lora at denoise 0.25-0.4 over the finished render)'
      );
    }
    if (p.mode === 'scene' && !p.referenceImages) {
      throw new Error('scene mode requires referenceImages (the canonical party portraits)');
    }
    const batch = p.batch ?? (p.mode === 'scene' ? 1 : 6);

    let graph: Graph;
    if (p.mode === 'scene' || (p.mode === 'draft' && p.referenceImages)) {
      const uploadedReferences: string[] = [];
      for (const ref of p.referenceImages ?? []) {
        uploadedReferences.push(await this.deps.comfy.upload(ref));
      }
      const refParams = {
        prompt: p.prompt,
        width: preset.gen.width,
        height: preset.gen.height,
        batchSize: batch,
        seed,
        filenamePrefix: prefix,
        uploadedReferences,
      };
      graph =
        p.mode === 'scene'
          ? buildScene(loadWorkflow(this.deps.workflowsDir, 'scene'), {
              ...refParams,
              outWidth: preset.out.width,
              outHeight: preset.out.height,
            })
          : buildDraftRef(loadWorkflow(this.deps.workflowsDir, 'draft-ref'), refParams);
    } else if (p.mode === 'draft') {
      graph = buildDraft(loadWorkflow(this.deps.workflowsDir, 'draft'), {
        prompt: p.prompt,
        width: preset.gen.width,
        height: preset.gen.height,
        batchSize: batch,
        seed,
        filenamePrefix: prefix,
      });
    } else if (p.mode === 'final') {
      const finalParams = {
        prompt: p.prompt,
        genWidth: preset.gen.width,
        genHeight: preset.gen.height,
        outWidth: preset.out.width,
        outHeight: preset.out.height,
        seed,
        filenamePrefix: prefix,
      };
      graph = p.lora
        ? buildFinalLora(loadWorkflow(this.deps.workflowsDir, 'final-lora'), {
            ...finalParams,
            lora: p.lora,
            loraStrength: p.loraStrength,
          })
        : buildFinal(loadWorkflow(this.deps.workflowsDir, 'final'), finalParams);
    } else {
      if (!p.sourceImage) {
        throw new Error('refine mode requires sourceImage (the picked draft PNG path)');
      }
      const uploadedImage = await this.deps.comfy.upload(p.sourceImage);
      const refineParams = {
        prompt: p.prompt,
        uploadedImage,
        denoise: p.denoise,
        outWidth: preset.out.width,
        outHeight: preset.out.height,
        seed,
        filenamePrefix: prefix,
      };
      graph = p.lora
        ? buildFinalRefineLora(loadWorkflow(this.deps.workflowsDir, 'final-refine-lora'), {
            ...refineParams,
            lora: p.lora,
            loraStrength: p.loraStrength,
            genWidth: preset.gen.width,
            genHeight: preset.gen.height,
          })
        : buildFinalRefine(loadWorkflow(this.deps.workflowsDir, 'final-refine'), refineParams);
    }

    const result = await this.deps.comfy.submit(graph);
    return {
      kind: p.kind,
      mode: p.mode,
      seed,
      files: result.files,
      elapsedMs: result.elapsedMs,
      ...(p.mode === 'draft'
        ? {
            next: 'Read the files to curate, then re-render the pick with mode "refine" or "final".',
          }
        : {}),
    };
  }
}
