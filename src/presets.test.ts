import { describe, expect, it } from 'vitest';
import { KINDS, PRESETS, filenamePrefix, slugify } from './presets.js';

describe('presets', () => {
  it('locks the exact resolutions agreed in ROADMAP M1', () => {
    expect(PRESETS.handout).toEqual({
      gen: { width: 1536, height: 960 },
      out: { width: 2560, height: 1600 },
    });
    expect(PRESETS['scene-background']).toEqual(PRESETS.handout);
    expect(PRESETS.portrait).toEqual({
      gen: { width: 1024, height: 1280 },
      out: { width: 2048, height: 2560 },
    });
    expect(PRESETS.token).toEqual({
      gen: { width: 1024, height: 1024 },
      out: { width: 2048, height: 2048 },
    });
  });

  it('keeps every generation dimension 16-divisible (EmptyFlux2LatentImage requirement)', () => {
    for (const kind of KINDS) {
      expect(PRESETS[kind].gen.width % 16).toBe(0);
      expect(PRESETS[kind].gen.height % 16).toBe(0);
    }
  });

  it('keeps output resolution an exact 5:3 or matching aspect of the generation resolution', () => {
    for (const kind of KINDS) {
      const { gen, out } = PRESETS[kind];
      expect(gen.width / gen.height).toBeCloseTo(out.width / out.height, 5);
    }
  });
});

describe('filenamePrefix', () => {
  it('builds <kind>-<slug>-<seed> in the locked convention', () => {
    expect(filenamePrefix('handout', 'smugglers-cove', 424242)).toBe(
      'handout-smugglers-cove-424242'
    );
  });

  it('omits the seed segment when no seed is given', () => {
    expect(filenamePrefix('token', 'dwarf-artificer')).toBe('token-dwarf-artificer');
  });

  it('sanitizes arbitrary slugs to kebab-case', () => {
    expect(slugify("The Smugglers' COVE!")).toBe('the-smugglers-cove');
    expect(slugify('--a--b--')).toBe('a-b');
  });

  it('rejects slugs with no usable characters', () => {
    expect(() => slugify('!!!')).toThrow(/no usable characters/);
  });
});
