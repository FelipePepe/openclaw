import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { EdgeTTS } from "node-edge-tts";
import type { OpenClawConfig } from "../config/config.js";
import { resolvePreferredOpenClawTmpDir } from "../infra/tmp-openclaw-dir.js";
import { stripMarkdown } from "../line/markdown-to-line.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("tui-tts");

const DEFAULT_VOICE = "es-ES-ElviraNeural";
const DEFAULT_OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";
const DEFAULT_MAX_LEN = 1500;

const PLAYER_CANDIDATES = [
  { cmd: "ffplay", args: ["-nodisp", "-autoexit", "-loglevel", "error"] },
  { cmd: "mpg123", args: [] },
  { cmd: "mpg321", args: [] },
  { cmd: "afplay", args: [] },
  { cmd: "play", args: [] },
];

export type TuiTts = {
  speak: (text: string) => void;
};

function resolveOutputDir() {
  const dir = path.join(resolvePreferredOpenClawTmpDir(), "tui-tts");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

async function renderTtsToFile(text: string, voice: string) {
  const outDir = resolveOutputDir();
  const file = path.join(outDir, `tts-${Date.now()}-${randomBytes(4).toString("hex")}.mp3`);
  const tts = new EdgeTTS({
    voice,
    outputFormat: DEFAULT_OUTPUT_FORMAT,
  });
  await tts.ttsPromise(text, file);
  return file;
}

function playFile(file: string): Promise<void> {
  return new Promise((resolve) => {
    let idx = 0;
    const tryNext = () => {
      if (idx >= PLAYER_CANDIDATES.length) {
        log.warn("No audio player available for TUI TTS playback.");
        resolve();
        return;
      }
      const candidate = PLAYER_CANDIDATES[idx++];
      const args = [...candidate.args, file];
      const child = spawn(candidate.cmd, args, { stdio: "ignore" });
      child.on("error", (err) => {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          tryNext();
          return;
        }
        log.warn(`TTS player ${candidate.cmd} failed: ${String(err)}`);
        resolve();
      });
      child.on("close", () => resolve());
    };
    tryNext();
  });
}

export function createTuiTts(config: OpenClawConfig): TuiTts {
  const voice = config.ui?.tui?.tts?.voice ?? DEFAULT_VOICE;
  let busy = false;

  const speak = (raw: string) => {
    if (busy) {
      return;
    }
    const cleaned = stripMarkdown(raw).trim();
    if (!cleaned) {
      return;
    }
    const text =
      cleaned.length > DEFAULT_MAX_LEN ? `${cleaned.slice(0, DEFAULT_MAX_LEN)}…` : cleaned;
    busy = true;
    void (async () => {
      try {
        const file = await renderTtsToFile(text, voice);
        await playFile(file);
      } catch (err) {
        log.warn(`TUI TTS failed: ${String(err)}`);
      } finally {
        busy = false;
      }
    })();
  };

  return { speak };
}
