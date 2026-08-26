// upscale-image — finish an existing image (usually a draft that won curation outright) through
// the locked upscale tail: 4x-UltraSharp then lanczos downsample to the kind's output resolution.

import { z } from 'zod';
import { Comfy } from '../comfy.js';
import { KINDS, PRESETS, filenamePrefix } from '../presets.js';
import { toInputSchema } from '../utils/schema.js';
import { buildUpscale, loadWorkflow } from '../workflows.js';

const upscaleImageSchema = z.object({
  sourceImage: z.string().min(1).describe('Absolute path of the PNG to finish.'),
  kind: z
    .enum(KINDS)
    .default('handout')
    .describe('Purpose preset — determines the finished output resolution.'),
  slug: z.string().min(1).describe('Short kebab-case subject name used in the output filename.'),
});

export interface UpscaleDeps {
  comfy: Comfy;
  workflowsDir: string;
}

export class UpscaleImageTool {
  constructor(private readonly deps: UpscaleDeps) {}

  getToolDefinitions() {
    return [
      {
        name: 'upscale-image',
        description:
          'Run an existing image through the model-upscale pipeline to its kind’s finished ' +
          'resolution. Use on a draft that won curation as-is. Returns the finished PNG path.',
        inputSchema: toInputSchema(upscaleImageSchema),
      },
    ];
  }

  async handleUpscaleImage(args: unknown) {
    const p = upscaleImageSchema.parse(args);
    const preset = PRESETS[p.kind];
    const uploadedImage = await this.deps.comfy.upload(p.sourceImage);
    const graph = buildUpscale(loadWorkflow(this.deps.workflowsDir, 'upscale'), {
      uploadedImage,
      outWidth: preset.out.width,
      outHeight: preset.out.height,
      filenamePrefix: `${filenamePrefix(p.kind, p.slug)}-upscaled`,
    });
    const result = await this.deps.comfy.submit(graph);
    return { kind: p.kind, files: result.files, elapsedMs: result.elapsedMs };
  }
}
