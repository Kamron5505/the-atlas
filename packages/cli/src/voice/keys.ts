import type { Key } from "ink";

/**
 * Chat shortcut for voice input: ctrl+r ("record"). Free in Windows Terminal,
 * conhost, macOS Terminal and iTerm; ctrl+v (paste), ctrl+space (NUL) are not.
 */
export const isVoiceKey = (input: string, key: Pick<Key, "ctrl" | "meta">) => key.ctrl && !key.meta && input === "r";

/** Appends recognized text to what was already typed. */
export const joinVoiceText = (current: string, text: string) =>
  !current.trim() ? text : `${current.replace(/\s+$/, "")} ${text}`;
