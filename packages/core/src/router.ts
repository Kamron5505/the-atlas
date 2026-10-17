import { readyProviders, resolveProvider, type AtlasConfig, type ResolvedProvider } from "./config.js";
import { ProviderError, streamChat, type ChatMessage, type ChatOptions } from "./client.js";

export interface RouteEvent {
  type: "provider" | "fallback";
  provider: string;
  model?: string;
  error?: string;
}

export interface RouteOptions extends ChatOptions {
  /** Explicit provider; otherwise cfg.provider ("auto" = fallback chain). */
  provider?: string;
  onEvent?: (e: RouteEvent) => void;
}

export function candidates(cfg: AtlasConfig, provider: string): ResolvedProvider[] {
  if (provider !== "auto") {
    const p = resolveProvider(cfg, provider);
    if (!p) throw new Error(`Unknown provider: ${provider}`);
    if (p.def.keyRequired && !p.apiKey) throw new Error(`No API key for ${p.def.name}. Run: atlas keys add ${p.def.id}`);
    return [p];
  }
  const ready = readyProviders(cfg);
  if (ready.length === 0) throw new Error("No providers configured. Run: atlas keys add openrouter");
  return ready;
}

/**
 * Streams a reply, falling back to the next provider on retryable errors.
 * Fallback only happens before the first token, so output is never mixed.
 */
export async function* routeChat(cfg: AtlasConfig, messages: ChatMessage[], opts: RouteOptions = {}): AsyncGenerator<string> {
  const list = candidates(cfg, opts.provider ?? cfg.provider);
  const errors: string[] = [];
  for (const p of list) {
    // An explicit model only applies to a single explicit provider.
    const model = list.length === 1 ? (opts.model ?? p.model) : p.model;
    opts.onEvent?.({ type: "provider", provider: p.def.id, model });
    let started = false;
    try {
      for await (const chunk of streamChat(p, messages, { ...opts, model })) {
        started = true;
        yield chunk;
      }
      return;
    } catch (err) {
      if (started || !(err instanceof ProviderError) || !err.retryable) throw err;
      errors.push(err.message);
      opts.onEvent?.({ type: "fallback", provider: p.def.id, error: err.message });
    }
  }
  throw new Error(`All providers failed:\n- ${errors.join("\n- ")}`);
}
