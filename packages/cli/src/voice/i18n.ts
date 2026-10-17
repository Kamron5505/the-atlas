import type { Lang } from "../i18n.js";
import type { VoiceErrorCode } from "./record.js";

const en = {
  starting: "Starting the microphone…",
  recording: "Recording",
  finish: "finish",
  cancel: "cancel",
  transcribing: "Turning speech into text…",
  cancelled: "voice input cancelled",
  speakNow: "Speak — press enter when done",
  devicesTitle: "Microphones",
  saved: "saved",
  auto: "auto (first microphone)",
  deviceSaved: "Microphone saved:",
  deviceUnknown: "No such microphone. List: atlas voice devices",
  noDevices: "No microphones found",
  via: "via",
  cmdVoice: "voice input: speak, Atlas types it (Groq Whisper, free)",
  errors: {
    noFfmpeg: "ffmpeg is needed for the microphone. Install it:",
    noDevice: "No microphone found. Check it is plugged in and allowed in privacy settings (atlas voice devices)",
    recordFailed: "Could not record from the microphone",
    tooShort: "Recording is too short — hold on a bit longer",
    noKey: "Speech-to-text needs a Groq key: /connect groq — free",
    badKey: "The key was rejected. Reconnect: /connect groq",
    quota: "Free voice limit reached for now — try again in a minute",
    tooLarge: "Recording is too long for one request — keep it under 2 minutes",
    empty: "Nothing was heard — try again closer to the microphone",
    transcribeFailed: "Speech-to-text failed",
  } satisfies Record<VoiceErrorCode, string>,
};

/** Strings for voice input (same Dict-per-language shape as ../i18n.ts). */
export type VoiceDict = typeof en;

const uz: VoiceDict = {
  starting: "Mikrofon ishga tushirilmoqda…",
  recording: "Yozib olinmoqda",
  finish: "tugatish",
  cancel: "bekor",
  transcribing: "Matnga aylantirilmoqda…",
  cancelled: "ovozli kiritish bekor qilindi",
  speakNow: "Gapiring — tugatgach enter bosing",
  devicesTitle: "Mikrofonlar",
  saved: "saqlangan",
  auto: "avto (birinchi mikrofon)",
  deviceSaved: "Mikrofon saqlandi:",
  deviceUnknown: "Bunday mikrofon yo'q. Ro'yxat: atlas voice devices",
  noDevices: "Mikrofon topilmadi",
  via: "orqali",
  cmdVoice: "ovozli kiritish: gapiring, Atlas yozib beradi (Groq Whisper, bepul)",
  errors: {
    noFfmpeg: "Mikrofon uchun ffmpeg kerak. O'rnating:",
    noDevice: "Mikrofon topilmadi. Ulanganini va maxfiylik sozlamalarida ruxsat berilganini tekshiring (atlas voice devices)",
    recordFailed: "Mikrofondan yozib bo'lmadi",
    tooShort: "Yozuv juda qisqa — biroz uzoqroq gapiring",
    noKey: "Ovozni matnga aylantirish uchun Groq kaliti kerak: /connect groq — bepul",
    badKey: "Kalit qabul qilinmadi. Qayta ulang: /connect groq",
    quota: "Bepul ovoz limiti hozircha tugadi — bir daqiqadan so'ng urinib ko'ring",
    tooLarge: "Yozuv bitta so'rov uchun juda uzun — 2 daqiqadan qisqa bo'lsin",
    empty: "Hech narsa eshitilmadi — mikrofonga yaqinroq gapirib ko'ring",
    transcribeFailed: "Ovozni matnga aylantirib bo'lmadi",
  },
};

const ru: VoiceDict = {
  starting: "Включаю микрофон…",
  recording: "Идёт запись",
  finish: "готово",
  cancel: "отмена",
  transcribing: "Превращаю речь в текст…",
  cancelled: "голосовой ввод отменён",
  speakNow: "Говорите — нажмите enter, когда закончите",
  devicesTitle: "Микрофоны",
  saved: "сохранён",
  auto: "авто (первый микрофон)",
  deviceSaved: "Микрофон сохранён:",
  deviceUnknown: "Нет такого микрофона. Список: atlas voice devices",
  noDevices: "Микрофоны не найдены",
  via: "через",
  cmdVoice: "голосовой ввод: говорите, Atlas напишет (Groq Whisper, бесплатно)",
  errors: {
    noFfmpeg: "Для микрофона нужен ffmpeg. Установите:",
    noDevice: "Микрофон не найден. Проверьте подключение и доступ в настройках конфиденциальности (atlas voice devices)",
    recordFailed: "Не удалось записать с микрофона",
    tooShort: "Запись слишком короткая — говорите чуть дольше",
    noKey: "Для распознавания речи нужен ключ Groq: /connect groq — бесплатно",
    badKey: "Ключ отклонён. Подключите заново: /connect groq",
    quota: "Бесплатный лимит распознавания пока исчерпан — попробуйте через минуту",
    tooLarge: "Запись слишком длинная для одного запроса — до 2 минут",
    empty: "Ничего не слышно — попробуйте говорить ближе к микрофону",
    transcribeFailed: "Не удалось распознать речь",
  },
};

const DICTS: Record<Lang, VoiceDict> = { uz, ru, en };

/** Voice strings for a language (Uzbek fallback). */
export function voiceT(lang: Lang): VoiceDict {
  return DICTS[lang] ?? uz;
}
