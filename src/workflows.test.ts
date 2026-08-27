// Substitution correctness against the REAL pinned files — the committed workflows/ JSONs are the
// fixtures, so any drift between the pins and the substitution contract fails here first.

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildDraft,
  buildDraftRef,
  buildFinal,
  buildFinalLora,
  buildFinalRefine,
  buildFinalRefineLora,
  buildScene,
  buildUpscale,
  loadWorkflow,
} from './workflows.js';

const workflowsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../workflows');

describe('buildDraft', () => {
  it('substitutes prompt, seed, prefix, and dims into BOTH latent and scheduler nodes', () => {
    const pinned = loadWorkflow(workflowsDir, 'draft');
    const g = buildDraft(pinned, {
      prompt: 'a test prompt',
      width: 1024,
      height: 1280,
      batchSize: 4,
      seed: 99,
      filenamePrefix: 'portrait-test-99',
    });
    expect(g['4'].inputs.text).toBe('a test prompt');
    expect(g['5'].inputs).toMatchObject({ width: 1024, height: 1280, batch_size: 4 });
    expect(g['8'].inputs).toMatchObject({ width: 1024, height: 1280, steps: 4 });
    expect(g['6'].inputs.noise_seed).toBe(99);
    expect(g['12'].inputs.filename_prefix).toBe('portrait-test-99');
  });

  it('never mutates the pinned graph', () => {
    const pinned = loadWorkflow(workflowsDir, 'draft');
    const before = JSON.stringify(pinned);
    buildDraft(pinned, {
      prompt: 'x',
      width: 16,
      height: 16,
      batchSize: 1,
      seed: 0,
      filenamePrefix: 'x',
    });
    expect(JSON.stringify(pinned)).toBe(before);
  });

  it('fails loudly when the pinned graph drifts from the contract', () => {
    const pinned = loadWorkflow(workflowsDir, 'draft');
    const broken = structuredClone(pinned);
    broken['8'].class_type = 'SomethingElse';
    expect(() =>
      buildDraft(broken, {
        prompt: 'x',
        width: 16,
        height: 16,
        batchSize: 1,
        seed: 0,
        filenamePrefix: 'x',
      })
    ).toThrow(/pinned workflow drift: node 8/);
  });
});

describe('buildDraftRef', () => {
  const params = {
    prompt: 'battle',
    width: 1536,
    height: 960,
    batchSize: 4,
    seed: 7,
    filenamePrefix: 'handout-battle-7',
  };

  it('fills all five slots and points the guider at the last ReferenceLatent', () => {
    const g = buildDraftRef(loadWorkflow(workflowsDir, 'draft-ref'), {
      ...params,
      uploadedReferences: ['a.png', 'b.png', 'c.png', 'd.png', 'e.png'],
    });
    expect(g['20'].inputs.image).toBe('a.png');
    expect(g['60'].inputs.image).toBe('e.png');
    expect(g['9'].inputs.conditioning).toEqual(['63', 0]);
    expect(g['8'].inputs.steps).toBe(6);
  });

  it('prunes unused slots and rewires the guider to the last used slot', () => {
    const g = buildDraftRef(loadWorkflow(workflowsDir, 'draft-ref'), {
      ...params,
      uploadedReferences: ['a.png', 'b.png'],
    });
    expect(g['20'].inputs.image).toBe('a.png');
    expect(g['30'].inputs.image).toBe('b.png');
    expect(g['9'].inputs.conditioning).toEqual(['33', 0]);
    for (const id of ['40', '41', '42', '43', '50', '51', '52', '53', '60', '61', '62', '63']) {
      expect(g[id]).toBeUndefined();
    }
    // no dangling links: every referenced node id still exists
    for (const n of Object.values(g)) {
      for (const v of Object.values(n.inputs)) {
        if (Array.isArray(v) && typeof v[0] === 'string') expect(g[v[0]]).toBeDefined();
      }
    }
  });

  it('rejects zero or more than five references', () => {
    const pinned = loadWorkflow(workflowsDir, 'draft-ref');
    expect(() => buildDraftRef(pinned, { ...params, uploadedReferences: [] })).toThrow(/1-5/);
    expect(() =>
      buildDraftRef(pinned, {
        ...params,
        uploadedReferences: ['1', '2', '3', '4', '5', '6'],
      })
    ).toThrow(/1-5/);
  });
});

describe('buildScene', () => {
  it('shares the reference-slot contract and substitutes output dims into the upscale tail', () => {
    const g = buildScene(loadWorkflow(workflowsDir, 'scene'), {
      prompt: 'battle',
      width: 1536,
      height: 960,
      batchSize: 1,
      seed: 9,
      filenamePrefix: 'handout-battle-9',
      uploadedReferences: ['a.png', 'b.png', 'c.png'],
      outWidth: 2560,
      outHeight: 1600,
    });
    expect(g['20'].inputs.image).toBe('a.png');
    expect(g['40'].inputs.image).toBe('c.png');
    expect(g['9'].inputs.conditioning).toEqual(['43', 0]);
    expect(g['50']).toBeUndefined();
    expect(g['60']).toBeUndefined();
    expect(g['72'].inputs).toMatchObject({ width: 2560, height: 1600 });
    expect(g['8'].inputs.steps).toBe(24);
    expect(g['1b']).toBeUndefined(); // no turbo lora on the money tier (owner, 2026-08-26)
  });
});

