import { EventEmitter } from "node:events";
import { existsSync, mkdtempSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { DEFAULT_CONFIG, type AtlasConfig } from "@the-atlas/core";
import { render } from "ink-testing-library";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock("node:child_process", async (orig) => ({ ...(await orig<typeof import("node:child_process")>()), spawn: spawnMock }));

import {
  ffmpegArgs,
  levelFromDb,
  listInputDevices,
  matchDevice,
  parseAvfoundationDevices,
  parseDshowDevices,
  savedDevice,
  saveDevice,
  startRecording,
  VoiceError,
} from "../src/voice/record.js";
import { voiceT } from "../src/voice/i18n.js";
import { isVoiceKey, joinVoiceText } from "../src/voice/keys.js";
import { pickEngine, transcribe, voiceError } from "../src/voice/transcribe.js";
import { VoiceInput } from "../src/voice/VoiceInput.js";

const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));
const strip = (s = "") => s.replace(/\u001b\[[0-9;]*m/g, "");

const NEW_FORMAT = [
  '[in#0 @ 00000272b772f180] "HD WebCam" (video)',
  '[in#0 @ 00000272b772f180]   Alternative name "@device_pnp_\\\\?\\usb#vid_0408"',
  '[in#0 @ 00000272b772f180] "Микрофон (Realtek(R) Audio)" (audio)',
  '[in#0 @ 00000272b772f180]   Alternative name "@device_cm_{33D9A762-90C8-11D0-BD43-00A0C911CE86}\\wave_{1A2B}"',
  "[in#0 @ 00000272b772f180] Error opening input: Immediate exit requested",
  "dummy: Immediate exit requested",
].join("\r\n");

const OLD_FORMAT = [
  "[dshow @ 000001] DirectShow video devices (some may be both video and audio devices)",
  '[dshow @ 000001]  "Integrated Camera"',
  '[dshow @ 000001]     Alternative name "@device_pnp_cam"',
  "[dshow @ 000001] DirectShow audio devices",
  '[dshow @ 000001]  "Микрофон (USB Audio Device)"',
  '[dshow @ 000001]     Alternative name "@device_cm_{33D9}\\wave_{AAA}"',
  '[dshow @ 000001]  "Stereo Mix (Realtek Audio)"',
  "dummy: Immediate exit requested",
].join("\n");

class FakeChild extends EventEmitter {
  stdin = Object.assign(new EventEmitter(), { write: vi.fn(), end: vi.fn() });
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  kill = vi.fn(() => {
    setTimeout(() => this.emit("close", null), 0);
    return true;
  });
}

/** spawn mock: device listing prints `listing`; a recording writes a WAV when it receives "q". */
function fakeFfmpeg(listing: string, onRecord?: (child: FakeChild, args: string[]) => void) {
  spawnMock.mockImplementation((_bin: string, args: string[]) => {
    const child = new FakeChild();
    if (args.includes("-list_devices") || args.includes("-devices")) {
      setTimeout(() => {
        child.stderr.emit("data", Buffer.from(listing, "utf8"));
        child.emit("close", 0);
      }, 0);
    } else {
      const out = args[args.length - 1]!;
      child.stdin.write.mockImplementation((s: string) => {
        if (s === "q") {
          writeFileSync(out, Buffer.alloc(44 + 32000));
          setTimeout(() => child.emit("close", 0), 0);
        }
        return true;
      });
      onRecord?.(child, args);
    }
    return child;
  });
}

const cfgWith = (keys: Record<string, string>): AtlasConfig => ({ ...structuredClone(DEFAULT_CONFIG), keys });
const wav = (dir: string) => {
  const f = join(dir, `t-${Math.random().toString(36).slice(2)}.wav`);
  writeFileSync(f, Buffer.alloc(1000));
  return f;
};

let home = "";
const envBackup = { ...process.env };
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "atlas-vtest-"));
  process.env.ATLAS_HOME = home;
  process.env.ATLAS_FFMPEG = "ffmpeg-fake";
  delete process.env.GROQ_API_KEY;
  delete process.env.OPENAI_API_KEY;
  spawnMock.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...envBackup };
});

