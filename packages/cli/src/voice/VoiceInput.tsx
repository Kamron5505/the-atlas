import type { AtlasConfig } from "@the-atlas/core";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import React, { useEffect, useRef, useState } from "react";
import type { Lang } from "../i18n.js";
import { C, I } from "../ui/theme.js";
import type { VoiceDict } from "./i18n.js";
import { remove, startRecording, VoiceError, type Recording, type RecordOptions } from "./record.js";
import { transcribe, voiceError, type TranscribeOptions } from "./transcribe.js";

export interface VoiceInputProps {
  cfg: AtlasConfig;
  L: VoiceDict;
  lang: Lang;
  /** Recognized text, or null when the user cancelled. */
  onDone: (text: string | null) => void;
  /** Localized error message. */
  onError: (message: string) => void;
  device?: string;
  maxSeconds?: number;
  /** Test seams. */
  start?: (opts: RecordOptions) => Promise<Recording>;
  stt?: (file: string, opts: TranscribeOptions) => Promise<string>;
}

type Phase = "starting" | "recording" | "transcribing";

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const BARS = "▁▂▃▄▅▆▇█";
const meter = (level: number) => {
  const n = Math.round(level * 8);
  return Array.from({ length: 8 }, (_, i) => (i < n ? BARS[i] : " ")).join("");
};

/** Inline mic recorder: records, transcribes with Whisper, reports the text. */
export function VoiceInput({ cfg, L, lang, onDone, onError, device, maxSeconds = 120, start = startRecording, stt = transcribe }: VoiceInputProps) {
  const [phase, setPhase] = useState<Phase>("starting");
  const [elapsed, setElapsed] = useState(0);
  const [pulse, setPulse] = useState(true);
  const [level, setLevel] = useState(0);
  const rec = useRef<Recording | null>(null);
  const abort = useRef<AbortController | null>(null);
  const finished = useRef(false);
  const stopping = useRef(false);
  // Latest finish(): the ffmpeg-exit handler is set up once and must not call stale props.
  const finishRef = useRef<() => Promise<void>>(async () => {});

  const settle = (fn: () => void) => {
    if (finished.current) return;
    finished.current = true;
    fn();
  };

  async function finish() {
    const r = rec.current;
    if (!r || stopping.current || finished.current) return;
    stopping.current = true;
    setPhase("transcribing");
    try {
      const { file } = await r.stop();
      // Cancelled or unmounted while ffmpeg was stopping: never upload the audio.
      if (finished.current) return remove(file);
      const ctrl = new AbortController();
      abort.current = ctrl;
      const text = (await stt(file, { cfg, lang, signal: ctrl.signal })).trim();
      if (ctrl.signal.aborted) return;
      if (!text) throw new VoiceError("empty", "No speech recognized");
      settle(() => onDone(text));
    } catch (e) {
      if (abort.current?.signal.aborted) return;
      settle(() => onError(voiceError(e, L)));
    }
  }

  finishRef.current = finish;

  function cancel() {
    abort.current?.abort();
    rec.current?.cancel();
    settle(() => onDone(null));
  }

  useEffect(() => {
    let alive = true;
    start({ device, maxSeconds, onLevel: (l) => alive && setLevel(l) })
      .then((r) => {
        if (!alive || finished.current) return r.cancel();
        rec.current = r;
        setPhase("recording");
        // ffmpeg stopped on its own (time limit or device error): finish with what we have.
        void r.exited.then(() => alive && void finishRef.current());
      })
      .catch((e: unknown) => alive && settle(() => onError(voiceError(e, L))));
    return () => {
      alive = false;
      abort.current?.abort();
      if (!stopping.current) rec.current?.cancel();
      finished.current = true;
    };
  }, []);

  useEffect(() => {
    if (phase !== "recording") return;
    const t0 = Date.now();
    const id = setInterval(() => {
      setElapsed((Date.now() - t0) / 1000);
      setPulse((p) => !p);
    }, 500);
    return () => clearInterval(id);
  }, [phase]);

  useInput((_ch, key) => {
    if (key.escape) return cancel();
    if (key.return && phase === "recording") void finish();
  });

  if (phase === "starting") {
    return (
      <Box>
        <Text color={C.neon}>
          <Spinner type="dots" />
        </Text>
        <Text color={C.dim}> {L.starting}</Text>
      </Box>
    );
  }
  if (phase === "transcribing") {
    return (
      <Box>
        <Text color={C.neon}>
          <Spinner type="dots" />
        </Text>
        <Text color={C.text}> {L.transcribing}</Text>
        <Text color={C.faint}> · esc — {L.cancel}</Text>
      </Box>
    );
  }
  return (
    <Box>
      <Text color={pulse ? C.err : C.neon}>{I.reply} </Text>
      <Text color={C.text}>{L.recording} </Text>
      <Text color={C.neon}>{mmss(elapsed)}</Text>
      <Text color={C.glow}> {meter(level)}</Text>
      <Text color={C.dim}>
        {" "}
        · enter — {L.finish} · esc — {L.cancel}
      </Text>
    </Box>
  );
}
