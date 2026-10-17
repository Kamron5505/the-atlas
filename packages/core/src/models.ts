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

/** Text chat models that are free on this provider (skips safety classifiers / media models). */
export function freeChatModels(models: ModelInfo[]): ModelInfo[] {
  return models.filter((m) => m.free && m.id.endsWith(":free") && !/safety|guard|embed|tts|whisper|lyria|image/i.test(m.id));
}

/** Test hook. */
export function clearModelCaches(): void {
  mem.clear();
  alive.clear();
}
