import type { Lang } from "../i18n.js";
import type { ToolWords } from "./tools.js";

const en = {
  thinking: "Thinking",
  working: "Working",
  escStop: "esc stop",
  step: "step",
  approveTitle: "Allow",
  approveYes: "Yes",
  approveAlways: "Yes, don't ask again this session",
  approveNo: "No, do something else",
  approveKeys: "↑↓ choose · enter confirm · esc no",
  declined: "declined",
  aborted: "Stopped",
  maxSteps: "Step limit reached — ask to continue",
  failed: "Agent failed",
  changed: "files changed",
  steps: "steps",
  noChanges: "no files changed",
  fallback: "switching AI",
  verbs: {
    read_file: "Read",
    list_dir: "List",
    search: "Search",
    write_file: "Write",
    edit_file: "Edit",
    run_command: "Run",
  } as Record<string, string>,
  words: { lines: "lines", entries: "entries", matches: "matches", exit: "exit", timedOut: "timed out", created: "new" } as ToolWords,
};

export type AgentDict = typeof en;

const uz: AgentDict = {
  thinking: "O'ylayapman",
  working: "Ishlayapman",
  escStop: "esc to'xtatish",
  step: "qadam",
  approveTitle: "Ruxsat berasizmi",
  approveYes: "Ha",
  approveAlways: "Ha, bu sessiyada boshqa so'ramang",
  approveNo: "Yo'q, boshqa yo'l tanlang",
  approveKeys: "↑↓ tanlash · enter tasdiqlash · esc yo'q",
  declined: "rad etildi",
  aborted: "To'xtatildi",
  maxSteps: "Qadamlar chegarasiga yetdi — davom etishni so'rang",
  failed: "Agent xato bilan to'xtadi",
  changed: "ta fayl o'zgardi",
  steps: "qadam",
  noChanges: "fayllar o'zgarmadi",
  fallback: "boshqa AI ga o'tilmoqda",
  verbs: {
    read_file: "O'qish",
    list_dir: "Ro'yxat",
    search: "Qidiruv",
    write_file: "Yozish",
    edit_file: "Tahrir",
    run_command: "Buyruq",
  },
  words: { lines: "qator", entries: "ta element", matches: "ta topildi", exit: "kod", timedOut: "vaqt tugadi", created: "yangi" },
};

const ru: AgentDict = {
  thinking: "Думаю",
  working: "Работаю",
  escStop: "esc стоп",
  step: "шаг",
  approveTitle: "Разрешить",
  approveYes: "Да",
  approveAlways: "Да, больше не спрашивать",
  approveNo: "Нет, сделай иначе",
  approveKeys: "↑↓ выбор · enter подтвердить · esc нет",
  declined: "отклонено",
  aborted: "Остановлено",
  maxSteps: "Достигнут лимит шагов — попросите продолжить",
  failed: "Агент завершился с ошибкой",
  changed: "файлов изменено",
  steps: "шагов",
  noChanges: "файлы не изменены",
  fallback: "переключаю ИИ",
  verbs: {
    read_file: "Чтение",
    list_dir: "Список",
    search: "Поиск",
    write_file: "Запись",
    edit_file: "Правка",
    run_command: "Команда",
  },
  words: { lines: "строк", entries: "элементов", matches: "совпадений", exit: "код", timedOut: "таймаут", created: "новый" },
};

const DICTS: Record<Lang, AgentDict> = { en, uz, ru };

/** Agent-mode strings; Uzbek by default. */
export function agentT(lang: Lang = "uz"): AgentDict {
  return DICTS[lang] ?? uz;
}
