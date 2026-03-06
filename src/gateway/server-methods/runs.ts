import { listAllSubagentRuns } from "../../agents/subagent-registry.js";
import type { GatewayRequestHandlers } from "./types.js";

const DEFAULT_RECENT_MINUTES = 60;
const MAX_RECENT_MINUTES = 24 * 60;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export const runsHandlers: GatewayRequestHandlers = {
  "runs.list": ({ params, respond }) => {
    const activeOnly = params.activeOnly === true;
    const recentMinutes =
      typeof params.recentMinutes === "number"
        ? Math.min(Math.max(1, Math.floor(params.recentMinutes)), MAX_RECENT_MINUTES)
        : DEFAULT_RECENT_MINUTES;
    const limit =
      typeof params.limit === "number"
        ? Math.min(Math.max(1, Math.floor(params.limit)), MAX_LIMIT)
        : DEFAULT_LIMIT;

    const runs = listAllSubagentRuns({ activeOnly, recentMinutes, limit });
    respond(true, { runs, total: runs.length }, undefined);
  },
};
