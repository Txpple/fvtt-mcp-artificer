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
  buildFinalRefine,
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
    .enum(['draft', 'final', 'refine'])
    .default('draft')
    .describe(
      'draft: fast klein batch for curation. final: dev-quality render from the prompt alone, ' +
        'finished at output resolution. refine: dev img2img over sourceImage (a picked draft) — ' +
        'keeps its scene skeleton, re-renders in dev style, finished at output resolution.'
    ),
  seed: z.number().int().min(0).optional().describe('Fixed seed; random when omitted.'),
  batch: z.number().int().min(1).max(8).default(6).describe('Draft mode only: images per batch.'),
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
      'Draft mode only: 1-5 absolute paths of identity-reference images (e.g. the canonical ' +
        'party portraits) fed as FLUX.2 reference conditioning so the named characters keep ' +
        'their faces in group scenes. Bind each reference with an unmistakable phrase in the ' +
        'prompt, in the same order.'
    ),
  denoise: z
    .number()
    .min(0.3)
    .max(0.95)
    .default(0.7)
    .describe(
      'Refine mode only. 0.7 (pinned by test) keeps the scene skeleton in dev style; ' +
        '~0.55 clones composition but inherits the draft rendering style.'
    ),
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

    if (p.referenceImages && p.mode !== 'draft') {
      throw new Error('referenceImages is draft-mode only (finish the pick via upscale-image)');
    }

    let graph: Graph;
    if (p.mode === 'draft' && p.referenceImages) {
      const uploadedReferences: string[] = [];
      for (const ref of p.referenceImages) {
        uploadedReferences.push(await this.deps.comfy.upload(ref));
      }
      graph = buildDraftRef(loadWorkflow(this.deps.workflowsDir, 'draft-ref'), {
        prompt: p.prompt,
        width: preset.gen.width,
        height: preset.gen.height,
        batchSize: p.batch,
        seed,
        filenamePrefix: prefix,
        uploadedReferences,
      });
    } else if (p.mode === 'draft') {
      graph = buildDraft(loadWorkflow(this.deps.workflowsDir, 'draft'), {
        prompt: p.prompt,
        width: preset.gen.width,
        height: preset.gen.height,
        batchSize: p.batch,
        seed,
        filenamePrefix: prefix,
      });
    } else if (p.mode === 'final') {
      graph = buildFinal(loadWorkflow(this.deps.workflowsDir, 'final'), {
        prompt: p.prompt,
        genWidth: preset.gen.width,
        genHeight: preset.gen.height,
        outWidth: preset.out.width,
        outHeight: preset.out.height,
        seed,
        filenamePrefix: prefix,
      });
    } else {
      if (!p.sourceImage) {
        throw new Error('refine mode requires sourceImage (the picked draft PNG path)');
      }
      const uploadedImage = await this.deps.comfy.upload(p.sourceImage);
      graph = buildFinalRefine(loadWorkflow(this.deps.workflowsDir, 'final-refine'), {
        prompt: p.prompt,
        uploadedImage,
        denoise: p.denoise,
        outWidth: preset.out.width,
        outHeight: preset.out.height,
        seed,
        filenamePrefix: prefix,
      });
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
