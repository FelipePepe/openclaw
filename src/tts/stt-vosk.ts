import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type VoskSTTConfig = {
  modelPath: string;
  sampleRate?: number;
};

/**
 * Transcribe an audio file using the Vosk offline STT engine.
 *
 * Requires:
 * - The `vosk` npm package (npm install vosk)
 * - `ffmpeg` available in PATH for audio conversion
 * - A Vosk model directory at config.modelPath
 *
 * Converts audio to PCM 16-bit little-endian at 16kHz mono via ffmpeg,
 * then feeds it to Vosk's KaldiRecognizer in chunks.
 */
export async function transcribeWithVosk(params: {
  audioFilePath: string;
  config: VoskSTTConfig;
}): Promise<string> {
  const sampleRate = params.config.sampleRate ?? 16000;

  // Convert audio to raw PCM via ffmpeg
  const pcmBuffer = execFileSync("ffmpeg", [
    "-i",
    params.audioFilePath,
    "-ar",
    String(sampleRate),
    "-ac",
    "1",
    "-f",
    "s16le",
    "pipe:1",
  ]);

  // Dynamic import so missing vosk package doesn't crash the module at load time
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const vosk = await import("vosk").catch(() => {
    throw new Error(
      'Vosk is not installed. Run: npm install vosk\n' +
        'Then download a model with: openclaw voice-setup',
    );
  });

  const { Model, KaldiRecognizer } = vosk;

  if (!fs.existsSync(params.config.modelPath)) {
    throw new Error(
      `Vosk model not found at: ${params.config.modelPath}\n` +
        'Download a model with: openclaw voice-setup',
    );
  }

  const model = new Model(params.config.modelPath);
  const rec = new KaldiRecognizer(model, sampleRate);

  const CHUNK_SIZE = 4096;
  let offset = 0;
  while (offset < pcmBuffer.length) {
    const chunk = pcmBuffer.subarray(offset, offset + CHUNK_SIZE);
    rec.acceptWaveform(chunk);
    offset += CHUNK_SIZE;
  }

  const result = rec.finalResult() as { text?: string };
  return result.text?.trim() ?? "";
}
