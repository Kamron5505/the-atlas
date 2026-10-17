import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { listModels } from "./client.js";
import { atlasHome, type ResolvedProvider } from "./config.js";
import type { ModelInfo } from "./providers.js";

const TTL = 6 * 60 * 60 * 1000;
const mem = new Map<string, { at: number; models: ModelInfo[] }>();
const alive = new Map<string, { at: number; up: boolean }>();

const cacheFile = (id: string) => join(atlasHome(), "cache", `models-${id}.json`);

/** Live model list, cached in memory and on disk for 6 h. Errors → [] (not cached). */
export async function cachedModels(p: ResolvedProvider, signal?: AbortSignal): Promise<ModelInfo[]> {
  const key = `${p.def.id}@${p.baseURL}`;
  const hit = mem.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.models;
  try {
    if (existsSync(cacheFile(p.def.id))) {
      const disk = JSON.parse(readFileSync(cacheFile(p.def.id), "utf8")) as { at: number; base: string; models: ModelInfo[] };
      if (disk.base === p.baseURL && Date.now() - disk.at < TTL) {
        mem.set(key, { at: disk.at, models: disk.models });
        return disk.models;
      }
    }
  } catch {
    // unreadable cache → refetch
  }
  try {
    const models = await listModels(p, signal ?? AbortSignal.timeout(6000));
    const at = Date.now();
    mem.set(key, { at, models });
    try {
      mkdirSync(join(atlasHome(), "cache"), { recursive: true });
      writeFileSync(cacheFile(p.def.id), JSON.stringify({ at, base: p.baseURL, models }));
    } catch {
      // cache is best-effort
    }
    return models;
  } catch {
    return [];
  }
}

/** Is a local gateway (Ollama, OmniRoute) running? Cached 30 s; answers within ~0.8 s. */
export async function reachable(p: ResolvedProvider): Promise<boolean> {
  const hit = alive.get(p.baseURL);
  if (hit && Date.now() - hit.at < 30_000) return hit.up;
  let up = false;
  try {
    const res = await fetch(`${p.baseURL}/models`, {
      headers: p.apiKey ? { Authorization: `Bearer ${p.apiKey}` } : {},
      signal: AbortSignal.timeout(800),
    });
    up = res.ok || res.status === 401;
  } catch {
    up = false;
  }
  alive.set(p.baseURL, { at: Date.now(), up });
  return up;
}

const COOLDOWN_MS = 10 * 60 * 1000;
const cooldownFile = () => join(atlasHome(), "cache", "cooldown.json");
let cooling: Record<string, number> | undefined;

function loadCooling(): Record<string, number> {
  if (cooling) return cooling;
  try {
    cooling = existsSync(cooldownFile()) ? (JSON.parse(readFileSync(cooldownFile(), "utf8")) as Record<string, number>) : {};
  } catch {
    cooling = {};
  }
  return cooling;
}

/** Remember that a model answered 429/503 so the next requests (also in new processes) skip it for 10 min. */
export function markBusy(provider: string, model: string): void {
  const c = loadCooling();
  const now = Date.now();
  for (const [k, until] of Object.entries(c)) if (until < now) delete c[k];
  c[`${provider}/${model}`] = now + COOLDOWN_MS;
  try {
    mkdirSync(join(atlasHome(), "cache"), { recursive: true });
    writeFileSync(cooldownFile(), JSON.stringify(c));
  } catch {
    // best-effort
  }
}

export function isBusy(provider: string, model: string): boolean {
  return (loadCooling()[`${provider}/${model}`] ?? 0) > Date.now();
}

/** Text chat models that are free on this provider (skips safety classifiers / media models). */
export function freeChatModels(models: ModelInfo[]): ModelInfo[] {
  return models
    .filter((m) => m.free && m.id.endsWith(":free") && !/safety|guard|embed|tts|whisper|lyria|image|vl\b|omni|ocr/i.test(m.id))
    .sort((a, b) => qualityScore(b) - qualityScore(a));
}

/**
 * Rough answer-quality rank from the model id: bigger and "super/ultra/pro" first,
 * tiny ("nano", "mini", 2–4B) last — small free models often answer with gibberish.
 */
export function qualityScore(m: ModelInfo): number {
  const id = m.id.toLowerCase();
  // Total parameter count in billions, e.g. "120b-a12b" → 120, "gemma-4-31b" → 31.
  const sizes = [...id.matchAll(/(?<![a-z])(\d+(?:\.\d+)?)b(?![a-z])/g)].map((x) => Number(x[1]));
  const size = sizes.length ? Math.max(...sizes) : 0;
  let score = size ? Math.log2(size + 1) * 10 : 30;
  if (/\b(ultra|super|large|pro|maverick)\b/.test(id)) score += 25;
  if (/\b(nano|mini|small|xs|lite|tiny|lightning|micro)\b/.test(id)) score -= 30;
  if (size && size < 8) score -= 20;
  score += Math.min(10, (m.contextLength ?? 0) / 100_000);
  return score;
}

/** Test hook. */
export function clearModelCaches(): void {
  mem.clear();
  alive.clear();
  cooling = undefined;
}
