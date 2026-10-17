export interface ProviderDef {
  id: string;
  name: string;
  baseURL: string;
  /** Env var checked when no key is stored in config. */
  envKey?: string;
  keyRequired: boolean;
  /** Fallback model when the user has not picked one. */
  defaultModel?: string;
  /** Has a free tier usable with a personal key. */
  free: boolean;
  signupUrl?: string;
  /** Model ids are filtered by this when listing free models. */
  freeModelFilter?: (model: ModelInfo) => boolean;
}

export interface ModelInfo {
  id: string;
  provider: string;
  name?: string;
  contextLength?: number;
  free?: boolean;
  /** Raw pricing object if the provider returns one (OpenRouter). */
  pricing?: { prompt?: string; completion?: string };
}

export const PROVIDERS: ProviderDef[] = [
  {
    id: "openrouter",
    name: "OpenRouter",
    baseURL: "https://openrouter.ai/api/v1",
    envKey: "OPENROUTER_API_KEY",
    keyRequired: true,
    // Router that always points at a currently-free model.
    defaultModel: "openrouter/free",
    free: true,
    signupUrl: "https://openrouter.ai/keys",
    freeModelFilter: (m) =>
      m.id.endsWith(":free") || (m.pricing?.prompt === "0" && m.pricing?.completion === "0"),
  },
  {
    id: "omniroute",
    name: "OmniRoute (local)",
    baseURL: "http://localhost:20128/v1",
    envKey: "OMNIROUTE_API_KEY",
    keyRequired: false,
    free: true,
    signupUrl: "https://github.com/diegosouzapw/OmniRoute",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    envKey: "GEMINI_API_KEY",
    keyRequired: true,
    defaultModel: "gemini-2.5-flash",
    free: true,
    signupUrl: "https://aistudio.google.com/apikey",
  },
  {
    id: "groq",
    name: "Groq",
    baseURL: "https://api.groq.com/openai/v1",
    envKey: "GROQ_API_KEY",
    keyRequired: true,
    defaultModel: "llama-3.3-70b-versatile",
    free: true,
    signupUrl: "https://console.groq.com/keys",
  },
  {
    id: "cerebras",
    name: "Cerebras",
    baseURL: "https://api.cerebras.ai/v1",
    envKey: "CEREBRAS_API_KEY",
    keyRequired: true,
    defaultModel: "llama-3.3-70b",
    free: true,
    signupUrl: "https://cloud.cerebras.ai",
  },
  {
    id: "mistral",
    name: "Mistral",
    baseURL: "https://api.mistral.ai/v1",
    envKey: "MISTRAL_API_KEY",
    keyRequired: true,
    defaultModel: "mistral-small-latest",
    free: true,
    signupUrl: "https://console.mistral.ai/api-keys",
  },
  {
    id: "github",
    name: "GitHub Models",
    baseURL: "https://models.github.ai/inference",
    envKey: "GITHUB_TOKEN",
    keyRequired: true,
    defaultModel: "openai/gpt-4.1-mini",
    free: true,
    signupUrl: "https://github.com/settings/tokens",
  },
  {
    id: "nvidia",
    name: "NVIDIA NIM",
    baseURL: "https://integrate.api.nvidia.com/v1",
    envKey: "NVIDIA_API_KEY",
    keyRequired: true,
    defaultModel: "meta/llama-3.3-70b-instruct",
    free: true,
    signupUrl: "https://build.nvidia.com",
  },
  {
    id: "sambanova",
    name: "SambaNova",
    baseURL: "https://api.sambanova.ai/v1",
    envKey: "SAMBANOVA_API_KEY",
    keyRequired: true,
    defaultModel: "Meta-Llama-3.3-70B-Instruct",
    free: true,
    signupUrl: "https://cloud.sambanova.ai/apis",
  },
  {
    id: "ollama",
    name: "Ollama (local)",
    baseURL: "http://localhost:11434/v1",
    keyRequired: false,
    defaultModel: "llama3.2",
    free: true,
    signupUrl: "https://ollama.com/download",
  },
  {
    id: "openai",
    name: "OpenAI",
    baseURL: "https://api.openai.com/v1",
    envKey: "OPENAI_API_KEY",
    keyRequired: true,
    defaultModel: "gpt-4.1-mini",
    free: false,
    signupUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    baseURL: "https://api.anthropic.com/v1",
    envKey: "ANTHROPIC_API_KEY",
    keyRequired: true,
    defaultModel: "claude-sonnet-5-5",
    free: false,
    signupUrl: "https://console.anthropic.com/settings/keys",
  },
];

export function getProvider(id: string): ProviderDef | undefined {
  return PROVIDERS.find((p) => p.id === id);
}
