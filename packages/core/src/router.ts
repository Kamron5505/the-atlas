import { readyProviders, resolveProvider, type AtlasConfig, type ResolvedProvider } from "./config.js";
import { ProviderError, streamChat, streamChatTools, type ChatMessage, type ChatOptions, type ToolSpec, type ToolStreamEvent } from "./client.js";
import { cachedModels, freeChatModels, reachable } from "./models.js";

/** Every candidate failed; `limited` = at least one hit its free limit. */
export class RouteError extends Error {
  constructor(readonly errors: ProviderError[]) {
    super(`All providers failed:\n- ${errors.map((e) => e.message).join("\n- ")}`);
    this.name = "RouteError";
  }

  get limited(): boolean {
    return this.errors.some((e) => e.limited);
  }
}

export interface RouteEvent {
  type: "provider" | "fallback";
  provider: string;
  model?: string;
  error?: string;
  limited?: boolean;
}

export interface RouteOptions extends ChatOptions {
  /** Explicit provider; otherwise cfg.provider ("auto" = fallback chain). */
  provider?: string;
  onEvent?: (e: RouteEvent) => void;
}

/** How many extra free models of the same provider to try before moving on. */
const MODEL_RETRIES = 2;

export function candidates(cfg: AtlasConfig, provider: string): ResolvedProvider[] {
  if (provider !== "auto") {
    const p = resolveProvider(cfg, provider);
    if (!p) throw new Error(`Unknown provider: ${provider}`);
    if (p.def.keyRequired && !p.apiKey) throw new Error(`No API key for ${p.def.name}. Run: atlas keys add ${p.def.id}`);
    return [p];
  }
  const ready = readyProviders(cfg);
  if (ready.length === 0) throw new Error("No providers configured. Run: atlas connect");
  return ready;
}

/**
 * Models to try on one provider: the chosen/default one, then (when the provider
 * lists free models, e.g. OpenRouter) a couple of other free ones — free models
 * there often 404 ("no longer free") or 429 (upstream busy).
 */
async function modelsToTry(p: ResolvedProvider, explicit: string | undefined, signal?: AbortSignal): Promise<string[]> {
  const first = explicit ?? p.model;
  const needList = !first || !!p.def.freeModelFilter;
  const list = needList ? await cachedModels(p, signal) : [];
  const out: string[] = [];
  if (first) out.push(first);
  else {
    const pick = freeChatModels(list)[0] ?? list[0];
    if (pick) out.push(pick.id);
  }
  if (p.def.freeModelFilter) {
    // The provider's own default (e.g. the openrouter/free router) is the best second try.
    const backups = [p.def.defaultModel, ...freeChatModels(list).map((m) => m.id)];
    for (const id of backups) {
      if (out.length > MODEL_RETRIES) break;
      if (id && !out.includes(id)) out.push(id);
    }
  }
  return out;
}

/** Errors where another model of the same provider may still work. */
const modelLevel = (e: ProviderError) => e.status === 404 || e.status === 429 || e.status === 502 || e.status === 503;

/**
 * Streams a reply, falling back to other free models, then to the next provider.
 * Fallback only happens before the first token, so output is never mixed.
 * Local gateways that aren't running are skipped silently in auto mode.
 */
export async function* routeChat(cfg: AtlasConfig, messages: ChatMessage[], opts: RouteOptions = {}): AsyncGenerator<string> {
  const list = candidates(cfg, opts.provider ?? cfg.provider);
  const auto = list.length > 1;
  const errors: ProviderError[] = [];
  for (const p of list) {
    if (auto && !p.def.keyRequired && !(await reachable(p))) continue;
    // An explicit model only applies to a single explicit provider.
    const models = await modelsToTry(p, auto ? undefined : opts.model, opts.signal);
    if (!models.length) {
      errors.push(new ProviderError(`${p.def.name}: no model available`, p.def.id, 404));
      continue;
    }
    for (const [i, model] of models.entries()) {
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
        errors.push(err);
        const lastHere = i === models.length - 1 || !modelLevel(err);
        opts.onEvent?.({ type: "fallback", provider: p.def.id, model, error: err.message, limited: err.limited });
        if (lastHere) break;
      }
    }
  }
  if (!errors.length) throw new Error("No AI is reachable. Run: atlas connect");
  throw new RouteError(errors);
}

/** The provider/model rejected function calling (e.g. 400 "does not support tool use"). */
export function rejectsTools(e: ProviderError): boolean {
  return (e.status === 400 || e.status === 404 || e.status === 422) && /tool|function/i.test(e.message);
}

/**
 * One agent step with tools: like routeChat, but yields ToolStreamEvents and also
 * falls back when a model rejects tools. Fallback only before the first event.
 */
export async function* routeAgentStep(
  cfg: AtlasConfig,
  messages: ChatMessage[],
  tools: ToolSpec[],
  opts: RouteOptions = {},
): AsyncGenerator<ToolStreamEvent> {
  const list = candidates(cfg, opts.provider ?? cfg.provider);
  const auto = list.length > 1;
  const errors: ProviderError[] = [];
  for (const p of list) {
    if (auto && !p.def.keyRequired && !(await reachable(p))) continue;
    const models = await modelsToTry(p, auto ? undefined : opts.model, opts.signal);
    if (!models.length) {
      errors.push(new ProviderError(`${p.def.name}: no model available`, p.def.id, 404));
      continue;
    }
    for (const [i, model] of models.entries()) {
      opts.onEvent?.({ type: "provider", provider: p.def.id, model });
      let started = false;
      try {
        for await (const ev of streamChatTools(p, messages, tools, { ...opts, model })) {
          if (ev.type !== "done") started = true;
          yield ev;
        }
        return;
      } catch (err) {
        if (started || !(err instanceof ProviderError)) throw err;
        const noTools = rejectsTools(err);
        if (!noTools && !err.retryable) throw err;
        errors.push(err);
        const lastHere = i === models.length - 1 || !(noTools || modelLevel(err));
        opts.onEvent?.({ type: "fallback", provider: p.def.id, model, error: err.message, limited: err.limited });
        if (lastHere) break;
      }
    }
  }
  if (!errors.length) throw new Error("No AI is reachable. Run: atlas connect");
  throw new RouteError(errors);
}
