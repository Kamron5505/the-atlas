export { registerVoice, runVoiceOnce, printDevices, chooseDevice } from "./command.js";
export { voiceT, type VoiceDict } from "./i18n.js";
export { VoiceInput, type VoiceInputProps } from "./VoiceInput.js";
export { isVoiceKey, joinVoiceText } from "./keys.js";
export {
  findFfmpeg,
  listInputDevices,
  ffmpegArgs,
  startRecording,
  savedDevice,
  saveDevice,
  VoiceError,
  type AudioDevice,
  type Recording,
} from "./record.js";
export { transcribe, pickEngine, voiceError } from "./transcribe.js";
