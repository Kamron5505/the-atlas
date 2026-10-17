import { loadConfig } from "@the-atlas/core";
import type { Command } from "commander";
import { render } from "ink";
import { createElement } from "react";
import { detectLang, isLang, type Lang } from "../i18n.js";
import { a } from "../ui/ansi.js";
import { I } from "../ui/theme.js";
import { voiceT } from "./i18n.js";
import { listInputDevices, matchDevice, savedDevice, saveDevice } from "./record.js";
import { pickEngine, voiceError } from "./transcribe.js";
import { VoiceInput } from "./VoiceInput.js";

function langOf(opt?: string): Lang {
  return opt && isLang(opt) ? opt : detectLang(loadConfig());
}

/** Records once, prints the recognized text to stdout (exit 1 on error/cancel). */
export async function runVoiceOnce(opts: { device?: string; seconds?: string; lang?: string }): Promise<void> {
  const cfg = loadConfig();
  const lang = langOf(opts.lang);
  const L = voiceT(lang);
  const engine = pickEngine(cfg);
  if (!engine) {
    console.error(a.err(`${I.fail} ${L.errors.noKey}`));
    process.exitCode = 1;
    return;
  }
  console.error(a.dim(`${L.speakNow} · ${engine.model} ${L.via} ${engine.provider}`));
  let result: { text?: string | null; error?: string } = {};
  const app = render(
    createElement(VoiceInput, {
      cfg,
      L,
      lang,
      device: opts.device,
      maxSeconds: opts.seconds ? Math.max(1, Number(opts.seconds) || 120) : 120,
      onDone: (text) => {
        result = { text };
        app.unmount();
      },
      onError: (error) => {
        result = { error };
        app.unmount();
      },
    }),
    { stdout: process.stderr, exitOnCtrlC: true },
  );
  await app.waitUntilExit();
  if (result.error) {
    console.error(a.err(`${I.fail} ${result.error}`));
    process.exitCode = 1;
  } else if (!result.text) {
    console.error(a.dim(L.cancelled));
    process.exitCode = 1;
  } else {
    console.log(result.text);
  }
}

/** Prints microphones, marking the saved one. */
export async function printDevices(lang: Lang): Promise<void> {
  const L = voiceT(lang);
  try {
    const devices = await listInputDevices();
    const saved = savedDevice();
    const current = saved ? matchDevice(devices, saved) : devices[0];
    console.log(a.bold(L.devicesTitle));
    if (!devices.length) console.log(a.warn(`${I.warn} ${L.noDevices}`));
    devices.forEach((d, i) => {
      const on = d === current;
      const mark = on ? a.ok(I.on) : a.faint(I.off);
      const note = on ? a.dim(` · ${saved ? L.saved : L.auto}`) : "";
      console.log(`  ${mark} ${a.dim(String(i + 1).padStart(2))}  ${on ? a.neon(d.name) : a.text(d.name)}${note}`);
    });
  } catch (e) {
    console.error(a.err(`${I.fail} ${voiceError(e, L)}`));
    process.exitCode = 1;
  }
}

/** Saves the microphone by list number or name ("auto" clears it). */
export async function chooseDevice(query: string, lang: Lang): Promise<void> {
  const L = voiceT(lang);
  try {
    if (query === "auto") {
      saveDevice(undefined);
      console.log(`${a.ok(I.ok)} ${L.deviceSaved} ${a.neon(L.auto)}`);
      return;
    }
    const dev = matchDevice(await listInputDevices(), query);
    if (!dev) {
      console.error(a.err(`${I.fail} ${L.deviceUnknown}`));
      process.exitCode = 1;
      return;
    }
    saveDevice(dev.name);
    console.log(`${a.ok(I.ok)} ${L.deviceSaved} ${a.neon(dev.name)}`);
  } catch (e) {
    console.error(a.err(`${I.fail} ${voiceError(e, L)}`));
    process.exitCode = 1;
  }
}

/** `atlas voice`, `atlas voice devices`, `atlas voice device <name|index>`. */
export function registerVoice(program: Command): void {
  const voice = program
    .command("voice")
    .description("speak and get text (Groq Whisper, free); prints the text")
    .option("-d, --device <name>", "microphone name or number (see: atlas voice devices)")
    .option("-s, --seconds <n>", "max recording length", "120")
    .option("-l, --lang <lang>", "speech language hint: uz | ru | en")
    .action((opts: { device?: string; seconds?: string; lang?: string }) => runVoiceOnce(opts));

  voice
    .command("devices")
    .description("list microphones (the saved one is marked)")
    .action(() => printDevices(langOf()));

  voice
    .command("device")
    .description("remember a microphone: number from the list, name, or auto")
    .argument("<name|index>")
    .action((query: string) => chooseDevice(query, langOf()));
}
