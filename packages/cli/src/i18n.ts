import type { AtlasConfig } from "@the-atlas/core";

export type Lang = "uz" | "ru" | "en";

const en = {
  tagline: "All AI assistants in one terminal",
  placeholder: "Ask anything…  (/help — commands)",
  thinking: "thinking",
  via: "via",
  fallback: "failed, switching →",
  cancelled: "[cancelled]",
  noProviders: "No providers yet. Add a free key:  atlas keys add openrouter   (or gemini, groq…)",
  help: [
    "/model <provider/model>  pick a model (e.g. groq/llama-3.3-70b-versatile)",
    "/provider <id|auto>      pick a provider; auto = free fallback chain",
    "/models                  list models of the current provider",
    "/clear                   clear the conversation",
    "/lang uz|ru|en           change language",
    "/exit                    quit   ·   Esc — stop answer   ·   Ctrl+C — quit",
  ].join("\n"),
  unknownCmd: "Unknown command. /help",
  saved: "Saved.",
  keyPrompt: "Paste API key for",
  keyHidden: "(input hidden)",
  keyGet: "Get a free key here:",
  keyRemoved: "Key removed:",
  keyNone: "No keys stored.",
  providerUnknown: "Unknown provider. See: atlas providers",
  serveReady: "Atlas server running",
  serveHint: "Point any OpenAI-compatible agent here:",
  ready: "ready",
  noKey: "no key",
  local: "local",
  free: "free",
  paid: "paid",
};

type Dict = typeof en;

const uz: Dict = {
  tagline: "Barcha AI yordamchilar bitta terminalda",
  placeholder: "Istalgan savolni yozing…  (/help — buyruqlar)",
  thinking: "o'ylayapti",
  via: "orqali",
  fallback: "ishlamadi, keyingisiga o'tyapmiz →",
  cancelled: "[to'xtatildi]",
  noProviders: "Hali provayder yo'q. Bepul kalit qo'shing:  atlas keys add openrouter   (yoki gemini, groq…)",
  help: [
    "/model <provayder/model>  model tanlash (masalan groq/llama-3.3-70b-versatile)",
    "/provider <id|auto>       provayder tanlash; auto = bepul zanjir",
    "/models                   joriy provayder modellari",
    "/clear                    suhbatni tozalash",
    "/lang uz|ru|en            tilni almashtirish",
    "/exit                     chiqish   ·   Esc — javobni to'xtatish   ·   Ctrl+C — chiqish",
  ].join("\n"),
  unknownCmd: "Noma'lum buyruq. /help",
  saved: "Saqlandi.",
  keyPrompt: "API kalitni kiriting:",
  keyHidden: "(yashirin kiritiladi)",
  keyGet: "Bepul kalitni shu yerdan oling:",
  keyRemoved: "Kalit o'chirildi:",
  keyNone: "Saqlangan kalit yo'q.",
  providerUnknown: "Noma'lum provayder. Ro'yxat: atlas providers",
  serveReady: "Atlas server ishlayapti",
  serveHint: "Istalgan OpenAI-mos agentni shu manzilga ulang:",
  ready: "tayyor",
  noKey: "kalit yo'q",
  local: "lokal",
  free: "bepul",
  paid: "pullik",
};

const ru: Dict = {
  tagline: "Все ИИ-ассистенты в одном терминале",
  placeholder: "Спросите что угодно…  (/help — команды)",
  thinking: "думает",
  via: "через",
  fallback: "не ответил, переключаюсь →",
  cancelled: "[остановлено]",
  noProviders: "Провайдеров пока нет. Добавьте бесплатный ключ:  atlas keys add openrouter   (или gemini, groq…)",
  help: [
    "/model <провайдер/модель>  выбрать модель (напр. groq/llama-3.3-70b-versatile)",
    "/provider <id|auto>        выбрать провайдера; auto = бесплатная цепочка",
    "/models                    модели текущего провайдера",
    "/clear                     очистить диалог",
    "/lang uz|ru|en             сменить язык",
    "/exit                      выход   ·   Esc — остановить ответ   ·   Ctrl+C — выход",
  ].join("\n"),
  unknownCmd: "Неизвестная команда. /help",
  saved: "Сохранено.",
  keyPrompt: "Вставьте API-ключ для",
  keyHidden: "(ввод скрыт)",
  keyGet: "Бесплатный ключ можно получить тут:",
  keyRemoved: "Ключ удалён:",
  keyNone: "Ключей нет.",
  providerUnknown: "Неизвестный провайдер. Список: atlas providers",
  serveReady: "Atlas-сервер запущен",
  serveHint: "Подключите любой OpenAI-совместимый агент сюда:",
  ready: "готов",
  noKey: "нет ключа",
  local: "локально",
  free: "бесплатно",
  paid: "платно",
};

const DICTS: Record<Lang, Dict> = { en, uz, ru };

export function detectLang(cfg: AtlasConfig): Lang {
  if (cfg.lang) return cfg.lang;
  const env = (process.env.ATLAS_LANG ?? process.env.LANG ?? Intl.DateTimeFormat().resolvedOptions().locale).toLowerCase();
  if (env.startsWith("uz")) return "uz";
  if (env.startsWith("ru")) return "ru";
  return "en";
}

export function t(lang: Lang): Dict {
  return DICTS[lang];
}

export function isLang(x: string): x is Lang {
  return x === "uz" || x === "ru" || x === "en";
}
