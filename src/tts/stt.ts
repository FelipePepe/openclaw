import type { OpenClawConfig } from "../config/config.js";
import { transcribeWithVosk } from "./stt-vosk.js";

/**
 * Transcribe an audio file to text using the configured STT backend.
 *
 * Returns undefined if no STT backend is configured.
 */
export async function transcribeAudio(params: {
  audioFilePath: string;
  cfg: OpenClawConfig;
}): Promise<{ text: string } | undefined> {
  const sttConfig = params.cfg.messages?.tts?.stt;
  if (!sttConfig?.modelPath) {
    return undefined;
  }

  const text = await transcribeWithVosk({
    audioFilePath: params.audioFilePath,
    config: {
      modelPath: sttConfig.modelPath,
      sampleRate: sttConfig.sampleRate,
    },
  });

  return text ? { text } : undefined;
}
