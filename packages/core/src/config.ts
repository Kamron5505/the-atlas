import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getProvider, PROVIDERS, type ProviderDef } from "./providers.js";

export interface AtlasConfig {
  /** API keys per provider id. Stored locally only, never sent anywhere but the provider. */
  keys: Record<string, string>;
  /** Overrides of provider base URLs (e.g. OmniRoute on another host). */
  baseURLs: Record<string, string>;
  /** Preferred model per provider. */
  models: Record<string, string>;
  /** Provider order for auto-fallback. */
  order: string[];
  /** Selected provider; "auto" = first working provider in `order`. */
  provider: string;
  system?: string;
  lang?: "uz" | "ru" | "en";
  /** Bearer token required by `atlas serve`; generated on first serve. */
  serveToken?: string;
}

export const DEFAULT_CONFIG: AtlasConfig = {
  keys: {},
  baseURLs: {},
  models: {},
  order: ["openrouter", "gemini", "groq", "cerebras", "mistral", "github", "nvidia", "sambanova", "omniroute", "ollama"],
  provider: "auto",
};

export function atlasHome(): string {
  return process.env.ATLAS_HOME ?? join(homedir(), ".the-atlas");
}

export function configPath(): string {
  return join(atlasHome(), "config.json");
}

export function loadConfig(): AtlasConfig {
  const path = configPath();
  if (!existsSync(path)) return structuredClone(DEFAULT_CONFIG);
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<AtlasConfig>;
    return { ...structuredClone(DEFAULT_CONFIG), ...raw };
  } catch {
    throw new Error(`Config is corrupted: ${path}`);
  }
}

export function saveConfig(cfg: AtlasConfig): void {
  mkdirSync(atlasHome(), { recursive: true });
  const path = configPath();
  writeFileSync(path, JSON.stringify(cfg, null, 2), { encoding: "utf8", mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    // Windows: permissions are inherited from the user profile.
  }
}

export interface ResolvedProvider {
  def: ProviderDef;
  baseURL: string;
  apiKey?: string;
  model?: string;
}

export function resolveProvider(cfg: AtlasConfig, id: string): ResolvedProvider | undefined {
  const def = getProvider(id);
  if (!def) return undefined;
  const apiKey = cfg.keys[id] ?? (def.envKey ? process.env[def.envKey] : undefined);
  return {
    def,
    baseURL: (cfg.baseURLs[id] ?? def.baseURL).replace(/\/+$/, ""),
    apiKey: apiKey || undefined,
    model: cfg.models[id] ?? def.defaultModel,
  };
}

/** Providers that can be called right now (key present or not needed). */
export function readyProviders(cfg: AtlasConfig): ResolvedProvider[] {
  const ids = [...cfg.order, ...PROVIDERS.map((p) => p.id).filter((id) => !cfg.order.includes(id))];
  return ids
    .map((id) => resolveProvider(cfg, id))
    .filter((p): p is ResolvedProvider => !!p && (!p.def.keyRequired || !!p.apiKey));
}

export function maskKey(key: string): string {
  if (key.length <= 8) return "****";
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}
