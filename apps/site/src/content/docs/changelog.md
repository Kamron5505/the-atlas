---
title: "O'zgarishlar tarixi"
description: "The Atlas'ning har bir relizidagi o'zgarishlar."
sidebar:
  order: 3
---

## v0.1.0 (hali chiqmagan)

Birinchi reliz.

### Chat

- Interaktiv chat (`atlas`): oqimli Markdown javoblar, neon-ko'k interfeys va harfma-harf yoziladigan ATLAS logotipi.
- Slash buyruqlar menyusi, `↑` `↓` kiritish tarixi, javobni to'xtatish uchun `Esc`.
- `@fayl` biriktirish: matnli fayllar, rasmlar va papka ro'yxatlari.
- Saqlangan chatlar: `/history`, `/resume`, `atlas -c`, Markdown'ga `/export`.
- `/compare`: bir vaqtda 2 yoki 3 ta AI'dan so'rash va eng yaxshi javobni qoldirish.
- Status qatori: repozitoriy, branch, kontekst bandligi, narx, o'zgargan qatorlar, model va qolgan bepul so'rovlar.
- Interfeys o'zbek (standart), rus va ingliz tillarida: `/lang`, `atlas lang`.
- Eski terminallar uchun oddiy ASCII va kamaytirilgan rang rejimlari; interfeys elementlarida emoji yo'q.

### Modellar va provayderlar

- 12 ta provayder: OpenRouter, Gemini, Groq, Cerebras, Mistral, GitHub Models, NVIDIA NIM, SambaNova, OmniRoute, Ollama, OpenAI, Anthropic.
- Auto rejim: birinchi tokendan oldin boshqa bepul model va provayderlarga almashadi; ishlamayotgan lokal serverlar jimgina o'tkazib yuboriladi.
- OpenRouter'ga bir bosishda kirish (PKCE bilan OAuth); boshqa provayderlar uchun kalitni tekshiradigan ulash ustasi.
- Model tanlash oynasi, bepul limit hisoblagichi va limitga yetganda AI'ni almashtirish menyusi.
- `atlas omniroute` OmniRoute shlyuzini o'rnatadi, ishga tushiradi va ulaydi.
- `atlas ask`: pipe bilan qulay ishlaydigan bir martalik javoblar.
- `atlas serve`: almashish imkoniyati bor, OpenAI'ga mos lokal endpoint.

### Agentlar va vositalar

- Agent rejimi (`atlas agent`, `/agent`): loyihada o'qish, qidirish, tahrirlash va buyruqlarni ishga tushirish; har bir o'zgarish ruxsat bilan, yo'llar faqat loyiha ichida, maxfiy fayllar bloklangan.
- MCP serverlar: shablonlar, maxsus lokal va masofaviy serverlar, `atlas mcp import claude`; har bir MCP vosita chaqiruvi ruxsat talab qiladi.
- `ctrl+r` va `atlas voice` bilan ovozli kiritish (ffmpeg + Groq Whisper).
- 47 ta AI CLI agent uchun ishga tushirgich (`atlas agents`, `atlas run`): Windows, macOS va Linux'da o'rnatadi, agentlarni yangi terminal oynasida ochadi, `--free` ularni Atlas bepul modellarida ishlatadi.
- `atlas statusline --install claude` Atlas status qatorini Claude Code'ga qo'yadi.
- `atlas doctor` muhit, terminal va provayderlarni tekshiradi.

### Relizdan oldingi tuzatishlar

- Windows: npm orqali o'rnatilgan agentlar ishga tushmasdi (`ENOENT`); endi faqat `.exe`, `.cmd` va `.bat` shim'lar ishlatiladi.
- Bepulligi tugagan (404) yoki band (429) OpenRouter bepul modellari endi javobni to'xtatmaydi; boshqa bepul modellar sinab ko'riladi.
- Bitta band bepul model endi butun provayderni limiti tugagan deb belgilamaydi.
- Modellar asosiy model nomini aytish o'rniga Atlas sifatida javob beradi.
- Chiqishda ekran `cls` kabi tozalanadi (`ATLAS_KEEP_SCREEN=1` uni saqlab qoladi).
