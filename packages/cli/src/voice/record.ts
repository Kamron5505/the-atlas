import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { atlasHome } from "@the-atlas/core";
import { which } from "../agents/catalog.js";

export type VoiceErrorCode =
  | "noFfmpeg"
  | "noDevice"
  | "recordFailed"
  | "tooShort"
  | "noKey"
  | "badKey"
  | "quota"
  | "tooLarge"
  | "empty"
  | "transcribeFailed";

/** Voice failure with a stable code; the UI localizes it via voiceError(). */
export class VoiceError extends Error {
  constructor(
    readonly code: VoiceErrorCode,
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "VoiceError";
  }
}

export type DeviceFormat = "dshow" | "avfoundation" | "pulse" | "alsa";

export interface AudioDevice {
  /** Human name, e.g. "Микрофон (Realtek(R) Audio)". */
  name: string;
  /** What goes after `-i` (dshow: `audio=<alt or name>`, avfoundation: ":0"). */
  id: string;
  format: DeviceFormat;
  /** dshow "Alternative name" (@device_cm_…), immune to console encoding issues. */
  alt?: string;
}

export const INSTALL_HINT: Record<string, string> = {
  win32: "winget install Gyan.FFmpeg",
  darwin: "brew install ffmpeg",
  linux: "sudo apt install ffmpeg",
};

/** Full path of ffmpeg (ATLAS_FFMPEG override, PATH, WinGet links), or undefined. */
export function findFfmpeg(): string | undefined {
  if (process.env.ATLAS_FFMPEG) return process.env.ATLAS_FFMPEG;
  const found = which("ffmpeg");
  if (found) return found;
  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    const p = join(process.env.LOCALAPPDATA, "Microsoft", "WinGet", "Links", "ffmpeg.exe");
    if (existsSync(p)) return p;
  }
  return undefined;
}

function requireFfmpeg(): string {
  const bin = findFfmpeg();
  if (!bin) {
    const hint = INSTALL_HINT[process.platform] ?? INSTALL_HINT.linux!;
    throw new VoiceError("noFfmpeg", `ffmpeg not found — install it: ${hint}`, hint);
  }
  return bin;
}

const strip = (s: string) => s.replace(/^\[[^\]]*\]\s?/, "");

/**
 * Parses `ffmpeg -list_devices true -f dshow -i dummy` output. Handles the old
 * "DirectShow audio devices" sections and the new `"name" (audio)` lines.
 */
export function parseDshowDevices(output: string): AudioDevice[] {
  const out: AudioDevice[] = [];
  let section: "audio" | "video" | undefined;
  let last: AudioDevice | undefined;
  let lastKind: string | undefined;
  for (const raw of output.split(/\r?\n/)) {
    const line = strip(raw).trim();
    if (/DirectShow audio devices/i.test(line)) section = "audio";
    else if (/DirectShow video devices/i.test(line)) section = "video";
    const alt = /^Alternative name\s+"(.+)"$/i.exec(line);
    if (alt) {
      if (last && lastKind === "audio") {
        last.alt = alt[1]!;
        last.id = `audio=${alt[1]!}`;
      }
      continue;
    }
    const dev = /^"(.+)"(?:\s+\((audio|video|none|audio, video)\))?$/i.exec(line);
    if (!dev) continue;
    const kind = dev[2]?.toLowerCase() ?? section;
    lastKind = kind?.includes("audio") ? "audio" : kind;
    if (lastKind !== "audio") {
      last = undefined;
      continue;
    }
    last = { name: dev[1]!, id: `audio=${dev[1]!}`, format: "dshow" };
    out.push(last);
  }
  return out;
}

/** Parses `ffmpeg -f avfoundation -list_devices true -i ""` output (audio section only). */
export function parseAvfoundationDevices(output: string): AudioDevice[] {
  const out: AudioDevice[] = [];
  let audio = false;
  for (const raw of output.split(/\r?\n/)) {
    const line = strip(raw).trim();
    if (/AVFoundation audio devices/i.test(line)) audio = true;
    else if (/AVFoundation video devices/i.test(line)) audio = false;
    const m = /^\[(\d+)\]\s+(.+)$/.exec(line);
    if (audio && m) out.push({ name: m[2]!, id: `:${m[1]!}`, format: "avfoundation" });
  }
  return out;
}

