// Purpose presets — the tool surface speaks `kind`, never raw dimensions. Locked by ROADMAP M1;
// every generate dim is 16-divisible (EmptyFlux2LatentImage requirement) and every final output is
// generate → 4x-UltraSharp (×4) → lanczos downsample, per the locked resolution pipeline.

export const KINDS = ['handout', 'scene-background', 'portrait', 'token'] as const;
export type Kind = (typeof KINDS)[number];

export interface Preset {
  /** Native generation resolution (composition happens here — never generate at output size). */
  gen: { width: number; height: number };
  /** Finished output resolution after the upscale tail. */
  out: { width: number; height: number };
}

const ILLUSTRATION: Preset = {
  gen: { width: 1536, height: 960 },
  out: { width: 2560, height: 1600 },
};

export const PRESETS: Record<Kind, Preset> = {
  handout: ILLUSTRATION,
  'scene-background': ILLUSTRATION,
  portrait: { gen: { width: 1024, height: 1280 }, out: { width: 2048, height: 2560 } },
  token: { gen: { width: 1024, height: 1024 }, out: { width: 2048, height: 2048 } },
};

/**
 * Output filename prefix: `<kind>-<slug>-<seed>` (kebab-case, matching the campaign repos'
 * `maps/map-greenrest-01.jpg` style — locked with the owner 2026-08-26). ComfyUI appends
 * `_00001_.png` per batch image.
 */
export function filenamePrefix(kind: Kind, slug: string, seed?: number): string {
  const clean = slugify(slug);
  return seed === undefined ? `${kind}-${clean}` : `${kind}-${clean}-${seed}`;
}

/** Kebab-case sanitizer: lowercase, alphanumerics and hyphens only, collapsed, trimmed. */
export function slugify(raw: string): string {
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) throw new Error(`slug ${JSON.stringify(raw)} has no usable characters`);
  return slug;
}