describe('buildFinal', () => {
  it('substitutes gen dims, output dims, seed, prompt, prefix', () => {
    const g = buildFinal(loadWorkflow(workflowsDir, 'final'), {
      prompt: 'p',
      genWidth: 1536,
      genHeight: 960,
      outWidth: 2560,
      outHeight: 1600,
      seed: 7,
      filenamePrefix: 'handout-x-7',
    });
    expect(g['2'].inputs.text).toBe('p');
    expect(g['5'].inputs).toMatchObject({ width: 1536, height: 960 });
    expect(g['6'].inputs.seed).toBe(7);
    expect(g['10'].inputs).toMatchObject({ width: 2560, height: 1600 });
    expect(g['11'].inputs.filename_prefix).toBe('handout-x-7');
  });
});

describe('buildFinalRefine', () => {
  it('substitutes uploaded image, denoise, seed, output dims', () => {
    const g = buildFinalRefine(loadWorkflow(workflowsDir, 'final-refine'), {
      prompt: 'p',
      uploadedImage: 'picked.png',
      denoise: 0.62,
      outWidth: 2048,
      outHeight: 2560,
      seed: 3,
      filenamePrefix: 'portrait-x-3',
    });
    expect(g['5'].inputs.image).toBe('picked.png');
    expect(g['7'].inputs).toMatchObject({ seed: 3, denoise: 0.62 });
    expect(g['11'].inputs).toMatchObject({ width: 2048, height: 2560 });
    expect(g['12'].inputs.filename_prefix).toBe('portrait-x-3');
  });
});

describe('buildFinalLora', () => {
  it('substitutes the final contract plus lora name and strength, and the sampler reads the lora', () => {
    const g = buildFinalLora(loadWorkflow(workflowsDir, 'final-lora'), {
      prompt: 'p',
      genWidth: 1536,
      genHeight: 960,
      outWidth: 2560,
      outHeight: 1600,
      seed: 5,
      filenamePrefix: 'handout-x-5',
      lora: 'dnd24art.safetensors',
      loraStrength: 0.8,
    });
    expect(g['2'].inputs.text).toBe('p');
    expect(g['15'].inputs).toMatchObject({
      lora_name: 'dnd24art.safetensors',
      strength_model: 0.8,
    });
    expect(g['6'].inputs.model).toEqual(['15', 0]);
    expect(g['11'].inputs.filename_prefix).toBe('handout-x-5');
  });
});

describe('buildFinalRefineLora', () => {
  it('substitutes the refine contract plus lora and the input normalize to gen dims', () => {
    const g = buildFinalRefineLora(loadWorkflow(workflowsDir, 'final-refine-lora'), {
      prompt: 'p',
      uploadedImage: 'scene-render.png',
      denoise: 0.3,
      genWidth: 1536,
      genHeight: 960,
      outWidth: 2560,
      outHeight: 1600,
      seed: 9,
      filenamePrefix: 'handout-x-9',
      lora: 'dnd24art.safetensors',
      loraStrength: 1.0,
    });
    expect(g['5'].inputs.image).toBe('scene-render.png');
    expect(g['13'].inputs).toMatchObject({ width: 1536, height: 960 });
    expect(g['6'].inputs.pixels).toEqual(['13', 0]);
    expect(g['15'].inputs).toMatchObject({
      lora_name: 'dnd24art.safetensors',
      strength_model: 1.0,
    });
    expect(g['7'].inputs).toMatchObject({ seed: 9, denoise: 0.3, model: ['15', 0] });
    expect(g['12'].inputs.filename_prefix).toBe('handout-x-9');
  });

  it('fails loudly when the lora node is missing from the pin', () => {
    const broken = structuredClone(loadWorkflow(workflowsDir, 'final-refine-lora'));
    delete broken['15'];
    expect(() =>
      buildFinalRefineLora(broken, {
        prompt: 'p',
        uploadedImage: 'x.png',
        denoise: 0.3,
        genWidth: 16,
        genHeight: 16,
        outWidth: 32,
        outHeight: 32,
        seed: 0,
        filenamePrefix: 'x',
        lora: 'x.safetensors',
        loraStrength: 1,
      })
    ).toThrow(/pinned workflow drift: node 15/);
  });
});

describe('buildUpscale', () => {
  it('substitutes uploaded image, output dims, prefix', () => {
    const g = buildUpscale(loadWorkflow(workflowsDir, 'upscale'), {
      uploadedImage: 'in.png',
      outWidth: 2048,
      outHeight: 2048,
      filenamePrefix: 'token-x-upscaled',
    });
    expect(g['1'].inputs.image).toBe('in.png');
    expect(g['4'].inputs).toMatchObject({ width: 2048, height: 2048 });
    expect(g['5'].inputs.filename_prefix).toBe('token-x-upscaled');
  });
});

describe('loadWorkflow', () => {
  it('names the missing file when a pin is absent', () => {
    expect(() => loadWorkflow(workflowsDir, 'nope' as never)).toThrow(/pinned workflow missing/);
  });
});
