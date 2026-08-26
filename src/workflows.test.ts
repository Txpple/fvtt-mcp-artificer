// Substitution correctness against the REAL pinned files — the committed workflows/ JSONs are the
// fixtures, so any drift between the pins and the substitution contract fails here first.

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildDraft,
  buildFinal,
  buildFinalRefine,
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