describe("device parsing", () => {
  it("parses the new '\"name\" (audio)' format with Cyrillic and alternative names", () => {
    const d = parseDshowDevices(NEW_FORMAT);
    expect(d).toHaveLength(1);
    expect(d[0]!.name).toBe("Микрофон (Realtek(R) Audio)");
    expect(d[0]!.alt).toBe("@device_cm_{33D9A762-90C8-11D0-BD43-00A0C911CE86}\\wave_{1A2B}");
    expect(d[0]!.id).toBe(`audio=${d[0]!.alt}`);
  });

  it("parses the old DirectShow sections format, skipping video devices", () => {
    const d = parseDshowDevices(OLD_FORMAT);
    expect(d.map((x) => x.name)).toEqual(["Микрофон (USB Audio Device)", "Stereo Mix (Realtek Audio)"]);
    expect(d[0]!.alt).toBe("@device_cm_{33D9}\\wave_{AAA}");
    expect(d[1]!.id).toBe("audio=Stereo Mix (Realtek Audio)");
  });

  it("parses avfoundation audio devices", () => {
    const out = [
      "[AVFoundation indev @ 0x1] AVFoundation video devices:",
      "[AVFoundation indev @ 0x1] [0] FaceTime HD Camera",
      "[AVFoundation indev @ 0x1] AVFoundation audio devices:",
      "[AVFoundation indev @ 0x1] [0] MacBook Pro Microphone",
      "[AVFoundation indev @ 0x1] [1] AirPods",
    ].join("\n");
    expect(parseAvfoundationDevices(out)).toEqual([
      { name: "MacBook Pro Microphone", id: ":0", format: "avfoundation" },
      { name: "AirPods", id: ":1", format: "avfoundation" },
    ]);
  });

  it("lists devices per platform via ffmpeg (mocked)", async () => {
    fakeFfmpeg(NEW_FORMAT);
    expect((await listInputDevices("win32"))[0]!.name).toBe("Микрофон (Realtek(R) Audio)");
    fakeFfmpeg("");
    expect(await listInputDevices("darwin")).toEqual([{ name: "default", id: ":0", format: "avfoundation" }]);
    fakeFfmpeg("Devices:\n D. = Demuxing\n D  pulse           Pulse audio input\n");
    expect((await listInputDevices("linux"))[0]).toMatchObject({ id: "default", format: "pulse" });
    fakeFfmpeg("Devices:\n D  alsa            ALSA audio input\n");
    expect((await listInputDevices("linux"))[0]).toMatchObject({ id: "default", format: "alsa" });
  });

  it("matches by index, exact and partial name; saves the choice in voice.json", () => {
    const d = parseDshowDevices(OLD_FORMAT);
    expect(matchDevice(d, "2")?.name).toBe("Stereo Mix (Realtek Audio)");
    expect(matchDevice(d, "микрофон")?.name).toBe("Микрофон (USB Audio Device)");
    expect(matchDevice(d, "9")).toBeUndefined();
    saveDevice("Stereo Mix (Realtek Audio)");
    expect(savedDevice()).toBe("Stereo Mix (Realtek Audio)");
    expect(JSON.parse(readFileSync(join(home, "voice.json"), "utf8"))).toEqual({ device: "Stereo Mix (Realtek Audio)" });
  });
});

describe("ffmpeg args", () => {
  const tail = ["-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", "out.wav"];
  it.each([
    ["win32", { id: "audio=@device_cm_x", format: "dshow" as const }, ["-f", "dshow", "-i", "audio=@device_cm_x"]],
    ["darwin", { id: ":0", format: "avfoundation" as const }, ["-f", "avfoundation", "-i", ":0"]],
    ["linux", { id: "default", format: "pulse" as const }, ["-f", "pulse", "-i", "default"]],
    ["linux", { id: "default" }, ["-f", "pulse", "-i", "default"]],
  ])("%s → 16 kHz mono s16 WAV", (platform, device, input) => {
    const args = ffmpegArgs(platform as NodeJS.Platform, device, "out.wav", 60);
    expect(args.join(" ")).toContain(input.join(" "));
    expect(args.slice(-tail.length)).toEqual(tail);
    expect(args.join(" ")).toContain("-t 60");
  });

  it("maps dB to a 0..1 meter", () => {
    expect(levelFromDb(-Infinity)).toBe(0);
    expect(levelFromDb(-30)).toBe(0.5);
    expect(levelFromDb(5)).toBe(1);
  });
});

