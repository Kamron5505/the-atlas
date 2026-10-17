import type { AtlasConfig } from "@the-atlas/core";

export type Lang = "uz" | "ru" | "en";

const en = {
  tips: ["Type /connect to plug in a free AI (OpenRouter, Gemini, Groq, OmniRoute…)", "Type /model to pick any model · /agents for 45+ coding agents", "Just ask — Atlas switches AI by itself when a free limit ends"],
  limitTitle: "free limit reached on",
  switchTo: "Switch to",
  chooseModel: "Choose another model…",
  connectAnother: "Connect another AI…",
  useAuto: "Auto — let Atlas pick a working free AI",
  shortcuts: "/ commands · esc interrupt · ctrl+c quit",
  switched: "limit reached → switched to",
  interrupt: "esc to interrupt",
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
    "/connect                 connect an AI (opens its key page)",
    "/agents                  45+ AI coding agents",
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
  tips: ["/connect — bepul AI ulash (OpenRouter, Gemini, Groq, OmniRoute…)", "/model — istalgan modelni tanlash · /agents — 45+ kod agentlari", "Shunchaki so'rang — bepul limit tugasa Atlas o'zi boshqa AI'ga o'tadi"],
  limitTitle: "bepul limit tugadi:",
  switchTo: "O'tish:",
  chooseModel: "Boshqa model tanlash…",
  connectAnother: "Yana bir AI ulash…",
  useAuto: "Auto — Atlas ishlaydigan bepul AI'ni o'zi tanlaydi",
  shortcuts: "/ buyruqlar · esc to'xtatish · ctrl+c chiqish",
  switched: "limit tugadi → o'tildi:",
  interrupt: "esc — to'xtatish",
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
    "/connect                  AI ulash (kalit sahifasi ochiladi)",
    "/agents                   45+ AI kod agentlari",
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
  tips: ["/connect — подключить бесплатный ИИ (OpenRouter, Gemini, Groq, OmniRoute…)", "/model — выбрать любую модель · /agents — 45+ агентов для кода", "Просто спросите — когда бесплатный лимит кончится, Atlas сам переключит ИИ"],
  limitTitle: "закончился бесплатный лимит:",
  switchTo: "Переключиться на",
  chooseModel: "Выбрать другую модель…",
  connectAnother: "Подключить ещё один ИИ…",
  useAuto: "Авто — Atlas сам выберет рабочий бесплатный ИИ",
  shortcuts: "/ команды · esc стоп · ctrl+c выход",
  switched: "лимит закончился → переключился на",
  interrupt: "esc — стоп",
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
    "/connect                   подключить ИИ (откроется страница ключа)",
    "/agents                    45+ ИИ-агентов для кода",
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
