import { readToolAuditEntries, type ToolAuditEntry } from "../../agents/tool-audit.js";
import type { GatewayRequestHandlers } from "./types.js";

export const auditHandlers: GatewayRequestHandlers = {
  "tools.audit": ({ params, respond }) => {
    const agentId =
      typeof params.agentId === "string" && params.agentId.trim()
        ? params.agentId.trim()
        : "default";
    const limit =
      typeof params.limit === "number" && Number.isFinite(params.limit)
        ? Math.max(1, Math.min(Math.floor(params.limit), 1000))
        : 100;

    const entries: ToolAuditEntry[] = readToolAuditEntries(agentId, limit);
    respond(true, { entries, total: entries.length }, undefined);
  },
};
