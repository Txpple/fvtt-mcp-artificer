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

export type WorkflowName =
  | 'draft'
  | 'draft-ref'
  | 'scene'
  | 'final'
  | 'final-lora'
  | 'final-refine'
  | 'final-refine-lora'
  | 'upscale';

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

export interface DraftRefParams extends DraftParams {
  /** ComfyUI-side input names from /upload/image, in binding order. 1–5 entries. */
  uploadedReferences: string[];
}

/** The five reference slots in workflows/draft-ref.json: [LoadImage, ReferenceLatent] node ids. */
const REF_SLOTS: Array<{ load: string; scale: string; encode: string; ref: string }> = [
  { load: '20', scale: '21', encode: '22', ref: '23' },
  { load: '30', scale: '31', encode: '32', ref: '33' },
  { load: '40', scale: '41', encode: '42', ref: '43' },
  { load: '50', scale: '51', encode: '52', ref: '53' },
  { load: '60', scale: '61', encode: '62', ref: '63' },
];

/**
 * workflows/draft-ref.json — klein with FLUX.2 reference conditioning (6-step, proven 2026-08-26).
 * The builders' one allowed structural operation: unused reference slots are PRUNED (deleted) and
 * BasicGuider's conditioning is rewired to the last used slot's ReferenceLatent — deterministic,
 * covered by tests, and documented in workflows/README.md.
 */
export function buildDraftRef(pinned: Graph, p: DraftRefParams): Graph {
  return applyRefGraph(pinned, p);
}

export interface SceneParams extends DraftRefParams {
  outWidth: number;
  outHeight: number;
}

/**
 * workflows/scene.json — FLUX.2-dev fp8 + turbo lora with reference conditioning and the upscale
 * tail, one graph (~30 s warm on the 5090). Same slot layout and pruning rules as draft-ref.
 */
export function buildScene(pinned: Graph, p: SceneParams): Graph {
  const g = applyRefGraph(pinned, p);
  const scale = node(g, '72', 'ImageScale');
  scale.inputs.width = p.outWidth;
  scale.inputs.height = p.outHeight;
  return g;
}

/** Shared body of buildDraftRef/buildScene: substitutions + reference-slot fill and pruning. */
function applyRefGraph(pinned: Graph, p: DraftRefParams): Graph {
  const n = p.uploadedReferences.length;
  if (n < 1 || n > REF_SLOTS.length) {
    throw new Error(`reference workflows need 1-${REF_SLOTS.length} reference images, got ${n}`);
  }
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

  REF_SLOTS.forEach((slot, i) => {
    if (i < n) {
      node(g, slot.load, 'LoadImage').inputs.image = p.uploadedReferences[i];
    } else {
      node(g, slot.load, 'LoadImage');
      delete g[slot.load];
      delete g[slot.scale];
      delete g[slot.encode];
      delete g[slot.ref];
    }
  });
  node(g, '9', 'BasicGuider').inputs.conditioning = [REF_SLOTS[n - 1].ref, 0];
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

export interface LoraParams {
  /** LoRA filename as ComfyUI sees it (models/loras/), e.g. "dnd24art.safetensors". */
  lora: string;
  loraStrength: number;
}

/**
 * workflows/final-lora.json — final.json plus a LoraLoaderModelOnly (node 15) feeding the
 * sampler. Same substitution contract as buildFinal, plus the LoRA name and strength.
 */
export function buildFinalLora(pinned: Graph, p: FinalParams & LoraParams): Graph {
  const g = buildFinal(pinned, p);
  const lora = node(g, '15', 'LoraLoaderModelOnly');
  lora.inputs.lora_name = p.lora;
  lora.inputs.strength_model = p.loraStrength;
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

/**
 * workflows/final-refine-lora.json — the universal style tail: refine plus a
 * LoraLoaderModelOnly (node 15) and an input normalize to gen dims (node 13, so a finished
 * 2560×1600 render — e.g. scene-mode output — re-samples at composition resolution instead of
 * 4 MP). Style transfers hardest at denoise 0.25–0.4; structure is proven to hold there.
 */
export interface RefineLoraParams extends RefineParams, LoraParams {
  genWidth: number;
  genHeight: number;
}

export function buildFinalRefineLora(pinned: Graph, p: RefineLoraParams): Graph {
  const g = structuredClone(pinned);
  node(g, '2', 'CLIPTextEncode').inputs.text = p.prompt;
  node(g, '5', 'LoadImage').inputs.image = p.uploadedImage;
  const normalize = node(g, '13', 'ImageScale');
  normalize.inputs.width = p.genWidth;
  normalize.inputs.height = p.genHeight;
  const lora = node(g, '15', 'LoraLoaderModelOnly');
  lora.inputs.lora_name = p.lora;
  lora.inputs.strength_model = p.loraStrength;
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