describe("startRecording", () => {
  it("records from the saved device, reports levels, stops by writing q", async () => {
    saveDevice("Stereo Mix (Realtek Audio)");
    let recArgs: string[] = [];
    fakeFfmpeg(OLD_FORMAT, (child, args) => {
      recArgs = args;
      setTimeout(() => child.stderr.emit("data", Buffer.from("[Parsed_ametadata_1 @ 0] lavfi.astats.Overall.RMS_level=-30.0\n")), 5);
    });
    const levels: number[] = [];
    const rec = await startRecording({ platform: "win32", onLevel: (l) => levels.push(l) });
    expect(rec.device.name).toBe("Stereo Mix (Realtek Audio)");
    expect(recArgs).toContain("audio=Stereo Mix (Realtek Audio)");
    await tick(400);
    const { file, seconds } = await rec.stop();
    const child = spawnMock.mock.results.at(-1)!.value as FakeChild;
    expect(child.stdin.write).toHaveBeenCalledWith("q");
    expect(child.kill).not.toHaveBeenCalled();
    expect(file.startsWith(tmpdir())).toBe(true);
    expect(existsSync(file)).toBe(true);
    expect(seconds).toBeGreaterThan(0.3);
    expect(levels).toEqual([0.5]);
  });

  it("kills ffmpeg if it ignores q, and cancel() deletes the file", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    try {
      fakeFfmpeg(NEW_FORMAT, (child) => child.stdin.write.mockImplementation(() => true));
      const p = startRecording({ platform: "win32" });
      await vi.advanceTimersByTimeAsync(10);
      const rec = await p;
      await vi.advanceTimersByTimeAsync(1000);
      const stopped = rec.stop().catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(2100);
      const child = spawnMock.mock.results.at(-1)!.value as FakeChild;
      expect(child.kill).toHaveBeenCalled();
      expect(((await stopped) as VoiceError).code).toBe("recordFailed");
    } finally {
      vi.useRealTimers();
    }
  });

  it("records into a private temp dir, removed on cancel; survives EPIPE on stdin", async () => {
    fakeFfmpeg(NEW_FORMAT);
    const rec = await startRecording({ platform: "win32" });
    const out = spawnMock.mock.calls.at(-1)![1].at(-1) as string;
    expect(dirname(dirname(out))).toBe(tmpdir());
    expect(basename(dirname(out))).toMatch(/^atlas-voice-/);
    expect(statSync(dirname(out)).isDirectory()).toBe(true);
    const child = spawnMock.mock.results.at(-1)!.value as FakeChild;
    expect(() => child.stdin.emit("error", Object.assign(new Error("write EPIPE"), { code: "EPIPE" }))).not.toThrow();
    rec.cancel();
    await tick();
    expect(existsSync(dirname(out))).toBe(false);
  });

  it("rejects clearly without ffmpeg or without a microphone", async () => {
    delete process.env.ATLAS_FFMPEG;
    process.env.PATH = "";
    process.env.LOCALAPPDATA = join(home, "none");
    const noBin = (await startRecording({ platform: "win32" }).catch((e: unknown) => e)) as VoiceError;
    expect(noBin.code).toBe("noFfmpeg");
    expect(voiceError(noBin, voiceT("uz"))).toMatch(/ffmpeg.*(winget|brew|apt)/);
    process.env.ATLAS_FFMPEG = "ffmpeg-fake";
    fakeFfmpeg("dummy: Immediate exit requested");
    const noDev = (await startRecording({ platform: "win32" }).catch((e: unknown) => e)) as VoiceError;
    expect(noDev.code).toBe("noDevice");
  });

  it("an explicit device that matches nothing fails instead of recording another mic", async () => {
    fakeFfmpeg(OLD_FORMAT);
    const err = (await startRecording({ platform: "win32", device: "7" }).catch((e: unknown) => e)) as VoiceError;
    expect(err.code).toBe("noDevice");
    expect(spawnMock.mock.calls.some(([, args]) => !(args as string[]).includes("-list_devices"))).toBe(false);
  });
});