function runFfmpeg(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    let text = "";
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    child.stdout?.on("data", (d: Buffer) => (text += d.toString("utf8")));
    child.stderr?.on("data", (d: Buffer) => (text += d.toString("utf8")));
    child.on("error", () => resolve(text));
    child.on("close", () => resolve(text));
  });
}

/** Microphones ffmpeg can record from on this OS. */
export async function listInputDevices(platform: NodeJS.Platform = process.platform): Promise<AudioDevice[]> {
  const bin = requireFfmpeg();
  if (platform === "win32") {
    return parseDshowDevices(await runFfmpeg(bin, ["-hide_banner", "-list_devices", "true", "-f", "dshow", "-i", "dummy"]));
  }
  if (platform === "darwin") {
    const found = parseAvfoundationDevices(await runFfmpeg(bin, ["-hide_banner", "-f", "avfoundation", "-list_devices", "true", "-i", ""]));
    return found.length ? found : [{ name: "default", id: ":0", format: "avfoundation" }];
  }
  const devices = await runFfmpeg(bin, ["-hide_banner", "-devices"]);
  const format: DeviceFormat = /^\s*D\S*\s+pulse\b/m.test(devices) ? "pulse" : "alsa";
  return [{ name: "default", id: "default", format }];
}

/** ffmpeg arguments that record `device` into a 16 kHz mono 16-bit WAV. */
export function ffmpegArgs(platform: NodeJS.Platform, device: { id: string; format?: DeviceFormat }, outFile: string, maxSeconds = 120): string[] {
  const format: DeviceFormat =
    device.format ?? (platform === "win32" ? "dshow" : platform === "darwin" ? "avfoundation" : "pulse");
  return [
    "-hide_banner",
    "-nostats",
    "-loglevel",
    "info",
    "-y",
    "-f",
    format,
    "-i",
    device.id,
    "-t",
    String(maxSeconds),
    "-af",
    "astats=metadata=1:reset=5,ametadata=mode=print:key=lavfi.astats.Overall.RMS_level",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-c:a",
    "pcm_s16le",
    outFile,
  ];
}

interface VoicePrefs {
  device?: string;
}

const prefsPath = () => join(atlasHome(), "voice.json");

/** Saved microphone name from atlasHome()/voice.json. */
export function savedDevice(): string | undefined {
  try {
    return (JSON.parse(readFileSync(prefsPath(), "utf8")) as VoicePrefs).device || undefined;
  } catch {
    return undefined;
  }
}

/** Remembers the microphone (undefined = back to auto). */
export function saveDevice(name: string | undefined): void {
  mkdirSync(atlasHome(), { recursive: true });
  writeFileSync(prefsPath(), JSON.stringify({ device: name } satisfies VoicePrefs, null, 2), "utf8");
}

/** Finds a device by list index (1-based, as printed) or by (partial) name / alt name. */
export function matchDevice(devices: AudioDevice[], query: string): AudioDevice | undefined {
  const q = query.trim();
  if (/^\d+$/.test(q)) return devices[Number(q) - 1];
  const lc = q.toLowerCase();
  return (
    devices.find((d) => d.name === q || d.alt === q || d.id === q) ??
    devices.find((d) => d.name.toLowerCase().includes(lc))
  );
}

export interface RecordOptions {
  /** Device name / index; default: saved device, then the first microphone. */
  device?: string;
  maxSeconds?: number;
  /** Mic level 0..1, ~10 times per second. */
  onLevel?: (level: number) => void;
  /** OS whose device listing / ffmpeg input to use (default: this one; tests pin it). */
  platform?: NodeJS.Platform;
}

export interface Recording {
  device: AudioDevice;
  /** Graceful stop ("q" to ffmpeg); resolves with the WAV path and duration. */
  stop(): Promise<{ file: string; seconds: number }>;
  /** Kills ffmpeg and deletes the file. */
  cancel(): void;
  /** Settles when ffmpeg exits for any reason (e.g. maxSeconds reached or device error). */
  exited: Promise<void>;
  onLevel?: (level: number) => void;
}

