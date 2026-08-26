// Live acceptance against the real headless ComfyUI: status, a 1-image draft, and the upscale
// tail. Asserts on real files landing in the configured output directory.

import * as fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Comfy } from '../../src/comfy.js';
import { config } from '../../src/config.js';
import { buildToolRegistry } from '../../src/registry.js';

const comfy = new Comfy({
  url: config.comfyUrl,
  outputDir: config.outputDir,
  timeoutMs: config.timeoutMs,
});
const registry = buildToolRegistry({ comfy, workflowsDir: config.workflowsDir });

describe('live ComfyUI loop', () => {
  it('reports a healthy instance with no missing models', async () => {
    const status = (await registry.dispatch('artificer-status', {})) as any;
    expect(status.comfy.reachable).toBe(true);
    expect(status.comfy.missingModels).toEqual([]);
    expect(Object.values(status.workflows)).toEqual(['ok', 'ok', 'ok', 'ok', 'ok']);
  });

  it('generates a 1-image token draft and finishes it through the upscale tail', async () => {
    const draft = (await registry.dispatch('generate-image', {
      kind: 'token',
      prompt: 'fantasy character token, goblin scout, waist-up, centered, plain dark background',
      slug: 'it-goblin-scout',
      mode: 'draft',
      batch: 1,
      seed: 12345,
    })) as any;
    expect(draft.files).toHaveLength(1);
    expect(draft.files[0]).toMatch(/token-it-goblin-scout-12345/);
    expect(fs.existsSync(draft.files[0])).toBe(true);

    const upscaled = (await registry.dispatch('upscale-image', {
      sourceImage: draft.files[0],
      kind: 'token',
      slug: 'it-goblin-scout',
    })) as any;
    expect(upscaled.files).toHaveLength(1);
    expect(fs.existsSync(upscaled.files[0])).toBe(true);
  });

  it('generates a reference-conditioned draft from its own prior output', async () => {
    const base = (await registry.dispatch('generate-image', {
      kind: 'portrait',
      prompt: 'fantasy character portrait of a goblin scout, oil painting style',
      slug: 'it-ref-base',
      mode: 'draft',
      batch: 1,
      seed: 777,
    })) as any;

    const ref = (await registry.dispatch('generate-image', {
      kind: 'handout',
      prompt:
        'fantasy illustration, a goblin scout crouched on a mossy boulder in a misty forest, ' +
        'oil painting style',
      slug: 'it-ref-scene',
      mode: 'draft',
      batch: 1,
      seed: 778,
      referenceImages: [base.files[0]],
    })) as any;
    expect(ref.files).toHaveLength(1);
    expect(fs.existsSync(ref.files[0])).toBe(true);
  });
});
