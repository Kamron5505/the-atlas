/** Site chrome + landing copy for uz (root), ru, en. Keep strings short. */
export type Locale = "uz" | "ru" | "en";

export const GITHUB = "https://github.com/Kamron5505/the-atlas";
export const AIDEVIX = "https://github.com/SunnatbekYusupovTech/sunnatbeeCLI";
export const NODE_URL = "https://nodejs.org/en/download";

/** Top nav: slug is relative to the locale root. */
export const NAV = [
  { key: "docs", slug: "getting-started/installation/", match: ["getting-started", "guides"] },
  { key: "reference", slug: "reference/commands/", match: ["reference"] },
  { key: "extensions", slug: "extensions/", match: ["extensions"] },
  { key: "resources", slug: "resources/", match: ["resources"] },
  { key: "changelog", slug: "changelog/", match: ["changelog"] },
  { key: "feedback", slug: "feedback/", match: ["feedback"] },
] as const;

type NavKey = (typeof NAV)[number]["key"];

interface Feature {
  title: string;
  body: string;
}

export interface Dict {
  nav: Record<NavKey, string>;
  navLabel: string;
  pitch: string;
  sub: string;
  node: string;
  nodeLink: string;
  docsBtn: string;
  installLabel: string;
  demoTitle: string;
  featuresTitle: string;
  features: [Feature, Feature, Feature, Feature, Feature, Feature];
  compare: string;
  statusline: string;
  stepsTitle: string;
  steps: [Feature, Feature, Feature];
  faqTitle: string;
  faq: { q: string; a: string }[];
  license: string;
  credit: string;
}

const uz: Dict = {
  nav: {
    docs: "Hujjatlar",
    reference: "Ma'lumotnoma",
    extensions: "Kengaytmalar",
    resources: "Resurslar",
    changelog: "O'zgarishlar",
    feedback: "Fikr bildirish",
  },
  navLabel: "Asosiy bo'limlar",
  pitch: "Barcha AI yordamchilar bitta terminalda.",
  sub: "Avtomatik almashadigan bepul modellar, 47 ta AI agent va fayllarni ruxsatingiz bilan tahrirlaydigan agent rejimi.",
  node: "Node.js 22+ kerak.",
  nodeLink: "Yuklab olish",
  docsBtn: "Hujjatlar",
  installLabel: "O'rnatish",
  demoTitle: "Bir marta so'rang. Model band bo'lsa, keyingisi javob beradi.",
  featuresTitle: "Ichida nima bor",
  features: [
    {
      title: "Bepul modellar, avtomatik almashish",
      body: "OpenRouter, Gemini, Groq, Cerebras, Mistral va boshqalar. Limit tugasa, keyingi provayder javob beradi.",
    },
    {
      title: "Bir bosishda kirish",
      body: "atlas connect brauzerni ochadi. OpenRouter bir bosishda ulanadi, boshqa kalitlar kiritilganda tekshiriladi.",
    },
    {
      title: "47 ta AI agent",
      body: "Claude Code, Codex, Gemini CLI, Aider va boshqalar. Har biri yangi oynada o'rnatiladi va ishga tushadi.",
    },
    {
      title: "Agent rejimi",
      body: "AI papkangizdagi fayllarni o'qiydi, tahrirlaydi va buyruqlarni ishga tushiradi. Har bir o'zgarish ruxsatingizni kutadi.",
    },
    {
      title: "MCP vositalari",
      body: "MCP serverlarni tayyor presetlardan qo'shing yoki Claude'dan import qiling.",
    },
    {
      title: "Ovozli kiritish",
      body: "ctrl+r bosing, gapiring, Atlas o'zi yozadi. Groq Whisper, bepul.",
    },
  ],
  compare: "bitta savolni bir nechta modelga yonma-yon beradi.",
  statusline: "Claude Code uchun status line: model, repo, branch va limitlar.",
  stepsTitle: "Uchta buyruq",
  steps: [
    { title: "O'rnating", body: "Bitta npm buyrug'i. Windows, macOS va Linux." },
    { title: "Ulang", body: "Provayderni tanlang. Brauzer ochiladi: kiring yoki bepul kalitni joylang." },
    { title: "So'rang", body: "Savol yozing, @ bilan fayl biriktiring, /model bilan modelni almashtiring." },
  ],
  faqTitle: "Savollar",
  faq: [
    {
      q: "Bu bepulmi?",
      a: "Ha. Atlas MIT litsenziyasida. Modellar o'z kalitlaringizning bepul tariflarida ishlaydi, pullik kalitlar ham mos keladi.",
    },
    {
      q: "Qaysi OS'larda ishlaydi?",
      a: "Windows, macOS va Linux, Node.js 22+ bilan. Windows'da agentlar imkon bo'lsa native buyruqlar bilan o'rnatiladi.",
    },
    {
      q: "Kalitlar qayerda saqlanadi?",
      a: "Faqat kompyuteringizda, ~/.the-atlas/config.json faylida. Har bir kalit faqat o'z provayderiga yuboriladi.",
    },
    {
      q: "Maxfiylik-chi?",
      a: "Telemetriya ham, Atlas serveri ham yo'q. So'rovlar terminalingizdan to'g'ridan-to'g'ri siz tanlagan provayderga boradi.",
    },
  ],
  license: "MIT litsenziyasi",
  credit: "Agentlar katalogi Aidevix'dan olingan",
};