/** dB (RMS) → 0..1 meter value, -60 dB = silence. */
export const levelFromDb = (db: number) => (Number.isFinite(db) ? Math.min(1, Math.max(0, (db + 60) / 60)) : 0);

async function resolveDevice(query?: string, platform: NodeJS.Platform = process.platform): Promise<AudioDevice> {
  const devices = await listInputDevices(platform);
  // An explicit --device that matches nothing must not silently record from another mic.
  if (query) {
    const dev = matchDevice(devices, query);
    if (!dev) throw new VoiceError("noDevice", `No microphone matches "${query}" (atlas voice devices)`);
    return dev;
  }
  const saved = savedDevice();
  const dev = (saved ? matchDevice(devices, saved) : undefined) ?? devices[0];
  if (!dev) throw new VoiceError("noDevice", "No microphone found (atlas voice devices)");
  return dev;
}

/** Starts recording the microphone with ffmpeg into a temp WAV. */
export async function startRecording(opts: RecordOptions = {}): Promise<Recording> {
  const bin = requireFfmpeg();
  const maxSeconds = opts.maxSeconds ?? 120;
  const platform = opts.platform ?? process.platform;
  const device = await resolveDevice(opts.device, platform);
  // Private 0700 dir: a predictable name in a shared /tmp could be pre-planted as a symlink.
  const file = join(mkdtempSync(join(tmpdir(), TMP_PREFIX)), "voice.wav");
  const child = spawn(bin, ffmpegArgs(platform, device, file, maxSeconds), {
    stdio: ["pipe", "ignore", "pipe"],
    windowsHide: true,
  });
  // Writing "q" after ffmpeg died raises EPIPE on stdin; without a listener that crashes the CLI.
  child.stdin?.on("error", () => {});
  const started = Date.now();
  let tail = "";
  let buf = "";
  let closed = false;
  let spawnError: Error | undefined;
  let endedAt: number | undefined;

  const rec: Recording = {
    device,
    onLevel: opts.onLevel,
    exited: new Promise<void>((resolve) => {
      child.on("error", (e) => {
        spawnError = e;
        closed = true;
        resolve();
      });
      child.on("close", () => {
        closed = true;
        endedAt ??= Date.now();
        resolve();
      });
    }),
    async stop() {
      if (!closed) {
        endedAt = Date.now();
        try {
          child.stdin?.write("q");
          child.stdin?.end();
        } catch {
          // stdin already closed
        }
        const killer = setTimeout(() => child.kill(), 2000);
        await rec.exited;
        clearTimeout(killer);
      }
      const seconds = Math.min(maxSeconds, ((endedAt ?? Date.now()) - started) / 1000);
      let size = 0;
      try {
        size = statSync(file).size;
      } catch {
        // not written
      }
      if (spawnError || size <= 44) {
        remove(file);
        const detail = spawnError?.message ?? tail.trim().split(/\r?\n/).slice(-3).join("\n");
        throw new VoiceError("recordFailed", `Recording failed${detail ? `: ${detail}` : ""}`, detail);
      }
      if (seconds < 0.3) {
        remove(file);
        throw new VoiceError("tooShort", "Recording is too short");
      }
      return { file, seconds };
    },
    cancel() {
      if (!closed) child.kill();
      void rec.exited.then(() => remove(file));
      remove(file);
    },
  };

  child.stderr?.on("data", (d: Buffer) => {
    const s = d.toString("utf8");
    tail = (tail + s).slice(-4000);
    buf = (buf + s).slice(-2000);
    const lines = buf.split(/\r?\n/);
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const m = /RMS_level=(-?inf|-?[\d.]+)/.exec(line);
      if (m && rec.onLevel) rec.onLevel(levelFromDb(Number(m[1]!.replace("inf", "Infinity"))));
    }
  });
  return rec;
}

const TMP_PREFIX = "atlas-voice-";

/** Deletes a file (and its private recording dir, if any), ignoring errors. */
export function remove(file: string): void {
  try {
    unlinkSync(file);
  } catch {
    // already gone
  }
  const dir = dirname(resolve(file));
  if (dirname(dir) !== resolve(tmpdir()) || !basename(dir).startsWith(TMP_PREFIX)) return;
  try {
    rmdirSync(dir);
  } catch {
    // not empty or already gone
  }
}
