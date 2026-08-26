// Env/config loader. Loads .env from the repo root regardless of the launch cwd (Claude Code may
// start the server from anywhere), then resolves everything to absolute paths once so the rest of
// the code never touches process.env or relative paths.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// dist/config.js → repo root is one level up. (src/config.ts sees the same shape under vitest.)
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(repoRoot, '.env'), quiet: true });

function readPackageVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export const config = {
  server: { name: 'fvtt-mcp-artificer', version: readPackageVersion() },
  /** Headless ComfyUI API endpoint. */
  comfyUrl: process.env.COMFY_URL ?? 'http://127.0.0.1:8188',
  /** Where ComfyUI writes outputs (its --output-directory); PNGs are read straight off this path. */
  outputDir: process.env.COMFY_OUTPUT_DIR ?? 'D:\\Workbench\\LOCAL\\LocalAI\\output',
  /** Directory holding the pinned workflow JSONs (committed with the repo). */
  workflowsDir: path.join(repoRoot, 'workflows'),
  /** Max wait for a single generation job. */
  timeoutMs: Number(process.env.ARTIFICER_TIMEOUT_MS ?? 300_000),
};
