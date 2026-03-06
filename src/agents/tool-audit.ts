import fs from "node:fs";
import path from "node:path";
import { STATE_DIR } from "../config/paths.js";
import type { OpenClawPluginApi } from "../plugins/types.js";

const AUDIT_DIR = path.join(STATE_DIR, "audit");
const MAX_AUDIT_LINES = 1000;

export type ToolAuditEntry = {
  ts: number;
  toolName: string;
  durationMs?: number;
  error: string | null;
  agentId?: string;
  sessionKey?: string;
};

function auditFilePath(agentId: string): string {
  return path.join(AUDIT_DIR, `${agentId}.jsonl`);
}

function ensureAuditDir(): void {
  if (!fs.existsSync(AUDIT_DIR)) {
    fs.mkdirSync(AUDIT_DIR, { recursive: true });
  }
}

export function appendToolAuditEntry(entry: ToolAuditEntry): void {
  ensureAuditDir();
  const agentId = entry.agentId ?? "default";
  const filePath = auditFilePath(agentId);

  // Read existing lines for rotation
  let lines: string[] = [];
  if (fs.existsSync(filePath)) {
    try {
      lines = fs
        .readFileSync(filePath, "utf-8")
        .split("\n")
        .filter((l) => l.trim().length > 0);
    } catch {
      lines = [];
    }
  }

  lines.push(JSON.stringify(entry));

  // FIFO rotation: keep last MAX_AUDIT_LINES lines
  if (lines.length > MAX_AUDIT_LINES) {
    lines = lines.slice(lines.length - MAX_AUDIT_LINES);
  }

  try {
    fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf-8");
  } catch {
    // Best-effort: ignore write errors
  }
}

export function readToolAuditEntries(agentId: string, limit: number): ToolAuditEntry[] {
  const filePath = auditFilePath(agentId);
  if (!fs.existsSync(filePath)) {
    return [];
  }
  try {
    const lines = fs
      .readFileSync(filePath, "utf-8")
      .split("\n")
      .filter((l) => l.trim().length > 0);
    const safeLimit = Math.max(1, Math.min(limit, MAX_AUDIT_LINES));
    const relevant = lines.slice(-safeLimit);
    return relevant
      .map((line) => {
        try {
          return JSON.parse(line) as ToolAuditEntry;
        } catch {
          return null;
        }
      })
      .filter((e): e is ToolAuditEntry => e !== null);
  } catch {
    return [];
  }
}

export function installToolAuditHook(
  api: OpenClawPluginApi,
  ctx: { agentId?: string; sessionKey?: string },
): void {
  api.on("after_tool_call", (event, hookCtx) => {
    appendToolAuditEntry({
      ts: Date.now(),
      toolName: event.toolName,
      durationMs: event.durationMs,
      error: event.error ?? null,
      agentId: hookCtx.agentId ?? ctx.agentId,
      sessionKey: hookCtx.sessionKey ?? ctx.sessionKey,
    });
  });
}