const ru: Dict = {
  nav: {
    docs: "Документация",
    reference: "Справочник",
    extensions: "Расширения",
    resources: "Ресурсы",
    changelog: "Изменения",
    feedback: "Отзывы",
  },
  navLabel: "Основные разделы",
  pitch: "Все ИИ-ассистенты в одном терминале.",
  sub: "Бесплатные модели с автопереключением, 47 ИИ-агентов и агентный режим, который правит файлы с вашего разрешения.",
  node: "Нужен Node.js 22+.",
  nodeLink: "Скачать",
  docsBtn: "Документация",
  installLabel: "Установка",
  demoTitle: "Спросите один раз. Если модель занята, ответит следующая.",
  featuresTitle: "Что внутри",
  features: [
    {
      title: "Бесплатные модели, автопереключение",
      body: "OpenRouter, Gemini, Groq, Cerebras, Mistral и другие. Кончился лимит, отвечает следующий провайдер.",
    },
    {
      title: "Вход в один клик",
      body: "atlas connect открывает браузер. OpenRouter подключается в один клик, остальные ключи проверяются при вставке.",
    },
    {
      title: "47 ИИ-агентов",
      body: "Claude Code, Codex, Gemini CLI, Aider и другие. Каждый ставится и запускается в новом окне.",
    },
    {
      title: "Агентный режим",
      body: "ИИ читает и правит файлы в вашей папке, запускает команды. Каждое изменение ждёт вашего одобрения.",
    },
    {
      title: "MCP-инструменты",
      body: "Добавляйте MCP-серверы из готовых пресетов или импортируйте их из Claude.",
    },
    {
      title: "Голосовой ввод",
      body: "Нажмите ctrl+r и говорите, Atlas напечатает. Groq Whisper, бесплатно.",
    },
  ],
  compare: "задаёт один вопрос нескольким моделям и показывает ответы рядом.",
  statusline: "Статус-строка для Claude Code: модель, репозиторий, ветка и лимиты.",
  stepsTitle: "Три команды",
  steps: [
    { title: "Установите", body: "Одна команда npm. Windows, macOS и Linux." },
    { title: "Подключите", body: "Выберите провайдера. Откроется браузер: войдите или вставьте бесплатный ключ." },
    { title: "Спросите", body: "Пишите вопрос, прикрепляйте файлы через @, меняйте модель через /model." },
  ],
  faqTitle: "Вопросы",
  faq: [
    {
      q: "Это бесплатно?",
      a: "Да. Atlas под лицензией MIT. Модели работают на бесплатных тарифах ваших ключей, платные ключи тоже подходят.",
    },
    {
      q: "Какие ОС поддерживаются?",
      a: "Windows, macOS и Linux с Node.js 22+. На Windows агенты ставятся нативными командами, где это возможно.",
    },
    {
      q: "Где хранятся ключи?",
      a: "Только на вашем компьютере, в ~/.the-atlas/config.json. Каждый ключ уходит только своему провайдеру.",
    },
    {
      q: "А приватность?",
      a: "Нет ни телеметрии, ни сервера Atlas. Запросы идут из терминала прямо к выбранному провайдеру.",
    },
  ],
  license: "Лицензия MIT",
  credit: "Каталог агентов из Aidevix",
};

