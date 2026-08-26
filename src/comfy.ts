// THE ComfyUI seam — the only file that talks HTTP to the headless instance. Everything above it
// deals in graphs and absolute file paths.

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Graph } from './workflows.js';

export interface ComfyOptions {
  url: string;
  outputDir: string;
  timeoutMs: number;
}

interface HistoryImage {
  filename: string;
  subfolder: string;
  type: string;
}

export interface SubmitResult {
  /** Absolute paths of the images this job wrote, in output order. */
  files: string[];
  elapsedMs: number;
}

export class Comfy {
  private readonly url: string;
  private readonly outputDir: string;
  private readonly timeoutMs: number;

  constructor(opts: ComfyOptions) {
    this.url = opts.url.replace(/\/+$/, '');
    this.outputDir = opts.outputDir;
    this.timeoutMs = opts.timeoutMs;
  }

  /** Submit a graph and wait for its outputs. Throws curated errors for every failure mode. */
  async submit(graph: Graph): Promise<SubmitResult> {
    const started = Date.now();
    const res = await this.fetch('/prompt', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: graph }),
    });
    const body = (await res.json()) as {
      prompt_id?: string;
      error?: { message?: string };
      node_errors?: Record<string, unknown>;
    };
    if (!res.ok || !body.prompt_id) {
      const details = body.node_errors ? ` node_errors: ${JSON.stringify(body.node_errors)}` : '';
      throw new Error(
        `ComfyUI rejected the job at validation: ${body.error?.message ?? res.statusText}.${details}`
      );
    }

    const entry = await this.waitForHistory(body.prompt_id, started);
    const status = entry.status as { status_str?: string; messages?: unknown } | undefined;
    if (status?.status_str !== 'success') {
      throw new Error(
        `ComfyUI job ${body.prompt_id} finished with status ${status?.status_str ?? 'unknown'}: ` +
          JSON.stringify(status?.messages ?? {})
      );
    }

    const files: string[] = [];
    const outputs = (entry.outputs ?? {}) as Record<string, { images?: HistoryImage[] }>;
    for (const out of Object.values(outputs)) {
      for (const img of out.images ?? []) {
        if (img.type !== 'output') continue;
        files.push(path.join(this.outputDir, img.subfolder, img.filename));
      }
    }
    if (files.length === 0) {
      throw new Error(`ComfyUI job ${body.prompt_id} succeeded but produced no output images`);
    }
    return { files, elapsedMs: Date.now() - started };
  }

  /** Upload a local image into ComfyUI's input store; returns the server-side name to substitute. */
  async upload(localPath: string): Promise<string> {
    let data: Buffer;
    try {
      data = await fs.readFile(localPath);
    } catch {
      throw new Error(`cannot read source image: ${localPath}`);
    }
    const form = new FormData();
    form.append('image', new Blob([new Uint8Array(data)]), path.basename(localPath));
    const res = await this.fetch('/upload/image', { method: 'POST', body: form });
    if (!res.ok) throw new Error(`image upload failed: HTTP ${res.status}`);
    const body = (await res.json()) as { name?: string; subfolder?: string };
    if (!body.name) throw new Error('image upload returned no name');
    return body.subfolder ? `${body.subfolder}/${body.name}` : body.name;
  }

  /** GET /system_stats — throws a launch hint if the instance is unreachable. */
  async systemStats(): Promise<{
    comfyVersion: string;
    pytorchVersion: string;
    vramFreeBytes: number;
    vramTotalBytes: number;
  }> {
    const res = await this.fetch('/system_stats', {}, 5_000);
    const body = (await res.json()) as {
      system?: { comfyui_version?: string; pytorch_version?: string };
      devices?: Array<{ vram_total?: number; vram_free?: number }>;
    };
    const gpu = body.devices?.[0];
    return {
      comfyVersion: body.system?.comfyui_version ?? 'unknown',
      pytorchVersion: body.system?.pytorch_version ?? 'unknown',
      vramFreeBytes: gpu?.vram_free ?? 0,
      vramTotalBytes: gpu?.vram_total ?? 0,
    };
  }

  /** GET /queue — running/pending counts. */
  async queueDepth(): Promise<{ running: number; pending: number }> {
    const res = await this.fetch('/queue', {}, 5_000);
    const body = (await res.json()) as { queue_running?: unknown[]; queue_pending?: unknown[] };
    return {
      running: body.queue_running?.length ?? 0,
      pending: body.queue_pending?.length ?? 0,
    };
  }

  /** GET /models/{folder} — installed model filenames (empty list if the endpoint is absent). */
  async models(folder: string): Promise<string[]> {
    try {
      const res = await this.fetch(`/models/${folder}`, {}, 5_000);
      const body = (await res.json()) as unknown;
      return Array.isArray(body) ? body.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }

  private async fetch(route: string, init: RequestInit, timeoutMs?: number): Promise<Response> {
    try {
      return await fetch(`${this.url}${route}`, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs ?? this.timeoutMs),
      });
    } catch (e) {
      throw new Error(
        `ComfyUI unreachable at ${this.url} (${e instanceof Error ? e.message : String(e)}). ` +
          'Start it headless with scripts/launch-comfyui.ps1.'
      );
    }
  }

  private async waitForHistory(
    promptId: string,
    started: number
  ): Promise<{ status?: unknown; outputs?: unknown }> {
    for (;;) {
      if (Date.now() - started > this.timeoutMs) {
        throw new Error(`ComfyUI job ${promptId} timed out after ${this.timeoutMs} ms`);
      }
      await new Promise(r => setTimeout(r, 750));
      const res = await this.fetch(`/history/${promptId}`, {}, 10_000);
      const body = (await res.json()) as Record<string, { status?: unknown; outputs?: unknown }>;
      const entry = body[promptId];
      if (entry) return entry;
    }
  }
}
