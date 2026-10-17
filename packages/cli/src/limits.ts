import { atlasHome } from "@the-atlas/core";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Approximate free daily request quotas for providers that don't send rate-limit
 * headers. Shown with "≈"; real header values always win.
 */
export const FREE_DAILY_ESTIMATE: Record<string, number> = {
  openrouter: 50,
  gemini: 250,
  github: 150,
};

export interface LimitInfo {
  remaining: number;
  limit: number;
  /** "day" | "minute" | "" — the window the numbers refer to. */
  window: string;
  /** "header" = reported by the provider; "estimate" = local count vs FREE_DAILY_ESTIMATE. */
  source: "header" | "estimate";
}

interface State {
  date: string;
  used: Record<string, number>;
  last: Record<string, LimitInfo & { at: string }>;
}

const file = () => join(atlasHome(), "limits.json");
const today = () => new Date().toISOString().slice(0, 10);

function load(): State {
  try {
    if (existsSync(file())) {
      const s = JSON.parse(readFileSync(file(), "utf8")) as State;
      if (s.date === today()) return s;
      return { date: today(), used: {}, last: {} };
    }
  } catch {
    // corrupted → start fresh
  }
  return { date: today(), used: {}, last: {} };
}

function save(s: State): void {
  mkdirSync(atlasHome(), { recursive: true });
  writeFileSync(`${file()}.tmp`, JSON.stringify(s));
  renameSync(`${file()}.tmp`, file());
}

/**
 * Reads remaining/limit request counters from headers. Prefers per-day counters
 * (Groq/Cerebras style), falls back to per-minute / generic ones (OpenRouter).
 */
export function parseRateHeaders(headers: Headers): LimitInfo | undefined {
  const all: Record<string, string> = {};
  headers.forEach((v, k) => (all[k.toLowerCase()] = v));
  const remainingKeys = Object.keys(all).filter((k) => k.includes("ratelimit") && k.includes("remaining") && !k.includes("token"));
  const rank = (k: string) => (k.includes("day") ? 0 : k.includes("request") ? 1 : 2);
  for (const rk of remainingKeys.sort((a, b) => rank(a) - rank(b))) {
    const lk = rk.replace("remaining", "limit");
    const remaining = Number.parseInt(all[rk]!, 10);
    const limit = Number.parseInt(all[lk] ?? "", 10);
    if (Number.isFinite(remaining) && Number.isFinite(limit) && limit > 0) {
      return { remaining, limit, window: rk.includes("day") ? "day" : rk.includes("minute") ? "minute" : "", source: "header" };
    }
  }
  return undefined;
}

/** Call after every successful request. */
export function recordRequest(provider: string, headers?: Headers): void {
  const s = load();
  s.used[provider] = (s.used[provider] ?? 0) + 1;
  const h = headers ? parseRateHeaders(headers) : undefined;
  if (h) s.last[provider] = { ...h, at: new Date().toISOString() };
  save(s);
}

/** Mark a provider as exhausted after a 429. */
export function recordLimited(provider: string): void {
  const s = load();
  const prev = s.last[provider];
  s.last[provider] = { remaining: 0, limit: prev?.limit ?? FREE_DAILY_ESTIMATE[provider] ?? 1, window: prev?.window ?? "day", source: "header", at: new Date().toISOString() };
  save(s);
}

export function limitFor(provider: string): LimitInfo | undefined {
  const s = load();
  const h = s.last[provider];
  if (h) return h;
  const est = FREE_DAILY_ESTIMATE[provider];
  if (!est) return undefined;
  return { remaining: Math.max(0, est - (s.used[provider] ?? 0)), limit: est, window: "day", source: "estimate" };
}

export function remainingPct(l: LimitInfo): number {
  return Math.round((l.remaining / l.limit) * 100);
}

/** "≈42/50" or "980/1000" */
export function formatLimit(l: LimitInfo): string {
  return `${l.source === "estimate" ? "≈" : ""}${l.remaining}/${l.limit}${l.window === "minute" ? "/min" : ""}`;
}

/** Warn when 15% or less is left of a daily (or unknown-window) quota. */
export function isLow(l: LimitInfo): boolean {
  return l.window !== "minute" && remainingPct(l) <= 15;
}
