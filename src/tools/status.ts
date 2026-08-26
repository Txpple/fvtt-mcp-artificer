// artificer-status — cold-start diagnosability: is ComfyUI up, are the pinned workflows loadable,
// are the required models installed, how busy is the queue.

import { z } from 'zod';
import { Comfy } from '../comfy.js';
import { toInputSchema } from '../utils/schema.js';
import { loadWorkflow, type WorkflowName } from '../workflows.js';

const statusSchema = z.object({});

/** Model files the pinned workflows require, by ComfyUI models/ subfolder. */
const REQUIRED_MODELS: Record<string, string[]> = {
  checkpoints: ['flux1-dev-fp8.safetensors'],
  diffusion_models: ['flux-2-klein-4b.safetensors', 'flux2_dev_fp8mixed.safetensors'],
  text_encoders: ['qwen_3_4b.safetensors', 'mistral_3_small_flux2_fp8.safetensors'],
  loras: ['Flux_2-Turbo-LoRA_comfyui.safetensors'],
  vae: ['flux2-vae.safetensors'],
  upscale_models: ['4x-UltraSharp.safetensors'],
};

const WORKFLOWS: WorkflowName[] = [
  'draft',
  'draft-ref',
  'scene',
  'final',
  'final-refine',
  'upscale',
];

export interface StatusDeps {
  comfy: Comfy;
  workflowsDir: string;
}

export class StatusTool {
  constructor(private readonly deps: StatusDeps) {}

  getToolDefinitions() {
    return [
      {
        name: 'artificer-status',
        description:
          'Health check: ComfyUI reachability/version, VRAM, queue depth, pinned-workflow ' +
          'integrity, and required-model presence. Call this first when generation misbehaves.',
        inputSchema: toInputSchema(statusSchema),
      },
    ];
  }

  async handleStatus(args: unknown) {
    statusSchema.parse(args);

    const workflows: Record<string, string> = {};
    for (const name of WORKFLOWS) {
      try {
        loadWorkflow(this.deps.workflowsDir, name);
        workflows[name] = 'ok';
      } catch (e) {
        workflows[name] = e instanceof Error ? e.message : String(e);
      }
    }

    let comfy: Record<string, unknown>;
    try {
      const stats = await this.deps.comfy.systemStats();
      const queue = await this.deps.comfy.queueDepth();
      const missingModels: string[] = [];
      for (const [folder, required] of Object.entries(REQUIRED_MODELS)) {
        const installed = await this.deps.comfy.models(folder);
        for (const file of required) {
          if (!installed.includes(file)) missingModels.push(`${folder}/${file}`);
        }
      }
      comfy = {
        reachable: true,
        version: stats.comfyVersion,
        pytorch: stats.pytorchVersion,
        vramFreeGb: Math.round((stats.vramFreeBytes / 1024 ** 3) * 10) / 10,
        vramTotalGb: Math.round((stats.vramTotalBytes / 1024 ** 3) * 10) / 10,
        queue,
        missingModels,
      };
    } catch (e) {
      comfy = { reachable: false, error: e instanceof Error ? e.message : String(e) };
    }

    return { comfy, workflows };
  }
}