describe("transcribe", () => {
  const ok = (text: string) => new Response(JSON.stringify({ text }), { status: 200 });

  it("posts multipart to Groq whisper-large-v3-turbo with language, and deletes the file", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ok(" Salom dunyo "));
    vi.stubGlobal("fetch", fetchMock);
    const f = wav(home);
    const text = await transcribe(f, { cfg: cfgWith({ groq: "gsk_test", openai: "sk_test" }), lang: "uz" });
    expect(text).toBe("Salom dunyo");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.groq.com/openai/v1/audio/transcriptions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer gsk_test");
    const body = init.body as FormData;
    expect(body.get("model")).toBe("whisper-large-v3-turbo");
    expect(body.get("language")).toBe("uz");
    expect(body.get("response_format")).toBe("json");
    const file = body.get("file") as File;
    expect(file.size).toBe(1000);
    expect(file.type).toBe("audio/wav");
    expect(existsSync(f)).toBe(false);
  });

  it("falls back to OpenAI whisper-1 when only an OpenAI key exists", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ok("hello"));
    vi.stubGlobal("fetch", fetchMock);
    expect(await transcribe(wav(home), { cfg: cfgWith({ openai: "sk_test" }), lang: "en" })).toBe("hello");
    expect(fetchMock.mock.calls[0]![0]).toBe("https://api.openai.com/v1/audio/transcriptions");
    expect((fetchMock.mock.calls[0]![1].body as FormData).get("model")).toBe("whisper-1");
  });

  it("explains missing key, quota (429) and too large (413), still deleting the file", async () => {
    const L = voiceT("uz");
    const f1 = wav(home);
    const noKey = (await transcribe(f1, { cfg: cfgWith({}) }).catch((e: unknown) => e)) as VoiceError;
    expect(noKey.code).toBe("noKey");
    expect(voiceError(noKey, L)).toContain("/connect groq");
    expect(existsSync(f1)).toBe(false);

    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "Rate limit" } }), { status: 429, headers: { "retry-after": "20" } })));
    const quota = (await transcribe(wav(home), { cfg: cfgWith({ groq: "k" }) }).catch((e: unknown) => e)) as VoiceError;
    expect(quota.code).toBe("quota");
    expect(voiceError(quota, voiceT("ru"))).toMatch(/лимит/);

    vi.stubGlobal("fetch", vi.fn(async () => new Response("too big", { status: 413 })));
    const big = (await transcribe(wav(home), { cfg: cfgWith({ groq: "k" }) }).catch((e: unknown) => e)) as VoiceError;
    expect(big.code).toBe("tooLarge");
    expect(voiceError(big, voiceT("en"))).toMatch(/too long/);
  });

  it("maps 401/403 to badKey with a /connect hint", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "Invalid API Key" } }), { status: 401 })));
    const f = wav(home);
    const err = (await transcribe(f, { cfg: cfgWith({ groq: "k" }) }).catch((e: unknown) => e)) as VoiceError;
    expect(err.code).toBe("badKey");
    expect(voiceError(err, voiceT("en"))).toContain("/connect groq");
    expect(existsSync(f)).toBe(false);
  });

  it("prefers Groq over OpenAI", () => {
    expect(pickEngine(cfgWith({ openai: "a", groq: "b" }))?.provider).toBe("groq");
    expect(pickEngine(cfgWith({}))).toBeUndefined();
  });
});

describe("VoiceInput", () => {
  const L = voiceT("uz");
  const fakeRec = (file = "x.wav") => ({
    device: { name: "Mic", id: "audio=Mic", format: "dshow" as const },
    stop: vi.fn(async () => ({ file, seconds: 2 })),
    cancel: vi.fn(() => {}),
    exited: new Promise<void>(() => {}),
  });

  it("records → enter → transcribes → onDone(text)", async () => {
    const rec = fakeRec();
    let resolveStt: (s: string) => void = () => {};
    const stt = vi.fn((_file: string, _opts: { lang?: string }) => new Promise<string>((r) => (resolveStt = r)));
    const onDone = vi.fn();
    const onError = vi.fn();
    const ui = render(<VoiceInput cfg={cfgWith({ groq: "k" })} L={L} lang="uz" onDone={onDone} onError={onError} start={async () => rec} stt={stt} />);
    await tick();
    const frame = strip(ui.lastFrame());
    expect(frame).toContain("● Yozib olinmoqda 00:00");
    expect(frame).toContain("enter — tugatish · esc — bekor");
    ui.stdin.write("\r");
    await tick();
    expect(rec.stop).toHaveBeenCalled();
    expect(strip(ui.lastFrame())).toContain("Matnga aylantirilmoqda…");
    expect(stt.mock.calls[0]![1]).toMatchObject({ lang: "uz" });
    resolveStt("Salom Atlas");
    await tick();
    expect(onDone).toHaveBeenCalledWith("Salom Atlas");
    expect(onError).not.toHaveBeenCalled();
    ui.unmount();
  });

  it("esc cancels the recording → onDone(null)", async () => {
    const rec = fakeRec();
    const onDone = vi.fn();
    const ui = render(<VoiceInput cfg={cfgWith({})} L={L} lang="uz" onDone={onDone} onError={vi.fn()} start={async () => rec} stt={vi.fn()} />);
    await tick();
    ui.stdin.write("\u001b");
    await tick();
    expect(rec.cancel).toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledWith(null);
    ui.unmount();
  });

  it("reports localized errors (no key, empty speech, recorder failure)", async () => {
    const onError = vi.fn();
    const ui = render(
      <VoiceInput
        cfg={cfgWith({})}
        L={L}
        lang="uz"
        onDone={vi.fn()}
        onError={onError}
        start={async () => fakeRec()}
        stt={async () => {
          throw new VoiceError("noKey", "no key");
        }}
      />,
    );
    await tick();
    ui.stdin.write("\r");
    await tick();
    expect(onError).toHaveBeenCalledWith(L.errors.noKey);
    ui.unmount();

    const onErr2 = vi.fn();
    const ui2 = render(<VoiceInput cfg={cfgWith({})} L={L} lang="uz" onDone={vi.fn()} onError={onErr2} start={async () => fakeRec()} stt={async () => "  "} />);
    await tick();
    ui2.stdin.write("\r");
    await tick();
    expect(onErr2).toHaveBeenCalledWith(L.errors.empty);
    ui2.unmount();

    const onErr3 = vi.fn();
    const ui3 = render(
      <VoiceInput
        cfg={cfgWith({})}
        L={voiceT("ru")}
        lang="ru"
        onDone={vi.fn()}
        onError={onErr3}
        start={async () => {
          throw new VoiceError("noDevice", "x");
        }}
      />,
    );
    await tick();
    expect(onErr3).toHaveBeenCalledWith(voiceT("ru").errors.noDevice);
    ui3.unmount();
  });
});

