// Pinned-workflow loading + substitution — the only place graphs are touched. The server submits
// the four committed JSONs under workflows/ verbatim except for the substitutions documented in
// workflows/README.md, addressed by node id and guarded by class_type assertions so an
// incompatible edit to a pinned file fails loudly here instead of deep inside ComfyUI.

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface GraphNode {
  class_type: string;
  inputs: Record<string, unknown>;
  _meta?: { title?: string };
}
export type Graph = Record<string, GraphNode>;

export type WorkflowName = 'draft' | 'final' | 'final-refine' | 'upscale';

export function loadWorkflow(dir: string, name: WorkflowName): Graph {
  const file = path.join(dir, `${name}.json`);
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    throw new Error(`pinned workflow missing: ${file}`);
  }
  return JSON.parse(raw) as Graph;
}

/** Assert the pinned graph still has the node the substitution contract expects. */
function node(graph: Graph, id: string, classType: string): GraphNode {
  const n = graph[id];
  if (!n) throw new Error(`pinned workflow drift: node ${id} missing (expected ${classType})`);
  if (n.class_type !== classType) {
    throw new Error(
      `pinned workflow drift: node ${id} is ${n.class_type}, contract expects ${classType}`
    );
  }
  return n;
}

export interface DraftParams {
  prompt: string;
  width: number;
  height: number;
  batchSize: number;
  seed: number;
  filenamePrefix: string;
}

/** workflows/draft.json — klein, 4-step, batched. Dims go into BOTH node 5 and node 8. */
export function buildDraft(pinned: Graph, p: DraftParams): Graph {
  const g = structuredClone(pinned);
  node(g, '4', 'CLIPTextEncode').inputs.text = p.prompt;
  const latent = node(g, '5', 'EmptyFlux2LatentImage');
  latent.inputs.width = p.width;
  latent.inputs.height = p.height;
  latent.inputs.batch_size = p.batchSize;
  node(g, '6', 'RandomNoise').inputs.noise_seed = p.seed;
  const sched = node(g, '8', 'Flux2Scheduler');
  sched.inputs.width = p.width;
  sched.inputs.height = p.height;
  node(g, '12', 'SaveImage').inputs.filename_prefix = p.filenamePrefix;
  return g;
}

export interface FinalParams {
  prompt: string;
  genWidth: number;
  genHeight: number;
  outWidth: number;
  outHeight: number;
  seed: number;
  filenamePrefix: string;
}

/** workflows/final.json — dev fp8 txt2img + upscale tail in one graph. */
export function buildFinal(pinned: Graph, p: FinalParams): Graph {
  const g = structuredClone(pinned);
  node(g, '2', 'CLIPTextEncode').inputs.text = p.prompt;
  const latent = node(g, '5', 'EmptySD3LatentImage');
  latent.inputs.width = p.genWidth;
  latent.inputs.height = p.genHeight;
  node(g, '6', 'KSampler').inputs.seed = p.seed;
  const scale = node(g, '10', 'ImageScale');
  scale.inputs.width = p.outWidth;
  scale.inputs.height = p.outHeight;
  node(g, '11', 'SaveImage').inputs.filename_prefix = p.filenamePrefix;
  return g;
}

export interface RefineParams {
  prompt: string;
  /** ComfyUI-side input name returned by /upload/image — NOT a local path. */
  uploadedImage: string;
  denoise: number;
  outWidth: number;
  outHeight: number;
  seed: number;
  filenamePrefix: string;
}

/** workflows/final-refine.json — dev fp8 img2img over an uploaded draft + upscale tail. */
export function buildFinalRefine(pinned: Graph, p: RefineParams): Graph {
  const g = structuredClone(pinned);
  node(g, '2', 'CLIPTextEncode').inputs.text = p.prompt;
  node(g, '5', 'LoadImage').inputs.image = p.uploadedImage;
  const sampler = node(g, '7', 'KSampler');
  sampler.inputs.seed = p.seed;
  sampler.inputs.denoise = p.denoise;
  const scale = node(g, '11', 'ImageScale');
  scale.inputs.width = p.outWidth;
  scale.inputs.height = p.outHeight;
  node(g, '12', 'SaveImage').inputs.filename_prefix = p.filenamePrefix;
  return g;
}

export interface UpscaleParams {
  /** ComfyUI-side input name returned by /upload/image — NOT a local path. */
  uploadedImage: string;
  outWidth: number;
  outHeight: number;
  filenamePrefix: string;
}

/** workflows/upscale.json — the upscale tail alone. */
export function buildUpscale(pinned: Graph, p: UpscaleParams): Graph {
  const g = structuredClone(pinned);
  node(g, '1', 'LoadImage').inputs.image = p.uploadedImage;
  const scale = node(g, '4', 'ImageScale');
  scale.inputs.width = p.outWidth;
  scale.inputs.height = p.outHeight;
  node(g, '5', 'SaveImage').inputs.filename_prefix = p.filenamePrefix;
  return g;
}