const en: Dict = {
  nav: {
    docs: "Docs",
    reference: "Reference",
    extensions: "Extensions",
    resources: "Resources",
    changelog: "Changelog",
    feedback: "Feedback",
  },
  navLabel: "Main sections",
  pitch: "All AI assistants in one terminal.",
  sub: "Free models that switch automatically, 47 AI agents, and an agent mode that edits files with your approval.",
  node: "Needs Node.js 22+.",
  nodeLink: "Download",
  docsBtn: "Docs",
  installLabel: "Install",
  demoTitle: "Ask once. If a model is busy, the next one answers.",
  featuresTitle: "What you get",
  features: [
    {
      title: "Free models, auto-switch",
      body: "OpenRouter, Gemini, Groq, Cerebras, Mistral and more. When one hits a limit, the next provider answers.",
    },
    {
      title: "One-click sign-in",
      body: "atlas connect opens the browser. OpenRouter connects in one click, other keys are verified when you paste them.",
    },
    {
      title: "47 AI agents",
      body: "Claude Code, Codex, Gemini CLI, Aider and more. Each one installs and launches in a new window.",
    },
    {
      title: "Agent mode",
      body: "The AI reads and edits files in your folder and runs commands. Every change waits for your approval.",
    },
    {
      title: "MCP tools",
      body: "Add MCP servers from ready presets or import them from Claude.",
    },
    {
      title: "Voice input",
      body: "Press ctrl+r and speak, Atlas types it. Groq Whisper, free.",
    },
  ],
  compare: "asks several models the same question and shows the answers side by side.",
  statusline: "A status line for Claude Code: model, repo, branch and limits.",
  stepsTitle: "Three commands",
  steps: [
    { title: "Install", body: "One npm command. Windows, macOS and Linux." },
    { title: "Connect", body: "Pick a provider. The browser opens: sign in or paste a free key." },
    { title: "Ask", body: "Type a question, attach files with @, switch models with /model." },
  ],
  faqTitle: "Questions",
  faq: [
    {
      q: "Is it free?",
      a: "Yes. Atlas is MIT-licensed. Models run on the free tiers of your own keys, and paid keys work too.",
    },
    {
      q: "Which OS does it run on?",
      a: "Windows, macOS and Linux with Node.js 22+. On Windows, agents install with native commands where available.",
    },
    {
      q: "Where are my keys stored?",
      a: "Only on your machine, in ~/.the-atlas/config.json. Each key is sent only to its own provider.",
    },
    {
      q: "What about privacy?",
      a: "No telemetry and no Atlas server. Requests go straight from your terminal to the provider you chose.",
    },
  ],
  license: "MIT license",
  credit: "Agent catalog from Aidevix",
};

export const DICT: Record<Locale, Dict> = { uz, ru, en };

/** Starlight locale (undefined = root) → our Locale. */
export function toLocale(starlightLocale: string | undefined): Locale {
  return starlightLocale === "ru" || starlightLocale === "en" ? starlightLocale : "uz";
}

/** Base-aware URL for a path under a locale ("" = root/uz). */
export function href(locale: Locale, slug = ""): string {
  const base = import.meta.env.BASE_URL.replace(/\/?$/, "/");
  const prefix = locale === "uz" ? "" : `${locale}/`;
  return `${base}${prefix}${slug}`;
}