describe("VoiceInput auto-stop", () => {
  it("when ffmpeg exits on its own, reports to the latest onDone (no stale props)", async () => {
    let exit: () => void = () => {};
    const rec = {
      device: { name: "Mic", id: "audio=Mic", format: "dshow" as const },
      stop: vi.fn(async () => ({ file: "x.wav", seconds: 120 })),
      cancel: vi.fn(() => {}),
      exited: new Promise<void>((r) => (exit = r)),
    };
    const first = vi.fn();
    const second = vi.fn();
    const props = { cfg: cfgWith({ groq: "k" }), L: voiceT("uz"), lang: "uz" as const, onError: vi.fn(), start: async () => rec, stt: async () => "salom" };
    const ui = render(<VoiceInput {...props} onDone={first} />);
    await tick();
    ui.rerender(<VoiceInput {...props} onDone={second} />);
    exit();
    await tick();
    expect(rec.stop).toHaveBeenCalled();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith("salom");
    ui.unmount();
  });
});

describe("VoiceInput cancel while stopping", () => {
  const deferredRec = () => {
    let release: () => void = () => {};
    const file = join(home, "late.wav");
    writeFileSync(file, Buffer.alloc(100));
    return {
      file,
      release: () => release(),
      rec: {
        device: { name: "Mic", id: "audio=Mic", format: "dshow" as const },
        stop: vi.fn(() => new Promise<{ file: string; seconds: number }>((r) => (release = () => r({ file, seconds: 2 })))),
        cancel: vi.fn(() => {}),
        exited: new Promise<void>(() => {}),
      },
    };
  };

  it("esc during stop() never uploads the audio and deletes it", async () => {
    const d = deferredRec();
    const stt = vi.fn(async () => "leaked");
    const onDone = vi.fn();
    const ui = render(<VoiceInput cfg={cfgWith({ groq: "k" })} L={voiceT("uz")} lang="uz" onDone={onDone} onError={vi.fn()} start={async () => d.rec} stt={stt} />);
    await tick();
    ui.stdin.write("\r");
    await tick();
    ui.stdin.write("\u001b");
    await tick();
    d.release();
    await tick();
    expect(stt).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith(null);
    expect(existsSync(d.file)).toBe(false);
    ui.unmount();
  });

  it("unmount during stop() never uploads the audio", async () => {
    const d = deferredRec();
    const stt = vi.fn(async () => "leaked");
    const ui = render(<VoiceInput cfg={cfgWith({ groq: "k" })} L={voiceT("uz")} lang="uz" onDone={vi.fn()} onError={vi.fn()} start={async () => d.rec} stt={stt} />);
    await tick();
    ui.stdin.write("\r");
    await tick();
    ui.unmount();
    d.release();
    await tick();
    expect(stt).not.toHaveBeenCalled();
    expect(existsSync(d.file)).toBe(false);
  });
});

describe("chat helpers", () => {
  it("binds ctrl+r only, and appends text to the typed input", () => {
    expect(isVoiceKey("r", { ctrl: true, meta: false })).toBe(true);
    expect(isVoiceKey("r", { ctrl: false, meta: false })).toBe(false);
    expect(isVoiceKey("v", { ctrl: true, meta: false })).toBe(false);
    expect(joinVoiceText("", "salom")).toBe("salom");
    expect(joinVoiceText("explain ", "this file")).toBe("explain this file");
  });
});
