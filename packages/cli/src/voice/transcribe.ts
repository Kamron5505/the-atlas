import { readFileSync, statSync } from "node:fs";
import { basename } from "node:path";
import { resolveProvider, type AtlasConfig } from "@the-atlas/core";
import type { Lang } from "../i18n.js";
import { remove, VoiceError } from "./record.js";
import type { VoiceDict } from "./i18n.js";

/** Upload limit of the Groq free tier (OpenAI's is the same). */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export interface SpeechEngine {
  provider: "groq" | "openai";
  url: string;
  apiKey: string;
  model: string;
}

/** Groq Whisper when a Groq key exists, otherwise OpenAI whisper-1, otherwise undefined. */
export function pickEngine(cfg: AtlasConfig): SpeechEngine | undefined {
  const groq = resolveProvider(cfg, "groq");
  if (groq?.apiKey) {
    return { provider: "groq", url: `${groq.baseURL}/audio/transcriptions`, apiKey: groq.apiKey, model: "whisper-large-v3-turbo" };
  }
  const openai = resolveProvider(cfg, "openai");
  if (openai?.apiKey) {
    return { provider: "openai", url: `${openai.baseURL}/audio/transcriptions`, apiKey: openai.apiKey, model: "whisper-1" };
  }
  return undefined;
}

export interface TranscribeOptions {
  cfg: AtlasConfig;
  /** Language hint for Whisper; improves Uzbek a lot. */
  lang?: Lang;
  signal?: AbortSignal;
  /** Keep the WAV after the request (default: delete it). */
  keepFile?: boolean;
}

async function errorText(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } | string };
    return typeof body.error === "string" ? body.error : (body.error?.message ?? "");
  } catch {
    return "";
  }
}

/** Sends a WAV to Whisper (Groq preferred) and returns the recognized text. */
export async function transcribe(file: string, opts: TranscribeOptions): Promise<string> {
  try {
    const engine = pickEngine(opts.cfg);
    if (!engine) throw new VoiceError("noKey", "No Groq or OpenAI key: /connect groq — free");
    if (statSync(file).size > MAX_UPLOAD_BYTES) throw new VoiceError("tooLarge", "Recording is larger than 25 MB");

    const form = new FormData();
    form.append("file", new Blob([readFileSync(file)], { type: "audio/wav" }), basename(file));
    form.append("model", engine.model);
    if (opts.lang) form.append("language", opts.lang);
    form.append("response_format", "json");
    form.append("temperature", "0");

    const res = await fetch(engine.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${engine.apiKey}` },
      body: form,
      signal: opts.signal,
    });
    if (!res.ok) {
      const msg = await errorText(res);
      const detail = `${engine.provider} ${res.status}${msg ? `: ${msg}` : ""}`;
      if (res.status === 429) {
        const retry = res.headers.get("retry-after");
        throw new VoiceError("quota", `Rate limit / quota reached${retry ? `, retry in ${retry}s` : ""}`, detail);
      }
      if (res.status === 413) throw new VoiceError("tooLarge", "Recording is too large", detail);
      if (res.status === 401 || res.status === 403) throw new VoiceError("badKey", "API key rejected", detail);
      throw new VoiceError("transcribeFailed", `Transcription failed (${detail})`, detail);
    }
    const data = (await res.json()) as { text?: string };
    return (data.text ?? "").trim();
  } finally {
    if (!opts.keepFile) remove(file);
  }
}

/** Localized one-line message for any voice/transcription error. */
export function voiceError(err: unknown, L: VoiceDict): string {
  if (err instanceof VoiceError) {
    const base = L.errors[err.code];
    if (err.code === "noFfmpeg") return `${base} ${err.detail ?? ""}`.trim();
    if ((err.code === "recordFailed" || err.code === "transcribeFailed") && err.detail) return `${base}: ${err.detail}`;
    return base;
  }
  if (err instanceof Error && err.name === "AbortError") return L.cancelled;
  return `${L.errors.transcribeFailed}: ${err instanceof Error ? err.message : String(err)}`;
}
